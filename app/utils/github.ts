import * as zlib from "node:zlib";
import { parseTar, type TarEntry } from "@remix-run/tar-parser";
import { detectMimeType } from "@remix-run/mime";

interface NewsletterMetadata {
  number: number;
  date: Date;
  path: string;
  filename: string;
}

interface NewsletterFile {
  name: string;
  path: string;
  size: number;
}

interface RepositoryContents {
  files: Map<string, NewsletterFile>;
  newsletters: NewsletterMetadata[];
  getFileContent(path: string): Uint8Array | null;
}

async function fetchTarball(
  owner: string,
  repo: string,
  ref: string,
  token: string,
): Promise<Uint8Array> {
  let tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${ref}`;
  let response = await fetch(tarballUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3.raw",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch repository tarball: ${response.status} ${response.statusText}`,
    );
  }

  let compressedData = new Uint8Array(await response.arrayBuffer());

  return new Promise((resolve, reject) => {
    zlib.gunzip(compressedData, (err, result) => {
      if (err) reject(err);
      else resolve(new Uint8Array(result));
    });
  });
}

async function parseTarball(data: Uint8Array): Promise<{
  files: Map<string, NewsletterFile>;
  contents: Map<string, Uint8Array>;
}> {
  let files = new Map<string, NewsletterFile>();
  let contents = new Map<string, Uint8Array>();

  await parseTar(data, async (entry: TarEntry) => {
    if (!entry.name.includes("newsletters/")) return;
    if (entry.header.type === "directory" || entry.name.endsWith("/")) return;

    let match = entry.name.match(/[^/]+\/newsletters\/(.+)$/);
    if (!match) return;

    let relativePath = match[1];
    let parts = relativePath.split("/");
    let filename = parts[parts.length - 1];

    files.set(relativePath, {
      name: filename,
      path: relativePath,
      size: entry.size,
    });

    let bytes = await entry.bytes();
    contents.set(relativePath, bytes);
  });

  return { files, contents };
}

function extractNewsletterMetadata(
  files: Map<string, NewsletterFile>,
): NewsletterMetadata[] {
  let newsletters: NewsletterMetadata[] = [];
  let newsletterDirs = new Map<string, NewsletterFile[]>();

  for (let [filePath, file] of files) {
    let parts = filePath.split("/");
    if (parts.length < 2) continue;

    let dirName = parts[0];
    if (!dirName.startsWith("newsletter-")) continue;

    if (!newsletterDirs.has(dirName)) {
      newsletterDirs.set(dirName, []);
    }
    newsletterDirs.get(dirName)!.push(file);
  }

  for (let [dirName, dirFiles] of newsletterDirs) {
    let markdownFile = dirFiles.find((f) => f.name.endsWith(".md"));
    if (!markdownFile) continue;

    let dirMatch = dirName.match(/^newsletter-(\d+)$/);
    if (!dirMatch) continue;

    let number = parseInt(dirMatch[1], 10);

    let filenameMatch = markdownFile.name.match(
      /^(\d{4})-(\d{2})-(\d{2})-remix-newsletter-\d+\.md$/,
    );
    if (!filenameMatch) continue;

    let [, year, month, day] = filenameMatch;
    let date = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
    );

    newsletters.push({
      number,
      date,
      path: markdownFile.path,
      filename: markdownFile.name,
    });
  }

  newsletters.sort((a, b) => b.number - a.number);

  return newsletters;
}

// In-memory cache for the duration of the build
let repositoryContentsCache: RepositoryContents | null = null;

export async function fetchRepositoryContents(): Promise<RepositoryContents> {
  // Return cached contents if already fetched
  if (repositoryContentsCache) {
    return repositoryContentsCache;
  }

  let tarballData = await fetchTarball(
    "remix-run",
    "newsletter",
    "main",
    process.env.GITHUB_TOKEN!,
  );
  let { files, contents } = await parseTarball(tarballData);
  let newsletters = extractNewsletterMetadata(files);

  repositoryContentsCache = {
    files,
    newsletters,
    getFileContent(path: string): Uint8Array | null {
      return contents.get(path) ?? null;
    },
  };
  return repositoryContentsCache;
}

export async function fetchNewsletter(number: number): Promise<string> {
  let contents = await fetchRepositoryContents();

  let newsletter = contents.newsletters.find((n) => n.number === number);
  if (!newsletter) {
    throw new NewsletterNotFoundError(number);
  }

  let fileContent = contents.getFileContent(newsletter.path);
  if (!fileContent) {
    throw new NewsletterNotFoundError(number);
  }

  return new TextDecoder().decode(fileContent);
}

export async function fetchNewsletterImage(
  number: number,
  filename: string,
): Promise<File> {
  let contents = await fetchRepositoryContents();

  let imagePath = `newsletter-${number}/${filename}`;
  let fileContent = contents.getFileContent(imagePath);

  if (!fileContent) {
    throw new ImageNotFoundError(number, filename);
  }

  let mimeType = detectMimeType(filename) || "application/octet-stream";

  // Create a copy of the Uint8Array to ensure we have a proper ArrayBuffer
  let copy = new Uint8Array(fileContent);
  let arrayBuffer = copy.buffer;

  return new File([arrayBuffer], filename, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

class NewsletterNotFoundError extends Error {
  number: number;

  constructor(number: number) {
    super(`Newsletter ${number} not found`);
    this.name = "NewsletterNotFoundError";
    this.number = number;
  }
}

class ImageNotFoundError extends Error {
  newsletterNumber: number;
  filename: string;

  constructor(newsletterNumber: number, filename: string) {
    super(`Image "${filename}" not found in newsletter ${newsletterNumber}`);
    this.name = "ImageNotFoundError";
    this.newsletterNumber = newsletterNumber;
    this.filename = filename;
  }
}

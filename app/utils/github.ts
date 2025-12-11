import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { parseTar, type TarEntry } from "@remix-run/tar-parser";
import { detectMimeType } from "@remix-run/mime";
import { createFsFileStorage } from "@remix-run/file-storage/fs";
import { cache } from "./cache.ts";

let cacheDir = path.join(os.tmpdir(), "newsletter-archive-cache");
let tarballCache = createFsFileStorage(cacheDir);
let isDev = process.env.NODE_ENV === "development";

function getConfig() {
  let githubRepo = process.env.GITHUB_REPO || "remix-run/newsletter";
  let [owner, ...repoParts] = githubRepo.split("/");
  let repo = repoParts.join("/");

  if (!owner || !repo) {
    throw new Error(
      `GITHUB_REPO must be in format "owner/repo", got: ${githubRepo}`,
    );
  }

  return {
    token: process.env.GITHUB_TOKEN,
    owner,
    repo,
  };
}

function getTarballCacheKey(owner: string, repo: string, ref: string): string {
  return `${owner}-${repo}-${ref}.tar`;
}

export interface NewsletterMetadata {
  number: number;
  date: Date;
  path: string;
  filename: string;
}

export interface NewsletterFile {
  name: string;
  path: string;
  size: number;
}

export interface RepositoryContents {
  files: Map<string, NewsletterFile>;
  newsletters: NewsletterMetadata[];
  getFileContent(path: string): Uint8Array | null;
}

function gunzip(data: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zlib.gunzip(data, (err, result) => {
      if (err) reject(err);
      else resolve(new Uint8Array(result));
    });
  });
}

async function fetchFreshTarball(
  owner: string,
  repo: string,
  ref: string,
  token: string,
  cacheKey: string,
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
  let decompressed = await gunzip(compressedData);

  let arrayBuffer = new ArrayBuffer(decompressed.byteLength);
  new Uint8Array(arrayBuffer).set(decompressed);

  let file = new File([arrayBuffer], cacheKey, {
    type: "application/x-tar",
  });
  await tarballCache.set(cacheKey, file);

  return decompressed;
}

let tarballRevalidations = new Map<string, Promise<void>>();

async function fetchTarball(
  owner: string,
  repo: string,
  ref: string,
  token: string,
): Promise<Uint8Array> {
  let cacheKey = getTarballCacheKey(owner, repo, ref);

  if (isDev) {
    return fetchFreshTarball(owner, repo, ref, token, cacheKey);
  }

  let cached = await tarballCache.get(cacheKey);

  if (cached) {
    let age = Date.now() - cached.lastModified;

    if (age < cache.TTL_MS) {
      return new Uint8Array(await cached.arrayBuffer());
    }

    if (!tarballRevalidations.has(cacheKey)) {
      let revalidation = (async () => {
        try {
          await fetchFreshTarball(owner, repo, ref, token, cacheKey);
        } catch (error) {
          console.error("Background tarball revalidation failed:", error);
        } finally {
          tarballRevalidations.delete(cacheKey);
        }
      })();

      tarballRevalidations.set(cacheKey, revalidation);
    }

    return new Uint8Array(await cached.arrayBuffer());
  }

  return fetchFreshTarball(owner, repo, ref, token, cacheKey);
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

let repositoryContentsCache: RepositoryContents | null = null;
let repositoryContentsCacheKey: string | null = null;
let repositoryContentsCacheTime: number | null = null;
let repositoryRevalidations = new Map<string, Promise<void>>();

async function buildRepositoryContents(
  owner: string,
  repo: string,
  ref: string,
  token: string,
): Promise<RepositoryContents> {
  let tarballData = await fetchTarball(owner, repo, ref, token);
  let { files, contents } = await parseTarball(tarballData);
  let newsletters = extractNewsletterMetadata(files);

  return {
    files,
    newsletters,
    getFileContent(path: string): Uint8Array | null {
      return contents.get(path) ?? null;
    },
  };
}

export async function fetchRepositoryContents(
  ref: string = "main",
): Promise<RepositoryContents> {
  let { token, owner, repo } = getConfig();

  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  let cacheKey = getTarballCacheKey(owner, repo, ref);

  if (isDev) {
    return buildRepositoryContents(owner, repo, ref, token);
  }

  if (
    repositoryContentsCache &&
    repositoryContentsCacheKey === cacheKey &&
    repositoryContentsCacheTime !== null
  ) {
    let age = Date.now() - repositoryContentsCacheTime;

    if (age < cache.TTL_MS) {
      return repositoryContentsCache;
    }

    if (!repositoryRevalidations.has(cacheKey)) {
      let revalidation = (async () => {
        try {
          let fresh = await buildRepositoryContents(owner, repo, ref, token);
          repositoryContentsCache = fresh;
          repositoryContentsCacheKey = cacheKey;
          repositoryContentsCacheTime = Date.now();
        } catch (error) {
          console.error("Background repository revalidation failed:", error);
        } finally {
          repositoryRevalidations.delete(cacheKey);
        }
      })();

      repositoryRevalidations.set(cacheKey, revalidation);
    }

    return repositoryContentsCache;
  }

  let fresh = await buildRepositoryContents(owner, repo, ref, token);
  repositoryContentsCache = fresh;
  repositoryContentsCacheKey = cacheKey;
  repositoryContentsCacheTime = Date.now();

  return fresh;
}

export async function listNewsletters(): Promise<NewsletterMetadata[]> {
  let contents = await fetchRepositoryContents();
  return contents.newsletters;
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

export class NewsletterNotFoundError extends Error {
  number: number;

  constructor(number: number) {
    super(`Newsletter ${number} not found`);
    this.name = "NewsletterNotFoundError";
    this.number = number;
  }
}

export class ImageNotFoundError extends Error {
  newsletterNumber: number;
  filename: string;

  constructor(newsletterNumber: number, filename: string) {
    super(`Image "${filename}" not found in newsletter ${newsletterNumber}`);
    this.name = "ImageNotFoundError";
    this.newsletterNumber = newsletterNumber;
    this.filename = filename;
  }
}

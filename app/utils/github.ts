import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { detectMimeType } from "@remix-run/mime";
import { type LazyContent, LazyFile } from "@remix-run/lazy-file";
import { createFsFileStorage } from "@remix-run/file-storage/fs";

let cacheDir = path.join(os.tmpdir(), "newsletter-archive-cache");
let imageCache = createFsFileStorage(cacheDir);

function getImageCacheKey(number: number, filename: string): string {
  return `newsletter-${number}/${filename}`;
}

function getConfig() {
  return {
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER || "remix-run",
    repo: process.env.GITHUB_REPO || "newsletter",
  };
}

// Zod schemas for GitHub API responses
const GitHubContentsLinksSchema = z.object({
  self: z.string(),
  git: z.string().nullable(),
  html: z.string().nullable(),
});

const GitHubContentsItemSchema = z.object({
  type: z.enum(["file", "dir", "submodule", "symlink"]),
  name: z.string(),
  path: z.string(),
  sha: z.string(),
  size: z.number(),
  url: z.string(),
  git_url: z.string().nullable(),
  html_url: z.string().nullable(),
  download_url: z.string().nullable(),
  _links: GitHubContentsLinksSchema,
  content: z.string().optional(),
  encoding: z.string().optional(),
});

const GitHubContentsArraySchema = z.array(GitHubContentsItemSchema);

const GitHubFileContentsSchema = GitHubContentsItemSchema.extend({
  type: z.literal("file"),
  content: z.string(),
  encoding: z.string().optional(),
});

type GitHubContentsItem = z.infer<typeof GitHubContentsItemSchema>;

async function fetchGitHubContentsArray(
  owner: string,
  repo: string,
  path: string,
  token: string,
): Promise<GitHubContentsItem[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch GitHub contents: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return GitHubContentsArraySchema.parse(data);
}

async function fetchGitHubFileContents(
  owner: string,
  repo: string,
  path: string,
  token: string,
): Promise<z.infer<typeof GitHubFileContentsSchema>> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch GitHub contents: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  // Check if it's an array (directory) and throw error
  if (Array.isArray(data)) {
    throw new Error(`Expected file, got directory`);
  }

  return GitHubFileContentsSchema.parse(data);
}

export interface NewsletterMetadata {
  number: number;
  date: Date;
  path: string;
  filename: string;
}

export async function listNewsletters(): Promise<NewsletterMetadata[]> {
  let { token, owner, repo } = getConfig();

  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  let contents = await fetchGitHubContentsArray(
    owner,
    repo,
    "newsletters",
    token,
  );

  let newsletterDirs = contents.filter(
    (item) => item.type === "dir" && item.name.startsWith("newsletter-"),
  );

  let newsletters: NewsletterMetadata[] = [];

  for (let dir of newsletterDirs) {
    let dirContents: GitHubContentsItem[];
    try {
      dirContents = await fetchGitHubContentsArray(
        owner,
        repo,
        dir.path,
        token,
      );
    } catch {
      continue;
    }

    let markdownFile = dirContents.find(
      (item) => item.type === "file" && item.name.endsWith(".md"),
    );

    if (!markdownFile) {
      continue;
    }

    // Parse newsletter number from directory name: newsletter-:n
    let dirMatch = dir.name.match(/^newsletter-(\d+)$/);
    if (!dirMatch) {
      continue;
    }

    let number = parseInt(dirMatch[1], 10);

    // Parse date from filename: :yyyy-:mm-:dd-remix-newsletter-:n.md
    let filenameMatch = markdownFile.name.match(
      /^(\d{4})-(\d{2})-(\d{2})-remix-newsletter-\d+\.md$/,
    );
    if (!filenameMatch) {
      continue;
    }

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

  // Sort by date, newest first
  newsletters.sort((a, b) => b.date.getTime() - a.date.getTime());

  return newsletters;
}

export async function fetchNewsletter(number: number): Promise<string> {
  let { token, owner, repo } = getConfig();

  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  // First, find the newsletter directory
  let contents = await fetchGitHubContentsArray(
    owner,
    repo,
    "newsletters",
    token,
  );

  let dirName = `newsletter-${number}`;
  let newsletterDir = contents.find(
    (item) => item.type === "dir" && item.name === dirName,
  );

  if (!newsletterDir) {
    throw new Error(`Newsletter ${number} not found`);
  }

  // Get contents of the newsletter directory
  let dirContents = await fetchGitHubContentsArray(
    owner,
    repo,
    newsletterDir.path,
    token,
  );

  let markdownFile = dirContents.find(
    (item) => item.type === "file" && item.name.endsWith(".md"),
  );

  if (!markdownFile) {
    throw new Error(`Markdown file not found for newsletter ${number}`);
  }

  // Fetch the file content directly
  let fileData = await fetchGitHubFileContents(
    owner,
    repo,
    markdownFile.path,
    token,
  );

  let content = fileData.content;
  if (fileData.encoding === "base64") {
    // Decode base64 content
    const binaryString = atob(content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  return content;
}

export async function fetchNewsletterImage(
  number: number,
  filename: string,
): Promise<File> {
  // Check cache first
  let cacheKey = getImageCacheKey(number, filename);
  let cachedFile = await imageCache.get(cacheKey);
  if (cachedFile) {
    return cachedFile;
  }

  let { token, owner, repo } = getConfig();

  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  // First, find the newsletter directory
  let contents = await fetchGitHubContentsArray(
    owner,
    repo,
    "newsletters",
    token,
  );

  let dirName = `newsletter-${number}`;
  let newsletterDir = contents.find(
    (item) => item.type === "dir" && item.name === dirName,
  );

  if (!newsletterDir) {
    throw new Error(`Newsletter ${number} not found`);
  }

  // Construct the image path relative to the newsletter directory
  let imagePath = `${newsletterDir.path}/${filename}`;

  // Fetch the image file from GitHub
  let fileData = await fetchGitHubFileContents(owner, repo, imagePath, token);

  // Detect MIME type from filename extension
  let mimeType = detectMimeType(filename) || "application/octet-stream";

  // Use download_url to stream the file content instead of loading it all into memory
  let downloadUrl = fileData.download_url;
  if (!downloadUrl) {
    throw new Error("Download URL not available");
  }

  // Fetch the file size first to determine byteLength
  let headResponse = await fetch(downloadUrl, {
    method: "HEAD",
    headers: {
      Authorization: `token ${token}`,
    },
  });

  if (!headResponse.ok) {
    throw new Error(`Failed to fetch file metadata: ${headResponse.status}`);
  }

  let contentLength = headResponse.headers.get("content-length");
  if (!contentLength) {
    throw new Error("Content-Length header not available");
  }

  let byteLength = parseInt(contentLength, 10);

  // Create lazy content that streams from GitHub's download_url
  let lazyContent: LazyContent = {
    byteLength,
    stream(start = 0, end = byteLength) {
      let headers: HeadersInit = {
        Authorization: `token ${token}`,
      };

      // Add Range header if we're not requesting the full file
      if (start > 0 || end < byteLength) {
        headers["Range"] = `bytes=${start}-${end - 1}`;
      }

      // Return a ReadableStream that fetches on-demand
      return new ReadableStream({
        async start(controller) {
          try {
            let response = await fetch(downloadUrl, { headers });

            if (!response.ok && response.status !== 206) {
              controller.error(
                new Error(`Failed to fetch file content: ${response.status}`),
              );
              return;
            }

            let body = response.body;
            if (!body) {
              controller.error(new Error("Response body is null"));
              return;
            }

            let reader = body.getReader();

            function pump(): Promise<void> {
              return reader.read().then(({ done, value }) => {
                if (done) {
                  controller.close();
                  return;
                }
                controller.enqueue(value);
                return pump();
              });
            }

            return pump().catch((error) => {
              controller.error(error);
            });
          } catch (error) {
            controller.error(error);
          }
        },
      });
    },
  };

  let file = new LazyFile(lazyContent, filename, {
    type: mimeType,
    lastModified: Date.now(),
  });

  // Cache the file for future requests
  // Note: This will read the file content to cache it, but subsequent requests will be served from cache
  await imageCache.set(cacheKey, file);

  return file;
}

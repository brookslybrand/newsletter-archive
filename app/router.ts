import { createRouter } from "@remix-run/fetch-router";
import { compression } from "@remix-run/compression-middleware";
import { logger } from "@remix-run/logger-middleware";
import { staticFiles } from "@remix-run/static-middleware";

import { routes } from "./routes.ts";
import {
  listNewsletters,
  fetchNewsletter,
  fetchNewsletterImage,
  fetchRepositoryContents,
  NewsletterNotFoundError,
  ImageNotFoundError,
} from "./utils/github.ts";
import { cache } from "./utils/cache.ts";
import { markdownToHtml } from "./utils/markdown.ts";
import { html, type SafeHtml } from "@remix-run/html-template";
import { createHtmlResponse } from "@remix-run/response/html";
import { createFileResponse } from "@remix-run/response/file";

let middleware = [];

if (process.env.NODE_ENV === "development") {
  middleware.push(logger());
}

middleware.push(compression());
middleware.push(
  staticFiles("./public", {
    cacheControl: "public, max-age=31536000, immutable", // 1 year for static assets
    etag: "strong",
    lastModified: true,
  }),
);

export let router = createRouter({ middleware });

function transformImageUrls(
  htmlContent: string,
  newsletterNumber: number,
): string {
  // Transform relative image paths to /newsletter/:number/image/:filename
  // Matches:
  // - ./filename.ext
  // - filename.ext (but not absolute URLs starting with http://, https://, or /)
  return htmlContent.replace(
    /src="(\.\/)?([^"/]+\.(jpg|jpeg|png|gif|webp|svg|bmp|ico))"/gi,
    (match, dotSlash, filename) => {
      let imageUrl = routes.newsletterImage.href({
        number: newsletterNumber.toString(),
        filename: filename,
      });
      return `src="${imageUrl}"`;
    },
  );
}

function extractPreview(markdown: string, maxLength: number = 200): string {
  // Remove markdown headers, code blocks, and images
  let text = markdown
    .replace(/^#{1,6}\s+.+$/gm, "") // Remove headers
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/`[^`]+`/g, "") // Remove inline code
    .replace(/!\[.*?\]\(.*?\)/g, "") // Remove images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Convert links to text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove bold
    .replace(/\*([^*]+)\*/g, "$1") // Remove italic
    .trim();

  // Split into paragraphs and get the first non-empty one
  let paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length === 0) {
    return "";
  }

  let preview = paragraphs[0].trim();

  // Truncate to max length, trying to end at a sentence boundary
  if (preview.length > maxLength) {
    preview = preview.substring(0, maxLength);
    let lastPeriod = preview.lastIndexOf(".");
    let lastExclamation = preview.lastIndexOf("!");
    let lastQuestion = preview.lastIndexOf("?");
    let lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);

    if (lastSentenceEnd > maxLength * 0.5) {
      // If we found a sentence end reasonably close to the end, use it
      preview = preview.substring(0, lastSentenceEnd + 1);
    } else {
      // Otherwise, just truncate and add ellipsis
      preview = preview.trim() + "...";
    }
  }

  return preview;
}

function renderLayout(content: SafeHtml, init?: ResponseInit): Response {
  let page = html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Remix Newsletter Archive</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <div class="container">${content}</div>
      </body>
    </html>
  `;
  return createHtmlResponse(page, init);
}

function renderNewsletterPage(content: SafeHtml, backHref: string): Response {
  let page = html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Remix Newsletter Archive</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <div class="container">
          <a href="${backHref}" class="back-link">← Back to archive</a>
          <div class="newsletter-content">${content}</div>
        </div>
      </body>
    </html>
  `;
  return createHtmlResponse(page, {
    headers: {
      "Cache-Control": `public, max-age=${cache.TTL_SECONDS}, stale-while-revalidate=${cache.STALE_WHILE_REVALIDATE_SECONDS}`,
    },
  });
}

router.map(routes, {
  async healthcheck() {
    return new Response("OK", {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  },

  async home() {
    try {
      let newsletters = await listNewsletters();
      let contents = await fetchRepositoryContents();

      let newsletterItems: SafeHtml[] = [];
      if (newsletters.length === 0) {
        newsletterItems.push(html`
          <div class="newsletter-item">
            <p>No newsletters found.</p>
          </div>
        `);
      } else {
        newsletterItems = await Promise.all(
          newsletters.map(async (newsletter) => {
            // Get preview from markdown
            let preview = "";
            try {
              let fileContent = contents.getFileContent(newsletter.path);
              if (fileContent) {
                let markdown = new TextDecoder().decode(fileContent);
                preview = extractPreview(markdown);
              }
            } catch (error) {
              console.error(
                `Error extracting preview for newsletter ${newsletter.number}:`,
                error,
              );
            }

            return html`
              <a
                href="${routes.newsletter.href({
                  number: newsletter.number.toString(),
                })}"
                class="newsletter-item"
              >
                <div class="newsletter-header">
                  <span class="newsletter-number">
                    Newsletter #${newsletter.number}
                  </span>
                  <span class="newsletter-date">
                    ${newsletter.date.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                ${preview
                  ? html`<p class="newsletter-preview">${preview}</p>`
                  : ""}
              </a>
            `;
          }),
        );
      }

      let content = html`
        <header>
          <h1>Remix Newsletter Archive</h1>
        </header>
        <div class="newsletter-list">
          ${newsletterItems.map((item) => html.raw`${item}`)}
        </div>
      `;

      return renderLayout(content, {
        headers: {
          "Cache-Control": `public, max-age=${cache.TTL_SECONDS}, stale-while-revalidate=${cache.STALE_WHILE_REVALIDATE_SECONDS}`,
        },
      });
    } catch (error) {
      console.error("Error fetching newsletters:", error);
      let errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      let content = html`
        <header>
          <h1>Remix Newsletter Archive</h1>
        </header>
        <div class="newsletter-content">
          <p>Error loading newsletters: ${errorMessage}</p>
          <p>
            Make sure GITHUB_TOKEN environment variable is set and has access to
            the repository.
          </p>
        </div>
      `;

      return renderLayout(content, {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }
  },

  async newsletter(context) {
    let numberParam = context.params.number;
    if (!numberParam) {
      let content = html`
        <div class="newsletter-content">
          <p>Newsletter number is required.</p>
          <a href="${routes.home.href()}" class="back-link">
            ← Back to archive
          </a>
        </div>
      `;
      return renderLayout(content, {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    let number = parseInt(numberParam, 10);
    if (!isFinite(number) || number < 1) {
      let content = html`
        <div class="newsletter-content">
          <p>Invalid newsletter number.</p>
          <a href="${routes.home.href()}" class="back-link">
            ← Back to archive
          </a>
        </div>
      `;
      return renderLayout(content, {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    try {
      let markdown = await fetchNewsletter(number);
      let htmlContent = markdownToHtml(markdown);
      let transformedHtml = transformImageUrls(htmlContent, number);
      let safeHtml = html.raw`${transformedHtml}`;

      return renderNewsletterPage(safeHtml, routes.home.href());
    } catch (error) {
      console.error(`Error fetching newsletter ${number}:`, error);

      if (error instanceof NewsletterNotFoundError) {
        let content = html`
          <a href="${routes.home.href()}" class="back-link">
            ← Back to archive
          </a>
          <div class="newsletter-content">
            <p>Newsletter ${error.number} not found.</p>
          </div>
        `;
        return renderLayout(content, {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
      }

      throw error;
    }
  },

  async newsletterImage(context) {
    let numberParam = context.params.number;
    let filename = context.params.filename;

    if (!numberParam || !filename) {
      return new Response("Newsletter number and filename are required.", {
        status: 400,
      });
    }

    let number = parseInt(numberParam, 10);
    if (!isFinite(number) || number < 1) {
      return new Response("Invalid newsletter number.", { status: 400 });
    }

    try {
      let file = await fetchNewsletterImage(number, filename);
      return createFileResponse(file, context.request, {
        cacheControl: `public, max-age=${cache.TTL_SECONDS}, stale-while-revalidate=${cache.STALE_WHILE_REVALIDATE_SECONDS}`,
      });
    } catch (error) {
      console.error(
        `Error fetching image ${filename} for newsletter ${number}:`,
        error,
      );

      if (error instanceof ImageNotFoundError) {
        return new Response(
          `Image "${error.filename}" not found in newsletter ${error.newsletterNumber}.`,
          { status: 404 },
        );
      }

      throw error;
    }
  },
});

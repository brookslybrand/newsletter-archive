import { createRouter } from "@remix-run/fetch-router";
import { compression } from "@remix-run/compression-middleware";
import { logger } from "@remix-run/logger-middleware";
import { staticFiles } from "@remix-run/static-middleware";

import { routes } from "./routes.ts";
import {
  listNewsletters,
  fetchNewsletter,
  fetchNewsletterImage,
} from "./utils/github.ts";
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

let { assets, ...pageRoutes } = routes;

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
      "Cache-Control": "public, max-age=3600, immutable",
    },
  });
}

router.map(pageRoutes, {
  async home() {
    try {
      let newsletters = await listNewsletters();

      let newsletterListHtml = "";
      if (newsletters.length === 0) {
        newsletterListHtml = `
          <div class="newsletter-item">
            <p>No newsletters found.</p>
          </div>
        `;
      } else {
        newsletterListHtml = newsletters
          .map(
            (newsletter) => `
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
          </a>
        `,
          )
          .join("");
      }

      let content = html`
        <header>
          <h1>Remix Newsletter Archive</h1>
        </header>
        <div class="newsletter-list">${html.raw`${newsletterListHtml}`}</div>
      `;

      return renderLayout(content, {
        headers: {
          "Cache-Control": "public, max-age=3600, must-revalidate",
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
      let status = 404;
      let message = "Newsletter not found.";

      if (error instanceof Error) {
        if (error.message.includes("GITHUB_TOKEN")) {
          status = 500;
          message =
            "GitHub authentication error. Make sure GITHUB_TOKEN is set.";
        } else if (error.message.includes("not found")) {
          status = 404;
          message = `Newsletter ${number} not found.`;
        } else {
          message = error.message;
        }
      }

      let content = html`
        <a href="${routes.home.href()}" class="back-link">
          ← Back to archive
        </a>
        <div class="newsletter-content">
          <p>${message}</p>
        </div>
      `;

      return renderLayout(content, {
        status,
        headers: {
          "Cache-Control": "no-store",
        },
      });
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
        cacheControl: "public, max-age=31536000",
      });
    } catch (error) {
      console.error(
        `Error fetching image ${filename} for newsletter ${number}:`,
        error,
      );
      let status = 404;
      let message = "Image not found.";

      if (error instanceof Error) {
        if (error.message.includes("GITHUB_TOKEN")) {
          status = 500;
          message =
            "GitHub authentication error. Make sure GITHUB_TOKEN is set.";
        } else if (error.message.includes("not found")) {
          status = 404;
          message = `Image ${filename} not found for newsletter ${number}.`;
        } else {
          message = error.message;
        }
      }

      return new Response(message, { status });
    }
  },
});

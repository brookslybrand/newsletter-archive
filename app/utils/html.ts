import { html, type SafeHtml } from "@remix-run/html-template";

export function transformImageUrls(htmlContent: string): string {
  // Transform relative image paths to ./image/filename.png
  return htmlContent.replace(
    /src="(\.\/)?([^"/]+\.(jpg|jpeg|png|gif|webp|svg|bmp|ico))"/gi,
    (_match, _dotSlash, filename) => {
      return `src="./image/${filename}"`;
    },
  );
}

export function extractPreview(
  markdown: string,
  maxLength: number = 200,
): string {
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

export function renderLayoutHtml(
  content: SafeHtml,
  stylesheetPath: string = "./styles.css",
  faviconPath: string = "./favicon.ico",
): string {
  let page = html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Remix Newsletter Archive</title>
        <link rel="icon" href="${faviconPath}" />
        <link rel="stylesheet" href="${stylesheetPath}" />
      </head>
      <body>
        <div class="container">${content}</div>
      </body>
    </html>
  `;
  return page.toString();
}

export function renderNewsletterPageHtml(
  content: SafeHtml,
  backHref: string,
  stylesheetPath: string = "../../styles.css",
  faviconPath: string = "../../favicon.ico",
): string {
  let page = html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Remix Newsletter Archive</title>
        <link rel="icon" href="${faviconPath}" />
        <link rel="stylesheet" href="${stylesheetPath}" />
      </head>
      <body>
        <div class="container">
          <a href="${backHref}" class="back-link">← Back to archive</a>
          <div class="newsletter-content">${content}</div>
        </div>
      </body>
    </html>
  `;
  return page.toString();
}

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
  // Split into paragraphs first for early exit optimization
  let paragraphs = markdown.split(/\n\s*\n/);

  for (let paragraph of paragraphs) {
    let trimmed = paragraph.trim();

    // Short-circuit: skip headers, images, and code blocks
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith("!") ||
      trimmed.startsWith("```")
    ) {
      continue;
    }

    // Apply transformations only to this paragraph
    let text = trimmed
      .replace(/`([^`]+)`/g, "$1") // Convert inline code to text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Convert links to text
      .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove bold
      .replace(/\*([^*]+)\*/g, "$1") // Remove italic
      .trim();

    // Skip if empty after transformation
    if (text.length === 0) {
      continue;
    }

    // Found a viable paragraph - truncate if needed
    if (text.length > maxLength) {
      text = text.substring(0, maxLength);
      let lastPeriod = text.lastIndexOf(".");
      let lastExclamation = text.lastIndexOf("!");
      let lastQuestion = text.lastIndexOf("?");
      let lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);

      if (lastSentenceEnd > maxLength * 0.5) {
        text = text.substring(0, lastSentenceEnd + 1);
      } else {
        text = text.trim() + "...";
      }
    }

    return text;
  }

  return "";
}

export function renderLayoutHtml(content: SafeHtml): string {
  let page = html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Remix Newsletter Archive</title>
        <link rel="icon" href="/favicon.ico" />
        <link rel="stylesheet" href="/styles.css" />
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
  newsletterNumber: number,
): string {
  let page = html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>
          Newsletter #${newsletterNumber} | Remix Newsletter Archive
        </title>
        <link rel="icon" href="/favicon.ico" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <div class="container">
          <a href="/" class="back-link">← Back to archive</a>
          <div class="newsletter-content">${content}</div>
        </div>
      </body>
    </html>
  `;
  return page.toString();
}

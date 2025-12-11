import "dotenv/config";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  listNewsletters,
  fetchNewsletter,
  fetchNewsletterImage,
  fetchRepositoryContents,
} from "./utils/github.ts";
import { markdownToHtml } from "./utils/markdown.ts";
import {
  extractPreview,
  transformImageUrls,
  renderLayoutHtml,
  renderNewsletterPageHtml,
} from "./utils/html.ts";
import { html, type SafeHtml } from "@remix-run/html-template";

const DIST_DIR = path.join(process.cwd(), "dist");

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code !== "EEXIST") {
      throw error;
    }
  }
}

async function writeFile(
  filePath: string,
  content: string | Uint8Array,
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  if (typeof content === "string") {
    await fs.writeFile(filePath, content, "utf-8");
  } else {
    await fs.writeFile(filePath, content);
  }
}

async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

async function build(): Promise<void> {
  console.log("Starting build...");

  // Clean dist directory
  try {
    await fs.rm(DIST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if directory doesn't exist
  }
  await ensureDir(DIST_DIR);

  // Fetch newsletters
  console.log("Fetching newsletters from GitHub...");
  let newsletters = await listNewsletters();
  let contents = await fetchRepositoryContents();

  if (newsletters.length === 0) {
    console.warn("No newsletters found!");
  } else {
    console.log(`Found ${newsletters.length} newsletters`);
  }

  // Build home page
  console.log("Building home page...");
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
          <a href="./newsletter/${newsletter.number}/" class="newsletter-item">
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
            ${preview ? html`<p class="newsletter-preview">${preview}</p>` : ""}
          </a>
        `;
      }),
    );
  }

  let homeContent = html`
    <header>
      <h1>Remix Newsletter Archive</h1>
    </header>
    <div class="newsletter-list">
      ${newsletterItems.map((item) => html.raw`${item}`)}
    </div>
  `;

  let homeHtml = renderLayoutHtml(homeContent, "./styles.css", "./favicon.ico");
  await writeFile(path.join(DIST_DIR, "index.html"), homeHtml);

  // Build newsletter pages
  console.log("Building newsletter pages...");
  for (let newsletter of newsletters) {
    try {
      console.log(`  Building newsletter ${newsletter.number}...`);

      let markdown = await fetchNewsletter(newsletter.number);
      let htmlContent = markdownToHtml(markdown);
      let transformedHtml = transformImageUrls(htmlContent);
      let safeHtml = html.raw`${transformedHtml}`;

      let newsletterDir = path.join(
        DIST_DIR,
        "newsletter",
        newsletter.number.toString(),
      );
      let newsletterHtml = renderNewsletterPageHtml(
        safeHtml,
        "../../",
        "../../styles.css",
        "../../favicon.ico",
      );

      await writeFile(path.join(newsletterDir, "index.html"), newsletterHtml);

      // Copy images for this newsletter
      let imageDir = path.join(newsletterDir, "image");
      await ensureDir(imageDir);

      // Find all image files in the newsletter directory
      let newsletterFiles = Array.from(contents.files.values()).filter(
        (file) => {
          let parts = file.path.split("/");
          return (
            parts.length === 2 &&
            parts[0] === `newsletter-${newsletter.number}` &&
            /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(file.name)
          );
        },
      );

      for (let imageFile of newsletterFiles) {
        try {
          let imageFileObj = await fetchNewsletterImage(
            newsletter.number,
            imageFile.name,
          );
          let imageData = new Uint8Array(await imageFileObj.arrayBuffer());
          await writeFile(path.join(imageDir, imageFile.name), imageData);
          console.log(`    Copied image: ${imageFile.name}`);
        } catch (error) {
          console.error(`    Error copying image ${imageFile.name}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error building newsletter ${newsletter.number}:`, error);
    }
  }

  // Copy public assets
  console.log("Copying public assets...");
  let publicDir = path.join(process.cwd(), "public");
  await copyFile(
    path.join(publicDir, "styles.css"),
    path.join(DIST_DIR, "styles.css"),
  );
  await copyFile(
    path.join(publicDir, "favicon.ico"),
    path.join(DIST_DIR, "favicon.ico"),
  );

  // Create .nojekyll file
  console.log("Creating .nojekyll file...");
  await writeFile(path.join(DIST_DIR, ".nojekyll"), "");

  console.log("Build complete!");
}

build().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});

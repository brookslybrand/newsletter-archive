# AGENTS.md

This document provides important context for AI agents working on this codebase.

## Project Overview

This is a **Newsletter Archive** static site generator that fetches newsletters from a GitHub repository and builds static HTML files. Newsletters are stored as markdown files in the GitHub repository and are converted to HTML at build time. The generated site is deployed to GitHub Pages.

### Key Features

- Fetches newsletter metadata and content from GitHub at build time
- Converts markdown to HTML using `marked`
- Generates static HTML files for each newsletter
- Copies newsletter images to the output directory
- Deployed to GitHub Pages with weekly rebuilds
- Uses plain HTML templates (no component framework)

## Project Structure

```
newsletter-archive/
├── app/
│   ├── build.ts         # Static site generator script
│   └── utils/
│       ├── github.ts    # GitHub API integration
│       ├── html.ts      # HTML template utilities
│       └── markdown.ts  # Markdown to HTML conversion
├── public/
│   ├── favicon.ico      # Site favicon
│   └── styles.css       # Global styles
├── dist/                # Generated static site (git-ignored)
├── .github/
│   └── workflows/
│       └── deploy.yml   # GitHub Pages deployment workflow
├── package.json
├── tsconfig.json
└── README.md
```

## Architecture

### Build Process

The build script (`app/build.ts`) performs the following steps:

1. Fetches all newsletters from GitHub using the tarball API
2. Generates `index.html` for the home page (listing all newsletters)
3. Generates `newsletter/{number}/index.html` for each newsletter page
4. Copies newsletter images to `newsletter/{number}/image/` directory
5. Copies public assets (`styles.css`, `favicon.ico`) to the output directory
6. Creates `.nojekyll` file for GitHub Pages

### GitHub Integration

Located in `app/utils/github.ts`:

- **`listNewsletters()`**: Fetches all newsletter metadata from GitHub
  - Looks for directories matching `newsletter-:n/` pattern
  - Parses dates from filenames: `:yyyy-:mm-:dd-remix-newsletter-:n.md`
  - Returns sorted array (newest first)

- **`fetchNewsletter(number)`**: Fetches markdown content for a specific newsletter
  - Returns markdown as string

- **`fetchNewsletterImage(number, filename)`**: Fetches newsletter images
  - Returns a `File` object

- **`fetchRepositoryContents()`**: Fetches entire repository tarball
  - Uses GitHub's tarball API for efficient fetching
  - Caches tarball locally to avoid repeated downloads

### HTML Templates

Located in `app/utils/html.ts`:

- **`renderLayoutHtml(content, stylesheetPath, faviconPath)`**: Renders the main page layout
- **`renderNewsletterPageHtml(content, backHref, stylesheetPath, faviconPath)`**: Renders newsletter pages
- **`extractPreview(markdown)`**: Extracts a preview snippet from markdown
- **`transformImageUrls(htmlContent, newsletterNumber)`**: Transforms image URLs to relative paths

### Markdown Processing

Located in `app/utils/markdown.ts`:

- Uses `marked` library for markdown parsing
- Simple function: `markdownToHtml(markdown: string): string`

## Dependencies

### Core Packages

- `@remix-run/html-template` - HTML template utilities (used for generating HTML)
- `@remix-run/file-storage` - File caching/storage
- `@remix-run/mime` - MIME type detection
- `@remix-run/tar-parser` - Tar archive parser for GitHub tarball

### Other Dependencies

- `marked` - Markdown parser
- `dotenv` - Environment variable loading

### Development Dependencies

- `@types/node` - Node.js type definitions
- `http-server` - Local preview server
- `oxlint` - Linting
- `prettier` - Code formatting

## Development Workflow

### Scripts

- `pnpm build` - Build static site to `dist/`
- `pnpm preview` - Serve the built site locally on port 44100
- `pnpm typecheck` - Type check without emitting
- `pnpm lint` - Run linter
- `pnpm format` - Format code with Prettier

### HTML Generation

- HTML is generated using `@remix-run/html-template` template tags
- Use `html` template tag for safe HTML generation
- Use `html.raw` template tag for inserting pre-rendered HTML strings
- No component framework - plain HTML templates only

### TypeScript Configuration

- Uses Node.js native TypeScript support
- `allowImportingTsExtensions: true` - Can import `.ts` files directly
- `rewriteRelativeImportExtensions: true` - Auto-rewrites imports
- `verbatimModuleSyntax: true` - Preserves import/export syntax
- No JSX configuration (plain TypeScript only)

## Environment Variables

Required:

- `GITHUB_TOKEN` - GitHub Personal Access Token with access to the newsletter repository

Optional:

- `GITHUB_REPO` - Repository in format `owner/repo` (defaults to `remix-run/newsletter`)

## Deployment

### GitHub Pages

The site is deployed to GitHub Pages using GitHub Actions:

- **Triggers**: Push to `main`, weekly cron (Mondays at 00:00 UTC), manual dispatch
- **Workflow**: `.github/workflows/deploy.yml`
- **Secret Required**: `NEWSLETTER_GITHUB_TOKEN` - PAT with access to the newsletter repository

### Output Structure

```
dist/
├── .nojekyll
├── favicon.ico
├── index.html
├── styles.css
└── newsletter/
    ├── 1/
    │   ├── index.html
    │   └── image/
    │       └── *.png
    ├── 2/
    │   ├── index.html
    │   └── image/
    │       └── *.png
    └── ...
```

### Newsletter Format

Newsletters are expected to be in this structure in the source repository:

```
newsletters/
  newsletter-1/
    2024-01-01-remix-newsletter-1.md
    image1.png
    ...
  newsletter-2/
    2024-01-15-remix-newsletter-2.md
    ...
```

## Notes for AI Agents

1. **Static site generator** - This is NOT a server application. It generates static HTML at build time.
2. **No component framework** - This project uses plain HTML templates, not JSX/components
3. **HTML templates** - Use `html` template tag from `@remix-run/html-template` for HTML generation
4. **Use Web APIs** - Prefer `File`, `Blob`, `Uint8Array` over Node.js-specific equivalents
5. **Check package names** - All Remix packages are scoped as `@remix-run/*`
6. **TypeScript native** - Build script runs directly with Node.js native TypeScript support
7. **Relative paths** - All asset paths in generated HTML are relative for static hosting
8. **No type casting** - Never use TypeScript type assertions (`as`, `as!`, `as?`, `satisfies`). Instead, use proper type guards, type narrowing, or fix the underlying type issues.

## References

- [Remix 3 Repository](https://github.com/remix-run/remix)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)

# AGENTS.md

This document provides important context for AI agents working on this codebase.

## Project Overview

This is a **Newsletter Archive** application that fetches newsletters from a GitHub repository and displays them as HTML. Newsletters are stored as markdown files in the GitHub repository and are converted to HTML on-demand using the GitHub API.

### Key Features

- Fetches newsletter metadata and content from GitHub
- Converts markdown to HTML using `marked`
- Caches newsletter images locally using `@remix-run/file-storage`
- Serves newsletters via a web server built with Remix 3
- Uses plain HTML templates (no component framework)

## ⚠️ CRITICAL: Remix 3 vs Old Remix

**This project uses Remix 3, which is fundamentally different from Remix 1.x/2.x.**

### Key Differences

1. **No File-Based Routing**: Remix 3 does NOT use file-based routing like old Remix. Instead, routes are defined programmatically using `@remix-run/fetch-router`.

2. **Modular Packages**: Remix 3 is distributed as many small, composable packages:

   - `@remix-run/fetch-router` - Router for the web Fetch API
   - `@remix-run/html-template` - HTML template utilities
   - `@remix-run/response` - Response utilities (HTML, file, etc.)
   - `@remix-run/lazy-file` - Lazy, streaming file handling
   - `@remix-run/file-storage` - Key/value storage for File objects
   - And many more...

3. **Web Standards First**: Remix 3 prioritizes Web APIs:

   - Uses Web Streams API instead of Node.js streams
   - Uses `Uint8Array` instead of Node.js `Buffer`
   - Uses Web Crypto API instead of `node:crypto`
   - Uses `Blob` and `File` instead of runtime-specific APIs

4. **Runtime-First Design**: Remix 3 is designed to work without bundlers/compilers. All packages must work at runtime without static analysis.

5. **No React Router**: Remix 3 does NOT use React Router. It uses `@remix-run/fetch-router` which is built on the Fetch API.

### Remix 3 Philosophy

From the [Remix 3 repository](https://github.com/remix-run/remix):

- **Model-First Development**: Optimize for LLMs and AI workflows
- **Build on Web APIs**: Share abstractions across the stack
- **Religiously Runtime**: No expectation of static analysis
- **Avoid Dependencies**: Choose wisely, wrap completely
- **Demand Composition**: Single-purpose, replaceable abstractions

## Project Structure

```
newsletter-archive/
├── app/
│   ├── router.ts        # Route definitions using @remix-run/fetch-router
│   ├── routes.ts        # Route path definitions
│   └── utils/
│       ├── github.ts    # GitHub API integration
│       └── markdown.ts  # Markdown to HTML conversion
├── public/
│   └── styles.css       # Global styles
├── server.ts            # Main server entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Architecture

### Server Setup

- Uses Node.js HTTP server (`node:http`)
- Converts Node.js HTTP requests to Web Fetch API Request objects
- Router is imported from `./app/router.ts`
- Default port: `44100` (configurable via `PORT` env var)
- Uses `tsx` to run TypeScript directly (no compilation step)

### Routing

- Routes are defined in `app/router.ts` using `@remix-run/fetch-router`
- Routes are NOT file-based - they're programmatically defined
- The router uses the Fetch API (`router.fetch(request)`)
- HTML is generated using `@remix-run/html-template` template tags
- Responses are created using `@remix-run/response/html`

### GitHub Integration

Located in `app/utils/github.ts`:

- **`listNewsletters()`**: Fetches all newsletter metadata from GitHub

  - Looks for directories matching `newsletter-:n/` pattern
  - Parses dates from filenames: `:yyyy-:mm-:dd-remix-newsletter-:n.md`
  - Returns sorted array (newest first)

- **`fetchNewsletter(number)`**: Fetches markdown content for a specific newsletter

  - Uses GitHub Contents API
  - Returns markdown as string

- **`fetchNewsletterImage(number, filename)`**: Fetches and caches newsletter images
  - Uses `@remix-run/lazy-file` for streaming
  - Caches images using `@remix-run/file-storage` in temp directory
  - Returns a `File` object

### Markdown Processing

Located in `app/utils/markdown.ts`:

- Uses `marked` library for markdown parsing
- Simple function: `markdownToHtml(markdown: string): string`

## Dependencies

### Core Remix 3 Packages

- `@remix-run/fetch-router` - Router implementation
- `@remix-run/html-template` - HTML template utilities (used for generating HTML)
- `@remix-run/response` - Response utilities (HTML, file responses)
- `@remix-run/lazy-file` - Lazy file streaming
- `@remix-run/file-storage` - File caching/storage
- `@remix-run/fs` - Filesystem utilities
- `@remix-run/headers` - HTTP header utilities
- `@remix-run/mime` - MIME type detection
- `@remix-run/static-middleware` - Static file serving
- `@remix-run/compression-middleware` - Response compression
- `@remix-run/logger-middleware` - Request logging

### Other Dependencies

- `@octokit/request` - GitHub API client
- `marked` - Markdown parser
- `dotenv` - Environment variable loading

### Development Dependencies

- `tsx` - TypeScript execution (no compilation step)
- `@types/node` - Node.js type definitions

## Development Workflow

### Scripts

- `bun start` - Start production server
- `bun dev` - Start development server with watch mode (auto-reloads on file changes)
- `bun test` - Run tests
- `bun typecheck` - Type check without emitting

### HTML Generation

- HTML is generated using `@remix-run/html-template` template tags
- Use `html` template tag for safe HTML generation
- Use `html.raw` template tag for inserting pre-rendered HTML strings
- Responses are created using `createHtmlResponse` from `@remix-run/response/html`
- No component framework - plain HTML templates only

### TypeScript Configuration

- Uses `tsx` to run TypeScript directly (no compilation step)
- `allowImportingTsExtensions: true` - Can import `.ts` files directly
- `rewriteRelativeImportExtensions: true` - Auto-rewrites imports
- `verbatimModuleSyntax: true` - Preserves import/export syntax
- No JSX configuration (plain TypeScript only)

## Environment Variables

Required:

- `GITHUB_TOKEN` - GitHub Personal Access Token (required)

Optional:

- `GITHUB_OWNER` - Repository owner (defaults to `remix-run`)
- `GITHUB_REPO` - Repository name (defaults to `newsletter`)
- `PORT` - Server port (defaults to `44100`)

## Important Patterns

### File Handling

- Uses Web `File` API, not Node.js `fs`
- Images are cached using `@remix-run/file-storage`
- Uses `LazyFile` for streaming large files without loading into memory

### Error Handling

- Server catches errors and returns 500 responses
- GitHub API errors should be handled gracefully
- Missing newsletters should return appropriate HTTP status codes

### Newsletter Format

Newsletters are expected to be in this structure:

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

## Common Tasks

### Adding a New Route

1. Import `createRouter` from `@remix-run/fetch-router`
2. Define routes programmatically in `app/router.ts`
3. Use `html` template tag from `@remix-run/html-template` to generate HTML
4. Return responses using `createHtmlResponse` from `@remix-run/response/html`
5. Export router from `app/router.ts`

### Adding Middleware

Remix 3 middleware packages can be composed:

- `compression-middleware` - Compress responses
- `logger-middleware` - Log requests/responses
- `static-middleware` - Serve static files
- `session-middleware` - Session management

### Fetching Data

- Use GitHub API via `@octokit/request`
- Cache images using `@remix-run/file-storage`
- Use `LazyFile` for streaming large files

## Notes for AI Agents

1. **Never assume file-based routing** - Remix 3 uses programmatic routing
2. **No component framework** - This project uses plain HTML templates, not JSX/components
3. **HTML templates** - Use `html` template tag from `@remix-run/html-template` for HTML generation
4. **Use Web APIs** - Prefer `File`, `Blob`, `ReadableStream` over Node.js equivalents
5. **Check package names** - All Remix packages are scoped as `@remix-run/*`
6. **Runtime-first** - Code should work without bundling/compilation
7. **TypeScript native** - Server code runs directly with `tsx`, no compilation step
8. **Modular design** - Each Remix package is independent and composable
9. **Router file** - The router is in `app/router.ts` (not `.tsx` - no JSX)
10. **No type casting** - Never use TypeScript type assertions (`as`, `as!`, `as?`, `satisfies`). Instead, use proper type guards, type narrowing, or fix the underlying type issues. Type casting bypasses TypeScript's safety and can lead to runtime errors.

## References

- [Remix 3 Repository](https://github.com/remix-run/remix)
- [Remix 3 Philosophy](https://github.com/remix-run/remix#welcome-to-remix-3)

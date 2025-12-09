# Newsletter Archive

An application that fetches newsletters from a GitHub repository and displays them as HTML. Newsletters are stored as markdown files and converted to HTML on-demand using the GitHub API.

## Getting Started

### Prerequisites

1. A GitHub Personal Access Token with access to the repository containing newsletters
2. The repository should contain newsletters in the format: `newsletter-:n/:yyyy-:mm-:dd-remix-newsletter-:n.md`

### Setup

1. Create a `.env` file in the project root:

```bash
GITHUB_TOKEN=your_github_personal_access_token_here
GITHUB_OWNER=remix-run
GITHUB_REPO=newsletter
```

2. Install dependencies and start the server:

```bash
pnpm install
pnpm start
```

Then visit http://localhost:44100

### Development Mode

For development with hot reloading:

```bash
pnpm dev
```

This runs both the server (with watch mode) and the browser asset bundler in parallel.

## Environment Variables

- `GITHUB_TOKEN` (required) - GitHub Personal Access Token for API authentication
- `GITHUB_OWNER` (optional) - Repository owner, defaults to `remix-run`
- `GITHUB_REPO` (optional) - Repository name, defaults to `newsletter`

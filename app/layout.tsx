import type { Remix } from '@remix-run/dom'

import { routes } from './routes.ts'

export function Layout({ children }: { children?: Remix.RemixNode }): Remix.RemixNode {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Remix Newsletter Archive</title>
        <link rel="stylesheet" href="/styles.css" />
        <script type="module" async src={routes.assets.href({ path: 'entry.js' })} />
      </head>
      <body>
        <div class="container">{children}</div>
      </body>
    </html>
  )
}

import * as os from 'node:os'
import * as path from 'node:path'
import { request } from '@octokit/request'
import { detectMimeType } from '@remix-run/mime'
import { type LazyContent, LazyFile } from '@remix-run/lazy-file'
import { createFsFileStorage } from '@remix-run/file-storage/fs'

let cacheDir = path.join(os.tmpdir(), 'newsletter-archive-cache')
let imageCache = createFsFileStorage(cacheDir)

function getImageCacheKey(number: number, filename: string): string {
  return `newsletter-${number}/${filename}`
}

function getConfig() {
  return {
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER || 'remix-run',
    repo: process.env.GITHUB_REPO || 'newsletter',
  }
}

export interface NewsletterMetadata {
  number: number
  date: Date
  path: string
  filename: string
}

export async function listNewsletters(): Promise<NewsletterMetadata[]> {
  let { token, owner, repo } = getConfig()

  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required')
  }

  let response = await request('GET /repos/{owner}/{repo}/contents/{path}', {
    headers: {
      authorization: `token ${token}`,
    },
    owner,
    repo,
    path: 'newsletters',
  })

  if (response.status !== 200) {
    throw new Error(`Failed to fetch repository contents: ${response.status}`)
  }

  let contents = response.data
  if (!Array.isArray(contents)) {
    throw new Error('Expected array of contents')
  }

  let newsletterDirs = contents.filter(
    (item) => item.type === 'dir' && item.name.startsWith('newsletter-'),
  )

  let newsletters: NewsletterMetadata[] = []

  for (let dir of newsletterDirs) {
    let dirResponse = await request('GET /repos/{owner}/{repo}/contents/{path}', {
      headers: {
        authorization: `token ${token}`,
      },
      owner,
      repo,
      path: dir.path,
    })

    if (dirResponse.status !== 200) {
      continue
    }

    let dirContents = dirResponse.data
    if (!Array.isArray(dirContents)) {
      continue
    }

    let markdownFile = dirContents.find((item) => item.type === 'file' && item.name.endsWith('.md'))

    if (!markdownFile) {
      continue
    }

    // Parse newsletter number from directory name: newsletter-:n
    let dirMatch = dir.name.match(/^newsletter-(\d+)$/)
    if (!dirMatch) {
      continue
    }

    let number = parseInt(dirMatch[1], 10)

    // Parse date from filename: :yyyy-:mm-:dd-remix-newsletter-:n.md
    let filenameMatch = markdownFile.name.match(
      /^(\d{4})-(\d{2})-(\d{2})-remix-newsletter-\d+\.md$/,
    )
    if (!filenameMatch) {
      continue
    }

    let [, year, month, day] = filenameMatch
    let date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10))

    newsletters.push({
      number,
      date,
      path: markdownFile.path,
      filename: markdownFile.name,
    })
  }

  // Sort by date, newest first
  newsletters.sort((a, b) => b.date.getTime() - a.date.getTime())

  return newsletters
}

export async function fetchNewsletter(number: number): Promise<string> {
  let { token, owner, repo } = getConfig()

  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required')
  }

  // First, find the newsletter directory
  let response = await request('GET /repos/{owner}/{repo}/contents/{path}', {
    headers: {
      authorization: `token ${token}`,
    },
    owner,
    repo,
    path: 'newsletters',
  })

  if (response.status !== 200) {
    throw new Error(`Failed to fetch repository contents: ${response.status}`)
  }

  let contents = response.data
  if (!Array.isArray(contents)) {
    throw new Error('Expected array of contents')
  }

  let dirName = `newsletter-${number}`
  let newsletterDir = contents.find((item) => item.type === 'dir' && item.name === dirName)

  if (!newsletterDir) {
    throw new Error(`Newsletter ${number} not found`)
  }

  // Get contents of the newsletter directory
  let dirResponse = await request('GET /repos/{owner}/{repo}/contents/{path}', {
    headers: {
      authorization: `token ${token}`,
    },
    owner,
    repo,
    path: newsletterDir.path,
  })

  if (dirResponse.status !== 200) {
    throw new Error(`Failed to fetch newsletter directory: ${dirResponse.status}`)
  }

  let dirContents = dirResponse.data
  if (!Array.isArray(dirContents)) {
    throw new Error('Expected array of directory contents')
  }

  let markdownFile = dirContents.find((item) => item.type === 'file' && item.name.endsWith('.md'))

  if (!markdownFile) {
    throw new Error(`Markdown file not found for newsletter ${number}`)
  }

  // Fetch the file content directly
  let fileResponse = await request('GET /repos/{owner}/{repo}/contents/{path}', {
    headers: {
      authorization: `token ${token}`,
    },
    owner,
    repo,
    path: markdownFile.path,
  })

  if (fileResponse.status !== 200) {
    throw new Error(`Failed to fetch newsletter content: ${fileResponse.status}`)
  }

  let fileData = fileResponse.data
  if (fileData.type !== 'file' || !fileData.content) {
    throw new Error('Invalid file response')
  }

  let content = fileData.content
  if (fileData.encoding === 'base64') {
    return Buffer.from(content, 'base64').toString('utf-8')
  }

  return content
}

export async function fetchNewsletterImage(number: number, filename: string): Promise<File> {
  // Check cache first
  let cacheKey = getImageCacheKey(number, filename)
  let cachedFile = await imageCache.get(cacheKey)
  if (cachedFile) {
    return cachedFile
  }

  let { token, owner, repo } = getConfig()

  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required')
  }

  // First, find the newsletter directory
  let response = await request('GET /repos/{owner}/{repo}/contents/{path}', {
    headers: {
      authorization: `token ${token}`,
    },
    owner,
    repo,
    path: 'newsletters',
  })

  if (response.status !== 200) {
    throw new Error(`Failed to fetch repository contents: ${response.status}`)
  }

  let contents = response.data
  if (!Array.isArray(contents)) {
    throw new Error('Expected array of contents')
  }

  let dirName = `newsletter-${number}`
  let newsletterDir = contents.find((item) => item.type === 'dir' && item.name === dirName)

  if (!newsletterDir) {
    throw new Error(`Newsletter ${number} not found`)
  }

  // Construct the image path relative to the newsletter directory
  let imagePath = `${newsletterDir.path}/${filename}`

  // Fetch the image file from GitHub
  let fileResponse = await request('GET /repos/{owner}/{repo}/contents/{path}', {
    headers: {
      authorization: `token ${token}`,
    },
    owner,
    repo,
    path: imagePath,
  })

  if (fileResponse.status !== 200) {
    throw new Error(`Failed to fetch image: ${fileResponse.status}`)
  }

  let fileData = fileResponse.data
  if (fileData.type !== 'file') {
    throw new Error('Invalid file response')
  }

  // Detect MIME type from filename extension
  let mimeType = detectMimeType(filename) || 'application/octet-stream'

  // Use download_url to stream the file content instead of loading it all into memory
  let downloadUrl = fileData.download_url
  if (!downloadUrl) {
    throw new Error('Download URL not available')
  }

  // Fetch the file size first to determine byteLength
  let headResponse = await fetch(downloadUrl, {
    method: 'HEAD',
    headers: {
      Authorization: `token ${token}`,
    },
  })

  if (!headResponse.ok) {
    throw new Error(`Failed to fetch file metadata: ${headResponse.status}`)
  }

  let contentLength = headResponse.headers.get('content-length')
  if (!contentLength) {
    throw new Error('Content-Length header not available')
  }

  let byteLength = parseInt(contentLength, 10)

  // Create lazy content that streams from GitHub's download_url
  let lazyContent: LazyContent = {
    byteLength,
    stream(start = 0, end = byteLength) {
      let headers: HeadersInit = {
        Authorization: `token ${token}`,
      }

      // Add Range header if we're not requesting the full file
      if (start > 0 || end < byteLength) {
        headers['Range'] = `bytes=${start}-${end - 1}`
      }

      // Return a ReadableStream that fetches on-demand
      return new ReadableStream({
        async start(controller) {
          try {
            let response = await fetch(downloadUrl, { headers })

            if (!response.ok && response.status !== 206) {
              controller.error(new Error(`Failed to fetch file content: ${response.status}`))
              return
            }

            let body = response.body
            if (!body) {
              controller.error(new Error('Response body is null'))
              return
            }

            let reader = body.getReader()

            function pump(): Promise<void> {
              return reader.read().then(({ done, value }) => {
                if (done) {
                  controller.close()
                  return
                }
                controller.enqueue(value)
                return pump()
              })
            }

            return pump().catch((error) => {
              controller.error(error)
            })
          } catch (error) {
            controller.error(error)
          }
        },
      })
    },
  }

  let file = new LazyFile(lazyContent, filename, {
    type: mimeType,
    lastModified: Date.now(),
  })

  // Cache the file for future requests
  // Note: This will read the file content to cache it, but subsequent requests will be served from cache
  await imageCache.set(cacheKey, file)

  return file
}

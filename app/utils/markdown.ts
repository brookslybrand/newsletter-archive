import { marked } from 'marked'

export function markdownToHtml(markdown: string): string {
  const result = marked.parse(markdown);
  // marked.parse returns string when called synchronously
  if (typeof result === 'string') {
    return result;
  }
  // If it's a Promise (shouldn't happen with default config), handle it
  throw new Error('marked.parse returned a Promise, expected synchronous string');
}




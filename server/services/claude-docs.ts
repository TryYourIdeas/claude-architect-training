import docsIndex from '../../data/claude-docs-index.json'

export interface DocPage {
  site: 'code' | 'platform'
  section: string
  title: string
  url: string
  description: string
}

export const DOCS = {
  /** Largest page body returned to the model, in characters. */
  maxChars: 12_000,
  /** Largest download accepted from a documentation site, in bytes. */
  maxBytes: 400_000,
  timeoutMs: 10_000,
  cacheMs: 15 * 60_000,
  maxSearchResults: 8,
} as const

const pages = docsIndex as DocPage[]
const byUrl = new Map(pages.map(p => [p.url, p]))
const cache = new Map<string, { at: number, text: string }>()

/** Tokens from a query, lower-cased, ignoring very short words. */
function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2)
}

/**
 * Ranks index pages against a query. Title matches weigh more than section or description matches.
 * Returns the best matches; an empty array when nothing matches.
 */
export function searchDocs(query: string, limit: number = DOCS.maxSearchResults): DocPage[] {
  const terms = [...new Set(tokens(query))]
  if (terms.length === 0) return []

  const scored = pages
    .map((page) => {
      const title = page.title.toLowerCase()
      const section = page.section.toLowerCase()
      const description = page.description.toLowerCase()
      const url = page.url.toLowerCase()
      let score = 0
      for (const term of terms) {
        if (title.includes(term)) score += 3
        if (section.includes(term)) score += 1
        if (description.includes(term)) score += 2
        if (url.includes(term)) score += 1
      }
      return { page, score }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title))

  return scored.slice(0, limit).map(s => s.page)
}

export function isIndexedDocUrl(url: string): boolean {
  return byUrl.has(url)
}

function clip(text: string): string {
  if (text.length <= DOCS.maxChars) return text
  return `${text.slice(0, DOCS.maxChars)}\n\n[Page truncated at ${DOCS.maxChars} characters. Fetch a more specific page if you need the rest.]`
}

/**
 * Returns the text of an indexed documentation page. Only URLs listed in the index are fetched,
 * so the assistant cannot be pointed at arbitrary hosts.
 * Failures are returned as text so the model can explain them, rather than thrown.
 */
export async function fetchDoc(url: string, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!isIndexedDocUrl(url)) {
    return `Error: ${url} is not in the documentation index. Use search_docs to find a valid URL.`
  }

  const hit = cache.get(url)
  if (hit && now - hit.at < DOCS.cacheMs) return hit.text

  try {
    const response = await fetchImpl(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(DOCS.timeoutMs),
      headers: { accept: 'text/markdown, text/plain;q=0.9' },
    })
    if (!response.ok) return `Error: the documentation site returned HTTP ${response.status} for ${url}.`

    const body = await response.text()
    if (body.length > DOCS.maxBytes) return `Error: ${url} is too large to read.`

    const page = byUrl.get(url)!
    const text = clip(`# ${page.title}\nSource: ${url}\n\n${body}`)
    cache.set(url, { at: now, text })
    return text
  }
  catch (err) {
    console.error('[claude-docs] fetch failed', { url, message: err instanceof Error ? err.message : String(err) })
    return `Error: could not fetch ${url}. The documentation site may be unavailable.`
  }
}

export function formatSearchResults(results: DocPage[]): string {
  if (results.length === 0) return 'No documentation pages matched. Try different keywords.'
  return results
    .map(p => `- ${p.title} (${p.site === 'code' ? 'Claude Code' : 'Claude Platform'}, ${p.section}): ${p.url}\n  ${p.description}`)
    .join('\n')
}

/** Tool definitions passed to the Messages API. */
export const DOC_TOOLS = [
  {
    name: 'search_docs',
    description: 'Search the index of the official Claude Platform (API) and Claude Code documentation by keywords. Returns page titles, URLs and descriptions. Use it to find the right page before fetching.',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'Keywords, for example "tool_choice any" or "hooks PreToolUse".' } },
      required: ['query'],
    },
  },
  {
    name: 'fetch_docs',
    description: 'Fetch the full text of one documentation page. The URL must come from search_docs or from the index. Use it to check facts before answering.',
    input_schema: {
      type: 'object' as const,
      properties: { url: { type: 'string', description: 'A documentation URL returned by search_docs.' } },
      required: ['url'],
    },
  },
]

/** Runs one docs tool call and returns the text sent back to the model. */
export async function runDocTool(name: string, input: Record<string, unknown>, fetchImpl?: typeof fetch): Promise<string> {
  if (name === 'search_docs') {
    const query = typeof input.query === 'string' ? input.query : ''
    return formatSearchResults(searchDocs(query))
  }
  if (name === 'fetch_docs') {
    const url = typeof input.url === 'string' ? input.url : ''
    return fetchDoc(url, Date.now(), fetchImpl)
  }
  return `Error: unknown tool ${name}.`
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import docsIndex from '~~/data/claude-docs-index.json'
import { DOCS, fetchDoc, formatSearchResults, isIndexedDocUrl, runDocTool, searchDocs } from '~~/server/services/claude-docs'

const HOOKS = 'https://code.claude.com/docs/en/hooks.md'

function okResponse(body: string) {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/markdown' } })
}

describe('docs index', () => {
  it('lists pages from both documentation sites with a URL and description', () => {
    const sites = new Set(docsIndex.map((p: { site: string }) => p.site))
    expect(sites).toEqual(new Set(['code', 'platform']))
    for (const p of docsIndex as Array<{ url: string, description: string, title: string }>) {
      expect(p.url).toMatch(/^https:\/\/(code\.claude\.com|platform\.claude\.com)\/docs\/en\//)
      expect(p.title.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
    }
  })
})

describe('searchDocs', () => {
  it('finds pages by keyword, with title matches ranked first', () => {
    const results = searchDocs('hooks')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.title.toLowerCase()).toContain('hook')
  })

  it('returns nothing for an empty or unmatched query', () => {
    expect(searchDocs('')).toEqual([])
    expect(searchDocs('zzqqxxnomatch')).toEqual([])
  })

  it('limits the number of results', () => {
    expect(searchDocs('claude', 3).length).toBeLessThanOrEqual(3)
  })

  it('formats results with title, site, URL and description', () => {
    const text = formatSearchResults(searchDocs('hooks', 1))
    expect(text).toContain('https://')
    expect(text).toMatch(/\((Claude Code|Claude Platform), /)
  })
})

describe('fetchDoc', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('refuses URLs that are not in the index, without making a request', async () => {
    const fetchSpy = vi.fn()
    const text = await fetchDoc('https://example.com/evil.md', Date.now(), fetchSpy as never)
    expect(text).toMatch(/not in the documentation index/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('recognises indexed URLs', () => {
    expect(isIndexedDocUrl(HOOKS)).toBe(true)
    expect(isIndexedDocUrl('https://code.claude.com/docs/en/not-a-page.md')).toBe(false)
  })

  it('returns the page with its title and source, and does not follow redirects', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okResponse('Hooks body'))
    const text = await fetchDoc(HOOKS, 1, fetchSpy as never)
    expect(text).toContain(`Source: ${HOOKS}`)
    expect(text).toContain('Hooks body')
    expect(fetchSpy.mock.calls[0]![1]).toMatchObject({ redirect: 'error' })
  })

  it('truncates very long pages', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okResponse('x'.repeat(DOCS.maxChars + 500)))
    const text = await fetchDoc('https://code.claude.com/docs/en/context-window.md', 2, fetchSpy as never)
    expect(text).toMatch(/truncated/)
    expect(text.length).toBeLessThan(DOCS.maxChars + 300)
  })

  it('caches a page for the cache window', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okResponse('cached body'))
    await fetchDoc('https://code.claude.com/docs/en/quickstart.md', 10, fetchSpy as never)
    await fetchDoc('https://code.claude.com/docs/en/quickstart.md', 20, fetchSpy as never)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('reports HTTP errors and network failures as text instead of throwing', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const httpFail = vi.fn().mockResolvedValue(new Response('no', { status: 503 }))
    expect(await fetchDoc('https://code.claude.com/docs/en/costs.md', 30, httpFail as never)).toMatch(/HTTP 503/)

    const netFail = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await fetchDoc('https://code.claude.com/docs/en/security.md', 40, netFail as never)).toMatch(/could not fetch/)
    errSpy.mockRestore()
  })
})

describe('runDocTool', () => {
  it('dispatches search_docs and fetch_docs and rejects unknown tools', async () => {
    expect(await runDocTool('search_docs', { query: 'hooks' })).toContain('https://')
    expect(await runDocTool('nope', {})).toMatch(/unknown tool/)
  })
})

// Usage: node scripts/build-docs-index.mjs
// Builds data/claude-docs-index.json from the llms.txt files published by the two documentation sites.
// The committed JSON is what the chat assistant searches; re-run this script to refresh it.
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCES = [
  { name: 'Claude Code', site: 'code', llms: 'https://code.claude.com/docs/llms.txt', prefix: 'https://code.claude.com/docs/en/' },
  { name: 'Claude Platform', site: 'platform', llms: 'https://platform.claude.com/llms.txt', prefix: 'https://platform.claude.com/docs/en/' },
]

// Matches "- [Title](url)" optionally followed by ": description" or " - description".
const LINK = /^- \[([^\]]+)\]\((https:\/\/[^)\s]+)\)(?:\s*(?::|-)\s*(.+))?$/

const entries = []
const seen = new Set()

for (const source of SOURCES) {
  const text = await (await fetch(source.llms)).text()
  let section = ''
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) section = line.slice(3).trim()
    const m = LINK.exec(line.trim())
    if (!m) continue
    const [, title, url, description] = m
    if (!url.startsWith(source.prefix) || seen.has(url)) continue
    seen.add(url)
    entries.push({
      site: source.site,
      section: section || source.name,
      title: title.trim(),
      url,
      description: (description ?? '').trim() || title.trim(),
    })
  }
}

const out = resolve(process.cwd(), 'data/claude-docs-index.json')
writeFileSync(out, `${JSON.stringify(entries, null, 2)}\n`)
const counts = entries.reduce((acc, e) => ({ ...acc, [e.site]: (acc[e.site] ?? 0) + 1 }), {})
console.log(`Wrote ${entries.length} pages to ${out}`, counts)

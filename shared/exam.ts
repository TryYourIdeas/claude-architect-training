// Exam rules mirrored from the Claude Certified Architect – Foundations exam guide (CCAR-F, v1.0).

export interface Domain {
  id: number
  name: string
  weight: number
}

export const DOMAINS: readonly Domain[] = [
  { id: 1, name: 'Agentic Architecture & Orchestration', weight: 27 },
  { id: 2, name: 'Tool Design & MCP Integration', weight: 18 },
  { id: 3, name: 'Claude Code Configuration & Workflows', weight: 20 },
  { id: 4, name: 'Prompt Engineering & Structured Output', weight: 20 },
  { id: 5, name: 'Context Management & Reliability', weight: 15 },
]

export const SCENARIOS: Readonly<Record<number, string>> = {
  1: 'Customer Support Resolution Agent',
  2: 'Code Generation with Claude Code',
  3: 'Multi-Agent Research System',
  4: 'Developer Productivity with Claude',
  5: 'Claude Code for Continuous Integration',
  6: 'Structured Data Extraction',
}

/** Scenario context from the exam guide, shown above questions that belong to each scenario. */
export const SCENARIO_DESCRIPTIONS: Readonly<Record<number, string>> = {
  1: 'You are building a customer support resolution agent with the Claude Agent SDK. The agent handles high-ambiguity requests such as returns, billing disputes and account issues. It has access to your backend systems through custom MCP tools (get_customer, lookup_order, process_refund, escalate_to_human). The target is 80%+ first-contact resolution while knowing when to escalate.',
  2: 'Your team uses Claude Code to accelerate software development: code generation, refactoring, debugging and documentation. You need to integrate it into your development workflow with custom slash commands, CLAUDE.md configurations, and an understanding of when to use plan mode versus direct execution.',
  3: 'You are building a multi-agent research system with the Claude Agent SDK. A coordinator agent delegates to specialized subagents: one searches the web, one analyzes documents, one synthesizes findings, and one generates reports. The system researches topics and produces comprehensive, cited reports.',
  4: 'You are building developer productivity tools with the Claude Agent SDK. The agent helps engineers explore unfamiliar codebases, understand legacy systems, generate boilerplate code, and automate repetitive tasks. It uses the built-in tools (Read, Write, Bash, Grep, Glob) and integrates with Model Context Protocol (MCP) servers.',
  5: 'You are integrating Claude Code into your continuous integration and continuous deployment (CI/CD) pipeline. The system runs automated code reviews, generates test cases, and provides feedback on pull requests. You need prompts that give actionable feedback and minimize false positives.',
  6: 'You are building a structured data extraction system using Claude. The system extracts information from unstructured documents, validates the output against JSON schemas, and maintains high accuracy. It must handle edge cases gracefully and integrate with downstream systems.',
}

export const EXAM = {
  items: 60,
  timeLimitMinutes: 120,
  scenariosDrawn: 4,
  scenarioBankSize: 6,
  passScaled: 720,
  scaleMin: 100,
  scaleMax: 1000,
} as const

export const DIAGNOSTIC = {
  items: 10,
} as const

/** Consecutive correct answers that clear a question's wrong counter. */
export const CLEAR_WRONG_AFTER_RIGHT = 3

export const COACH = {
  defaultSize: 10,
  minSize: 1,
  maxSize: 30,
} as const

export const SCALE_NOTE
  = 'Scaled score is an approximation: the real exam uses a standard-setting study and equating that is not published. Scores here are linear from percent correct.'

/**
 * Allocates `total` items across domains in proportion to their weights,
 * using the largest-remainder method so the counts always sum to `total`.
 */
export function domainQuotas(total: number, domains: readonly Domain[] = DOMAINS): Record<number, number> {
  const weightSum = domains.reduce((sum, d) => sum + d.weight, 0)
  const exact = domains.map(d => ({ id: d.id, raw: (total * d.weight) / weightSum }))
  const quotas: Record<number, number> = {}
  for (const e of exact) quotas[e.id] = Math.floor(e.raw)
  let remaining = total - Object.values(quotas).reduce((s, n) => s + n, 0)
  const byRemainder = [...exact].sort((a, b) => (b.raw % 1) - (a.raw % 1) || a.id - b.id)
  for (const e of byRemainder) {
    if (remaining <= 0) break
    quotas[e.id] = (quotas[e.id] ?? 0) + 1
    remaining -= 1
  }
  return quotas
}

/** Linear mapping of percent correct onto the 100–1000 reporting scale (approximation). */
export function scaleScore(correct: number, total: number): number {
  if (total <= 0) return EXAM.scaleMin
  return EXAM.scaleMin + Math.round(((EXAM.scaleMax - EXAM.scaleMin) * correct) / total)
}

export function isPass(scaled: number): boolean {
  return scaled >= EXAM.passScaled
}

/** Multiple-response items are all-or-nothing: the selection must equal the correct set exactly. */
export function isCorrectSelection(correct: readonly string[], selected: readonly string[]): boolean {
  const a = [...new Set(correct)].sort()
  const b = [...new Set(selected)].sort()
  return a.length === b.length && a.every((key, i) => key === b[i])
}

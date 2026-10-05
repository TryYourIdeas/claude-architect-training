import type { Page } from '@playwright/test'

/** Ticks as many options as the question asks for (one for single-answer items). */
export async function answerCurrentQuestion(page: Page) {
  const instruction = await page.locator('.question__instruction').textContent()
  const count = Number(instruction?.match(/Select (\d+) answers/)?.[1] ?? 1)
  const inputs = page.locator('fieldset input')
  for (let i = 0; i < count; i++) await inputs.nth(i).check()
}

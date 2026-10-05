import { expect, test } from '@playwright/test'

test('answering in coaching updates the question counters', async ({ page }) => {
  await page.goto('/stats')
  await page.waitForLoadState('networkidle')
  const before = await page.getByText(/Shown \d+ · Right \d+ · Wrong \d+/).textContent()
  const shownBefore = Number(before?.match(/Shown (\d+)/)?.[1] ?? 0)

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('coach-size').selectOption('5')
  await page.getByRole('button', { name: 'Start coaching' }).click()
  await expect(page).toHaveURL(/\/coach\//)
  await page.locator('fieldset input').first().check()
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(page.getByTestId('feedback')).toBeVisible()

  await page.goto('/stats')
  await page.waitForLoadState('networkidle')
  const after = await page.getByText(/Shown \d+ · Right \d+ · Wrong \d+/).textContent()
  const shownAfter = Number(after?.match(/Shown (\d+)/)?.[1] ?? 0)
  expect(shownAfter).toBe(shownBefore + 1)
})

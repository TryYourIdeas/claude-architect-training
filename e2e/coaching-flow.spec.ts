import { expect, test, type Page } from '@playwright/test'

async function gotoHome(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
}

test('coaching shows one question at a time and immediate feedback', async ({ page }) => {
  await gotoHome(page)
  await page.getByTestId('coach-size').selectOption('5')
  await page.getByRole('button', { name: 'Start coaching' }).click()
  await expect(page).toHaveURL(/\/coach\//)

  for (let i = 1; i <= 5; i++) {
    await expect(page.getByText(`Question ${i} of 5`)).toBeVisible()
    // Only one question is on screen at a time.
    await expect(page.locator('fieldset')).toHaveCount(1)

    const choice = page.locator('fieldset input').first()
    await choice.check()
    await page.getByRole('button', { name: 'Check answer' }).click()

    const feedback = page.getByTestId('feedback')
    await expect(feedback).toBeVisible()
    await expect(feedback.getByRole('heading', { level: 2 })).toHaveText(/^(Correct|Not quite)$/)
    await expect(feedback.getByText('Why')).toBeVisible()
    await expect(feedback.getByText(/Correct answer:/)).toBeVisible()

    await page.getByTestId('next').click()
  }

  await expect(page).toHaveURL(/\/reports\//)
  await expect(page.getByRole('heading', { name: 'Coaching session results' })).toBeVisible()
  await expect(page.getByTestId('coach-score')).toContainText('/ 5')
})

test('coaching can focus on a single domain', async ({ page }) => {
  await gotoHome(page)
  await page.getByTestId('coach-domain').selectOption('2')
  await page.getByTestId('coach-size').selectOption('5')
  await page.getByRole('button', { name: 'Start coaching' }).click()
  await expect(page).toHaveURL(/\/coach\//)
  await expect(page.getByText('Domain: Tool Design & MCP Integration')).toBeVisible()
})

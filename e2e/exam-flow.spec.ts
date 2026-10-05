import { expect, test, type Page } from '@playwright/test'

// Wait for Nuxt to hydrate so click handlers are attached before interacting.
async function gotoHome(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
}

test('home page lists the exam rules and both entry points', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Prepare for the Claude Certified Architect exam/ })).toBeVisible()
  await expect(page.getByText('60 items, multiple choice and multiple response')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start diagnostic' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start practice exam' })).toBeVisible()
})

test('practice exam shows a 120-minute clock and 60 questions', async ({ page }) => {
  await gotoHome(page)
  await page.getByRole('button', { name: 'Start practice exam' }).click()
  await expect(page).toHaveURL(/\/tests\//)
  await expect(page.getByText(/Question 1 of 60/)).toBeVisible()
  // 120 minutes shows as 2:00:00 at start and counts down from there.
  await expect(page.getByText(/Time left (1:59|2:00):\d\d/)).toBeVisible()
})

test('diagnostic can be answered end to end and produces a report', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept())

  await gotoHome(page)
  await page.getByRole('button', { name: 'Start diagnostic' }).click()
  await expect(page).toHaveURL(/\/tests\//)

  for (let i = 1; i <= 10; i++) {
    await expect(page.getByText(`Question ${i} of 10`)).toBeVisible()
    const first = page.locator('fieldset input').first()
    await first.check()
    if (i < 10) await page.getByRole('button', { name: 'Next' }).click()
  }

  await page.getByRole('button', { name: 'Submit test' }).click()
  await expect(page).toHaveURL(/\/reports\//)
  await expect(page.getByRole('heading', { name: 'Diagnostic report' })).toBeVisible()
  await expect(page.getByText(/\d+ of 10 correct/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Results by domain' })).toBeVisible()
})

import { expect, test } from '@playwright/test'
import { answerCurrentQuestion } from './helpers'

test('the coaching question screen has a chat box that reports when the assistant is not configured', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('coach-size').selectOption('5')
  await page.getByRole('button', { name: 'Start coaching' }).click()
  await expect(page).toHaveURL(/\/coach\//)

  const chat = page.getByRole('region', { name: 'Ask about this question' })
  await expect(chat).toBeVisible()
  await chat.getByLabel('Your question').fill('What does this question test?')
  await chat.getByRole('button', { name: 'Send' }).click()
  await expect(chat.getByRole('alert')).toContainText('not configured')
})

test('the chat stays available after the question is answered', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('coach-size').selectOption('5')
  await page.getByRole('button', { name: 'Start coaching' }).click()
  await answerCurrentQuestion(page)
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(page.getByTestId('feedback')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Ask about this question' })).toBeVisible()
})

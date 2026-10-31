import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect } from './support'
import { capturedLink, expectSetup, submitSetup } from './auth-journey'

export async function authenticateShell(page: Page) {
  const email = `shell-${randomUUID()}@example.test`
  await page.goto('/dash')
  await expectSetup(page)
  await submitSetup(page, 'Shell Test User', email)
  await page.getByRole('link', { name: 'Open development inbox', exact: true }).click()
  await capturedLink(page, email, 'Create your Aircastle account')
  await page.getByRole('link', { name: 'Continue', exact: true }).click()
  await expect(page.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page).toHaveURL(/\/dash\/workspaces\/new$/)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page).toHaveURL(/\/dash\/workspaces$/)
  return { email }
}

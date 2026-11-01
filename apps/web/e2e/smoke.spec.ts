import { test, expect } from './auth-service'

test('[shell:R2] real built entry positive control', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Aircastle', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

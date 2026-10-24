import { test, expect, visit } from './support'

test('[R2] real built entry positive control', async ({ page }) => {
  await visit(page)
  await expect(page).toHaveURL(/\/collections$/)
})

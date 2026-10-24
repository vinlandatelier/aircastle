import { test, expect, visit } from './support'

test('[shell:R2] real built entry positive control', async ({ page }) => {
  await visit(page)
  await expect(page).toHaveURL(/\/dash\/workspaces\/demo\/projects\/demo\/collections$/)
})

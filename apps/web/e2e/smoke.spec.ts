import { test, expect, visit } from './support'

test('real built entry positive control', async ({ page }) => {
  await visit(page)
  await expect(page).toHaveURL(/\/dash\/workspaces\/demo\/projects\/demo\/collections$/)
})

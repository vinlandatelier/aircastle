import { test, expect } from './support'

const prompt = "Recently shipped MCP for our app, let's announce it"

test('product preview sits below the hero and is labelled as a preview', async ({ page }) => {
  await page.goto('/')
  const preview = page.getByRole('region', { name: 'Aircastle preview' })
  await expect(preview).toBeVisible()
  await expect(preview.getByText('Preview', { exact: true })).toBeVisible()
  const heroBox = await page.getByRole('link', { name: 'Get started', exact: true }).boundingBox()
  const previewBox = await preview.boundingBox()
  if (!heroBox || !previewBox) throw new Error('Landing page is not laid out')
  expect(previewBox.y).toBeGreaterThan(heroBox.y + heroBox.height)
})

test('act one types an idea to the agents and files it as a drafting post', async ({ page }) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const preview = page.getByRole('region', { name: 'Aircastle preview' })
  await preview.scrollIntoViewIfNeeded()
  const frame = preview.locator('[data-demo-frame]')
  const dialog = frame.locator('[data-demo-dialog]')
  const newPost = frame.locator('[data-demo-row="new"]')

  await expect(frame.getByText('Posts', { exact: true }).first()).toBeVisible()
  await expect(dialog).toHaveCount(0)
  await expect(newPost).toHaveAttribute('data-state', 'hidden')

  await page.clock.runFor(1300)
  await expect(dialog).toHaveAttribute('data-state', 'open')

  await page.clock.runFor(3000)
  await expect(dialog.locator('[data-demo-prompt]')).toHaveText(prompt)

  await page.clock.runFor(2000)
  await expect(dialog).toHaveCount(0)
  await expect(newPost).toHaveAttribute('data-state', 'shown')
  await expect(newPost).toContainText('Announcing MCP support')
  await expect(newPost).toContainText('Drafting')
})

test('act one shows its end state still with reduced motion', async ({ page }) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  const newPost = frame.locator('[data-demo-row="new"]')
  await expect(newPost).toHaveAttribute('data-state', 'shown')
  await page.clock.runFor(10000)
  await expect(newPost).toHaveAttribute('data-state', 'shown')
  await expect(frame.locator('[data-demo-dialog]')).toHaveCount(0)
})

import { test, expect, visit } from './support'

test('[R7] normal production build exposes no fixture data or scenario override', async ({
  page,
}) => {
  await visit(page, 'normal', '/dash/collections?scenario=long-text')
  await expect(
    page.getByRole('button', { name: 'Switch project: Acme Inc / Technical Blog', exact: true }),
  ).toBeVisible()
  const scripts = await page
    .locator('script[src]')
    .evaluateAll((elements) => elements.map((element) => (element as HTMLScriptElement).src))
  expect(scripts.length).toBeGreaterThan(0)
  for (const url of scripts) {
    const response = await page.request.get(url)
    expect(response.ok()).toBe(true)
    const code = await response.text()
    expect(code).not.toContain('Long account name ')
    expect(code).not.toContain('empty-candidates')
  }
})

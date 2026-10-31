import { test, expect } from './auth-service'
import { authenticateShell } from './shell-journey'

test('[shell:R7] normal production build exposes no fixture data or scenario override', async ({
  page,
  authService,
}) => {
  await page.goto('/?scenario=long-text')
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
    expect(code).not.toContain('display-only-shell-user')
  }
  const project = await authService.provisionProject()
  const { email } = await authenticateShell(page)
  await authService.grantWorkspace(email, project.workspaceId)
  await page.goto(
    `/dash/workspaces/${project.workspaceId}/projects/${project.projectId}/collections?scenario=long-text`,
  )
  await expect(
    page.getByRole('button', { name: 'Switch project: Acme Inc / Technical Blog', exact: true }),
  ).toBeVisible()
})

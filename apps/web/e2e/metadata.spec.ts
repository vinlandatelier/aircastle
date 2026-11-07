import { test, expect } from './support'
import { landingDescription, landingTitle } from '../src/metadata'

test('marketing entry keeps its URL and exact metadata before and after startup', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/')).text()
  expect(html).toContain(`<title>${landingTitle}</title>`)
  expect(html).toContain(landingDescription)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Aircastle', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await expect(page).toHaveTitle(landingTitle)
  await expect(page.locator('head title')).toHaveCount(1)
  await expect(page.locator('meta[name="description"]')).toHaveCount(1)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    landingDescription,
  )
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveTitle('Aircastle - Sign in')
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Aircastle', exact: true })).toBeVisible()
  await expect(page).toHaveTitle(landingTitle)
  await expect(page.locator('head title')).toHaveCount(1)
  await expect(page.locator('meta[name="description"]')).toHaveCount(1)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    landingDescription,
  )
})

test('sign-in and dashboard metadata follows navigation and history', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(page).toHaveTitle('Aircastle - Sign in')
  await expect(page.locator('head title')).toHaveCount(1)
  await expect(page.locator('meta[name="description"]')).toHaveCount(1)
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page).toHaveTitle(landingTitle)
  await page.goto('/dash')
  await expect(page).toHaveTitle('Aircastle - Collections')
  await page.getByRole('link', { name: 'Tasks', exact: true }).click()
  await expect(page).toHaveTitle('Aircastle - Tasks')
  await page.goBack()
  await expect(page).toHaveTitle('Aircastle - Collections')
  await page.goBack()
  await expect(page).toHaveTitle(landingTitle)
  await page.goBack()
  await expect(page).toHaveTitle('Aircastle - Sign in')
  await page.reload()
  await expect(page).toHaveTitle('Aircastle - Sign in')
  await expect(page.locator('head title')).toHaveCount(1)
})

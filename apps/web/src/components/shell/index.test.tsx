import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { renderApp } from '@/test-utils'
import { themeStorageKey } from '@/theme'

describe('Aircastle app shell', () => {
  beforeEach(() => localStorage.removeItem(themeStorageKey))
  afterEach(() => localStorage.removeItem(themeStorageKey))

  it('applies and stores explicit theme choices through the public app', async () => {
    const { user } = await renderApp()
    for (const [label, value, other] of [
      ['Dark', 'dark', 'light'],
      ['Light', 'light', 'dark'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: 'Choose theme' }))
      await user.click(await screen.findByRole('menuitemradio', { name: label }))
      await waitFor(() => {
        expect(document.documentElement.classList.contains(value)).toBe(true)
        expect(document.documentElement.classList.contains(other)).toBe(false)
        expect(localStorage.getItem(themeStorageKey)).toBe(value)
      })
    }
  })

  it('renders the brand, project switcher, and CMS navigation', async () => {
    await renderApp()
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('link', { name: 'Aircastle' })).toBeTruthy()
    expect(
      within(header).getByRole('button', {
        name: 'Switch project: Acme Inc / Technical Blog',
      }),
    ).toBeTruthy()

    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(
      within(navigation)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Tasks',
      'Collections',
      'Media Library',
      'Analytics',
      'Users',
      'Access Tokens',
      'Settings',
    ])
  })

  it('keeps the agreed header action order', async () => {
    await renderApp()
    const header = within(screen.getByRole('banner'))
    const controls = [
      header.getByRole('button', { name: 'Switch project: Acme Inc / Technical Blog' }),
      header.getByRole('button', { name: 'Connect' }),
      header.getByRole('button', { name: 'Create' }),
      header.getByRole('button', { name: 'Search pages' }),
      header.getByRole('link', { name: 'Docs' }),
      header.getByRole('button', { name: 'Choose theme' }),
      header.getByRole('link', { name: 'GitHub' }),
      header.getByRole('button', { name: 'Upgrade' }),
      header.getByRole('button', { name: 'Open account menu' }),
    ]

    for (let index = 1; index < controls.length; index++) {
      expect(
        controls[index - 1]!.compareDocumentPosition(controls[index]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
  })

  it('offers page search with its keyboard shortcut', async () => {
    await renderApp()
    const search = within(screen.getByRole('banner')).getByRole('button', { name: 'Search pages' })
    expect(search.textContent).toContain('Search...')
    expect(search.textContent).toContain('⌘K')
  })

  it('shows Aircastle groups without the Efferd template copy', async () => {
    await renderApp()
    const sidebar = document.querySelector('[data-slot="sidebar"]')!
    expect(within(sidebar as HTMLElement).getByText('Product')).toBeTruthy()
    expect(within(sidebar as HTMLElement).getByText('Administration')).toBeTruthy()
    expect(sidebar.textContent).not.toMatch(
      /Dashboard|Projects|Team|Integrations|API Keys|Billing|Workspace|CHANGELOG|Product update|Learn more|Help Center|Documentation|Efferd/,
    )
    expect(document.body.textContent).not.toContain('Efferd')
  })

  it('places an expanded collapse control before the page content', async () => {
    await renderApp()
    const toggle = screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0]!
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(
      toggle.compareDocumentPosition(screen.getByRole('main')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

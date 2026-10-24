import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { renderApp } from '@/test-utils'

describe('Aircastle app shell', () => {
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
})

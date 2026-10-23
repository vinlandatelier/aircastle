import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'
import App from './App'

describe('Aircastle app shell', () => {
  it('places Upgrade between the header links and account menu', () => {
    const html = renderToStaticMarkup(<App />)

    expect(html).toContain('aria-label="Upgrade"')
    expect(html.indexOf('aria-label="GitHub"')).toBeLessThan(html.indexOf('aria-label="Upgrade"'))
    expect(html.indexOf('aria-label="Upgrade"')).toBeLessThan(
      html.indexOf('aria-label="Open account menu"'),
    )
  })

  it('offers a project switcher with the workspace and current project', () => {
    const html = renderToStaticMarkup(<App />)

    expect(html).toContain('aria-label="Switch project: Acme Inc / Technical Blog"')
    expect(html).toContain('Free')
  })

  it('keeps the brand in the app header outside the sidebar', () => {
    const html = renderToStaticMarkup(<App />)
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'))

    expect(header).toContain('aria-label="Aircastle"')
    expect(html.indexOf('</header>')).toBeLessThan(html.indexOf('data-slot="sidebar"'))
  })

  it('offers search before the header links with its keyboard shortcut', () => {
    const html = renderToStaticMarkup(<App />)

    expect(html).toContain('aria-label="Search pages"')
    expect(html).toContain('Search...')
    expect(html).toContain('⌘K')
    expect(html.indexOf('aria-label="Search pages"')).toBeLessThan(
      html.indexOf('aria-label="Docs"'),
    )
  })

  it('renders an accessible brand link without template text', () => {
    const html = renderToStaticMarkup(<App />)

    expect(html).toContain('aria-label="Aircastle"')
    expect(html).not.toContain('>Efferd<')
  })

  it('places the collapse control alongside the sidebar navigation', () => {
    const html = renderToStaticMarkup(<App />)
    const sidebar = html.slice(0, html.indexOf('<main'))

    expect(sidebar).toContain('Toggle Sidebar')
    expect(sidebar).toContain('aria-expanded="true"')
  })

  it('renders the installed shell navigation and header', () => {
    const html = renderToStaticMarkup(<App />)

    for (const label of [
      'Aircastle',
      'Dashboard',
      'Analytics',
      'Projects',
      'Team',
      'Integrations',
      'API Keys',
      'Settings',
      'Billing',
    ]) {
      expect(html).toContain(label)
    }
    expect(html).toContain('Toggle Sidebar')
    expect(html).toContain('aria-label="Docs"')
    expect(html).toContain('aria-label="Choose theme"')
    expect(html).toContain('aria-label="GitHub"')
    expect(html.indexOf('aria-label="Docs"')).toBeLessThan(
      html.indexOf('aria-label="Choose theme"'),
    )
    expect(html.indexOf('aria-label="Choose theme"')).toBeLessThan(
      html.indexOf('aria-label="GitHub"'),
    )
    expect(html).toContain('aria-label="Open account menu"')
    expect(html.slice(html.indexOf('data-slot="sidebar"'), html.indexOf('<main'))).not.toMatch(
      /CHANGELOG|Product update|Learn more|Help Center|Documentation|Efferd LLC/,
    )
    expect(html).toContain('<main')
  })

  it('replaces the previous custom CMS interface', () => {
    const html = renderToStaticMarkup(<App />)

    expect(html).not.toMatch(/Your content, in place|Intelligence|Get started|Vite logo/)
  })
})

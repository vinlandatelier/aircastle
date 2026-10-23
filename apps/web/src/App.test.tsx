import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'
import App from './App'

describe('Aircastle app shell', () => {
  it('places Connect and Create after the project switcher', () => {
    const html = renderToStaticMarkup(<App />)

    expect(html).toContain('aria-label="Connect"')
    expect(html).toContain('aria-label="Create"')
    expect(html.indexOf('aria-label="Switch project:')).toBeLessThan(
      html.indexOf('aria-label="Connect"'),
    )
    expect(html.indexOf('aria-label="Connect"')).toBeLessThan(html.indexOf('aria-label="Create"'))
    expect(html.indexOf('aria-label="Create"')).toBeLessThan(
      html.indexOf('aria-label="Search pages"'),
    )
  })

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

  it('renders the core CMS navigation and header', () => {
    const html = renderToStaticMarkup(<App />)

    for (const label of [
      'Aircastle',
      'Product',
      'Tasks',
      'Collections',
      'Media Library',
      'Analytics',
      'Administration',
      'Users',
      'Access Tokens',
      'Settings',
    ]) {
      expect(html).toContain(label)
    }
    const sidebar = html.slice(html.indexOf('data-slot="sidebar"'), html.indexOf('<main'))
    expect(sidebar).not.toMatch(
      />Dashboard<|>Projects<|>Team<|>Integrations<|>API Keys<|>Billing<|>Workspace</,
    )
    expect(sidebar.indexOf('>Tasks<')).toBeLessThan(sidebar.indexOf('>Collections<'))
    expect(sidebar.indexOf('>Collections<')).toBeLessThan(sidebar.indexOf('>Media Library<'))
    expect(sidebar.indexOf('>Media Library<')).toBeLessThan(sidebar.indexOf('>Analytics<'))
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

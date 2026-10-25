import { render, screen } from '@testing-library/react'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { AppErrorBoundary } from '@/features/error-recovery'
import { createAppRouter } from './router'
import { themeStorageKey } from '@/theme'

const fault = vi.hoisted(() => ({ loader: false, render: false }))
const marker = 'Aircastle route failure: private details'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const router = await importOriginal<typeof import('@tanstack/react-router')>()
  const createRootRoute: typeof router.createRootRoute = (options) =>
    router.createRootRoute({
      ...options,
      loader: () => {
        if (fault.loader) throw new Error(marker)
      },
    })
  return { ...router, createRootRoute }
})

vi.mock('@/features/sign-in', () => ({
  SignInPage: () => {
    if (fault.render) throw new Error(marker)
    return (
      <main>
        <h1>Sign in to Aircastle</h1>
      </main>
    )
  },
}))

async function renderRoute(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  await router.load()
  const onCaughtError = vi.fn()
  render(
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>,
    { onCaughtError },
  )
  await screen.findByRole('heading', { name: 'Something went wrong' })
  expect(onCaughtError).toHaveBeenCalledWith(
    expect.objectContaining({ message: marker }),
    expect.anything(),
  )
  expect(screen.queryByText(marker)).toBeNull()
  expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
}

function preferDarkSystemTheme() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({ matches: query === '(prefers-color-scheme: dark)', media: query }) as MediaQueryList,
  )
}

const favicon = () => document.querySelector('link[rel="icon"]')?.getAttribute('href')

beforeEach(() => {
  const link = document.createElement('link')
  link.rel = 'icon'
  link.href = '/brand/favicon.svg'
  document.head.append(link)
})

afterEach(() => {
  fault.loader = false
  fault.render = false
  vi.restoreAllMocks()
  localStorage.clear()
  document.head.querySelector('link[rel="icon"]')?.remove()
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.style.removeProperty('color-scheme')
})

describe('Route failure escalation', () => {
  it('replaces the app with recovery when a page fails to render', async () => {
    fault.render = true
    await renderRoute('/sign-in')
    expect(screen.queryByRole('heading', { name: 'Sign in to Aircastle' })).toBeNull()
  })

  it('applies the saved theme when the root loader fails before the app renders', async () => {
    preferDarkSystemTheme()
    localStorage.setItem(themeStorageKey, 'light')
    fault.loader = true
    await renderRoute('/sign-in')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(favicon()).toBe('/brand/favicon-light.svg')
  })

  it('falls back to the system theme when storage is unavailable', async () => {
    preferDarkSystemTheme()
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError')
    })
    fault.loader = true
    await renderRoute('/sign-in')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(favicon()).toBe('/brand/favicon-dark.svg')
  })
})

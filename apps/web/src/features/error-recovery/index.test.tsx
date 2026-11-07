import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { AppErrorBoundary } from './index'

function Crashes({ value }: { value: unknown }): never {
  throw value
}

afterEach(() => {
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.style.removeProperty('color-scheme')
})

describe('Application error recovery', () => {
  it.each([new Error('private render details'), null, undefined])(
    'shows safe recovery for a thrown %s',
    (value) => {
      const onCaughtError = vi.fn()
      render(
        <AppErrorBoundary>
          <Crashes value={value} />
        </AppErrorBoundary>,
        { onCaughtError },
      )
      expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy()
      expect(screen.queryByText('private render details')).toBeNull()
      expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
      expect(onCaughtError).toHaveBeenCalled()
    },
  )
})

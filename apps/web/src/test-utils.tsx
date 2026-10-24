import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { createAppRouter } from './router'

export async function renderApp(path = '/dash') {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  await router.load()
  render(<RouterProvider router={router} />)
  await screen.findByRole('main')
  return { router, user: userEvent.setup() }
}

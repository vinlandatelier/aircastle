import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { createAppRouter } from './router'
import { AppErrorBoundary } from '@/features/error-recovery'
import './index.css'

const router = createAppRouter()

document
  .querySelectorAll('head > title, head > meta[name="description"]')
  .forEach((element) => element.remove())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>
  </StrictMode>,
)

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { SidebarMenuButton, SidebarProvider, SidebarTrigger } from './sidebar'

describe('Sidebar state', () => {
  it('toggles uncontrolled state while notifying an observer', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(
      <SidebarProvider onOpenChange={onOpenChange}>
        <SidebarTrigger />
      </SidebarProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Toggle Sidebar' })

    await user.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(onOpenChange).toHaveBeenLastCalledWith(false)

    await user.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
  })

  it('lets the controlled parent own the open state', async () => {
    function ControlledSidebar() {
      const [open, setOpen] = useState(true)
      return (
        <SidebarProvider open={open} onOpenChange={setOpen}>
          <SidebarTrigger />
        </SidebarProvider>
      )
    }
    const user = userEvent.setup()
    render(<ControlledSidebar />)
    const trigger = screen.getByRole('button', { name: 'Toggle Sidebar' })

    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await user.keyboard('{Control>}b{/Control}')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('starts collapsed when requested and toggles without an observer', async () => {
    const user = userEvent.setup()
    render(
      <SidebarProvider defaultOpen={false}>
        <SidebarTrigger />
      </SidebarProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Toggle Sidebar' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('shows menu tooltips only while the desktop sidebar is collapsed', async () => {
    const user = userEvent.setup()
    render(
      <SidebarProvider>
        <SidebarTrigger />
        <SidebarMenuButton tooltip="Tasks label">Tasks</SidebarMenuButton>
      </SidebarProvider>,
    )
    const item = screen.getByRole('button', { name: 'Tasks' })

    await user.hover(item)
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(screen.queryByText('Tasks label')).toBeNull()

    await user.unhover(item)
    await user.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))
    await user.hover(screen.getByRole('button', { name: 'Tasks' }))
    await waitFor(() => expect(screen.getByText('Tasks label')).toBeTruthy(), { timeout: 2000 })
  })
})

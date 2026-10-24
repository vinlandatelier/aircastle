import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vite-plus/test'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from './input-group'

describe('Input group focus', () => {
  it('focuses an input when its addon is clicked', async () => {
    const user = userEvent.setup()
    render(
      <InputGroup>
        <InputGroupAddon>Search</InputGroupAddon>
        <InputGroupInput aria-label="Query" />
      </InputGroup>,
    )

    await user.click(screen.getByText('Search'))

    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Query' }))
  })

  it('focuses a textarea when its addon is clicked', async () => {
    const user = userEvent.setup()
    render(
      <InputGroup>
        <InputGroupAddon>Message</InputGroupAddon>
        <InputGroupTextarea aria-label="Body" />
      </InputGroup>,
    )

    await user.click(screen.getByText('Message'))

    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Body' }))
  })

  it('preserves addon button actions and focus', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <InputGroup>
        <InputGroupInput aria-label="Query" />
        <InputGroupAddon>
          <InputGroupButton onClick={onClick}>Submit</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>,
    )

    const button = screen.getByRole('button', { name: 'Submit' })
    await user.click(button)

    expect(onClick).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(button)
  })
})

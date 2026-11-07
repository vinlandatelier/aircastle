import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'
import { Command, CommandInput, CommandItem, CommandList } from './command'

function renderCommand(values: string[]) {
  render(
    <Command label="Pages">
      <CommandInput aria-label="Pages" />
      <CommandList>
        {values.map((value) => (
          <CommandItem key={value} value={value}>
            {value}
          </CommandItem>
        ))}
      </CommandList>
    </Command>,
  )
}

const shownOptions = () =>
  within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((option) => option.textContent)

describe('Command filtering', () => {
  it('ranks substring matches above fuzzy matches and keeps ranking within each group', async () => {
    renderCommand(['Sxexxt', 'Unsettled', 'Settings', 'Analytics'])
    await userEvent.setup().type(screen.getByRole('combobox', { name: 'Pages' }), 'set')
    expect(shownOptions()).toEqual(['Settings', 'Unsettled', 'Sxexxt'])
  })
})

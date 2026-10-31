import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { displayHttp, expectNoShell, failure, mountAuth, ok, session } from './test-support'

const newest = {
  read: false,
  mail: {
    messageId: 'display-newest',
    date: '2030-01-01T00:01:00.000Z',
    from: 'Aircastle <no-reply@aircastle.test>',
    to: ['alex@example.test'],
    subject: 'Create your Aircastle account',
    text: 'Confirm your email to create your account.\nThis link expires in 5 minutes.\nhttp://localhost:3000/setup?token=display-token',
    html: '<p>Confirm your email to create your account.</p><p>This link expires in 5 minutes.</p><a href="http://localhost:3000/setup?token=display-token">Continue</a>',
  },
}
const oldest = {
  read: true,
  mail: {
    ...newest.mail,
    messageId: 'display-oldest',
    date: '2030-01-01T00:00:00.000Z',
    to: ['reader@example.test'],
    subject: 'Sign in to Aircastle',
    text: 'Use this link to sign in.\nThis link expires in 5 minutes.',
  },
}

describe('Development inbox display, without delivery or authentication proof', () => {
  it('[auth:R8] displays empty inbox and unselected reading pane without a protected shell', async () => {
    const http = displayHttp({ 'GET /api/development-inbox/messages': () => ok([]) })
    await mountAuth('/development-inbox', http)

    expect(await screen.findByRole('heading', { name: 'Development inbox' })).toBeTruthy()
    expect(screen.getByText('Messages stay here; no email is sent', { exact: true })).toBeTruthy()
    expect(screen.getByText('No messages yet', { exact: true })).toBeTruthy()
    expect(screen.getByText('Select a message', { exact: true })).toBeTruthy()
    expect(http.calls('/development-inbox/messages', 'GET').length).toBeGreaterThan(0)
    expectNoShell()
  })

  it('[auth:R8] orders messages newest first and exposes sender, subject, recipient, time, preview and read state', async () => {
    const http = displayHttp({ 'GET /api/development-inbox/messages': () => ok([oldest, newest]) })
    await mountAuth('/development-inbox', http)

    const latest = await screen.findByRole('button', { name: /alex@example.test/i })
    const earlier = screen.getByRole('button', { name: /reader@example.test/i })
    const buttons = screen
      .getAllByRole('button')
      .filter((button) => button === latest || button === earlier)
    expect(buttons).toEqual([latest, earlier])
    expect(latest.getAttribute('aria-label') ?? latest.textContent).toMatch(/unread/i)
    expect(earlier.getAttribute('aria-label') ?? earlier.textContent).toMatch(/\bread\b/i)
    expect(earlier.getAttribute('aria-label') ?? earlier.textContent).not.toMatch(/unread/i)
    expect(within(latest).getByText('Create your Aircastle account', { exact: true })).toBeTruthy()
    expect(latest.textContent).toContain('Aircastle')
    expect(latest.textContent).toContain('Confirm your email to create your account.')
    expect(latest.querySelector('time')?.getAttribute('datetime')).toBe(newest.mail.date)
    expect(screen.getByText('Select a message', { exact: true })).toBeTruthy()
  })

  it('[auth:R8] keyboard opening marks a message read and shows the actual complete email', async () => {
    let read = false
    const http = displayHttp({
      'GET /api/development-inbox/messages': () => ok([{ ...newest, read }]),
      'POST /api/development-inbox/messages/display-newest/open': () => {
        read = true
        return ok({ ...newest, read })
      },
    })
    const { user } = await mountAuth('/development-inbox', http)
    const item = await screen.findByRole('button', { name: /alex@example.test/i })
    item.focus()
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(http.calls('/development-inbox/messages/display-newest/open')).toHaveLength(1),
    )
    expect(await screen.findByRole('link', { name: 'Continue' })).toBeTruthy()
    for (const header of ['From', 'To', 'Subject', 'Date']) {
      expect(screen.getByText(header, { exact: true })).toBeTruthy()
    }
    expect(
      screen.getAllByText('Aircastle <no-reply@aircastle.test>', { exact: true }).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Confirm your email to create your account.', { exact: true }).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('This link expires in 5 minutes.', { exact: true })).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Continue' })
    expect(link.getAttribute('href')).toBe('http://localhost:3000/setup?token=display-token')
    expect([null, '_self']).toContain(link.getAttribute('target'))
    expect(screen.queryByText('Select a message', { exact: true })).toBeNull()
    await waitFor(() => {
      const current = screen.getByRole('button', { name: /alex@example.test/i })
      expect(current.getAttribute('aria-label') ?? current.textContent).toMatch(/\bread\b/i)
      expect(current.getAttribute('aria-label') ?? current.textContent).not.toMatch(/unread/i)
    })
    expect(http.calls('/auth/confirm')).toHaveLength(0)
  })

  it('[auth:R8] plain-text fallback keeps user-entered HTML literal', async () => {
    const unsafeText = '<img src=x onerror="document.title=\'unsafe-display\'">'
    const { html: _html, ...mail } = newest.mail
    const entry = { read: false, mail: { ...mail, text: unsafeText } }
    const http = displayHttp({
      'GET /api/development-inbox/messages': () => ok([entry]),
      'POST /api/development-inbox/messages/display-newest/open': () =>
        ok({ ...entry, read: true }),
    })
    const { user } = await mountAuth('/development-inbox', http)
    await user.click(await screen.findByRole('button', { name: /alex@example.test/i }))

    expect((await screen.findAllByText(unsafeText, { exact: true })).length).toBeGreaterThan(0)
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(document.title).not.toBe('unsafe-display')
  })

  it('[auth:R8] offers no search, sidebar, compose, delete, clear or other mail-client actions', async () => {
    const http = displayHttp({ 'GET /api/development-inbox/messages': () => ok([newest]) })
    await mountAuth('/development-inbox', http)

    expect(await screen.findByRole('heading', { name: 'Development inbox' })).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: /search|sidebar|compose|delete|clear|archive|reply|forward|mark.*unread/i,
      }),
    ).toBeNull()
    expect(
      screen.queryByRole('link', { name: /compose|delete|clear|archive|reply|forward/i }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: /passkey|password|authenticator|enroll/i }),
    ).toBeNull()
  })

  it('[auth:R8] failed listing offers Retry and then displays a successful empty result', async () => {
    let reads = 0
    const http = displayHttp({
      'GET /api/development-inbox/messages': () => {
        reads += 1
        return reads === 1 ? failure('temporary-failure') : ok([])
      },
    })
    const { user } = await mountAuth('/development-inbox', http)

    expect(
      await screen.findByText('Could not load messages. Try again.', { exact: true }),
    ).toBeTruthy()
    expect(screen.queryByText('No messages yet', { exact: true })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No messages yet', { exact: true })).toBeTruthy()
    expect(screen.queryByText('Could not load messages. Try again.', { exact: true })).toBeNull()
    expect(http.calls('/development-inbox/messages', 'GET')).toHaveLength(2)
  })

  it('[auth:R8] failed opening reports an error and retries the same selected message', async () => {
    let opens = 0
    const http = displayHttp({
      'GET /api/development-inbox/messages': () => ok([newest]),
      'POST /api/development-inbox/messages/display-newest/open': () => {
        opens += 1
        return opens === 1 ? failure('temporary-failure') : ok({ ...newest, read: true })
      },
    })
    const { user } = await mountAuth('/development-inbox', http)
    await user.click(await screen.findByRole('button', { name: /alex@example.test/i }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/could not|try again/i)
    expect(screen.queryByRole('link', { name: 'Continue' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: 'Continue' })).toBeTruthy()
    expect(http.calls('/development-inbox/messages/display-newest/open')).toHaveLength(2)
  })

  it('[auth:R7] [auth:R8] automatic inbox arrivals do not send foreground activity requests', async () => {
    let reads = 0
    const http = displayHttp({
      'GET /api/auth/state': () => ok({ kind: 'authenticated', session }),
      'GET /api/auth/session': () => ok(session),
      'POST /api/auth/activity': () => ok(session),
      'GET /api/development-inbox/messages': () => {
        reads += 1
        return ok(reads === 1 ? [] : [newest])
      },
    })
    await mountAuth('/development-inbox', http)
    expect(await screen.findByText('No messages yet', { exact: true })).toBeTruthy()
    const initialActivity = http.calls('/auth/activity').length

    expect(
      await screen.findByRole('button', { name: /alex@example.test/i }, { timeout: 10_000 }),
    ).toBeTruthy()
    expect(http.calls('/development-inbox/messages', 'GET').length).toBeGreaterThanOrEqual(2)
    expect(http.calls('/auth/activity')).toHaveLength(initialActivity)
    expect(screen.getByText('Select a message', { exact: true })).toBeTruthy()
  }, 15_000)
})

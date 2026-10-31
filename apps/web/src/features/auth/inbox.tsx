import { createElement, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from './context'

interface InboxMessage {
  read: boolean
  mail: {
    messageId: string
    date: string
    from: string
    to: string[]
    subject: string
    text: string
    html?: string
  }
}

type Messages =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; messages: InboxMessage[] }
type Reading =
  | { kind: 'none' }
  | { kind: 'loading'; id: string }
  | { kind: 'failed'; id: string }
  | { kind: 'ready'; message: InboxMessage }

function safeMailHtml(html: string): ReactNode {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const allowed = new Set([
    'p',
    'br',
    'a',
    'strong',
    'em',
    'b',
    'i',
    'span',
    'div',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'blockquote',
    'table',
    'tbody',
    'tr',
    'td',
    'th',
  ])
  function render(node: Node, key: number): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent
    if (!(node instanceof Element)) return null
    const tag = node.tagName.toLowerCase()
    if (
      [
        'script',
        'style',
        'iframe',
        'object',
        'embed',
        'svg',
        'math',
        'form',
        'input',
        'button',
      ].includes(tag)
    )
      return null
    const children = Array.from(node.childNodes).map(render)
    if (!allowed.has(tag)) return children
    if (tag === 'br') return createElement('br', { key })
    const href = node.getAttribute('href')
    if (tag === 'a') {
      let safe: string | undefined
      if (href) {
        try {
          const url = new URL(href, window.location.href)
          if (url.protocol === 'http:' || url.protocol === 'https:') safe = url.href
        } catch (error) {
          if (!(error instanceof TypeError)) throw error
          safe = undefined
        }
      }
      return createElement(
        'a',
        { key, href: safe, rel: 'noreferrer', className: 'underline underline-offset-4' },
        children,
      )
    }
    return createElement(tag, { key }, children)
  }
  return Array.from(document.body.childNodes).map(render)
}

export function DevelopmentInbox() {
  const { auth } = useAuth()
  const [listing, setListing] = useState<Messages>({ kind: 'loading' })
  const [reading, setReading] = useState<Reading>({ kind: 'none' })
  const openSequence = useRef(0)
  const list = useCallback(async () => {
    const result = await auth.request<InboxMessage[]>('/development-inbox/messages')
    setListing(
      result.kind === 'ok'
        ? {
            kind: 'ready',
            messages: result.value.toSorted(
              (a, b) => Date.parse(b.mail.date) - Date.parse(a.mail.date),
            ),
          }
        : { kind: 'failed' },
    )
  }, [auth])
  useEffect(() => {
    let active = true
    let timer: number
    async function poll() {
      if (!active) return
      await list()
      if (active) timer = window.setTimeout(poll, 2000)
    }
    void poll()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [list])
  async function open(id: string) {
    const sequence = ++openSequence.current
    setReading({ kind: 'loading', id })
    const result = await auth.request<InboxMessage>(
      `/development-inbox/messages/${encodeURIComponent(id)}/open`,
      {},
    )
    if (sequence !== openSequence.current) return
    if (result.kind !== 'ok') {
      setReading({ kind: 'failed', id })
      return
    }
    setReading({ kind: 'ready', message: result.value })
    setListing((current) =>
      current.kind !== 'ready'
        ? current
        : {
            kind: 'ready',
            messages: current.messages.map((item) =>
              item.mail.messageId === id ? result.value : item,
            ),
          },
    )
  }
  return (
    <main
      data-theme-scope="marketing"
      className="mx-auto flex min-h-svh max-w-6xl flex-col gap-6 p-6 md:p-10"
    >
      <header className="space-y-2">
        <a href="/" aria-label="Aircastle">
          <span aria-hidden="true" className="brand-logo mb-6 block size-7" />
        </a>
        <h1 className="text-2xl font-semibold">Development inbox</h1>
        <p className="text-muted-foreground">Messages stay here; no email is sent</p>
      </header>
      <div className="grid min-h-96 overflow-hidden rounded-xl border md:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
        <section aria-label="Messages" className="border-b md:border-r md:border-b-0">
          {listing.kind === 'loading' && (
            <p role="status" className="p-5">
              Loading messages…
            </p>
          )}
          {listing.kind === 'failed' && (
            <div className="space-y-3 p-5">
              <p role="alert">Could not load messages. Try again.</p>
              <Button onClick={() => void list()}>Retry</Button>
            </div>
          )}
          {listing.kind === 'ready' &&
            (listing.messages.length === 0 ? (
              <p className="p-5 text-muted-foreground">No messages yet</p>
            ) : (
              listing.messages.map(({ mail, read }) => (
                <button
                  type="button"
                  key={mail.messageId}
                  aria-label={`${read ? 'Read' : 'Unread'} ${mail.to.join(', ')} ${mail.subject}`}
                  aria-pressed={
                    reading.kind === 'ready' && reading.message.mail.messageId === mail.messageId
                  }
                  className="flex w-full min-w-0 flex-col gap-1 border-b p-5 text-left break-words hover:bg-muted/50 aria-pressed:bg-muted"
                  onClick={() => void open(mail.messageId)}
                >
                  <span className="text-xs text-muted-foreground">{mail.from}</span>
                  <span className={read ? 'font-normal' : 'font-semibold'}>{mail.subject}</span>
                  <span className="text-sm">{mail.to.join(', ')}</span>
                  <time className="text-xs text-muted-foreground" dateTime={mail.date}>
                    {new Date(mail.date).toLocaleString()}
                  </time>
                  <span className="line-clamp-2 text-sm text-muted-foreground">
                    {mail.text.split('\n')[0]}
                  </span>
                </button>
              ))
            ))}
        </section>
        <section aria-label="Reading pane" className="min-w-0 p-6 break-words">
          {reading.kind === 'none' && <p className="text-muted-foreground">Select a message</p>}
          {reading.kind === 'loading' && <p role="status">Loading message…</p>}
          {reading.kind === 'failed' && (
            <div className="space-y-3">
              <p role="alert">Could not open this message. Try again.</p>
              <Button onClick={() => void open(reading.id)}>Retry</Button>
            </div>
          )}
          {reading.kind === 'ready' && (
            <>
              <dl className="mb-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-b pb-6 text-sm">
                <dt>From</dt>
                <dd>{reading.message.mail.from}</dd>
                <dt>To</dt>
                <dd>{reading.message.mail.to.join(', ')}</dd>
                <dt>Subject</dt>
                <dd>{reading.message.mail.subject}</dd>
                <dt>Date</dt>
                <dd>{new Date(reading.message.mail.date).toLocaleString()}</dd>
              </dl>
              <div className="space-y-4 leading-relaxed">
                {reading.message.mail.html ? (
                  safeMailHtml(reading.message.mail.html)
                ) : (
                  <p className="whitespace-pre-wrap">{reading.message.mail.text}</p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

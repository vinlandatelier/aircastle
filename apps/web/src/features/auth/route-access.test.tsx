import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { createMemoryHistory } from '@tanstack/react-router'
import { createAppRouter } from '@/router'
import { displayHttp, failure, mountAuth, ok, session } from './test-support'

const workspace = '11111111-1111-4111-8111-111111111111'
const project = '22222222-2222-4222-8222-222222222222'
const projects = `/dash/workspaces/${workspace}/projects`
const page = `${projects}/${project}/collections`

let observer: MutationObserver | undefined
const seen = { headings: new Set<string>(), shell: false }

beforeEach(() => {
  seen.headings.clear()
  seen.shell = false
  observer = new MutationObserver(() => {
    for (const heading of document.querySelectorAll('h1'))
      seen.headings.add(heading.textContent ?? '')
    if (document.querySelector('[aria-label="Main navigation"]')) seen.shell = true
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
})

afterEach(() => observer?.disconnect())

function http(state: 'authenticated' | 'signed-out', access: 'member' | 'outsider') {
  return displayHttp({
    'GET /api/auth/state': () =>
      ok(state === 'authenticated' ? { kind: 'authenticated', session } : { kind: 'signed-out' }),
    'GET /api/auth/session': () => ok(session),
    'POST /api/auth/activity': () => ok(session),
    'POST /api/auth/entry': async (request) => {
      const body = await request.json()
      if (body.kind === 'visit' && body.destination.kind !== 'workspaces' && access === 'outsider')
        return failure('forbidden', 403)
      return ok({
        destination: body.kind === 'visit' ? body.destination : { kind: 'workspaces' },
        session,
      })
    },
  })
}

const projectVariants = [
  `${projects}/`,
  `/dash/workspaces/${workspace}/PROJECTS`,
  `/DASH/workspaces/${workspace}/projects`,
  '/dash/workspaces/not-a-uuid/projects',
]
const pageVariants = [
  `/Dash/workspaces/${workspace}/projects/${project}/collections`,
  `${projects}/${project}/tasks/`,
  `/dash/workspaces/not-a-uuid/projects/${project}/collections`,
]

describe('Route access through the real router', () => {
  it('declares access on every route', () => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }))
    const undeclared = Object.values(router.routesById)
      .filter((route) => !route.isRoot && route.options.staticData?.access === undefined)
      .map((route) => route.id)
    expect(undeclared).toEqual([])
  })

  it.each([...projectVariants, ...pageVariants, '/DASH/workspaces/new'])(
    'sends a signed-out visit to %s to sign-in without mounting it',
    async (path) => {
      const { router } = await mountAuth(path, http('signed-out', 'member'))

      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
      expect(router.state.location.pathname).toBe('/sign-in')
      expect([...seen.headings]).not.toContain('Projects')
      expect(seen.shell).toBe(false)
    },
  )

  it.each(projectVariants)(
    'denies a signed-in outsider at %s before the projects page mounts',
    async (path) => {
      const { router } = await mountAuth(path, http('authenticated', 'outsider'))

      expect(await screen.findByRole('heading', { name: 'Workspaces' })).toBeTruthy()
      expect(router.state.location.pathname).toBe('/dash/workspaces')
      expect([...seen.headings]).not.toContain('Projects')
    },
  )

  it.each(pageVariants)(
    'denies a signed-in outsider at %s before the project shell mounts',
    async (path) => {
      const { router } = await mountAuth(path, http('authenticated', 'outsider'))

      expect(await screen.findByRole('heading', { name: 'Workspaces' })).toBeTruthy()
      expect(router.state.location.pathname).toBe('/dash/workspaces')
      expect(seen.shell).toBe(false)
    },
  )

  it.each([
    [projects, () => screen.findByRole('heading', { name: 'Projects' }), false],
    [page, () => screen.findByRole('navigation', { name: 'Main navigation' }), true],
  ] as const)('renders the canonical authorized path %s', async (path, rendered, shell) => {
    const { router } = await mountAuth(path, http('authenticated', 'member'))

    expect(await rendered()).toBeTruthy()
    expect(router.state.location.pathname).toBe(path)
    expect(seen.shell).toBe(shell)
  })

  it('asks the server about lower-case ids whatever the path casing', async () => {
    const fake = http('authenticated', 'member')
    await mountAuth('/dash/workspaces/aBcDeF12-3456-4789-8AbC-dEf123456789/projects', fake)

    await waitFor(() => expect(fake.calls('/auth/entry')).toHaveLength(1))
    expect(await fake.calls('/auth/entry')[0]!.json()).toEqual({
      kind: 'visit',
      destination: {
        kind: 'workspace-projects',
        workspaceId: 'abcdef12-3456-4789-8abc-def123456789',
      },
    })
  })

  it.each([
    '/dash/workspaces/not-a-uuid/projects',
    `/dash/workspaces/${workspace}/projects/not-a-uuid/collections`,
  ])('denies the non-UUID id in %s before asking the server', async (path) => {
    const fake = http('authenticated', 'member')
    const { router } = await mountAuth(path, fake)

    expect(await screen.findByRole('heading', { name: 'Workspaces' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/dash/workspaces')
    const bodies = await Promise.all(fake.calls('/auth/entry').map((request) => request.text()))
    expect(bodies.filter((body) => body.includes('not-a-uuid'))).toEqual([])
    expect([...seen.headings]).not.toContain('Projects')
    expect(seen.shell).toBe(false)
  })
})

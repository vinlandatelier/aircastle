import type { Plugin } from 'vite-plus'

export function fixtureBuild(): Plugin {
  return {
    name: 'verification-data',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/features/sign-in/index.tsx')) {
        const anchor = 'export function SignInPage() {'
        if (!code.includes(anchor)) throw new Error('Sign-in error fixture anchor missing')
        return code.replace(
          anchor,
          `const verificationRenderFailure = new URLSearchParams(location.search).get('scenario') === 'error-render' && !sessionStorage.getItem('verification-render-failed');\nif (verificationRenderFailure) sessionStorage.setItem('verification-render-failed', '1');\n${anchor}\nif (verificationRenderFailure) throw new Error('Aircastle verification render failure: private details');`,
        )
      }
      if (id.endsWith('/src/router.tsx')) {
        const anchor = 'const rootRoute = createRootRoute({'
        if (!code.includes(anchor)) throw new Error('Route error fixture anchor missing')
        return code.replace(
          anchor,
          `${anchor}\nloader: () => { if (new URLSearchParams(location.search).get('scenario') === 'error-loader' && !sessionStorage.getItem('verification-loader-failed')) { sessionStorage.setItem('verification-loader-failed', '1'); throw new Error('Aircastle verification loader failure: private details'); } },`,
        )
      }
      if (id.endsWith('/src/components/shell/data.ts')) {
        return `import { shellData } from ${JSON.stringify(new URL('./fixtures.ts', import.meta.url).pathname)}; export const { initialProject, projects, user } = shellData(new URLSearchParams(location.search).get('scenario'));`
      }
      if (id.endsWith('/src/features/navigation/pages.ts')) {
        return `import { navigationTitle } from ${JSON.stringify(new URL('./fixtures.ts', import.meta.url).pathname)};\n${code.replace('export const navigationGroups', 'const defaultGroups')}\nexport const navigationGroups = defaultGroups.map(group => ({...group, items: group.items.map(item => ({...item, title: navigationTitle(new URLSearchParams(location.search).get('scenario'), item.path, item.title)}))}));`
      }
    },
  }
}

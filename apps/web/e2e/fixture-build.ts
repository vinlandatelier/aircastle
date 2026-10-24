import type { Plugin } from 'vite-plus'

export function fixtureBuild(): Plugin {
  return {
    name: 'verification-data',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/components/shell/data.ts')) {
        return `import { shellData } from ${JSON.stringify(new URL('./fixtures.ts', import.meta.url).pathname)}; export const { initialProject, projects, user } = shellData(new URLSearchParams(location.search).get('scenario'));`
      }
      if (id.endsWith('/src/features/navigation/pages.ts')) {
        return `import { navigationTitle } from ${JSON.stringify(new URL('./fixtures.ts', import.meta.url).pathname)};\n${code.replace('export const navigationGroups', 'const defaultGroups')}\nexport const navigationGroups = defaultGroups.map(group => ({...group, items: group.items.map(item => ({...item, title: navigationTitle(new URLSearchParams(location.search).get('scenario'), item.path, item.title)}))}));`
      }
    },
  }
}

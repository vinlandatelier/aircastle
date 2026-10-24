export const scenarios = [
  'normal',
  'long-text',
  'unicode',
  'many-projects',
  'empty-candidates',
  'long-navigation',
] as const
export type Scenario = (typeof scenarios)[number]

const defaultProject = { workspace: 'Acme Inc', plan: 'Free', name: 'Technical Blog' }
const defaultUser = { name: 'Shaban Haider', email: 'shaban@efferd.com' }

export function shellData(scenario: string | null) {
  const initialProject = defaultProject
  let projects = [initialProject, { ...initialProject, name: 'Marketing Site' }]
  let user = defaultUser
  if (scenario === 'long-text') {
    projects = [
      initialProject,
      { workspace: 'W'.repeat(1000), plan: 'Free', name: 'W'.repeat(1000) },
      { ...initialProject, name: 'Long project name '.repeat(60) },
    ]
    user = { name: 'Long account name '.repeat(60), email: `${'w'.repeat(1000)}@example.com` }
  }
  if (scenario === 'unicode') {
    projects = [
      initialProject,
      ...['東京のプロジェクト 🚀', 'مشروع الاختبار', 'Café'].map((name) => ({
        ...initialProject,
        name,
      })),
    ]
  }
  if (scenario === 'many-projects') {
    projects = [
      initialProject,
      ...Array.from({ length: 100 }, (_, index) => ({
        ...initialProject,
        name: `Project ${String(index + 1).padStart(3, '0')}`,
      })),
    ]
  }
  if (scenario === 'empty-candidates') projects = [initialProject]
  return { initialProject, projects, user }
}

export function navigationTitle(scenario: string | null, path: string, title: string) {
  if (scenario !== 'long-navigation') return title
  if (path === '/dash/tasks') return 'W'.repeat(1000)
  if (path === '/dash/users') return '東京のプロジェクト 🚀'
  return title
}

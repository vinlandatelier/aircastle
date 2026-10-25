import { navigationGroups as defaultGroups } from '../../src/features/navigation/pages'
import { navigationTitle } from '../fixtures'

const scenario = new URLSearchParams(location.search).get('scenario')

export const navigationGroups = defaultGroups.map((group) => ({
  ...group,
  items: group.items.map((item) => ({
    ...item,
    title: navigationTitle(scenario, item.path, item.title),
  })),
}))

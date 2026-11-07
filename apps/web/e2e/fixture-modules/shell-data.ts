import { shellData } from '../fixtures'

export const { initialProject, projects, user } = shellData(
  new URLSearchParams(location.search).get('scenario'),
)

/** An agent in the preview, with the role shown beside its name and the colour of its outline on the fields it works on. */
export type DemoAgent = {
  name: string
  role: string
  colour: string
  palette: readonly string[]
}

/** The agent that takes requests and hands work to the others. */
export const orchestrator: DemoAgent = {
  name: 'Air',
  role: 'Orchestrator',
  colour: 'rgb(82 82 91)',
  palette: ['#18181b', '#3f3f46', '#71717a', '#d4d4d8', '#fafafa'],
}

export const thorfinn: DemoAgent = {
  name: 'Thorfinn',
  role: 'Writing Agent',
  colour: 'rgb(139 92 246)',
  palette: ['#2e1065', '#6d28d9', '#a78bfa', '#ede9fe', '#f0abfc'],
}
export const canute: DemoAgent = {
  name: 'Canute',
  role: 'Research Agent',
  colour: 'rgb(217 119 6)',
  palette: ['#451a03', '#b45309', '#fbbf24', '#fef3c7', '#fdba74'],
}
export const askeladd: DemoAgent = {
  name: 'Askeladd',
  role: 'SEO Agent',
  colour: 'rgb(5 150 105)',
  palette: ['#022c22', '#047857', '#34d399', '#d1fae5', '#bef264'],
}
export const thorkell: DemoAgent = {
  name: 'Thorkell',
  role: 'Review Agent',
  colour: 'rgb(225 29 72)',
  palette: ['#4c0519', '#be123c', '#fb7185', '#ffe4e6', '#fda4af'],
}
export const einar: DemoAgent = {
  name: 'Einar',
  role: 'Design Agent',
  colour: 'rgb(2 132 199)',
  palette: ['#082f49', '#0369a1', '#38bdf8', '#e0f2fe', '#67e8f9'],
}

/** The agents working on "Introducing Acme MCP", in the order they are named. */
export const workingAgents: readonly DemoAgent[] = [thorfinn, canute, askeladd, thorkell, einar]

/** Every agent in the preview, orchestrator first. */
const allAgents: readonly DemoAgent[] = [orchestrator, ...workingAgents]

/** The agent with this name, if there is one. */
export function agentNamed(name: string) {
  return allAgents.find((agent) => agent.name === name)
}

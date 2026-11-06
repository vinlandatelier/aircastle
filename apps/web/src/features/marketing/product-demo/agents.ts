/** An agent in the preview, with the role shown beside its name and the colour of its outline on the fields it works on. */
export type DemoAgent = { name: string; role: string; colour: string }

/** The agent that takes requests and hands work to the others. */
export const orchestrator: DemoAgent = {
  name: 'Air',
  role: 'Orchestrator',
  colour: 'rgb(82 82 91)',
}

export const thorfinn: DemoAgent = {
  name: 'Thorfinn',
  role: 'Writing Agent',
  colour: 'rgb(139 92 246)',
}
export const canute: DemoAgent = {
  name: 'Canute',
  role: 'Research Agent',
  colour: 'rgb(217 119 6)',
}
export const askeladd: DemoAgent = { name: 'Askeladd', role: 'SEO Agent', colour: 'rgb(5 150 105)' }
export const thorkell: DemoAgent = {
  name: 'Thorkell',
  role: 'Review Agent',
  colour: 'rgb(225 29 72)',
}
export const einar: DemoAgent = { name: 'Einar', role: 'Design Agent', colour: 'rgb(2 132 199)' }

/** The agents working on "Introducing Acme MCP", in the order they are named. */
export const workingAgents: readonly DemoAgent[] = [thorfinn, canute, askeladd, thorkell, einar]

/** Every agent in the preview, orchestrator first. */
export const allAgents: readonly DemoAgent[] = [orchestrator, ...workingAgents]

/** The agent with this name, if there is one. */
export function agentNamed(name: string) {
  return allAgents.find((agent) => agent.name === name)
}

/** An agent in the preview, with the role shown beside its name. */
export type DemoAgent = { name: string; role: string }

/** The agent that takes requests and hands work to the others. */
export const orchestrator: DemoAgent = { name: 'Air', role: 'Orchestrator' }

export const thorfinn: DemoAgent = { name: 'Thorfinn', role: 'Writing Agent' }
export const canute: DemoAgent = { name: 'Canute', role: 'Research Agent' }
export const askeladd: DemoAgent = { name: 'Askeladd', role: 'SEO Agent' }
export const bjorn: DemoAgent = { name: 'Bjorn', role: 'Review Agent' }

/** The agents working on "Introducing Acme MCP", in the order they are named. */
export const workingAgents: readonly DemoAgent[] = [thorfinn, canute, askeladd, bjorn]

/** Every agent in the preview, orchestrator first. */
export const allAgents: readonly DemoAgent[] = [orchestrator, ...workingAgents]

/** The agent with this name, if there is one. */
export function agentNamed(name: string) {
  return allAgents.find((agent) => agent.name === name)
}

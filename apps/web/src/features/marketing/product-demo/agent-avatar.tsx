import { GeneratedAvatar } from '@/components/shell'
import type { DemoAgent } from './agents'

/** An agent's generated avatar, drawn from that agent's own palette so no two agents look alike. */
export function AgentAvatar({ agent, size }: { agent: DemoAgent; size: number }) {
  return <GeneratedAvatar name={agent.name} size={size} variant="beam" colors={agent.palette} />
}

import { cn } from 'cn'
import { AgentAvatar } from './agent-avatar'
import { agentNamed, orchestrator, type DemoAgent } from './agents'

/** An inline reference to an agent, shown as a pill with its avatar. */
function AgentMention({ agent, className }: { agent: DemoAgent; className?: string }) {
  return (
    <span
      data-demo-mention
      className={cn(
        'ml-0.5 inline-flex items-center gap-1 rounded-md border bg-background px-1 align-[-3px] text-[0.95em] leading-[1.35] dark:bg-input/30',
        className,
      )}
    >
      {agent === orchestrator ? (
        <span className="air-mascot inline-block size-3.5 shrink-0" />
      ) : (
        <AgentAvatar agent={agent} size={14} />
      )}
      {agent.name}
    </span>
  )
}

const mentionPattern = /@([A-Z][a-z]+)/g

/** Text where each `@Name` of a known agent becomes an {@link AgentMention}. */
export function MentionText({ text }: { text: string }) {
  const parts = text.split(mentionPattern)
  return parts.map((part, index) => {
    const agent = index % 2 === 1 ? agentNamed(part) : undefined
    if (agent) return <AgentMention key={index} agent={agent} />
    return index % 2 === 1 ? `@${part}` : part
  })
}

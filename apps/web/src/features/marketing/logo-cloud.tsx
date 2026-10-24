import { useState } from 'react'
import { cn } from 'cn'
import { useReducedMotion } from 'motion/react'
import { PauseIcon, PlayIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InfiniteSlider } from './infinite-slider'

const technologies = [
  { name: 'TypeScript', icon: 'typescript' },
  { name: 'React', icon: 'react' },
  { name: 'PostgreSQL', icon: 'postgresql' },
  { name: 'Bun', icon: 'bun' },
]

export function LogoCloud() {
  const reduceMotion = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const logos = technologies.map(({ name, icon }) => (
    <div
      key={icon}
      className={cn(
        'flex shrink-0 items-center justify-center gap-3',
        !reduceMotion && !paused && 'min-w-48',
      )}
    >
      <span
        aria-hidden="true"
        className="size-6 shrink-0 bg-current mask-contain mask-center mask-no-repeat"
        style={{ maskImage: `url(/brand/stack/${icon}.svg)` }}
      />
      <span className="text-lg font-medium tracking-tight">{name}</span>
    </div>
  ))

  return (
    <section
      id="stack"
      className="relative mx-auto flex w-full max-w-5xl scroll-mt-20 flex-col gap-5 border-t px-6 pt-8 pb-12"
    >
      <h2 className="text-center text-lg font-medium tracking-tight text-muted-foreground md:text-xl">
        Built on an open stack
      </h2>
      {reduceMotion || paused ? (
        <div className="flex flex-wrap items-center justify-center gap-8 py-4">{logos}</div>
      ) : (
        <>
          <p className="sr-only">TypeScript, React, PostgreSQL and Bun</p>
          <div
            aria-hidden="true"
            className="mask-[linear-gradient(to_right,transparent,black_15%,black_85%,transparent)] overflow-hidden py-4"
          >
            <InfiniteSlider gap={64} reverse speed={30} speedOnHover={15}>
              {logos}
            </InfiniteSlider>
          </div>
        </>
      )}
      {!reduceMotion && (
        <Button
          variant="ghost"
          size="sm"
          className="self-center"
          onClick={() => setPaused(!paused)}
          aria-label={paused ? 'Play animation' : 'Pause animation'}
        >
          {paused ? <PlayIcon data-icon="inline-start" /> : <PauseIcon data-icon="inline-start" />}
          {paused ? 'Play' : 'Pause'}
        </Button>
      )}
    </section>
  )
}

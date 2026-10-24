import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { PauseIcon, PlayIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function MeshBackground() {
  const video = useRef<HTMLVideoElement>(null)
  const reducedMotion = useReducedMotion()
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const element = video.current
    if (!element) return
    if (reducedMotion !== false || paused) {
      element.pause()
      return
    }
    void element.play().catch(() => undefined)
    return () => element.pause()
  }, [paused, reducedMotion])

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-background"
      >
        <video
          ref={video}
          src="/brand/hero/mesh.mp4"
          poster="/brand/hero/mesh.png"
          preload="none"
          muted
          loop
          playsInline
          className="size-full object-cover"
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_10%,var(--background)_100%)] opacity-45" />
      </div>
      {reducedMotion === false && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-6 bottom-12 rounded-full sm:right-10"
          aria-label={paused ? 'Play background animation' : 'Pause background animation'}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </Button>
      )}
    </>
  )
}

import { useEffect, useRef, useState } from 'react'

const box = { left: 10, top: 17, width: 61, height: 52 }
const eyes = [
  { cx: 34, cy: 45 },
  { cx: 48, cy: 45 },
] as const
const eye = { rx: 3.4, ry: 4.8 }
const reach = { x: 1.6, y: 1.2 }
const fullReachAt = 240

/** Air's cloud, sized to the surrounding text, glancing toward the pointer. */
export function AirWatcher({ eyeColour }: { eyeColour: string }) {
  const mascot = useRef<HTMLDivElement>(null)
  const [look, setLook] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const follow = (event: PointerEvent) => {
      const element = mascot.current
      if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const rect = element.getBoundingClientRect()
      const dx = event.clientX - (rect.left + rect.width / 2)
      const dy = event.clientY - (rect.top + rect.height / 2)
      const distance = Math.hypot(dx, dy) || 1
      const strength = Math.min(1, distance / fullReachAt)
      setLook({ x: (dx / distance) * strength * reach.x, y: (dy / distance) * strength * reach.y })
    }
    window.addEventListener('pointermove', follow)
    return () => window.removeEventListener('pointermove', follow)
  }, [])

  return (
    <div
      ref={mascot}
      data-sign-in-air
      className="relative inline-block aspect-[61/52] h-[0.9em] shrink-0"
    >
      <div className="absolute inset-0 bg-white [mask:url(/brand/air-body.svg)_center/contain_no-repeat]" />
      {eyes.map(({ cx, cy }) => (
        <span
          key={cx}
          data-air-eye
          className="absolute rounded-[50%] transition-[translate] duration-150 ease-out"
          style={{
            backgroundColor: eyeColour,
            left: `${((cx - eye.rx - box.left) / box.width) * 100}%`,
            top: `${((cy - eye.ry - box.top) / box.height) * 100}%`,
            width: `${((eye.rx * 2) / box.width) * 100}%`,
            height: `${((eye.ry * 2) / box.height) * 100}%`,
            translate: `${(look.x / (eye.rx * 2)) * 100}% ${(look.y / (eye.ry * 2)) * 100}%`,
          }}
        />
      ))}
    </div>
  )
}

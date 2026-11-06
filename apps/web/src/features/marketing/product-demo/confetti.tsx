import { workingAgents } from './agents'
import type { PublishedEntry } from './site-ask'

const origins = {
  post: { left: 882, top: 117 },
  docs: { left: 1221, top: 117 },
} as const satisfies Record<PublishedEntry, { left: number; top: number }>
const drag = 0.0022
const gravity = 0.0016
const fadeAfter = 1400
const fadeDuration = 600

function random(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

const colours = [...workingAgents.map((agent) => agent.colour), 'rgb(250 204 21)']

const pieces = Array.from({ length: 64 }, (_, index) => {
  const angle = ((-90 + (random(index + 1) - 0.5) * 170) * Math.PI) / 180
  const speed = 0.35 + random(index + 101) * 0.75
  return {
    velocityX: Math.cos(angle) * speed,
    velocityY: Math.sin(angle) * speed,
    spin: (random(index + 201) - 0.5) * 1.6,
    flutter: 0.006 + random(index + 301) * 0.012,
    width: 5 + random(index + 401) * 4,
    height: index % 4 === 0 ? 6 : 9 + random(index + 501) * 5,
    round: index % 4 === 0,
    colour: colours[index % colours.length],
  }
})

/** A burst of confetti from the entry's Publish button, placed from the milliseconds since the click. */
export function Confetti({ elapsed, entry }: { elapsed: number; entry: PublishedEntry }) {
  const origin = origins[entry]
  const travelled = (1 - Math.exp(-drag * elapsed)) / drag
  const fall = (gravity * elapsed * elapsed) / 2
  const opacity = Math.max(0, Math.min(1, 1 - (elapsed - fadeAfter) / fadeDuration))
  return (
    <div data-demo-confetti className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {pieces.map((piece, index) => (
        <span
          key={index}
          data-demo-confetti-piece
          className={piece.round ? 'absolute rounded-full' : 'absolute rounded-[1px]'}
          style={{
            left: origin.left,
            top: origin.top,
            width: piece.width,
            height: piece.height,
            opacity,
            backgroundColor: piece.colour,
            transform: `translate(${piece.velocityX * travelled}px, ${
              piece.velocityY * travelled + fall
            }px) rotate(${piece.spin * elapsed}deg) scaleY(${Math.cos(piece.flutter * elapsed)})`,
          }}
        />
      ))}
    </div>
  )
}

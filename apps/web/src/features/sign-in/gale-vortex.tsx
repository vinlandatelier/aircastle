import type { CSSProperties } from 'react'
import styles from './gale-vortex.module.css'

const ringCount = 14
const arms = 5
const sweep = 64

function armPath(radius: number, startAngle: number) {
  const points = Array.from({ length: 13 }, (_, index) => {
    const t = index / 12
    const angle = ((startAngle + t * sweep) * Math.PI) / 180
    const distance = radius * (1 + 0.32 * t)
    return `${(Math.cos(angle) * distance).toFixed(2)} ${(Math.sin(angle) * distance).toFixed(2)}`
  })
  return `M${points.join('L')}`
}

const rings = Array.from({ length: ringCount }, (_, index) => {
  const radius = 9 + index * 5.6
  return {
    id: index,
    arms: Array.from({ length: arms }, (_, arm) => armPath(radius, arm * (360 / arms) + index * 9)),
    style: {
      opacity: 0.42 - index * 0.024,
      animationDuration: `${36 + index * 9}s`,
    } as CSSProperties,
  }
})

/** The sign-in panel's decoration: rings of Gale's comma arms turning counter-clockwise like a slow vortex. */
export function GaleVortex() {
  return (
    <div aria-hidden="true" data-sign-in-vortex className={styles.art}>
      <svg viewBox="-100 -100 200 200" className={styles.field}>
        {rings.map((ring) => (
          <g key={ring.id} data-vortex-ring className={styles.ring} style={ring.style}>
            {ring.arms.map((d, arm) => (
              <path key={arm} data-vortex-arm d={d} className={styles.arm} />
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
}

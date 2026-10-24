import type { CSSProperties } from 'react'
import styles from './floating-frames.module.css'

const frames = Array.from({ length: 16 }, (_, index) => ({
  id: index,
  style: {
    '--frame-size': `${100 - index * 4.8}%`,
    '--frame-angle': `${index * 5 - 28}deg`,
    opacity: 0.06 + index * 0.025,
    animationDelay: `${-index * 0.8}s`,
  } as CSSProperties,
}))

export function FloatingFrames() {
  return (
    <div aria-hidden="true" className={styles.art}>
      <div className={styles.field}>
        {frames.map((frame) => (
          <span className={styles.frame} key={frame.id} style={frame.style} />
        ))}
      </div>
    </div>
  )
}

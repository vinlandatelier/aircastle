import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import styles from './rotating-word.module.css'
import { usePrefersReducedMotion } from './use-prefers-reduced-motion'

const rotationMs = 4000

/** Shows `words[0]` and `suffix` to assistive technology and cycles through `words` visually unless the user prefers reduced motion. */
export function RotatingWord({
  words,
  suffix = '',
}: {
  words: readonly [string, ...string[]]
  suffix?: string
}) {
  const reducedMotion = usePrefersReducedMotion()
  const [rotation, setRotation] = useState(0)
  const index = reducedMotion ? 0 : rotation
  const [width, setWidth] = useState<number>()
  const wordRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (reducedMotion) return
    const timer = window.setInterval(
      () => setRotation((current) => (current + 1) % words.length),
      rotationMs,
    )
    return () => window.clearInterval(timer)
  }, [reducedMotion, words.length])

  useLayoutEffect(() => {
    const measure = () => setWidth(wordRef.current?.offsetWidth)
    measure()
    void document.fonts?.ready.then(measure)
  }, [index])

  return (
    <>
      <span className="sr-only">
        {words[0]}
        {suffix}
      </span>
      <span aria-hidden="true">
        <span className={styles.slot} style={{ width }}>
          <span key={index} ref={wordRef} className={styles.word}>
            {words[index]}
          </span>
        </span>
        {suffix}
      </span>
    </>
  )
}

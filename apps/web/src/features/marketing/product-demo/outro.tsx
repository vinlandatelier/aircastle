import { cn } from 'cn'
import styles from './product-demo.module.css'

const wordmark = 'Aircastle'
const lettersStartAfter = 700
const letterStagger = 60
const letterDuration = 800

function eased(elapsed: number, duration: number) {
  const t = Math.max(0, Math.min(1, elapsed / duration))
  return 1 - (1 - t) ** 3
}

/** The closing card: the cover's grainy dark background over the whole preview, with the Aircastle wordmark rising into focus. */
export function Outro({ elapsed, opacity }: { elapsed: number; opacity: number }) {
  return (
    <div
      data-demo-outro
      style={{ opacity }}
      className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#070708]"
    >
      <div className={cn('absolute inset-0 opacity-35', styles.coverBloom)} />
      <div data-demo-outro-grain className={cn('absolute inset-0', styles.coverGrain)} />
      <span
        data-demo-outro-wordmark
        className="relative text-[76px] leading-none font-[250] tracking-[-0.03em] text-white"
      >
        {Array.from(wordmark, (letter, index) => {
          const shown = eased(elapsed - lettersStartAfter - index * letterStagger, letterDuration)
          return (
            <span
              key={index}
              data-demo-outro-letter
              className="inline-block"
              style={{
                opacity: shown,
                translate: `0 ${(1 - shown) * 16}px`,
                filter: shown < 1 ? `blur(${(1 - shown) * 10}px)` : undefined,
              }}
            >
              {letter}
            </span>
          )
        })}
      </span>
    </div>
  )
}

import { cn } from 'cn'
import { galeBlades } from './gale-blades'
import styles from './product-demo.module.css'

const bloomStartsAfter = 1000
const driftDuration = 2400
const bladeStagger = 130
const bladeDuration = 900
const settleDuration = 1700
const nameStartsAfter = bloomStartsAfter + 1200
const nameDuration = 1000
const markSize = 112

function progress(elapsed: number, duration: number) {
  return Math.max(0, Math.min(1, elapsed / duration))
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 3
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}

function overshoot(t: number) {
  const pull = 1.4
  return 1 + (pull + 1) * (t - 1) ** 3 + pull * (t - 1) ** 2
}

function CloudGradient() {
  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
    >
      <defs>
        <linearGradient id="demo-outro-sweep" x1="0" y1="0.2" x2="1" y2="0.8">
          <stop offset="0" stopColor="#000" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <filter
          id="demo-outro-clouds"
          x="0"
          y="0"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves={2} seed={8} />
          <feColorMatrix type="saturate" values="0" result="clouds" />
          <feComposite
            in="SourceGraphic"
            in2="clouds"
            operator="arithmetic"
            k2={1}
            k3={0.85}
            k4={-0.425}
          />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.933 0.949 0.961 0.784 0.604 0.482 0.400" />
            <feFuncG type="table" tableValues="0.467 0.604 0.722 0.502 0.502 0.502 0.471" />
            <feFuncB type="table" tableValues="0.180 0.361 0.573 0.424 0.643 0.722 0.706" />
          </feComponentTransfer>
        </filter>
      </defs>
      <rect
        x="-30"
        y="-30"
        width="380"
        height="240"
        fill="url(#demo-outro-sweep)"
        filter="url(#demo-outro-clouds)"
      />
    </svg>
  )
}

function GaleBloom({ elapsed }: { elapsed: number }) {
  const settle = easeOut(progress(elapsed - bloomStartsAfter, settleDuration))
  return (
    <svg
      data-demo-outro-mark
      viewBox="0 0 100 100"
      style={{ width: markSize, height: markSize, rotate: `${(1 - settle) * 100}deg` }}
      className="shrink-0 overflow-visible drop-shadow-[0_1px_14px_rgb(90_40_20/0.18)]"
    >
      {galeBlades.map((blade, index) => {
        const t = progress(elapsed - bloomStartsAfter - index * bladeStagger, bladeDuration)
        const grown = overshoot(t)
        return (
          <path
            key={index}
            data-demo-outro-blade
            d={blade}
            fill="white"
            opacity={Math.min(1, t * 2.5)}
            style={{
              transformOrigin: '50px 50px',
              transform: `rotate(${(1 - grown) * 110}deg) scale(${Math.max(0, grown)})`,
            }}
          />
        )
      })}
    </svg>
  )
}

/** The closing card: a grainy cloud gradient over the whole preview, where the Gale mark blooms and the Aircastle name slides out beside it. */
export function Outro({ elapsed, opacity }: { elapsed: number; opacity: number }) {
  const sinceName = elapsed - nameStartsAfter
  const named = easeInOut(progress(sinceName, nameDuration))
  const drift = easeOut(progress(elapsed, driftDuration))
  const nameShown = easeOut(progress(sinceName - nameDuration * 0.15, nameDuration * 0.85))
  return (
    <div
      data-demo-outro
      style={{ opacity }}
      className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden backdrop-blur-md"
    >
      <div className="absolute inset-0 bg-[#c8806c]" style={{ scale: 1.06 - drift * 0.06 }}>
        <CloudGradient />
      </div>
      <div data-demo-outro-grain className={cn('absolute inset-0', styles.outroGrain)} />
      <div
        className="relative flex items-center gap-6"
        style={{ translate: `calc((50% - ${markSize / 2}px) * ${1 - named}) 0` }}
      >
        <GaleBloom elapsed={elapsed} />
        <span
          data-demo-outro-wordmark
          style={{
            opacity: nameShown,
            clipPath: `inset(0 ${(1 - named) * 100}% 0 0)`,
            translate: `${(1 - named) * -16}px 0`,
          }}
          className="text-[84px] leading-none font-[300] tracking-[-0.03em] text-white [text-shadow:0_1px_14px_rgb(90_40_20/0.2)]"
        >
          Aircastle
        </span>
      </div>
    </div>
  )
}

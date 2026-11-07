import { CloudGradient, CloudGrain } from '@/components/brand/cloud-gradient'

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

const galeBlades = [1, 2, 3, 4, 5].map((blade) => `url(/brand/gale-blade-${blade}.svg)`)

function GaleBloom({ elapsed }: { elapsed: number }) {
  const settle = easeOut(progress(elapsed - bloomStartsAfter, settleDuration))
  return (
    <div
      data-demo-outro-mark
      style={{ width: markSize, height: markSize, rotate: `${(1 - settle) * 100}deg` }}
      className="relative shrink-0 drop-shadow-[0_1px_14px_rgb(90_40_20/0.18)]"
    >
      {galeBlades.map((blade, index) => {
        const t = progress(elapsed - bloomStartsAfter - index * bladeStagger, bladeDuration)
        const grown = overshoot(t)
        return (
          <span
            key={blade}
            data-demo-outro-blade
            className="absolute inset-0 bg-white"
            style={{
              opacity: Math.min(1, t * 2.5),
              mask: `${blade} center / contain no-repeat`,
              transform: `rotate(${(1 - grown) * 110}deg) scale(${Math.max(0, grown)})`,
            }}
          />
        )
      })}
    </div>
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
        <CloudGradient id="demo-outro" />
      </div>
      <CloudGrain data-demo-outro-grain />
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

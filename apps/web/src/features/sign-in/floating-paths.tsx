import type { CSSProperties } from 'react'

const PATH_COUNT = 36

export function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: PATH_COUNT }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
    opacity: (0.06 + i * 0.018).toFixed(3),
    duration: 20 + (i % 6) * 2,
    delay: -(i * 0.7),
  }))

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 isolate contain-strict">
      <style href="floating-paths-keyframes" precedence="default">
        {
          '@keyframes floating-path{0%{stroke-dashoffset:1;stroke-opacity:0}15%,85%{stroke-opacity:var(--stroke-opacity)}100%{stroke-dashoffset:-1;stroke-opacity:0}}'
        }
      </style>
      <svg className="h-full w-full text-primary" fill="none" viewBox="0 0 696 316">
        <title>Background Paths</title>
        {paths.map((path) => (
          <path
            className="motion-safe:animate-[floating-path_var(--duration)_linear_infinite]"
            d={path.d}
            key={path.id}
            pathLength={1}
            stroke="currentColor"
            strokeDasharray="1 1"
            strokeOpacity={path.opacity}
            strokeWidth={path.width}
            style={
              {
                '--duration': `${path.duration}s`,
                '--stroke-opacity': path.opacity,
                animationDelay: `${path.delay}s`,
              } as CSSProperties
            }
          />
        ))}
      </svg>
    </div>
  )
}

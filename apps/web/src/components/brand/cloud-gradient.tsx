import type { ComponentProps } from 'react'
import { cn } from 'cn'
import styles from './cloud-gradient.module.css'

const looks = {
  emberClouds: {
    noise: { baseFrequency: 0.006, octaves: 2, seed: 8, weight: 0.85 },
    red: '0.933 0.949 0.961 0.784 0.604 0.482 0.400',
    green: '0.467 0.604 0.722 0.502 0.502 0.502 0.471',
    blue: '0.180 0.361 0.573 0.424 0.643 0.722 0.706',
  },
  seaPools: {
    noise: { baseFrequency: 0.004, octaves: 1, seed: 6, weight: 1 },
    red: '0.106 0.204 0.459 0.722 0.290 0.165 0.110',
    green: '0.478 0.643 0.835 0.918 0.737 0.596 0.420',
    blue: '0.420 0.565 0.749 0.859 0.808 0.710 0.561',
  },
} as const

/** A grainy painterly gradient filling its parent: warm "ember clouds" running orange to lilac blue, or cool "sea pools" running teal through mint to ocean blue. */
export function CloudGradient({
  id,
  look = 'emberClouds',
}: {
  id: string
  look?: keyof typeof looks
}) {
  const { noise, red, green, blue } = looks[look]
  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
    >
      <defs>
        <linearGradient id={`${id}-sweep`} x1="0" y1="0.2" x2="1" y2="0.8">
          <stop offset="0" stopColor="#000" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <filter
          id={`${id}-clouds`}
          x="0"
          y="0"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency={noise.baseFrequency}
            numOctaves={noise.octaves}
            seed={noise.seed}
          />
          <feColorMatrix type="saturate" values="0" result="clouds" />
          <feComposite
            in="SourceGraphic"
            in2="clouds"
            operator="arithmetic"
            k2={1}
            k3={noise.weight}
            k4={-noise.weight / 2}
          />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={red} />
            <feFuncG type="table" tableValues={green} />
            <feFuncB type="table" tableValues={blue} />
          </feComponentTransfer>
        </filter>
      </defs>
      <rect
        x="-30"
        y="-30"
        width="380"
        height="240"
        fill={`url(#${id}-sweep)`}
        filter={`url(#${id}-clouds)`}
      />
    </svg>
  )
}

/** Fine film grain to lay over the cloud gradient. */
export function CloudGrain({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('absolute inset-0', styles.grain, className)} {...props} />
}

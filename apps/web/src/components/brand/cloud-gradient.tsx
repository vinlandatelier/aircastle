import type { ComponentProps } from 'react'
import { cn } from 'cn'
import styles from './cloud-gradient.module.css'

/** Aircastle's warm cloud gradient: orange at the left drifting through peach and clay to lilac blue, filling its parent. */
export function CloudGradient({ id }: { id: string }) {
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

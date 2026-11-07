import { ArrowRightIcon } from 'lucide-react'
import { CloudGradient, CloudGrain } from '@/components/brand/cloud-gradient'
import { AirWatcher } from './air-watcher'

/** The sign-in panel's art: sea-green folds on a rounded card that introduces Air, the same in every theme. */
export function CloudArt() {
  return (
    <div data-sign-in-art className="absolute inset-3 isolate overflow-hidden rounded-[28px]">
      <div data-sign-in-backdrop aria-hidden="true" className="absolute inset-0 bg-[#34a490]">
        <CloudGradient id="sign-in" look="seaFolds" />
        <CloudGrain />
      </div>
      <div className="relative flex h-full items-center justify-center">
        <div className="flex flex-col items-end gap-2 text-white [text-shadow:0_1px_16px_rgb(10_60_60/0.25)]">
          <p
            data-sign-in-greeting
            className="flex items-center gap-[0.25em] text-[5rem] leading-none font-[300] tracking-[-0.03em]"
          >
            Meet
            <AirWatcher eyeColour="#43ac96" />
            Air
          </p>
          <a
            href="/#product-demo"
            className="group inline-flex items-center gap-1.5 rounded-md text-2xl text-white/85 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-solid"
          >
            Learn more
            <ArrowRightIcon
              aria-hidden="true"
              className="size-[1.1em] transition-transform group-hover:translate-x-0.5"
            />
          </a>
        </div>
      </div>
    </div>
  )
}

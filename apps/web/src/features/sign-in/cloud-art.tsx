import { CloudGradient, CloudGrain } from '@/components/brand/cloud-gradient'

/** The sign-in panel's art: the warm cloud gradient with a small white Gale mark and name, the same in every theme. */
export function CloudArt() {
  return (
    <div
      data-sign-in-art
      aria-hidden="true"
      className="absolute inset-0 isolate overflow-hidden bg-[#c8806c]"
    >
      <CloudGradient id="sign-in" />
      <CloudGrain />
      <div className="relative flex h-full items-center justify-center gap-2.5">
        <img
          data-sign-in-mark
          src="/brand/logo-dark.png"
          alt=""
          className="size-8 drop-shadow-[0_1px_10px_rgb(90_40_20/0.2)]"
        />
        <span className="text-[26px] leading-none font-[300] tracking-[-0.03em] text-white [text-shadow:0_1px_12px_rgb(90_40_20/0.22)]">
          Aircastle
        </span>
      </div>
    </div>
  )
}

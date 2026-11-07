import { CloudGradient, CloudGrain } from '@/components/brand/cloud-gradient'

/** The sign-in panel's art: the warm cloud gradient on a rounded card, the same in every theme. */
export function CloudArt() {
  return (
    <div
      data-sign-in-art
      aria-hidden="true"
      className="absolute inset-3 isolate overflow-hidden rounded-[28px] bg-[#c8806c]"
    >
      <CloudGradient id="sign-in" />
      <CloudGrain />
    </div>
  )
}

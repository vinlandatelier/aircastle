import BoringAvatar from 'boring-avatars'

const defaultColors = ['#a6e094', '#e8e490', '#f07360', '#bf2a7f', '#5c3d5b'] as const

export function GeneratedAvatar({
  name,
  size = 32,
  variant = 'marble',
  colors = defaultColors,
}: {
  name: string
  size?: number
  variant?: 'marble' | 'beam'
  colors?: readonly string[]
}) {
  return (
    <BoringAvatar
      size={size}
      className="size-auto"
      style={{ width: size, height: size }}
      name={name}
      variant={variant}
      colors={[...colors]}
    />
  )
}

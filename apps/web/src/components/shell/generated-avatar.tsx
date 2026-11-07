import BoringAvatar from 'boring-avatars'

export function GeneratedAvatar({
  name,
  size = 32,
  variant = 'marble',
}: {
  name: string
  size?: number
  variant?: 'marble' | 'beam'
}) {
  return (
    <BoringAvatar
      size={size}
      className="size-auto"
      style={{ width: size, height: size }}
      name={name}
      variant={variant}
      colors={['#a6e094', '#e8e490', '#f07360', '#bf2a7f', '#5c3d5b']}
    />
  )
}

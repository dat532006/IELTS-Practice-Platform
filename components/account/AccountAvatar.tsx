/* eslint-disable @next/next/no-img-element */

// Avatar tái sử dụng: hiện ảnh nếu profiles.avatar là URL, ngược lại gradient + chữ cái đầu.
export function AccountAvatar({
  name,
  email,
  avatar,
  size = 64,
  radius = 20,
  fontSize = 26,
}: {
  name?: string | null
  email?: string | null
  avatar?: string | null
  size?: number
  radius?: number
  fontSize?: number
}) {
  const initial = (name || email || '?').trim().charAt(0).toUpperCase() || '?'
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name || email || 'avatar'}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flex: 'none' }}
      />
    )
  }
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        color: '#fff',
        background: 'linear-gradient(150deg,#8E70F2,#6A48D6)',
        boxShadow: '0 12px 26px -8px rgba(124,92,230,0.6)',
      }}
    >
      {initial}
    </span>
  )
}

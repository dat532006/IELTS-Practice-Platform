type AuthErrorLike = {
  message?: string
  code?: string
  status?: number
}

export function toAuthErrorMessage(error: unknown, fallback = 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.'): string {
  const value = typeof error === 'object' && error !== null ? (error as AuthErrorLike) : {}
  const raw = `${value.code ?? ''} ${value.message ?? ''}`.toLowerCase()

  if (value.status === 429 || raw.includes('rate limit') || raw.includes('too many')) {
    return 'Bạn đã thử quá nhiều lần. Vui lòng chờ một lúc rồi thử lại.'
  }
  if (raw.includes('invalid login credentials') || raw.includes('invalid credentials')) {
    return 'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra và thử lại.'
  }
  if (raw.includes('already registered') || raw.includes('user already exists')) {
    return 'Email này đã được đăng ký. Hãy đăng nhập hoặc đặt lại mật khẩu.'
  }
  if (raw.includes('otp') || raw.includes('token has expired') || raw.includes('token is invalid')) {
    return 'Mã xác nhận không đúng hoặc đã hết hạn. Vui lòng yêu cầu mã mới.'
  }
  if (raw.includes('network') || raw.includes('fetch') || value.status === 502 || value.status === 503) {
    return 'Không thể kết nối tới dịch vụ xác thực. Vui lòng thử lại sau.'
  }
  if (raw.includes('password') && raw.includes('weak')) {
    return 'Mật khẩu chưa đủ mạnh. Vui lòng chọn mật khẩu khác.'
  }

  return fallback
}

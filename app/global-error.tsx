'use client'

// W19 (M10) — global error boundary: bắt lỗi xảy ra ngay trong root layout. Thay thế root layout nên
//   PHẢI tự render <html>/<body>. Giữ tối giản (không phụ thuộc CSS/side layout để luôn render được).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fff', color: '#2A2740' }}>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '2rem',
          }}
        >
          <div style={{ fontSize: 48 }}>⚠️</div>
          <h1 style={{ marginTop: 12, fontSize: 22, fontWeight: 800 }}>Đã có lỗi xảy ra</h1>
          <p style={{ marginTop: 8, maxWidth: '30em', color: '#5C5670', lineHeight: 1.6 }}>
            Ứng dụng gặp sự cố không mong muốn. Vui lòng thử lại.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              borderRadius: 13,
              background: '#7C5CE6',
              color: '#fff',
              border: 'none',
              padding: '12px 20px',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Thử lại
          </button>
        </main>
      </body>
    </html>
  )
}

'use client'

import { useState } from 'react'

// Lead-capture form on the landing page. No backend endpoint yet (v1 shell) —
// captures the email client-side and shows an acknowledgement.
export function LeadForm() {
  const [sent, setSent] = useState(false)

  if (sent) {
    return <p className="lead-thanks">Thanks — we&apos;ll be in touch with your study roadmap shortly. ✨</p>
  }

  return (
    <form
      className="lead-form"
      onSubmit={(e) => {
        e.preventDefault()
        setSent(true)
      }}
    >
      <input type="email" className="lead-email" placeholder="you@email.com" required />
      <button className="btn-send" type="submit">
        Send
      </button>
    </form>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function ReturningUserCTA() {
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    try {
      const last = localStorage.getItem('lastEmail')
      if (last) setEmail(last)
    } catch {
      /* ignore */
    }
  }, [])

  if (!email) return null

  return (
    <div className="mt-4">
      <Link
        href={`/login?email=${encodeURIComponent(email)}`}
        className="inline-flex items-center rounded-lg border px-3 py-2 text-sm hover:bg-primary/10"
      >
        Continue as <span className="ml-1 font-medium">{email}</span>
      </Link>
    </div>
  )
}

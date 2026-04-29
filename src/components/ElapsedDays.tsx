import React from 'react'

interface Props {
  startedAt: string
  className?: string
}

export default function ElapsedDays({ startedAt, className = '' }: Props) {
  const days = Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000)

  const color =
    days >= 7  ? 'bg-red-100 text-red-700 border-red-200' :
    days >= 3  ? 'bg-amber-100 text-amber-700 border-amber-200' :
                 'bg-green-100 text-green-700 border-green-200'

  const label = days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${color} ${className}`}>
      ⏱ {label}
    </span>
  )
}

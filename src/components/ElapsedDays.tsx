import { Icon } from './ui/Icon'

interface Props {
  startedAt: string
  className?: string
}

export default function ElapsedDays({ startedAt, className = '' }: Props) {
  const days = Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000)

  const color =
    days >= 7  ? 'badge-danger' :
    days >= 3  ? 'badge-warning' :
                 'badge-success'

  const label = days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`

  return (
    <span className={`badge ${color} ${className}`}>
      <Icon name="timer" className="w-3 h-3" /> {label}
    </span>
  )
}

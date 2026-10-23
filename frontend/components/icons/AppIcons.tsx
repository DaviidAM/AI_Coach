interface IconProps {
  size?: number
  className?: string
}

export function LeafIcon({ size = 28, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  )
}

export function BriefcaseIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  )
}

export function BookOpenIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 7v14" />
      <path d="M3 18a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3Z" />
    </svg>
  )
}

export function RobotIcon({ size = 40, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      fill="none"
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      <rect fill="#759384" height="10" rx="2" width="4" x="3" y="15" />
      <rect fill="#759384" height="10" rx="2" width="4" x="33" y="15" />
      <rect fill="#ffffff" height="24" rx="11" width="28" x="6" y="8" />
      <rect fill="#121b16" height="15" rx="7" width="22" x="9" y="12" />
      <ellipse cx="15" cy="19" fill="#39E585" rx="2.5" ry="2.5" />
      <ellipse cx="25" cy="19" fill="#39E585" rx="2.5" ry="2.5" />
      <circle cx="20" cy="5" fill="#759384" r="2" />
      <path d="M20 7V8" stroke="#759384" strokeWidth="1.5" />
    </svg>
  )
}

export function UserIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

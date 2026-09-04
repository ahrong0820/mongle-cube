import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'plus'
  | 'minus'
  | 'edit'
  | 'trash'
  | 'snowflake'
  | 'device'
  | 'people'
  | 'refresh'
  | 'close'
  | 'chevron'
  | 'calendar'
  | 'clock'
  | 'check'
  | 'book'
  | 'bowl'

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20, ...props }: IconProps) {
  const paths: Record<IconName, ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
      </>
    ),
    snowflake: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
        <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      </>
    ),
    device: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="3" />
        <path d="M10 18h4" />
      </>
    ),
    people: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
        <path d="M20 4v7h-7" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    book: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a2 2 0 0 1 2 2v16a2.5 2.5 0 0 0-2.5-2.5H4Z" />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v18a2.5 2.5 0 0 1 2.5-2.5H20Z" />
      </>
    ),
    bowl: (
      <>
        <path d="M4 10h16c0 5-3.6 9-8 9s-8-4-8-9Z" />
        <path d="M7 22h10M15.5 8.5 19 3" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}

interface Props {
  size?: number
  className?: string
  title?: string
}

// Saturn logomark — a ringed planet drawn as inline SVG so it inherits color
// from CSS. The rings orbit at a slight tilt; front/back arcs are separate so
// the ring passes both behind and in front of the planet body.
export default function SaturnLogo({ size = 16, className, title }: Props): React.JSX.Element {
  const s = size
  return (
    <svg
      className={className}
      width={s}
      height={s}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <defs>
        <radialGradient id="saterm-saturn-body" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#f6cf8f" />
          <stop offset="60%" stopColor="#d09550" />
          <stop offset="100%" stopColor="#5b3a1e" />
        </radialGradient>
      </defs>
      {/* Ring back-half — behind the planet */}
      <path
        d="M 3.3,18.2 A 13,4 0 0 1 28.7,13.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.85"
        transform="rotate(-16 16 16)"
      />
      {/* Planet body */}
      <circle cx="16" cy="16" r="7" fill="url(#saterm-saturn-body)" />
      {/* Subtle equatorial band */}
      <ellipse cx="16" cy="16" rx="7" ry="1.2" fill="#c17a3c" opacity="0.35" />
      {/* Ring front-half — over the planet */}
      <path
        d="M 3.3,18.2 A 13,4 0 0 0 28.7,13.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="1"
        transform="rotate(-16 16 16)"
      />
    </svg>
  )
}

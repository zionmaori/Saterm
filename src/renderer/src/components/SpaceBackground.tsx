import { useEffect, useMemo, useRef, useState } from 'react'

interface UfoParams {
  yStart: number
  yEnd: number
  dir: 'ltr' | 'rtl'
  duration: number
  scale: number
}

function randomUfoParams(): UfoParams {
  const yStart = 8 + Math.random() * 60
  const yEnd = yStart + (Math.random() * 20 - 10)
  const dir: 'ltr' | 'rtl' = Math.random() < 0.5 ? 'ltr' : 'rtl'
  const duration = 14 + Math.random() * 10
  const scale = 0.7 + Math.random() * 0.6
  return { yStart, yEnd, dir, duration, scale }
}

function randomScoutParams(): UfoParams {
  // Scout: smaller, quicker, tends to fly higher in the sky.
  const yStart = 4 + Math.random() * 40
  const yEnd = yStart + (Math.random() * 14 - 7)
  const dir: 'ltr' | 'rtl' = Math.random() < 0.5 ? 'ltr' : 'rtl'
  const duration = 9 + Math.random() * 6
  const scale = 0.45 + Math.random() * 0.25
  return { yStart, yEnd, dir, duration, scale }
}

interface ShootingStarParams {
  yStart: number // vh
  xStart: number // vw — where trail begins
  angle: number // deg, small tilt from horizontal
  duration: number // s
  length: number // px — trail length
}

function randomShootingStarParams(): ShootingStarParams {
  const yStart = 4 + Math.random() * 55
  const xStart = -10 + Math.random() * 30 // start off-screen or just barely on
  const angle = 10 + Math.random() * 20 // gentle downward diagonal
  const duration = 0.9 + Math.random() * 0.6
  const length = 120 + Math.random() * 120
  return { yStart, xStart, angle, duration, length }
}

type Star = {
  x: number // % across the sky
  y: number // % down the sky
  size: number // px radius
  layer: 1 | 2 | 3 // parallax depth
  delay: number // s
  duration: number // s
  hue: number // 200–260 for stars, drifts a little
}

function makeStars(count: number, seed: number): Star[] {
  // Deterministic PRNG so the sky is stable across re-mounts within a session.
  let state = seed
  const rand = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
  const out: Star[] = []
  for (let i = 0; i < count; i++) {
    const layer = (rand() < 0.6 ? 1 : rand() < 0.85 ? 2 : 3) as 1 | 2 | 3
    out.push({
      x: rand() * 100,
      y: rand() * 100,
      size: layer === 1 ? 0.6 + rand() * 0.8 : layer === 2 ? 1 + rand() * 1.2 : 1.6 + rand() * 1.4,
      layer,
      delay: rand() * -8,
      duration: 3 + rand() * 6,
      hue: 200 + rand() * 60
    })
  }
  return out
}

export default function SpaceBackground(): React.JSX.Element {
  // Follow pointer with heavy easing for parallax depth on the closer stars.
  const wrapRef = useRef<HTMLDivElement>(null)
  const targetRef = useRef({ x: 0, y: 0 })
  const currentRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)

  // One-time star field. Two densities so distant stars are dense, close few.
  const farStars = useMemo(() => makeStars(140, 0x51ac10), [])
  const midStars = useMemo(() => makeStars(60, 0xb00bab), [])
  const nearStars = useMemo(() => makeStars(22, 0xc0ffee), [])

  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      targetRef.current = { x: nx, y: ny }
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    const tick = (): void => {
      const t = targetRef.current
      const c = currentRef.current
      c.x += (t.x - c.x) * 0.06
      c.y += (t.y - c.y) * 0.06
      const el = wrapRef.current
      if (el) {
        el.style.setProperty('--px', c.x.toFixed(4))
        el.style.setProperty('--py', c.y.toFixed(4))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // UFO — appears occasionally on a randomised trajectory.
  // ufoKey doubles as a remount trigger; the params live in state so the
  // random draw happens outside render.
  const [ufoParams, setUfoParams] = useState<UfoParams>(() => randomUfoParams())
  const [ufoKey, setUfoKey] = useState(0)

  useEffect(() => {
    // Cycle a fresh UFO every 22–48s so it doesn't get stale.
    let cancelled = false
    const schedule = (): void => {
      const t = 22000 + Math.random() * 26000
      window.setTimeout(() => {
        if (cancelled) return
        setUfoParams(randomUfoParams())
        setUfoKey((k) => k + 1)
        schedule()
      }, t)
    }
    schedule()
    return () => {
      cancelled = true
    }
  }, [])

  // Scout UFO — smaller, quicker sibling on its own cadence (18–34s) so the
  // two ships never sync up.
  const [scoutParams, setScoutParams] = useState<UfoParams>(() => randomScoutParams())
  const [scoutKey, setScoutKey] = useState(0)
  useEffect(() => {
    let cancelled = false
    const schedule = (): void => {
      const t = 18000 + Math.random() * 16000
      window.setTimeout(() => {
        if (cancelled) return
        setScoutParams(randomScoutParams())
        setScoutKey((k) => k + 1)
        schedule()
      }, t)
    }
    // Offset the first launch so it doesn't overlap the main UFO's opening drift.
    window.setTimeout(schedule, 6000)
    return () => {
      cancelled = true
    }
  }, [])

  // Shooting stars — brief streaks, roughly one every 8–15s.
  const [shootParams, setShootParams] = useState<ShootingStarParams>(() =>
    randomShootingStarParams()
  )
  const [shootKey, setShootKey] = useState(0)
  useEffect(() => {
    let cancelled = false
    const schedule = (): void => {
      const t = 8000 + Math.random() * 7000
      window.setTimeout(() => {
        if (cancelled) return
        setShootParams(randomShootingStarParams())
        setShootKey((k) => k + 1)
        schedule()
      }, t)
    }
    window.setTimeout(schedule, 4000)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-bg" ref={wrapRef} aria-hidden="true">
      {/* Deep gradient — the vacuum */}
      <div className="space-gradient" />
      {/* Nebula clouds — three slow-drifting radial blobs */}
      <div className="space-nebula space-nebula-a" />
      <div className="space-nebula space-nebula-b" />
      <div className="space-nebula space-nebula-c" />

      {/* Distant planet — very slow parallax, tucked in bottom-right */}
      <div className="space-planet">
        <PlanetSvg />
      </div>

      {/* Star layers — mounted once, animated by CSS */}
      <div className="space-stars space-stars-far">
        {farStars.map((s, i) => (
          <span
            key={`f${i}`}
            className="space-star"
            style={
              {
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${s.size}px`,
                height: `${s.size}px`,
                animationDelay: `${s.delay}s`,
                animationDuration: `${s.duration}s`,
                background: `hsl(${s.hue}, 100%, 92%)`,
                boxShadow: `0 0 ${s.size * 2}px hsla(${s.hue}, 100%, 88%, 0.55)`
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="space-stars space-stars-mid">
        {midStars.map((s, i) => (
          <span
            key={`m${i}`}
            className="space-star"
            style={
              {
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${s.size}px`,
                height: `${s.size}px`,
                animationDelay: `${s.delay}s`,
                animationDuration: `${s.duration}s`,
                background: `hsl(${s.hue}, 100%, 90%)`,
                boxShadow: `0 0 ${s.size * 3}px hsla(${s.hue}, 100%, 84%, 0.6)`
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="space-stars space-stars-near">
        {nearStars.map((s, i) => (
          <span
            key={`n${i}`}
            className="space-star"
            style={
              {
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${s.size + 0.4}px`,
                height: `${s.size + 0.4}px`,
                animationDelay: `${s.delay}s`,
                animationDuration: `${s.duration + 2}s`,
                background: `hsl(${s.hue}, 100%, 90%)`,
                boxShadow: `0 0 ${s.size * 4}px hsla(${s.hue}, 100%, 80%, 0.75)`
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Shooting star — brief streak, remounts on each cycle */}
      <div
        key={`shoot-${shootKey}`}
        className="shooting-star"
        style={
          {
            top: `${shootParams.yStart}vh`,
            left: `${shootParams.xStart}vw`,
            width: `${shootParams.length}px`,
            '--shoot-angle': `${shootParams.angle}deg`,
            '--shoot-duration': `${shootParams.duration}s`
          } as React.CSSProperties
        }
      />

      {/* Occasional UFO drift */}
      <div
        key={ufoKey}
        className={`ufo ${ufoParams.dir === 'ltr' ? 'ufo-ltr' : 'ufo-rtl'}`}
        style={
          {
            '--ufo-y-start': `${ufoParams.yStart}vh`,
            '--ufo-y-end': `${ufoParams.yEnd}vh`,
            '--ufo-duration': `${ufoParams.duration}s`,
            '--ufo-scale': ufoParams.scale
          } as React.CSSProperties
        }
      >
        <UfoSvg />
        <span className="ufo-beam" />
      </div>

      {/* Scout UFO — smaller, faster */}
      <div
        key={`scout-${scoutKey}`}
        className={`ufo ufo-scout ${scoutParams.dir === 'ltr' ? 'ufo-ltr' : 'ufo-rtl'}`}
        style={
          {
            '--ufo-y-start': `${scoutParams.yStart}vh`,
            '--ufo-y-end': `${scoutParams.yEnd}vh`,
            '--ufo-duration': `${scoutParams.duration}s`,
            '--ufo-scale': scoutParams.scale
          } as React.CSSProperties
        }
      >
        <ScoutSvg />
      </div>
    </div>
  )
}

function UfoSvg(): React.JSX.Element {
  return (
    <svg viewBox="0 0 80 40" width="80" height="40" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ufoDome" cx="50%" cy="35%" r="50%">
          <stop offset="0%" stopColor="#cff4ff" stopOpacity="0.9" />
          <stop offset="80%" stopColor="#7aa8d8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#3a5f8a" stopOpacity="0.95" />
        </radialGradient>
        <linearGradient id="ufoBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8a92b0" />
          <stop offset="50%" stopColor="#c9d0e6" />
          <stop offset="100%" stopColor="#4a5478" />
        </linearGradient>
      </defs>
      {/* Dome */}
      <ellipse cx="40" cy="16" rx="14" ry="8" fill="url(#ufoDome)" />
      {/* Body — saucer */}
      <ellipse cx="40" cy="22" rx="32" ry="6" fill="url(#ufoBody)" />
      {/* Under-lights */}
      <circle cx="20" cy="24" r="1.4" fill="#ffb066">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="30" cy="25" r="1.4" fill="#6dd0ff">
        <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="40" cy="25.5" r="1.4" fill="#c39aff">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle cx="50" cy="25" r="1.4" fill="#6dd0ff">
        <animate attributeName="opacity" values="1;0.4;1" dur="1.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="60" cy="24" r="1.4" fill="#ffb066">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="1.3s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

function ScoutSvg(): React.JSX.Element {
  // Rounder, single-dome scout with two blinking lights.
  return (
    <svg viewBox="0 0 60 32" width="60" height="32" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="scoutDome" cx="50%" cy="30%" r="55%">
          <stop offset="0%" stopColor="#dff8ff" stopOpacity="0.95" />
          <stop offset="80%" stopColor="#8fd0ee" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#2c5f8a" stopOpacity="0.95" />
        </radialGradient>
        <linearGradient id="scoutBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#9aa5c5" />
          <stop offset="55%" stopColor="#d8dff0" />
          <stop offset="100%" stopColor="#525c85" />
        </linearGradient>
      </defs>
      {/* Dome */}
      <ellipse cx="30" cy="13" rx="10" ry="7" fill="url(#scoutDome)" />
      {/* Body — narrower saucer */}
      <ellipse cx="30" cy="19" rx="24" ry="4.5" fill="url(#scoutBody)" />
      {/* Two under-lights */}
      <circle cx="22" cy="21" r="1.3" fill="#ffb066">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="0.9s" repeatCount="indefinite" />
      </circle>
      <circle cx="38" cy="21" r="1.3" fill="#c39aff">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.1s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

function PlanetSvg(): React.JSX.Element {
  return (
    <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="planetBody" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#f5c48a" stopOpacity="1" />
          <stop offset="55%" stopColor="#c0824a" stopOpacity="1" />
          <stop offset="100%" stopColor="#3a2a1e" stopOpacity="1" />
        </radialGradient>
        <linearGradient id="planetRing" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#e6b884" stopOpacity="0" />
          <stop offset="30%" stopColor="#e6b884" stopOpacity="0.85" />
          <stop offset="70%" stopColor="#e6b884" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#e6b884" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Back half of ring */}
      <ellipse
        cx="80"
        cy="80"
        rx="70"
        ry="14"
        transform="rotate(-18 80 80)"
        fill="none"
        stroke="url(#planetRing)"
        strokeWidth="3"
        strokeDasharray="0 0"
        opacity="0.7"
      />
      {/* Planet body */}
      <circle cx="80" cy="80" r="42" fill="url(#planetBody)" />
      {/* Banding — subtle */}
      <ellipse cx="80" cy="76" rx="42" ry="6" fill="#e0a066" opacity="0.35" />
      <ellipse cx="80" cy="86" rx="42" ry="5" fill="#c07038" opacity="0.35" />
      {/* Front half of ring — draws over the planet */}
      <path
        d="M 12,88 A 70,14 0 0 0 148,72"
        transform="rotate(-18 80 80)"
        fill="none"
        stroke="url(#planetRing)"
        strokeWidth="3"
        opacity="0.9"
      />
    </svg>
  )
}

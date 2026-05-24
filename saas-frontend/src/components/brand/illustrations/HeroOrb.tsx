/** Abstract AI orb — minimal line art, no neon */
export function HeroOrb({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 400"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <radialGradient id="orb-glow" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <ellipse cx="240" cy="200" rx="180" ry="160" fill="url(#orb-glow)" className="animate-pulse-soft" />
      <circle cx="240" cy="195" r="72" className="stroke-white/10" strokeWidth="1" />
      <circle cx="240" cy="195" r="48" className="stroke-white/15" strokeWidth="1" />
      <circle cx="240" cy="195" r="24" className="fill-white/[0.04] stroke-white/20" strokeWidth="1" />
      {/* orbit nodes */}
      <g className="animate-orbit-slow" style={{ transformOrigin: '240px 195px' }}>
        <circle cx="340" cy="195" r="6" className="fill-zinc-500/40 stroke-white/20" strokeWidth="1" />
      </g>
      <g className="animate-orbit-reverse" style={{ transformOrigin: '240px 195px' }}>
        <circle cx="140" cy="250" r="5" className="fill-zinc-600/50 stroke-white/15" strokeWidth="1" />
      </g>
      <g className="animate-orbit-slow" style={{ transformOrigin: '240px 195px', animationDelay: '-4s' }}>
        <circle cx="200" cy="100" r="4" className="fill-zinc-400/30" />
      </g>
      {/* connection lines */}
      <path d="M240 195 L340 195" className="stroke-white/[0.06]" strokeWidth="1" strokeDasharray="4 6" />
      <path d="M240 195 L140 250" className="stroke-white/[0.06]" strokeWidth="1" strokeDasharray="4 6" />
      <path d="M240 195 L200 100" className="stroke-white/[0.06]" strokeWidth="1" strokeDasharray="4 6" />
      {/* order pulse */}
      <rect x="60" y="300" width="120" height="36" rx="10" className="fill-white/[0.03] stroke-white/[0.08]" strokeWidth="1" />
      <rect x="72" y="312" width="48" height="4" rx="2" className="fill-white/20" />
      <rect x="72" y="322" width="72" height="4" rx="2" className="fill-white/10" />
      <rect x="300" y="80" width="100" height="32" rx="10" className="fill-white/[0.03] stroke-white/[0.08]" strokeWidth="1" />
      <text x="318" y="100" className="fill-zinc-500 text-[10px]" style={{ fontFamily: 'system-ui' }}>
        COD ✓
      </text>
    </svg>
  );
}

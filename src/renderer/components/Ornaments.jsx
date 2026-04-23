// Shared ornamental SVG components — Shia Islamic visual vocabulary.
// Every motif is pure SVG + CSS tokens so nothing external is fetched.

export function ImamiStar({ size = 40, opacity = 0.7, filled = false }) {
  // 12-point star — one vertex per Imam. Built from 24 alternating radii.
  const cx = 50, cy = 50;
  const points = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i * 15 - 90) * Math.PI / 180;
    const r = i % 2 === 0 ? 42 : 22;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100"
         style={{ opacity, color: 'currentColor' }} aria-hidden="true">
      <polygon points={points.join(' ')}
               fill={filled ? 'currentColor' : 'none'}
               stroke="currentColor" strokeWidth="1.2" strokeLinejoin="miter" />
      <circle cx="50" cy="50" r="8" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="50" cy="50" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function ArabesqueCorner({ size = 80, opacity = 0.55, rotate = 0 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100"
         style={{ opacity, color: 'currentColor', transform: `rotate(${rotate}deg)` }}
         aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
        <path d="M 5 5 Q 5 30 25 30 Q 45 30 45 50 Q 45 70 65 70 Q 85 70 85 95" />
        <path d="M 15 15 Q 25 8 35 18 Q 30 28 18 25 Z" />
        <path d="M 35 35 Q 50 28 60 40 Q 52 52 38 48 Z" />
        <path d="M 60 60 Q 75 53 82 65 Q 76 78 62 73 Z" />
        <circle cx="25" cy="22" r="1.5" fill="currentColor" />
        <circle cx="50" cy="46" r="1.5" fill="currentColor" />
        <circle cx="75" cy="68" r="1.5" fill="currentColor" />
        <path d="M 22 38 Q 18 42 22 48" />
        <path d="M 48 65 Q 44 70 48 76" />
      </g>
    </svg>
  );
}

export function MihrabFull({ opacity = 0.5, strokeWidth = 1.5 }) {
  return (
    <svg viewBox="0 0 200 280" preserveAspectRatio="none"
         style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                  margin: 'auto', opacity, color: 'currentColor', pointerEvents: 'none' }}
         aria-hidden="true">
      <path d="M 20 280 L 20 170 Q 20 90 100 18 Q 180 90 180 170 L 180 280"
            fill="none" stroke="currentColor" strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke" />
      <path d="M 32 280 L 32 172 Q 32 100 100 36 Q 168 100 168 172 L 168 280"
            fill="none" stroke="currentColor" strokeWidth={strokeWidth * 0.6}
            vectorEffect="non-scaling-stroke" opacity="0.6" />
      <circle cx="100" cy="22" r="3" fill="currentColor" />
      <circle cx="100" cy="40" r="1.5" fill="currentColor" opacity="0.7" />
      <circle cx="20"  cy="170" r="2" fill="currentColor" opacity="0.7" />
      <circle cx="180" cy="170" r="2" fill="currentColor" opacity="0.7" />
      <line x1="20" y1="265" x2="180" y2="265" stroke="currentColor"
            strokeWidth={strokeWidth * 0.4} vectorEffect="non-scaling-stroke" opacity="0.5" />
    </svg>
  );
}

export function MihrabHairline({ opacity = 0.35, strokeWidth = 1 }) {
  return (
    <svg viewBox="0 0 200 280" preserveAspectRatio="none"
         style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                  margin: 'auto', opacity, color: 'currentColor', pointerEvents: 'none' }}
         aria-hidden="true">
      <path d="M 20 280 L 20 170 Q 20 90 100 18 Q 180 90 180 170 L 180 280"
            fill="none" stroke="currentColor" strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function MinaretGlyph({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100"
         style={{ color: 'currentColor' }} aria-hidden="true">
      <g fill="currentColor">
        <path d="M 30 50 Q 30 25 50 22 Q 70 25 70 50 Z" opacity="0.85" />
        <circle cx="50" cy="16" r="2.5" />
        <line x1="50" y1="11" x2="50" y2="18" stroke="currentColor" strokeWidth="1" />
        <rect x="32" y="50" width="36" height="32" opacity="0.7" />
        <path d="M 40 64 Q 40 56 45 56 Q 50 56 50 64 L 50 76 L 40 76 Z" fill="#0a1f1c" opacity="0.5" />
        <path d="M 50 64 Q 50 56 55 56 Q 60 56 60 64 L 60 76 L 50 76 Z" fill="#0a1f1c" opacity="0.5" />
        <rect x="26" y="82" width="48" height="6" />
      </g>
    </svg>
  );
}

export function AlayhiSalam({ size = 14 }) {
  return (
    <span style={{
      display: 'inline-block', verticalAlign: 'super',
      width: size * 1.6, height: size * 1.6,
      borderRadius: '50%',
      border: '1px solid currentColor',
      color: 'currentColor',
      fontFamily: 'var(--m-font-display)',
      fontSize: size, lineHeight: `${size * 1.5}px`,
      textAlign: 'center', marginInline: 4,
      opacity: 0.85,
    }}>ع</span>
  );
}

export function TileBand({ height = 24, opacity = 0.5 }) {
  const star = `
    <svg xmlns='http://www.w3.org/2000/svg' width='48' height='24' viewBox='0 0 48 24'>
      <g fill='none' stroke='%23e2b76a' stroke-width='0.7' opacity='0.9'>
        <polygon points='24,2 26,8 32,7 28,12 32,17 26,16 24,22 22,16 16,17 20,12 16,7 22,8'/>
        <circle cx='24' cy='12' r='1.6' fill='%23e2b76a'/>
        <circle cx='4' cy='12' r='0.8' fill='%23e2b76a' opacity='0.6'/>
        <circle cx='44' cy='12' r='0.8' fill='%23e2b76a' opacity='0.6'/>
      </g>
    </svg>`.replace(/\s+/g, ' ').trim();
  return (
    <div style={{
      height, width: '100%', opacity,
      backgroundImage: `url("data:image/svg+xml;utf8,${star}")`,
      backgroundRepeat: 'repeat-x',
      backgroundSize: `${height * 2}px ${height}px`,
      backgroundPosition: 'center',
    }} aria-hidden="true" />
  );
}

export function SalawatLine({ size = 'sm', className = '', style = {} }) {
  const fontSize = size === 'lg' ? '1.6vw' : size === 'md' ? 22 : 14;
  return (
    <div className={`salawat-line ${className}`} style={{
      fontFamily: 'var(--m-font-quranic)',
      fontSize, color: 'var(--m-accent)',
      opacity: 0.75, letterSpacing: '0.02em',
      textAlign: 'center', direction: 'rtl',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 14,
      ...style,
    }}>
      <span style={{
        flex: 'none', width: 60, height: 1,
        background: 'linear-gradient(90deg, transparent, var(--m-accent), transparent)',
        opacity: 0.5,
      }} />
      <span>اللّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَآلِ مُحَمَّد</span>
      <span style={{
        flex: 'none', width: 60, height: 1,
        background: 'linear-gradient(90deg, transparent, var(--m-accent), transparent)',
        opacity: 0.5,
      }} />
    </div>
  );
}

export function BrandMark({ size = 36, showWordmark = true, wordmark = 'مئذنة' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: size, height: size,
        borderRadius: 4,
        border: '1px solid var(--m-hairline-bright)',
        background: 'rgba(226,183,106,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--m-accent)',
      }}>
        <MinaretGlyph size={size * 0.7} />
      </div>
      {showWordmark && (
        <div style={{
          fontFamily: 'var(--m-font-display)',
          fontSize: size * 0.72, color: 'var(--m-text-primary)',
          letterSpacing: '0.02em', lineHeight: 1,
        }}>{wordmark}</div>
      )}
    </div>
  );
}

export function StarPatternBg({ opacity = 0.05 }) {
  const svg = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'>
      <g fill='none' stroke='%23e2b76a' stroke-width='0.5' opacity='0.7'>
        <polygon points='90,20 100,50 130,55 108,76 116,108 90,92 64,108 72,76 50,55 80,50'/>
        <circle cx='90' cy='90' r='3' fill='%23e2b76a'/>
      </g>
    </svg>`
  );
  return (
    <div aria-hidden="true" style={{
      position: 'absolute', inset: 0,
      backgroundImage: `url("data:image/svg+xml;utf8,${svg}")`,
      backgroundSize: '220px 220px',
      opacity,
      pointerEvents: 'none',
    }} />
  );
}

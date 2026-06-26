"use client";

/** Nexus-App-Symbol: 3D-Linien-Weltkugel (Wireframe-Globe). Größe über `size`. */
export default function AppLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="nx-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#2c4fd6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#nx-logo-bg)" />
      <g fill="none" stroke="#ffffff" strokeWidth="2.3" strokeLinecap="round" opacity="0.96">
        <circle cx="32" cy="32" r="21" />
        <ellipse cx="32" cy="32" rx="21" ry="7.5" />
        <ellipse cx="32" cy="23" rx="18.5" ry="5.5" />
        <ellipse cx="32" cy="41" rx="18.5" ry="5.5" />
        <ellipse cx="32" cy="32" rx="16" ry="21" />
        <ellipse cx="32" cy="32" rx="7" ry="21" />
        <line x1="32" y1="11" x2="32" y2="53" />
      </g>
    </svg>
  );
}

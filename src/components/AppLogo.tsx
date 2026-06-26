"use client";

/** Nexus-App-Symbol (Netzwerk-/Knoten-Logo). Größe über `size`. */
export default function AppLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ flexShrink: 0 }}>
      <rect width="64" height="64" rx="14" fill="#3b82f6" />
      <g stroke="#ffffff" strokeWidth="3" strokeLinecap="round">
        <line x1="32" y1="32" x2="18" y2="16" />
        <line x1="32" y1="32" x2="48" y2="18" />
        <line x1="32" y1="32" x2="16" y2="46" />
        <line x1="32" y1="32" x2="46" y2="48" />
      </g>
      <g fill="#ffffff">
        <circle cx="32" cy="32" r="7" />
        <circle cx="18" cy="16" r="4.5" />
        <circle cx="48" cy="18" r="4.5" />
        <circle cx="16" cy="46" r="4.5" />
        <circle cx="46" cy="48" r="4.5" />
      </g>
    </svg>
  );
}

import { ImageResponse } from "next/og";

// Apple-Touch-Icon (iOS „Zum Home-Bildschirm"). PNG wird zur Build-/Laufzeit aus dem
// SVG-Logo gerendert (satori/resvg in next/og — keine native Bild-Bibliothek nötig).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#3b82f6"/>
  <g transform="translate(32 32) scale(0.82) translate(-32 -32)">
    <g stroke="#ffffff" stroke-width="3" stroke-linecap="round">
      <line x1="32" y1="32" x2="18" y2="16"/><line x1="32" y1="32" x2="48" y2="18"/>
      <line x1="32" y1="32" x2="16" y2="46"/><line x1="32" y1="32" x2="46" y2="48"/>
    </g>
    <g fill="#ffffff">
      <circle cx="32" cy="32" r="7"/><circle cx="18" cy="16" r="4.5"/>
      <circle cx="48" cy="18" r="4.5"/><circle cx="16" cy="46" r="4.5"/><circle cx="46" cy="48" r="4.5"/>
    </g>
  </g>
</svg>`;

export default function AppleIcon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(LOGO).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width={180} height={180} src={src} alt="Nexus" />
      </div>
    ),
    { ...size }
  );
}

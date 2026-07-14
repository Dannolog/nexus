import type { MetadataRoute } from "next";

/**
 * Web-App-Manifest — macht Nexus installierbar ("Zum Startbildschirm hinzufügen")
 * und öffnet die App ohne Browser-Leiste. `display_override` bevorzugt Vollbild,
 * fällt sonst auf standalone zurück.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Nexus — Stammdaten",
    short_name: "Nexus",
    description: "Zentrale Stammdaten-Verwaltung (Kunden, Projekte, Mitarbeiter, User)",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["fullscreen", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#0f1115",
    theme_color: "#3b82f6",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}

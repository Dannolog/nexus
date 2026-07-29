// Nexus-Fassung: ProjectEye zeigt hier über einen Live-Kanal an, wer gerade dasselbe
// Dokument offen hat. Nexus hat keinen solchen Kanal – deshalb bleibt die Anzeige leer.
// Die Schnittstelle bleibt erhalten, damit der übernommene Viewer unverändert läuft.
"use client";
import React from "react";

export function usePeers(_room) {
  return [];
}

export function PeerBadge({ peers }) {
  if (!peers || peers.length <= 1) return null;
  return null;
}

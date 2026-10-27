import crypto from "crypto";
import QR from "qrcode";
import { NextRequest } from "next/server";
import { ApiError } from "./http";

/**
 * Anmeldung per QR-Code – zentral für alle Apps (Register `auth.qr-login`, Vorlage ProjectEye
 * `server/qrlogin.js`).
 *
 *   PC/App   POST /api/auth/qr/start              { app?, basis? } → { id, key, qr (data:-URL), url, bis }
 *   PC/App   GET  /api/auth/qr/:id?k=<key>        → { status: wartet|frei|abgelehnt|abgelaufen, token?, identity? }
 *   Handy    GET  /api/auth/qr/:id/info           → { app, appName, geraet, ip, restSek }   (Nexus-Anmeldung)
 *   Handy    POST /api/auth/qr/:id/freigeben      → { ok }      Body { ablehnen?: true }
 *
 * Der QR-Code zeigt auf die Nexus-Seite `/qr/<id>`: Das Handy muss nur in Nexus angemeldet sein.
 * `id` steht im QR-Code; `key` kennt nur der anfragende PC – ein abfotografierter Code nützt nichts.
 * Bei der Freigabe stellt Nexus ein **eigenes** Token für den PC aus (nie das des Handys). Es wird
 * genau einmal ausgeliefert und danach vergessen. Die App-Freigabe wird beim Freigeben geprüft.
 */

export const GUELTIG_MS = 2 * 60 * 1000;
const MAX_OFFEN = 300;

export const APP_NAMEN: Record<string, string> = {
  nexus: "Nexus", kontor: "kontor", clocker: "clocker", cnc: "xCAM", schaltplan: "xDRAW",
  xcat: "xCAT", projecteye: "ProjectEye", vision: "Vision",
};

type Offen = {
  key: string; app: string; bis: number; ip: string; ua: string;
  frei: { token: string; identity: any } | null; abgelehnt: boolean;
};

// Über Hot-Reload und alle Routen hinweg derselbe Speicher
const g = globalThis as any;
const offen: Map<string, Offen> = g.__nexusQrOffen || (g.__nexusQrOffen = new Map());
const proIp: Map<string, number[]> = g.__nexusQrIp || (g.__nexusQrIp = new Map());

const zufall = (n: number) => crypto.randomBytes(n).toString("base64url");
const gleich = (a: string, b: string) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function ipVon(req: NextRequest) {
  const f = String(req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "").split(",")[0].trim();
  return f.replace(/^::ffff:/, "") || "unbekannt";
}

export function geraetVon(ua: string) {
  ua = String(ua || "");
  const bs = /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "Mac" : /Android/i.test(ua) ? "Android"
    : /iPhone|iPad/i.test(ua) ? "iPhone/iPad" : /Linux/i.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, bs].filter(Boolean).join(" · ") || "Unbekanntes Gerät";
}

function aufraeumen() {
  const nun = Date.now();
  for (const [id, s] of offen) if (s.bis + 60000 < nun) offen.delete(id);
}

/** Neuen Code anlegen. `basis` = öffentliche Nexus-Adresse, die das Handy erreicht. */
export async function starten(opt: { app: string; basis: string; ip: string; ua: string }) {
  aufraeumen();
  const nun = Date.now();
  const l = (proIp.get(opt.ip) || []).filter((t) => t > nun - 60000);
  if (l.length >= 20 || offen.size >= MAX_OFFEN) throw new ApiError("Zu viele QR-Codes – bitte kurz warten.", 429);
  l.push(nun); proIp.set(opt.ip, l);
  const id = zufall(18), key = zufall(24);
  const url = `${opt.basis}/qr/${id}`;
  offen.set(id, { key, app: opt.app, bis: nun + GUELTIG_MS, ip: opt.ip, ua: opt.ua.slice(0, 300), frei: null, abgelehnt: false });
  const qr = await QR.toDataURL(url, { margin: 1, width: 300, errorCorrectionLevel: "M" });
  return { id, key, qr, url, bis: nun + GUELTIG_MS, gueltigSek: GUELTIG_MS / 1000 };
}

/** PC fragt nach. Ein freigegebenes Token wird genau einmal ausgeliefert. */
export function abfragen(id: string, key: string) {
  const s = offen.get(id);
  if (!s || !gleich(s.key, key || "")) return { status: "abgelaufen" };
  if (s.frei) { offen.delete(id); return { status: "frei", ...s.frei }; }
  if (s.abgelehnt) { offen.delete(id); return { status: "abgelehnt" }; }
  if (Date.now() > s.bis) { offen.delete(id); return { status: "abgelaufen" }; }
  return { status: "wartet", restSek: Math.ceil((s.bis - Date.now()) / 1000) };
}

/** Offener, noch nicht entschiedener Code (für das Handy). */
export function holen(id: string) {
  const s = offen.get(id);
  if (!s || s.frei || s.abgelehnt || Date.now() > s.bis) {
    throw new ApiError("Der QR-Code ist abgelaufen oder wurde schon benutzt. Am PC erscheint gleich ein neuer.", 410);
  }
  return s;
}

export function entscheiden(id: string, ergebnis: { token: string; identity: any } | null) {
  const s = holen(id);
  if (ergebnis) s.frei = ergebnis; else s.abgelehnt = true;
  s.bis = Math.max(s.bis, Date.now() + 30000); // PC hat noch 30 s zum Abholen
  return s;
}

/** Nur eine schlichte Adresse (Schema + Host + Port) ist als Basis erlaubt. */
export function basisPruefen(roh: unknown, req: NextRequest) {
  const b = String(roh || "").replace(/\/+$/, "");
  if (/^https?:\/\/[^\s/?#@]+$/i.test(b)) return b;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3050";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

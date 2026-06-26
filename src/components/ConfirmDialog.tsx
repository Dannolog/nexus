"use client";
import { useEffect } from "react";

/**
 * Moderne Bestätigungsabfrage (Modal) — ersetzt window.confirm.
 * Standardmäßig auf „gefährliche" Aktionen (Löschen) ausgelegt.
 */
export default function ConfirmDialog({
  open,
  title = "Wirklich löschen?",
  message,
  confirmLabel = "🗑️ Löschen",
  cancelLabel = "✖ Abbrechen",
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 16, zIndex: 100 }}
    >
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ padding: 24, width: 420, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div
            style={{
              width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 22, flexShrink: 0,
              background: danger ? "rgba(239,68,68,.12)" : "rgba(59,130,246,.12)",
            }}
          >
            {danger ? "⚠️" : "❓"}
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h2>
        </div>
        {message && <div className="muted" style={{ fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>{message}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onCancel} autoFocus>{cancelLabel}</button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            style={danger ? { background: "#ef4444", borderColor: "#ef4444" } : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

import { X } from "lucide-react";

export const COLOR = {
  bg: "#EEEEE3",
  bgCard: "#FFFFFF",
  ink: "#26301F",
  inkSoft: "#5C6952",
  line: "#DCDBC9",
  gemeinsam: "#3B5BA5",
  gemeinsamBg: "#E7ECF7",
  privat: "#7B5EA7",
  privatBg: "#F0EAF6",
  dringend: "#C0392B",
  dringendBg: "#FBE8E5",
  erledigt: "#4C7A3D",
  erledigtBg: "#E9F1E4",
  uebernommen: "#B9862B",
  uebernommenBg: "#F8EFDD",
  accent: "#8A6D3B",
};

export const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');`;

export const HEALTH_LABELS = {
  impfung: { label: "Impfung" },
  hufschmied: { label: "Hufschmied" },
  zahnarzt: { label: "Zahnarzt" },
  entwurmung: { label: "Entwurmung" },
};

export const HEALTH_DEFAULT_INTERVAL = { impfung: 6, hufschmied: 2, zahnarzt: 12, entwurmung: 3 };

export const TASK_TYPES = {
  uebernahme: "Übernahme erforderlich",
  uebernahme_erledigt: "Übernahme + Erledigung",
  info: "Information / Termin",
};

function pad2(n) { return String(n).padStart(2, "0"); }
// Wandelt ein Date-Objekt in einen "YYYY-MM-DD"-String anhand der LOKALEN Zeit um
// (nie toISOString() für Datums-Strings verwenden – das rechnet in UTC und
// verschiebt bei Zeitzonen wie Deutschland (UTC+1/+2) das Datum leicht daneben).
export function dateToISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function parseISODate(iso) {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day); // lokale Mitternacht, kein UTC-String-Parsing
}
const parseISO = parseISODate;

export function todayISO() { return dateToISO(new Date()); }
export function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return dateToISO(d); }
export function addMonths(iso, n) { const d = parseISO(iso); d.setMonth(d.getMonth() + n); return dateToISO(d); }
export function fmtDate(iso) {
  if (!iso) return "";
  const d = parseISO(iso);
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}
export function daysUntil(iso) {
  const a = parseISO(todayISO()); const b = parseISO(iso);
  return Math.round((b - a) / 86400000);
}
// Nächster Fälligkeitstermin: direkt gesetztes Datum (item.next) hat Vorrang,
// sonst berechnet aus letztem Termin + Intervall (in Monaten).
export function nextDue(item) {
  if (item.next) return item.next;
  if (!item.last) return null;
  return addMonths(item.last, item.interval ?? 6);
}

export function Pill({ children, bg, fg, style }) {
  return (
    <span style={{ background: bg, color: fg, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, ...style }}>
      {children}
    </span>
  );
}

export function Card({ children, style, onClick }) {
  return (
    <div onClick={onClick} style={{ background: COLOR.bgCard, border: `1px solid ${COLOR.line}`, borderRadius: 14, padding: 16, ...style }}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "22px 0 10px" }}>
      <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 19, color: COLOR.ink, margin: 0 }}>{children}</h2>
      {right}
    </div>
  );
}

export function IconBtn({ onClick, children, label }) {
  return (
    <button onClick={onClick} aria-label={label} style={{
      display: "flex", alignItems: "center", gap: 6, background: COLOR.ink, color: "#fff",
      border: "none", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
      fontFamily: "Inter, sans-serif",
    }}>{children}</button>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(38,48,31,0.45)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: COLOR.bgCard, width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto",
        borderRadius: "18px 18px 0 0", padding: 20, fontFamily: "Inter, sans-serif",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, margin: 0, color: COLOR.ink }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ text }) {
  return <div style={{ color: COLOR.inkSoft, fontSize: 13, padding: "6px 2px 14px", fontStyle: "italic" }}>{text}</div>;
}

export const inputStyle = {
  width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${COLOR.line}`,
  fontFamily: "Inter, sans-serif", fontSize: 14, marginBottom: 10, boxSizing: "border-box", color: COLOR.ink, background: "#FBFBF6",
};
export const labelStyle = { fontSize: 12, fontWeight: 600, color: COLOR.inkSoft, marginBottom: 4, display: "block" };
export const btnPrimary = { background: COLOR.ink, color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
export const btnGhost = { background: "none", color: COLOR.inkSoft, border: `1px solid ${COLOR.line}`, borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
export const navBtn = { background: "#fff", border: `1px solid ${COLOR.line}`, borderRadius: 8, padding: 6, cursor: "pointer", color: COLOR.ink };
export const wrap = { background: COLOR.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto", fontFamily: "Inter, sans-serif", padding: "0 16px" };

/** Date/number formatting in the user's time zone (falls back to the browser's). */

let userTz: string | undefined;
export function setUserTimeZone(tz: string | undefined) {
  userTz = tz;
}
export const tz = () => userTz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

const f = (opts: Intl.DateTimeFormatOptions) => (d: string | Date) => new Intl.DateTimeFormat(undefined, { timeZone: tz(), ...opts }).format(new Date(d));

export const fmtDate = f({ day: "numeric", month: "short", year: "numeric" });
export const fmtDay = f({ weekday: "short", day: "numeric", month: "short" });
export const fmtLongDay = f({ weekday: "long", day: "numeric", month: "long" });
export const fmtTime = f({ hour: "2-digit", minute: "2-digit" });
export const fmtDateTime = (d: string | Date) => `${fmtDay(d)}, ${fmtTime(d)}`;

export function fmtMinutes(mins: number) {
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function fmtDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** "in 3 days", "in 5 h", "2 days ago" */
export function relative(d: string | Date, now = Date.now()) {
  const diff = new Date(d).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60 * 60_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 36 * 3600_000) return rtf.format(Math.round(diff / 3600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

export function greeting(date = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz(), hour: "numeric", hourCycle: "h23" }).format(date));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Value for <input type="datetime-local"> from an ISO instant, in the browser's zone. */
export function toLocalInput(d: string | Date) {
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}
/** ISO instant (with offset) from a datetime-local value. */
export const fromLocalInput = (v: string) => new Date(v).toISOString();

export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${n}%`);

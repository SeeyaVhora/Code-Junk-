/**
 * Time-zone helpers built on Intl (no extra dependency). All instants are UTC Dates;
 * "local" means the user's IANA zone from UserPreferences.timeZone.
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function parts(date: Date, tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    dtfCache.set(tz, f);
  }
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return o;
}

/** "YYYY-MM-DD" of the instant in the given zone. */
export function localDateKey(date: Date, tz: string) {
  const p = parts(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 0 = Sunday … 6 = Saturday, in the given zone. */
export function localWeekday(date: Date, tz: string) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts(date, tz).weekday!);
}

/** Offset of the zone from UTC at that instant, in minutes. */
function offsetMinutes(date: Date, tz: string) {
  const p = parts(date, tz);
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** UTC instant of local midnight on the given "YYYY-MM-DD" date in the zone (DST-safe). */
export function startOfLocalDay(dateKey: string, tz: string) {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const guess = new Date(Date.UTC(y, m - 1, d));
  const first = new Date(guess.getTime() - offsetMinutes(guess, tz) * 60_000);
  // Re-check once: the offset can differ on either side of a DST change.
  return new Date(guess.getTime() - offsetMinutes(first, tz) * 60_000);
}

export function addDaysToKey(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** [start, end) of the local day containing `now`. */
export function localDayRange(now: Date, tz: string) {
  const key = localDateKey(now, tz);
  return { key, start: startOfLocalDay(key, tz), end: startOfLocalDay(addDaysToKey(key, 1), tz) };
}

/** [start, end) of the local week containing `now`, starting on `weekStartsOn` (0 = Sunday). */
export function localWeekRange(now: Date, tz: string, weekStartsOn = 1) {
  const key = localDateKey(now, tz);
  const back = (localWeekday(now, tz) - weekStartsOn + 7) % 7;
  const startKey = addDaysToKey(key, -back);
  return { startKey, start: startOfLocalDay(startKey, tz), end: startOfLocalDay(addDaysToKey(startKey, 7), tz) };
}

/** A `@db.Date` column value for the local date (Prisma stores it as UTC midnight). */
export function dateColumn(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

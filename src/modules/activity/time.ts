export function wallTime(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (key: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}
/** Resolve a wall time without silently choosing one side of a DST fold or normalizing a nonexistent time. */
export function resolveWallTime(value: string, timezone: string, unchanged?: string): string {
  const match = /^(1999|20\d\d|210[01])-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw Error("Revisa la fecha y la hora.");
  const [, y, m, d, h, minute, seconds = "00"] = match;
  const canonical = `${y}-${m}-${d}T${h}:${minute}:${seconds}`;
  if (unchanged && wallTime(unchanged, timezone) === canonical) return new Date(unchanged).toISOString();
  const wall = Date.UTC(+y, +m - 1, +d, +h, +minute, +seconds), candidates = new Set<string>();
  for (const shift of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = wall + shift * 3600000;
    const local = wallTime(new Date(sample).toISOString(), timezone);
    const offset = new Date(local + "Z").getTime() - sample;
    const candidate = new Date(wall - offset).toISOString();
    if (wallTime(candidate, timezone) === canonical) candidates.add(candidate);
  }
  if (!candidates.size) throw Error("Esa hora no existe en la zona de tu organización. Elige otra.");
  if (candidates.size !== 1) throw Error("Esa hora se repite por el cambio de horario. Elige otra hora.");
  return [...candidates][0];
}
export function displayInstant(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

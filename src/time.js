// The shop runs on India time, but the server might not (most hosts use UTC).
// These helpers read and build IST wall-clock times no matter where the code runs.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// A Date whose getUTC* fields show the current IST wall-clock time.
export const istNow = (now = Date.now()) => new Date(now + IST_OFFSET_MS);

// "2026-10-18T12:30" (IST) -> real instant, or null if malformed.
export function parseIstDateTime(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const wall = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (wall.getUTCMonth() !== mo - 1 || wall.getUTCDate() !== d || h > 23 || mi > 59) return null;
  return { instant: new Date(wall.getTime() - IST_OFFSET_MS), wall, minutes: h * 60 + mi, weekday: wall.getUTCDay() };
}

// "2026-10-18" (IST calendar date) -> wall-clock midnight, or null.
export function parseIstDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const wall = new Date(Date.UTC(y, mo - 1, d));
  if (wall.getUTCMonth() !== mo - 1 || wall.getUTCDate() !== d) return null;
  return { wall, weekday: wall.getUTCDay() };
}

// Midnight of today's IST date, as a wall-clock Date.
export const istToday = (now = Date.now()) => {
  const n = istNow(now);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};

export const fmtWall = (wall, withTime = true) => {
  const p = (x) => String(x).padStart(2, "0");
  const date = `${wall.getUTCFullYear()}-${p(wall.getUTCMonth() + 1)}-${p(wall.getUTCDate())}`;
  return withTime ? `${date} ${p(wall.getUTCHours())}:${p(wall.getUTCMinutes())}` : date;
};

export const DAY_MS = 24 * 60 * 60 * 1000;

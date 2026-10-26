// Pure helpers for the home page "About Me" section and the Staff Goals
// celebrations strip: weekly hours vs goal, and birthday / work anniversary
// countdowns. All dates are YYYY-MM-DD strings (pass ctToday() as `today`).

export interface WeekHours {
  weekStart: string; // Monday, YYYY-MM-DD
  minutes: number;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(s: string, n: number): string {
  const d = parseYmd(s);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86_400_000);
}

/** Monday of the week containing `date`. */
export function weekStartOf(date: string): string {
  const dow = parseYmd(date).getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** Minutes logged per Monday-to-Sunday week, oldest first, ending with the current week. */
export function weeklyHours(entries: { date: string; durationMinutes: number }[], today: string, weeks = 8): WeekHours[] {
  const current = weekStartOf(today);
  const out: WeekHours[] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ weekStart: addDays(current, -7 * i), minutes: 0 });
  const index = new Map(out.map((w, i) => [w.weekStart, i]));
  for (const e of entries) {
    if (!e.date) continue;
    const i = index.get(weekStartOf(e.date.slice(0, 10)));
    if (i !== undefined) out[i].minutes += e.durationMinutes || 0;
  }
  return out;
}

/** Consecutive completed weeks (most recent first, current week excluded) at or above target. */
export function goalStreak(weeks: WeekHours[], targetHours: number | undefined): number {
  if (!targetHours) return 0;
  let n = 0;
  for (let i = weeks.length - 2; i >= 0; i--) {
    if (weeks[i].minutes >= targetHours * 60) n++;
    else break;
  }
  return n;
}

/** "MM-DD" if valid, else null. Accepts "MM-DD" or a full "YYYY-MM-DD". */
export function normalizeMonthDay(v: string | null | undefined): string | null {
  const m = (v ?? "").trim().match(/^(?:\d{4}-)?(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const mo = Number(m[1]);
  const d = Number(m[2]);
  const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (!maxDay || d < 1 || d > maxDay) return null;
  return `${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Next date (today or later) falling on month-day "MM-DD". Feb 29 falls back to Feb 28 in non-leap years. */
export function nextOccurrence(monthDay: string, today: string): string {
  const [mo, d] = monthDay.split("-").map(Number);
  const year = Number(today.slice(0, 4));
  const on = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const day = mo === 2 && d === 29 && !leap ? 28 : d;
    return `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  const thisYear = on(year);
  return thisYear >= today ? thisYear : on(year + 1);
}

export interface Celebration {
  kind: "birthday" | "anniversary";
  date: string;       // next occurrence, YYYY-MM-DD
  daysAway: number;   // 0 = today
  years?: number;     // anniversary: years being completed on `date`
}

export function nextBirthday(birthday: string | undefined, today: string): Celebration | null {
  const md = normalizeMonthDay(birthday);
  if (!md) return null;
  const date = nextOccurrence(md, today);
  return { kind: "birthday", date, daysAway: daysBetween(today, date) };
}

/** Next work anniversary. Null until a hire date is set; a hire date in the future has none yet. */
export function nextAnniversary(hireDate: string | undefined, today: string): Celebration | null {
  if (!hireDate || !/^\d{4}-\d{2}-\d{2}/.test(hireDate)) return null;
  const hire = hireDate.slice(0, 10);
  if (hire > today) return null;
  let date = nextOccurrence(hire.slice(5), today);
  if (date === hire) date = nextOccurrence(hire.slice(5), addDays(today, 1)); // hired today: first anniversary is next year
  return { kind: "anniversary", date, daysAway: daysBetween(today, date), years: Number(date.slice(0, 4)) - Number(hire.slice(0, 4)) };
}

/** Whole years since hire date. */
export function yearsOfService(hireDate: string | undefined, today: string): number | null {
  if (!hireDate || !/^\d{4}-\d{2}-\d{2}/.test(hireDate) || hireDate.slice(0, 10) > today) return null;
  const hire = hireDate.slice(0, 10);
  let years = Number(today.slice(0, 4)) - Number(hire.slice(0, 4));
  if (today.slice(5) < hire.slice(5)) years--;
  return years;
}

/** Days into the current Monday-to-Sunday week, 1 (Monday) to 7 (Sunday). */
export function dayOfWeek(today: string): number {
  return daysBetween(weekStartOf(today), today) + 1;
}

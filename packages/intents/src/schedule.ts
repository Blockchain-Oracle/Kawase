// When an automation runs, as pure functions (Stage 8): the next occurrences of "every Tuesday at 09:00" in the
// person's own time zone, and the on-chain period that bounds it. Local wall time is turned into an instant with
// the zone's offset at that instant (looked up twice, so a run near a daylight-saving change lands on the right
// side), using only `Intl` — no date library.

export type Schedule = {
  every: "day" | "week" | "month";
  /** 0 = Sunday … 6 = Saturday, for weekly. */
  weekday?: number | undefined;
  /** 1–28, for monthly (no month lacks them). */
  monthday?: number | undefined;
  /** "HH:MM", local to `timezone`. */
  time: string;
  timezone: string;
};

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const DAYS_PER_WEEK = 7;
const MAX_MONTHDAY = 28;
const SECONDS_PER_DAY = 86_400;
const SEARCH_DAYS = 70;

/**
 * The grant's period for a schedule. Monthly uses 28 days: a calendar month is never shorter, so two monthly runs
 * can never fall in the same period, and the cap still allows exactly one run per period.
 */
export const schedulePeriodSeconds = (schedule: Schedule) =>
  schedule.every === "day" ? SECONDS_PER_DAY : schedule.every === "week" ? DAYS_PER_WEEK * SECONDS_PER_DAY : MAX_MONTHDAY * SECONDS_PER_DAY;

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

type Local = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The wall-clock reading of an instant in a zone. */
function localParts(instant: Date, timezone: string): Local {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    weekday: WEEKDAYS.indexOf(value("weekday")),
  };
}

/** The zone's offset from UTC at an instant, in minutes. */
function offsetMinutes(instant: Date, timezone: string): number {
  const local = localParts(instant, timezone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  return Math.round((asUtc - Math.floor(instant.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE) / MS_PER_MINUTE);
}

/** The instant a local wall time happens in a zone. */
function atLocal(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMinutes(new Date(guess), timezone) * MS_PER_MINUTE;
  return new Date(guess - offsetMinutes(new Date(first), timezone) * MS_PER_MINUTE);
}

const MAX_HOUR = 23;
const MAX_MINUTE = MINUTES_PER_HOUR - 1;

const parseTime = (time: string) => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return { hour: Math.min(Math.max(hour, 0), MAX_HOUR), minute: Math.min(Math.max(minute, 0), MAX_MINUTE) };
};

/** The next `count` runs strictly after `after`. */
export function nextRuns(schedule: Schedule, after: Date, count: number): Date[] {
  const { hour, minute } = parseTime(schedule.time);
  const start = localParts(after, schedule.timezone);
  const runs: Date[] = [];
  // Walk local calendar days from the day of `after`; a month's run is on `monthday`, a week's on `weekday`.
  for (let offset = 0; runs.length < count && offset < SEARCH_DAYS * count; offset++) {
    const day = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    const weekday = day.getUTCDay();
    const matches =
      schedule.every === "day" ||
      (schedule.every === "week" && weekday === (schedule.weekday ?? start.weekday)) ||
      (schedule.every === "month" && d === Math.min(schedule.monthday ?? start.day, MAX_MONTHDAY));
    if (!matches) continue;
    const instant = atLocal(y, m, d, hour, minute, schedule.timezone);
    if (instant.getTime() > after.getTime()) runs.push(instant);
  }
  return runs;
}

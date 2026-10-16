import { WEEKS, DAYS_PER_WEEK } from '../config.js';
import { startOfDay, startOfWeek, toLocalDateKey } from '../utils/dates.js';
import { mulberry32 } from '../utils/random.js';

export function buildMockContributionData(selectedYear) {
  const today = startOfDay(new Date());
  const firstDay = startOfWeek(new Date(Number(selectedYear), 0, 1));

  const random = mulberry32(20260921);
  const data = [];

  for (let week = 0; week < getWeeksForYear(Number(selectedYear)); week += 1) {
    for (let weekday = 0; weekday < DAYS_PER_WEEK; weekday += 1) {
      const date = new Date(firstDay);
      date.setDate(firstDay.getDate() + week * DAYS_PER_WEEK + weekday);

      const isFuture = date > today || date.getFullYear() !== Number(selectedYear);
      const count = isFuture ? 0 : generateContributionCount(random, week, weekday);

      data.push({
        date: toLocalDateKey(date),
        count,
        week,
        weekday,
        isFuture,
        isOutsideYear: date.getFullYear() !== Number(selectedYear),
      });
    }
  }

  return data;
}

export function normalizeContributionData(entries, year) {
  if (!Array.isArray(entries)) return null;

  const byDate = new Map(entries.map((entry) => [entry.date, Number(entry.count) || 0]));
  const today = startOfDay(new Date());
  const firstDay = startOfWeek(new Date(year, 0, 1));
  const data = [];

  for (let week = 0; week < getWeeksForYear(year); week += 1) {
    for (let weekday = 0; weekday < DAYS_PER_WEEK; weekday += 1) {
      const date = new Date(firstDay);
      date.setDate(firstDay.getDate() + week * DAYS_PER_WEEK + weekday);
      const dateKey = toLocalDateKey(date);
      data.push({
        date: dateKey,
        count: byDate.get(dateKey) ?? 0,
        week,
        weekday,
        isFuture: date > today || date.getFullYear() !== year,
        isOutsideYear: date.getFullYear() !== year,
      });
    }
  }

  return data;
}

export function generateContributionCount(random, week, weekday) {
  const weekdayBoost = weekday > 0 && weekday < 6 ? 1.1 : 0.55;
  const recentBoost = 0.55 + (week / (WEEKS - 1)) * 0.9;
  const activityChance = 0.48 * weekdayBoost * recentBoost;

  if (random() > Math.min(activityChance, 0.88)) return 0;

  const burst = random() > 0.84 ? 2.4 : 1;
  return Math.max(1, Math.round((1 + random() * 12) * recentBoost * burst));
}

export function getWeeksForYear(year) {
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  return Math.ceil((new Date(year, 0, 1).getDay() + daysInYear) / DAYS_PER_WEEK);
}

export function getContributionLevel(count) {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  if (count <= 13) return 3;
  return 4;
}

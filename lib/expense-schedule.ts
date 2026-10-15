export const CALENDAR_SCHEDULE_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  YEARLY: 12,
};

export function calendarPeriods(from: string, to: string, schedule: string) {
  const interval = CALENDAR_SCHEDULE_MONTHS[schedule];
  if (!interval || to < from) return [];
  const [firstYear, firstMonth] = from.split('-').map(Number);
  const firstIndex = firstYear * 12 + Math.floor((firstMonth - 1) / interval) * interval;
  const result: { start: string; end: string }[] = [];
  for (let index = firstIndex; ; index += interval) {
    const year = Math.floor(index / 12);
    const month = index % 12 + 1;
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    if (start > to) break;
    const endDate = new Date(Date.UTC(year, month - 1 + interval, 0));
    const end = endDate.toISOString().slice(0, 10);
    if (end >= from) result.push({ start, end });
  }
  return result;
}

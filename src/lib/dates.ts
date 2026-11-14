const pad = (n: number) => String(n).padStart(2, '0');

/** yyyy-mm-dd in the device's local time zone (what <input type="date"> expects). */
export const toDateInput = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** hh:mm in local time (what <input type="time"> expects). */
export const toTimeInput = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Parse the pair of <input> values into a Date; returns null when invalid. */
export const fromInputs = (date: string, time: string): Date | null => {
  if (!date) return null;
  const d = new Date(`${date}T${time || '00:00'}`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const dayKey = (d: Date): string => toDateInput(d);

export const sameDay = (a: Date, b: Date): boolean => dayKey(a) === dayKey(b);

export const daysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);

export const daysInMonth = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

export const addMonths = (d: Date, n: number): Date => {
  const day = d.getDate();
  const out = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes());
  out.setDate(Math.min(day, daysInMonth(out)));
  return out;
};

export const monthLabel = (d: Date): string =>
  d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export const shortDate = (d: Date): string =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** "Today", "Yesterday" or "Mon, 12 Nov". */
export const dayLabel = (d: Date, now: Date = new Date()): string => {
  const diff = daysBetween(d, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

export const timeLabel = (d: Date): string =>
  d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

export const greeting = (now: Date = new Date()): string => {
  const h = now.getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export const isSameMonth = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

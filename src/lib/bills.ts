import type { Bill, BillFrequency } from '../db';
import { addMonths, daysBetween } from './dates';

export const FREQUENCIES: { id: BillFrequency; label: string }[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'once', label: 'One time' },
];

/** The due date that follows `due` for the given frequency; null for one-off bills. */
export const nextDueDate = (due: Date, frequency: BillFrequency): Date | null => {
  switch (frequency) {
    case 'weekly': {
      const d = new Date(due);
      d.setDate(d.getDate() + 7);
      return d;
    }
    case 'monthly':
      return addMonths(due, 1);
    case 'yearly':
      return addMonths(due, 12);
    default:
      return null;
  }
};

export type BillState = 'overdue' | 'today' | 'soon' | 'later';

export const billState = (bill: Bill, now: Date = new Date()): { state: BillState; days: number } => {
  const days = daysBetween(now, new Date(bill.dueDate));
  if (days < 0) return { state: 'overdue', days };
  if (days === 0) return { state: 'today', days };
  if (days <= 7) return { state: 'soon', days };
  return { state: 'later', days };
};

export const billCaption = (bill: Bill, now: Date = new Date()): string => {
  const { state, days } = billState(bill, now);
  if (state === 'overdue') return days === -1 ? 'Overdue by 1 day' : `Overdue by ${-days} days`;
  if (state === 'today') return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (state === 'soon') return `Due in ${days} days`;
  return `Due ${new Date(bill.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
};

export const sortBills = (bills: Bill[]): Bill[] =>
  [...bills].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

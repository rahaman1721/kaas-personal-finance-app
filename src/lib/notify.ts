import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Bill } from '../db';

const BASE = 71000; // notification id range reserved for bills

const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return BASE + (Math.abs(h) % 9000);
};

export const remindersSupported = (): boolean => Capacitor.isNativePlatform();

/** Ask for notification permission. Resolves true when granted. */
export const requestReminderPermission = async (): Promise<boolean> => {
  if (!remindersSupported()) return false;
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    const next = await LocalNotifications.requestPermissions();
    return next.display === 'granted';
  } catch {
    return false;
  }
};

/** Replace all scheduled bill reminders with one set that matches `bills`. */
export const syncBillReminders = async (bills: Bill[], enabled: boolean, currencyFmt: (n: number) => string): Promise<void> => {
  if (!remindersSupported()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter(n => n.id >= BASE && n.id < BASE + 20000);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) });
    if (!enabled) return;

    const now = Date.now();
    const notifications = bills.flatMap(bill => {
      const due = new Date(bill.dueDate);
      const dayOf = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 9, 0);
      const dayBefore = new Date(dayOf.getTime() - 86400000);
      const body = `${bill.name} · ${currencyFmt(bill.amount)}`;
      const id = hash(bill.id);
      return [
        { id: id, at: dayBefore, title: 'Bill due tomorrow', body },
        { id: id + 10000, at: dayOf, title: 'Bill due today', body },
      ]
        .filter(n => n.at.getTime() > now)
        .map(n => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true } }));
    });
    if (notifications.length) await LocalNotifications.schedule({ notifications });
  } catch {
    /* reminders are best-effort; never break the app */
  }
};

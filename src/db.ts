// ── KAAS data layer ──────────────────────────────────────────────
// Offline-first persistence in localStorage (sandboxed per-app on Android/iOS).
// Every write reports success, because localStorage throws when the quota is full.

export interface Transaction {
  id: string;
  type: 'expense' | 'income';
  amount: number;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  merchant: string;
  description?: string;
  date: string;
  paymentMethod: string;
  notes?: string;
  createdAt: string;
  receiptPhoto?: string;
  isUnnecessary?: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  type: 'expense' | 'income';
  color: string;
}

export interface QuickExpense {
  id: string;
  name: string;
  amount: number;
  categoryId: string;
  emoji: string;
}

export type BillFrequency = 'once' | 'weekly' | 'monthly' | 'yearly';

export interface Bill {
  id: string;
  name: string;
  amount: number;
  /** Next due date (ISO). Advances automatically when the bill is marked paid. */
  dueDate: string;
  categoryId: string;
  icon: string;
  frequency?: BillFrequency;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  icon: string;
  color: string;
}

export interface AppSettings {
  currency: string;
  userName: string;
  monthlyBudget: number;
  hasCompletedOnboarding: boolean;
  theme: 'system' | 'light' | 'dark';
  profilePic?: string;
  autoBackup?: boolean;
  remindersEnabled?: boolean;
}

export interface Snapshot {
  app: 'kaas';
  version: 2;
  exportedAt: string;
  transactions: Transaction[];
  settings: Partial<AppSettings>;
  quick: QuickExpense[];
  bills: Bill[];
  goals: Goal[];
  customCategories: Category[];
}

// ── Storage keys ─────────────────────────────────────────────────
const K = {
  TX: 'kaas_v2_transactions',
  SETTINGS: 'kaas_v2_settings',
  QUICK: 'kaas_v2_quick',
  BILLS: 'kaas_v2_bills',
  CUSTOM_CAT: 'kaas_v2_custom_cat',
  GOALS: 'kaas_v2_goals',
  AUTOBACKUP: 'kaas_v2_autobackup',
};
const DATA_KEYS = [K.TX, K.SETTINGS, K.QUICK, K.BILLS, K.CUSTOM_CAT, K.GOALS];

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

// ── Defaults ─────────────────────────────────────────────────────
const DEFAULT_EXPENSE_CATEGORIES: Category[] = [
  { id: 'food',     name: 'Food & Dining',     icon: 'restaurant',       type: 'expense', color: '#0B5D45' },
  { id: 'shopping', name: 'Shopping',          icon: 'shopping_bag',     type: 'expense', color: '#0B5D45' },
  { id: 'travel',   name: 'Travel & Commute',  icon: 'commute',          type: 'expense', color: '#0B5D45' },
  { id: 'home',     name: 'Home & Rent',       icon: 'home',             type: 'expense', color: '#0B5D45' },
  { id: 'bills',    name: 'Bills & Utilities', icon: 'receipt_long',     type: 'expense', color: '#0B5D45' },
  { id: 'health',   name: 'Health',            icon: 'medical_services', type: 'expense', color: '#0B5D45' },
  { id: 'fun',      name: 'Entertainment',     icon: 'sports_esports',   type: 'expense', color: '#0B5D45' },
  { id: 'family',   name: 'Family & Personal', icon: 'group',            type: 'expense', color: '#0B5D45' },
  { id: 'work',     name: 'Work & Office',     icon: 'work',             type: 'expense', color: '#0B5D45' },
  { id: 'other',    name: 'Other',             icon: 'category',         type: 'expense', color: '#0B5D45' },
];

const DEFAULT_INCOME_CATEGORIES: Category[] = [
  { id: 'salary',       name: 'Salary',           icon: 'payments',                    type: 'income', color: '#0B5D45' },
  { id: 'freelance',    name: 'Freelance',        icon: 'laptop',                      type: 'income', color: '#0B5D45' },
  { id: 'business',     name: 'Business',         icon: 'storefront',                  type: 'income', color: '#0B5D45' },
  { id: 'gift',         name: 'Gift & Bonus',     icon: 'featured_seasonal_and_gifts', type: 'income', color: '#0B5D45' },
  { id: 'returns',      name: 'Investments',      icon: 'trending_up',                 type: 'income', color: '#0B5D45' },
  { id: 'other_income', name: 'Other Income',     icon: 'account_balance_wallet',      type: 'income', color: '#0B5D45' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  currency: '₹',
  userName: '',
  monthlyBudget: 0,
  hasCompletedOnboarding: false,
  theme: 'system',
  autoBackup: true,
  remindersEnabled: false,
};

export const DEFAULT_QUICK: QuickExpense[] = [
  { id: 'q_coffee', name: 'Coffee / Tea', amount: 40, categoryId: 'food', emoji: 'local_cafe' },
  { id: 'q_lunch', name: 'Lunch', amount: 160, categoryId: 'food', emoji: 'restaurant' },
  { id: 'q_metro', name: 'Metro / Fuel', amount: 100, categoryId: 'travel', emoji: 'commute' },
  { id: 'q_grocery', name: 'Groceries', amount: 450, categoryId: 'shopping', emoji: 'shopping_cart' },
];

export const DEFAULT_GOALS: Goal[] = [
  { id: 'g_emergency', name: 'Emergency Fund', targetAmount: 100000, savedAmount: 25000, icon: 'shield', color: '#0B5D45' },
  { id: 'g_gadget', name: 'Work / Tech Setup', targetAmount: 60000, savedAmount: 18000, icon: 'laptop', color: '#0B5D45' },
];

// ── Normalisers: keep malformed or legacy records from breaking screens ──
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const validDate = (v: unknown): string => {
  const d = new Date(str(v));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

const normaliseTx = (t: Partial<Transaction>): Transaction | null => {
  const amount = num(t.amount);
  if (!t.id || amount <= 0) return null;
  const type = t.type === 'income' ? 'income' : 'expense';
  return {
    id: String(t.id),
    type,
    amount,
    categoryId: str(t.categoryId, type === 'income' ? 'other_income' : 'other'),
    categoryName: str(t.categoryName, 'Other'),
    categoryIcon: str(t.categoryIcon, 'category'),
    merchant: str(t.merchant, str(t.categoryName, 'Untitled')),
    description: t.description,
    date: validDate(t.date),
    paymentMethod: str(t.paymentMethod, 'Cash'),
    notes: t.notes && t.notes !== 'unnecessary:impulse' ? t.notes : undefined,
    createdAt: validDate(t.createdAt ?? t.date),
    receiptPhoto: t.receiptPhoto || undefined,
    isUnnecessary: type === 'expense' && !!t.isUnnecessary,
  };
};

const normaliseBill = (b: Partial<Bill>): Bill | null => {
  if (!b.id || !b.name || num(b.amount) <= 0) return null;
  const freq = b.frequency;
  return {
    id: String(b.id),
    name: String(b.name),
    amount: num(b.amount),
    dueDate: validDate(b.dueDate),
    categoryId: str(b.categoryId, 'bills'),
    icon: str(b.icon, 'receipt_long'),
    frequency: freq === 'once' || freq === 'weekly' || freq === 'yearly' ? freq : 'monthly',
  };
};

const normaliseGoal = (g: Partial<Goal>): Goal | null => {
  if (!g.id || !g.name || num(g.targetAmount) <= 0) return null;
  return {
    id: String(g.id),
    name: String(g.name),
    targetAmount: num(g.targetAmount),
    savedAmount: Math.max(0, num(g.savedAmount)),
    icon: str(g.icon, 'savings'),
    color: str(g.color, '#0B5D45'),
  };
};

const normaliseQuick = (q: Partial<QuickExpense>): QuickExpense | null => {
  if (!q.id || !q.name || num(q.amount) <= 0) return null;
  return {
    id: String(q.id),
    name: String(q.name),
    amount: num(q.amount),
    categoryId: str(q.categoryId, 'other'),
    emoji: str(q.emoji, 'bolt'),
  };
};

const list = <T>(raw: unknown, fn: (x: Partial<T>) => T | null): T[] =>
  Array.isArray(raw) ? raw.map(x => fn(x as Partial<T>)).filter((x): x is T => x !== null) : [];

// ── Settings (cached: formatCurrency runs on every row) ──────────
let settingsCache: AppSettings | null = null;

export const getSettings = (): AppSettings => {
  if (!settingsCache) settingsCache = { ...DEFAULT_SETTINGS, ...read<Partial<AppSettings>>(K.SETTINGS, {}) };
  return settingsCache;
};

export const saveSettings = (s: Partial<AppSettings>): boolean => {
  const next = { ...getSettings(), ...s };
  const ok = write(K.SETTINGS, next);
  if (ok) settingsCache = next;
  scheduleAutoBackup();
  return ok;
};

// ── Reads ────────────────────────────────────────────────────────
export const getTransactions = (): Transaction[] =>
  list<Transaction>(read<unknown>(K.TX, []), normaliseTx).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

export const getQuickExpenses = (): QuickExpense[] => list<QuickExpense>(read<unknown>(K.QUICK, []), normaliseQuick);
export const getBills = (): Bill[] => list<Bill>(read<unknown>(K.BILLS, []), normaliseBill);
export const getGoals = (): Goal[] => list<Goal>(read<unknown>(K.GOALS, []), normaliseGoal);
export const getCustomCategories = (): Category[] => {
  const raw = read<unknown>(K.CUSTOM_CAT, []);
  return Array.isArray(raw)
    ? (raw as Category[]).filter(c => c && c.id && c.name && (c.type === 'expense' || c.type === 'income'))
    : [];
};

export const getExpenseCategories = (): Category[] => [
  ...DEFAULT_EXPENSE_CATEGORIES,
  ...getCustomCategories().filter(c => c.type === 'expense'),
];
export const getIncomeCategories = (): Category[] => [
  ...DEFAULT_INCOME_CATEGORIES,
  ...getCustomCategories().filter(c => c.type === 'income'),
];
export const getAllCategories = (): Category[] => [...getExpenseCategories(), ...getIncomeCategories()];
export const isDefaultCategory = (id: string): boolean =>
  [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].some(c => c.id === id);

// ── Writes ───────────────────────────────────────────────────────
const writeTx = (txs: Transaction[]): boolean => {
  const ok = write(K.TX, txs);
  scheduleAutoBackup();
  return ok;
};

const rawTransactions = (): Transaction[] => list<Transaction>(read<unknown>(K.TX, []), normaliseTx);

export const saveTransaction = (tx: Transaction): boolean => writeTx([tx, ...rawTransactions()]);

export const updateTransaction = (updated: Transaction): boolean =>
  writeTx(rawTransactions().map(t => (t.id === updated.id ? updated : t)));

export const deleteTransaction = (id: string): boolean => writeTx(rawTransactions().filter(t => t.id !== id));

export const saveQuickExpenses = (q: QuickExpense[]): boolean => {
  const ok = write(K.QUICK, q);
  scheduleAutoBackup();
  return ok;
};
export const saveBills = (b: Bill[]): boolean => {
  const ok = write(K.BILLS, b);
  scheduleAutoBackup();
  return ok;
};
export const saveGoals = (g: Goal[]): boolean => {
  const ok = write(K.GOALS, g);
  scheduleAutoBackup();
  return ok;
};

export const saveCustomCategory = (cat: Category): boolean => {
  const ok = write(K.CUSTOM_CAT, [...getCustomCategories(), cat]);
  scheduleAutoBackup();
  return ok;
};

export const isCategoryInUse = (id: string): boolean =>
  rawTransactions().some(t => t.categoryId === id) ||
  getQuickExpenses().some(q => q.categoryId === id) ||
  getBills().some(b => b.categoryId === id);

/** Custom categories only, and only when nothing references them. */
export const deleteCustomCategory = (id: string): boolean => {
  if (isDefaultCategory(id) || isCategoryInUse(id)) return false;
  const ok = write(K.CUSTOM_CAT, getCustomCategories().filter(c => c.id !== id));
  scheduleAutoBackup();
  return ok;
};

export const initDB = (): void => {
  if (localStorage.getItem(K.TX) === null) write(K.TX, []);
  if (localStorage.getItem(K.SETTINGS) === null) write(K.SETTINGS, DEFAULT_SETTINGS);
  if (localStorage.getItem(K.QUICK) === null) write(K.QUICK, DEFAULT_QUICK);
  if (localStorage.getItem(K.BILLS) === null) write(K.BILLS, []);
  if (localStorage.getItem(K.GOALS) === null) write(K.GOALS, DEFAULT_GOALS);
};

export const clearAllData = (): void => {
  [...DATA_KEYS, K.AUTOBACKUP].forEach(k => localStorage.removeItem(k));
  settingsCache = null;
};

// ── Snapshots: export, import, automatic backup ──────────────────
export const exportSnapshot = (): Snapshot => ({
  app: 'kaas',
  version: 2,
  exportedAt: new Date().toISOString(),
  transactions: rawTransactions(),
  settings: getSettings(),
  quick: getQuickExpenses(),
  bills: getBills(),
  goals: getGoals(),
  customCategories: getCustomCategories(),
});

export type ImportCheck =
  | { ok: true; snapshot: Snapshot; counts: { transactions: number; bills: number; goals: number } }
  | { ok: false; error: string };

/** Validate untrusted backup text before it is allowed to replace anything. */
export const parseSnapshot = (text: string): ImportCheck => {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.transactions)) {
    return { ok: false, error: 'This does not look like a KAAS backup.' };
  }
  const snapshot: Snapshot = {
    app: 'kaas',
    version: 2,
    exportedAt: str(data.exportedAt, new Date().toISOString()),
    transactions: list<Transaction>(data.transactions, normaliseTx),
    settings: (data.settings && typeof data.settings === 'object' ? data.settings : {}) as Partial<AppSettings>,
    quick: list<QuickExpense>(data.quick, normaliseQuick),
    bills: list<Bill>(data.bills, normaliseBill),
    goals: list<Goal>(data.goals, normaliseGoal),
    customCategories: Array.isArray(data.customCategories) ? (data.customCategories as Category[]) : [],
  };
  return {
    ok: true,
    snapshot,
    counts: { transactions: snapshot.transactions.length, bills: snapshot.bills.length, goals: snapshot.goals.length },
  };
};

/** Replace all data with the snapshot. The device-only profile photo is kept. */
export const applySnapshot = (s: Snapshot): boolean => {
  const pic = getSettings().profilePic;
  const settings = { ...DEFAULT_SETTINGS, ...s.settings, hasCompletedOnboarding: true, profilePic: s.settings.profilePic ?? pic };
  const ok =
    write(K.TX, s.transactions) &&
    write(K.SETTINGS, settings) &&
    write(K.QUICK, s.quick) &&
    write(K.BILLS, s.bills) &&
    write(K.GOALS, s.goals) &&
    write(K.CUSTOM_CAT, s.customCategories);
  settingsCache = null;
  return ok;
};

/** The automatic backup leaves out photos so it does not double storage use. */
let backupTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleAutoBackup(): void {
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    if (!getSettings().autoBackup) return;
    const snap = exportSnapshot();
    snap.transactions = snap.transactions.map(t => ({ ...t, receiptPhoto: undefined }));
    snap.settings = { ...snap.settings, profilePic: undefined };
    write(K.AUTOBACKUP, snap);
  }, 600);
}

export const getAutoBackupInfo = (): { at: string; transactions: number } | null => {
  const snap = read<Snapshot | null>(K.AUTOBACKUP, null);
  return snap && Array.isArray(snap.transactions) ? { at: snap.exportedAt, transactions: snap.transactions.length } : null;
};

/** Restore the automatic backup, re-attaching photos from records that still exist. */
export const restoreAutoBackup = (): boolean => {
  const check = parseSnapshot(JSON.stringify(read<unknown>(K.AUTOBACKUP, null)));
  if (!check.ok) return false;
  const photos = new Map(rawTransactions().filter(t => t.receiptPhoto).map(t => [t.id, t.receiptPhoto]));
  check.snapshot.transactions = check.snapshot.transactions.map(t => ({ ...t, receiptPhoto: photos.get(t.id) }));
  return applySnapshot(check.snapshot);
};

/** Approximate bytes this app holds in storage (UTF-16, two bytes per character). */
export const storageUsedBytes = (): number => {
  let chars = 0;
  [...DATA_KEYS, K.AUTOBACKUP].forEach(k => {
    chars += (localStorage.getItem(k) ?? '').length;
  });
  return chars * 2;
};

// ── Formatting ───────────────────────────────────────────────────
export const CURRENCIES = ['₹', '$', '€', '£', 'AED', 'SAR', 'SGD'] as const;

const symbolFor = (raw: string): string => {
  const r = raw === 'INR' ? '₹' : raw;
  return /^[A-Za-z]+$/.test(r) ? `${r} ` : r;
};

const groupingLocale = (raw: string): string => (raw === '₹' || raw === 'INR' ? 'en-IN' : 'en-US');

export const formatCurrency = (amount: number, customCurrency?: string): string => {
  const raw = customCurrency || getSettings().currency || '₹';
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  const body = Math.abs(n).toLocaleString(groupingLocale(raw), { maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + symbolFor(raw) + body;
};

/** 1.2k, 3.5L (lakh) for rupees, 1.2M otherwise. Used where space is tight. */
export const formatCompact = (amount: number): string => {
  const raw = getSettings().currency || '₹';
  const abs = Math.abs(amount);
  const inr = raw === '₹' || raw === 'INR';
  const trim = (x: number) => String(Math.round(x * 10) / 10);
  if (inr && abs >= 1e7) return `${trim(abs / 1e7)}Cr`;
  if (inr && abs >= 1e5) return `${trim(abs / 1e5)}L`;
  if (!inr && abs >= 1e6) return `${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${trim(abs / 1e3)}k`;
  return String(Math.round(abs));
};

/** Parse what a person typed into an amount field. NaN when it is not a number. */
export const parseAmount = (input: string): number => {
  const cleaned = input.replace(/[,\s]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === '' || cleaned === '.') return NaN;
  return parseFloat(cleaned);
};

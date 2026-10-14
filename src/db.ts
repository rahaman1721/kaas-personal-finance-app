// ── KAAS Database Layer ──────────────────────────────────────────
// Uses localStorage (Capacitor wraps this with native secure storage on Android)

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

export interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  categoryId: string;
  icon: string;
}

export interface AppSettings {
  currency: string;
  userName: string;
  monthlyBudget: number;
  hasCompletedOnboarding: boolean;
  theme: 'system' | 'light' | 'dark';
  profilePic?: string;
  autoBackup?: boolean;
}

// ── Keys ────────────────────────────────────────────────────────
const K = {
  TX: 'kaas_v2_transactions',
  SETTINGS: 'kaas_v2_settings',
  QUICK: 'kaas_v2_quick',
  BILLS: 'kaas_v2_bills',
  CUSTOM_CAT: 'kaas_v2_custom_cat',
};

const parse = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

// ── Defaults ─────────────────────────────────────────────────────
const DEFAULT_EXPENSE_CATEGORIES: Category[] = [
  { id: 'food',     name: 'Food',     icon: '🍛', type: 'expense', color: '#FF6B35' },
  { id: 'shopping', name: 'Shopping', icon: '🛒', type: 'expense', color: '#9B59B6' },
  { id: 'travel',   name: 'Travel',   icon: '🚗', type: 'expense', color: '#E74C3C' },
  { id: 'home',     name: 'Home',     icon: '🏠', type: 'expense', color: '#27AE60' },
  { id: 'bills',    name: 'Bills',    icon: '💡', type: 'expense', color: '#F39C12' },
  { id: 'health',   name: 'Health',   icon: '💊', type: 'expense', color: '#E91E63' },
  { id: 'fun',      name: 'Fun',      icon: '🎬', type: 'expense', color: '#2196F3' },
  { id: 'family',   name: 'Family',   icon: '👨‍👩‍👧', type: 'expense', color: '#FF9800' },
  { id: 'work',     name: 'Work',     icon: '💼', type: 'expense', color: '#607D8B' },
  { id: 'other',    name: 'Other',    icon: '📦', type: 'expense', color: '#795548' },
];

const DEFAULT_INCOME_CATEGORIES: Category[] = [
  { id: 'salary',      name: 'Salary',    icon: '💼', type: 'income', color: '#087F5B' },
  { id: 'freelance',   name: 'Freelance', icon: '💻', type: 'income', color: '#087F5B' },
  { id: 'business',    name: 'Business',  icon: '🏢', type: 'income', color: '#087F5B' },
  { id: 'gift',        name: 'Gift',      icon: '🎁', type: 'income', color: '#087F5B' },
  { id: 'returns',     name: 'Returns',   icon: '📈', type: 'income', color: '#087F5B' },
  { id: 'other_income',name: 'Other',     icon: '📦', type: 'income', color: '#087F5B' },
];

const DEFAULT_QUICK: QuickExpense[] = [];

const DEFAULT_SETTINGS: AppSettings = {
  currency: 'INR',
  userName: 'You',
  monthlyBudget: 0,
  hasCompletedOnboarding: false,
  theme: 'light',
  autoBackup: true,
};

// ── Public API ───────────────────────────────────────────────────
export const initDB = () => {
  if (!localStorage.getItem(K.TX))       localStorage.setItem(K.TX,       JSON.stringify([]));
  if (!localStorage.getItem(K.SETTINGS)) localStorage.setItem(K.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
  if (!localStorage.getItem(K.QUICK))    localStorage.setItem(K.QUICK,    JSON.stringify(DEFAULT_QUICK));
  if (!localStorage.getItem(K.BILLS))    localStorage.setItem(K.BILLS,    JSON.stringify([]));
};

export const getTransactions   = (): Transaction[]  => parse<Transaction[]>(K.TX, []);
export const getSettings       = (): AppSettings    => ({ ...DEFAULT_SETTINGS, ...parse<Partial<AppSettings>>(K.SETTINGS, {}) });
export const getQuickExpenses  = (): QuickExpense[] => parse<QuickExpense[]>(K.QUICK, DEFAULT_QUICK);
export const getBills          = (): Bill[]         => parse<Bill[]>(K.BILLS, []);
export const getCustomCategories = (): Category[] => parse<Category[]>(K.CUSTOM_CAT, []);

export const getExpenseCategories = (): Category[] => [...DEFAULT_EXPENSE_CATEGORIES, ...getCustomCategories().filter(c => c.type === 'expense')];
export const getIncomeCategories = (): Category[] => [...DEFAULT_INCOME_CATEGORIES, ...getCustomCategories().filter(c => c.type === 'income')];
export const getAllCategories = (): Category[] => [...getExpenseCategories(), ...getIncomeCategories()];

export const saveCustomCategory = (cat: Category) => {
  const list = getCustomCategories();
  localStorage.setItem(K.CUSTOM_CAT, JSON.stringify([...list, cat]));
};

export const saveTransaction = (tx: Transaction) => {
  const list = getTransactions();
  localStorage.setItem(K.TX, JSON.stringify([tx, ...list]));
};

export const updateTransaction = (updated: Transaction) => {
  const list = getTransactions().map(t => t.id === updated.id ? updated : t);
  localStorage.setItem(K.TX, JSON.stringify(list));
};

export const deleteTransaction = (id: string) => {
  const list = getTransactions().filter(t => t.id !== id);
  localStorage.setItem(K.TX, JSON.stringify(list));
};

export const saveSettings = (s: Partial<AppSettings>) => {
  localStorage.setItem(K.SETTINGS, JSON.stringify({ ...getSettings(), ...s }));
};

export const saveQuickExpenses = (q: QuickExpense[]) => {
  localStorage.setItem(K.QUICK, JSON.stringify(q));
};

export const saveBills = (b: Bill[]) => {
  localStorage.setItem(K.BILLS, JSON.stringify(b));
};

export const clearAllData = () => {
  Object.values(K).forEach(k => localStorage.removeItem(k));
};

export const formatCurrency = (amount: number) => {
  const s = getSettings();
  const rawSym = s.currency || '₹';
  const sym = (rawSym === 'INR' || rawSym === '₹') ? '₹' : `${rawSym} `;
  return (amount < 0 ? '-' : '') + sym + Math.abs(amount).toLocaleString('en-IN');
};

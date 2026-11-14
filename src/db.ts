// ── KAAS Database Layer ──────────────────────────────────────────
// Offline-first persistence via localStorage (native sandboxed on Android/iOS)

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

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
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
}

// ── Storage Keys ──────────────────────────────────────────────────
const K = {
  TX: 'kaas_v2_transactions',
  SETTINGS: 'kaas_v2_settings',
  QUICK: 'kaas_v2_quick',
  BILLS: 'kaas_v2_bills',
  CUSTOM_CAT: 'kaas_v2_custom_cat',
  GOALS: 'kaas_v2_goals',
};

const parse = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

// ── Default Categories (Standard Material Symbols) ────────────────
const DEFAULT_EXPENSE_CATEGORIES: Category[] = [
  { id: 'food',     name: 'Food & Dining',     icon: 'restaurant',            type: 'expense', color: '#F97316' },
  { id: 'shopping', name: 'Shopping & Retail', icon: 'shopping_bag',          type: 'expense', color: '#8B5CF6' },
  { id: 'travel',   name: 'Travel & Commute',  icon: 'commute',               type: 'expense', color: '#EF4444' },
  { id: 'home',     name: 'Housing & Home',    icon: 'home',                  type: 'expense', color: '#10B981' },
  { id: 'bills',    name: 'Bills & Utilities', icon: 'receipt_long',          type: 'expense', color: '#F59E0B' },
  { id: 'health',   name: 'Health & Medical',  icon: 'medical_services',      type: 'expense', color: '#EC4899' },
  { id: 'fun',      name: 'Entertainment',     icon: 'sports_esports',        type: 'expense', color: '#3B82F6' },
  { id: 'family',   name: 'Family & Personal', icon: 'group',                 type: 'expense', color: '#FB923C' },
  { id: 'work',     name: 'Work & Office',     icon: 'work',                  type: 'expense', color: '#64748B' },
  { id: 'other',    name: 'General Expense',   icon: 'category',              type: 'expense', color: '#78716C' },
];

const DEFAULT_INCOME_CATEGORIES: Category[] = [
  { id: 'salary',      name: 'Salary & Wages',    icon: 'payments',               type: 'income', color: '#059669' },
  { id: 'freelance',   name: 'Freelance & Side',  icon: 'laptop',                 type: 'income', color: '#059669' },
  { id: 'business',    name: 'Business Inflow',   icon: 'domain',                 type: 'income', color: '#059669' },
  { id: 'gift',        name: 'Gift & Bonus',      icon: 'featured_seasonal_and_gifts', type: 'income', color: '#059669' },
  { id: 'returns',     name: 'Investment Yield',  icon: 'trending_up',            type: 'income', color: '#059669' },
  { id: 'other_income',name: 'Other Inflow',      icon: 'account_balance_wallet', type: 'income', color: '#059669' },
];

const DEFAULT_QUICK: QuickExpense[] = [
  { id: 'q-coffee',  name: 'Coffee',    amount: 80,  categoryId: 'food',     emoji: 'local_cafe' },
  { id: 'q-lunch',   name: 'Lunch',     amount: 180, categoryId: 'food',     emoji: 'restaurant' },
  { id: 'q-commute', name: 'Metro/Fuel',amount: 120, categoryId: 'travel',   emoji: 'commute' },
  { id: 'q-grocery', name: 'Grocery',   amount: 450, categoryId: 'shopping', emoji: 'shopping_cart' },
];

const DEFAULT_GOALS: Goal[] = [
  { id: 'g-emergency', name: 'Emergency Reserve', targetAmount: 100000, icon: 'shield', color: '#10B981' },
  { id: 'g-gadget',    name: 'Work Setup',        targetAmount: 80000,  icon: 'laptop', color: '#3B82F6' },
  { id: 'g-vacation',  name: 'Travel Fund',       targetAmount: 50000,  icon: 'flight_takeoff', color: '#F59E0B' },
];

const DEFAULT_SETTINGS: AppSettings = {
  currency: '₹',
  userName: 'You',
  monthlyBudget: 50000,
  hasCompletedOnboarding: true,
  theme: 'light',
  autoBackup: true,
};

// ── Database Accessors ────────────────────────────────────────────
export const initDB = () => {
  if (!localStorage.getItem(K.TX))       localStorage.setItem(K.TX,       JSON.stringify([]));
  if (!localStorage.getItem(K.SETTINGS)) localStorage.setItem(K.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
  if (!localStorage.getItem(K.QUICK))    localStorage.setItem(K.QUICK,    JSON.stringify(DEFAULT_QUICK));
  if (!localStorage.getItem(K.BILLS))    localStorage.setItem(K.BILLS,    JSON.stringify([]));
  if (!localStorage.getItem(K.GOALS))    localStorage.setItem(K.GOALS,    JSON.stringify(DEFAULT_GOALS));
};

export const getTransactions   = (): Transaction[]  => parse<Transaction[]>(K.TX, []);
export const getSettings       = (): AppSettings    => ({ ...DEFAULT_SETTINGS, ...parse<Partial<AppSettings>>(K.SETTINGS, {}) });
export const getQuickExpenses  = (): QuickExpense[] => parse<QuickExpense[]>(K.QUICK, DEFAULT_QUICK);
export const getBills          = (): Bill[]         => parse<Bill[]>(K.BILLS, []);
export const getGoals          = (): Goal[]         => parse<Goal[]>(K.GOALS, DEFAULT_GOALS);
export const getCustomCategories = (): Category[]   => parse<Category[]>(K.CUSTOM_CAT, []);

export const getExpenseCategories = (): Category[] => [
  ...DEFAULT_EXPENSE_CATEGORIES,
  ...getCustomCategories().filter(c => c.type === 'expense')
];

export const getIncomeCategories = (): Category[] => [
  ...DEFAULT_INCOME_CATEGORIES,
  ...getCustomCategories().filter(c => c.type === 'income')
];

export const getAllCategories = (): Category[] => [
  ...getExpenseCategories(),
  ...getIncomeCategories()
];

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

export const saveGoals = (g: Goal[]) => {
  localStorage.setItem(K.GOALS, JSON.stringify(g));
};

export const clearAllData = () => {
  Object.values(K).forEach(k => localStorage.removeItem(k));
};

export const formatCurrency = (amount: number, customCurrency?: string) => {
  const s = getSettings();
  const rawSym = customCurrency || s.currency || '₹';
  const sym = (rawSym === 'INR' || rawSym === '₹') ? '₹' : `${rawSym} `;
  const num = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return (num < 0 ? '-' : '') + sym + Math.abs(num).toLocaleString('en-IN');
};

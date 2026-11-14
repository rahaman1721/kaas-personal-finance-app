import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import {
  applySnapshot, clearAllData, deleteTransaction, exportSnapshot, formatCurrency, getAllCategories,
  getAutoBackupInfo, getBills, getGoals, getQuickExpenses, getSettings, getTransactions, initDB,
  parseSnapshot, restoreAutoBackup, saveBills, saveGoals, saveQuickExpenses, saveSettings,
  saveTransaction, updateTransaction,
  type AppSettings, type Bill, type Goal, type QuickExpense, type Transaction,
} from './db';
import { csvCell, deliverFile, pickTextFile } from './lib/files';
import { uid } from './lib/id';
import { nextDueDate } from './lib/bills';
import { compressImage, pickImage } from './lib/media';
import { OcrUnavailableError, scanNumbers, type NumberScan } from './lib/ocr';
import { remindersSupported, requestReminderPermission, syncBillReminders } from './lib/notify';
import { BusyDialog, ChoiceDialog, ConfirmDialog, CurrencyDialog, PromptDialog } from './components/Dialogs';
import { AddSheet, DetailSheet } from './components/TransactionSheets';
import { BillsSheet, CategoriesSheet, GoalsSheet, QuickSheet } from './components/ManageSheets';
import { ScanSheet } from './components/ScanSheet';
import { Onboarding } from './components/Onboarding';
import { Icon } from './components/ui';
import { ActivityScreen } from './screens/Activity';
import { HomeScreen, type Tab } from './screens/Home';
import { InsightsScreen } from './screens/Insights';
import { SettingsScreen, type SettingsAction } from './screens/Settings';

type SheetState =
  | { kind: 'add'; prefill?: Partial<Transaction> }
  | { kind: 'detail'; tx: Transaction }
  | { kind: 'scan'; photo: string; scan: NumberScan }
  | { kind: 'quick' }
  | { kind: 'bills' }
  | { kind: 'goals' }
  | { kind: 'categories' }
  | null;

type DialogState =
  | { kind: 'confirm'; title: string; body: string; confirmLabel: string; danger?: boolean; run: () => void }
  | { kind: 'prompt'; title: string; label: string; initial: string; field: 'userName' | 'monthlyBudget' }
  | { kind: 'currency' }
  | { kind: 'choice'; title: string; choices: { label: string; icon?: string; danger?: boolean; run: () => void }[] }
  | null;

interface ToastState {
  msg: string;
  error?: boolean;
  action?: { label: string; run: () => void };
}

const STORAGE_FULL = 'Storage is full. Remove some receipt photos or export a backup, then try again.';
const THEME_COLOR = { light: '#f5f1e6', dark: '#11140f' };

function Splash({ onDone }: { onDone: () => void }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t1 = setTimeout(() => setOut(true), reduce ? 300 : 1000);
    const t2 = setTimeout(onDone, reduce ? 450 : 1350);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);
  return (
    <div className={`splash ${out ? 'out' : ''}`} aria-hidden="true">
      <img src="./kaas_icon.png" alt="" />
      <p>KAAS · money tracker</p>
    </div>
  );
}

export default function App() {
  const [splash, setSplash] = useState(true);
  const [tab, setTab] = useState<Tab>('home');
  const [transactions, setTransactions] = useState<Transaction[]>(getTransactions);
  const [settings, setSettings] = useState<AppSettings>(getSettings);
  const [quick, setQuick] = useState<QuickExpense[]>(getQuickExpenses);
  const [bills, setBills] = useState<Bill[]>(getBills);
  const [goals, setGoals] = useState<Goal[]>(getGoals);
  const [backupInfo, setBackupInfo] = useState(getAutoBackupInfo);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reload = useCallback(() => {
    setTransactions(getTransactions());
    setSettings({ ...getSettings() });
    setQuick(getQuickExpenses());
    setBills(getBills());
    setGoals(getGoals());
  }, []);

  const showToast = useCallback((msg: string, errorOrKind?: boolean | 'error', action?: ToastState['action']) => {
    clearTimeout(toastTimer.current);
    const isErr = errorOrKind === true || errorOrKind === 'error';
    setToast({ msg, error: isErr, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 2600);
  }, []);

  // The automatic backup is written shortly after each change; refresh the label after it lands.
  useEffect(() => {
    const t = setTimeout(() => setBackupInfo(getAutoBackupInfo()), 900);
    return () => clearTimeout(t);
  }, [transactions, bills, goals, quick, settings]);

  // ── Theme ──────────────────────────────────────────────────────
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme]);

  // ── Bill reminders ─────────────────────────────────────────────
  useEffect(() => {
    void syncBillReminders(bills, !!settings.remindersEnabled, n => formatCurrency(n));
  }, [bills, settings.remindersEnabled]);

  // ── Closing layers: Android back button and Escape ─────────────
  const layers = useRef({ dialog, sheet, tab });
  layers.current = { dialog, sheet, tab };

  const closeTopLayer = useCallback((allowExit: boolean) => {
    const { dialog: d, sheet: s, tab: t } = layers.current;
    if (d) setDialog(null);
    else if (s) setSheet(null);
    else if (t !== 'home') setTab('home');
    else if (allowExit && Capacitor.isNativePlatform()) void CapApp.exitApp();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeTopLayer(false);
    window.addEventListener('keydown', onKey);
    let remove: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      void CapApp.addListener('backButton', () => closeTopLayer(true)).then(h => { remove = () => void h.remove(); });
    }
    return () => { window.removeEventListener('keydown', onKey); remove?.(); };
  }, [closeTopLayer]);

  // ── Transactions ───────────────────────────────────────────────
  const handleSaveTx = (tx: Transaction) => {
    const editing = transactions.some(t => t.id === tx.id);
    const ok = editing ? updateTransaction(tx) : saveTransaction(tx);
    if (!ok) return showToast(STORAGE_FULL, true);
    setSheet(null);
    reload();
    showToast(editing ? 'Changes saved' : `${tx.type === 'income' ? 'Income' : 'Expense'} saved`);
  };

  const handleDeleteTx = (tx: Transaction) => {
    deleteTransaction(tx.id);
    setSheet(null);
    reload();
    showToast('Transaction deleted', false, {
      label: 'Undo',
      run: () => { saveTransaction(tx); reload(); setToast(null); },
    });
  };

  const handleQuickLog = (q: QuickExpense) => {
    const cat = getAllCategories().find(c => c.id === q.categoryId);
    const tx: Transaction = {
      id: uid(),
      type: 'expense',
      amount: q.amount,
      categoryId: cat?.id ?? 'other',
      categoryName: cat?.name ?? 'Other',
      categoryIcon: cat?.icon ?? 'category',
      merchant: q.name,
      description: q.name,
      date: new Date().toISOString(),
      paymentMethod: 'UPI',
      createdAt: new Date().toISOString(),
    };
    if (!saveTransaction(tx)) return showToast(STORAGE_FULL, true);
    reload();
    showToast(`${q.name} · ${formatCurrency(q.amount)}`, false, {
      label: 'Undo',
      run: () => { deleteTransaction(tx.id); reload(); setToast(null); },
    });
  };

  const handlePayBill = (bill: Bill) => {
    const cat = getAllCategories().find(c => c.id === bill.categoryId) ?? getAllCategories().find(c => c.id === 'bills');
    const tx: Transaction = {
      id: uid(),
      type: 'expense',
      amount: bill.amount,
      categoryId: cat?.id ?? 'bills',
      categoryName: cat?.name ?? 'Bills & Utilities',
      categoryIcon: cat?.icon ?? 'receipt_long',
      merchant: bill.name,
      description: bill.name,
      date: new Date().toISOString(),
      paymentMethod: 'UPI',
      createdAt: new Date().toISOString(),
    };
    if (!saveTransaction(tx)) return showToast(STORAGE_FULL, true);
    const previous = getBills();
    const next = nextDueDate(new Date(bill.dueDate), bill.frequency ?? 'monthly');
    saveBills(next ? previous.map(b => (b.id === bill.id ? { ...b, dueDate: next.toISOString() } : b)) : previous.filter(b => b.id !== bill.id));
    reload();
    showToast(`${bill.name} marked as paid`, false, {
      label: 'Undo',
      run: () => { deleteTransaction(tx.id); saveBills(previous); reload(); setToast(null); },
    });
  };

  // ── Scan a handwritten note or bill ────────────────────────────
  const startScan = async (source: 'camera' | 'gallery') => {
    setDialog(null);
    const raw = await pickImage(source);
    if (!raw) return;
    setBusy('Reading numbers');
    const photo = await compressImage(raw);
    try {
      const scan = await scanNumbers(raw);
      setSheet({ kind: 'scan', photo, scan });
    } catch (e) {
      const offline = e instanceof OcrUnavailableError;
      showToast(
        offline
          ? 'The number reader needs internet the first time. Enter the amount by hand.'
          : 'Reading took too long. Enter the amount by hand.',
        true,
      );
      setSheet({ kind: 'add', prefill: { type: 'expense', receiptPhoto: photo } });
    } finally {
      setBusy(null);
    }
  };

  const chooseScanSource = () =>
    setDialog({
      kind: 'choice',
      title: 'Scan numbers from',
      choices: [
        { label: 'Take a photo', icon: 'photo_camera', run: () => void startScan('camera') },
        { label: 'Choose from gallery', icon: 'image', run: () => void startScan('gallery') },
      ],
    });

  // ── Settings ───────────────────────────────────────────────────
  const updateSettings = async (patch: Partial<AppSettings>) => {
    if (patch.remindersEnabled) {
      const granted = await requestReminderPermission();
      if (!granted) return showToast('Allow notifications for KAAS in your phone settings to get reminders.', true);
    }
    if (!saveSettings(patch)) return showToast(STORAGE_FULL, true);
    reload();
  };

  const exportCsv = () => {
    const header = ['Date', 'Time', 'Type', 'Amount', 'Category', 'Note', 'Paid with', 'Impulse'];
    const rows = transactions.map(t => {
      const d = new Date(t.date);
      return [
        d.toLocaleDateString('en-CA'),
        d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        t.type,
        t.amount,
        t.categoryName,
        t.merchant,
        t.paymentMethod,
        t.isUnnecessary ? 'Yes' : 'No',
      ].map(csvCell).join(',');
    });
    return [header.map(csvCell).join(','), ...rows].join('\n');
  };

  const handleAction = async (action: SettingsAction) => {
    const stamp = new Date().toISOString().slice(0, 10);
    switch (action) {
      case 'name':
        return setDialog({ kind: 'prompt', title: 'Your name', label: 'Name', initial: settings.userName, field: 'userName' });
      case 'budget':
        return setDialog({ kind: 'prompt', title: 'Monthly budget', label: `Amount in ${settings.currency.trim()}. Leave empty for none.`, initial: settings.monthlyBudget > 0 ? String(settings.monthlyBudget) : '', field: 'monthlyBudget' });
      case 'currency':
        return setDialog({ kind: 'currency' });
      case 'photo': {
        const choose = async () => {
          setDialog(null);
          const raw = await pickImage('gallery');
          if (raw) void updateSettings({ profilePic: await compressImage(raw, 320, 0.8) });
        };
        if (!settings.profilePic) return void choose();
        return setDialog({
          kind: 'choice',
          title: 'Profile photo',
          choices: [
            { label: 'Choose a new photo', icon: 'image', run: () => void choose() },
            { label: 'Remove photo', icon: 'delete', danger: true, run: () => { setDialog(null); void updateSettings({ profilePic: '' }); } },
          ],
        });
      }
      case 'quick': return setSheet({ kind: 'quick' });
      case 'bills': return setSheet({ kind: 'bills' });
      case 'goals': return setSheet({ kind: 'goals' });
      case 'categories': return setSheet({ kind: 'categories' });
      case 'export-json':
      case 'export-csv': {
        try {
          if (action === 'export-json') {
            await deliverFile(`kaas-backup-${stamp}.json`, JSON.stringify(exportSnapshot(), null, 2), 'application/json');
          } else {
            await deliverFile(`kaas-transactions-${stamp}.csv`, exportCsv(), 'text/csv');
          }
          showToast('Export ready');
        } catch {
          showToast('Could not create the file. Please try again.', true);
        }
        return;
      }
      case 'import': {
        const text = await pickTextFile('.json,application/json');
        if (text === null) return;
        const check = parseSnapshot(text);
        if (!check.ok) {
          showToast('error' in check ? (check as { error: string }).error : 'Invalid backup format', true);
          return;
        }
        const { transactions: n, bills: b, goals: g } = check.counts;
        return setDialog({
          kind: 'confirm',
          title: 'Replace your data?',
          body: `This backup has ${n} transactions, ${b} bills and ${g} goals. Everything currently on this device will be replaced.`,
          confirmLabel: 'Replace',
          danger: true,
          run: () => {
            setDialog(null);
            if (!applySnapshot(check.snapshot)) return showToast(STORAGE_FULL, true);
            reload();
            showToast('Backup restored');
          },
        });
      }
      case 'restore':
        return setDialog({
          kind: 'confirm',
          title: 'Restore automatic backup?',
          body: 'Your current records will be replaced by the last automatic backup. Receipt photos on records that still exist are kept.',
          confirmLabel: 'Restore',
          danger: true,
          run: () => {
            setDialog(null);
            if (!restoreAutoBackup()) return showToast('The backup could not be restored.', true);
            reload();
            showToast('Backup restored');
          },
        });
      case 'clear':
        return setDialog({
          kind: 'confirm',
          title: 'Erase everything?',
          body: 'All transactions, bills, goals and settings on this device will be deleted. This cannot be undone. Export a backup first if you might need it.',
          confirmLabel: 'Erase all',
          danger: true,
          run: () => {
            setDialog(null);
            clearAllData();
            initDB();
            reload();
            setTab('home');
            showToast('All data erased');
          },
        });
    }
  };

  const onboarded = settings.hasCompletedOnboarding;

  const tabs = useMemo(
    () => [
      { id: 'home' as Tab, label: 'Home', icon: 'home' },
      { id: 'activity' as Tab, label: 'Activity', icon: 'receipt_long' },
      null,
      { id: 'insights' as Tab, label: 'Insights', icon: 'bar_chart' },
      { id: 'settings' as Tab, label: 'Settings', icon: 'settings' },
    ],
    [],
  );

  return (
    <div className="app">
      {splash && <Splash onDone={() => setSplash(false)} />}

      {!onboarded ? (
        <Onboarding
          onDone={data => {
            saveSettings({ ...data, hasCompletedOnboarding: true });
            reload();
          }}
        />
      ) : (
        <>
          {tab === 'home' && (
            <HomeScreen
              transactions={transactions}
              settings={settings}
              quick={quick}
              bills={bills}
              onAdd={prefill => setSheet({ kind: 'add', prefill })}
              onScan={chooseScanSource}
              onQuickLog={handleQuickLog}
              onPayBill={handlePayBill}
              onOpenTx={tx => setSheet({ kind: 'detail', tx })}
              onNav={setTab}
              onManageQuick={() => setSheet({ kind: 'quick' })}
              onManageBills={() => setSheet({ kind: 'bills' })}
            />
          )}
          {tab === 'activity' && (
            <ActivityScreen transactions={transactions} onOpenTx={tx => setSheet({ kind: 'detail', tx })} onAdd={() => setSheet({ kind: 'add' })} />
          )}
          {tab === 'insights' && (
            <InsightsScreen transactions={transactions} settings={settings} goals={goals} onManageGoals={() => setSheet({ kind: 'goals' })} />
          )}
          {tab === 'settings' && (
            <SettingsScreen
              settings={settings}
              backupInfo={backupInfo}
              remindersAvailable={remindersSupported()}
              onUpdate={patch => void updateSettings(patch)}
              onAction={a => void handleAction(a)}
            />
          )}

          <nav className="dock" aria-label="Main">
            {tabs.map(t =>
              t === null ? (
                <button key="add" type="button" className="dock-add" onClick={() => setSheet({ kind: 'add' })} aria-label="Add transaction">
                  <Icon name="add" />
                </button>
              ) : (
                <button key={t.id} type="button" className={`dock-item ${tab === t.id ? 'on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                  <Icon name={t.icon} />
                  {t.label}
                </button>
              ),
            )}
          </nav>

          {sheet?.kind === 'add' && (
            <AddSheet prefill={sheet.prefill} onClose={() => setSheet(null)} onSave={handleSaveTx} onToast={showToast} />
          )}
          {sheet?.kind === 'detail' && (
            <DetailSheet
              tx={sheet.tx}
              onClose={() => setSheet(null)}
              onEdit={tx => setSheet({ kind: 'add', prefill: tx })}
              onDelete={handleDeleteTx}
            />
          )}
          {sheet?.kind === 'scan' && (
            <ScanSheet
              photo={sheet.photo}
              scan={sheet.scan}
              onClose={() => setSheet(null)}
              onContinue={(amount, note) => setSheet({ kind: 'add', prefill: { type: 'expense', amount, merchant: note, receiptPhoto: sheet.photo } })}
            />
          )}
          {sheet?.kind === 'quick' && (
            <QuickSheet
              items={quick}
              onClose={() => setSheet(null)}
              onSave={items => { saveQuickExpenses(items); reload(); showToast('Shortcuts saved'); }}
            />
          )}
          {sheet?.kind === 'bills' && (
            <BillsSheet
              bills={bills}
              onClose={() => setSheet(null)}
              onSave={list => { saveBills(list); reload(); showToast('Bills saved'); }}
            />
          )}
          {sheet?.kind === 'goals' && (
            <GoalsSheet
              goals={goals}
              onClose={() => setSheet(null)}
              onSave={list => { saveGoals(list); reload(); showToast('Goals saved'); }}
            />
          )}
          {sheet?.kind === 'categories' && <CategoriesSheet onClose={() => setSheet(null)} onChanged={reload} />}
        </>
      )}

      {dialog?.kind === 'confirm' && (
        <ConfirmDialog title={dialog.title} body={dialog.body} confirmLabel={dialog.confirmLabel} danger={dialog.danger} onConfirm={dialog.run} onCancel={() => setDialog(null)} />
      )}
      {dialog?.kind === 'prompt' && (
        <PromptDialog
          title={dialog.title}
          label={dialog.label}
          initial={dialog.initial}
          kind={dialog.field === 'monthlyBudget' ? 'amount' : 'text'}
          onCancel={() => setDialog(null)}
          onSave={value => {
            const field = dialog.field;
            setDialog(null);
            void updateSettings(field === 'monthlyBudget' ? { monthlyBudget: Number(value) } : { userName: value });
          }}
        />
      )}
      {dialog?.kind === 'currency' && (
        <CurrencyDialog
          current={settings.currency}
          onCancel={() => setDialog(null)}
          onSave={symbol => { setDialog(null); void updateSettings({ currency: symbol }); }}
        />
      )}
      {dialog?.kind === 'choice' && <ChoiceDialog title={dialog.title} choices={dialog.choices} onCancel={() => setDialog(null)} />}
      {busy && <BusyDialog text={busy} />}

      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          <span>{toast.msg}</span>
          {toast.action && <button type="button" onClick={toast.action.run}>{toast.action.label}</button>}
        </div>
      )}
    </div>
  );
}

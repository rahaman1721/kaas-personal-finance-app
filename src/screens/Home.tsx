import {
  formatCurrency, type AppSettings, type Bill, type QuickExpense, type Transaction,
} from '../db';
import { billCaption, billState, sortBills } from '../lib/bills';
import { daysInMonth, greeting, isSameMonth, monthLabel } from '../lib/dates';
import { Avatar, Empty, Icon } from '../components/ui';
import { TxRow } from '../components/TxRow';

export type Tab = 'home' | 'activity' | 'insights' | 'settings';

export function HomeScreen({
  transactions, settings, quick, bills,
  onAdd, onScan, onQuickLog, onPayBill, onOpenTx, onNav, onManageQuick, onManageBills,
}: {
  transactions: Transaction[];
  settings: AppSettings;
  quick: QuickExpense[];
  bills: Bill[];
  onAdd: (prefill?: Partial<Transaction>) => void;
  onScan: () => void;
  onQuickLog: (q: QuickExpense) => void;
  onPayBill: (b: Bill) => void;
  onOpenTx: (tx: Transaction) => void;
  onNav: (t: Tab) => void;
  onManageQuick: () => void;
  onManageBills: () => void;
}) {
  const now = new Date();
  const month = transactions.filter(t => isSameMonth(new Date(t.date), now));
  const income = month.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const spent = month.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const budget = settings.monthlyBudget || 0;
  const left = budget - spent;
  const daysLeft = daysInMonth(now) - now.getDate() + 1;
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const meterClass = budget > 0 ? (spent > budget ? 'over' : pct >= 80 ? 'warn' : '') : '';

  const hasBudget = budget > 0;
  const heroLabel = hasBudget ? (left >= 0 ? 'Left to spend this month' : 'Over budget this month') : `Net for ${monthLabel(now)}`;
  const heroAmount = hasBudget ? Math.abs(left) : income - spent;
  const heroNote = hasBudget
    ? left >= 0
      ? `About ${formatCurrency(Math.floor(left / daysLeft))} a day for ${daysLeft} more ${daysLeft === 1 ? 'day' : 'days'}`
      : `${formatCurrency(spent)} spent against a ${formatCurrency(budget)} budget`
    : 'Set a monthly budget in Settings to see what is left.';

  const dueBills = sortBills(bills).slice(0, 3);
  const name = settings.userName.trim();

  return (
    <div className="screen">
      <header className="page-head">
        <div>
          <h1 className="page-title">{greeting(now)}{name ? `, ${name}` : ''}</h1>
          <p className="page-sub">{monthLabel(now)}</p>
        </div>
        <button type="button" onClick={() => onNav('settings')} aria-label="Open settings" style={{ borderRadius: '50%' }}>
          <Avatar name={name || 'K'} photo={settings.profilePic} />
        </button>
      </header>

      <section className="hero" aria-label="Month summary">
        <div className="hero-label">{heroLabel}</div>
        <div className="hero-amount num">{heroAmount < 0 ? '-' : ''}{formatCurrency(Math.abs(heroAmount))}</div>
        <div className="hero-note">{heroNote}</div>
        {hasBudget && (
          <div className={`meter ${meterClass}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="hero-split">
          <div>
            <small>Income</small>
            <span className="num">{formatCurrency(income)}</span>
          </div>
          <div>
            <small>Spent</small>
            <span className="num">{formatCurrency(spent)}</span>
          </div>
        </div>
      </section>

      <div className="actions">
        <button type="button" className="btn primary" onClick={() => onAdd({ type: 'expense' })}>
          <Icon name="remove" small /> Expense
        </button>
        <button type="button" className="btn" onClick={() => onAdd({ type: 'income' })}>
          <Icon name="add" small /> Income
        </button>
        <button type="button" className="btn" onClick={onScan}>
          <Icon name="document_scanner" small /> Scan
        </button>
      </div>

      <div className="section-head">
        <h2 className="section-title">Quick log</h2>
        <button type="button" className="link-btn" onClick={onManageQuick}>{quick.length ? 'Edit' : 'Add'}</button>
      </div>
      {quick.length > 0 ? (
        <div className="chips">
          {quick.map(q => (
            <button key={q.id} type="button" className="chip" onClick={() => onQuickLog(q)}>
              {q.name} <span className="num">{formatCurrency(q.amount)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="hint">Add shortcuts for things you buy every day and log them in one tap.</p>
      )}

      <div className="section-head">
        <h2 className="section-title">Bills</h2>
        <button type="button" className="link-btn" onClick={onManageBills}>{bills.length ? 'Manage' : 'Add'}</button>
      </div>
      {dueBills.length === 0 ? (
        <p className="hint">Add rent, subscriptions or EMIs to get a reminder before they are due.</p>
      ) : (
        <div className="list">
          {dueBills.map(b => {
            const { state } = billState(b);
            return (
              <div className="row" key={b.id}>
                <span className={`row-icon ${state === 'overdue' ? 'bad' : state === 'today' || state === 'soon' ? 'warn' : ''}`}>
                  <Icon name="receipt_long" small />
                </span>
                <div className="row-main">
                  <div className="row-title">{b.name}</div>
                  <div className={`row-sub ${state === 'overdue' ? 'bad' : state === 'today' ? 'warn' : ''}`}>{billCaption(b)}</div>
                </div>
                <span className="num row-amount">{formatCurrency(b.amount)}</span>
                <button type="button" className="btn small" onClick={() => onPayBill(b)} aria-label={`Mark ${b.name} as paid`}>Paid</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-head">
        <h2 className="section-title">Recent</h2>
        {transactions.length > 0 && <button type="button" className="link-btn" onClick={() => onNav('activity')}>See all</button>}
      </div>
      {transactions.length === 0 ? (
        <Empty
          title="Nothing logged yet"
          desc="Add your first expense, or scan a handwritten note to pull the amount out of it."
          action={<button type="button" className="btn primary" onClick={() => onAdd({ type: 'expense' })}>Add an expense</button>}
        />
      ) : (
        <div className="list">
          {transactions.slice(0, 6).map(tx => <TxRow key={tx.id} tx={tx} onOpen={onOpenTx} showDate />)}
        </div>
      )}
    </div>
  );
}

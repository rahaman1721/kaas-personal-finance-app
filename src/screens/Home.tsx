import { useState } from 'react';
import {
  formatCurrency, type AppSettings, type Bill, type Goal, type QuickExpense, type Transaction,
} from '../db';
import { billCaption, billState, sortBills } from '../lib/bills';
import { daysInMonth, greeting, isSameMonth, monthLabel } from '../lib/dates';
import { Avatar, Empty, Icon } from '../components/ui';
import { TxRow } from '../components/TxRow';

export type Tab = 'home' | 'activity' | 'insights' | 'settings';

export function HomeScreen({
  transactions, settings, quick, bills, goals = [],
  onAdd, onScan, onQuickLog, onPayBill, onOpenTx, onNav, onManageQuick, onManageBills, onManageGoals, onToggleTheme,
}: {
  transactions: Transaction[];
  settings: AppSettings;
  quick: QuickExpense[];
  bills: Bill[];
  goals?: Goal[];
  onAdd: (prefill?: Partial<Transaction>) => void;
  onScan: () => void;
  onQuickLog: (q: QuickExpense) => void;
  onPayBill: (b: Bill) => void;
  onOpenTx: (tx: Transaction) => void;
  onNav: (t: Tab) => void;
  onManageQuick: () => void;
  onManageBills: () => void;
  onManageGoals?: () => void;
  onToggleTheme?: () => void;
}) {
  const [maskAmount, setMaskAmount] = useState(false);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onToggleTheme && (
            <button
              type="button"
              className="icon-btn"
              onClick={onToggleTheme}
              aria-label="Toggle light or dark theme"
              title="Toggle Theme"
              style={{ border: '1px solid var(--line)' }}
            >
              <Icon name={settings.theme === 'dark' ? 'light_mode' : 'dark_mode'} small />
            </button>
          )}
          <button type="button" onClick={() => onNav('settings')} aria-label="Open settings" style={{ borderRadius: '50%' }}>
            <Avatar name={name || 'K'} photo={settings.profilePic} />
          </button>
        </div>
      </header>

      <section className="hero" aria-label="Month summary">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="hero-label">{heroLabel}</div>
          <button
            type="button"
            onClick={() => setMaskAmount(!maskAmount)}
            aria-label={maskAmount ? 'Show amount' : 'Hide amount'}
            title={maskAmount ? 'Show balance' : 'Conceal balance'}
            style={{ color: 'var(--hero-ink-2)', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
          >
            <Icon name={maskAmount ? 'visibility_off' : 'visibility'} small />
          </button>
        </div>
        <div className="hero-amount num">
          {maskAmount ? '••••••' : `${heroAmount < 0 ? '-' : ''}${formatCurrency(Math.abs(heroAmount))}`}
        </div>
        <div className="hero-note">{heroNote}</div>
        {hasBudget && (
          <div className={`meter ${meterClass}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="hero-split">
          <div>
            <small>Income</small>
            <span className="num">{maskAmount ? '••••' : formatCurrency(income)}</span>
          </div>
          <div>
            <small>Spent</small>
            <span className="num">{maskAmount ? '••••' : formatCurrency(spent)}</span>
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

      {/* Savings Goals Section */}
      <div className="section-head">
        <h2 className="section-title">Savings goals</h2>
        {onManageGoals && (
          <button type="button" className="link-btn" onClick={onManageGoals}>
            {goals.length ? 'Manage' : 'Add'}
          </button>
        )}
      </div>
      {goals.length === 0 ? (
        <p className="hint">Set goals for an emergency fund, travel, or gadgets to track your progress.</p>
      ) : (
        <div className="list">
          {goals.map(g => {
            const gPct = g.targetAmount > 0 ? Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100)) : 0;
            return (
              <div className="row" key={g.id} style={{ alignItems: 'flex-start' }}>
                <span className="row-icon in" style={{ marginTop: 2 }}>
                  <Icon name={g.icon || 'shield'} small />
                </span>
                <div className="row-main" style={{ paddingRight: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span className="row-title">{g.name}</span>
                    <span className="num" style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-text)' }}>
                      {gPct}%
                    </span>
                  </div>
                  <div className="track" style={{ height: 6, margin: '6px 0 4px' }} role="progressbar" aria-valuenow={gPct} aria-valuemin={0} aria-valuemax={100} aria-label={g.name}>
                    <i style={{ width: `${gPct}%` }} />
                  </div>
                  <div className="row-sub num">
                    {formatCurrency(g.savedAmount)} of {formatCurrency(g.targetAmount)}
                  </div>
                </div>
                {onManageGoals && (
                  <button
                    type="button"
                    className="btn small"
                    onClick={onManageGoals}
                    style={{ alignSelf: 'center', minWidth: 60 }}
                  >
                    Fund
                  </button>
                )}
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

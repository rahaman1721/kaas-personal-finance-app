import { useState } from 'react';
import {
  formatCompact, formatCurrency, getAllCategories, type AppSettings, type Goal, type Transaction,
} from '../db';
import { addMonths, isSameMonth, monthLabel } from '../lib/dates';
import { Empty, Icon } from '../components/ui';

export function InsightsScreen({ transactions, settings, goals, onManageGoals }: {
  transactions: Transaction[];
  settings: AppSettings;
  goals: Goal[];
  onManageGoals: () => void;
}) {
  const [offset, setOffset] = useState(0); // 0 = this month, -1 = last month, ...
  const now = new Date();
  const month = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), offset);

  const inMonth = transactions.filter(t => isSameMonth(new Date(t.date), month));
  const expenses = inMonth.filter(t => t.type === 'expense');
  const income = inMonth.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const spent = expenses.reduce((s, t) => s + t.amount, 0);
  const budget = settings.monthlyBudget || 0;
  const saved = income - spent;

  const cats = getAllCategories();
  const byCategory = Object.entries(
    expenses.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.categoryId]: (acc[t.categoryId] ?? 0) + t.amount }), {}),
  )
    .map(([id, amount]) => {
      const sample = expenses.find(t => t.categoryId === id);
      const cat = cats.find(c => c.id === id);
      return { id, amount, name: cat?.name ?? sample?.categoryName ?? 'Other', icon: cat?.icon ?? sample?.categoryIcon ?? 'category' };
    })
    .sort((a, b) => b.amount - a.amount);

  const topMerchants = Object.entries(
    expenses.reduce<Record<string, { label: string; amount: number; count: number }>>((acc, t) => {
      const key = t.merchant.trim().toLowerCase();
      const cur = acc[key] ?? { label: t.merchant.trim(), amount: 0, count: 0 };
      return { ...acc, [key]: { ...cur, amount: cur.amount + t.amount, count: cur.count + 1 } };
    }, {}),
  )
    .map(([, v]) => v)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  const impulse = expenses.filter(t => t.isUnnecessary);
  const impulseTotal = impulse.reduce((s, t) => s + t.amount, 0);

  const trend = Array.from({ length: 6 }, (_, i) => {
    const m = addMonths(new Date(month.getFullYear(), month.getMonth(), 1), i - 5);
    const total = transactions
      .filter(t => t.type === 'expense' && isSameMonth(new Date(t.date), m))
      .reduce((s, t) => s + t.amount, 0);
    return { total, label: m.toLocaleDateString('en-IN', { month: 'short' }), current: i === 5 };
  });
  const trendMax = Math.max(...trend.map(t => t.total), 1);

  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const trackClass = spent > budget ? 'over' : pct >= 80 ? 'warn' : '';

  return (
    <div className="screen">
      <header className="page-head">
        <h1 className="page-title">Insights</h1>
      </header>

      <div className="stepper" style={{ marginBottom: 8 }}>
        <button type="button" className="icon-btn" onClick={() => setOffset(o => o - 1)} aria-label="Previous month"><Icon name="chevron_left" /></button>
        <h2 className="page-title" aria-live="polite">{monthLabel(month)}</h2>
        <button type="button" className="icon-btn" onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset === 0} aria-label="Next month"><Icon name="chevron_right" /></button>
      </div>

      <div className="stats">
        <div><small>Income</small><span className="num in">{formatCurrency(income)}</span></div>
        <div><small>Spent</small><span className="num">{formatCurrency(spent)}</span></div>
        <div><small>Saved</small><span className={`num ${saved < 0 ? 'out' : 'in'}`}>{formatCurrency(saved)}</span></div>
      </div>

      {budget > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Budget</h2>
            <span className="num" style={{ color: spent > budget ? 'var(--neg)' : 'var(--ink-2)', fontWeight: 500 }}>{pct}% used</span>
          </div>
          <div className={`track ${trackClass}`} role="progressbar" aria-valuenow={Math.min(100, pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
            <i style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <p className="hint">
            {spent > budget
              ? `${formatCurrency(spent - budget)} over the ${formatCurrency(budget)} budget.`
              : `${formatCurrency(budget - spent)} left of ${formatCurrency(budget)}.`}
          </p>
        </>
      )}

      <div className="section-head">
        <h2 className="section-title">Where it went</h2>
      </div>
      {byCategory.length === 0 ? (
        <Empty title="No spending this month" desc="Categories appear here once you log expenses." />
      ) : (
        <div>
          {byCategory.map((c, i) => {
            const share = spent > 0 ? (c.amount / spent) * 100 : 0;
            return (
              <div className="cat-row" key={c.id}>
                <div className="cat-row-top">
                  <span className="name">{c.name}</span>
                  <span className="num" style={{ fontWeight: 500 }}>
                    {formatCurrency(c.amount)} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· {Math.round(share)}%</span>
                  </span>
                </div>
                <div className={`track ${i === 0 && byCategory.length > 1 ? 'warn' : ''}`}>
                  <i style={{ width: `${Math.max(2, share)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {topMerchants.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Most spent on</h2>
          </div>
          <div className="list">
            {topMerchants.map(m => (
              <div className="row" key={m.label}>
                <div className="row-main">
                  <div className="row-title">{m.label}</div>
                  <div className="row-sub">{m.count} {m.count === 1 ? 'time' : 'times'}</div>
                </div>
                <span className="num row-amount">{formatCurrency(m.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {impulseTotal > 0 && (
        <div className="callout">
          <strong>{formatCurrency(impulseTotal)}</strong> went on {impulse.length} impulse {impulse.length === 1 ? 'purchase' : 'purchases'} in {monthLabel(month)}.
          At this pace that is {formatCurrency(impulseTotal * 12)} over a year.
        </div>
      )}

      <div className="section-head">
        <h2 className="section-title">Six-month spending</h2>
      </div>
      <div className="bars" role="img" aria-label="Monthly spending for the last six months">
        {trend.map((t, i) => (
          <div key={i} className={`bar ${t.current ? 'now' : ''} ${t.total === 0 ? 'empty-bar' : ''}`}>
            <span className="bar-val num">{t.total > 0 ? formatCompact(t.total) : ''}</span>
            <div className="bar-fill" style={{ height: `${Math.max(3, Math.round((t.total / trendMax) * 78))}px` }} />
            <span className="bar-label">{t.label}</span>
          </div>
        ))}
      </div>

      <div className="section-head">
        <h2 className="section-title">Goals</h2>
        <button type="button" className="link-btn" onClick={onManageGoals}>{goals.length ? 'Manage' : 'Add a goal'}</button>
      </div>
      {goals.length === 0 ? (
        <p className="hint">Name something you are saving for and track your progress here.</p>
      ) : (
        <div>
          {goals.map(g => {
            const p = Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100));
            return (
              <div className="cat-row" key={g.id}>
                <div className="cat-row-top">
                  <span className="name">{g.name}</span>
                  <span className="num" style={{ fontWeight: 500 }}>
                    {formatCurrency(g.savedAmount)} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>of {formatCurrency(g.targetAmount)}</span>
                  </span>
                </div>
                <div className="track" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.name} progress`}>
                  <i style={{ width: `${p}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import {
  formatCompact, formatCurrency, getAllCategories, type AppSettings, type Goal, type Transaction,
} from '../db';
import { addMonths, isSameMonth, monthLabel } from '../lib/dates';
import { Empty, Icon } from '../components/ui';

export function InsightsScreen({
  transactions, settings, goals, onManageGoals, onToggleTheme, isDark,
}: {
  transactions: Transaction[];
  settings: AppSettings;
  goals: Goal[];
  onManageGoals: () => void;
  onToggleTheme?: () => void;
  isDark?: boolean;
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

  // 50/30/20 Rule Computation
  const needsIds = ['food', 'home', 'bills', 'health'];
  const needsSpend = expenses.filter(t => needsIds.includes(t.categoryId)).reduce((s, t) => s + t.amount, 0);
  const wantsSpend = expenses.filter(t => !needsIds.includes(t.categoryId)).reduce((s, t) => s + t.amount, 0);
  const totalBase = income > 0 ? income : (spent + Math.max(0, saved));
  const needsPct = totalBase > 0 ? Math.round((needsSpend / totalBase) * 100) : 0;
  const wantsPct = totalBase > 0 ? Math.round((wantsSpend / totalBase) * 100) : 0;
  const savingsPct = totalBase > 0 ? Math.round((Math.max(0, saved) / totalBase) * 100) : 0;

  // Compounded wealth simulation from redirected impulse purchases (12% CAGR)
  const baseMonthlyImpulse = impulseTotal > 0 ? impulseTotal : 2000;
  const r = 0.12 / 12;
  const fv1 = Math.round(baseMonthlyImpulse * ((Math.pow(1 + r, 12) - 1) / r) * (1 + r));
  const fv3 = Math.round(baseMonthlyImpulse * ((Math.pow(1 + r, 36) - 1) / r) * (1 + r));
  const fv5 = Math.round(baseMonthlyImpulse * ((Math.pow(1 + r, 60) - 1) / r) * (1 + r));

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
        {onToggleTheme && (
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label="Toggle light or dark theme"
            title="Toggle Theme"
            style={{ border: '1px solid var(--line)' }}
          >
            <Icon name={isDark ? 'light_mode' : 'dark_mode'} small />
          </button>
        )}
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

      {/* 50/30/20 Rule Breakdown */}
      <div className="section-head">
        <h2 className="section-title">50 / 30 / 20 Rule Analysis</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 4 }}>
        <div style={{ background: 'var(--sunken)', padding: '10px 12px', borderRadius: 'var(--r-md)' }}>
          <small style={{ color: 'var(--ink-3)', fontSize: 11, display: 'block' }}>Needs (≤50%)</small>
          <div className="num" style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{needsPct}%</div>
          <small style={{ color: 'var(--ink-3)', fontSize: 11 }}>{formatCurrency(needsSpend)}</small>
        </div>
        <div style={{ background: 'var(--sunken)', padding: '10px 12px', borderRadius: 'var(--r-md)' }}>
          <small style={{ color: 'var(--ink-3)', fontSize: 11, display: 'block' }}>Wants (≤30%)</small>
          <div className="num" style={{ fontSize: 16, fontWeight: 600, marginTop: 2, color: wantsPct > 35 ? 'var(--neg)' : 'inherit' }}>{wantsPct}%</div>
          <small style={{ color: 'var(--ink-3)', fontSize: 11 }}>{formatCurrency(wantsSpend)}</small>
        </div>
        <div style={{ background: 'var(--sunken)', padding: '10px 12px', borderRadius: 'var(--r-md)' }}>
          <small style={{ color: 'var(--ink-3)', fontSize: 11, display: 'block' }}>Savings (≥20%)</small>
          <div className="num" style={{ fontSize: 16, fontWeight: 600, marginTop: 2, color: 'var(--brand-text)' }}>{savingsPct}%</div>
          <small style={{ color: 'var(--ink-3)', fontSize: 11 }}>{formatCurrency(Math.max(0, saved))}</small>
        </div>
      </div>

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

      {/* Compounding Wealth Simulation */}
      <div className="section-head">
        <h2 className="section-title">Compounded Wealth Potential</h2>
      </div>
      <p className="hint" style={{ marginBottom: 10 }}>
        Redirecting impulse spend ({formatCurrency(baseMonthlyImpulse)}/mo) into disciplined compounding assets (12% CAGR):
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <div style={{ background: 'var(--hero-bg)', color: 'var(--hero-ink)', padding: '12px 10px', borderRadius: 'var(--r-md)', textAlign: 'center' }}>
          <small style={{ color: 'var(--hero-ink-2)', fontSize: 11, textTransform: 'uppercase' }}>1 Year</small>
          <div className="num" style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{formatCurrency(fv1)}</div>
        </div>
        <div style={{ background: 'var(--hero-bg)', color: 'var(--hero-ink)', padding: '12px 10px', borderRadius: 'var(--r-md)', textAlign: 'center' }}>
          <small style={{ color: 'var(--hero-ink-2)', fontSize: 11, textTransform: 'uppercase' }}>3 Years</small>
          <div className="num" style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{formatCurrency(fv3)}</div>
        </div>
        <div style={{ background: 'var(--hero-bg)', color: 'var(--hero-ink)', padding: '12px 10px', borderRadius: 'var(--r-md)', textAlign: 'center' }}>
          <small style={{ color: 'var(--hero-ink-2)', fontSize: 11, textTransform: 'uppercase' }}>5 Years</small>
          <div className="num" style={{ fontSize: 15, fontWeight: 600, marginTop: 4, color: 'var(--gold)' }}>{formatCurrency(fv5)}</div>
        </div>
      </div>

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
            const p = g.targetAmount > 0 ? Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100)) : 0;
            return (
              <div className="cat-row" key={g.id}>
                <div className="cat-row-top">
                  <span className="name">{g.name}</span>
                  <span className="num" style={{ fontWeight: 500 }}>
                    {formatCurrency(g.savedAmount)} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>of {formatCurrency(g.targetAmount)} ({p}%)</span>
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

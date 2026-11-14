import { useMemo, useState } from 'react';
import { formatCompact, formatCurrency, type Transaction } from '../db';
import { dayKey, dayLabel, daysBetween, isSameMonth, sameDay, startOfDay } from '../lib/dates';
import { Empty, Segmented } from '../components/ui';
import { TxRow } from '../components/TxRow';

type Period = 'today' | 'week' | 'month' | 'all';
type Kind = 'all' | 'expense' | 'income';

export function ActivityScreen({ transactions, onOpenTx, onAdd }: {
  transactions: Transaction[];
  onOpenTx: (tx: Transaction) => void;
  onAdd: () => void;
}) {
  const [period, setPeriod] = useState<Period>('month');
  const [kind, setKind] = useState<Kind>('all');
  const [query, setQuery] = useState('');

  const now = new Date();
  const today = dayKey(now);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter(t => {
      const d = new Date(t.date);
      const inPeriod =
        period === 'all' ? true :
        period === 'today' ? sameDay(d, now) :
        period === 'week' ? daysBetween(d, now) >= 0 && daysBetween(d, now) <= 6 :
        isSameMonth(d, now);
      const inKind = kind === 'all' || t.type === kind;
      const matches = !q || t.merchant.toLowerCase().includes(q) || t.categoryName.toLowerCase().includes(q);
      return inPeriod && inKind && matches;
    });
    // `now` changes every render, but only the calendar day matters for filtering
  }, [transactions, period, kind, query, today]);

  const income = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const spent = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = income - spent;

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    filtered.forEach(t => {
      const key = dayKey(new Date(t.date));
      map.set(key, [...(map.get(key) ?? []), t]);
    });
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  // Monday to Sunday of the current week
  const monday = startOfDay(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const total = transactions
      .filter(t => t.type === 'expense' && sameDay(new Date(t.date), d))
      .reduce((s, t) => s + t.amount, 0);
    return { total, today: sameDay(d, now), label: d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2) };
  });
  const weekMax = Math.max(...week.map(d => d.total), 1);
  const weekTotal = week.reduce((s, d) => s + d.total, 0);

  return (
    <div className="screen">
      <header className="page-head">
        <h1 className="page-title">Activity</h1>
      </header>

      <Segmented<Period>
        label="Period"
        value={period}
        onChange={setPeriod}
        options={[{ id: 'today', label: 'Today' }, { id: 'week', label: '7 days' }, { id: 'month', label: 'This month' }, { id: 'all', label: 'All' }]}
      />

      <div className="field" style={{ marginTop: 12, marginBottom: 12 }}>
        <input
          className="input"
          type="search"
          placeholder="Search notes or categories"
          aria-label="Search transactions"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <Segmented<Kind>
        label="Type"
        value={kind}
        onChange={setKind}
        options={[{ id: 'all', label: 'All' }, { id: 'expense', label: 'Expenses' }, { id: 'income', label: 'Income' }]}
      />

      <div className="stats" style={{ marginTop: 16 }}>
        <div><small>Income</small><span className="num in">{formatCurrency(income)}</span></div>
        <div><small>Spent</small><span className="num">{formatCurrency(spent)}</span></div>
        <div><small>Net</small><span className={`num ${net < 0 ? 'out' : ''}`}>{formatCurrency(net)}</span></div>
      </div>

      <div className="section-head">
        <h2 className="section-title">This week</h2>
        <span className="num" style={{ fontSize: 14, color: 'var(--ink-3)' }}>{formatCurrency(weekTotal)}</span>
      </div>
      <div className="bars" role="img" aria-label={`Spending this week, ${formatCurrency(weekTotal)} in total`}>
        {week.map((d, i) => (
          <div key={i} className={`bar ${d.today ? 'now' : ''} ${d.total === 0 ? 'empty-bar' : ''}`}>
            <span className="bar-val num">{d.total > 0 ? formatCompact(d.total) : ''}</span>
            <div className="bar-fill" style={{ height: `${Math.max(3, Math.round((d.total / weekMax) * 78))}px` }} />
            <span className="bar-label">{d.label}</span>
          </div>
        ))}
      </div>

      {groups.length === 0 ? (
        transactions.length === 0 ? (
          <Empty title="No activity yet" desc="Everything you log will appear here, grouped by day." action={<button type="button" className="btn primary" onClick={onAdd}>Add a transaction</button>} />
        ) : (
          <Empty title="No matches" desc="Try another period or clear the search." />
        )
      ) : (
        groups.map(([key, txs]) => {
          const dayNet = txs.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
          return (
            <section key={key}>
              <div className="day-head">
                <span>{dayLabel(new Date(key + 'T12:00:00'), now)}</span>
                <span className="num">{formatCurrency(dayNet)}</span>
              </div>
              <div className="list">
                {txs.map(tx => <TxRow key={tx.id} tx={tx} onOpen={onOpenTx} />)}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

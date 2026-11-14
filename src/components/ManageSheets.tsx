import { useState } from 'react';
import {
  deleteCustomCategory, formatCurrency, getCustomCategories, getExpenseCategories, isCategoryInUse,
  parseAmount, type Bill, type BillFrequency, type Category, type Goal, type QuickExpense,
} from '../db';
import { uid } from '../lib/id';
import { billCaption, billState, FREQUENCIES, sortBills } from '../lib/bills';
import { fromInputs, toDateInput } from '../lib/dates';
import { Empty, Icon, Sheet } from './ui';

// ── Quick log shortcuts ───────────────────────────────────────────
export function QuickSheet({ items, onSave, onClose }: {
  items: QuickExpense[];
  onSave: (items: QuickExpense[]) => void;
  onClose: () => void;
}) {
  const cats = getExpenseCategories();
  const [list, setList] = useState(items);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [catId, setCatId] = useState('food');
  const [error, setError] = useState('');

  const add = () => {
    const value = parseAmount(amount);
    if (!name.trim()) return setError('Give the shortcut a name.');
    if (!(value > 0)) return setError('Enter an amount greater than zero.');
    const cat = cats.find(c => c.id === catId) ?? cats[0];
    setList([...list, { id: uid(), name: name.trim(), amount: value, categoryId: cat.id, emoji: cat.icon }]);
    setName('');
    setAmount('');
    setError('');
  };

  return (
    <Sheet
      title="Quick log shortcuts"
      onClose={onClose}
      footer={<button type="button" className="btn primary" onClick={() => { onSave(list); onClose(); }}>Save shortcuts</button>}
    >
      <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>One tap on Home logs the expense with today's date.</p>
      <div className="form-row" style={{ marginBottom: 10 }}>
        <input className="input" style={{ flex: 2 }} placeholder="Name, e.g. Tea" aria-label="Shortcut name" maxLength={20} value={name} onChange={e => setName(e.target.value)} />
        <input className="input" style={{ flex: 1 }} placeholder="Amount" aria-label="Shortcut amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
      </div>
      <div className="form-row" style={{ marginBottom: 6 }}>
        <select className="input" style={{ flex: 1 }} aria-label="Category" value={catId} onChange={e => setCatId(e.target.value)}>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" className="btn" onClick={add}>Add</button>
      </div>
      {error && <p className="hint bad" role="alert">{error}</p>}

      <div className="list" style={{ marginTop: 14 }}>
        {list.map(q => (
          <div className="row" key={q.id}>
            <span className="row-icon"><Icon name={q.emoji || 'bolt'} small /></span>
            <div className="row-main">
              <div className="row-title">{q.name}</div>
              <div className="row-sub">{cats.find(c => c.id === q.categoryId)?.name ?? 'Other'}</div>
            </div>
            <span className="num row-amount">{formatCurrency(q.amount)}</span>
            <button type="button" className="icon-btn danger" aria-label={`Remove ${q.name}`} onClick={() => setList(list.filter(x => x.id !== q.id))}>
              <Icon name="delete" small />
            </button>
          </div>
        ))}
      </div>
      {list.length === 0 && <Empty title="No shortcuts yet" desc="Add the things you buy often, like tea, auto fare or lunch." />}
    </Sheet>
  );
}

// ── Bills ─────────────────────────────────────────────────────────
export function BillsSheet({ bills, onSave, onClose }: {
  bills: Bill[];
  onSave: (bills: Bill[]) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState(bills);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState(toDateInput(new Date()));
  const [freq, setFreq] = useState<BillFrequency>('monthly');
  const [error, setError] = useState('');

  const reset = () => { setEditing(null); setName(''); setAmount(''); setDue(toDateInput(new Date())); setFreq('monthly'); setError(''); };

  const submit = () => {
    const value = parseAmount(amount);
    const date = fromInputs(due, '09:00');
    if (!name.trim()) return setError('Give the bill a name.');
    if (!(value > 0)) return setError('Enter an amount greater than zero.');
    if (!date) return setError('Pick a due date.');
    const bill: Bill = {
      id: editing ?? uid(),
      name: name.trim(),
      amount: value,
      dueDate: date.toISOString(),
      categoryId: 'bills',
      icon: 'receipt_long',
      frequency: freq,
    };
    setList(editing ? list.map(b => (b.id === editing ? bill : b)) : [...list, bill]);
    reset();
  };

  const edit = (b: Bill) => {
    setEditing(b.id);
    setName(b.name);
    setAmount(String(b.amount));
    setDue(toDateInput(new Date(b.dueDate)));
    setFreq(b.frequency ?? 'monthly');
    setError('');
  };

  return (
    <Sheet
      title="Bills and subscriptions"
      onClose={onClose}
      footer={<button type="button" className="btn primary" onClick={() => { onSave(list); onClose(); }}>Save bills</button>}
    >
      <div className="field">
        <input className="input" style={{ marginBottom: 10 }} placeholder="Name, e.g. Wi-Fi or Rent" aria-label="Bill name" maxLength={30} value={name} onChange={e => setName(e.target.value)} />
        <div className="form-row" style={{ marginBottom: 10 }}>
          <input className="input" style={{ flex: 1 }} placeholder="Amount" aria-label="Bill amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
          <input className="input" style={{ flex: 1 }} type="date" aria-label="Due date" value={due} onChange={e => setDue(e.target.value)} />
        </div>
        <div className="chips wrap" role="radiogroup" aria-label="Repeats">
          {FREQUENCIES.map(f => (
            <button key={f.id} type="button" role="radio" aria-checked={freq === f.id} className={`chip ${freq === f.id ? 'on' : ''}`} onClick={() => setFreq(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        {error && <p className="hint bad" role="alert">{error}</p>}
        <div className="form-row" style={{ marginTop: 10 }}>
          {editing && <button type="button" className="btn" style={{ flex: 1 }} onClick={reset}>Cancel edit</button>}
          <button type="button" className="btn" style={{ flex: 1 }} onClick={submit}>{editing ? 'Update bill' : 'Add bill'}</button>
        </div>
      </div>

      <div className="list">
        {sortBills(list).map(b => {
          const { state } = billState(b);
          return (
            <div className="row" key={b.id}>
              <button type="button" className="row" style={{ border: 0, minHeight: 0, padding: 0, flex: 1 }} onClick={() => edit(b)} aria-label={`Edit ${b.name}`}>
                <span className={`row-icon ${state === 'overdue' ? 'bad' : state === 'today' || state === 'soon' ? 'warn' : ''}`}><Icon name="receipt_long" small /></span>
                <span className="row-main">
                  <span className="row-title" style={{ display: 'block' }}>{b.name}</span>
                  <span className={`row-sub ${state === 'overdue' ? 'bad' : ''}`} style={{ display: 'block' }}>
                    {billCaption(b)} · {FREQUENCIES.find(f => f.id === (b.frequency ?? 'monthly'))?.label}
                  </span>
                </span>
                <span className="num row-amount">{formatCurrency(b.amount)}</span>
              </button>
              <button type="button" className="icon-btn danger" aria-label={`Remove ${b.name}`} onClick={() => setList(list.filter(x => x.id !== b.id))}>
                <Icon name="delete" small />
              </button>
            </div>
          );
        })}
      </div>
      {list.length === 0 && <Empty title="No bills yet" desc="Add rent, subscriptions or EMIs and KAAS will remind you before they are due." />}
    </Sheet>
  );
}

// ── Goals ─────────────────────────────────────────────────────────
export function GoalsSheet({ goals, onSave, onClose }: {
  goals: Goal[];
  onSave: (goals: Goal[]) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState(goals);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [delta, setDelta] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    const value = parseAmount(target);
    if (!name.trim()) return setError('Give the goal a name.');
    if (!(value > 0)) return setError('Enter a target amount.');
    setList([...list, { id: uid(), name: name.trim(), targetAmount: value, savedAmount: 0, icon: 'savings', color: '#0B5D45' }]);
    setName('');
    setTarget('');
    setError('');
  };

  const move = (id: string, sign: 1 | -1) => {
    const value = parseAmount(delta);
    if (!(value > 0)) return setError('Enter an amount to move.');
    setList(list.map(g => (g.id === id ? { ...g, savedAmount: Math.max(0, g.savedAmount + sign * value) } : g)));
    setDelta('');
    setError('');
  };

  return (
    <Sheet
      title="Savings goals"
      onClose={onClose}
      footer={<button type="button" className="btn primary" onClick={() => { onSave(list); onClose(); }}>Save goals</button>}
    >
      <div className="form-row" style={{ marginBottom: 6 }}>
        <input className="input" style={{ flex: 2 }} placeholder="Goal, e.g. New phone" aria-label="Goal name" maxLength={28} value={name} onChange={e => setName(e.target.value)} />
        <input className="input" style={{ flex: 1 }} placeholder="Target" aria-label="Target amount" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} />
      </div>
      <button type="button" className="btn block" onClick={add}>Add goal</button>
      {error && <p className="hint bad" role="alert">{error}</p>}

      <div className="list" style={{ marginTop: 16 }}>
        {list.map(g => {
          const pct = Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100));
          const isOpen = open === g.id;
          return (
            <div key={g.id} style={{ borderBottom: '1px solid var(--line)', padding: '12px 0' }}>
              <button type="button" className="row" style={{ border: 0, padding: 0, minHeight: 44 }} aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : g.id); setDelta(''); setError(''); }}>
                <span className="row-icon in"><Icon name={g.icon} small /></span>
                <span className="row-main">
                  <span className="row-title" style={{ display: 'block' }}>{g.name}</span>
                  <span className="row-sub num" style={{ display: 'block' }}>{formatCurrency(g.savedAmount)} of {formatCurrency(g.targetAmount)}</span>
                </span>
                <span className="num row-amount">{pct}%</span>
              </button>
              <div className="track" style={{ marginTop: 10 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.name} progress`}>
                <i style={{ width: `${pct}%` }} />
              </div>
              {isOpen && (
                <div style={{ marginTop: 12 }}>
                  <input className="input" inputMode="decimal" placeholder="Amount" aria-label={`Amount to move for ${g.name}`} value={delta} onChange={e => setDelta(e.target.value)} />
                  <div className="form-row" style={{ marginTop: 8 }}>
                    <button type="button" className="btn primary small" style={{ flex: 1 }} onClick={() => move(g.id, 1)}>Add savings</button>
                    <button type="button" className="btn small" style={{ flex: 1 }} onClick={() => move(g.id, -1)}>Take out</button>
                    <button type="button" className="btn danger small" onClick={() => setList(list.filter(x => x.id !== g.id))}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {list.length === 0 && <Empty title="No goals yet" desc="Name something you are saving for and track it here." />}
    </Sheet>
  );
}

// ── Custom categories ─────────────────────────────────────────────
export function CategoriesSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [cats, setCats] = useState<Category[]>(getCustomCategories);
  const [note, setNote] = useState('');

  const remove = (c: Category) => {
    if (isCategoryInUse(c.id)) {
      setNote(`"${c.name}" is used by existing records, so it cannot be removed.`);
      return;
    }
    if (deleteCustomCategory(c.id)) {
      setCats(getCustomCategories());
      setNote('');
      onChanged();
    }
  };

  return (
    <Sheet title="Your categories" onClose={onClose}>
      <p className="hint" style={{ marginTop: 0 }}>Built-in categories are always available. Add new ones while logging a transaction.</p>
      {note && <p className="hint bad" role="alert">{note}</p>}
      <div className="list" style={{ marginTop: 10 }}>
        {cats.map(c => (
          <div className="row" key={c.id}>
            <span className="row-icon"><Icon name={c.icon} small /></span>
            <div className="row-main">
              <div className="row-title">{c.name}</div>
              <div className="row-sub">{c.type === 'income' ? 'Income' : 'Expense'}</div>
            </div>
            <button type="button" className="icon-btn danger" aria-label={`Remove ${c.name}`} onClick={() => remove(c)}>
              <Icon name="delete" small />
            </button>
          </div>
        ))}
      </div>
      {cats.length === 0 && <Empty title="No custom categories" desc="Tap New category in the add screen to create one." />}
    </Sheet>
  );
}

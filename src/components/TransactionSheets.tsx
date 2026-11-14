import { useMemo, useState } from 'react';
import {
  getAllCategories, getSettings, saveCustomCategory, formatCurrency, parseAmount,
  type Category, type Transaction,
} from '../db';
import { uid } from '../lib/id';
import { fromInputs, toDateInput, toTimeInput } from '../lib/dates';
import { compressImage, pickImage } from '../lib/media';
import { CATEGORY_ICONS, Icon, Segmented, Sheet, SwitchRow } from './ui';

const PAYMENT_METHODS = ['UPI', 'Cash', 'Card', 'Bank'];
const MAX_AMOUNT = 1_000_000_000;

type SpeechCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: () => void;
  onend: () => void;
  onerror: () => void;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  start: () => void;
};

const speechCtor = (): SpeechCtor | null => {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function AddSheet({ prefill, onClose, onSave, onToast }: {
  prefill?: Partial<Transaction>;
  onClose: () => void;
  onSave: (tx: Transaction) => void;
  onToast: (msg: string, kind?: 'error') => void;
}) {
  const isEdit = !!prefill?.id;
  const initialDate = prefill?.date ? new Date(prefill.date) : new Date();

  const [type, setType] = useState<'expense' | 'income'>(prefill?.type ?? 'expense');
  const [amount, setAmount] = useState(prefill?.amount ? String(prefill.amount) : '');
  const [merchant, setMerchant] = useState(prefill?.merchant ?? '');
  const [catId, setCatId] = useState(prefill?.categoryId ?? (prefill?.type === 'income' ? 'salary' : 'food'));
  const [dateStr, setDateStr] = useState(toDateInput(initialDate));
  const [timeStr, setTimeStr] = useState(toTimeInput(initialDate));
  const [payment, setPayment] = useState(prefill?.paymentMethod ?? 'UPI');
  const [photo, setPhoto] = useState(prefill?.receiptPhoto ?? '');
  const [impulse, setImpulse] = useState(!!prefill?.isUnnecessary);
  const [error, setError] = useState('');
  const [allCats, setAllCats] = useState<Category[]>(getAllCategories);
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('category');
  const [listening, setListening] = useState(false);

  const cats = useMemo(() => allCats.filter(c => c.type === type), [allCats, type]);
  const selected = cats.find(c => c.id === catId) ?? cats[cats.length - 1];
  const currency = getSettings().currency || '₹';
  const Speech = speechCtor();

  const switchType = (next: 'expense' | 'income') => {
    setType(next);
    setCatId(next === 'expense' ? 'food' : 'salary');
    if (next === 'income') setImpulse(false);
  };

  const createCategory = () => {
    const name = newCatName.trim();
    if (!name) { setAddingCat(false); return; }
    const exists = allCats.some(c => c.type === type && c.name.toLowerCase() === name.toLowerCase());
    if (exists) { onToast('That category already exists', 'error'); return; }
    const cat: Category = { id: `custom_${uid()}`, name, icon: newCatIcon, type, color: '#0B5D45' };
    if (!saveCustomCategory(cat)) { onToast('Storage is full. Could not save the category.', 'error'); return; }
    setAllCats(getAllCategories());
    setCatId(cat.id);
    setAddingCat(false);
    setNewCatName('');
    setNewCatIcon('category');
  };

  const attach = async (source: 'camera' | 'gallery') => {
    const raw = await pickImage(source);
    if (raw) setPhoto(await compressImage(raw));
  };

  const dictate = () => {
    if (!Speech) return;
    const rec = new Speech();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-IN';
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); onToast('Could not hear that. Try again.', 'error'); };
    rec.onresult = e => {
      const said = e.results[0][0].transcript;
      const digits = said.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
      if (digits) setAmount(digits[0]);
      const lower = said.toLowerCase();
      const hit = cats.find(c => lower.includes(c.name.toLowerCase().split(' ')[0]));
      if (hit) setCatId(hit.id);
      setMerchant(said.replace(/\d+(?:\.\d+)?/g, '').replace(/\s+/g, ' ').trim());
    };
    rec.start();
  };

  const submit = () => {
    const value = parseAmount(amount);
    if (!(value > 0)) { setError('Enter an amount greater than zero.'); return; }
    if (value > MAX_AMOUNT) { setError('That amount is too large.'); return; }
    const when = fromInputs(dateStr, timeStr);
    if (!when) { setError('Pick a valid date.'); return; }
    const cat = selected ?? cats[0];
    const label = merchant.trim();
    onSave({
      id: prefill?.id ?? uid(),
      type,
      amount: value,
      categoryId: cat.id,
      categoryName: cat.name,
      categoryIcon: cat.icon,
      merchant: label || cat.name,
      description: label,
      date: when.toISOString(),
      paymentMethod: payment,
      createdAt: prefill?.createdAt ?? new Date().toISOString(),
      receiptPhoto: photo || undefined,
      isUnnecessary: type === 'expense' && impulse,
    });
  };

  const setToday = () => { const n = new Date(); setDateStr(toDateInput(n)); setTimeStr(toTimeInput(n)); };
  const setYesterday = () => { const y = new Date(Date.now() - 86400000); setDateStr(toDateInput(y)); };

  return (
    <Sheet
      title={isEdit ? 'Edit transaction' : type === 'income' ? 'Add income' : 'Add expense'}
      onClose={onClose}
      footer={<button type="button" className="btn primary" onClick={submit}>{isEdit ? 'Save changes' : 'Save'}</button>}
    >
      <div className="form-row" style={{ alignItems: 'center', marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <Segmented
            label="Transaction type"
            value={type}
            onChange={switchType}
            options={[{ id: 'expense', label: 'Expense' }, { id: 'income', label: 'Income' }]}
          />
        </div>
        {Speech && (
          <button type="button" className="icon-btn" onClick={dictate} aria-label={listening ? 'Listening' : 'Dictate amount and note'}>
            <Icon name={listening ? 'mic' : 'mic_none'} />
          </button>
        )}
      </div>

      <div className="amount-box">
        <label className="label" htmlFor="amount">Amount ({currency.trim()})</label>
        <input
          id="amount"
          className={`amount-input ${type === 'income' ? 'in' : ''}`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={amount}
          onChange={e => { setAmount(e.target.value); setError(''); }}
          aria-invalid={!!error}
          aria-describedby={error ? 'add-error' : undefined}
          autoFocus
        />
        {error && <p id="add-error" className="hint bad" role="alert">{error}</p>}
      </div>

      <div className="field">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="label" style={{ margin: 0 }}>Category</span>
          {!addingCat && <button type="button" className="link-btn" onClick={() => setAddingCat(true)}>New category</button>}
        </div>
        {addingCat ? (
          <div>
            <div className="form-row" style={{ margin: '6px 0 12px' }}>
              <input
                className="input"
                placeholder="Category name"
                aria-label="New category name"
                value={newCatName}
                maxLength={24}
                onChange={e => setNewCatName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="icon-grid" role="radiogroup" aria-label="Category icon">
              {CATEGORY_ICONS.map(name => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={newCatIcon === name}
                  aria-label={name.replace(/_/g, ' ')}
                  className={newCatIcon === name ? 'on' : ''}
                  onClick={() => setNewCatIcon(name)}
                >
                  <Icon name={name} />
                </button>
              ))}
            </div>
            <div className="form-row" style={{ marginTop: 12 }}>
              <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setAddingCat(false)}>Cancel</button>
              <button type="button" className="btn primary" style={{ flex: 1 }} onClick={createCategory}>Add category</button>
            </div>
          </div>
        ) : (
          <div className="chips" role="radiogroup" aria-label="Category">
            {cats.map(c => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={selected?.id === c.id}
                className={`chip ${selected?.id === c.id ? 'on' : ''}`}
                onClick={() => setCatId(c.id)}
              >
                <Icon name={c.icon || 'label'} small />
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <label className="label" htmlFor="merchant">Note or merchant</label>
        <input
          id="merchant"
          className="input"
          placeholder={selected?.name ?? 'Where was this?'}
          value={merchant}
          maxLength={60}
          onChange={e => setMerchant(e.target.value)}
        />
      </div>

      <div className="field">
        <span className="label">Paid with</span>
        <div className="chips wrap" role="radiogroup" aria-label="Payment method">
          {PAYMENT_METHODS.map(m => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={payment === m}
              className={`chip ${payment === m ? 'on' : ''}`}
              onClick={() => setPayment(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">Date</span>
        <div className="form-row" style={{ marginBottom: 8 }}>
          <button type="button" className="btn small" style={{ flex: 1 }} onClick={setToday}>Today</button>
          <button type="button" className="btn small" style={{ flex: 1 }} onClick={setYesterday}>Yesterday</button>
        </div>
        <div className="form-row">
          <input className="input" type="date" aria-label="Date" value={dateStr} onChange={e => setDateStr(e.target.value)} style={{ flex: 3 }} />
          <input className="input" type="time" aria-label="Time" value={timeStr} onChange={e => setTimeStr(e.target.value)} style={{ flex: 2 }} />
        </div>
      </div>

      <div className="field">
        <span className="label">Receipt photo</span>
        {photo ? (
          <div className="photo-thumb">
            <img src={photo} alt="Attached receipt" />
            <button type="button" onClick={() => setPhoto('')} aria-label="Remove photo"><Icon name="close" small /></button>
          </div>
        ) : (
          <div className="form-row">
            <button type="button" className="btn small" style={{ flex: 1 }} onClick={() => attach('camera')}>
              <Icon name="photo_camera" small /> Camera
            </button>
            <button type="button" className="btn small" style={{ flex: 1 }} onClick={() => attach('gallery')}>
              <Icon name="image" small /> Gallery
            </button>
          </div>
        )}
      </div>

      {type === 'expense' && (
        <SwitchRow
          title="Mark as impulse spend"
          sub="Counted separately in Insights"
          checked={impulse}
          onChange={setImpulse}
        />
      )}
    </Sheet>
  );
}

export function DetailSheet({ tx, onClose, onEdit, onDelete }: {
  tx: Transaction;
  onClose: () => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  const when = new Date(tx.date);
  const rows: [string, string][] = [
    ['Category', tx.categoryName],
    ['Date', when.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })],
    ['Paid with', tx.paymentMethod || 'Not recorded'],
  ];
  if (tx.notes) rows.push(['Notes', tx.notes]);

  return (
    <Sheet
      title="Transaction"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn danger" onClick={() => onDelete(tx)}><Icon name="delete" small /> Delete</button>
          <button type="button" className="btn primary" onClick={() => onEdit(tx)}><Icon name="edit" small /> Edit</button>
        </>
      }
    >
      <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
        <div className="num" style={{ fontSize: 34, fontWeight: 500, color: tx.type === 'income' ? 'var(--brand-text)' : 'var(--ink)' }}>
          {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
        </div>
        <div style={{ fontWeight: 500, marginTop: 4 }}>
          {tx.merchant}
          {tx.isUnnecessary && <span className="tag">Impulse</span>}
        </div>
      </div>
      <div className="list">
        {rows.map(([k, v]) => (
          <div className="row" key={k} style={{ minHeight: 48 }}>
            <span className="row-sub" style={{ flex: '0 0 96px' }}>{k}</span>
            <span className="row-main" style={{ textAlign: 'right', whiteSpace: 'normal' }}>{v}</span>
          </div>
        ))}
      </div>
      {tx.receiptPhoto && (
        <div style={{ marginTop: 16 }}>
          <span className="label">Receipt</span>
          <img src={tx.receiptPhoto} alt="Receipt" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 'var(--r-md)', background: 'var(--sunken)' }} />
        </div>
      )}
    </Sheet>
  );
}

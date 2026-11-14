import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CURRENCIES, parseAmount } from '../db';

function DialogFrame({ title, children, onCancel }: { title: string; children: ReactNode; onCancel: () => void }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="scrim center" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} ref={ref}>
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onCancel }: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <DialogFrame title={title} onCancel={onCancel}>
      <p>{body}</p>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </DialogFrame>
  );
}

export function PromptDialog({ title, label, initial = '', kind = 'text', onSave, onCancel }: {
  title: string;
  label: string;
  initial?: string;
  kind?: 'text' | 'amount';
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const fieldId = useId();

  const submit = () => {
    const v = value.trim();
    if (kind === 'amount') {
      if (v === '') return onSave('0'); // clearing a budget switches it off
      const n = parseAmount(v);
      if (!(n >= 0)) return setError('Enter a valid amount.');
      return onSave(String(n));
    }
    if (!v) return setError('This cannot be empty.');
    onSave(v);
  };

  return (
    <DialogFrame title={title} onCancel={onCancel}>
      <div className="field">
        <label className="label" htmlFor={fieldId}>{label}</label>
        <input
          id={fieldId}
          className={`input ${error ? 'invalid' : ''}`}
          value={value}
          inputMode={kind === 'amount' ? 'decimal' : 'text'}
          maxLength={kind === 'amount' ? 12 : 30}
          onChange={e => { setValue(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoFocus
        />
        {error && <p className="hint bad" role="alert">{error}</p>}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" onClick={submit}>Save</button>
      </div>
    </DialogFrame>
  );
}

export function CurrencyDialog({ current, onSave, onCancel }: {
  current: string;
  onSave: (symbol: string) => void;
  onCancel: () => void;
}) {
  const [custom, setCustom] = useState('');
  return (
    <DialogFrame title="Currency" onCancel={onCancel}>
      <div className="chips wrap" role="radiogroup" aria-label="Currency" style={{ marginBottom: 14 }}>
        {CURRENCIES.map(c => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={current === c}
            className={`chip ${current === c ? 'on' : ''}`}
            onClick={() => onSave(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="field">
        <label className="label" htmlFor="custom-cur">Or type your own</label>
        <input
          id="custom-cur"
          className="input"
          value={custom}
          maxLength={4}
          placeholder="e.g. Rs"
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && custom.trim() && onSave(custom.trim())}
        />
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" disabled={!custom.trim()} onClick={() => onSave(custom.trim())}>Use this</button>
      </div>
    </DialogFrame>
  );
}

export function ChoiceDialog({ title, choices, onCancel }: {
  title: string;
  choices: { label: string; icon?: string; danger?: boolean; run: () => void }[];
  onCancel: () => void;
}) {
  return (
    <DialogFrame title={title} onCancel={onCancel}>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {choices.map(c => (
          <button key={c.label} type="button" className={`btn block ${c.danger ? 'danger' : ''}`} onClick={c.run}>
            {c.icon && <span className="material-symbols-outlined ms sm" aria-hidden="true">{c.icon}</span>}
            {c.label}
          </button>
        ))}
        <button type="button" className="btn ghost block" onClick={onCancel}>Cancel</button>
      </div>
    </DialogFrame>
  );
}

export function BusyDialog({ text }: { text: string }) {
  return (
    <div className="scrim center">
      <div className="dialog" role="status" aria-live="polite" style={{ textAlign: 'center' }}>
        <span className="material-symbols-outlined ms pulse" style={{ fontSize: 40, color: 'var(--brand)' }} aria-hidden="true">document_scanner</span>
        <h2 style={{ marginTop: 10 }}>{text}</h2>
        <p style={{ marginBottom: 0 }}>This can take a few seconds.</p>
      </div>
    </div>
  );
}

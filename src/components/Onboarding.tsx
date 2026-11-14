import { useState } from 'react';
import { CURRENCIES, parseAmount } from '../db';

export function Onboarding({ onDone }: {
  onDone: (data: { userName: string; monthlyBudget: number; currency: string }) => void;
}) {
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState<string>('₹');
  const [error, setError] = useState('');

  const submit = () => {
    const trimmed = budget.trim();
    const value = trimmed === '' ? 0 : parseAmount(trimmed);
    if (!(value >= 0)) return setError('Enter the budget as a number, or leave it empty.');
    onDone({ userName: name.trim(), monthlyBudget: value, currency });
  };

  return (
    <main className="onboard">
      <img className="mark" src="./kaas_icon.png" alt="KAAS" />
      <h1>Know where your money goes.</h1>
      <p className="lead">Log spending in seconds, scan handwritten notes, and see what is left each month. Everything stays on your phone.</p>

      <div className="field">
        <label className="label" htmlFor="ob-name">What should we call you?</label>
        <input id="ob-name" className="input" value={name} maxLength={30} placeholder="Your name" onChange={e => setName(e.target.value)} autoComplete="given-name" />
      </div>

      <div className="field">
        <span className="label">Currency</span>
        <div className="chips wrap" role="radiogroup" aria-label="Currency">
          {CURRENCIES.map(c => (
            <button key={c} type="button" role="radio" aria-checked={currency === c} className={`chip ${currency === c ? 'on' : ''}`} onClick={() => setCurrency(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="ob-budget">Monthly budget (optional)</label>
        <input id="ob-budget" className={`input ${error ? 'invalid' : ''}`} inputMode="decimal" value={budget} placeholder="e.g. 30000" onChange={e => { setBudget(e.target.value); setError(''); }} />
        {error ? <p className="hint bad" role="alert">{error}</p> : <p className="hint">Used to show what is left to spend each day. You can change it later.</p>}
      </div>

      <div className="spacer" />
      <button type="button" className="btn primary block" onClick={submit}>Get started</button>
    </main>
  );
}

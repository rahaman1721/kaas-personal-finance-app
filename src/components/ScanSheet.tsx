import { useState } from 'react';
import { formatCurrency, parseAmount } from '../db';
import type { NumberScan } from '../lib/ocr';
import { Sheet } from './ui';

const REASONS: Record<NumberScan['reason'], string> = {
  'sum-of-others': 'This number equals the sum of the others, so it is probably the total.',
  largest: 'Using the largest number found. Tap numbers to add or remove them.',
  'only-one': 'Only one number was found.',
  none: 'No numbers were found. Type the amount below.',
};

export function ScanSheet({ photo, scan, onClose, onContinue }: {
  photo: string;
  scan: NumberScan;
  onClose: () => void;
  onContinue: (amount: number, note: string) => void;
}) {
  const [picked, setPicked] = useState<number[]>(scan.suggestedTotal ? [scan.suggestedTotal] : []);
  const [manual, setManual] = useState('');
  const [note, setNote] = useState('');

  const typed = manual.trim() !== '';
  const total = typed ? parseAmount(manual) : picked.reduce((a, b) => a + b, 0);
  const valid = Number.isFinite(total) && total > 0;

  const toggle = (n: number) => {
    setManual('');
    setPicked(p => (p.includes(n) ? p.filter(x => x !== n) : [...p, n]));
  };

  return (
    <Sheet
      title="Check the amount"
      onClose={onClose}
      footer={
        <button type="button" className="btn primary" disabled={!valid} onClick={() => onContinue(total, note.trim())}>
          Continue with {valid ? formatCurrency(total) : 'amount'}
        </button>
      }
    >
      <div className="scan-total">
        <div className="num">{valid ? formatCurrency(total) : formatCurrency(0)}</div>
        <p className="hint">{typed ? 'Using the amount you typed.' : REASONS[scan.reason]}</p>
      </div>

      {scan.numbers.length > 0 && (
        <div className="field">
          <span className="label">Numbers found. Tap to add up.</span>
          <div className="chips wrap" role="group" aria-label="Detected numbers">
            {scan.numbers.slice(0, 16).map(n => (
              <button
                key={n}
                type="button"
                aria-pressed={!typed && picked.includes(n)}
                className={`chip ${!typed && picked.includes(n) ? 'on' : ''}`}
                onClick={() => toggle(n)}
              >
                <span className="num">{formatCurrency(n)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="scan-manual">Type the amount instead</label>
        <input
          id="scan-manual"
          className="input"
          inputMode="decimal"
          placeholder="Optional"
          value={manual}
          onChange={e => setManual(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="scan-note">Note or shop name</label>
        <input id="scan-note" className="input" maxLength={60} value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" />
      </div>

      <div className="photo-thumb" style={{ width: '100%', height: 160 }}>
        <img src={photo} alt="Scanned note" style={{ objectFit: 'contain', background: 'var(--sunken)' }} />
      </div>
    </Sheet>
  );
}

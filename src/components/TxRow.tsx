import { formatCurrency, type Transaction } from '../db';
import { shortDate, timeLabel } from '../lib/dates';
import { Icon } from './ui';

export function TxRow({ tx, onOpen, showDate }: { tx: Transaction; onOpen: (tx: Transaction) => void; showDate?: boolean }) {
  const d = new Date(tx.date);
  const income = tx.type === 'income';
  return (
    <button type="button" className="row" onClick={() => onOpen(tx)} aria-label={`${tx.merchant}, ${income ? 'income' : 'expense'} ${formatCurrency(tx.amount)}`}>
      <span className={`row-icon ${income ? 'in' : ''}`}>
        <Icon name={tx.categoryIcon || 'category'} small />
      </span>
      <span className="row-main">
        <span className="row-title" style={{ display: 'block' }}>{tx.merchant}</span>
        <span className="row-sub" style={{ display: 'block' }}>
          {tx.categoryName}
          {showDate ? ` · ${shortDate(d)}` : ''}
          {tx.isUnnecessary && <span className="tag">Impulse</span>}
        </span>
      </span>
      <span className="row-end">
        <span className={`num row-amount ${income ? 'in' : ''}`} style={{ display: 'block' }}>
          {income ? '+' : '-'}{formatCurrency(tx.amount)}
        </span>
        {!showDate && <span className="row-time" style={{ display: 'block' }}>{timeLabel(d)}</span>}
      </span>
    </button>
  );
}

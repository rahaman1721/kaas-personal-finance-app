import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Icon({ name, small, className = '' }: { name: string; small?: boolean; className?: string }) {
  return (
    <span className={`material-symbols-outlined ms ${small ? 'sm' : ''} ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

export function Sheet({ title, onClose, children, footer }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <h2 className="sheet-title" id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          className={value === o.id ? 'on' : ''}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SwitchRow({ title, sub, checked, onChange }: {
  title: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button type="button" className="switch-row" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span className="row-main">
        <span className="row-title" style={{ display: 'block' }}>{title}</span>
        {sub && <span className="row-sub" style={{ display: 'block' }}>{sub}</span>}
      </span>
      <span className="switch" aria-hidden="true" aria-checked={checked ? 'true' : 'false'} />
    </button>
  );
}

export function Empty({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {desc && <p className="empty-desc">{desc}</p>}
      {action}
    </div>
  );
}

export function Avatar({ name, photo, size }: { name: string; photo?: string; size?: number }) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {photo ? <img src={photo} alt="" /> : (name || 'K').trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export const CATEGORY_ICONS = [
  'restaurant', 'local_cafe', 'shopping_cart', 'shopping_bag', 'commute', 'local_gas_station',
  'home', 'receipt_long', 'medical_services', 'school', 'sports_esports', 'movie',
  'flight', 'fitness_center', 'pets', 'child_care', 'redeem', 'savings', 'work', 'category',
];

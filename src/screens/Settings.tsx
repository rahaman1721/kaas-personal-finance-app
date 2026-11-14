import type { ReactNode } from 'react';
import { formatCurrency, storageUsedBytes, type AppSettings } from '../db';
import { Avatar, Icon, Segmented, SwitchRow } from '../components/ui';

export type SettingsAction =
  | 'name' | 'budget' | 'currency' | 'photo' | 'quick' | 'bills' | 'goals' | 'categories'
  | 'export-json' | 'export-csv' | 'import' | 'restore' | 'clear';

function Item({ icon, title, sub, onClick, end }: {
  icon: string;
  title: string;
  sub?: string;
  onClick: () => void;
  end?: ReactNode;
}) {
  return (
    <button type="button" className="row" onClick={onClick}>
      <span className="row-icon"><Icon name={icon} small /></span>
      <span className="row-main">
        <span className="row-title" style={{ display: 'block' }}>{title}</span>
        {sub && <span className="row-sub" style={{ display: 'block' }}>{sub}</span>}
      </span>
      {end ?? <Icon name="chevron_right" small className="" />}
    </button>
  );
}

export function SettingsScreen({ settings, backupInfo, remindersAvailable, onUpdate, onAction }: {
  settings: AppSettings;
  backupInfo: { at: string; transactions: number } | null;
  remindersAvailable: boolean;
  onUpdate: (s: Partial<AppSettings>) => void;
  onAction: (a: SettingsAction) => void;
}) {
  const usedMb = storageUsedBytes() / (1024 * 1024);
  const name = settings.userName.trim();

  return (
    <div className="screen">
      <header className="page-head">
        <h1 className="page-title">Settings</h1>
      </header>

      <div className="list">
        <button type="button" className="row" onClick={() => onAction('photo')} style={{ minHeight: 72 }}>
          <Avatar name={name || 'K'} photo={settings.profilePic} />
          <span className="row-main">
            <span className="row-title" style={{ display: 'block' }}>{name || 'Add your name'}</span>
            <span className="row-sub" style={{ display: 'block' }}>Tap to change photo</span>
          </span>
          <Icon name="chevron_right" small />
        </button>
      </div>

      <div className="section-head"><h2 className="section-title">Money</h2></div>
      <div className="list">
        <Item icon="person" title="Name" sub={name || 'Not set'} onClick={() => onAction('name')} />
        <Item icon="account_balance_wallet" title="Monthly budget" sub={settings.monthlyBudget > 0 ? formatCurrency(settings.monthlyBudget) : 'Not set'} onClick={() => onAction('budget')} />
        <Item icon="currency_exchange" title="Currency" sub={settings.currency} onClick={() => onAction('currency')} />
        <Item icon="savings" title="Savings goals" sub="Track what you are saving for" onClick={() => onAction('goals')} />
      </div>

      <div className="section-head"><h2 className="section-title">Shortcuts and reminders</h2></div>
      <div className="list">
        <Item icon="bolt" title="Quick log shortcuts" sub="One-tap entries on Home" onClick={() => onAction('quick')} />
        <Item icon="receipt_long" title="Bills and subscriptions" sub="Due dates and repeats" onClick={() => onAction('bills')} />
        <Item icon="category" title="Your categories" sub="Remove custom categories" onClick={() => onAction('categories')} />
        <SwitchRow
          title="Bill reminders"
          sub={remindersAvailable ? 'A notification the day before and on the due date' : 'Available in the Android app'}
          checked={!!settings.remindersEnabled && remindersAvailable}
          onChange={v => remindersAvailable && onUpdate({ remindersEnabled: v })}
        />
      </div>

      <div className="section-head"><h2 className="section-title">Appearance</h2></div>
      <Segmented
        label="Theme"
        value={settings.theme}
        onChange={theme => onUpdate({ theme })}
        options={[{ id: 'system', label: 'Match phone' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]}
      />

      <div className="section-head"><h2 className="section-title">Your data</h2></div>
      <div className="list">
        <SwitchRow
          title="Automatic backup"
          sub={backupInfo ? `Last saved ${new Date(backupInfo.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Keeps a copy of your records on this device'}
          checked={!!settings.autoBackup}
          onChange={v => onUpdate({ autoBackup: v })}
        />
        {backupInfo && (
          <Item icon="history" title="Restore automatic backup" sub={`${backupInfo.transactions} transactions, photos excluded`} onClick={() => onAction('restore')} />
        )}
        <Item icon="download" title="Export backup (JSON)" sub="Everything, including photos" onClick={() => onAction('export-json')} />
        <Item icon="table_view" title="Export spreadsheet (CSV)" sub="Opens in Excel or Google Sheets" onClick={() => onAction('export-csv')} />
        <Item icon="upload" title="Import backup" sub="Replaces the data on this device" onClick={() => onAction('import')} />
      </div>
      <p className="storage-note">Using about {usedMb < 0.1 ? 'less than 0.1' : usedMb.toFixed(1)} MB of on-device storage. Receipt photos take the most room.</p>

      <div className="section-head"><h2 className="section-title">Danger zone</h2></div>
      <button type="button" className="btn danger block" onClick={() => onAction('clear')}>
        <Icon name="delete_forever" small /> Erase all data
      </button>
      <p className="storage-note" style={{ textAlign: 'center', marginTop: 24 }}>KAAS 1.0 · Your data stays on this device.</p>
    </div>
  );
}

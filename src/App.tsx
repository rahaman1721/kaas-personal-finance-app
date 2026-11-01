import { useState, useEffect, useCallback, useMemo } from 'react';
import { Camera, CameraResultType } from '@capacitor/camera';
import Tesseract from 'tesseract.js';
import './index.css';
import {
  initDB, getTransactions, getSettings, getQuickExpenses, getBills,
  saveTransaction, updateTransaction, deleteTransaction, saveSettings,
  clearAllData, formatCurrency,
  getExpenseCategories, getIncomeCategories, getAllCategories, saveCustomCategory,
  saveQuickExpenses, saveBills,
  Transaction, AppSettings, QuickExpense, Bill, Category
} from './db';

const uuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const parseDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

interface OCRResult {
  total: number;
  merchantName: string;
  allDetectedNumbers: number[];
  sumOfNumbers: number;
  rawText: string;
}

interface OCRData {
  photo: string;
  merchant: string;
  total: number;
  allNumbers: number[];
  sum: number;
}

// ── Image Preprocessing for OCR ──────────────────────────────────────
const preprocessImageForOCR = (dataUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        let lum = 0.299 * r + 0.587 * g + 0.114 * b;
        lum = lum > 130 ? 255 : 0;
        data[i] = data[i+1] = data[i+2] = lum;
      }
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.src = dataUrl;
  });
};

function parseReceiptText(rawText: string): OCRResult {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  let merchantName = '';
  let detectedTotal: number | null = null;
  const allNumbers: number[] = [];

  for (const line of lines) {
    if (/[a-zA-Z]{3,}/.test(line) && !/total|subtotal|tax|date|cash|receipt|invoice|thank/i.test(line)) {
      merchantName = line.replace(/[^a-zA-Z0-9\s]/g, '').slice(0, 25).trim();
      break;
    }
  }

  const totalRegex = /(?:total|grand\s*total|net\s*amount|amount\ Bal|payable|due|bal|rs\.?|inr|₹|\$)\s*[:=]?\s*([0-9]+(?:[\.,][0-9]{1,2})?)/gi;
  let match;
  while ((match = totalRegex.exec(rawText)) !== null) {
    const val = parseFloat(match[1].replace(',', '.'));
    if (val > 0 && (detectedTotal === null || val > detectedTotal)) {
      detectedTotal = val;
    }
  }

  const numberRegex = /(?:\b|\b[Rs₹\$])([0-9]{1,6}(?:\.[0-9]{1,2})?)\b/g;
  let numMatch;
  while ((numMatch = numberRegex.exec(rawText)) !== null) {
    const val = parseFloat(numMatch[1]);
    if (val > 0 && val < 100000 && val !== 2024 && val !== 2025 && val !== 2026) {
      if (!allNumbers.includes(val)) {
        allNumbers.push(val);
      }
    }
  }

  if (detectedTotal === null && allNumbers.length > 0) {
    detectedTotal = Math.max(...allNumbers);
  }

  return {
    total: detectedTotal || 0,
    merchantName: merchantName || 'Scanned Store',
    allDetectedNumbers: allNumbers.sort((a, b) => b - a),
    sumOfNumbers: allNumbers.reduce((a, b) => a + b, 0),
    rawText
  };
}

// ── Splash Screen ───────────────────────────────────────────────────
function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [fading, setFading] = useState(false);

  const handleEnd = () => {
    setFading(true);
    setTimeout(onComplete, 400);
  };

  return (
    <div className={`splash-overlay ${fading ? 'fade-out' : ''}`}>
      <video
        className="splash-video"
        src="/splash.mp4"
        autoPlay
        muted
        playsInline
        onEnded={handleEnd}
        onError={handleEnd}
      />
    </div>
  );
}

// ── Toast Notification ──────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type?: 'error' }) {
  return (
    <div className={`toast-notice ${type === 'error' ? 'error' : ''}`} role="status">
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
        {type === 'error' ? 'error' : 'check_circle'}
      </span>
      <span>{msg}</span>
    </div>
  );
}

// ── Add / Edit Transaction Sheet ────────────────────────────────────
function AddModal({ onClose, onSave, prefill }: {
  onClose: () => void;
  onSave: (tx: Transaction) => void;
  prefill?: Partial<Transaction>;
}) {
  const [type, setType] = useState<'expense' | 'income'>(prefill?.type || 'expense');
  const [amount, setAmount] = useState(prefill?.amount ? String(prefill.amount) : '');
  const [merchant, setMerchant] = useState(prefill?.merchant || '');
  const [catId, setCatId] = useState(prefill?.categoryId || (type === 'expense' ? 'food' : 'salary'));
  const [dateStr, setDateStr] = useState(() => {
    const d = prefill?.date ? new Date(prefill.date) : new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  });
  const [timeStr, setTimeStr] = useState(() => {
    const d = prefill?.date ? new Date(prefill.date) : new Date();
    return d.toTimeString().slice(0, 5);
  });
  const [receiptPhoto, setReceiptPhoto] = useState<string>(prefill?.receiptPhoto || '');
  const [isUnnecessary, setIsUnnecessary] = useState<boolean>(!!prefill?.isUnnecessary);
  const [isListening, setIsListening] = useState(false);
  const [allCats, setAllCats] = useState(getAllCategories());
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('category');

  const cats = type === 'expense' ? getExpenseCategories() : getIncomeCategories();
  const selCat = allCats.find(c => c.id === catId) || cats[0] || { id: 'other', name: 'Other', icon: 'category', type, color: '#64748B' };

  const saveNewCatInline = () => {
    if (!newCatName.trim()) {
      setIsAddingCat(false);
      return;
    }
    const newCat: Category = {
      id: newCatName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
      name: newCatName.trim(),
      icon: newCatIcon || 'category',
      type,
      color: type === 'expense' ? '#DC2626' : '#059669'
    };
    saveCustomCategory(newCat);
    setAllCats(getAllCategories());
    setCatId(newCat.id);
    setIsAddingCat(false);
    setNewCatName('');
  };

  const handleSave = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    const finalDate = new Date(`${dateStr}T${timeStr}`);
    onSave({
      id: prefill?.id || uuid(),
      type,
      amount: amt,
      categoryId: selCat.id,
      categoryName: selCat.name,
      categoryIcon: selCat.icon,
      merchant: merchant.trim() || selCat.name,
      description: merchant.trim(),
      date: isNaN(finalDate.getTime()) ? new Date().toISOString() : finalDate.toISOString(),
      paymentMethod: 'UPI / Cash',
      createdAt: prefill?.createdAt || new Date().toISOString(),
      receiptPhoto,
      isUnnecessary: type === 'expense' && isUnnecessary,
      notes: isUnnecessary ? 'unnecessary:impulse' : '',
    });
  };

  const takePhoto = async () => {
    try {
      const image = await Camera.getPhoto({ quality: 65, allowEditing: false, resultType: CameraResultType.DataUrl });
      if (image.dataUrl) setReceiptPhoto(image.dataUrl);
    } catch (e) {
      console.log('Camera dismissed', e);
    }
  };

  const startVoice = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Voice dictation is not available in this environment.');
      return;
    }
    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      const nums = transcript.match(/\d+/g);
      if (nums) setAmount(nums[0]);
      for (const cat of cats) {
        if (transcript.includes(cat.name.toLowerCase())) {
          setCatId(cat.id);
          break;
        }
      }
      setMerchant(transcript);
    };
    recognition.start();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-header">
          <h2 className="modal-title">{prefill?.id ? 'Edit Record' : 'Log Transaction'}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="icon-button" onClick={startVoice} aria-label="Dictate expense" title="Voice Dictation">
              <span className="material-symbols-outlined" style={{ color: isListening ? 'var(--coral-main)' : 'inherit' }}>
                {isListening ? 'mic' : 'mic_none'}
              </span>
            </button>
            <button className="icon-button" onClick={takePhoto} aria-label="Take receipt photo" title="Attach Receipt">
              <span className="material-symbols-outlined">photo_camera</span>
            </button>
            <button className="modal-close" onClick={onClose} aria-label="Close dialog">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
        </div>

        {/* Type Toggle */}
        <div className="segmented-control" style={{ marginBottom: 18 }}>
          <button
            type="button"
            className={`segment-btn ${type === 'expense' ? 'active' : ''}`}
            onClick={() => { setType('expense'); setCatId('food'); }}
          >
            Outflow (Expense)
          </button>
          <button
            type="button"
            className={`segment-btn ${type === 'income' ? 'active' : ''}`}
            onClick={() => { setType('income'); setCatId('salary'); }}
          >
            Inflow (Income)
          </button>
        </div>

        {/* Amount Input */}
        <div style={{
          background: 'var(--bg-surface-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          marginBottom: 18,
          border: '1px solid var(--border-subtle)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            Amount ({getSettings().currency || '₹'})
          </div>
          <input
            className="form-input num-tabular"
            style={{
              fontSize: 34,
              fontWeight: 800,
              textAlign: 'center',
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: type === 'income' ? 'var(--emerald-main)' : 'var(--text-primary)'
            }}
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            autoFocus
          />
        </div>

        {/* Category Picker */}
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label className="form-label" style={{ marginBottom: 0 }}>Category</label>
            {!isAddingCat && (
              <button
                type="button"
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--emerald-main)' }}
                onClick={() => setIsAddingCat(true)}
              >
                + New Category
              </button>
            )}
          </div>

          {isAddingCat ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                className="form-input"
                style={{ flex: 1 }}
                placeholder="Category name..."
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                autoFocus
              />
              <button className="action-btn primary" type="button" onClick={saveNewCatInline} style={{ padding: '8px 16px' }}>
                Save
              </button>
              <button className="action-btn" type="button" onClick={() => setIsAddingCat(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              padding: '4px 0 8px',
              scrollbarWidth: 'none'
            }}>
              {cats.map(c => {
                const isSelected = catId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCatId(c.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-pill)',
                      border: `1px solid ${isSelected ? 'var(--emerald-main)' : 'var(--border-subtle)'}`,
                      background: isSelected ? 'var(--emerald-subtle)' : 'var(--bg-surface-subtle)',
                      color: isSelected ? 'var(--emerald-text)' : 'var(--text-secondary)',
                      fontWeight: 600,
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{c.icon || 'label'}</span>
                    <span>{c.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Merchant / Description */}
        <div className="form-group">
          <label className="form-label" htmlFor="merchant-input">Merchant / Description</label>
          <input
            id="merchant-input"
            className="form-input"
            placeholder={selCat.name || 'e.g. Starbucks, Grocery, Rent'}
            value={merchant}
            onChange={e => setMerchant(e.target.value)}
          />
        </div>

        {/* Date & Time */}
        <div className="form-group">
          <label className="form-label">Transaction Date</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              className="action-btn"
              style={{ flex: 1, padding: '8px' }}
              onClick={() => {
                const d = new Date();
                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                setDateStr(d.toISOString().slice(0, 10));
                setTimeStr(new Date().toTimeString().slice(0, 5));
              }}
            >
              Today
            </button>
            <button
              type="button"
              className="action-btn"
              style={{ flex: 1, padding: '8px' }}
              onClick={() => {
                const d = new Date(Date.now() - 86400000);
                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                setDateStr(d.toISOString().slice(0, 10));
              }}
            >
              Yesterday
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              type="date"
              value={dateStr}
              onChange={e => setDateStr(e.target.value)}
              style={{ flex: 3 }}
            />
            <input
              className="form-input"
              type="time"
              value={timeStr}
              onChange={e => setTimeStr(e.target.value)}
              style={{ flex: 2 }}
            />
          </div>
        </div>

        {/* Receipt Attachment Thumbnail */}
        {receiptPhoto && (
          <div className="form-group">
            <label className="form-label">Attached Receipt</label>
            <div style={{ position: 'relative', width: 80, height: 80, borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <img src={receiptPhoto} alt="Receipt thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                type="button"
                onClick={() => setReceiptPhoto('')}
                style={{
                  position: 'absolute', top: 4, right: 4,
                  background: 'rgba(0,0,0,0.6)', color: '#fff',
                  width: 22, height: 22, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Impulse / Unnecessary Toggle */}
        {type === 'expense' && (
          <div
            onClick={() => setIsUnnecessary(!isUnnecessary)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${isUnnecessary ? 'var(--amber-main)' : 'var(--border-subtle)'}`,
              background: isUnnecessary ? 'var(--amber-subtle)' : 'var(--bg-surface-subtle)',
              marginBottom: 20,
              cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--amber-text)', fontSize: 20 }}>
                warning
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Mark as Impulse / Unnecessary</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Flags avoidable spending for savings insights</div>
              </div>
            </div>
            <span className="material-symbols-outlined" style={{ color: isUnnecessary ? 'var(--amber-text)' : 'var(--text-muted)' }}>
              {isUnnecessary ? 'check_box' : 'check_box_outline_blank'}
            </span>
          </div>
        )}

        <button
          type="button"
          className="action-btn primary"
          style={{ width: '100%', padding: '14px', fontSize: 15 }}
          onClick={handleSave}
        >
          {prefill?.id ? 'Update Transaction' : 'Save Transaction'}
        </button>
      </div>
    </div>
  );
}

// ── Transaction Details Modal ───────────────────────────────────────
function TxDetailModal({ tx, onClose, onDelete, onEdit }: {
  tx: Transaction;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: (tx: Transaction) => void;
}) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-header">
          <h2 className="modal-title">Transaction Receipt</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        <div style={{ textAlign: 'center', padding: '16px 0 24px' }}>
          <div style={{
            fontSize: 32,
            fontWeight: 800,
            color: tx.type === 'income' ? 'var(--emerald-main)' : 'var(--text-primary)',
            lineHeight: 1.15
          }}>
            {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginTop: 6 }}>
            {tx.merchant}
          </div>
          {tx.isUnnecessary && (
            <span className="impulse-tag" style={{ display: 'inline-block', marginTop: 6 }}>
              Impulse Outflow
            </span>
          )}
        </div>

        <div style={{
          background: 'var(--bg-surface-subtle)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          padding: '14px 16px',
          marginBottom: 20
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Category</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{tx.categoryName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Date & Time</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{new Date(tx.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Payment Method</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{tx.paymentMethod || 'UPI / Cash'}</span>
          </div>
          {tx.receiptPhoto && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Receipt Photo</div>
              <img src={tx.receiptPhoto} alt="Receipt proof" style={{ width: '100%', borderRadius: 'var(--radius-md)', maxHeight: 240, objectFit: 'contain' }} />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="action-btn" style={{ flex: 1 }} onClick={() => onEdit(tx)}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
            <span>Edit</span>
          </button>
          <button
            className="action-btn"
            style={{ flex: 1, color: 'var(--coral-main)', borderColor: 'var(--coral-subtle)' }}
            onClick={() => { onDelete(tx.id); onClose(); }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Home Screen ─────────────────────────────────────────────────────
function HomeScreen({ onAdd, onNav, transactions, settings, quickExpenses, bills, onQuickAdd, onTxTap }: {
  onAdd: (prefill?: Partial<Transaction>) => void;
  onNav: (t: 'home'|'tx'|'insights'|'settings') => void;
  transactions: Transaction[];
  settings: AppSettings;
  quickExpenses: QuickExpense[];
  bills: Bill[];
  onQuickAdd: (q: QuickExpense) => void;
  onTxTap: (tx: Transaction) => void;
}) {
  const now = new Date();
  const currentMonthName = now.toLocaleString('en-US', { month: 'short' });
  const monthTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netSavings = income - expense;

  const budget = settings.monthlyBudget || 0;
  const budgetPct = budget > 0 ? Math.min(100, Math.round((expense / budget) * 100)) : 0;

  return (
    <div className="screen">
      {/* Top Header */}
      <header className="top-header">
        <div className="header-user-section" onClick={() => onNav('settings')}>
          <div className="avatar-badge">
            {settings.profilePic ? (
              <img src={settings.profilePic} alt="User Avatar" />
            ) : (
              (settings.userName || 'K').slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="header-meta">
            <h1 className="header-greeting">{settings.userName || 'Hello'}</h1>
            <span className="header-subtitle">{currentMonthName} Overview</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={() => onNav('settings')} aria-label="Settings" title="Settings">
            <span className="material-symbols-outlined">tune</span>
          </button>
        </div>
      </header>

      {/* Tactile Balance Card */}
      <section className="balance-card">
        <div className="balance-card-header">
          <span className="balance-card-label">Net Balance</span>
          <span className="balance-card-badge">Live Ledger</span>
        </div>
        <div className="balance-main-amount num-tabular">
          {formatCurrency(netSavings)}
        </div>

        <div className="cashflow-grid">
          <div className="cashflow-item">
            <div className="cashflow-header">
              <div className="dot" style={{ background: 'var(--emerald-main)' }} />
              <span>Inflow</span>
            </div>
            <div className="cashflow-amount num-tabular" style={{ color: 'var(--emerald-main)' }}>
              +{formatCurrency(income)}
            </div>
          </div>
          <div className="cashflow-item">
            <div className="cashflow-header">
              <div className="dot" style={{ background: 'var(--coral-main)' }} />
              <span>Outflow</span>
            </div>
            <div className="cashflow-amount num-tabular" style={{ color: 'var(--coral-main)' }}>
              -{formatCurrency(expense)}
            </div>
          </div>
        </div>

        {budget > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--hero-card-muted)', marginBottom: 6 }}>
              <span>Monthly Budget: {formatCurrency(budget)}</span>
              <span>{budgetPct}% Used</span>
            </div>
            <div style={{ height: 4, background: 'rgba(255, 255, 255, 0.15)', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${budgetPct}%`,
                  background: budgetPct > 90 ? 'var(--coral-main)' : 'var(--emerald-main)',
                  transition: 'width 0.4s ease'
                }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Action Buttons */}
      <div className="action-grid">
        <button className="action-btn primary" onClick={() => onAdd({ type: 'expense' })}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>remove_circle</span>
          <span>Expense</span>
        </button>
        <button className="action-btn" onClick={() => onAdd({ type: 'income' })}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_circle</span>
          <span>Income</span>
        </button>
        <button className="action-btn" onClick={() => onNav('insights')}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>insights</span>
          <span>Analytics</span>
        </button>
      </div>

      {/* Quick Log Shortcuts */}
      {quickExpenses.length > 0 && (
        <>
          <div className="section-header">
            <h2 className="section-title">Quick Log</h2>
            <button className="section-action" onClick={() => onNav('settings')}>Configure</button>
          </div>
          <div className="shortcuts-scroll">
            {quickExpenses.map(q => (
              <button
                key={q.id}
                className="shortcut-chip"
                onClick={() => onQuickAdd(q)}
              >
                <span>{q.name}</span>
                <span className="amt num-tabular">{formatCurrency(q.amount)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Recent Ledger Transactions */}
      <div className="section-header">
        <h2 className="section-title">Recent Transactions</h2>
        <button className="section-action" onClick={() => onNav('tx')}>View All</button>
      </div>

      {transactions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <span className="material-symbols-outlined">receipt_long</span>
          </div>
          <div className="empty-state-title">No transactions yet</div>
          <div className="empty-state-desc">Tap the + Expense button or scan a physical receipt to log your first entry.</div>
        </div>
      ) : (
        <div className="ledger-group">
          {transactions.slice(0, 5).map(tx => (
            <div key={tx.id} className="ledger-item" onClick={() => onTxTap(tx)}>
              <div className="ledger-left">
                <div className="cat-icon-frame" style={{
                  background: tx.type === 'income' ? 'var(--emerald-subtle)' : 'var(--bg-surface-subtle)',
                  color: tx.type === 'income' ? 'var(--emerald-main)' : 'var(--text-secondary)'
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    {tx.categoryIcon || (tx.type === 'income' ? 'arrow_downward' : 'shopping_bag')}
                  </span>
                </div>
                <div className="ledger-info">
                  <div className="ledger-merchant">{tx.merchant}</div>
                  <div className="ledger-details">
                    <span>{tx.categoryName}</span>
                    <span>•</span>
                    <span>{parseDate(tx.date)}</span>
                    {tx.isUnnecessary && <span className="impulse-tag">Impulse</span>}
                  </div>
                </div>
              </div>
              <div className="ledger-right">
                <div className={`ledger-amount num-tabular ${tx.type === 'income' ? 'income' : 'expense'}`}>
                  {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming Bills */}
      <div className="section-header">
        <h2 className="section-title">Upcoming Bills & Reminders</h2>
        <button className="section-action" onClick={() => onNav('settings')}>Manage</button>
      </div>

      {bills.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px 20px' }}>
          <div className="empty-state-icon" style={{ width: 40, height: 40, fontSize: 20 }}>
            <span className="material-symbols-outlined">event_repeat</span>
          </div>
          <div className="empty-state-title" style={{ fontSize: 14 }}>No recurring bills scheduled</div>
          <div className="empty-state-desc" style={{ fontSize: 12 }}>Keep track of rent, subscriptions, and utility payments.</div>
        </div>
      ) : (
        <div className="ledger-group">
          {bills.map(b => (
            <div
              key={b.id}
              className="ledger-item"
              onClick={() => onAdd({ merchant: b.name, amount: b.amount, type: 'expense' })}
            >
              <div className="ledger-left">
                <div className="cat-icon-frame" style={{ background: 'var(--indigo-subtle)', color: 'var(--indigo-main)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>schedule</span>
                </div>
                <div className="ledger-info">
                  <div className="ledger-merchant">{b.name}</div>
                  <div className="ledger-details">Due {new Date(b.dueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</div>
                </div>
              </div>
              <div className="ledger-right">
                <div className="ledger-amount num-tabular">{formatCurrency(b.amount)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Activity & Calendar Screen ──────────────────────────────────────
type ActivityPeriod = 'today' | 'week' | 'month' | 'all';

function ActivityScreen({ transactions, onTxTap }: {
  transactions: Transaction[];
  onTxTap: (tx: Transaction) => void;
}) {
  const [period, setPeriod] = useState<ActivityPeriod>('month');
  const [search, setSearch] = useState('');

  const now = new Date();
  const filtered = transactions.filter(t => {
    const d = new Date(t.date);
    const matchesPeriod =
      period === 'all' ? true :
      period === 'today' ? d.toDateString() === now.toDateString() :
      period === 'week'  ? (now.getTime() - d.getTime()) < 7 * 86400000 :
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    const matchesSearch = search === '' ||
      t.merchant.toLowerCase().includes(search.toLowerCase()) ||
      t.categoryName.toLowerCase().includes(search.toLowerCase());
    return matchesPeriod && matchesSearch;
  });

  const totalIncome = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = totalIncome - totalExpense;

  const grouped: Record<string, Transaction[]> = {};
  filtered.forEach(t => {
    const key = new Date(t.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  // Rolling 7-day spending data for the Weekly Chart
  const today = new Date();
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek - 1));

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = d.toDateString();
    const dayTxs = transactions.filter(t => new Date(t.date).toDateString() === key);
    const exp = dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const isToday = d.toDateString() === today.toDateString();
    const label = d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3);
    return { date: d, exp, isToday, label };
  });

  const maxWeekExp = Math.max(...weekDays.map(d => d.exp), 1);
  const totalWeekSpend = weekDays.reduce((s, d) => s + d.exp, 0);

  return (
    <div className="screen">
      <header className="top-header" style={{ marginBottom: 16 }}>
        <h1 className="header-greeting" style={{ fontSize: 20 }}>Activity & Ledger</h1>
      </header>

      {/* Period Filter */}
      <div className="segmented-control">
        {(['today', 'week', 'month', 'all'] as const).map(p => (
          <button
            key={p}
            type="button"
            className={`segment-btn ${period === p ? 'active' : ''}`}
            onClick={() => setPeriod(p)}
            style={{ textTransform: 'capitalize' }}
          >
            {p === 'all' ? 'All Time' : p}
          </button>
        ))}
      </div>

      {/* Search Input */}
      <div className="form-group">
        <input
          className="form-input"
          placeholder="Search merchant or category..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Metrics Strip */}
      <div className="metrics-strip">
        <div className="metric-card">
          <div className="metric-label">Net</div>
          <div className="metric-val num-tabular" style={{ color: net >= 0 ? 'var(--emerald-main)' : 'var(--coral-main)' }}>
            {formatCurrency(net)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Outflow</div>
          <div className="metric-val num-tabular" style={{ color: 'var(--coral-main)' }}>
            {formatCurrency(totalExpense)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Inflow</div>
          <div className="metric-val num-tabular" style={{ color: 'var(--emerald-main)' }}>
            {formatCurrency(totalIncome)}
          </div>
        </div>
      </div>

      {/* Weekly Spend Chart */}
      <section className="chart-card">
        <div className="chart-header">
          <div className="chart-title">Weekly Spend Rhythm</div>
          <div className="num-tabular" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {formatCurrency(totalWeekSpend)}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 110, paddingTop: 10 }}>
          {weekDays.map((d, i) => {
            const heightPct = d.exp > 0 ? Math.max(12, Math.round((d.exp / maxWeekExp) * 80)) : 4;
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 6 }}>
                <span className="num-tabular" style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                  {d.exp > 0 ? (d.exp >= 1000 ? `${(d.exp / 1000).toFixed(1)}k` : d.exp) : ''}
                </span>
                <div style={{
                  width: 22,
                  height: `${heightPct}px`,
                  borderRadius: 6,
                  background: d.isToday ? 'var(--emerald-main)' : (d.exp > 0 ? 'var(--text-primary)' : 'var(--border-subtle)'),
                  transition: 'height 0.3s ease'
                }} />
                <span style={{ fontSize: 11, fontWeight: d.isToday ? 700 : 500, color: d.isToday ? 'var(--emerald-main)' : 'var(--text-muted)' }}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Grouped Ledger Transactions */}
      {Object.keys(grouped).length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <span className="material-symbols-outlined">search_off</span>
          </div>
          <div className="empty-state-title">No entries found</div>
          <div className="empty-state-desc">Try modifying your search or switching to another time period.</div>
        </div>
      ) : (
        Object.entries(grouped).map(([day, txs]) => (
          <div key={day} className="ledger-group">
            <div className="ledger-group-header">
              <span>{day}</span>
              <span className="num-tabular">
                {formatCurrency(txs.reduce((s, t) => t.type === 'expense' ? s - t.amount : s + t.amount, 0))}
              </span>
            </div>
            {txs.map(tx => (
              <div key={tx.id} className="ledger-item" onClick={() => onTxTap(tx)}>
                <div className="ledger-left">
                  <div className="cat-icon-frame" style={{
                    background: tx.type === 'income' ? 'var(--emerald-subtle)' : 'var(--bg-surface-subtle)',
                    color: tx.type === 'income' ? 'var(--emerald-main)' : 'var(--text-secondary)'
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      {tx.categoryIcon || 'payments'}
                    </span>
                  </div>
                  <div className="ledger-info">
                    <div className="ledger-merchant">{tx.merchant}</div>
                    <div className="ledger-details">
                      <span>{tx.categoryName}</span>
                      {tx.isUnnecessary && <span className="impulse-tag">Impulse</span>}
                    </div>
                  </div>
                </div>
                <div className="ledger-right">
                  <div className={`ledger-amount num-tabular ${tx.type === 'income' ? 'income' : 'expense'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </div>
                  <span className="ledger-time">
                    {new Date(tx.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

// ── Insights & Financial Analytics Screen ───────────────────────────
function InsightsScreen({ transactions, settings }: {
  transactions: Transaction[];
  settings: AppSettings;
}) {
  const now = new Date();
  const monthTx = transactions.filter(t => new Date(t.date).getMonth() === now.getMonth());
  const expenses = monthTx.filter(t => t.type === 'expense');
  const totalExp = expenses.reduce((s, t) => s + t.amount, 0);

  const catMap: Record<string, number> = {};
  expenses.forEach(t => {
    catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount;
  });

  const catBreakdown = Object.entries(catMap)
    .map(([id, amt]) => ({ cat: getAllCategories().find(c => c.id === id) || { id, name: id, icon: 'category', color: '#64748B', type: 'expense' as const }, amt }))
    .sort((a, b) => b.amt - a.amt);

  const impulseSpend = expenses.filter(t => t.isUnnecessary).reduce((s, t) => s + t.amount, 0);
  const budget = settings.monthlyBudget || 0;
  const remaining = budget > 0 ? budget - totalExp : 0;

  return (
    <div className="screen">
      <header className="top-header" style={{ marginBottom: 16 }}>
        <h1 className="header-greeting" style={{ fontSize: 20 }}>Financial Insights</h1>
      </header>

      {/* Monthly Budget Performance */}
      <section className="chart-card">
        <div className="chart-header">
          <div className="chart-title">Monthly Budget Health</div>
          <span className="num-tabular" style={{ fontSize: 13, fontWeight: 700, color: totalExp > budget && budget > 0 ? 'var(--coral-main)' : 'var(--emerald-main)' }}>
            {budget > 0 ? `${Math.round((totalExp / budget) * 100)}%` : 'No Budget'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Spent so far</div>
            <div className="num-tabular" style={{ fontSize: 24, fontWeight: 800 }}>{formatCurrency(totalExp)}</div>
          </div>
          {budget > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Remaining capacity</div>
              <div className="num-tabular" style={{ fontSize: 18, fontWeight: 700, color: remaining >= 0 ? 'var(--emerald-main)' : 'var(--coral-main)' }}>
                {formatCurrency(remaining)}
              </div>
            </div>
          )}
        </div>

        {budget > 0 && (
          <div style={{ height: 6, background: 'var(--bg-surface-subtle)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (totalExp / budget) * 100)}%`,
              background: totalExp > budget ? 'var(--coral-main)' : 'var(--emerald-main)'
            }} />
          </div>
        )}
      </section>

      {/* Category Breakdown */}
      <div className="section-header">
        <h2 className="section-title">Category Breakdown</h2>
      </div>

      {catBreakdown.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No expense data</div>
          <div className="empty-state-desc">Categorized spending charts will appear here once you log expenses.</div>
        </div>
      ) : (
        <div className="ledger-group">
          {catBreakdown.map(({ cat, amt }) => {
            const pct = totalExp > 0 ? Math.round((amt / totalExp) * 100) : 0;
            return (
              <div key={cat.id} className="ledger-item">
                <div className="ledger-left">
                  <div className="cat-icon-frame" style={{ background: 'var(--bg-surface-subtle)', color: cat.color || 'var(--text-primary)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{cat.icon || 'folder'}</span>
                  </div>
                  <div className="ledger-info">
                    <div className="ledger-merchant">{cat.name}</div>
                    <div className="ledger-details">{pct}% of total monthly outflow</div>
                  </div>
                </div>
                <div className="ledger-right">
                  <div className="ledger-amount num-tabular">{formatCurrency(amt)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Gold Opportunity Card (Savings Compounding at 15% CAGR) */}
      <section className="chart-card" style={{ background: 'var(--hero-card-bg)', color: 'var(--hero-card-text)', borderColor: 'var(--hero-card-border)' }}>
        <div className="chart-header">
          <div className="chart-title" style={{ color: '#FFFFFF' }}>Compounded Savings Potential</div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.1)' }}>15% CAGR</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--hero-card-muted)', marginBottom: 14, lineHeight: 1.4 }}>
          Redirecting impulse purchases ({formatCurrency(impulseSpend || 2500)}/mo) into disciplined assets accumulates significant capital over time:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { yrs: '1 Year', n: 12 },
            { yrs: '3 Years', n: 36 },
            { yrs: '5 Years', n: 60 }
          ].map(({ yrs, n }) => {
            const monthlyBase = impulseSpend > 0 ? impulseSpend : 2500;
            const r = 0.15 / 12;
            const fv = Math.round(monthlyBase * ((Math.pow(1 + r, n) - 1) / r) * (1 + r));
            return (
              <div key={yrs} style={{
                background: 'rgba(255, 255, 255, 0.06)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 8px',
                textAlign: 'center',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--hero-card-muted)', textTransform: 'uppercase' }}>{yrs}</div>
                <div className="num-tabular" style={{ fontSize: 14, fontWeight: 800, marginTop: 4, color: '#FFFFFF' }}>{formatCurrency(fv)}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ── Settings Screen ─────────────────────────────────────────────────
function SettingsScreen({ settings, onUpdate, onClearData, onManageQuick, onManageBills }: {
  settings: AppSettings;
  onUpdate: (s: Partial<AppSettings>) => void;
  onClearData: () => void;
  onManageQuick: () => void;
  onManageBills: () => void;
}) {
  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState(settings.userName);
  const [editBudget, setEditBudget] = useState(false);
  const [budgetVal, setBudgetVal] = useState(String(settings.monthlyBudget || ''));
  const [editCurrency, setEditCurrency] = useState(false);
  const [currencyVal, setCurrencyVal] = useState(settings.currency || '₹');

  const exportData = (fmt: 'json' | 'csv') => {
    const txs = getTransactions();
    let content = '';
    let mime = 'application/json';
    let ext = 'json';

    if (fmt === 'csv') {
      const rows = [
        ['Date', 'Type', 'Amount', 'Category', 'Merchant', 'Unnecessary'].join(','),
        ...txs.map(t => [
          new Date(t.date).toLocaleDateString('en-IN'),
          t.type,
          t.amount,
          `"${t.categoryName}"`,
          `"${t.merchant}"`,
          t.isUnnecessary ? 'Yes' : 'No'
        ].join(','))
      ];
      content = rows.join('\n');
      mime = 'text/csv';
      ext = 'csv';
    } else {
      content = JSON.stringify({ transactions: txs, settings: getSettings() }, null, 2);
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kaas-backup-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev: any) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.transactions) localStorage.setItem('kaas_v2_transactions', JSON.stringify(data.transactions));
          if (data.settings) localStorage.setItem('kaas_v2_settings', JSON.stringify(data.settings));
          alert('Backup restored successfully!');
          window.location.reload();
        } catch {
          alert('Invalid backup JSON format.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleProfilePic = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev: any) => {
        onUpdate({ profilePic: ev.target.result });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <div className="screen">
      <header className="top-header" style={{ marginBottom: 16 }}>
        <h1 className="header-greeting" style={{ fontSize: 20 }}>Settings & Preferences</h1>
      </header>

      {/* Theme & Display */}
      <div className="section-header">
        <h2 className="section-title">Theme & Appearance</h2>
      </div>
      <div className="segmented-control" style={{ marginBottom: 20 }}>
        {(['light', 'dark', 'system'] as const).map(t => (
          <button
            key={t}
            type="button"
            className={`segment-btn ${settings.theme === t ? 'active' : ''}`}
            onClick={() => onUpdate({ theme: t })}
            style={{ textTransform: 'capitalize' }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Account Profile */}
      <div className="section-header">
        <h2 className="section-title">Profile & Budget</h2>
      </div>
      <div className="ledger-group" style={{ marginBottom: 20 }}>
        <div className="ledger-item" onClick={handleProfilePic}>
          <div className="ledger-left">
            <div className="avatar-badge" style={{ width: 36, height: 36 }}>
              {settings.profilePic ? <img src={settings.profilePic} alt="User" /> : (settings.userName || 'U').slice(0, 1)}
            </div>
            <div className="ledger-info">
              <div className="ledger-merchant">Profile Photo</div>
              <div className="ledger-details">Tap to upload custom avatar</div>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)' }}>chevron_right</span>
        </div>

        <div className="ledger-item" onClick={() => setEditName(!editName)}>
          <div className="ledger-left">
            <div className="cat-icon-frame" style={{ background: 'var(--bg-surface-subtle)' }}>
              <span className="material-symbols-outlined">person</span>
            </div>
            <div className="ledger-info">
              <div className="ledger-merchant">Display Name</div>
              <div className="ledger-details">{settings.userName || 'Not set'}</div>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)' }}>edit</span>
        </div>
        {editName && (
          <div style={{ padding: '12px 14px', background: 'var(--bg-surface-subtle)', borderTop: '1px solid var(--border-subtle)' }}>
            <input className="form-input" value={nameVal} onChange={e => setNameVal(e.target.value)} autoFocus />
            <button className="action-btn primary" style={{ marginTop: 8 }} onClick={() => { onUpdate({ userName: nameVal }); setEditName(false); }}>Save</button>
          </div>
        )}

        <div className="ledger-item" onClick={() => setEditBudget(!editBudget)}>
          <div className="ledger-left">
            <div className="cat-icon-frame" style={{ background: 'var(--bg-surface-subtle)' }}>
              <span className="material-symbols-outlined">account_balance_wallet</span>
            </div>
            <div className="ledger-info">
              <div className="ledger-merchant">Monthly Target Budget</div>
              <div className="ledger-details">{formatCurrency(settings.monthlyBudget || 0)}</div>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)' }}>edit</span>
        </div>
        {editBudget && (
          <div style={{ padding: '12px 14px', background: 'var(--bg-surface-subtle)', borderTop: '1px solid var(--border-subtle)' }}>
            <input className="form-input" type="number" value={budgetVal} onChange={e => setBudgetVal(e.target.value)} autoFocus />
            <button className="action-btn primary" style={{ marginTop: 8 }} onClick={() => { onUpdate({ monthlyBudget: Number(budgetVal) }); setEditBudget(false); }}>Save</button>
          </div>
        )}

        <div className="ledger-item" onClick={() => setEditCurrency(!editCurrency)}>
          <div className="ledger-left">
            <div className="cat-icon-frame" style={{ background: 'var(--bg-surface-subtle)' }}>
              <span className="material-symbols-outlined">currency_exchange</span>
            </div>
            <div className="ledger-info">
              <div className="ledger-merchant">Currency Symbol</div>
              <div className="ledger-details">{settings.currency || '₹'}</div>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)' }}>edit</span>
        </div>
        {editCurrency && (
          <div style={{ padding: '12px 14px', background: 'var(--bg-surface-subtle)', borderTop: '1px solid var(--border-subtle)' }}>
            <input className="form-input" value={currencyVal} onChange={e => setCurrencyVal(e.target.value)} autoFocus />
            <button className="action-btn primary" style={{ marginTop: 8 }} onClick={() => { onUpdate({ currency: currencyVal }); setEditCurrency(false); }}>Save</button>
          </div>
        )}
      </div>

      {/* Shortcuts & Reminders */}
      <div className="section-header">
        <h2 className="section-title">Automations & Reminders</h2>
      </div>
      <div className="ledger-group" style={{ marginBottom: 20 }}>
        <div className="ledger-item" onClick={onManageQuick}>
          <div className="ledger-left">
            <div className="cat-icon-frame" style={{ background: 'var(--bg-surface-subtle)' }}>
              <span className="material-symbols-outlined">bolt</span>
            </div>
            <div className="ledger-info">
              <div className="ledger-merchant">Quick Log Shortcuts</div>
              <div className="ledger-details">Customize frequent one-tap entries</div>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)' }}>chevron_right</span>
        </div>

        <div className="ledger-item" onClick={onManageBills}>
          <div className="ledger-left">
            <div className="cat-icon-frame" style={{ background: 'var(--bg-surface-subtle)' }}>
              <span className="material-symbols-outlined">event_repeat</span>
            </div>
            <div className="ledger-info">
              <div className="ledger-merchant">Recurring Bills & Subscriptions</div>
              <div className="ledger-details">Manage due dates and reminders</div>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)' }}>chevron_right</span>
        </div>
      </div>

      {/* Data Backup & Export */}
      <div className="section-header">
        <h2 className="section-title">Data Safety & Backup</h2>
      </div>
      <div className="ledger-group" style={{ marginBottom: 20 }}>
        <div className="ledger-item" onClick={() => onUpdate({ autoBackup: !settings.autoBackup })}>
          <div className="ledger-left">
            <div className="cat-icon-frame" style={{ background: 'var(--bg-surface-subtle)' }}>
              <span className="material-symbols-outlined">cloud_sync</span>
            </div>
            <div className="ledger-info">
              <div className="ledger-merchant">Automatic Local Backup</div>
              <div className="ledger-details">{settings.autoBackup ? 'Enabled' : 'Disabled'}</div>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ color: settings.autoBackup ? 'var(--emerald-main)' : 'var(--text-muted)' }}>
            {settings.autoBackup ? 'toggle_on' : 'toggle_off'}
          </span>
        </div>

        <div className="ledger-item" onClick={() => exportData('json')}>
          <div className="ledger-left">
            <div className="cat-icon-frame" style={{ background: 'var(--bg-surface-subtle)' }}>
              <span className="material-symbols-outlined">file_download</span>
            </div>
            <div className="ledger-info">
              <div className="ledger-merchant">Export Backup (JSON)</div>
              <div className="ledger-details">Full transaction and settings snapshot</div>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)' }}>download</span>
        </div>

        <div className="ledger-item" onClick={() => exportData('csv')}>
          <div className="ledger-left">
            <div className="cat-icon-frame" style={{ background: 'var(--bg-surface-subtle)' }}>
              <span className="material-symbols-outlined">table_view</span>
            </div>
            <div className="ledger-info">
              <div className="ledger-merchant">Export Spreadsheet (CSV)</div>
              <div className="ledger-details">Compatible with Excel and Google Sheets</div>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)' }}>download</span>
        </div>

        <div className="ledger-item" onClick={importData}>
          <div className="ledger-left">
            <div className="cat-icon-frame" style={{ background: 'var(--bg-surface-subtle)' }}>
              <span className="material-symbols-outlined">file_upload</span>
            </div>
            <div className="ledger-info">
              <div className="ledger-merchant">Restore from Backup</div>
              <div className="ledger-details">Upload previously saved JSON file</div>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)' }}>upload</span>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="section-header">
        <h2 className="section-title" style={{ color: 'var(--coral-main)' }}>Danger Zone</h2>
      </div>
      <button
        type="button"
        className="action-btn"
        style={{ width: '100%', borderColor: 'var(--coral-subtle)', color: 'var(--coral-main)', padding: '14px' }}
        onClick={onClearData}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete_forever</span>
        <span>Clear All Stored Financial Records</span>
      </button>
    </div>
  );
}

// ── Manage Quick Shortcuts Modal ────────────────────────────────────
function ManageQuickAddsModal({ onClose, quickAdds, onSave }: {
  onClose: () => void;
  quickAdds: QuickExpense[];
  onSave: (q: QuickExpense[]) => void;
}) {
  const [adds, setAdds] = useState<QuickExpense[]>(quickAdds);
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !amt) return;
    const item: QuickExpense = {
      id: uuid(),
      name: name.trim(),
      amount: Number(amt),
      categoryId: 'other',
      emoji: 'bolt'
    };
    setAdds([...adds, item]);
    setName('');
    setAmt('');
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-header">
          <h2 className="modal-title">Quick Log Shortcuts</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="form-input"
            style={{ flex: 2 }}
            placeholder="Item (e.g. Coffee)"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            className="form-input"
            style={{ flex: 1 }}
            type="number"
            placeholder="Amount"
            value={amt}
            onChange={e => setAmt(e.target.value)}
          />
          <button className="action-btn primary" type="button" onClick={handleAdd}>Add</button>
        </div>

        <div className="ledger-group" style={{ maxHeight: 260, overflowY: 'auto' }}>
          {adds.map(a => (
            <div key={a.id} className="ledger-item">
              <div className="ledger-left">
                <span className="material-symbols-outlined" style={{ color: 'var(--emerald-main)' }}>bolt</span>
                <div className="ledger-info">
                  <div className="ledger-merchant">{a.name}</div>
                  <div className="ledger-details num-tabular">{formatCurrency(a.amount)}</div>
                </div>
              </div>
              <button
                type="button"
                className="icon-button"
                style={{ width: 32, height: 32, color: 'var(--coral-main)' }}
                onClick={() => setAdds(adds.filter(x => x.id !== a.id))}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
              </button>
            </div>
          ))}
          {adds.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
              No custom shortcuts configured yet.
            </div>
          )}
        </div>

        <button
          type="button"
          className="action-btn primary"
          style={{ width: '100%', marginTop: 16, padding: '12px' }}
          onClick={() => { onSave(adds); onClose(); }}
        >
          Save Shortcuts
        </button>
      </div>
    </div>
  );
}

// ── Manage Recurring Bills Modal ────────────────────────────────────
function ManageBillsModal({ onClose, bills, onSave }: {
  onClose: () => void;
  bills: Bill[];
  onSave: (b: Bill[]) => void;
}) {
  const [list, setList] = useState<Bill[]>(bills);
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('');
  const [dueDate, setDueDate] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !amt || !dueDate) return;
    const item: Bill = {
      id: uuid(),
      name: name.trim(),
      amount: Number(amt),
      categoryId: 'bills',
      icon: 'schedule',
      dueDate: new Date(dueDate).toISOString()
    };
    setList([...list, item]);
    setName('');
    setAmt('');
    setDueDate('');
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-header">
          <h2 className="modal-title">Recurring Bills & Subscriptions</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <input
            className="form-input"
            placeholder="Bill Name (e.g. Wifi, Rent, Gym)"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              type="number"
              placeholder="Amount"
              value={amt}
              onChange={e => setAmt(e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              className="form-input"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          <button className="action-btn primary" type="button" onClick={handleAdd}>
            Add Scheduled Bill
          </button>
        </div>

        <div className="ledger-group" style={{ maxHeight: 260, overflowY: 'auto' }}>
          {list.map(b => (
            <div key={b.id} className="ledger-item">
              <div className="ledger-left">
                <span className="material-symbols-outlined" style={{ color: 'var(--indigo-main)' }}>event_repeat</span>
                <div className="ledger-info">
                  <div className="ledger-merchant">{b.name}</div>
                  <div className="ledger-details">Due {new Date(b.dueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="num-tabular" style={{ fontWeight: 700 }}>{formatCurrency(b.amount)}</span>
                <button
                  type="button"
                  className="icon-button"
                  style={{ width: 32, height: 32, color: 'var(--coral-main)' }}
                  onClick={() => setList(list.filter(x => x.id !== b.id))}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                </button>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
              No recurring bills added.
            </div>
          )}
        </div>

        <button
          type="button"
          className="action-btn primary"
          style={{ width: '100%', marginTop: 16, padding: '12px' }}
          onClick={() => { onSave(list); onClose(); }}
        >
          Save Bills
        </button>
      </div>
    </div>
  );
}

// ── OCR Scanned Bill Inspection Modal ───────────────────────────────
function OCRVerifyModal({ ocrData, onClose, onConfirm }: {
  ocrData: OCRData;
  onClose: () => void;
  onConfirm: (finalAmount: number, merchant: string, photo: string) => void;
}) {
  const [selectedAmount, setSelectedAmount] = useState(ocrData.total);
  const [merchantName, setMerchantName] = useState(ocrData.merchant);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-header">
          <h2 className="modal-title">Receipt OCR Verification</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        <div style={{
          background: 'var(--bg-surface-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
          textAlign: 'center',
          marginBottom: 18,
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
            Auto-Detected Total
          </div>
          <div className="num-tabular" style={{ fontSize: 36, fontWeight: 800, color: 'var(--emerald-main)' }}>
            {formatCurrency(selectedAmount)}
          </div>
          <input
            className="form-input"
            style={{ marginTop: 14, textAlign: 'center', fontWeight: 600 }}
            value={merchantName}
            onChange={e => setMerchantName(e.target.value)}
            placeholder="Store / Vendor Name"
          />
        </div>

        {ocrData.allNumbers.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
              Candidate detected totals:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ocrData.allNumbers.slice(0, 6).map((num, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedAmount(num)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-pill)',
                    border: `1px solid ${selectedAmount === num ? 'var(--emerald-main)' : 'var(--border-subtle)'}`,
                    background: selectedAmount === num ? 'var(--emerald-subtle)' : 'var(--bg-surface-subtle)',
                    color: selectedAmount === num ? 'var(--emerald-text)' : 'var(--text-primary)',
                    fontSize: 12,
                    fontWeight: 700
                  }}
                >
                  {formatCurrency(num)}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className="action-btn primary"
          style={{ width: '100%', padding: '14px', fontSize: 15 }}
          onClick={() => onConfirm(selectedAmount, merchantName, ocrData.photo)}
        >
          Confirm & Log Expense
        </button>
      </div>
    </div>
  );
}

// ── Main Kaas Application ───────────────────────────────────────────
export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [tab, setTab] = useState<'home' | 'tx' | 'insights' | 'settings'>('home');
  const [transactions, setTx] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    currency: '₹',
    userName: 'User',
    monthlyBudget: 50000,
    hasCompletedOnboarding: false,
    theme: 'light'
  });
  const [quickExpenses, setQuick] = useState<QuickExpense[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addPrefill, setAddPrefill] = useState<Partial<Transaction> | undefined>(undefined);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [viewTx, setViewTx] = useState<Transaction | null>(null);
  const [toast, setToast] = useState<{ msg: string; type?: 'error' } | null>(null);
  const [showManageQuick, setShowManageQuick] = useState(false);
  const [showManageBills, setShowManageBills] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [ocrData, setOcrData] = useState<OCRData | null>(null);

  const showToast = (msg: string, type?: 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2400);
  };

  const reload = useCallback(() => {
    setTx(getTransactions());
    setSettings(getSettings());
    setQuick(getQuickExpenses());
    setBills(getBills());
  }, []);

  useEffect(() => {
    initDB();
    reload();
  }, [reload]);

  useEffect(() => {
    const stored = getSettings();
    const theme = stored.theme || 'light';
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [settings.theme]);

  const frequentTxs = useMemo(() => {
    const counts: Record<string, { tx: Transaction; count: number }> = {};
    transactions.forEach(t => {
      if (t.type !== 'expense') return;
      const key = `${t.merchant.toLowerCase().trim()}_${t.amount}`;
      if (!counts[key]) counts[key] = { tx: t, count: 0 };
      counts[key].count++;
    });
    return Object.values(counts)
      .filter(x => x.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map(x => ({
        id: x.tx.id,
        name: x.tx.merchant,
        amount: x.tx.amount,
        emoji: x.tx.categoryIcon,
        categoryId: x.tx.categoryId
      }));
  }, [transactions]);

  const handleSave = (tx: Transaction) => {
    if (editTx) {
      updateTransaction(tx);
      showToast('Transaction updated');
    } else {
      saveTransaction(tx);
      showToast(`Logged ${tx.categoryName}`);
    }
    setShowAdd(false);
    setEditTx(null);
    reload();
  };

  const handleOCRCamera = async () => {
    try {
      const image = await Camera.getPhoto({ quality: 70, allowEditing: false, resultType: CameraResultType.DataUrl });
      if (!image.dataUrl) return;

      setIsScanning(true);
      const processedImage = await preprocessImageForOCR(image.dataUrl);
      const worker = await Tesseract.createWorker('eng');
      const ret = await worker.recognize(processedImage);
      await worker.terminate();
      setIsScanning(false);

      const parsed = parseReceiptText(ret.data.text);
      setOcrData({
        photo: image.dataUrl,
        merchant: parsed.merchantName,
        total: parsed.total,
        allNumbers: parsed.allDetectedNumbers,
        sum: parsed.sumOfNumbers
      });
    } catch (e) {
      console.log('Camera error', e);
      setIsScanning(false);
      showToast('Camera cancelled or unsupported', 'error');
    }
  };

  const handleOCRConfirm = (finalAmount: number, merchantName: string, photo: string) => {
    setOcrData(null);
    setAddPrefill({
      amount: finalAmount || undefined,
      merchant: merchantName,
      receiptPhoto: photo,
      type: 'expense'
    });
    setShowAdd(true);
  };

  const handleQuickAdd = (q: QuickExpense) => {
    const cat = getAllCategories().find(c => c.id === q.categoryId) || { id: 'other', name: 'Other', icon: 'category', type: 'expense', color: '#64748B' };
    saveTransaction({
      id: uuid(),
      type: 'expense',
      amount: q.amount,
      categoryId: cat.id,
      categoryName: cat.name,
      categoryIcon: cat.icon,
      merchant: q.name,
      description: q.name,
      date: new Date().toISOString(),
      paymentMethod: 'UPI / Cash',
      notes: '',
      createdAt: new Date().toISOString(),
    });
    showToast(`Logged ${q.name} · ${formatCurrency(q.amount)}`);
    reload();
  };

  return (
    <div className="app">
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {!showSplash && (
        <>
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {tab === 'home' && (
              <HomeScreen
                onAdd={prefill => { setAddPrefill(prefill); setShowAdd(true); }}
                onNav={setTab}
                transactions={transactions}
                settings={settings}
                quickExpenses={quickExpenses.length > 0 ? quickExpenses : frequentTxs}
                bills={bills}
                onQuickAdd={handleQuickAdd}
                onTxTap={setViewTx}
              />
            )}
            {tab === 'tx' && <ActivityScreen transactions={transactions} onTxTap={setViewTx} />}
            {tab === 'insights' && <InsightsScreen transactions={transactions} settings={settings} />}
            {tab === 'settings' && (
              <SettingsScreen
                settings={settings}
                onUpdate={s => { saveSettings(s); reload(); showToast('Settings saved'); }}
                onClearData={() => {
                  if (confirm('Are you sure you want to erase all financial data?')) {
                    clearAllData();
                    initDB();
                    reload();
                    showToast('All data erased', 'error');
                  }
                }}
                onManageQuick={() => setShowManageQuick(true)}
                onManageBills={() => setShowManageBills(true)}
              />
            )}
          </main>

          {/* Bottom Navigation Dock */}
          <nav className="bottom-dock" aria-label="Main Navigation">
            <button
              type="button"
              className={`dock-item ${tab === 'home' ? 'active' : ''}`}
              onClick={() => setTab('home')}
              aria-label="Home"
            >
              <span className="material-symbols-outlined">home</span>
              <span className="dock-label">Home</span>
            </button>

            <button
              type="button"
              className={`dock-item ${tab === 'insights' ? 'active' : ''}`}
              onClick={() => setTab('insights')}
              aria-label="Analytics"
            >
              <span className="material-symbols-outlined">insights</span>
              <span className="dock-label">Analytics</span>
            </button>

            <button
              type="button"
              className="dock-scan-btn"
              onClick={handleOCRCamera}
              aria-label="Scan bill with camera"
              title="Scan Receipt"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 26 }}>photo_camera</span>
            </button>

            <button
              type="button"
              className={`dock-item ${tab === 'tx' ? 'active' : ''}`}
              onClick={() => setTab('tx')}
              aria-label="Activity"
            >
              <span className="material-symbols-outlined">calendar_today</span>
              <span className="dock-label">Activity</span>
            </button>

            <button
              type="button"
              className={`dock-item ${tab === 'settings' ? 'active' : ''}`}
              onClick={() => setTab('settings')}
              aria-label="Settings"
            >
              <span className="material-symbols-outlined">tune</span>
              <span className="dock-label">Settings</span>
            </button>
          </nav>

          {/* Dialogs and Modals */}
          {ocrData && <OCRVerifyModal ocrData={ocrData} onClose={() => setOcrData(null)} onConfirm={handleOCRConfirm} />}
          {showAdd && <AddModal onClose={() => { setShowAdd(false); setEditTx(null); setAddPrefill(undefined); }} onSave={handleSave} prefill={editTx || addPrefill} />}
          {viewTx && <TxDetailModal tx={viewTx} onClose={() => setViewTx(null)} onDelete={id => { deleteTransaction(id); showToast('Deleted', 'error'); reload(); }} onEdit={tx => { setViewTx(null); setEditTx(tx); setAddPrefill(undefined); setShowAdd(true); }} />}
          {showManageQuick && <ManageQuickAddsModal onClose={() => setShowManageQuick(false)} quickAdds={quickExpenses} onSave={adds => { saveQuickExpenses(adds); reload(); showToast('Shortcuts updated'); }} />}
          {showManageBills && <ManageBillsModal onClose={() => setShowManageBills(false)} bills={bills} onSave={b => { saveBills(b); reload(); showToast('Bills updated'); }} />}
          {toast && <Toast msg={toast.msg} type={toast.type} />}

          {/* OCR Processing Overlay */}
          {isScanning && (
            <div className="modal-overlay" style={{ zIndex: 120 }}>
              <div style={{
                background: 'var(--bg-surface)',
                padding: '32px 28px',
                borderRadius: 'var(--radius-xl)',
                textAlign: 'center',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--border-subtle)',
                maxWidth: 320,
                width: '90%'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--emerald-main)' }}>
                  document_scanner
                </span>
                <div style={{ marginTop: 14, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Processing Receipt...
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Extracting total amount and merchant details
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

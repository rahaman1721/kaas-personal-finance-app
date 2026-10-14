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
const getDaysUntil = (dateStr: string) => Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
const parseDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

interface OCRResult {
  total: number;
  merchantName: string;
  allDetectedNumbers: number[];
  sumOfNumbers: number;
  rawText: string;
}

// ── Image Preprocessing for Tesseract (Improves Accuracy) ──
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
      
      // Convert to high-contrast grayscale to make text pop for Tesseract
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        let lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // Simple threshold binarization
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

  // Find candidate merchant name (first line with text letters)
  for (const line of lines) {
    if (/[a-zA-Z]{3,}/.test(line) && !/total|subtotal|tax|date|cash|receipt|invoice|thank/i.test(line)) {
      merchantName = line.replace(/[^a-zA-Z0-9\s]/g, '').slice(0, 25).trim();
      break;
    }
  }

  // 1. Look for explicit total keywords first (highest accuracy)
  const totalRegex = /(?:total|grand\s*total|net\s*amount|amount\ Bal|payable|due|bal|rs\.?|inr|₹|\$)\s*[:=]?\s*([0-9]+(?:[\.,][0-9]{1,2})?)/gi;
  let match;
  while ((match = totalRegex.exec(rawText)) !== null) {
    const val = parseFloat(match[1].replace(',', '.'));
    if (val > 0 && (detectedTotal === null || val > detectedTotal)) {
      detectedTotal = val;
    }
  }

  // 2. Extract all numbers (filter out years and implausible numbers)
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

  // 3. Fallback to largest number if no explicit total keyword
  if (detectedTotal === null && allNumbers.length > 0) {
    detectedTotal = Math.max(...allNumbers);
  }

  const sumOfNumbers = allNumbers.reduce((a, b) => a + b, 0);

  return {
    total: detectedTotal || 0,
    merchantName: merchantName || 'Scanned Bill',
    allDetectedNumbers: allNumbers.sort((a, b) => b - a),
    sumOfNumbers,
    rawText
  };
}

// ── Splash Screen ─────────────────────────────────────────────────
function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [fading, setFading] = useState(false);

  const handleVideoEnd = () => {
    setFading(true);
    setTimeout(onComplete, 600);
  };

  return (
    <div className={`splash-overlay ${fading ? 'fade-out' : ''}`}>
      <video
        className="splash-video"
        src="/splash.mp4"
        autoPlay
        muted
        playsInline
        onEnded={handleVideoEnd}
        onError={handleVideoEnd}
      />
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type?: 'error' }) {
  return (
    <div className={`toast ${type || ''}`}>
      <span className="material-symbols-outlined">{type === 'error' ? 'error' : 'check_circle'}</span>
      <span>{msg}</span>
    </div>
  );
}

// ── Add Transaction Modal ─────────────────────────────────────────
function AddModal({ onClose, onSave, prefill }: {
  onClose: () => void;
  onSave: (tx: Transaction) => void;
  prefill?: Partial<Transaction>;
}) {
  const [type, setType] = useState<'expense' | 'income'>(prefill?.type || 'expense');
  const [amount, setAmount] = useState(prefill?.amount ? String(prefill.amount) : '');
  const [merchant, setMerchant] = useState(prefill?.merchant || '');
  const [desc, setDesc] = useState(prefill?.description || '');
  const [catId, setCatId] = useState(prefill?.categoryId || 'food');
  const [dateStr, setDateStr] = useState(() => {
    const d = prefill?.date ? new Date(prefill.date) : new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  });
  const [timeStr, setTimeStr] = useState(() => {
    const d = prefill?.date ? new Date(prefill.date) : new Date();
    return d.toTimeString().slice(0, 5); // HH:MM
  });
  const [receiptPhoto, setReceiptPhoto] = useState<string>(prefill?.receiptPhoto || '');
  const [unnecessaryTag, setUnnecessaryTag] = useState<string>(prefill?.notes?.startsWith('unnecessary:') ? prefill.notes.slice(12) : '');
  const [showUnnecessaryPicker, setShowUnnecessaryPicker] = useState(!!unnecessaryTag);
  const [isListening, setIsListening] = useState(false);
  const [allCats, setAllCats] = useState(getAllCategories());
  
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('📌');

  const cats = type === 'expense' ? getExpenseCategories() : getIncomeCategories();
  const selCat = allCats.find(c => c.id === catId) || { id: 'other', name: 'Other', icon: '📦', type, color: '#795548' };

  const saveNewCatInline = () => {
    if (!newCatName.trim()) {
      setIsAddingCat(false);
      return;
    }
    const newCat: Category = {
      id: newCatName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
      name: newCatName.trim(), icon: newCatEmoji || '📌', type, color: type === 'expense' ? '#9B59B6' : '#087F5B'
    };
    saveCustomCategory(newCat);
    setAllCats(getAllCategories());
    setCatId(newCat.id);
    setIsAddingCat(false);
    setNewCatName('');
    setNewCatEmoji('📌');
  };

  const handleSave = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    const finalDate = new Date(`${dateStr}T${timeStr}`);
    onSave({
      id: prefill?.id || uuid(),
      type, amount: amt,
      categoryId: selCat.id, categoryName: selCat.name, categoryIcon: selCat.icon,
      merchant: merchant || selCat.name, description: desc,
      date: isNaN(finalDate.getTime()) ? new Date().toISOString() : finalDate.toISOString(),
      paymentMethod: 'Cash',
      createdAt: prefill?.createdAt || new Date().toISOString(),
      receiptPhoto,
      isUnnecessary: type === 'expense' && unnecessaryTag !== '',
      notes: unnecessaryTag ? `unnecessary:${unnecessaryTag}` : '',
    });
  };

  const takePhoto = async () => {
    try {
      const image = await Camera.getPhoto({ quality: 60, allowEditing: false, resultType: CameraResultType.DataUrl });
      if (image.dataUrl) setReceiptPhoto(image.dataUrl);
    } catch (e) {
      console.log('Camera cancelled or failed', e);
    }
  };

  const startVoice = () => {
    if (!('webkitSpeechRecognition' in window)) return alert('Voice not supported on this device.');
    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    // Set to any language / local default
    // We let the OS handle the language default.
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      
      // Basic AI logic to parse amount and category
      const nums = transcript.match(/\d+/g);
      if (nums) setAmount(nums[0]);

      for (const cat of getExpenseCategories()) {
        if (transcript.includes(cat.name.toLowerCase())) {
          setCatId(cat.id);
          setType('expense');
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
        <div className="modal-handle" />
        <div className="modal-title flex-between">
          {prefill?.id ? 'Edit Transaction' : 'Add Transaction'}
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={startVoice} style={{ background: isListening ? 'var(--error-container)' : 'var(--card-alt)', color: isListening ? 'var(--red)' : 'var(--text-main)', width: 40, height: 40, borderRadius: 20, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined">{isListening ? 'mic' : 'mic_none'}</span>
            </button>
            <button onClick={takePhoto} style={{ background: 'var(--card-alt)', color: 'var(--text-main)', width: 40, height: 40, borderRadius: 20, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined">photo_camera</span>
            </button>
          </div>
        </div>

        <div className="type-toggle">
          {(['expense','income'] as const).map(t => (
            <button key={t} className={`type-btn ${t} ${type === t ? 'active' : ''}`}
              onClick={() => { setType(t); setCatId(t === 'expense' ? 'food' : 'salary'); }}>
              {t === 'expense' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>

        <div style={{ background: 'var(--glass-bg)', padding: '4px', borderRadius: 28, margin: '24px 0 32px', border: '1px solid var(--glass-border)', boxShadow: '0 8px 30px var(--glass-shadow), inset 0 1px 2px var(--glass-highlight)' }}>
          <input className="amount-input" type="number" 
          placeholder={`${getSettings().currency || '₹'}0`} value={amount} onChange={e => setAmount(e.target.value)} autoFocus 
          onWheel={(e) => e.currentTarget.blur()} />
        </div>

        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            Category 
            {isAddingCat && <span style={{ color: 'var(--red)', cursor: 'pointer', fontSize: 11 }} onClick={() => setIsAddingCat(false)}>Cancel</span>}
          </label>
          {isAddingCat ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="form-input" style={{ width: 60, textAlign: 'center', padding: '14px 4px', fontSize: 20 }} value={newCatEmoji} onChange={e => setNewCatEmoji(e.target.value)} placeholder="📌" />
              <input className="form-input" style={{ flex: 1 }} value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="e.g. Subscriptions" autoFocus />
              <button onClick={saveNewCatInline} className="btn-primary" style={{ width: 'auto', padding: '0 20px', borderRadius: 14 }}>Add</button>
            </div>
          ) : (
            <div className="h-scroll" style={{ padding: '0 4px 10px', margin: '0 -24px' }}>
              <button className="cat-btn" onClick={() => setIsAddingCat(true)} style={{ borderStyle: 'dashed', background: 'transparent', borderColor: 'var(--border)', marginLeft: 24 }}>
                <span className="cat-btn-icon">➕</span>
                <span className="cat-btn-name">Add New</span>
              </button>
              {cats.map(c => (
                <button key={c.id} className={`cat-btn ${catId === c.id ? 'selected' : ''}`}
                  onClick={() => setCatId(catId === c.id ? '' : c.id)}>
                  <span className="cat-btn-icon">{c.icon}</span>
                  <span className="cat-btn-name">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Title / Note</label>
          <input className="form-input" placeholder={selCat.name} value={merchant} onChange={e => setMerchant(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Date & Time</label>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button 
              className={`type-btn ${dateStr === new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) ? 'active expense' : ''}`} 
              style={{ flex: 1, padding: '8px', fontSize: 13 }} 
              onClick={() => {
                const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                setDateStr(d.toISOString().slice(0, 10));
                setTimeStr(new Date().toTimeString().slice(0, 5));
              }}>
              Today
            </button>
            <button 
              className={`type-btn ${dateStr === new Date(new Date().getTime() - 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) ? 'active expense' : ''}`} 
              style={{ flex: 1, padding: '8px', fontSize: 13 }} 
              onClick={() => {
                const d = new Date(Date.now() - 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                setDateStr(d.toISOString().slice(0, 10));
                setTimeStr(new Date().toTimeString().slice(0, 5));
              }}>
              Yesterday
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="form-input" type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} style={{ flex: 3 }} />
            <input className="form-input" type="time" value={timeStr} onChange={e => setTimeStr(e.target.value)} style={{ flex: 2 }} />
          </div>
        </div>

        {receiptPhoto && (
          <div className="form-group">
            <label className="form-label">Receipt</label>
            <div style={{ position: 'relative', width: 80, height: 80, borderRadius: 16, overflow: 'hidden' }}>
              <img src={receiptPhoto} alt="receipt" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => setReceiptPhoto('')} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24 }}>×</button>
            </div>
          </div>
        )}

        {type === 'expense' && (
          <button
            onClick={() => setUnnecessaryTag(unnecessaryTag ? '' : 'Unnecessary spend')}
            style={{
              width: '100%', marginBottom: 8, padding: '14px 16px',
              background: unnecessaryTag ? '#FFF7ED' : 'var(--card-alt)',
              border: `1.5px solid ${unnecessaryTag ? '#F97316' : 'var(--border)'}`,
              borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🔥</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: unnecessaryTag ? '#EA580C' : 'var(--text-main)' }}>Unnecessary Spend</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Impulse buys, gifts, avoidable costs</div>
              </div>
            </div>
            <div style={{
              width: 24, height: 24, borderRadius: 12,
              background: unnecessaryTag ? '#F97316' : 'var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s',
            }}>
              {unnecessaryTag && <span style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>✓</span>}
            </div>
          </button>
        )}

        <button className="btn-primary" onClick={handleSave}>
          {prefill?.id ? 'Save Changes' : `Add ${type === 'expense' ? 'Expense' : 'Income'}`}
        </button>
      </div>
    </div>
  );
}

// ── Transaction Detail Modal ──────────────────────────────────────
function TxDetailModal({ tx, onClose, onDelete, onEdit }: {
  tx: Transaction; onClose: () => void;
  onDelete: (id: string) => void; onEdit: (tx: Transaction) => void;
}) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-handle" />
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="tx-icon-wrap" style={{ width: 64, height: 64, fontSize: 32, margin: '0 auto 16px', background: 'var(--hero-bg)' }}>{tx.categoryIcon}</div>
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-1px', color: tx.type === 'expense' ? 'var(--text-main)' : 'var(--primary-green)' }}>
            {tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}
          </div>
          <div style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 16 }}>{tx.merchant}</div>
        </div>
        
        <div className="bill-card" style={{ width: '100%', marginBottom: 16, borderLeft: 'none', padding: 20 }}>
          <div className="tx-row" style={{ padding: 0, boxShadow: 'none', background: 'transparent' }}>
            <span className="form-label" style={{ marginBottom: 0 }}>Category</span>
            <span style={{ fontWeight: 600 }}>{tx.categoryName}</span>
          </div>
          <div className="tx-row" style={{ padding: '16px 0 0', boxShadow: 'none', background: 'transparent', margin: 0, borderTop: '1px solid var(--border)', borderRadius: 0 }}>
            <span className="form-label" style={{ marginBottom: 0 }}>Date</span>
            <span style={{ fontWeight: 600 }}>{parseDate(tx.date)}</span>
          </div>
          {tx.receiptPhoto && (
             <div className="tx-row" style={{ padding: '16px 0 0', boxShadow: 'none', background: 'transparent', margin: 0, borderTop: '1px solid var(--border)', borderRadius: 0 }}>
               <img src={tx.receiptPhoto} alt="Receipt" style={{ width: '100%', borderRadius: 12, marginTop: 8 }} />
             </div>
          )}
        </div>
        
        <button className="btn-primary" onClick={() => onEdit(tx)}>Edit Transaction</button>
        <button className="btn-danger" onClick={() => { onDelete(tx.id); onClose(); }}>Delete</button>
      </div>
    </div>
  );
}

// ── Home Screen ───────────────────────────────────────────────────
function HomeScreen({ onAdd, onNav, transactions, settings, quickExpenses, bills, onQuickAdd, onTxTap, onManageQuick }: {
  onAdd: (prefill?: Partial<Transaction>) => void; onNav: (t: 'home'|'tx'|'insights'|'settings') => void; 
  transactions: Transaction[]; settings: AppSettings;
  quickExpenses: QuickExpense[]; bills: Bill[];
  onQuickAdd: (q: QuickExpense) => void; onTxTap: (tx: Transaction) => void;
  onManageQuick: () => void;
}) {
  const now = new Date();
  const monthTx = transactions.filter(t => new Date(t.date).getMonth() === now.getMonth() && new Date(t.date).getFullYear() === now.getFullYear());
  const income  = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  
  const budget = settings.monthlyBudget;
  const remaining = budget > 0 ? budget - expense : 494.90;

  // Removed UPI-style contacts, using quickExpenses instead

  // Removed UPI-style contacts, using quickExpenses instead

  return (
    <div className="screen">
      {/* ── TOP HEADER ── */}
      <div className="top-header">
        <div className="header-profile-wrap" onClick={() => onNav('settings')}>
          <div className="profile-avatar-ring">
            <div className="profile-avatar-inner">
              {settings.profilePic ? (
                <img src={settings.profilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#A0F0B5' }}>person</span>
              )}
            </div>
          </div>
          <div className="header-greeting">
            Hi, {settings.userName || 'Knightking'}
          </div>
        </div>

        <div className="header-pill-actions">
          <button className="header-action-btn" onClick={() => onNav('tx')} title="History">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>schedule</span>
          </button>
          <button className="header-action-btn" onClick={() => onNav('settings')} title="Settings">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>tune</span>
          </button>
        </div>
      </div>

      {/* ── PREMIUM CREDIT CARD STYLE BALANCE ── */}
      <div 
        className="premium-credit-card"
        style={{
          margin: '12px 16px 24px',
          padding: '24px 28px',
          borderRadius: '24px',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 100%)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.3)',
          position: 'relative',
          overflow: 'hidden',
          minHeight: '210px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          color: '#fff',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.3s ease-out'
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const xPct = (x / rect.width - 0.5) * 20; // max rotation 10deg
          const yPct = (y / rect.height - 0.5) * -20;
          e.currentTarget.style.transform = `perspective(1000px) rotateY(${xPct}deg) rotateX(${yPct}deg) scale3d(1.02, 1.02, 1.02)`;
          
          const glare = e.currentTarget.querySelector('.card-glare') as HTMLElement;
          if (glare) {
            glare.style.transform = `translate(${x - rect.width/2}px, ${y - rect.height/2}px)`;
            glare.style.opacity = '1';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg) scale3d(1, 1, 1)';
          const glare = e.currentTarget.querySelector('.card-glare') as HTMLElement;
          if (glare) glare.style.opacity = '0';
        }}
      >
        {/* Interactive Glare */}
        <div className="card-glare" style={{
          position: 'absolute', top: 0, left: 0, width: '200%', height: '200%',
          background: 'radial-gradient(circle at center, rgba(255,255,255,0.3) 0%, transparent 50%)',
          pointerEvents: 'none', opacity: 0, transition: 'opacity 0.3s',
          mixBlendMode: 'overlay', zIndex: 10
        }}></div>

        {/* Glows */}
        <div style={{ position: 'absolute', top: '-50%', left: '-20%', width: '150%', height: '150%', background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 60%)', filter: 'blur(30px)' }}></div>
        <div style={{ position: 'absolute', bottom: -60, right: -40, width: 160, height: 160, background: 'rgba(48, 209, 88, 0.45)', borderRadius: '50%', filter: 'blur(50px)' }}></div>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, background: 'rgba(56, 189, 248, 0.35)', borderRadius: '50%', filter: 'blur(40px)' }}></div>

        {/* Top Row: Label and NFC Icon */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Available Balance
          </div>
          <span className="material-symbols-outlined" style={{ fontSize: 26, transform: 'rotate(90deg)', opacity: 0.8 }}>contactless</span>
        </div>

        {/* Chip Icon */}
        <div style={{ position: 'relative', zIndex: 1, marginTop: 'auto', marginBottom: '20px' }}>
           <svg width="42" height="32" viewBox="0 0 40 30" fill="none" xmlns="http://www.w3.org/2000/svg">
             <rect width="40" height="30" rx="6" fill="url(#chip-grad)" opacity="0.9"/>
             <path d="M0 10H12V20H0M28 10H40V20H28M16 0V30M24 0V30" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
             <defs>
                <linearGradient id="chip-grad" x1="0" y1="0" x2="40" y2="30" gradientUnits="userSpaceOnUse">
                   <stop stopColor="#FDE047" />
                   <stop offset="1" stopColor="#D97706" />
                </linearGradient>
             </defs>
           </svg>
        </div>

        {/* Balance Amount */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-1.5px', textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
            {settings.currency || '$'}{Math.abs(remaining).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {/* Faux Card Network Circles */}
          <div style={{ display: 'flex', opacity: 0.85, paddingBottom: 6 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#ff3b30' }}></div>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#ffcc00', marginLeft: -12, mixBlendMode: 'screen' }}></div>
          </div>
        </div>
      </div>

      {/* ── THREE VIBRANT ACTION BUTTONS ── */}
      <div className="action-buttons-grid">
        <div className="action-card add" onClick={() => onAdd({ type: 'expense' })}>
          <div className="action-card-badge">
            <span className="material-symbols-outlined">add</span>
          </div>
          <div className="action-card-label">Add</div>
        </div>

        <div className="action-card savings" onClick={() => onAdd({ type: 'income' })}>
          <div className="action-card-badge">
            <span className="material-symbols-outlined">account_balance</span>
          </div>
          <div className="action-card-label">Savings</div>
        </div>

        <div className="action-card withdraw" onClick={() => onAdd({ type: 'expense' })}>
          <div className="action-card-badge">
            <span className="material-symbols-outlined">south_west</span>
          </div>
          <div className="action-card-label">Withdraw</div>
        </div>
      </div>

      {/* ── QUICK ADDS / FREQUENT (Tracker Style) ── */}
      <div className="recent-sec-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="recent-sec-title" style={{ marginBottom: 0 }}>Quick Log</div>
          <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>Tap to log instantly</div>
        </div>
        <div className="avatar-row-scroll">
          {quickExpenses.map((q, i) => {
            return (
              <div key={q.id} className="avatar-item" onClick={() => onQuickAdd(q)}>
                <div style={{
                  width: 60, height: 60, borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 100%)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, flexShrink: 0,
                  transition: 'transform 0.2s, background 0.2s',
                }}>
                  {q.emoji}
                </div>
                <div className="avatar-name" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{q.name}</div>
              </div>
            );
          })}
          <div className="avatar-item" onClick={onManageQuick}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'var(--card-alt)',
              border: '1.5px dashed var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, flexShrink: 0, color: 'var(--primary)',
              boxShadow: '0 4px 12px var(--glass-shadow)'
            }}>
              ➕
            </div>
            <div className="avatar-name" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Add New</div>
          </div>
        </div>
      </div>

      {/* ── RECENT TRANSACTIONS (LIST) ── */}
      <div className="upcoming-sec-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, padding: '0 4px' }}>
          <div className="upcoming-sec-title" style={{ marginBottom: 0, padding: 0 }}>Recent Transactions</div>
          <div style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }} onClick={() => onNav('tx')}>View All</div>
        </div>
        <div className="upcoming-list">
          {transactions.slice(0, 3).map(tx => (
            <div key={tx.id} className="upcoming-card" onClick={() => onTxTap(tx)}>
              <div className="upcoming-left">
                <div className="upcoming-brand-icon" style={{ background: tx.type === 'expense' ? 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)' : 'linear-gradient(135deg, #30D158 0%, #25A244 100%)' }}>
                  {tx.categoryIcon || '💸'}
                </div>
                <div className="upcoming-info">
                  <div className="upcoming-name">{tx.merchant}</div>
                  <div className="upcoming-due">{new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' })}</div>
                </div>
              </div>
              <div className="upcoming-right">
                <div className="upcoming-price" style={{ color: tx.type === 'income' ? '#30D158' : 'var(--text-main)' }}>
                  {tx.type === 'income' ? '+' : ''}{formatCurrency(tx.amount)}
                </div>
                <div className="upcoming-freq">{tx.categoryName}</div>
              </div>
            </div>
          ))}
          {transactions.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 20px', background: 'var(--glass-bg)', borderRadius: 24, border: '1px dashed var(--border)', marginTop: 12 }}>
               <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.5, marginBottom: 12 }}>receipt_long</span>
               <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)', marginBottom: 8 }}>Ready to start tracking?</div>
               <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.8 }}>Your recent spending and income will appear here. Tap the Add button above to log your first transaction!</div>
            </div>
          )}
        </div>
      </div>

      {/* ── UPCOMING PAYMENTS ── */}
      <div className="upcoming-sec-wrap">
        <div className="upcoming-sec-title">Upcoming Payments</div>
        <div className="upcoming-list">
          {bills.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 20px', background: 'var(--glass-bg)', borderRadius: 20, border: '1px dashed var(--border)', width: '100%' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, opacity: 0.5, marginBottom: 8, display: 'block' }}>event_repeat</span>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>No upcoming bills scheduled</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Add recurring subscriptions or bills to track them here.</div>
            </div>
          )}

          {/* User's custom bills if any */}
          {bills.map(b => (
            <div key={b.id} className="upcoming-card" onClick={() => onAdd({ merchant: b.name, amount: b.amount, type: 'expense' })}>
              <div className="upcoming-left">
                <div className="upcoming-brand-icon" style={{ background: '#25A244' }}>
                  {b.icon || '💡'}
                </div>
                <div className="upcoming-info">
                  <div className="upcoming-name">{b.name}</div>
                  <div className="upcoming-due">Due: {new Date(b.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
              </div>
              <div className="upcoming-right">
                <div className="upcoming-price">{formatCurrency(b.amount)}</div>
                <div className="upcoming-freq">Upcoming</div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ── Activity Screen ────────────────────────────────────────────────
type ActivityPeriod = 'today' | 'week' | 'month' | 'all';

function ActivityScreen({ transactions, onTxTap }: { transactions: Transaction[]; onTxTap: (tx: Transaction) => void }) {
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

  const totalIncome  = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = totalIncome - totalExpense;

  // Group by day
  const grouped: Record<string, Transaction[]> = {};
  filtered.forEach(t => {
    const key = new Date(t.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  const PERIOD_LABELS: { id: ActivityPeriod; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week',  label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'all',   label: 'All' },
  ];

  return (
    <div className="screen">
      {/* Sticky Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'color-mix(in srgb, var(--bg) 92%, transparent)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        paddingBottom: 12, borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px' }}>Activity</div>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-muted)' }}>filter_list</span>
        </div>

        {/* Period Tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '0 20px', marginBottom: 14 }}>
          {PERIOD_LABELS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} style={{
              padding: '7px 16px', borderRadius: 100, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 600, fontSize: 13,
              background: period === p.id ? 'var(--primary)' : 'var(--card-alt)',
              color: period === p.id ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.2s',
            }}>{p.label}</button>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: '0 20px', position: 'relative' }}>
          <span className="material-symbols-outlined" style={{
            position: 'absolute', left: 34, top: '50%', transform: 'translateY(-50%)',
            fontSize: 18, color: 'var(--text-muted)',
          }}>search</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search transactions…"
            style={{
              width: '100%', background: 'var(--card-alt)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '11px 16px 11px 42px',
              fontSize: 14, fontFamily: 'inherit', color: 'var(--text-main)', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Summary Bar */}
      <div style={{ display: 'flex', gap: 10, padding: '16px 16px 8px' }}>
        {[
          { label: 'Balance',  val: net,          color: net >= 0 ? 'var(--primary)' : 'var(--red)', icon: 'savings' },
          { label: 'Expense',  val: totalExpense, color: 'var(--red)',     icon: 'arrow_upward' },
          { label: 'Income',   val: totalIncome,  color: 'var(--primary)', icon: 'arrow_downward' },
        ].map(c => (
          <div key={c.label} style={{
            flex: 1, background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: 16, padding: '12px 10px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: c.color }}>{c.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: c.color, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(Math.abs(c.val))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Weekly Spend Chart (rolling 7 days, always fresh) ── */}
      {(() => {
        // Build current week (Monday to Sunday)
        const today = new Date();
        const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1=Mon, 7=Sun
        const monday = new Date(today);
        monday.setDate(today.getDate() - (dayOfWeek - 1));

        const days7 = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          return d;
        });

        const week7 = days7.map(d => {
          const key = d.toDateString();
          const dayTxs = transactions.filter(t => new Date(t.date).toDateString() === key);
          const exp = dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
          const inc = dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
          const label = d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3);
          const isToday = d.toDateString() === today.toDateString();
          return { label, exp, inc, isToday, date: d };
        });

        const maxExp = Math.max(...week7.map(d => d.exp), 1);
        const weekTotal = week7.reduce((s, d) => s + d.exp, 0);
        const peakIdx = week7.reduce((pi, d, i) => d.exp > week7[pi].exp ? i : pi, 0);
        const avgDay = weekTotal / 7;

        const BAR_W = 26;
        const BAR_H = 88;
        const GAP = 12;
        const SVG_W = 7 * (BAR_W + GAP) + 20;

        return (
          <div style={{ padding: '4px 16px 16px' }}>
            <div style={{
              background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderRadius: 22, padding: '18px 16px 14px',
            }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, paddingRight: 4 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
                    This Week's Spend
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.8px', color: 'var(--text-main)' }}>
                    {formatCurrency(weekTotal)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    avg {formatCurrency(Math.round(avgDay))}/day
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>📍 Peak</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>{week7[peakIdx]?.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{formatCurrency(week7[peakIdx]?.exp || 0)}</div>
                </div>
              </div>

              {/* SVG bars */}
              <svg width="100%" viewBox={`0 0 ${SVG_W} ${BAR_H + 46}`} style={{ overflow: 'visible', display: 'block' }}>
                <defs>
                  <linearGradient id="wkExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#fca5a5" stopOpacity="0.45" />
                  </linearGradient>
                  <linearGradient id="wkExpPeak" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b91c1c" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.85" />
                  </linearGradient>
                  <linearGradient id="wkToday" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" />
                    <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0.5" />
                  </linearGradient>
                </defs>

                {/* Average line */}
                {weekTotal > 0 && (
                  <>
                    <line
                      x1={0} x2={SVG_W - 10}
                      y1={BAR_H - (avgDay / maxExp) * BAR_H + 2}
                      y2={BAR_H - (avgDay / maxExp) * BAR_H + 2}
                      stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="4 3" opacity={0.35}
                    />
                    <text x={SVG_W - 12} y={BAR_H - (avgDay / maxExp) * BAR_H - 2}
                      fontSize={8} fill="var(--text-muted)" textAnchor="end" opacity={0.6}>avg</text>
                  </>
                )}

                {week7.map((d, i) => {
                  const x = i * (BAR_W + GAP);
                  const barH = d.exp > 0 ? Math.max(8, (d.exp / maxExp) * BAR_H) : 4;
                  const y = BAR_H - barH;
                  const isPeak = i === peakIdx && d.exp > 0;
                  const amt = d.exp >= 1000 ? `${(d.exp / 1000).toFixed(1)}k` : d.exp > 0 ? `${d.exp}` : '';
                  const fill = d.isToday && d.exp === 0 ? 'url(#wkToday)' : isPeak ? 'url(#wkExpPeak)' : 'url(#wkExp)';

                  return (
                    <g key={i}>
                      {/* Today pill background */}
                      {d.isToday && (
                        <rect x={x - 3} y={0} width={BAR_W + 6} height={BAR_H + 36}
                          rx={10} fill={d.exp > 0 ? '#ef444410' : '#05966910'} />
                      )}

                      {/* Bar or empty placeholder */}
                      {d.exp > 0 ? (
                        <rect x={x} y={y} width={BAR_W} height={barH} rx={8} fill={fill} />
                      ) : (
                        <rect x={x + BAR_W * 0.25} y={BAR_H - 4} width={BAR_W * 0.5} height={4} rx={2}
                          fill={d.isToday ? '#059669' : 'var(--border)'} opacity={0.5} />
                      )}


                      {/* Amount above bar */}
                      {amt && (
                        <text x={x + BAR_W / 2} y={y - 4} textAnchor="middle"
                          fontSize={8.5} fontWeight={isPeak ? 800 : 600}
                          fill={isPeak ? '#ef4444' : 'var(--text-muted)'}>
                          {amt}
                        </text>
                      )}

                      {/* Day label */}
                      <text x={x + BAR_W / 2} y={BAR_H + 16} textAnchor="middle"
                        fontSize={10} fontWeight={d.isToday ? 800 : 500}
                        fill={d.isToday ? 'var(--text-main)' : 'var(--text-muted)'}>
                        {d.label}
                      </text>

                      {d.isToday && (
                        <circle cx={x + BAR_W / 2} cy={BAR_H + 28} r={3} fill="#3B82F6" />
                      )}

                    </g>
                  );
                })}
              </svg>

              {/* Legend */}
              <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Expense</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Income day</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B82F6' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Today</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Transactions grouped by day */}
      <div className="tx-list" style={{ paddingBottom: 110 }}>
        {Object.keys(grouped).length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>receipt_long</span>
            <div style={{ fontWeight: 600 }}>No transactions {search ? 'matching your search' : 'in this period'}</div>
          </div>
        )}
        {Object.entries(grouped).map(([day, txs]) => {
          const dayTotal = txs.reduce((s, t) => t.type === 'expense' ? s - t.amount : s + t.amount, 0);
          return (
            <div key={day}>
              {/* Day header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 4px 8px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{day}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: dayTotal >= 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                  {dayTotal >= 0 ? '+' : ''}{formatCurrency(dayTotal)}
                </div>
              </div>
              {txs.map(tx => {
                const txTime = new Date(tx.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                const rowClass = tx.isUnnecessary ? 'tx-row unnecessary-row' : tx.type === 'income' ? 'tx-row income-row' : 'tx-row expense-row';
                return (
                  <div key={tx.id} className={rowClass} onClick={() => onTxTap(tx)}>
                    <div className="tx-left">
                      <div className="tx-icon-wrap" style={{
                        background: tx.type === 'income' ? 'rgba(0,100,70,0.1)' : tx.isUnnecessary ? '#FFF7ED' : 'var(--card-alt)',
                        borderRadius: 16,
                      }}>{tx.categoryIcon}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="tx-title">{tx.merchant} {tx.isUnnecessary && <span style={{ fontSize: 11 }}>🔥</span>}</div>
                        <div className="tx-sub">
                          <span style={{ background: tx.type === 'income' ? 'rgba(0,100,70,0.1)' : 'var(--card-alt)', padding: '1px 7px', borderRadius: 8, fontWeight: 700 }}>{tx.categoryName}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className={`tx-amt ${tx.type}`}>{tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount).replace('-', '')}</div>
                      <div className="tx-time">{txTime}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Insights Screen ───────────────────────────────────────────────
function InsightsScreen({ transactions, settings }: { transactions: Transaction[]; settings: AppSettings }) {
  const now = new Date();
  const monthTx = transactions.filter(t => new Date(t.date).getMonth() === now.getMonth());
  const expenses = monthTx.filter(t => t.type === 'expense');
  const totalExp = expenses.reduce((s, t) => s + t.amount, 0);
  
  const catMap: Record<string, number> = {};
  expenses.forEach(t => { catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount; });
  const catBreakdown = Object.entries(catMap).map(([id, amt]) => ({ cat: getAllCategories().find(c => c.id === id)!, amt })).sort((a, b) => b.amt - a.amt);
  
  // 'Unnecessary' = lifestyle spend (not bills/home/work/travel)
  const UNNECESSARY_CATS = ['food', 'shopping', 'fun', 'family', 'other'];
  const unnecessaryExp = expenses
    .filter(t => UNNECESSARY_CATS.includes(t.categoryId) || !['bills','home','work','travel','health'].includes(t.categoryId))
    .reduce((s, t) => s + t.amount, 0);

  // Donut chart logic
  let offset = 25; // start at 12 o'clock

  // Gold Spark Logic & Goals — uses unnecessary spend as savings base
  // goldValue = FV of investing monthly savings every month at 15% CAGR
  // Formula: PMT * [((1+r)^n - 1) / r] where r = monthly rate, n = months
  const monthlyRate = 0.15 / 12;
  const goldFV = (months: number) => {
    if (monthlySavings <= 0) return 0;
    return monthlySavings * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
  };
  
  const incomes = monthTx.filter(t => t.type === 'income');
  const totalInc = incomes.reduce((s, t) => s + t.amount, 0);
  const monthlySavings = totalInc - totalExp;
  const isSaving = monthlySavings > 0;

  const GOALS = [
    { name: `Bike (${settings.currency || '₹'}100k)`, cost: 100000, icon: '🏍️' },
    { name: `Car (${settings.currency || '₹'}800k)`, cost: 800000, icon: '🚗' },
    { name: `House (${settings.currency || '₹'}5M)`, cost: 5000000, icon: '🏡' }
  ];

  return (
    <div className="screen tx-list" style={{ paddingTop: 20 }}>
      <div className="sec-header" style={{ padding: 0, marginBottom: 20 }}>
        <div className="sec-title" style={{ fontSize: 24 }}>Insights</div>
      </div>
      
      {/* ── PREMIUM SPEND CARD ── */}
      <div style={{
        margin: '0 0 28px',
        padding: '24px',
        borderRadius: 24,
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        boxShadow: '0 12px 32px var(--glass-shadow), inset 0 1px 1px var(--glass-highlight)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        position: 'relative', overflow: 'hidden'
      }}>
        {/* Decorative background glows */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, background: 'rgba(255, 107, 107, 0.2)', borderRadius: '50%', filter: 'blur(40px)' }}></div>
        <div style={{ position: 'absolute', bottom: -40, left: -40, width: 140, height: 140, background: 'rgba(48, 209, 88, 0.15)', borderRadius: '50%', filter: 'blur(40px)' }}></div>
        
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>Spent this month</div>
            <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--glass-text)', letterSpacing: '-0.5px' }}>{formatCurrency(totalExp)}</div>
          </div>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--glass-highlight)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <span className="material-symbols-outlined" style={{ color: '#FF6B6B', fontSize: 24 }}>shopping_cart</span>
          </div>
        </div>

        {/* Budget Progress Bar */}
        {settings.monthlyBudget > 0 ? (
          <div style={{ position: 'relative', zIndex: 1, marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, fontWeight: 600 }}>
              <span style={{ color: totalExp > settings.monthlyBudget ? '#FF6B6B' : 'var(--text-muted)' }}>
                {totalExp > settings.monthlyBudget ? 'Over budget' : 'Budget'}
              </span>
              <span style={{ color: 'var(--glass-text)' }}>{formatCurrency(settings.monthlyBudget)}</span>
            </div>
            <div style={{ height: 6, background: 'var(--glass-highlight)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                width: `${Math.min((totalExp / settings.monthlyBudget) * 100, 100)}%`, 
                background: totalExp > settings.monthlyBudget ? '#FF6B6B' : 'linear-gradient(90deg, #30D158, #38F9D7)',
                borderRadius: 4,
                transition: 'width 0.5s ease-out'
              }}></div>
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative', zIndex: 1, marginTop: 20, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
            No budget set — tap Settings to add one
          </div>
        )}
      </div>

      <div className="date-header">CATEGORY BREAKDOWN</div>
      <div style={{ 
        width: '100%', padding: '32px 24px', marginBottom: 28,
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: 32,
        boxShadow: '0 8px 32px var(--glass-shadow), inset 0 1px 1px var(--glass-highlight)'
      }}>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', marginBottom: 36, marginTop: 4 }}>
          {/* Total Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Total Spent</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--glass-text)', letterSpacing: '-0.5px', lineHeight: 1 }}>{formatCurrency(totalExp)}</div>
            </div>
          </div>

          {/* Stacked Bar Breakdown */}
          <div style={{ display: 'flex', width: '100%', height: 14, borderRadius: 8, overflow: 'hidden', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)' }}>
            {totalExp === 0 && <div style={{ flex: 1, background: 'var(--glass-highlight)' }}></div>}
            {catBreakdown.map((item, i) => {
              const pct = (item.amt / totalExp) * 100;
              if (pct === 0) return null;
              return (
                <div key={item.cat.id} style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${item.cat.color}ee, ${item.cat.color})`,
                  boxShadow: `inset -1px 0 0 rgba(0,0,0,0.2)`
                }}></div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {catBreakdown.map(({ cat, amt }) => {
            const pct = Math.round((amt / totalExp) * 100);
            return (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ 
                    width: 38, height: 38, borderRadius: 12, 
                    background: `linear-gradient(135deg, ${cat.color}30, ${cat.color}10)`,
                    border: `1px solid ${cat.color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 4px 12px ${cat.color}20`
                  }}>
                     <span style={{ fontSize: 18, color: cat.color, textShadow: `0 2px 8px ${cat.color}80` }}>{cat.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--glass-text)' }}>{cat.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{pct}% of spend</div>
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--glass-text)' }}>{formatCurrency(amt)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {isSaving && (
        <>
          <div className="date-header">THE GOLD SPARK ✨</div>
          <div style={{ margin: '0 0 24px', background: 'radial-gradient(120% 120% at 0% 0%, #F59E0B 0%, #92400E 100%)', borderRadius: 28, padding: '24px', color: 'white', border: '1px solid rgba(255, 215, 0, 0.3)', boxShadow: '0 16px 40px rgba(245, 158, 11, 0.3), inset 0 2px 4px rgba(255, 255, 255, 0.3)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, transparent 70%)', filter: 'blur(20px)' }}></div>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'relative', zIndex: 1 }}>
              If you had avoided unnecessary spend
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.5px', textShadow: '0 2px 10px rgba(0,0,0,0.2)', position: 'relative', zIndex: 1 }}>
              &amp; invested it in 24K Gold
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 24, position: 'relative', zIndex: 1 }}>
              at ~15% CAGR (≈ historical gold growth)
            </div>
            <div style={{ display: 'flex', gap: 12, position: 'relative', zIndex: 1 }}>
              {[
                { label: '1 Year',  n: 12 },
                { label: '3 Years', n: 36 },
                { label: '5 Years', n: 60 },
              ].map(({ label, n }) => {
                const rate = 0.15 / 12;
                const fv = unnecessaryExp > 0
                  ? Math.round(unnecessaryExp * ((Math.pow(1 + rate, n) - 1) / rate) * (1 + rate))
                  : 0;
                return (
                  <div key={n} style={{ flex: 1, background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 100%)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 16, padding: '14px 10px', textAlign: 'center', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.3)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.9, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px', textShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>{formatCurrency(fv)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── GOALS TIMELINE ── */}
      {totalExp > 0 && <GoalsSection monthlySpend={totalExp} />}

    </div>
  );
}

// ── Goals Section (from spend %) ─────────────────────────────────
function GoalsSection({ monthlySpend }: { monthlySpend: number }) {
  const [savePct, setSavePct] = useState(20);
  const saveAmt = Math.round(monthlySpend * savePct / 100);

  const [customGoals, setCustomGoals] = useState<any[]>(() => JSON.parse(localStorage.getItem('kaas_goals') || '[]'));

  const GOALS = [...customGoals];

  const [showAddGoal, setShowAddGoal] = useState(false);

  const handleAddGoal = (name: string, cost: number, emoji: string) => {
    const colors = ['#f43f5e', '#8b5cf6', '#14b8a6', '#ec4899', '#06b6d4'];
    const newG = { id: Date.now().toString(), name, sub: 'Custom goal', icon: emoji, cost, color: colors[customGoals.length % colors.length] };
    const updated = [...customGoals, newG];
    setCustomGoals(updated);
    localStorage.setItem('kaas_goals', JSON.stringify(updated));
    setShowAddGoal(false);
  };

  const months = (cost: number) => saveAmt > 0 ? Math.ceil(cost / saveAmt) : 0;
  const displayTime = (m: number) => {
    if (m === 0) return { big: '–', small: '' };
    if (m < 12) return { big: `${m}`, small: 'months' };
    const y = Math.floor(m / 12);
    const mo = m % 12;
    return { big: `${y}${mo > 0 ? `.${mo}` : ''}`, small: 'years' };
  };

  return (
    <>
      <div className="date-header">IF YOU SAVE SOME 🎯</div>
      <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 28, padding: '22px', marginBottom: 24, boxShadow: '0 8px 32px var(--glass-shadow)' }}>
        {/* Context */}
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
          You spend <strong style={{ color: 'var(--text-main)' }}>{formatCurrency(monthlySpend)}</strong>/mo.
          Even saving a little adds up fast.
        </div>

        {/* Save % Selector */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 100, padding: 6, display: 'flex', gap: 4, marginBottom: 20, boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.1)' }}>
          {[10, 25, 50, 75, 100].map(p => (
            <button key={p} onClick={() => setSavePct(p)} style={{
              flex: 1, padding: '10px 0', borderRadius: 100, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
              background: savePct === p ? 'var(--card-bg)' : 'transparent',
              color: savePct === p ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: savePct === p ? '0 4px 12px rgba(0,0,0,0.15), inset 0 1px 2px var(--glass-highlight)' : 'none',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>{p}%</button>
          ))}
        </div>

        {/* Monthly saving chip */}
        {/* Monthly saving chip */}
        <div style={{
          background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-mid) 100%)', borderRadius: 20, padding: '16px 20px',
          marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 12px 30px rgba(48, 209, 88, 0.25), inset 0 2px 4px rgba(255,255,255,0.2)'
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#fff', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>You save</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>{formatCurrency(saveAmt)}<span style={{ fontSize: 14, fontWeight: 600, opacity: 0.8 }}>/mo</span></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', opacity: 0.85 }}>{savePct}% of spend</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', opacity: 0.95 }}>{formatCurrency(saveAmt * 12)}<span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>/yr</span></div>
          </div>
        </div>

        {/* Goal Bento Grid Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 4px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Goals</div>
          <button onClick={() => setShowAddGoal(true)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_circle</span>
          </button>
        </div>
        
        {/* Goal Bento Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {GOALS.map(g => {
            const m = months(g.cost);
            const { big, small } = displayTime(m);
            const progress = saveAmt > 0 ? Math.min(100, (saveAmt / g.cost) * 100 * 12) : 0;

            return (
              <div key={g.name} style={{
                borderRadius: 24, overflow: 'hidden',
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                boxShadow: '0 8px 32px var(--glass-shadow), inset 0 1px 1px var(--glass-highlight)',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                display: 'flex', flexDirection: 'column',
                position: 'relative'
              }}>
                {/* Decorative glow specific to goal color */}
                <div style={{ position: 'absolute', top: -30, right: -30, width: 80, height: 80, background: g.color, opacity: 0.15, borderRadius: '50%', filter: 'blur(30px)' }}></div>
                
                {/* Header */}
                <div style={{
                  padding: '16px 16px 12px',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  position: 'relative', zIndex: 1
                }}>
                  <div style={{ 
                    width: 38, height: 38, borderRadius: 12, 
                    background: `linear-gradient(135deg, ${g.color}30, ${g.color}10)`,
                    border: `1px solid ${g.color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 4px 12px ${g.color}20`
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: g.color }}>{g.icon}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--glass-text)', letterSpacing: '-0.5px', lineHeight: 1 }}>{big}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--glass-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 4 }}>{small}</div>
                  </div>
                </div>

                {/* Info body */}
                <div style={{ padding: '8px 16px 16px', flex: 1, position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-main)', marginBottom: 2 }}>{g.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 14 }}>{formatCurrency(g.cost)}</div>
                  
                  {/* Progress bar */}
                  <div style={{ height: 6, background: 'var(--glass-highlight)', borderRadius: 4, overflow: 'hidden', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)' }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      background: g.grad,
                      width: `${Math.max(progress, 3)}%`,
                      transition: 'width 0.6s ease-out',
                      boxShadow: `0 0 10px ${g.color}80`
                    }} />
                  </div>
                </div>
              </div>
            );
          })}
          {GOALS.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '30px 20px', background: 'var(--card-bg)', borderRadius: 24, border: '1px dashed var(--border)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.5, marginBottom: 12 }}>flag</span>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Set a Savings Goal</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Tap the + icon above to add a new goal and track your progress automatically based on your monthly savings!</div>
            </div>
          )}
        </div>
      </div>
      {showAddGoal && <AddGoalModal onClose={() => setShowAddGoal(false)} onSave={handleAddGoal} />}
    </>
  );
}

function AddGoalModal({ onClose, onSave }: { onClose: () => void, onSave: (name: string, cost: number, emoji: string) => void }) {
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [emoji, setEmoji] = useState('🌟');

  const handleSave = () => {
    const c = parseInt(cost);
    if (name && c > 0) onSave(name, c, emoji);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ padding: 24, paddingBottom: 32 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Add New Goal</div>
        <div className="form-group">
          <label className="form-label">Goal Icon & Name</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="form-input" style={{ width: 64, textAlign: 'center', fontSize: 24, padding: '12px 4px' }} value={emoji} onChange={e => setEmoji(e.target.value)} />
            <input className="form-input" style={{ flex: 1 }} placeholder="e.g. MacBook Pro" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 32 }}>
          <label className="form-label">Target Amount</label>
          <input className="form-input" type="number" placeholder="150000" value={cost} onChange={e => setCost(e.target.value)} onWheel={e => e.currentTarget.blur()} />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-primary" style={{ flex: 1, background: 'var(--card-alt)', color: 'var(--text-main)', marginTop: 0, boxShadow: 'none' }} onClick={onClose}>Cancel</button>
          <button className="btn-primary" style={{ flex: 2, marginTop: 0 }} onClick={handleSave}>Save Goal</button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Screen ───────────────────────────────────────
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
  const [budgetVal, setBudgetVal] = useState(String(settings.monthlyBudget));
  const [editCurrency, setEditCurrency] = useState(false);
  const [currencyVal, setCurrencyVal] = useState(settings.currency);

  const SettingRow = ({ icon, label, value, onTap }: { icon: string; label: string; value?: string; onTap?: () => void }) => (
    <div className="tx-row" onClick={onTap} style={{ cursor: onTap ? 'pointer' : 'default' }}>
      <div className="tx-left">
        <div className="tx-icon-wrap" style={{ background: 'var(--card-alt)', fontSize: 18 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>
        </div>
        <span className="tx-title" style={{ fontSize: 15 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {value && <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>{value}</span>}
        {onTap && <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>chevron_right</span>}
      </div>
    </div>
  );

  const exportData = (fmt: 'json' | 'csv' = 'json') => {
    const txs = getTransactions();
    let content: string;
    let mime: string;
    let ext: string;
    if (fmt === 'csv') {
      const rows = [
        ['Date','Type','Amount','Category','Merchant','Notes','Unnecessary'].join(','),
        ...txs.map(t => [
          new Date(t.date).toLocaleDateString('en-IN'),
          t.type, t.amount,
          t.categoryName, `"${t.merchant}"`,
          `"${t.notes || ''}"`
          , t.isUnnecessary ? 'Yes' : 'No'
        ].join(','))
      ];
      content = rows.join('\n');
      mime = 'text/csv'; ext = 'csv';
    } else {
      content = JSON.stringify({ transactions: txs, settings: getSettings() }, null, 2);
      mime = 'application/json'; ext = 'json';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `kaas-backup-${new Date().toISOString().slice(0,10)}.${ext}`;
    a.click(); URL.revokeObjectURL(url);
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
        } catch (e) {
          alert('Invalid backup file');
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
    <div className="screen tx-list" style={{ paddingTop: 24 }}>
      <div style={{ padding: '0 4px', marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px' }}>Settings</div>
      </div>

      {/* Appearance */}
      <div className="date-header">APPEARANCE & UI</div>
      <div style={{ background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', padding: 4, marginBottom: 20 }}>
        <div className="type-toggle" style={{ margin: 0, background: 'transparent' }}>
          {(['light', 'dark', 'system'] as const).map(t => (
            <button key={t} className={`type-btn ${settings.theme === t ? 'active expense' : ''}`}
              onClick={() => onUpdate({ theme: t })} style={{ textTransform: 'capitalize', fontSize: 13 }}>
              {t === 'light' ? '☀️ Light' : t === 'dark' ? '🌙 Dark' : '⚙️ System'}
            </button>
          ))}
        </div>
      </div>
      
      <div className="date-header">SHORTCUTS & BILLS</div>
      <div style={{ background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 20 }}>
        <SettingRow icon="bolt" label="Manage Quick Adds" value="Customize" onTap={onManageQuick} />
        <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />
        <SettingRow icon="calendar_today" label="Manage Bills" value="Customize" onTap={onManageBills} />
      </div>

      {/* Account */}
      <div className="date-header">ACCOUNT</div>
      <div style={{ background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 20 }}>
        
        <div className="tx-row" onClick={handleProfilePic} style={{ cursor: 'pointer' }}>
          <div className="tx-left">
            <div className="tx-icon-wrap" style={{ background: 'var(--card-alt)', padding: 0, overflow: 'hidden' }}>
              {settings.profilePic ? <img src={settings.profilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#A0F0B5' }}>person</span>}
            </div>
            <span className="tx-title" style={{ fontSize: 15 }}>Profile Picture</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>add_a_photo</span>
          </div>
        </div>
        <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />

        {editName ? (
          <div style={{ padding: '16px 16px 12px' }}>
            <label className="form-label">Your Name</label>
            <input className="form-input" value={nameVal} onChange={e => setNameVal(e.target.value)} autoFocus />
            <button className="btn-primary" style={{ marginTop: 10 }} onClick={() => { onUpdate({ userName: nameVal }); setEditName(false); }}>Save</button>
          </div>
        ) : (
          <SettingRow icon="person" label="Name" value={settings.userName} onTap={() => setEditName(true)} />
        )}
        <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />
        {editBudget ? (
          <div style={{ padding: '16px 16px 12px' }}>
            <label className="form-label">Monthly Budget ({settings.currency || '₹'})</label>
            <input className="form-input" type="number" value={budgetVal} onChange={e => setBudgetVal(e.target.value)} autoFocus />
            <button className="btn-primary" style={{ marginTop: 10 }} onClick={() => { onUpdate({ monthlyBudget: Number(budgetVal) }); setEditBudget(false); }}>Save</button>
          </div>
        ) : (
          <SettingRow icon="account_balance_wallet" label="Monthly Budget" value={formatCurrency(Number(settings.monthlyBudget))} onTap={() => setEditBudget(true)} />
        )}
        <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />
        {editCurrency ? (
          <div style={{ padding: '16px 16px 12px' }}>
            <label className="form-label">Currency Symbol (e.g. $, ₹, €)</label>
            <input className="form-input" value={currencyVal} onChange={e => setCurrencyVal(e.target.value)} autoFocus />
            <button className="btn-primary" style={{ marginTop: 10 }} onClick={() => { onUpdate({ currency: currencyVal }); setEditCurrency(false); }}>Save</button>
          </div>
        ) : (
          <SettingRow icon="currency_rupee" label="Currency" value={settings.currency} onTap={() => setEditCurrency(true)} />
        )}
      </div>

      {/* Data */}
      <div className="date-header">DATA & BACKUP</div>
      <div style={{ background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 20 }}>
        <SettingRow icon="cloud_sync" label="Auto Backup (Local)" value={settings.autoBackup ? 'ON' : 'OFF'} onTap={() => onUpdate({ autoBackup: !settings.autoBackup })} />
        <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />
        <SettingRow icon="download" label="Import Backup" value="JSON" onTap={importData} />
        <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />
        <SettingRow icon="upload" label="Export Backup" value="JSON" onTap={() => exportData('json')} />
      </div>

      {/* About */}
      <div className="date-header">ABOUT</div>
      <div style={{ background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 20 }}>
        <SettingRow icon="info" label="Version" value="2.0.0" />
        <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />
        <SettingRow icon="lock" label="Privacy" value="100% Offline" />
        <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />
        <SettingRow icon="favorite" label="Made by" value="Obi Rahaman ♥" />
      </div>

      {/* Danger */}
      <div className="date-header">DANGER ZONE</div>
      <button className="btn-danger" onClick={onClearData} style={{ borderRadius: 16 }}>🗑️ Clear All Data</button>
      <div style={{ height: 40 }} />
    </div>
  );
}

function ManageQuickAddsModal({ onClose, quickAdds, onSave }: { onClose: () => void, quickAdds: QuickExpense[], onSave: (q: QuickExpense[]) => void }) {
  const [adds, setAdds] = useState<QuickExpense[]>(quickAdds);
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('');
  const [emoji, setEmoji] = useState('☕');
  
  const handleAdd = () => {
    if (!name || !amt) return;
    const newAdds = [...adds, { id: uuid(), name, amount: Number(amt), categoryId: 'other', emoji }];
    setAdds(newAdds);
    setName(''); setAmt('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ padding: '32px 24px', borderRadius: 32, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', boxShadow: '0 24px 48px var(--glass-shadow)' }}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 24, textAlign: 'center', letterSpacing: '-0.5px' }}>Manage Quick Adds</div>
        
        {/* Add New Form */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 20, padding: 16, marginBottom: 24, border: '1px solid rgba(255,255,255,0.05)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input className="form-input" style={{ width: 64, textAlign: 'center', fontSize: 24, padding: '12px 4px', background: 'var(--card-bg)' }} value={emoji} onChange={e => setEmoji(e.target.value)} />
            <input className="form-input" placeholder="e.g. Coffee" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1, background: 'var(--card-bg)' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="form-input" placeholder="Amount" type="number" value={amt} onChange={e => setAmt(e.target.value)} style={{ flex: 1, background: 'var(--card-bg)' }} />
            <button className="btn-primary" style={{ padding: '0 24px', margin: 0, borderRadius: 16 }} onClick={handleAdd}>Add</button>
          </div>
        </div>

        {/* Existing List */}
        <div style={{ maxHeight: '40vh', overflowY: 'auto', margin: '0 -8px', padding: '0 8px' }}>
          {adds.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--card-bg)', borderRadius: 18, marginBottom: 10, border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--glass-highlight)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                  {a.emoji}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)' }}>{a.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{formatCurrency(a.amount)}</div>
                </div>
              </div>
              <button onClick={() => setAdds(adds.filter(x => x.id !== a.id))} style={{ background: 'var(--red-bg)', color: 'var(--red)', border: 'none', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
              </button>
            </div>
          ))}
          {adds.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 30, fontSize: 14, fontWeight: 500 }}>No quick adds configured. Create one above!</div>}
        </div>

        <button className="btn-primary" style={{ marginTop: 24, width: '100%', padding: '20px', borderRadius: 20 }} onClick={() => { onSave(adds); onClose(); }}>Save Changes</button>
      </div>
    </div>
  );
}

function ManageBillsModal({ onClose, bills, onSave }: { onClose: () => void, bills: Bill[], onSave: (b: Bill[]) => void }) {
  const [list, setList] = useState<Bill[]>(bills);
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('');
  const [date, setDate] = useState('');
  const [icon, setIcon] = useState('💡');
  
  const handleAdd = () => {
    if (!name || !amt || !date) return;
    const newBills = [...list, { id: uuid(), name, amount: Number(amt), categoryId: 'bills', icon, dueDate: new Date(date).toISOString() }];
    setList(newBills);
    setName(''); setAmt(''); setDate('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ padding: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Manage Bills & Reminders</div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" style={{ width: 60, textAlign: 'center' }} value={icon} onChange={e => setIcon(e.target.value)} />
            <input className="form-input" placeholder="Bill Name" value={name} onChange={e => setName(e.target.value)} />
            <input className="form-input" placeholder="Amt" type="number" value={amt} onChange={e => setAmt(e.target.value)} style={{ width: 100 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ flex: 1 }} />
            <button className="btn-primary" style={{ padding: '0 24px' }} onClick={handleAdd}>Add</button>
          </div>
        </div>

        <div className="tx-list" style={{ maxHeight: 300, overflowY: 'auto' }}>
          {list.map(b => (
            <div key={b.id} className="tx-row" style={{ padding: '12px 16px' }}>
              <div className="tx-left">
                <span style={{ fontSize: 24 }}>{b.icon}</span>
                <div>
                  <div className="tx-title">{b.name}</div>
                  <div className="tx-sub" style={{ fontSize: 12, marginTop: 2 }}>Due: {new Date(b.dueDate).toLocaleDateString()}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="tx-amt expense" style={{ fontSize: 16 }}>{formatCurrency(b.amount)}</span>
                <span className="material-symbols-outlined" style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={() => setList(list.filter(x => x.id !== b.id))}>delete</span>
              </div>
            </div>
          ))}
          {list.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No bills configured.</div>}
        </div>

        <button className="btn-primary" style={{ marginTop: 24, width: '100%' }} onClick={() => { onSave(list); onClose(); }}>Save Bills</button>
      </div>
    </div>
  );
}

// ── OCR Verification Modal (Elderly Friendly) ─────────────────────
interface OCRData {
  photo: string;
  merchant: string;
  total: number;
  allNumbers: number[];
  sum: number;
}

function OCRVerifyModal({ ocrData, onClose, onConfirm }: {
  ocrData: OCRData;
  onClose: () => void;
  onConfirm: (finalAmount: number, merchant: string, photo: string) => void;
}) {
  const [selectedAmount, setSelectedAmount] = useState(ocrData.total);
  const [merchantName, setMerchantName] = useState(ocrData.merchant);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet" style={{ textAlign: 'center' }}>
        <div className="modal-handle" />
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#30D158', marginBottom: 16 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>check_circle</span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>Scanned Bill Result</span>
        </div>

        {/* Big Amount Display */}
        <div style={{ background: '#232327', borderRadius: 20, padding: '20px 16px', marginBottom: 20, border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 12, color: '#8E8E93', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Auto-Detected Total</div>
          <div style={{ fontSize: 42, fontWeight: 800, color: '#30D158', letterSpacing: '-1px' }}>
            ₹{selectedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <input
            className="form-input"
            style={{ marginTop: 14, textAlign: 'center', fontWeight: 700, fontSize: 15 }}
            value={merchantName}
            onChange={e => setMerchantName(e.target.value)}
            placeholder="Store / Receipt Title"
          />
        </div>

        {/* Alternative detected numbers for elderly users */}
        {ocrData.allNumbers.length > 0 && (
          <div style={{ marginBottom: 20, textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8E8E93', marginBottom: 10 }}>Tap to Select Found Amount:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ocrData.sum > 0 && ocrData.allNumbers.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSelectedAmount(ocrData.sum)}
                  style={{
                    background: selectedAmount === ocrData.sum ? '#30D158' : '#232327',
                    color: selectedAmount === ocrData.sum ? '#000' : '#FFF',
                    border: '1px solid rgba(255,255,255,0.1)',
                    padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer'
                  }}>
                  ➕ Sum All: ₹{ocrData.sum}
                </button>
              )}
              {ocrData.allNumbers.map((num, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedAmount(num)}
                  style={{
                    background: selectedAmount === num ? '#30D158' : '#232327',
                    color: selectedAmount === num ? '#000' : '#FFF',
                    border: '1px solid rgba(255,255,255,0.1)',
                    padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer'
                  }}>
                  ₹{num}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          className="btn-primary"
          style={{ background: '#30D158', color: '#000', fontSize: 16, fontWeight: 800, padding: 18 }}
          onClick={() => onConfirm(selectedAmount, merchantName, ocrData.photo)}>
          Confirm & Log Expense
        </button>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────
export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [tab, setTab] = useState<'home'|'tx'|'insights'|'settings'>('home');
  const [transactions, setTx] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ currency: 'INR', userName: 'User', monthlyBudget: 50000, hasCompletedOnboarding: false, theme: 'light' });
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

  const showToast = (msg: string, type?: 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const reload = useCallback(() => {
    setTx(getTransactions()); setSettings(getSettings());
    setQuick(getQuickExpenses()); setBills(getBills());
  }, []);

  useEffect(() => { initDB(); reload(); }, [reload]);

  useEffect(() => {
    // Always default to light unless explicitly set to dark
    const stored = getSettings();
    const theme = stored.theme || 'light';
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [settings.theme]);

  const frequentTxs = useMemo(() => {
    const counts: Record<string, { tx: Transaction, count: number }> = {};
    transactions.forEach(t => {
      if (t.type !== 'expense') return;
      const key = `${t.merchant.toLowerCase().trim()}_${t.amount}`;
      if (!counts[key]) counts[key] = { tx: t, count: 0 };
      counts[key].count++;
    });
    return Object.values(counts)
      .filter(x => x.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(x => ({
        id: x.tx.id,
        name: x.tx.merchant,
        amount: x.tx.amount,
        emoji: x.tx.categoryIcon,
        categoryId: x.tx.categoryId
      }));
  }, [transactions]);

  const handleSave = (tx: Transaction) => {
    if (editTx) { updateTransaction(tx); showToast('Updated'); }
    else { saveTransaction(tx); showToast(`Logged ${tx.categoryName}`); }
    setShowAdd(false); setEditTx(null); reload();
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
      console.log('Camera/OCR error', e);
      setIsScanning(false);
      showToast('Camera error or cancelled', 'error');
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
    const cat = getAllCategories().find(c => c.id === q.categoryId)!;
    saveTransaction({
      id: uuid(), type: 'expense', amount: q.amount,
      categoryId: q.categoryId, categoryName: cat.name, categoryIcon: cat.icon,
      merchant: q.name, description: q.name, date: new Date().toISOString(),
      paymentMethod: 'Cash', notes: '', createdAt: new Date().toISOString(),
    });
    showToast(`Logged ${q.name} · ${formatCurrency(q.amount)}`);
    reload();
  };

  return (
    <div className="app">
      {/* Splash renders INSIDE .app so it respects 480px width */}
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {!showSplash && (
        <>
          {tab === 'home' && <HomeScreen onAdd={(prefill) => { setAddPrefill(prefill); setShowAdd(true); }} onNav={setTab} transactions={transactions} settings={settings} quickExpenses={quickExpenses.length > 0 ? quickExpenses : frequentTxs} bills={bills} onQuickAdd={handleQuickAdd} onTxTap={setViewTx} onManageQuick={() => setShowManageQuick(true)} />}
          {tab === 'tx' && <ActivityScreen transactions={transactions} onTxTap={setViewTx} />}
          {tab === 'insights' && <InsightsScreen transactions={transactions} settings={settings} />}
          {tab === 'settings' && <SettingsScreen settings={settings} onUpdate={s => { saveSettings(s); reload(); showToast('Saved'); }} onClearData={() => { if(confirm('Clear?')){ clearAllData(); initDB(); reload(); showToast('Cleared'); } }} onManageQuick={() => setShowManageQuick(true)} onManageBills={() => setShowManageBills(true)} />}

          <nav className="floating-bottom-nav">
            <div className={`floating-nav-item ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}>
              <span className="material-symbols-outlined">home</span>
              <span className="floating-nav-label">Home</span>
            </div>
            <div className={`floating-nav-item ${tab === 'insights' ? 'active' : ''}`} onClick={() => setTab('insights')}>
              <span className="material-symbols-outlined">grid_view</span>
              <span className="floating-nav-label">Dashboard</span>
            </div>
            
            <button className="floating-ocr-btn-nav" onClick={handleOCRCamera} title="Scan Receipt/Bill Photo">
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#000' }}>photo_camera</span>
            </button>
            
            <div className={`floating-nav-item ${tab === 'tx' ? 'active' : ''}`} onClick={() => setTab('tx')}>
              <span className="material-symbols-outlined">calendar_today</span>
              <span className="floating-nav-label">Calendar</span>
            </div>
            <div className={`floating-nav-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
              <span className="material-symbols-outlined">tune</span>
              <span className="floating-nav-label">Settings</span>
            </div>
          </nav>

          {ocrData && <OCRVerifyModal ocrData={ocrData} onClose={() => setOcrData(null)} onConfirm={handleOCRConfirm} />}
          {showAdd && <AddModal onClose={() => { setShowAdd(false); setEditTx(null); setAddPrefill(undefined); }} onSave={handleSave} prefill={editTx || addPrefill} />}
          {viewTx && <TxDetailModal tx={viewTx} onClose={() => setViewTx(null)} onDelete={id => { deleteTransaction(id); showToast('Deleted', 'error'); reload(); }} onEdit={tx => { setViewTx(null); setEditTx(tx); setAddPrefill(undefined); setShowAdd(true); }} />}
          {showManageQuick && <ManageQuickAddsModal onClose={() => setShowManageQuick(false)} quickAdds={quickExpenses} onSave={(adds) => { saveQuickExpenses(adds); reload(); showToast('Shortcuts Saved'); }} />}
          {showManageBills && <ManageBillsModal onClose={() => setShowManageBills(false)} bills={bills} onSave={(b) => { saveBills(b); reload(); showToast('Bills Saved'); }} />}
          {toast && <Toast msg={toast.msg} type={toast.type} />}
          
          {isScanning && (
            <div className="modal-overlay" style={{ zIndex: 999 }}>
              <div style={{ background: '#18181A', padding: 32, borderRadius: 24, textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="material-symbols-outlined" style={{ fontSize: 48, color: '#30D158', animation: 'pulse 1s infinite alternate' }}>document_scanner</div>
                <div style={{ marginTop: 16, fontSize: 18, fontWeight: 700, color: '#FFF' }}>Scanning Receipt...</div>
                <div style={{ color: '#8E8E93', marginTop: 4, fontSize: 14 }}>Parsing total amount & store name</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

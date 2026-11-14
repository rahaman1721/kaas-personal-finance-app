import { describe, it, expect } from 'vitest';
import { analyseNumbers, extractNumbers } from '../lib/ocr';
import { nextDueDate } from '../lib/bills';
import { addMonths } from '../lib/dates';
import { formatCompact, formatCurrency, parseAmount, parseSnapshot } from '../db';
import { csvCell } from '../lib/files';

describe('OCR number analysis', () => {
  it('extracts grouped and decimal amounts, skipping years', () => {
    expect(extractNumbers('Rice 1,250.50\n80\n2026\n80')).toEqual([1250.5, 80]);
  });
  it('picks the number equal to the sum of the others as total', () => {
    expect(analyseNumbers([40, 60, 25, 125])).toMatchObject({ suggestedTotal: 125, reason: 'sum-of-others' });
  });
  it('falls back to the largest number', () => {
    expect(analyseNumbers([40, 60, 500]).suggestedTotal).toBe(500);
    expect(analyseNumbers([]).reason).toBe('none');
  });
});

describe('bills and dates', () => {
  it('advances monthly bills without overflowing short months', () => {
    expect(nextDueDate(new Date(2026, 0, 31), 'monthly')?.getMonth()).toBe(1);
    expect(addMonths(new Date(2026, 0, 31), 1).getDate()).toBe(28);
  });
  it('returns null for one-time bills', () => {
    expect(nextDueDate(new Date(), 'once')).toBeNull();
  });
});

describe('formatting and parsing', () => {
  it('parses typed amounts strictly', () => {
    expect(parseAmount('1,200.5')).toBe(1200.5);
    expect(Number.isNaN(parseAmount('12abc'))).toBe(true);
    expect(Number.isNaN(parseAmount(''))).toBe(true);
  });
  it('compacts rupee figures', () => {
    expect(formatCompact(1500)).toBe('1.5k');
    expect(formatCompact(250000)).toBe('2.5L');
    expect(formatCurrency(1234.5)).toBe('₹1,234.5');
  });
  it('neutralises spreadsheet formulas in CSV', () => {
    expect(csvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`);
    expect(csvCell('a "b"')).toBe('"a ""b"""');
  });
  it('rejects malformed backups and normalises valid ones', () => {
    expect(parseSnapshot('nope').ok).toBe(false);
    expect(parseSnapshot('{"x":1}').ok).toBe(false);
    const ok = parseSnapshot(JSON.stringify({ transactions: [{ id: 'a', amount: '50', type: 'expense', date: '2026-01-01' }, { id: 'bad', amount: -1 }] }));
    expect(ok.ok && ok.counts.transactions).toBe(1);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { formatCurrency, saveTransaction, getTransactions, clearAllData, Transaction } from '../db';

describe('Database & Currency Formatting Unit Tests', () => {
  beforeEach(() => {
    clearAllData();
  });

  it('formats positive currency correctly in INR', () => {
    expect(formatCurrency(1500)).toBe('₹1,500');
    expect(formatCurrency(0)).toBe('₹0');
  });

  it('formats negative currency correctly', () => {
    expect(formatCurrency(-250)).toBe('-₹250');
  });

  it('saves and retrieves transactions in descending order', () => {
    const tx1: Transaction = {
      id: 'tx-1',
      type: 'expense',
      amount: 100,
      categoryId: 'food',
      categoryName: 'Food & Dining',
      categoryIcon: 'restaurant',
      merchant: 'Cafe',
      date: '2026-10-14T10:00:00Z',
      paymentMethod: 'UPI',
      createdAt: '2026-10-14T10:00:00Z',
    };

    const tx2: Transaction = {
      id: 'tx-2',
      type: 'income',
      amount: 500,
      categoryId: 'salary',
      categoryName: 'Salary',
      categoryIcon: 'payments',
      merchant: 'Company',
      date: '2026-10-14T11:00:00Z',
      paymentMethod: 'Bank Transfer',
      createdAt: '2026-10-14T11:00:00Z',
    };

    saveTransaction(tx1);
    saveTransaction(tx2);

    const txs = getTransactions();
    expect(txs.length).toBe(2);
    expect(txs[0].id).toBe('tx-2'); // Most recent first
    expect(txs[1].id).toBe('tx-1');
  });
});

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { api, setToken } from '../src/services/api.js';

if (typeof globalThis.localStorage === 'undefined') {
  const store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => {
      store[key] = String(val);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
  };
}

describe('Bulk Operations & Alerts API Client Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('1. Catalogue CSV Import: posts CSV payload and parses success/error rows (POST /items/import)', async () => {
    setToken('librarian-test-jwt');

    const mockImportResponse = {
      message: 'CSV import completed: 2 item(s) imported successfully, 1 row(s) failed.',
      totalRows: 3,
      successfulRows: 2,
      failedRows: 1,
      successfulItems: [
        { id: 1, title: 'Item 1', category: 'Photography', identifyingCode: 'CAM-001' },
        { id: 2, title: 'Item 2', category: 'Photography', identifyingCode: 'CAM-002' },
      ],
      errors: [
        { row: 4, identifyingCode: 'CAM-003', error: "An item with identifying code 'CAM-003' already exists." },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith('/items/import'));
      assert.strictEqual(options.method, 'POST');
      assert.strictEqual(options.headers['Authorization'], 'Bearer librarian-test-jwt');
      const body = JSON.parse(options.body);
      assert.ok(body.csv.includes('title,category,identifyingCode'));
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => mockImportResponse,
      };
    };

    try {
      const csvData = 'title,category,identifyingCode\nItem 1,Photography,CAM-001\nItem 2,Photography,CAM-002\nItem 3,Photography,CAM-003';
      const result = await api.post('/items/import', { csv: csvData });
      assert.strictEqual(result.totalRows, 3);
      assert.strictEqual(result.successfulRows, 2);
      assert.strictEqual(result.failedRows, 1);
      assert.strictEqual(result.errors[0].row, 4);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('2. Bulk Loan Return: sends array of loan IDs and parses results (POST /loans/bulk-return)', async () => {
    setToken('librarian-test-jwt');

    const mockBulkResponse = {
      message: 'Bulk return completed: 2 returned, 1 failed.',
      total: 3,
      successful: 2,
      failed: 1,
      returnedLoans: [
        { loanId: 10, status: 'RETURNED' },
        { loanId: 11, status: 'RETURNED' },
      ],
      errors: [
        { loanId: 12, error: 'Loan with ID 12 is in REQUESTED state. Only ISSUED loans can be returned.' },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith('/loans/bulk-return'));
      assert.strictEqual(options.method, 'POST');
      const body = JSON.parse(options.body);
      assert.deepStrictEqual(body.loanIds, [10, 11, 12]);
      assert.strictEqual(body.note, 'Batch return note');
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => mockBulkResponse,
      };
    };

    try {
      const result = await api.post('/loans/bulk-return', {
        loanIds: [10, 11, 12],
        note: 'Batch return note',
      });
      assert.strictEqual(result.total, 3);
      assert.strictEqual(result.successful, 2);
      assert.strictEqual(result.failed, 1);
      assert.strictEqual(result.returnedLoans[0].status, 'RETURNED');
      assert.strictEqual(result.errors[0].loanId, 12);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('3. Overdue Alerts: fetches overdue alerts with filters (GET /loans/overdue)', async () => {
    setToken('librarian-test-jwt');

    const mockOverdueResponse = {
      total: 2,
      overdueLoans: [
        {
          id: 1,
          itemId: 10,
          borrowerId: 3,
          status: 'ISSUED',
          isOverdue: true,
          dueDate: '2026-08-01T00:00:00Z',
          item: { title: 'Camera', identifyingCode: 'CAM-01', category: 'Photography' },
          borrower: { email: 'borrower@test.com' },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.ok(url.includes('/loans/overdue'));
      assert.ok(url.includes('category=Photography'));
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => mockOverdueResponse,
      };
    };

    try {
      const result = await api.get('/loans/overdue?category=Photography');
      assert.strictEqual(result.total, 2);
      assert.strictEqual(result.overdueLoans[0].isOverdue, true);
      assert.strictEqual(result.overdueLoans[0].item.title, 'Camera');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

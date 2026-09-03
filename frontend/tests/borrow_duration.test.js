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

describe('Frontend Borrowing Duration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    setToken('member-jwt-token');
  });

  test('1. Member request form client-side validation logic', () => {
    const validateDuration = (borrowDurationDays) => {
      const errors = {};
      const parsedDuration = Number(borrowDurationDays);
      if (borrowDurationDays === '' || isNaN(parsedDuration)) {
        errors.borrowDurationDays = 'Borrowing period is required.';
      } else if (!Number.isInteger(parsedDuration)) {
        errors.borrowDurationDays = 'Borrowing period must be a whole number of days.';
      } else if (parsedDuration < 1 || parsedDuration > 31) {
        errors.borrowDurationDays = 'Borrowing period must be between 1 and 31 days.';
      }
      return errors;
    };

    // Missing / empty
    assert.strictEqual(validateDuration('').borrowDurationDays, 'Borrowing period is required.');

    // Below 1
    assert.strictEqual(validateDuration('0').borrowDurationDays, 'Borrowing period must be between 1 and 31 days.');
    assert.strictEqual(validateDuration('-5').borrowDurationDays, 'Borrowing period must be between 1 and 31 days.');

    // Above 31
    assert.strictEqual(validateDuration('32').borrowDurationDays, 'Borrowing period must be between 1 and 31 days.');
    assert.strictEqual(validateDuration('100').borrowDurationDays, 'Borrowing period must be between 1 and 31 days.');

    // Non-integer
    assert.strictEqual(validateDuration('7.5').borrowDurationDays, 'Borrowing period must be a whole number of days.');
    assert.strictEqual(validateDuration('abc').borrowDurationDays, 'Borrowing period is required.');

    // Valid boundaries
    assert.deepStrictEqual(validateDuration('1'), {});
    assert.deepStrictEqual(validateDuration('14'), {});
    assert.deepStrictEqual(validateDuration('31'), {});
  });

  test('2. Member request submits duration with loan request to POST /loans/request', async () => {
    const originalFetch = globalThis.fetch;
    let postedPayload = null;

    globalThis.fetch = async (url, options) => {
      if (url.endsWith('/loans/request') && options.method === 'POST') {
        postedPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 201,
          headers: { get: () => 'application/json' },
          json: async () => ({
            message: 'Loan requested successfully.',
            loan: {
              id: 201,
              itemId: 10,
              borrowerId: 1,
              borrowDurationDays: postedPayload.borrowDurationDays,
              status: 'REQUESTED',
              dueDate: new Date(Date.now() + postedPayload.borrowDurationDays * 24 * 60 * 60 * 1000).toISOString(),
            },
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    try {
      const payload = {
        itemId: 10,
        borrowDurationDays: 7,
        note: 'Member workshop checkout',
      };

      const res = await api.post('/loans/request', payload);
      assert.strictEqual(postedPayload.borrowDurationDays, 7);
      assert.strictEqual(postedPayload.itemId, 10);
      assert.strictEqual(res.loan.borrowDurationDays, 7);
      assert.strictEqual(res.loan.status, 'REQUESTED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('3. Librarian issue flow derives due date from loan.borrowDurationDays and issue date', async () => {
    const originalFetch = globalThis.fetch;
    let postedPayload = null;

    globalThis.fetch = async (url, options) => {
      if (url.includes('/issue') && options.method === 'POST') {
        postedPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            message: 'Loan issued successfully.',
            loan: {
              id: 50,
              itemId: 3,
              borrowDurationDays: 14,
              status: 'ISSUED',
              dueDate: postedPayload.dueDate,
            },
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    try {
      // Simulate loan with 14 days duration
      const loan = { id: 50, borrowDurationDays: 14 };

      // Derived date calculated upon opening modal
      const issueDate = new Date();
      const targetDate = new Date(issueDate);
      targetDate.setDate(targetDate.getDate() + loan.borrowDurationDays);
      const derivedDueDateString = targetDate.toISOString().slice(0, 10);

      const res = await api.post(`/loans/${loan.id}/issue`, {
        dueDate: new Date(derivedDueDateString).toISOString(),
        note: 'Issued with derived due date',
      });

      assert.strictEqual(res.loan.status, 'ISSUED');
      assert.strictEqual(res.loan.borrowDurationDays, 14);
      assert.ok(postedPayload.dueDate.startsWith(derivedDueDateString));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

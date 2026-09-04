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

describe('Frontend Borrowing Limit (2 Active Items) Error Handling Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    setToken('member-jwt-token');
  });

  test('1. API client preserves and throws 409 borrowing limit error message', async () => {
    const originalFetch = globalThis.fetch;
    const borrowingLimitMsg =
      'You cannot borrow this item because you already have 2 requested or issued items, which is the borrowing limit.';

    globalThis.fetch = async (url, options) => {
      if (url.endsWith('/loans/request') && options.method === 'POST') {
        return {
          ok: false,
          status: 409,
          headers: {
            get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
          },
          json: async () => ({
            error: borrowingLimitMsg,
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    try {
      let caughtError = null;
      try {
        await api.post('/loans/request', { itemId: 1, borrowDurationDays: 14 });
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, 'Expected api.post to throw on 409');
      assert.strictEqual(caughtError.status, 409);
      assert.strictEqual(caughtError.message, borrowingLimitMsg);
      // Ensure it is NOT a generic error message
      assert.ok(!caughtError.message.toLowerCase().includes('request failed with status'));
      assert.ok(!caughtError.message.toLowerCase().includes('item unavailable'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('2. Modal error state correctly captures and displays borrowing limit message without generic fallback', async () => {
    const originalFetch = globalThis.fetch;
    const borrowingLimitMsg =
      'You cannot borrow this item because you already have 2 requested or issued items, which is the borrowing limit.';

    globalThis.fetch = async () => ({
      ok: false,
      status: 409,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({
        error: borrowingLimitMsg,
      }),
    });

    try {
      // Simulate the exact modal handleSubmit catch logic:
      let apiError = '';
      try {
        await api.post('/loans/request', { itemId: 2, borrowDurationDays: 7 });
      } catch (err) {
        const msg = err?.message || (typeof err === 'string' ? err : null);
        apiError = msg || 'An unexpected error occurred while processing the loan.';
      }

      assert.strictEqual(apiError, borrowingLimitMsg);
      assert.ok(apiError.includes('borrowing limit'));
      assert.ok(apiError.includes('2 requested or issued items'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('3. Other 409 errors (item open loan conflict) preserve their specific error reason', async () => {
    const originalFetch = globalThis.fetch;
    const openLoanMsg =
      "Item 'Sony Alpha A7 IV Full-Frame Camera' currently has an open loan (status: ISSUED) and cannot be requested.";

    globalThis.fetch = async () => ({
      ok: false,
      status: 409,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({
        error: openLoanMsg,
      }),
    });

    try {
      let apiError = '';
      try {
        await api.post('/loans/request', { itemId: 1, borrowDurationDays: 14 });
      } catch (err) {
        const msg = err?.message || (typeof err === 'string' ? err : null);
        apiError = msg || 'An unexpected error occurred while processing the loan.';
      }

      assert.strictEqual(apiError, openLoanMsg);
      assert.ok(apiError.includes('currently has an open loan'));
      assert.ok(!apiError.includes('borrowing limit'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('4. Other 409 errors (archived item conflict) preserve their specific error reason', async () => {
    const originalFetch = globalThis.fetch;
    const archivedMsg = "Cannot request archived item 'Vintage Film Projector 16mm (Retired)'.";

    globalThis.fetch = async () => ({
      ok: false,
      status: 409,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({
        error: archivedMsg,
      }),
    });

    try {
      let apiError = '';
      try {
        await api.post('/loans/request', { itemId: 9, borrowDurationDays: 14 });
      } catch (err) {
        const msg = err?.message || (typeof err === 'string' ? err : null);
        apiError = msg || 'An unexpected error occurred while processing the loan.';
      }

      assert.strictEqual(apiError, archivedMsg);
      assert.ok(apiError.includes('Cannot request archived item'));
      assert.ok(!apiError.includes('borrowing limit'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('5. Successful loan request succeeds with 201 Created and does not trigger error banner', async () => {
    const originalFetch = globalThis.fetch;
    const mockLoan = {
      id: 55,
      itemId: 3,
      borrowerId: 2,
      borrowDurationDays: 14,
      status: 'REQUESTED',
    };

    globalThis.fetch = async () => ({
      ok: true,
      status: 201,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({
        message: 'Loan requested successfully.',
        loan: mockLoan,
      }),
    });

    try {
      let apiError = '';
      let result = null;
      try {
        result = await api.post('/loans/request', { itemId: 3, borrowDurationDays: 14 });
      } catch (err) {
        const msg = err?.message || (typeof err === 'string' ? err : null);
        apiError = msg || 'An unexpected error occurred while processing the loan.';
      }

      assert.strictEqual(apiError, '');
      assert.deepStrictEqual(result.loan, mockLoan);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

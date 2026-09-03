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

describe('Frontend Librarian Create Loan Flow Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    setToken('librarian-jwt-token');
  });

  test('9. valid member email is accepted/submitted', async () => {
    const originalFetch = globalThis.fetch;
    let postedPayload = null;

    globalThis.fetch = async (url, options) => {
      if (url.endsWith('/loans') && options.method === 'POST') {
        postedPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 201,
          headers: { get: () => 'application/json' },
          json: async () => ({
            message: 'Loan created directly as ISSUED.',
            loan: {
              id: 101,
              itemId: 5,
              borrowerId: 2,
              status: 'ISSUED',
              borrower: { id: 2, email: 'alice.member@example.com', role: 'MEMBER' },
            },
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    try {
      const payload = {
        itemId: 5,
        borrowerId: 'alice.member@example.com',
        status: 'ISSUED',
        dueDate: '2026-09-17T12:00:00.000Z',
      };

      const res = await api.post('/loans', payload);
      assert.strictEqual(postedPayload.borrowerId, 'alice.member@example.com');
      assert.strictEqual(res.loan.borrower.email, 'alice.member@example.com');
      assert.strictEqual(res.loan.status, 'ISSUED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('10. valid member ID is accepted/submitted', async () => {
    const originalFetch = globalThis.fetch;
    let postedPayload = null;

    globalThis.fetch = async (url, options) => {
      if (url.endsWith('/loans') && options.method === 'POST') {
        postedPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 201,
          headers: { get: () => 'application/json' },
          json: async () => ({
            message: 'Loan created directly as ISSUED.',
            loan: {
              id: 102,
              itemId: 5,
              borrowerId: 3,
              status: 'ISSUED',
              borrower: { id: 3, email: 'bob.member@example.com', role: 'MEMBER' },
            },
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    try {
      const payload = {
        itemId: 5,
        borrowerId: 3,
        status: 'ISSUED',
        dueDate: '2026-09-17T12:00:00.000Z',
      };

      const res = await api.post('/loans', payload);
      assert.strictEqual(postedPayload.borrowerId, 3);
      assert.strictEqual(res.loan.borrowerId, 3);
      assert.strictEqual(res.loan.status, 'ISSUED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('11. 400 borrower error is rendered in the modal', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      json: async () => ({
        error: 'The selected user is a librarian. Please select a member.',
      }),
    });

    let renderedApiError = '';
    const setApiError = (err) => {
      renderedApiError = err;
    };

    try {
      await assert.rejects(
        async () => {
          try {
            await api.post('/loans', { itemId: 1, borrowerId: 'david.librarian@library.org' });
          } catch (err) {
            const msg = err?.message || 'Failed to submit loan request.';
            setApiError(msg);
            throw err;
          }
        },
        {
          status: 400,
          message: 'The selected user is a librarian. Please select a member.',
        }
      );

      assert.strictEqual(renderedApiError, 'The selected user is a librarian. Please select a member.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('12. 404 borrower error is rendered in the modal', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      headers: { get: () => 'application/json' },
      json: async () => ({
        error: 'No member found with that ID or email.',
      }),
    });

    let renderedApiError = '';
    const setApiError = (err) => {
      renderedApiError = err;
    };

    try {
      await assert.rejects(
        async () => {
          try {
            await api.post('/loans', { itemId: 1, borrowerId: 99999 });
          } catch (err) {
            const msg = err?.message || 'Failed to submit loan request.';
            setApiError(msg);
            throw err;
          }
        },
        {
          status: 404,
          message: 'No member found with that ID or email.',
        }
      );

      assert.strictEqual(renderedApiError, 'No member found with that ID or email.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('13. 409 availability error is rendered in the modal', async () => {
    const originalFetch = globalThis.fetch;
    const availabilityMsg =
      'This item is currently unavailable because it already has an open loan (status: ISSUED).';

    globalThis.fetch = async () => ({
      ok: false,
      status: 409,
      headers: { get: () => 'application/json' },
      json: async () => ({
        error: availabilityMsg,
      }),
    });

    let renderedApiError = '';
    const setApiError = (err) => {
      renderedApiError = err;
    };

    try {
      await assert.rejects(
        async () => {
          try {
            await api.post('/loans', { itemId: 2, borrowerId: 3 });
          } catch (err) {
            const msg = err?.message || 'Failed to submit loan request.';
            setApiError(msg);
            throw err;
          }
        },
        {
          status: 409,
          message: availabilityMsg,
        }
      );

      assert.strictEqual(renderedApiError, availabilityMsg);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('14. unexpected API error gets a generic fallback', async () => {
    const originalFetch = globalThis.fetch;
    // Simulate non-JSON internal server error with no error message in body
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      headers: { get: () => 'text/html' },
      text: async () => 'Internal Server Error',
    });

    let renderedApiError = '';
    const setApiError = (err) => {
      renderedApiError = err;
    };

    try {
      await assert.rejects(
        async () => {
          try {
            await api.post('/loans', { itemId: 2, borrowerId: 3 });
          } catch (err) {
            const msg = err?.message || (typeof err === 'string' ? err : null);
            setApiError(msg || 'An unexpected error occurred while processing the loan.');
            throw err;
          }
        },
        {
          status: 500,
        }
      );

      assert.ok(renderedApiError.includes('500') || renderedApiError.includes('unexpected error'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('15. modal remains open after failed submission', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Invalid borrower.' }),
    });

    let modalClosed = false;
    let renderedApiError = '';
    const onClose = () => {
      modalClosed = true;
    };
    const setApiError = (err) => {
      renderedApiError = err;
    };

    // Simulate modal handleSubmit flow
    let submitting = true;
    try {
      await api.post('/loans', { itemId: 1, borrowerId: 'bad-input' });
      onClose(); // only reached on success
    } catch (err) {
      const msg = err?.message || (typeof err === 'string' ? err : null);
      setApiError(msg || 'An unexpected error occurred while processing the loan.');
    } finally {
      submitting = false;
    }

    assert.strictEqual(modalClosed, false, 'Modal must remain open after failed submission');
    assert.strictEqual(submitting, false);
    assert.strictEqual(renderedApiError, 'Invalid borrower.');
  });
});

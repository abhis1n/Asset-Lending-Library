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

describe('Loan API Client Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('1. Fetches loans with query parameters and pagination (GET /loans)', async () => {
    setToken('librarian-test-jwt');

    const mockResponse = {
      loans: [
        {
          id: 1,
          itemId: 10,
          borrowerId: 2,
          status: 'ISSUED',
          isOverdue: true,
          requestedAt: '2026-08-01T10:00:00.000Z',
          dueDate: '2026-08-15T10:00:00.000Z',
          item: { id: 10, title: 'Sony Alpha', category: 'Photography', identifyingCode: 'CAM-001' },
          borrower: { id: 2, email: 'alice.member@example.com', role: 'MEMBER' },
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.ok(url.includes('/loans?'));
      assert.ok(url.includes('status=ISSUED'));
      assert.ok(url.includes('overdue=true'));
      assert.strictEqual(options.headers['Authorization'], 'Bearer librarian-test-jwt');
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => mockResponse,
      };
    };

    try {
      const data = await api.get('/loans?page=1&pageSize=20&status=ISSUED&overdue=true');
      assert.strictEqual(data.loans.length, 1);
      assert.strictEqual(data.loans[0].isOverdue, true);
      assert.strictEqual(data.loans[0].status, 'ISSUED');
      assert.strictEqual(data.pagination.totalItems, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('2. Member submits a loan request (POST /loans/request)', async () => {
    setToken('member-jwt');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith('/loans/request'));
      assert.strictEqual(options.method, 'POST');
      const body = JSON.parse(options.body);
      assert.strictEqual(body.itemId, 5);
      assert.strictEqual(body.note, 'For biology field assignment');
      return {
        ok: true,
        status: 201,
        headers: { get: () => 'application/json' },
        json: async () => ({
          message: 'Loan request submitted successfully.',
          loan: { id: 100, itemId: 5, borrowerId: 3, status: 'REQUESTED', isOverdue: false },
        }),
      };
    };

    try {
      const data = await api.post('/loans/request', {
        itemId: 5,
        note: 'For biology field assignment',
      });
      assert.strictEqual(data.loan.id, 100);
      assert.strictEqual(data.loan.status, 'REQUESTED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('3. Librarian creates a loan directly (POST /loans)', async () => {
    setToken('librarian-test-jwt');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith('/loans'));
      assert.strictEqual(options.method, 'POST');
      const body = JSON.parse(options.body);
      assert.strictEqual(body.itemId, 8);
      assert.strictEqual(body.borrowerId, 4);
      assert.strictEqual(body.status, 'ISSUED');
      return {
        ok: true,
        status: 201,
        headers: { get: () => 'application/json' },
        json: async () => ({
          message: 'Loan created successfully.',
          loan: { id: 101, itemId: 8, borrowerId: 4, status: 'ISSUED', isOverdue: false },
        }),
      };
    };

    try {
      const data = await api.post('/loans', {
        itemId: 8,
        borrowerId: 4,
        status: 'ISSUED',
      });
      assert.strictEqual(data.loan.id, 101);
      assert.strictEqual(data.loan.status, 'ISSUED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('4. Transitions loan status: Issue, Return, and Mark Lost', async () => {
    setToken('librarian-test-jwt');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.strictEqual(options.method, 'POST');
      if (url.endsWith('/loans/1/issue')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            message: 'Loan issued successfully.',
            loan: { id: 1, status: 'ISSUED', isOverdue: false },
          }),
        };
      }
      if (url.endsWith('/loans/1/return')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            message: 'Loan returned successfully.',
            loan: { id: 1, status: 'RETURNED', isOverdue: false },
          }),
        };
      }
      if (url.endsWith('/loans/1/lost')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            message: 'Loan marked as lost successfully.',
            loan: { id: 1, status: 'LOST', isOverdue: false },
          }),
        };
      }
      throw new Error('Unexpected URL ' + url);
    };

    try {
      const issueRes = await api.post('/loans/1/issue', { note: 'Issued with strap' });
      assert.strictEqual(issueRes.loan.status, 'ISSUED');

      const returnRes = await api.post('/loans/1/return', { note: 'Returned clean' });
      assert.strictEqual(returnRes.loan.status, 'RETURNED');

      const lostRes = await api.post('/loans/1/lost', { note: 'Missing in transit' });
      assert.strictEqual(lostRes.loan.status, 'LOST');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('5. Fetches loan timeline audit history (GET /loans/:id/history)', async () => {
    setToken('member-jwt');

    const mockHistoryResponse = {
      loanId: 1,
      total: 2,
      history: [
        { id: 10, loanId: 1, type: 'REQUESTED', createdAt: '2026-08-01T10:00:00Z', note: null, actor: { id: 2, email: 'member@test.com', role: 'MEMBER' } },
        { id: 11, loanId: 1, type: 'ISSUED', createdAt: '2026-08-02T10:00:00Z', note: 'Standard checkout', actor: { id: 1, email: 'librarian@test.com', role: 'LIBRARIAN' } },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.ok(url.endsWith('/loans/1/history'));
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => mockHistoryResponse,
      };
    };

    try {
      const data = await api.get('/loans/1/history');
      assert.strictEqual(data.history.length, 2);
      assert.strictEqual(data.history[0].type, 'REQUESTED');
      assert.strictEqual(data.history[1].type, 'ISSUED');
      assert.strictEqual(data.history[1].actor.email, 'librarian@test.com');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('6. Due date validation rejects missing, past, and same-date values', async () => {
    const { validateLoanDueDate } = await import('../src/utils/dateUtils.js');

    const fixedIssueDate = new Date('2026-09-03T12:00:00.000Z');

    // Missing
    const resEmpty = validateLoanDueDate('', fixedIssueDate);
    assert.strictEqual(resEmpty.isValid, false);
    assert.ok(resEmpty.error.includes('required'));

    // Past date
    const resPast = validateLoanDueDate('2026-09-01', fixedIssueDate);
    assert.strictEqual(resPast.isValid, false);
    assert.ok(resPast.error.includes('strictly after'));

    // Same date
    const resSame = validateLoanDueDate('2026-09-03', fixedIssueDate);
    assert.strictEqual(resSame.isValid, false);
    assert.ok(resSame.error.includes('strictly after') || resSame.error.includes('same date'));
  });

  test('7. Due date validation accepts next day and 1 month boundary, rejects over 1 month', async () => {
    const { validateLoanDueDate } = await import('../src/utils/dateUtils.js');

    const fixedIssueDate = new Date('2026-09-03T12:00:00.000Z');

    // Next day (strictly after)
    const resNext = validateLoanDueDate('2026-09-04', fixedIssueDate);
    assert.strictEqual(resNext.isValid, true);

    // 1 month boundary (2026-10-03)
    const resMonth = validateLoanDueDate('2026-10-03', fixedIssueDate);
    assert.strictEqual(resMonth.isValid, true);

    // Over 1 month (2026-10-04)
    const resOver = validateLoanDueDate('2026-10-04', fixedIssueDate);
    assert.strictEqual(resOver.isValid, false);
    assert.ok(resOver.error.includes('1 month'));
  });

  test('8. getLoanDueDateLimits correctly calculates min and max date strings', async () => {
    const { getLoanDueDateLimits } = await import('../src/utils/dateUtils.js');

    const fixedIssueDate = new Date('2026-09-03T12:00:00.000Z');
    const limits = getLoanDueDateLimits(fixedIssueDate);

    assert.strictEqual(limits.minDateString, '2026-09-04');
    assert.strictEqual(limits.maxDateString, '2026-10-03');
  });
});

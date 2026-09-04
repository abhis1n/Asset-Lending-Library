import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { api, setToken, removeToken } from '../src/services/api.js';

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

describe('Dashboard API Client Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('1. Fetches dashboard metrics successfully with correct structure', async () => {
    setToken('librarian-test-jwt');

    const mockDashboardResponse = {
      catalogue: { total: 100, active: 90, archived: 10 },
      loans: { requested: 5, issued: 20, returned: 60, lost: 5, open: 25 },
      overdue: { total: 4, nonOverdueIssued: 16 },
      weeklyReturns: [
        { weekStart: '2026-07-13T00:00:00.000Z', weekEnd: '2026-07-20T00:00:00.000Z', label: 'Jul 13', count: 1, isCurrentWeek: false },
        { weekStart: '2026-07-20T00:00:00.000Z', weekEnd: '2026-07-27T00:00:00.000Z', label: 'Jul 20', count: 1, isCurrentWeek: false },
        { weekStart: '2026-07-27T00:00:00.000Z', weekEnd: '2026-08-03T00:00:00.000Z', label: 'Jul 27', count: 1, isCurrentWeek: false },
        { weekStart: '2026-08-03T00:00:00.000Z', weekEnd: '2026-08-10T00:00:00.000Z', label: 'Aug 3', count: 1, isCurrentWeek: false },
        { weekStart: '2026-08-10T00:00:00.000Z', weekEnd: '2026-08-17T00:00:00.000Z', label: 'Aug 10', count: 0, isCurrentWeek: false },
        { weekStart: '2026-08-17T00:00:00.000Z', weekEnd: '2026-08-24T00:00:00.000Z', label: 'Aug 17', count: 2, isCurrentWeek: false },
        { weekStart: '2026-08-24T00:00:00.000Z', weekEnd: '2026-08-31T00:00:00.000Z', label: 'Aug 24', count: 1, isCurrentWeek: false },
        { weekStart: '2026-08-31T00:00:00.000Z', weekEnd: '2026-09-07T00:00:00.000Z', label: 'Aug 31', count: 1, isCurrentWeek: true },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith('/dashboard'));
      assert.strictEqual(options.headers['Authorization'], 'Bearer librarian-test-jwt');
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
        },
        json: async () => mockDashboardResponse,
      };
    };

    try {
      const data = await api.get('/dashboard');
      assert.strictEqual(data.catalogue.total, 100);
      assert.strictEqual(data.catalogue.active, 90);
      assert.strictEqual(data.catalogue.archived, 10);
      assert.strictEqual(data.loans.open, 25);
      assert.strictEqual(data.loans.requested, 5);
      assert.strictEqual(data.loans.issued, 20);
      assert.strictEqual(data.loans.returned, 60);
      assert.strictEqual(data.loans.lost, 5);
      assert.strictEqual(data.overdue.total, 4);
      assert.strictEqual(data.overdue.nonOverdueIssued, 16);
      assert.ok(Array.isArray(data.weeklyReturns));
      assert.strictEqual(data.weeklyReturns.length, 8);
      assert.strictEqual(data.weeklyReturns[4].count, 0); // Zero return week verified
      assert.strictEqual(data.weeklyReturns[7].isCurrentWeek, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('2. Handles dashboard API error response properly', async () => {
    setToken('member-token');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({ error: 'Forbidden: Librarian role required.' }),
    });

    try {
      await assert.rejects(
        async () => {
          await api.get('/dashboard');
        },
        {
          message: 'Forbidden: Librarian role required.',
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

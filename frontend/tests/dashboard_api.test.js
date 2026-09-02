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

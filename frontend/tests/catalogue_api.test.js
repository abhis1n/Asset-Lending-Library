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

describe('Catalogue API Client Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('1. Fetches active catalogue items (GET /items)', async () => {
    setToken('librarian-test-jwt');

    const mockItems = [
      { id: 1, title: 'Sony Camera', category: 'Photography', identifyingCode: 'CAM-001', archived: false, custodians: [] },
      { id: 2, title: 'Tripod Pro', category: 'Photography', identifyingCode: 'TRIPOD-001', archived: false, custodians: [] },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith('/items'));
      assert.strictEqual(options.headers['Authorization'], 'Bearer librarian-test-jwt');
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ items: mockItems, total: 2 }),
      };
    };

    try {
      const data = await api.get('/items');
      assert.strictEqual(data.items.length, 2);
      assert.strictEqual(data.items[0].title, 'Sony Camera');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('2. Creates a new catalogue item (POST /items)', async () => {
    setToken('librarian-test-jwt');

    const newItemPayload = {
      title: 'Multimeter Fluke 87V',
      category: 'Electronics',
      identifyingCode: 'TOOL-MM-001',
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith('/items'));
      assert.strictEqual(options.method, 'POST');
      assert.strictEqual(options.headers['Authorization'], 'Bearer librarian-test-jwt');
      const body = JSON.parse(options.body);
      assert.strictEqual(body.title, 'Multimeter Fluke 87V');
      return {
        ok: true,
        status: 201,
        headers: { get: () => 'application/json' },
        json: async () => ({
          message: 'Catalogue item created successfully.',
          item: { id: 10, ...body, archived: false, custodians: [] },
        }),
      };
    };

    try {
      const data = await api.post('/items', newItemPayload);
      assert.strictEqual(data.item.id, 10);
      assert.strictEqual(data.item.identifyingCode, 'TOOL-MM-001');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('3. Updates a catalogue item (PATCH /items/:id)', async () => {
    setToken('librarian-test-jwt');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith('/items/10'));
      assert.strictEqual(options.method, 'PATCH');
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          message: 'Catalogue item updated successfully.',
          item: { id: 10, title: body.title, category: 'Electronics', identifyingCode: 'TOOL-MM-001', archived: false },
        }),
      };
    };

    try {
      const data = await api.patch('/items/10', { title: 'Updated Multimeter' });
      assert.strictEqual(data.item.title, 'Updated Multimeter');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('4. Archives and Restores a catalogue item (POST /items/:id/archive & restore)', async () => {
    setToken('librarian-test-jwt');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.strictEqual(options.method, 'POST');
      if (url.endsWith('/archive')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ message: 'Catalogue item archived successfully.' }),
        };
      }
      if (url.endsWith('/restore')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ message: 'Catalogue item restored successfully.' }),
        };
      }
      throw new Error('Unexpected URL');
    };

    try {
      const archRes = await api.post('/items/10/archive');
      assert.ok(archRes.message.includes('archived'));

      const restRes = await api.post('/items/10/restore');
      assert.ok(restRes.message.includes('restored'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('5. Assigns and Removes a custodian (POST & DELETE /items/:itemId/custodians/:librarianId)', async () => {
    setToken('librarian-test-jwt');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (options.method === 'POST') {
        assert.ok(url.endsWith('/items/10/custodians/1'));
        return {
          ok: true,
          status: 201,
          headers: { get: () => 'application/json' },
          json: async () => ({ message: 'Custodian assigned successfully.' }),
        };
      }
      if (options.method === 'DELETE') {
        assert.ok(url.endsWith('/items/10/custodians/1'));
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ message: 'Custodian assignment removed successfully.' }),
        };
      }
      throw new Error('Unexpected call');
    };

    try {
      const assignRes = await api.post('/items/10/custodians/1');
      assert.ok(assignRes.message.includes('assigned'));

      const removeRes = await api.delete('/items/10/custodians/1');
      assert.ok(removeRes.message.includes('removed'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  api,
  getToken,
  setToken,
  removeToken,
  setUnauthorizedHandler,
} from '../src/services/api.js';

// Polyfill minimal localStorage & window for Node test environment if needed
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

describe('Frontend API Client Foundation Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    setUnauthorizedHandler(null);
  });

  test('1. Token storage: setToken, getToken, and removeToken', () => {
    assert.strictEqual(getToken(), null);
    setToken('test-jwt-token-123');
    assert.strictEqual(getToken(), 'test-jwt-token-123');
    removeToken();
    assert.strictEqual(getToken(), null);
  });

  test('2. API request attaches Authorization header when token is present', async () => {
    setToken('my-secret-token');

    let interceptedHeaders = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      interceptedHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
        },
        json: async () => ({ success: true }),
      };
    };

    try {
      const data = await api.get('/test-endpoint');
      assert.strictEqual(data.success, true);
      assert.strictEqual(interceptedHeaders['Authorization'], 'Bearer my-secret-token');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('3. API request handles 401 by calling unauthorized handler and throwing', async () => {
    setToken('expired-token');
    let handlerCalled = false;
    setUnauthorizedHandler(() => {
      handlerCalled = true;
      removeToken();
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      headers: { get: () => null },
    });

    try {
      await assert.rejects(
        async () => {
          await api.get('/protected-route');
        },
        {
          message: 'Your session has expired. Please sign in again.',
        }
      );
      assert.strictEqual(handlerCalled, true);
      assert.strictEqual(getToken(), null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('4. API request parses backend error message from JSON response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({ error: 'Invalid identification code.' }),
    });

    try {
      await assert.rejects(
        async () => {
          await api.post('/items', { title: '' });
        },
        {
          message: 'Invalid identification code.',
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('5. API request on login endpoint parses 401 error message without calling unauthorized handler', async () => {
    let handlerCalled = false;
    setUnauthorizedHandler(() => {
      handlerCalled = true;
      removeToken();
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({ error: 'Invalid email or password.' }),
    });

    try {
      await assert.rejects(
        async () => {
          await api.post('/auth/login', { email: 'alice@example.com', password: 'wrong' });
        },
        {
          message: 'Invalid email or password.',
        }
      );
      assert.strictEqual(handlerCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('6. API request on register endpoint succeeds and receives 201 with token', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith('/auth/register'));
      assert.strictEqual(options.method, 'POST');
      const body = JSON.parse(options.body);
      assert.strictEqual(body.email, 'newuser@example.com');
      assert.strictEqual(body.password, 'Password123!');
      return {
        ok: true,
        status: 201,
        headers: {
          get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
        },
        json: async () => ({
          message: 'Sign up successful.',
          token: 'mock-member-jwt',
          user: { id: 10, email: 'newuser@example.com', role: 'MEMBER' },
        }),
      };
    };

    try {
      const res = await api.post('/auth/register', {
        email: 'newuser@example.com',
        password: 'Password123!',
      });
      assert.strictEqual(res.token, 'mock-member-jwt');
      assert.strictEqual(res.user.role, 'MEMBER');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('7. API request on register parses 409 conflict error when user already exists', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 409,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({ error: 'A user with this email already exists.' }),
    });

    try {
      await assert.rejects(
        async () => {
          await api.post('/auth/register', {
            email: 'alice.member@example.com',
            password: 'Password123!',
          });
        },
        {
          message: 'A user with this email already exists.',
          status: 409,
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

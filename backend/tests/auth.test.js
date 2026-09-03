const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');
const prisma = require('../src/prisma');

let server;
let baseUrl;

describe('Authentication & Role-Based Authorization Integration Tests', () => {
  before(async () => {
    // Start server on an ephemeral free port
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await prisma.$disconnect();
  });

  let librarianToken;
  let memberToken;

  // 1. Successful librarian login
  test('1. Successful librarian login returns 200, JWT token, and LIBRARIAN role', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sarah.librarian@library.org',
        password: 'Password123!',
      }),
    });

    assert.strictEqual(response.status, 200);
    const data = await response.json();
    assert.ok(data.token, 'Token should be present in response');
    assert.strictEqual(data.user.email, 'sarah.librarian@library.org');
    assert.strictEqual(data.user.role, 'LIBRARIAN');
    assert.strictEqual(typeof data.user.id, 'number');

    librarianToken = data.token;
  });

  // 2. Successful member login
  test('2. Successful member login returns 200, JWT token, and MEMBER role', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice.member@example.com',
        password: 'Password123!',
      }),
    });

    assert.strictEqual(response.status, 200);
    const data = await response.json();
    assert.ok(data.token, 'Token should be present in response');
    assert.strictEqual(data.user.email, 'alice.member@example.com');
    assert.strictEqual(data.user.role, 'MEMBER');
    assert.strictEqual(typeof data.user.id, 'number');

    memberToken = data.token;
  });

  // 3. Invalid password
  test('3. Invalid password returns 401 Unauthorized', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sarah.librarian@library.org',
        password: 'WrongPassword!',
      }),
    });

    assert.strictEqual(response.status, 401);
    const data = await response.json();
    assert.strictEqual(data.error, 'Invalid email or password.');
  });

  // 4. Unknown email
  test('4. Unknown email returns 401 Unauthorized', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent.user@example.com',
        password: 'Password123!',
      }),
    });

    assert.strictEqual(response.status, 401);
    const data = await response.json();
    assert.strictEqual(data.error, 'Invalid email or password.');
  });

  // 5. Missing / Invalid token
  test('5. Missing or invalid token on protected route returns 401 Unauthorized', async () => {
    // 5a. Missing token
    const resNoToken = await fetch(`${baseUrl}/api/auth/me`);
    assert.strictEqual(resNoToken.status, 401);

    // 5b. Invalid / malformed token
    const resInvalidToken = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer this-is-an-invalid-fake-token' },
    });
    assert.strictEqual(resInvalidToken.status, 401);
    const data = await resInvalidToken.json();
    assert.strictEqual(data.error, 'Invalid or expired authentication token.');
  });

  // 6. Authenticated request (GET /api/auth/me)
  test('6. Authenticated request to /api/auth/me returns current user profile', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });

    assert.strictEqual(response.status, 200);
    const data = await response.json();
    assert.strictEqual(data.user.email, 'alice.member@example.com');
    assert.strictEqual(data.user.role, 'MEMBER');
  });

  // 7. Member accessing a librarian-only endpoint
  test('7. Member receives 403 Forbidden when attempting librarian-only operation', async () => {
    const response = await fetch(`${baseUrl}/api/librarian/verify-role`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });

    assert.strictEqual(response.status, 403);
    const data = await response.json();
    assert.ok(
      data.error.includes('Access forbidden'),
      `Expected access forbidden error, got: ${data.error}`
    );
  });

  // 8. Librarian accessing a librarian endpoint
  test('8. Librarian receives 200 OK when accessing librarian-only operation', async () => {
    const response = await fetch(`${baseUrl}/api/librarian/verify-role`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(response.status, 200);
    const data = await response.json();
    assert.strictEqual(data.message, 'Authorized librarian access granted.');
    assert.strictEqual(data.user.role, 'LIBRARIAN');
  });

  // 9. Other important checks: validation & malformed authorization
  test('9. Missing required fields in login payload returns 400 Bad Request', async () => {
    const resNoPassword = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sarah.librarian@library.org' }),
    });
    assert.strictEqual(resNoPassword.status, 400);

    const resNoEmail = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'Password123!' }),
    });
    assert.strictEqual(resNoEmail.status, 400);
  });

  test('10. Malformed Authorization header without Bearer prefix returns 401', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Basic dXNlcjpwYXNz` },
    });
    assert.strictEqual(response.status, 401);
    const data = await response.json();
    assert.strictEqual(
      data.error,
      'Authentication required. No Bearer token provided.'
    );
  });

  // --- MEMBER SIGN-UP TESTS ---

  test('11. Successful member sign up creates new user with MEMBER role (201 Created)', async () => {
    const uniqueEmail = `newmember-${Date.now()}@example.com`;
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: uniqueEmail,
        password: 'Password123!',
      }),
    });

    assert.strictEqual(response.status, 201);
    const data = await response.json();
    assert.ok(data.token, 'Token should be returned');
    assert.strictEqual(data.user.email, uniqueEmail);
    assert.strictEqual(data.user.role, 'MEMBER');
    assert.strictEqual(typeof data.user.id, 'number');

    // Verify token works on protected endpoint
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    assert.strictEqual(meRes.status, 200);
    const meData = await meRes.json();
    assert.strictEqual(meData.user.email, uniqueEmail);
    assert.strictEqual(meData.user.role, 'MEMBER');
  });

  test('12. Member sign up ignores client-provided role and always sets MEMBER', async () => {
    const uniqueEmail = `hacker-${Date.now()}@example.com`;
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: uniqueEmail,
        password: 'Password123!',
        role: 'LIBRARIAN', // attempt privilege escalation
      }),
    });

    assert.strictEqual(response.status, 201);
    const data = await response.json();
    assert.strictEqual(data.user.role, 'MEMBER', 'Role must strictly be MEMBER');
  });

  test('13. Member sign up with existing email returns 409 Conflict with clear error', async () => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice.member@example.com',
        password: 'Password123!',
      }),
    });

    assert.strictEqual(response.status, 409);
    const data = await response.json();
    assert.ok(
      data.error.includes('already exists'),
      `Expected user already exists error, got: ${data.error}`
    );
  });

  test('14. Member sign up with invalid or missing fields returns 400 Bad Request', async () => {
    // Missing email
    const resNoEmail = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'Password123!' }),
    });
    assert.strictEqual(resNoEmail.status, 400);

    // Invalid email format
    const resBadEmail = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'notanemail', password: 'Password123!' }),
    });
    assert.strictEqual(resBadEmail.status, 400);

    // Password too short (< 6 chars)
    const resShortPass = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'valid@example.com', password: '123' }),
    });
    assert.strictEqual(resShortPass.status, 400);
  });
});

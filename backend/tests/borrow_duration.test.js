const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');
const prisma = require('../src/prisma');

let server;
let baseUrl;

let librarianToken;
let memberToken;
let memberId;

describe('Borrowing Duration Support Integration Tests', () => {
  before(async () => {
    // Start server on an ephemeral port
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // Authenticate librarian
    const libRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sarah.librarian@library.org',
        password: 'Password123!',
      }),
    });
    const libData = await libRes.json();
    librarianToken = libData.token;

    // Authenticate member
    const memRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice.member@example.com',
        password: 'Password123!',
      }),
    });
    const memData = await memRes.json();
    memberToken = memData.token;
    memberId = memData.user.id;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await prisma.$disconnect();
  });

  test('1. Member request with duration 1 → accepted (201 Created)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Duration 1 Test Item',
        category: 'Camera',
        identifyingCode: `DUR-1-${Date.now()}`,
        archived: false,
      },
    });

    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowDurationDays: 1,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.borrowDurationDays, 1);
    assert.strictEqual(data.loan.status, 'REQUESTED');
    assert.ok(data.loan.dueDate);
  });

  test('2. Member request with duration 31 → accepted (201 Created)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Duration 31 Test Item',
        category: 'Audio',
        identifyingCode: `DUR-31-${Date.now()}`,
        archived: false,
      },
    });

    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowDurationDays: 31,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.borrowDurationDays, 31);
    assert.strictEqual(data.loan.status, 'REQUESTED');
    assert.ok(data.loan.dueDate);
  });

  test('3. Member request with duration 0 → rejected (400 Bad Request)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Duration 0 Test Item',
        category: 'Audio',
        identifyingCode: `DUR-0-${Date.now()}`,
        archived: false,
      },
    });

    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowDurationDays: 0,
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('between 1 and 31'));
  });

  test('4. Member request with duration 32 → rejected (400 Bad Request)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Duration 32 Test Item',
        category: 'Audio',
        identifyingCode: `DUR-32-${Date.now()}`,
        archived: false,
      },
    });

    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowDurationDays: 32,
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('between 1 and 31'));
  });

  test('5. Member request with non-integer duration → rejected (400 Bad Request)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Duration Decimal Test Item',
        category: 'Lighting',
        identifyingCode: `DUR-DEC-${Date.now()}`,
        archived: false,
      },
    });

    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowDurationDays: 5.5,
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('must be an integer'));
  });

  test('6. Member request with missing duration → rejected (400 Bad Request)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Missing Duration Test Item',
        category: 'Lighting',
        identifyingCode: `DUR-MISS-${Date.now()}`,
        archived: false,
      },
    });

    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('required'));
  });

  test('7. Requested loan stores borrowDurationDays and sets provisional due date', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Provisional Date Test Item',
        category: 'Tools',
        identifyingCode: `PROV-DATE-${Date.now()}`,
        archived: false,
      },
    });

    const beforeReq = Date.now();
    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowDurationDays: 10,
        note: 'Provisional due date calculation test',
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.borrowDurationDays, 10);
    assert.strictEqual(data.loan.status, 'REQUESTED');

    const requestedAtTime = new Date(data.loan.requestedAt).getTime();
    const dueDateTime = new Date(data.loan.dueDate).getTime();
    const expectedDiffMs = 10 * 24 * 60 * 60 * 1000;

    // Due date should be roughly requestedAt + 10 days
    assert.strictEqual(dueDateTime - requestedAtTime, expectedDiffMs);
  });

  test('8. Issuing a 7-day request 5 days later produces a due date 7 days after the actual issue date', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Later Issue Test Item',
        category: 'Camera',
        identifyingCode: `LATER-ISSUE-${Date.now()}`,
        archived: false,
      },
    });

    // Simulate request created 5 days ago with borrowDurationDays = 7
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const provisionalDueDate = new Date(fiveDaysAgo.getTime() + 7 * 24 * 60 * 60 * 1000);

    const oldLoan = await prisma.loan.create({
      data: {
        itemId: item.id,
        borrowerId: memberId,
        borrowDurationDays: 7,
        status: 'REQUESTED',
        requestedAt: fiveDaysAgo,
        dueDate: provisionalDueDate,
      },
    });

    // Librarian issues the loan today (5 days after request)
    const issueTimeBefore = Date.now();
    const issueRes = await fetch(`${baseUrl}/api/loans/${oldLoan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        note: 'Issued 5 days after initial request',
      }),
    });

    assert.strictEqual(issueRes.status, 200);
    const issueData = await issueRes.json();
    assert.strictEqual(issueData.loan.status, 'ISSUED');
    assert.strictEqual(issueData.loan.borrowDurationDays, 7);

    // Verify final due date is 7 days after actual issue time (not 7 days from original request)
    const finalDueDate = new Date(issueData.loan.dueDate);
    const diffFromTodayMs = finalDueDate.getTime() - issueTimeBefore;
    const expected7DaysMs = 7 * 24 * 60 * 60 * 1000;

    // Difference between actual issue date and finalDueDate should be ~7 days (within 5 seconds tolerance)
    assert.ok(Math.abs(diffFromTodayMs - expected7DaysMs) < 5000);
  });

  test('9. Existing loan issuance due-date validation still works', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Validation Check Test Item',
        category: 'Audio',
        identifyingCode: `VAL-CHECK-${Date.now()}`,
        archived: false,
      },
    });

    const reqRes = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowDurationDays: 14,
      }),
    });
    assert.strictEqual(reqRes.status, 201);
    const loan = (await reqRes.json()).loan;

    // Explicit same-day dueDate rejected
    const sameDayRes = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({ dueDate: new Date().toISOString() }),
    });
    assert.strictEqual(sameDayRes.status, 400);

    // Explicit > 1 month dueDate rejected
    const overMonthRes = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        dueDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
    assert.strictEqual(overMonthRes.status, 400);
  });
});

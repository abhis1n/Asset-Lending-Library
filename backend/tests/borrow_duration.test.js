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

  // --- SECTION: LIBRARIAN ISSUE LOAN FLOW - EDITABLE DUE DATE ---

  test('10. Issue uses the derived due date when the librarian does not provide a custom date', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Derived Due Date Default Test Item',
        category: 'Electronics',
        identifyingCode: `DER-DEF-${Date.now()}`,
        archived: false,
      },
    });

    // Member requested with duration = 7 days
    const reqRes = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowDurationDays: 7,
      }),
    });
    assert.strictEqual(reqRes.status, 201);
    const loan = (await reqRes.json()).loan;

    // Librarian issues without providing a custom dueDate
    const issueTimeBefore = Date.now();
    const issueRes = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        note: 'Issued using derived default due date',
      }),
    });

    assert.strictEqual(issueRes.status, 200);
    const data = await issueRes.json();
    assert.strictEqual(data.loan.status, 'ISSUED');
    assert.strictEqual(data.loan.borrowDurationDays, 7);

    // Derived due date is calculated as issueDate + 7 days
    const derivedDueDate = new Date(data.loan.dueDate);
    const diffMs = derivedDueDate.getTime() - issueTimeBefore;
    const expected7DaysMs = 7 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(diffMs - expected7DaysMs) < 5000);
  });

  test('11. Issue accepts and stores a valid custom due date', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Custom Due Date Test Item',
        category: 'Electronics',
        identifyingCode: `CUST-DUE-${Date.now()}`,
        archived: false,
      },
    });

    // Member requested with duration = 7 days
    const reqRes = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowDurationDays: 7,
      }),
    });
    assert.strictEqual(reqRes.status, 201);
    const loan = (await reqRes.json()).loan;

    // Librarian overrides default (7 days) with custom due date (e.g. 12 days in the future)
    const customDate = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
    const customDueDateStr = customDate.toISOString();

    const issueRes = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        dueDate: customDueDateStr,
        note: 'Issued with custom 12-day due date',
      }),
    });

    assert.strictEqual(issueRes.status, 200);
    const data = await issueRes.json();
    assert.strictEqual(data.loan.status, 'ISSUED');
    // Stored dueDate reflects the custom date provided by the librarian
    const storedDueDate = new Date(data.loan.dueDate).toISOString().slice(0, 10);
    const expectedDate = customDate.toISOString().slice(0, 10);
    assert.strictEqual(storedDueDate, expectedDate);
  });

  test('12. A custom due date at or before the actual issue timestamp is rejected', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Invalid Past/Same Day Due Date Item',
        category: 'Camera',
        identifyingCode: `REJ-PAST-${Date.now()}`,
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

    // Past date rejected
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const pastRes = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({ dueDate: pastDate }),
    });
    assert.strictEqual(pastRes.status, 400);
    const pastData = await pastRes.json();
    assert.ok(pastData.error.includes('strictly after') || pastData.error.includes('cannot be'));

    // Same day rejected
    const sameDay = new Date().toISOString();
    const sameDayRes = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({ dueDate: sameDay }),
    });
    assert.strictEqual(sameDayRes.status, 400);

    // Verify loan status remains REQUESTED
    const checkLoan = await prisma.loan.findUnique({ where: { id: loan.id } });
    assert.strictEqual(checkLoan.status, 'REQUESTED');
  });

  test('13. A custom due date more than 31 days after the actual issue timestamp is rejected', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Over 31 Days Custom Due Date Item',
        category: 'Camera',
        identifyingCode: `REJ-31D-${Date.now()}`,
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

    // 45 days in future exceeds 31 days / 1 month limit
    const over31Days = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
    const overRes = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({ dueDate: over31Days }),
    });
    assert.strictEqual(overRes.status, 400);
    const data = await overRes.json();
    assert.ok(data.error.includes('1 month') || data.error.includes('31 days') || data.error.includes('cannot'));

    // Verify loan status remains REQUESTED
    const checkLoan = await prisma.loan.findUnique({ where: { id: loan.id } });
    assert.strictEqual(checkLoan.status, 'REQUESTED');
  });

  test('14. A custom due date does not modify borrowDurationDays', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Preserve Duration Custom Date Item',
        category: 'Audio',
        identifyingCode: `PRES-DUR-${Date.now()}`,
        archived: false,
      },
    });

    // Request created with borrowDurationDays = 7
    const reqRes = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowDurationDays: 7,
      }),
    });
    assert.strictEqual(reqRes.status, 201);
    const loan = (await reqRes.json()).loan;
    assert.strictEqual(loan.borrowDurationDays, 7);

    // Librarian provides custom due date (20 days from now)
    const customDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
    const issueRes = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        dueDate: customDate,
        note: 'Custom date overriding derived date but preserving requested duration',
      }),
    });

    assert.strictEqual(issueRes.status, 200);
    const data = await issueRes.json();
    // API response verifies borrowDurationDays remains 7
    assert.strictEqual(data.loan.borrowDurationDays, 7);

    // Database verification: borrowDurationDays is strictly 7, dueDate matches custom date
    const dbLoan = await prisma.loan.findUnique({ where: { id: loan.id } });
    assert.strictEqual(dbLoan.borrowDurationDays, 7);
    assert.strictEqual(new Date(dbLoan.dueDate).toISOString().slice(0, 10), new Date(customDate).toISOString().slice(0, 10));
  });

  test('15. Existing issue-loan behavior and validation remain covered', async () => {
    // Non-existent loan ID returns 404
    const notFoundRes = await fetch(`${baseUrl}/api/loans/999999/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(notFoundRes.status, 404);

    // Member cannot issue a loan (403 Forbidden)
    const item = await prisma.item.create({
      data: {
        title: 'RBAC Issue Check Item',
        category: 'Lighting',
        identifyingCode: `RBAC-ISS-${Date.now()}`,
        archived: false,
      },
    });
    const reqRes = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({ itemId: item.id, borrowDurationDays: 14 }),
    });
    assert.strictEqual(reqRes.status, 201);
    const loan = (await reqRes.json()).loan;

    const memberForbiddenRes = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(memberForbiddenRes.status, 403);

    // Successfully issue loan as librarian
    const issueOk = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({ note: 'First issue' }),
    });
    assert.strictEqual(issueOk.status, 200);

    // Attempting to re-issue an already ISSUED loan returns 409 Conflict
    const reIssueRes = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(reIssueRes.status, 409);

    // Verify history audit record exists for the issue action
    const historyRecord = await prisma.loanHistory.findFirst({
      where: {
        loanId: loan.id,
        type: 'ISSUED',
      },
    });
    assert.ok(historyRecord);
    assert.strictEqual(historyRecord.note, 'First issue');
  });
});

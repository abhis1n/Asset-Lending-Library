const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');
const prisma = require('../src/prisma');
const { LoanStatus } = require('@prisma/client');

let server;
let baseUrl;

let librarianToken;
let memberToken;
let memberId;

describe('Overdue Loan Alerts Integration Tests', () => {
  before(async () => {
    // Start server on an ephemeral port
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // Obtain tokens
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

  async function seedLoan({
    borrowerId,
    title,
    category,
    identifyingCode,
    status,
    dueDate,
  }) {
    const item = await prisma.item.create({
      data: {
        title,
        category,
        identifyingCode,
        archived: false,
      },
    });

    const loan = await prisma.loan.create({
      data: {
        itemId: item.id,
        borrowerId,
        status,
        dueDate: dueDate !== undefined ? dueDate : null,
      },
    });

    return { item, loan };
  }

  // 1. Unauthenticated request is rejected
  test('1. Unauthenticated request is rejected (401 Unauthorized)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/overdue`);
    assert.strictEqual(res.status, 401);
  });

  // 2. Member request is rejected
  test('2. Member request is rejected (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/overdue`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.strictEqual(res.status, 403);
  });

  // 3. Librarian can retrieve overdue loans
  test('3. Librarian can retrieve overdue loans (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/overdue`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(typeof data.total === 'number');
    assert.ok(Array.isArray(data.overdueLoans));
  });

  // 4. Only ISSUED loans with past due dates appear
  test('4. Only ISSUED loans with past due dates appear in overdue alerts', async () => {
    const timestamp = Date.now();
    const pastDate = new Date(Date.now() - 24 * 3600 * 1000); // 1 day ago

    const { loan } = await seedLoan({
      borrowerId: memberId,
      title: `Overdue Camera ${timestamp}`,
      category: `AlertCat-${timestamp}`,
      identifyingCode: `OVD-CAM-${timestamp}`,
      status: LoanStatus.ISSUED,
      dueDate: pastDate,
    });

    const res = await fetch(`${baseUrl}/api/loans/overdue?category=AlertCat-${timestamp}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.total, 1);
    const alert = data.overdueLoans[0];
    assert.strictEqual(alert.loanId, loan.id);
    assert.strictEqual(alert.status, LoanStatus.ISSUED);
    assert.strictEqual(alert.isOverdue, true);
    assert.strictEqual(alert.category, `AlertCat-${timestamp}`);
    assert.strictEqual(alert.identifyingCode, `OVD-CAM-${timestamp}`);
  });

  // 5. Returned loans with past due dates do not appear
  test('5. Returned loans with past due dates do not appear in overdue alerts', async () => {
    const timestamp = Date.now();
    const pastDate = new Date(Date.now() - 48 * 3600 * 1000);

    await seedLoan({
      borrowerId: memberId,
      title: `Returned Item ${timestamp}`,
      category: `ExclCat-${timestamp}`,
      identifyingCode: `RET-PAST-${timestamp}`,
      status: LoanStatus.RETURNED,
      dueDate: pastDate,
    });

    const res = await fetch(`${baseUrl}/api/loans/overdue?category=ExclCat-${timestamp}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.total, 0);
    assert.strictEqual(data.overdueLoans.length, 0);
  });

  // 6. Requested loans with past due dates do not appear
  test('6. Requested loans with past due dates do not appear in overdue alerts', async () => {
    const timestamp = Date.now();
    const pastDate = new Date(Date.now() - 48 * 3600 * 1000);

    await seedLoan({
      borrowerId: memberId,
      title: `Requested Item ${timestamp}`,
      category: `ReqCat-${timestamp}`,
      identifyingCode: `REQ-PAST-${timestamp}`,
      status: LoanStatus.REQUESTED,
      dueDate: pastDate,
    });

    const res = await fetch(`${baseUrl}/api/loans/overdue?category=ReqCat-${timestamp}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.total, 0);
  });

  // 7. Lost loans with past due dates do not appear
  test('7. Lost loans with past due dates do not appear in overdue alerts', async () => {
    const timestamp = Date.now();
    const pastDate = new Date(Date.now() - 48 * 3600 * 1000);

    await seedLoan({
      borrowerId: memberId,
      title: `Lost Item ${timestamp}`,
      category: `LostCat-${timestamp}`,
      identifyingCode: `LOST-PAST-${timestamp}`,
      status: LoanStatus.LOST,
      dueDate: pastDate,
    });

    const res = await fetch(`${baseUrl}/api/loans/overdue?category=LostCat-${timestamp}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.total, 0);
  });

  // 8. Issued loans with NULL due dates do not appear
  test('8. Issued loans with NULL due dates do not appear in overdue alerts', async () => {
    const timestamp = Date.now();

    await seedLoan({
      borrowerId: memberId,
      title: `Null Date Item ${timestamp}`,
      category: `NullCat-${timestamp}`,
      identifyingCode: `NULL-DUE-${timestamp}`,
      status: LoanStatus.ISSUED,
      dueDate: null,
    });

    const res = await fetch(`${baseUrl}/api/loans/overdue?category=NullCat-${timestamp}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.total, 0);
  });

  // 9. Issued loans with future due dates do not appear
  test('9. Issued loans with future due dates do not appear in overdue alerts', async () => {
    const timestamp = Date.now();
    const futureDate = new Date(Date.now() + 14 * 24 * 3600 * 1000); // 14 days in future

    await seedLoan({
      borrowerId: memberId,
      title: `Future Item ${timestamp}`,
      category: `FutCat-${timestamp}`,
      identifyingCode: `FUT-DUE-${timestamp}`,
      status: LoanStatus.ISSUED,
      dueDate: futureDate,
    });

    const res = await fetch(`${baseUrl}/api/loans/overdue?category=FutCat-${timestamp}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.total, 0);
  });

  // 10 & 11. Multiple overdue loans are returned and ordered by oldest dueDate first (ASC)
  test('10 & 11. Multiple overdue loans are returned and ordered by oldest due date first', async () => {
    const timestamp = Date.now();
    const cat = `MultiOvdCat-${timestamp}`;

    const dateOldest = new Date('2026-01-01T00:00:00.000Z');
    const dateMiddle = new Date('2026-02-01T00:00:00.000Z');
    const dateRecent = new Date('2026-03-01T00:00:00.000Z');

    // Insert out of order
    const { loan: lMiddle } = await seedLoan({
      borrowerId: memberId,
      title: 'Middle Overdue',
      category: cat,
      identifyingCode: `OVD-MID-${timestamp}`,
      status: LoanStatus.ISSUED,
      dueDate: dateMiddle,
    });
    const { loan: lOldest } = await seedLoan({
      borrowerId: memberId,
      title: 'Oldest Overdue',
      category: cat,
      identifyingCode: `OVD-OLD-${timestamp}`,
      status: LoanStatus.ISSUED,
      dueDate: dateOldest,
    });
    const { loan: lRecent } = await seedLoan({
      borrowerId: memberId,
      title: 'Recent Overdue',
      category: cat,
      identifyingCode: `OVD-REC-${timestamp}`,
      status: LoanStatus.ISSUED,
      dueDate: dateRecent,
    });

    const res = await fetch(`${baseUrl}/api/loans/overdue?category=${cat}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.total, 3);
    assert.strictEqual(data.overdueLoans[0].loanId, lOldest.id);
    assert.strictEqual(data.overdueLoans[1].loanId, lMiddle.id);
    assert.strictEqual(data.overdueLoans[2].loanId, lRecent.id);

    // Verify oldest dueDate is strictly first
    assert.strictEqual(
      new Date(data.overdueLoans[0].dueDate).getTime(),
      dateOldest.getTime()
    );
  });

  // 12. isOverdue is true for every returned alert
  test('12. isOverdue is true for every returned alert record', async () => {
    const res = await fetch(`${baseUrl}/api/loans/overdue`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    for (const alert of data.overdueLoans) {
      assert.strictEqual(alert.isOverdue, true);
      assert.strictEqual(alert.status, LoanStatus.ISSUED);
      assert.ok(new Date(alert.dueDate) < new Date());
    }
  });

  // 13. No sensitive fields are exposed
  test('13. No sensitive fields or user hashes are exposed in alerts', async () => {
    const res = await fetch(`${baseUrl}/api/loans/overdue`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text.includes('password'), false);
    assert.strictEqual(text.includes('hash'), false);
    assert.strictEqual(text.includes('token'), false);
    assert.strictEqual(text.includes('secret'), false);
  });

  // 14. Empty overdue state returns 200 with an empty array
  test('14. Search with no matches returns 200 with total: 0 and empty array', async () => {
    const res = await fetch(
      `${baseUrl}/api/loans/overdue?search=NonExistentSearchTerm123456789`,
      { headers: { Authorization: `Bearer ${librarianToken}` } }
    );

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.total, 0);
    assert.deepStrictEqual(data.overdueLoans, []);
  });

  // 15. Existing dashboard overdue count and alert results are consistent
  test('15. Overdue alert total matches the dashboard overdue count', async () => {
    const [dashRes, alertRes] = await Promise.all([
      fetch(`${baseUrl}/api/dashboard`, {
        headers: { Authorization: `Bearer ${librarianToken}` },
      }),
      fetch(`${baseUrl}/api/loans/overdue`, {
        headers: { Authorization: `Bearer ${librarianToken}` },
      }),
    ]);

    assert.strictEqual(dashRes.status, 200);
    assert.strictEqual(alertRes.status, 200);

    const dashData = await dashRes.json();
    const alertData = await alertRes.json();

    assert.strictEqual(alertData.total, dashData.overdue.total);
    assert.strictEqual(alertData.overdueLoans.length, dashData.overdue.total);
  });
});

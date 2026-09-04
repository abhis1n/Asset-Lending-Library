const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');
const prisma = require('../src/prisma');
const { LoanStatus, LoanHistoryType } = require('@prisma/client');

let server;
let baseUrl;

let librarianToken;
let memberToken;
let memberId;

describe('Dashboard Metrics Integration Tests', () => {
  before(async () => {
    // Start server on ephemeral port
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

  // 1. Unauthenticated request is rejected
  test('1. Unauthenticated request is rejected (401 Unauthorized)', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`);
    assert.strictEqual(res.status, 401);
  });

  // 2. Member request is rejected
  test('2. Member request is rejected (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.strictEqual(res.status, 403);
  });

  // 3. Librarian can access the dashboard
  test('3. Librarian can access the dashboard (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.catalogue);
    assert.ok(data.loans);
    assert.ok(data.overdue);
  });

  // 4 & 5. Total, active, and archived catalogue counts are correct
  test('4 & 5. Total, active, and archived catalogue counts are accurate and consistent', async () => {
    const timestamp = Date.now();
    // Create 2 active items and 1 archived item
    await prisma.item.create({
      data: {
        title: `Active Item 1 ${timestamp}`,
        category: 'DashCat',
        identifyingCode: `DASH-ACT1-${timestamp}`,
        archived: false,
      },
    });
    await prisma.item.create({
      data: {
        title: `Active Item 2 ${timestamp}`,
        category: 'DashCat',
        identifyingCode: `DASH-ACT2-${timestamp}`,
        archived: false,
      },
    });
    await prisma.item.create({
      data: {
        title: `Archived Item 1 ${timestamp}`,
        category: 'DashCat',
        identifyingCode: `DASH-ARCH1-${timestamp}`,
        archived: true,
      },
    });

    const res = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();

    const expectedActive = await prisma.item.count({ where: { archived: false } });
    const expectedArchived = await prisma.item.count({ where: { archived: true } });

    assert.strictEqual(data.catalogue.active, expectedActive);
    assert.strictEqual(data.catalogue.archived, expectedArchived);
    assert.strictEqual(data.catalogue.total, expectedActive + expectedArchived);
  });

  // 6 & 7. Loan counts for REQUESTED, ISSUED, RETURNED, LOST, and open loans
  test('6 & 7. Loan status counts and open-loan count (REQUESTED + ISSUED) are accurate', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();

    const expectedRequested = await prisma.loan.count({ where: { status: LoanStatus.REQUESTED } });
    const expectedIssued = await prisma.loan.count({ where: { status: LoanStatus.ISSUED } });
    const expectedReturned = await prisma.loan.count({ where: { status: LoanStatus.RETURNED } });
    const expectedLost = await prisma.loan.count({ where: { status: LoanStatus.LOST } });

    assert.strictEqual(data.loans.requested, expectedRequested);
    assert.strictEqual(data.loans.issued, expectedIssued);
    assert.strictEqual(data.loans.returned, expectedReturned);
    assert.strictEqual(data.loans.lost, expectedLost);
    assert.strictEqual(data.loans.open, expectedRequested + expectedIssued);
  });

  // 8. Overdue count is computed from ISSUED + dueDate < now
  test('8. Overdue count correctly identifies ISSUED loans past their dueDate', async () => {
    const timestamp = Date.now();
    const item = await prisma.item.create({
      data: {
        title: `Overdue Item ${timestamp}`,
        category: 'OverdueDash',
        identifyingCode: `DASH-OVD-${timestamp}`,
      },
    });

    // Create overdue loan
    await prisma.loan.create({
      data: {
        itemId: item.id,
        borrowerId: memberId,
        status: LoanStatus.ISSUED,
        dueDate: new Date(Date.now() - 3600000), // 1 hour ago
      },
    });

    const res = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();

    const expectedOverdue = await prisma.loan.count({
      where: {
        status: LoanStatus.ISSUED,
        dueDate: { lt: new Date() },
      },
    });

    assert.strictEqual(data.overdue.total, expectedOverdue);
    assert.strictEqual(
      data.overdue.nonOverdueIssued,
      data.loans.issued - data.overdue.total
    );
  });

  // 9. Returned loans with old due dates are not counted as overdue
  test('9. Returned loans with past due dates are not counted as overdue', async () => {
    const beforeRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    const beforeData = await beforeRes.json();
    const beforeOverdue = beforeData.overdue.total;

    const item = await prisma.item.create({
      data: {
        title: 'Returned Past Due Item',
        category: 'TestCat',
        identifyingCode: `RET-PAST-${Date.now()}`,
      },
    });

    // Create RETURNED loan with past dueDate
    await prisma.loan.create({
      data: {
        itemId: item.id,
        borrowerId: memberId,
        status: LoanStatus.RETURNED,
        dueDate: new Date(Date.now() - 10000000),
      },
    });

    const afterRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    const afterData = await afterRes.json();

    assert.strictEqual(afterData.overdue.total, beforeOverdue);
  });

  // 10. Requested loans with old due dates are not counted as overdue
  test('10. Requested loans with past due dates are not counted as overdue', async () => {
    const beforeRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    const beforeData = await beforeRes.json();
    const beforeOverdue = beforeData.overdue.total;

    const item = await prisma.item.create({
      data: {
        title: 'Requested Past Due Item',
        category: 'TestCat',
        identifyingCode: `REQ-PAST-${Date.now()}`,
      },
    });

    await prisma.loan.create({
      data: {
        itemId: item.id,
        borrowerId: memberId,
        status: LoanStatus.REQUESTED,
        dueDate: new Date(Date.now() - 10000000),
      },
    });

    const afterRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    const afterData = await afterRes.json();

    assert.strictEqual(afterData.overdue.total, beforeOverdue);
  });

  // 11. Issued loans with a null due date are not counted as overdue
  test('11. Issued loans with a null due date are not counted as overdue', async () => {
    const beforeRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    const beforeData = await beforeRes.json();
    const beforeOverdue = beforeData.overdue.total;

    const item = await prisma.item.create({
      data: {
        title: 'Issued Null DueDate Item',
        category: 'TestCat',
        identifyingCode: `ISS-NULL-${Date.now()}`,
      },
    });

    await prisma.loan.create({
      data: {
        itemId: item.id,
        borrowerId: memberId,
        status: LoanStatus.ISSUED,
        dueDate: null,
      },
    });

    const afterRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    const afterData = await afterRes.json();

    assert.strictEqual(afterData.overdue.total, beforeOverdue);
  });

  // 12. Future due dates are not counted as overdue
  test('12. Future due dates are not counted as overdue', async () => {
    const beforeRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    const beforeData = await beforeRes.json();
    const beforeOverdue = beforeData.overdue.total;

    const item = await prisma.item.create({
      data: {
        title: 'Future DueDate Item',
        category: 'TestCat',
        identifyingCode: `FUT-DUE-${Date.now()}`,
      },
    });

    await prisma.loan.create({
      data: {
        itemId: item.id,
        borrowerId: memberId,
        status: LoanStatus.ISSUED,
        dueDate: new Date(Date.now() + 30 * 86400000), // 30 days in future
      },
    });

    const afterRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    const afterData = await afterRes.json();

    assert.strictEqual(afterData.overdue.total, beforeOverdue);
  });

  // 13. Dashboard does not expose sensitive fields
  test('13. Dashboard response does not expose sensitive fields or user records', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();

    assert.strictEqual(text.includes('password'), false);
    assert.strictEqual(text.includes('hash'), false);
    assert.strictEqual(text.includes('token'), false);
    assert.strictEqual(text.includes('secret'), false);
  });

  // 14. Exactly 8 weekly data points are returned in chronological order
  test('14. Exactly 8 weekly data points are returned covering current week and previous 7 weeks', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.weeklyReturns), 'data.weeklyReturns should be an array');
    assert.strictEqual(data.weeklyReturns.length, 8, 'Must return exactly 8 weekly data points');
    assert.ok(Array.isArray(data.returnsByWeek), 'data.returnsByWeek should also be available');
    assert.strictEqual(data.returnsByWeek.length, 8);

    // Verify chronological order: weekStart increases monotonically
    for (let i = 0; i < data.weeklyReturns.length; i++) {
      const current = data.weeklyReturns[i];
      assert.ok(current.weekStart, 'Each item must have weekStart');
      assert.ok(current.weekEnd, 'Each item must have weekEnd');
      assert.ok(current.label, 'Each item must have label');
      assert.strictEqual(typeof current.count, 'number', 'count must be a number');
      assert.ok(current.count >= 0, 'count cannot be negative');

      if (i < 7) {
        assert.strictEqual(current.isCurrentWeek, false, 'Items 0-6 are previous weeks');
        const next = data.weeklyReturns[i + 1];
        assert.ok(
          new Date(current.weekStart).getTime() < new Date(next.weekStart).getTime(),
          'Weeks must be ordered chronologically'
        );
        assert.strictEqual(
          new Date(current.weekEnd).getTime(),
          new Date(next.weekStart).getTime(),
          'Adjacent weeks must be continuous without gaps or overlaps'
        );
      } else {
        assert.strictEqual(current.isCurrentWeek, true, '8th item must be the current week');
      }
    }
  });

  // 15. Weeks with no returns have count 0
  test('15. Weeks with no returns appear with count 0 (zero-filling)', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();

    // From our seed data, Week -3 (index 4 in 0..7) has 0 returns
    const zeroWeeks = data.weeklyReturns.filter((w) => w.count === 0);
    assert.ok(zeroWeeks.length >= 1, 'At least one week must have count 0');
    zeroWeeks.forEach((w) => {
      assert.strictEqual(w.count, 0);
    });
  });

  // 16. Return events are grouped into the correct week and not duplicated
  test('16. Return events are grouped into the correct week and not duplicated across weeks', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();

    // Sum of counts across all 8 weeks
    const totalWeeklyReturns = data.weeklyReturns.reduce((sum, w) => sum + w.count, 0);

    // Query actual return events from DB within the 8-week window
    const oldestWeekStart = new Date(data.weeklyReturns[0].weekStart);
    const dbReturnCount = await prisma.loanHistory.count({
      where: {
        type: LoanHistoryType.RETURNED,
        createdAt: { gte: oldestWeekStart },
      },
    });

    assert.strictEqual(
      totalWeeklyReturns,
      dbReturnCount,
      'Total weekly return count must exactly match database return events in that window'
    );
  });

  // 17. A return event is counted correctly and increments the current week without duplication
  test('17. A new return event increments current week count by exactly 1 without duplicating in adjacent weeks', async () => {
    // 1. Get current dashboard metrics
    const beforeRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    const beforeData = await beforeRes.json();
    const currentWeekBeforeCount = beforeData.weeklyReturns[7].count;
    const previousWeekBeforeCount = beforeData.weeklyReturns[6].count;

    // 2. Create an issued loan, then return it via API
    const item = await prisma.item.create({
      data: {
        title: `Weekly Return Test Item ${Date.now()}`,
        category: 'TestCat',
        identifyingCode: `WRT-${Date.now()}`,
      },
    });

    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const createRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: memberId,
        status: 'ISSUED',
        dueDate,
      }),
    });
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    const loanId = createData.loan.id;

    // Return loan
    const returnRes = await fetch(`${baseUrl}/api/loans/${loanId}/return`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        note: 'Returned for weekly return integration test',
      }),
    });
    assert.strictEqual(returnRes.status, 200);

    // 3. Check dashboard again
    const afterRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(afterRes.status, 200);
    const afterData = await afterRes.json();

    assert.strictEqual(
      afterData.weeklyReturns[7].count,
      currentWeekBeforeCount + 1,
      'Current week count must increment by exactly 1'
    );
    assert.strictEqual(
      afterData.weeklyReturns[6].count,
      previousWeekBeforeCount,
      'Previous week count must remain unchanged'
    );
  });

  // 18. Existing dashboard functionality remains intact
  test('18. Existing dashboard catalogue, loans, and overdue metrics remain accurate and functional', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(data.catalogue);
    assert.ok(data.loans);
    assert.ok(data.overdue);
    assert.ok(data.weeklyReturns);

    assert.strictEqual(typeof data.catalogue.total, 'number');
    assert.strictEqual(typeof data.loans.open, 'number');
    assert.strictEqual(typeof data.loans.returned, 'number');
    assert.strictEqual(typeof data.overdue.total, 'number');
  });
});


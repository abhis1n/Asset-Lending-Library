const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');
const prisma = require('../src/prisma');
const { LoanStatus, LoanHistoryType } = require('@prisma/client');

let server;
let baseUrl;

let librarianToken;
let librarianId;
let memberToken;
let memberId;

describe('Bulk Loan Return Integration Tests', () => {
  before(async () => {
    // Start server on an ephemeral free port
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
    librarianId = libData.user.id;

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

  // Helper to create an item and an issued loan
  async function createIssuedLoan(identifyingCodePrefix) {
    const item = await prisma.item.create({
      data: {
        title: `Test Item ${identifyingCodePrefix}`,
        category: 'BulkTest',
        identifyingCode: `${identifyingCodePrefix}-${Date.now()}-${Math.random()}`,
        archived: false,
      },
    });

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    const loan = await prisma.loan.create({
      data: {
        itemId: item.id,
        borrowerId: memberId,
        status: LoanStatus.ISSUED,
        dueDate,
      },
    });

    // Seed initial ISSUED history
    await prisma.loanHistory.create({
      data: {
        loanId: loan.id,
        type: LoanHistoryType.ISSUED,
        userId: librarianId,
        note: 'Initial issue for test',
      },
    });

    return { item, loan };
  }

  // 1. Unauthenticated request is rejected
  test('1. Unauthenticated request is rejected (401 Unauthorized)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loanIds: [1, 2] }),
    });

    assert.strictEqual(res.status, 401);
  });

  // 2. Member request is rejected
  test('2. Member request is rejected (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${memberToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: [1, 2] }),
    });

    assert.strictEqual(res.status, 403);
  });

  // 3. Librarian can bulk-return multiple issued loans
  test('3. Librarian can bulk-return multiple issued loans (200 OK)', async () => {
    const { loan: loan1 } = await createIssuedLoan('BULK-1');
    const { loan: loan2 } = await createIssuedLoan('BULK-2');
    const { loan: loan3 } = await createIssuedLoan('BULK-3');

    const res = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        loanIds: [loan1.id, loan2.id, loan3.id],
        note: 'Returned in bulk batch',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.total, 3);
    assert.strictEqual(data.successful, 3);
    assert.strictEqual(data.failed, 0);
    assert.strictEqual(data.returnedLoans.length, 3);
    assert.strictEqual(data.errors.length, 0);
  });

  // 4. Returned loans have status RETURNED
  test('4. Returned loans have status RETURNED in response and database', async () => {
    const { loan: loan1 } = await createIssuedLoan('STATUS-CHECK-1');
    const { loan: loan2 } = await createIssuedLoan('STATUS-CHECK-2');

    const res = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: [loan1.id, loan2.id] }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();

    // Verify response
    for (const ret of data.returnedLoans) {
      assert.strictEqual(ret.status, LoanStatus.RETURNED);
    }

    // Verify database
    const dbLoan1 = await prisma.loan.findUnique({ where: { id: loan1.id } });
    const dbLoan2 = await prisma.loan.findUnique({ where: { id: loan2.id } });
    assert.strictEqual(dbLoan1.status, LoanStatus.RETURNED);
    assert.strictEqual(dbLoan2.status, LoanStatus.RETURNED);
  });

  // 5 & 6. Exactly one RETURNED history event is created with authenticated librarian as actor
  test('5 & 6. Exactly one RETURNED history event is created with librarian actor', async () => {
    const { loan } = await createIssuedLoan('HIST-CHECK');

    const res = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        loanIds: [loan.id],
        note: 'Audit bulk return note',
      }),
    });

    assert.strictEqual(res.status, 200);

    const history = await prisma.loanHistory.findMany({
      where: { loanId: loan.id },
      orderBy: { createdAt: 'asc' },
    });

    // There was 1 initial ISSUED event, now exactly 1 RETURNED event added
    assert.strictEqual(history.length, 2);
    const returnEvent = history[1];
    assert.strictEqual(returnEvent.type, LoanHistoryType.RETURNED);
    assert.strictEqual(returnEvent.userId, librarianId);
    assert.strictEqual(returnEvent.note, 'Audit bulk return note');
  });

  // 7. Nonexistent loan IDs produce per-loan errors
  test('7. Nonexistent loan IDs produce per-loan errors without failing batch', async () => {
    const { loan } = await createIssuedLoan('NONEXIST-MIX');
    const fakeId = 9999999;

    const res = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: [loan.id, fakeId] }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.total, 2);
    assert.strictEqual(data.successful, 1);
    assert.strictEqual(data.failed, 1);

    assert.strictEqual(data.returnedLoans[0].loanId, loan.id);
    assert.strictEqual(data.errors[0].loanId, fakeId);
    assert.ok(data.errors[0].error.toLowerCase().includes('not found'));
  });

  // 8. Already-returned loans produce per-loan errors
  test('8. Already-returned loans produce per-loan errors', async () => {
    const { loan } = await createIssuedLoan('ALREADY-RET');

    // First return
    await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: [loan.id] }),
    });

    // Attempt second return
    const res = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: [loan.id] }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.successful, 0);
    assert.strictEqual(data.failed, 1);
    assert.strictEqual(data.errors[0].loanId, loan.id);
    assert.ok(data.errors[0].error.includes('RETURNED'));
  });

  // 9. REQUESTED loans cannot be bulk-returned
  test('9. REQUESTED loans cannot be bulk-returned', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Requested Item Only',
        category: 'TestCat',
        identifyingCode: `REQ-ONLY-${Date.now()}-${Math.random()}`,
      },
    });
    const reqLoan = await prisma.loan.create({
      data: {
        itemId: item.id,
        borrowerId: memberId,
        status: LoanStatus.REQUESTED,
      },
    });

    const res = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: [reqLoan.id] }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.successful, 0);
    assert.strictEqual(data.failed, 1);
    assert.strictEqual(data.errors[0].loanId, reqLoan.id);
    assert.ok(data.errors[0].error.includes('REQUESTED'));

    // Loan status remains REQUESTED
    const checkDb = await prisma.loan.findUnique({ where: { id: reqLoan.id } });
    assert.strictEqual(checkDb.status, LoanStatus.REQUESTED);
  });

  // 10. LOST loans cannot be bulk-returned
  test('10. LOST loans cannot be bulk-returned', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Lost Item Test',
        category: 'TestCat',
        identifyingCode: `LOST-ONLY-${Date.now()}-${Math.random()}`,
      },
    });
    const lostLoan = await prisma.loan.create({
      data: {
        itemId: item.id,
        borrowerId: memberId,
        status: LoanStatus.LOST,
      },
    });

    const res = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: [lostLoan.id] }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.successful, 0);
    assert.strictEqual(data.failed, 1);
    assert.strictEqual(data.errors[0].loanId, lostLoan.id);
    assert.ok(data.errors[0].error.includes('LOST'));

    // Loan status remains LOST
    const checkDb = await prisma.loan.findUnique({ where: { id: lostLoan.id } });
    assert.strictEqual(checkDb.status, LoanStatus.LOST);
  });

  // 11. Mixed valid and invalid loan IDs produce partial success
  test('11. Mixed valid and invalid loan IDs produce partial success', async () => {
    const { loan: validLoan1 } = await createIssuedLoan('MIX-1');
    const { loan: validLoan2 } = await createIssuedLoan('MIX-2');
    const fakeId1 = 8888881;
    const fakeId2 = 8888882;

    const res = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        loanIds: [validLoan1.id, fakeId1, validLoan2.id, fakeId2],
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.total, 4);
    assert.strictEqual(data.successful, 2);
    assert.strictEqual(data.failed, 2);
    assert.strictEqual(data.returnedLoans.length, 2);
    assert.strictEqual(data.errors.length, 2);
  });

  // 12. Failure of one loan does not roll back successful returns of other loans
  test('12. Failure of one loan does not roll back successful returns of other loans', async () => {
    const { loan: goodLoan } = await createIssuedLoan('INDEP-GOOD');
    const fakeId = 7777777;

    const res = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: [goodLoan.id, fakeId] }),
    });

    assert.strictEqual(res.status, 200);

    // Verify goodLoan was committed to RETURNED despite fakeId failing
    const checkGood = await prisma.loan.findUnique({ where: { id: goodLoan.id } });
    assert.strictEqual(checkGood.status, LoanStatus.RETURNED);
  });

  // 13. Invalid/missing loanIds input is rejected (400 Bad Request)
  test('13. Invalid/missing loanIds input is rejected with 400 Bad Request', async () => {
    // Missing body
    const r1 = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(r1.status, 400);

    // Empty array
    const r2 = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: [] }),
    });
    assert.strictEqual(r2.status, 400);

    // Non-array
    const r3 = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: 'not-an-array' }),
    });
    assert.strictEqual(r3.status, 400);

    // Array containing non-integer / string
    const r4 = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: [1, 'abc', 3] }),
    });
    assert.strictEqual(r4.status, 400);

    // Array containing float or negative
    const r5 = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: [1, -5] }),
    });
    assert.strictEqual(r5.status, 400);

    // Exceeding 500 limit
    const tooMany = Array.from({ length: 501 }, (_, i) => i + 1);
    const r6 = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: tooMany }),
    });
    assert.strictEqual(r6.status, 400);
    const d6 = await r6.json();
    assert.ok(d6.error.includes('500'));
  });

  // 14. Duplicate loan IDs are handled deterministically
  test('14. Duplicate loan IDs are handled deterministically', async () => {
    const { loan } = await createIssuedLoan('DUP-TEST');

    const res = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: [loan.id, loan.id] }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.total, 2);
    assert.strictEqual(data.successful, 1);
    assert.strictEqual(data.failed, 1);

    // First instance succeeded
    assert.strictEqual(data.returnedLoans[0].loanId, loan.id);
    assert.strictEqual(data.returnedLoans[0].status, LoanStatus.RETURNED);

    // Second instance produced clear duplicate error
    assert.strictEqual(data.errors[0].loanId, loan.id);
    assert.ok(data.errors[0].error.toLowerCase().includes('duplicate'));

    // Exactly one RETURNED history event created
    const history = await prisma.loanHistory.findMany({
      where: { loanId: loan.id, type: LoanHistoryType.RETURNED },
    });
    assert.strictEqual(history.length, 1);
  });

  // 15. No loan-history records are created for failed returns
  test('15. No loan-history records are created for failed returns', async () => {
    const fakeId = 6666666;

    const res = await fetch(`${baseUrl}/api/loans/bulk-return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loanIds: [fakeId] }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.failed, 1);

    const history = await prisma.loanHistory.findMany({
      where: { loanId: fakeId },
    });
    assert.strictEqual(history.length, 0);
  });

  // 16. Existing single return endpoint remains unchanged
  test('16. Existing single return endpoint (POST /api/loans/:id/return) remains unchanged', async () => {
    const { loan } = await createIssuedLoan('SINGLE-RET');

    const res = await fetch(`${baseUrl}/api/loans/${loan.id}/return`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ note: 'Single return check' }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.loan.status, LoanStatus.RETURNED);
  });
});

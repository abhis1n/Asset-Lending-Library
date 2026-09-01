const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');
const prisma = require('../src/prisma');

let server;
let baseUrl;

let librarianToken;
let librarianId;
let librarian2Id;
let member1Token;
let member1Id;
let member2Token;
let member2Id;

let activeItemId1;
let activeItemId2;
let activeItemId3;
let archivedItemId;

describe('Loan Lifecycle, Invariants, and History Integration Tests', () => {
  before(async () => {
    // Start server on an ephemeral port
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // 1. Authenticate librarian
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

    // 2. Fetch second librarian id for testing
    const lib2 = await prisma.user.findUnique({
      where: { email: 'david.librarian@library.org' },
    });
    librarian2Id = lib2.id;

    // 3. Authenticate member 1 (Alice)
    const mem1Res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice.member@example.com',
        password: 'Password123!',
      }),
    });
    const mem1Data = await mem1Res.json();
    member1Token = mem1Data.token;
    member1Id = mem1Data.user.id;

    // 4. Authenticate member 2 (Bob)
    const mem2Res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bob.member@example.com',
        password: 'Password123!',
      }),
    });
    const mem2Data = await mem2Res.json();
    member2Token = mem2Data.token;
    member2Id = mem2Data.user.id;

    // 5. Create test items for this test suite
    const item1 = await prisma.item.create({
      data: {
        title: 'Lifecycle Test Item 1',
        category: 'Test Category',
        identifyingCode: `TST-ITM-1-${Date.now()}`,
        archived: false,
      },
    });
    activeItemId1 = item1.id;

    const item2 = await prisma.item.create({
      data: {
        title: 'Lifecycle Test Item 2',
        category: 'Test Category',
        identifyingCode: `TST-ITM-2-${Date.now()}`,
        archived: false,
      },
    });
    activeItemId2 = item2.id;

    const item3 = await prisma.item.create({
      data: {
        title: 'Lifecycle Test Item 3',
        category: 'Test Category',
        identifyingCode: `TST-ITM-3-${Date.now()}`,
        archived: false,
      },
    });
    activeItemId3 = item3.id;

    const itemArchived = await prisma.item.create({
      data: {
        title: 'Archived Test Item',
        category: 'Test Category',
        identifyingCode: `TST-ITM-ARC-${Date.now()}`,
        archived: true,
      },
    });
    archivedItemId = itemArchived.id;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await prisma.$disconnect();
  });

  let createdLoanId;

  // --- SECTION 1: LOAN CREATION & REQUEST ---

  test('1. Member can request an active item (201 Created)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        itemId: activeItemId1,
        note: 'Member request for testing',
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.status, 'REQUESTED');
    assert.strictEqual(data.loan.borrowerId, member1Id);
    assert.strictEqual(data.loan.itemId, activeItemId1);
    assert.strictEqual(data.loan.dueDate, null);
    createdLoanId = data.loan.id;
  });

  test('2. Member cannot request an archived item (409 Conflict)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        itemId: archivedItemId,
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.ok(data.error.includes('archived'));
  });

  test('3. Non-existent item request returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        itemId: 999999,
      }),
    });

    assert.strictEqual(res.status, 404);
  });

  test('4. Librarian can create a loan directly for a member (201 Created)', async () => {
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: activeItemId2,
        borrowerId: member2Id,
        dueDate,
        status: 'ISSUED',
        note: 'Direct librarian checkout',
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.status, 'ISSUED');
    assert.strictEqual(data.loan.borrowerId, member2Id);
    assert.strictEqual(data.loan.itemId, activeItemId2);
    assert.ok(data.loan.dueDate);
  });

  test('5. Librarian cannot create a loan for another librarian (400 Bad Request)', async () => {
    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: activeItemId3,
        borrowerId: librarian2Id,
        dueDate: new Date().toISOString(),
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('role MEMBER'));
  });

  test('6. Non-existent borrower returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: activeItemId3,
        borrowerId: 999999,
        dueDate: new Date().toISOString(),
      }),
    });

    assert.strictEqual(res.status, 404);
  });

  // --- SECTION 2: OPEN-LOAN INVARIANT & CONCURRENCY ---

  test('7. Cannot request an item that already has a REQUESTED loan (409 Conflict)', async () => {
    // activeItemId1 has loan in REQUESTED status
    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member2Token}`,
      },
      body: JSON.stringify({
        itemId: activeItemId1,
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.ok(data.error.includes('open loan'));
  });

  test('8. Cannot request an item that already has an ISSUED loan (409 Conflict)', async () => {
    // activeItemId2 has loan in ISSUED status
    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        itemId: activeItemId2,
      }),
    });

    assert.strictEqual(res.status, 409);
  });

  test('9. Concurrency: 10 concurrent requests for same available item result in exactly 1 success and 9 conflicts', async () => {
    // activeItemId3 is currently available
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        fetch(`${baseUrl}/api/loans/request`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${member1Token}`,
          },
          body: JSON.stringify({
            itemId: activeItemId3,
            note: `Concurrent request attempt ${i + 1}`,
          }),
        })
      );
    }

    const responses = await Promise.all(promises);
    const statuses = responses.map((r) => r.status);

    const successCount = statuses.filter((s) => s === 201).length;
    const conflictCount = statuses.filter((s) => s === 409).length;

    assert.strictEqual(successCount, 1, 'Exactly 1 concurrent request should succeed');
    assert.strictEqual(conflictCount, 9, 'All other 9 concurrent requests should receive 409 Conflict');

    // Verify only 1 open loan exists in DB for activeItemId3
    const dbLoans = await prisma.loan.findMany({
      where: {
        itemId: activeItemId3,
        status: { in: ['REQUESTED', 'ISSUED'] },
      },
    });
    assert.strictEqual(dbLoans.length, 1);
  });

  // --- SECTION 3: LIFECYCLE TRANSITIONS ---

  test('10. Invalid transition: Cannot return a REQUESTED loan (409 Conflict)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/${createdLoanId}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.ok(data.error.includes('REQUESTED'));
  });

  test('11. Invalid transition: Cannot mark a REQUESTED loan as lost (409 Conflict)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/${createdLoanId}/lost`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 409);
  });

  test('12. Valid transition: REQUESTED -> ISSUED succeeds (200 OK)', async () => {
    const dueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${baseUrl}/api/loans/${createdLoanId}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        dueDate,
        note: 'Issued to member for project',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.loan.status, 'ISSUED');
    assert.ok(data.loan.dueDate);
  });

  test('13. Invalid transition: Cannot re-issue an already ISSUED loan (409 Conflict)', async () => {
    const dueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${baseUrl}/api/loans/${createdLoanId}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({ dueDate }),
    });

    assert.strictEqual(res.status, 409);
  });

  test('14. Valid transition: ISSUED -> RETURNED succeeds (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/${createdLoanId}/return`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        note: 'Returned on time and in good condition',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.loan.status, 'RETURNED');
  });

  test('15. A RETURNED loan does not block a new loan request for the item (201 Created)', async () => {
    // activeItemId1 is now free because createdLoanId is RETURNED
    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member2Token}`,
      },
      body: JSON.stringify({
        itemId: activeItemId1,
        note: 'New request after previous loan was returned',
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.status, 'REQUESTED');
    assert.strictEqual(data.loan.borrowerId, member2Id);

    // Issue this new loan and then mark it LOST to test LOST lifecycle
    const issueRes = await fetch(`${baseUrl}/api/loans/${data.loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
    assert.strictEqual(issueRes.status, 200);

    // Valid transition: ISSUED -> LOST
    const lostRes = await fetch(`${baseUrl}/api/loans/${data.loan.id}/lost`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        note: 'Reported lost by borrower',
      }),
    });
    assert.strictEqual(lostRes.status, 200);
    const lostData = await lostRes.json();
    assert.strictEqual(lostData.loan.status, 'LOST');
  });

  test('16. A LOST loan does not block a new loan request for the item (201 Created)', async () => {
    // activeItemId1 is available again because previous loan was marked LOST
    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        itemId: activeItemId1,
        note: 'New request on item previously marked lost',
      }),
    });

    assert.strictEqual(res.status, 201);
  });

  // --- SECTION 4: IMMUTABLE AUDIT HISTORY TIMELINE ---

  test('17. History timeline for loan is complete, chronological, and sanitized', async () => {
    const res = await fetch(`${baseUrl}/api/loans/${createdLoanId}/history`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.loanId, createdLoanId);
    assert.ok(data.history.length >= 3, 'Should have REQUESTED, ISSUED, RETURNED events');

    const types = data.history.map((h) => h.type);
    assert.deepStrictEqual(types, ['REQUESTED', 'ISSUED', 'RETURNED']);

    // Check actors
    assert.strictEqual(data.history[0].actor.id, member1Id);
    assert.strictEqual(data.history[1].actor.id, librarianId);
    assert.strictEqual(data.history[2].actor.id, librarianId);

    // Verify timestamps are strictly non-decreasing (chronological)
    for (let i = 1; i < data.history.length; i++) {
      const prev = new Date(data.history[i - 1].createdAt).getTime();
      const curr = new Date(data.history[i].createdAt).getTime();
      assert.ok(curr >= prev, 'Timeline must be in chronological order');
    }

    // Verify sensitive fields like passwordHash are omitted
    data.history.forEach((h) => {
      assert.strictEqual(h.actor.passwordHash, undefined);
    });
  });

  // --- SECTION 5: AUTHORIZATION & PERMISSIONS ---

  test('18. Member cannot issue a loan (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/${createdLoanId}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        dueDate: new Date().toISOString(),
      }),
    });

    assert.strictEqual(res.status, 403);
  });

  test('19. Member cannot return a loan (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/${createdLoanId}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${member1Token}` },
    });

    assert.strictEqual(res.status, 403);
  });

  test('20. Member cannot mark a loan as lost (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/${createdLoanId}/lost`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${member1Token}` },
    });

    assert.strictEqual(res.status, 403);
  });

  test('21. Member cannot view another member’s loan details (403 Forbidden)', async () => {
    // createdLoanId belongs to member1Id (Alice). Member 2 (Bob) tries to access it.
    const res = await fetch(`${baseUrl}/api/loans/${createdLoanId}`, {
      headers: { Authorization: `Bearer ${member2Token}` },
    });

    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.includes('Access forbidden'));
  });

  test('22. Member cannot view another member’s loan history (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/${createdLoanId}/history`, {
      headers: { Authorization: `Bearer ${member2Token}` },
    });

    assert.strictEqual(res.status, 403);
  });

  test('23. Member can retrieve their own loan details (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/${createdLoanId}`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.loan.id, createdLoanId);
    assert.strictEqual(data.loan.borrower.id, member1Id);
  });

  test('24. Member can retrieve their own loan list via GET /api/me/loans (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/me/loans`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.borrowerId, member1Id);
    assert.ok(Array.isArray(data.loans));
    assert.ok(data.loans.length > 0);
    data.loans.forEach((loan) => {
      assert.strictEqual(loan.borrowerId, member1Id);
      assert.strictEqual(typeof loan.isOverdue, 'boolean');
    });
  });
});

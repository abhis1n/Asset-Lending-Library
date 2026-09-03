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
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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

  // --- SECTION 6: COMPREHENSIVE TRANSITION & HISTORY ATOMICITY CHECKS ---

  test('25. Explicit transition: ISSUED -> LOST succeeds and creates LOST history', async () => {
    // Create new item and direct issued loan
    const testItem = await prisma.item.create({
      data: {
        title: 'Lost Transition Test Item',
        category: 'Test Category',
        identifyingCode: `TST-LOST-${Date.now()}`,
        archived: false,
      },
    });

    const createRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: testItem.id,
        borrowerId: member1Id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'ISSUED',
        note: 'Initial checkout before loss',
      }),
    });
    assert.strictEqual(createRes.status, 201);
    const loan = (await createRes.json()).loan;

    // Transition ISSUED -> LOST
    const lostRes = await fetch(`${baseUrl}/api/loans/${loan.id}/lost`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({ note: 'Camera damaged and lost in field' }),
    });

    assert.strictEqual(lostRes.status, 200);
    const lostData = await lostRes.json();
    assert.strictEqual(lostData.loan.status, 'LOST');

    // Check history
    const histRes = await fetch(`${baseUrl}/api/loans/${loan.id}/history`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    const histData = await histRes.json();
    assert.strictEqual(histData.history.length, 2);
    assert.strictEqual(histData.history[1].type, 'LOST');
    assert.strictEqual(histData.history[1].note, 'Camera damaged and lost in field');
  });

  test('26. An overdue ISSUED loan still blocks a new loan request (409 Conflict)', async () => {
    const overdueItem = await prisma.item.create({
      data: {
        title: 'Overdue Block Test Item',
        category: 'Test Category',
        identifyingCode: `TST-OVRD-${Date.now()}`,
        archived: false,
      },
    });

    // Create loan in DB that is already overdue (due 3 days ago)
    const overdueDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const loan = await prisma.loan.create({
      data: {
        itemId: overdueItem.id,
        borrowerId: member1Id,
        dueDate: overdueDate,
        status: 'ISSUED',
        requestedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    });
    assert.strictEqual(loan.status, 'ISSUED');

    // Another member attempts to request this overdue item
    const reqRes = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member2Token}`,
      },
      body: JSON.stringify({ itemId: overdueItem.id }),
    });

    assert.strictEqual(reqRes.status, 409);
    const reqData = await reqRes.json();
    assert.ok(reqData.error.includes('open loan'));
  });

  test('27. Invalid transitions: RETURNED -> ISSUED and RETURNED -> LOST are rejected (409)', async () => {
    // Create item and return the loan
    const testItem = await prisma.item.create({
      data: {
        title: 'Returned Item Transitions',
        category: 'Test Category',
        identifyingCode: `TST-RET-INV-${Date.now()}`,
        archived: false,
      },
    });

    const createRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: testItem.id,
        borrowerId: member1Id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'ISSUED',
      }),
    });
    const loan = (await createRes.json()).loan;

    // Return the loan
    const retRes = await fetch(`${baseUrl}/api/loans/${loan.id}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(retRes.status, 200);

    // 27a. Attempt RETURNED -> ISSUED
    const reIssueRes = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
    assert.strictEqual(reIssueRes.status, 409);
    const reIssueData = await reIssueRes.json();
    assert.ok(reIssueData.error.includes('RETURNED'));

    // 27b. Attempt RETURNED -> LOST
    const retLostRes = await fetch(`${baseUrl}/api/loans/${loan.id}/lost`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(retLostRes.status, 409);
    const retLostData = await retLostRes.json();
    assert.ok(retLostData.error.includes('RETURNED'));
  });

  test('28. Invalid transitions: LOST -> ISSUED and LOST -> RETURNED are rejected (409)', async () => {
    // Create item and mark loan as lost
    const testItem = await prisma.item.create({
      data: {
        title: 'Lost Item Transitions',
        category: 'Test Category',
        identifyingCode: `TST-LST-INV-${Date.now()}`,
        archived: false,
      },
    });

    const createRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: testItem.id,
        borrowerId: member1Id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'ISSUED',
      }),
    });
    const loan = (await createRes.json()).loan;

    // Mark LOST
    const lostRes = await fetch(`${baseUrl}/api/loans/${loan.id}/lost`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(lostRes.status, 200);

    // 28a. Attempt LOST -> ISSUED
    const reIssueRes = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
    assert.strictEqual(reIssueRes.status, 409);
    const reIssueData = await reIssueRes.json();
    assert.ok(reIssueData.error.includes('LOST'));

    // 28b. Attempt LOST -> RETURNED
    const lostRetRes = await fetch(`${baseUrl}/api/loans/${loan.id}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(lostRetRes.status, 409);
    const lostRetData = await lostRetRes.json();
    assert.ok(lostRetData.error.includes('LOST'));
  });

  test('29. Successful state transitions create exactly 1 history record; failed transitions create 0', async () => {
    const testItem = await prisma.item.create({
      data: {
        title: 'History Count Test Item',
        category: 'Test Category',
        identifyingCode: `TST-HIST-CNT-${Date.now()}`,
        archived: false,
      },
    });

    // 1. Request loan -> history count = 1
    const reqRes = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({ itemId: testItem.id }),
    });
    const loan = (await reqRes.json()).loan;

    const hist1 = await prisma.loanHistory.count({ where: { loanId: loan.id } });
    assert.strictEqual(hist1, 1);

    // 2. Failed invalid transition (attempt return on requested) -> history count remains 1
    const failRes = await fetch(`${baseUrl}/api/loans/${loan.id}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(failRes.status, 409);

    const histAfterFail = await prisma.loanHistory.count({ where: { loanId: loan.id } });
    assert.strictEqual(histAfterFail, 1, 'Failed transition must create zero history records');

    // 3. Issue loan -> history count = 2
    const issueRes = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
    assert.strictEqual(issueRes.status, 200);

    const hist2 = await prisma.loanHistory.count({ where: { loanId: loan.id } });
    assert.strictEqual(hist2, 2);

    // 4. Return loan -> history count = 3
    const retRes = await fetch(`${baseUrl}/api/loans/${loan.id}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(retRes.status, 200);

    const hist3 = await prisma.loanHistory.count({ where: { loanId: loan.id } });
    assert.strictEqual(hist3, 3);
  });

  test('30. Librarian direct loan creation supports both REQUESTED and ISSUED states with atomic history', async () => {
    // 30a. Direct REQUESTED loan
    const itemA = await prisma.item.create({
      data: {
        title: 'Direct Requested Item',
        category: 'Test',
        identifyingCode: `DIR-REQ-${Date.now()}`,
        archived: false,
      },
    });

    const resReq = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: itemA.id,
        borrowerId: member1Id,
        status: 'REQUESTED',
        note: 'Librarian phone request on behalf of member',
      }),
    });
    assert.strictEqual(resReq.status, 201);
    const loanReq = (await resReq.json()).loan;
    assert.strictEqual(loanReq.status, 'REQUESTED');
    assert.strictEqual(loanReq.dueDate, null);

    const histReq = await prisma.loanHistory.findMany({ where: { loanId: loanReq.id } });
    assert.strictEqual(histReq.length, 1);
    assert.strictEqual(histReq[0].type, 'REQUESTED');
    assert.strictEqual(histReq[0].userId, librarianId);

    // 30b. Direct ISSUED loan without dueDate is rejected (400 Bad Request)
    const itemB = await prisma.item.create({
      data: {
        title: 'Direct Issued Missing Due Date',
        category: 'Test',
        identifyingCode: `DIR-NODUE-${Date.now()}`,
        archived: false,
      },
    });

    const resNoDue = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: itemB.id,
        borrowerId: member1Id,
        status: 'ISSUED',
        // missing dueDate
      }),
    });
    assert.strictEqual(resNoDue.status, 400);

    const loansInDb = await prisma.loan.findMany({ where: { itemId: itemB.id } });
    assert.strictEqual(loansInDb.length, 0, 'No loan created on invalid input');
  });

  // --- SECTION 6: DUE DATE BOUNDARY VALIDATION ---

  test('31. Due date cannot be in the past (400 Bad Request)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Past Due Date Test Item',
        category: 'Test',
        identifyingCode: `DUE-PAST-${Date.now()}`,
        archived: false,
      },
    });

    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: member1Id,
        status: 'ISSUED',
        dueDate: pastDate,
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('strictly after'));
  });

  test('32. Due date cannot be the same date as the issue date (400 Bad Request)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Same Date Due Date Test Item',
        category: 'Test',
        identifyingCode: `DUE-SAME-${Date.now()}`,
        archived: false,
      },
    });

    const todayDate = new Date().toISOString();
    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: member1Id,
        status: 'ISSUED',
        dueDate: todayDate,
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('cannot be the same date') || data.error.includes('strictly after'));
  });

  test('33. Due date strictly after issue date (tomorrow) succeeds (201 Created)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Tomorrow Due Date Test Item',
        category: 'Test',
        identifyingCode: `DUE-TOMORROW-${Date.now()}`,
        archived: false,
      },
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: member2Id,
        status: 'ISSUED',
        dueDate: tomorrow.toISOString(),
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.status, 'ISSUED');
  });

  test('34. Due date at exactly 1 month boundary succeeds (201 Created)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'One Month Due Date Test Item',
        category: 'Test',
        identifyingCode: `DUE-ONEMONTH-${Date.now()}`,
        archived: false,
      },
    });

    const oneMonth = new Date();
    const currentDay = oneMonth.getDate();
    oneMonth.setMonth(oneMonth.getMonth() + 1);
    if (oneMonth.getDate() !== currentDay) {
      oneMonth.setDate(0);
    }

    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: member2Id,
        status: 'ISSUED',
        dueDate: oneMonth.toISOString(),
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.status, 'ISSUED');
  });

  test('35. Due date strictly more than 1 month after issue date is rejected (400 Bad Request)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'More Than One Month Test Item',
        category: 'Test',
        identifyingCode: `DUE-OVERMONTH-${Date.now()}`,
        archived: false,
      },
    });

    const overMonth = new Date();
    const currentDay = overMonth.getDate();
    overMonth.setMonth(overMonth.getMonth() + 1);
    if (overMonth.getDate() !== currentDay) {
      overMonth.setDate(0);
    }
    overMonth.setDate(overMonth.getDate() + 2); // 2 days past 1 month

    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: member1Id,
        status: 'ISSUED',
        dueDate: overMonth.toISOString(),
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('1 month'));
  });

  test('36. POST /api/loans/:id/issue enforces due date rules on requested loans', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Issue Transition Due Date Test Item',
        category: 'Test',
        identifyingCode: `ISSUE-DUE-${Date.now()}`,
        archived: false,
      },
    });

    // Create requested loan
    const reqRes = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({ itemId: item.id }),
    });
    assert.strictEqual(reqRes.status, 201);
    const loan = (await reqRes.json()).loan;

    // 36a. Missing dueDate -> 400
    const resNoDue = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resNoDue.status, 400);

    // 36b. Same day dueDate -> 400
    const resSameDay = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({ dueDate: new Date().toISOString() }),
    });
    assert.strictEqual(resSameDay.status, 400);

    // 36c. > 1 month dueDate -> 400
    const resOver = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({ dueDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString() }),
    });
    assert.strictEqual(resOver.status, 400);

    // 36d. Valid dueDate (14 days) -> 200 OK
    const resValid = await fetch(`${baseUrl}/api/loans/${loan.id}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({ dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() }),
    });
    assert.strictEqual(resValid.status, 200);
    const issuedLoan = (await resValid.json()).loan;
    assert.strictEqual(issuedLoan.status, 'ISSUED');
    assert.ok(issuedLoan.dueDate);
  });

  // --- SECTION 7: BORROWER INPUT RESOLUTION & 409 CONFLICT UX ---

  test('37. Librarian can create loan using member email address (201 Created)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Email Borrower Test Item',
        category: 'Test',
        identifyingCode: `BORR-EMAIL-${Date.now()}`,
        archived: false,
      },
    });

    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: 'alice.member@example.com',
        status: 'ISSUED',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.borrower.email, 'alice.member@example.com');
  });

  test('38. Librarian cannot create loan using non-existent email (404 Not Found)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Nonexistent Email Test Item',
        category: 'Test',
        identifyingCode: `NONEXIST-EMAIL-${Date.now()}`,
        archived: false,
      },
    });

    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: 'nobody@example.com',
        status: 'ISSUED',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.ok(data.error.includes('nobody@example.com'));
  });

  test('39. Librarian cannot create loan for librarian email (400 Bad Request)', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Librarian Email Target Test Item',
        category: 'Test',
        identifyingCode: `LIB-TARGET-${Date.now()}`,
        archived: false,
      },
    });

    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: 'david.librarian@library.org',
        status: 'ISSUED',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('role MEMBER'));
  });

  test('40. Create loan returns clear 409 Conflict reason when item has open loan', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Conflict Reason Test Item',
        category: 'Test',
        identifyingCode: `CONFLICT-REASON-${Date.now()}`,
        archived: false,
      },
    });

    // Create first open loan
    const firstRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: member1Id,
        status: 'ISSUED',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
    assert.strictEqual(firstRes.status, 201);

    // Attempt second loan for same item
    const conflictRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: member2Id,
        status: 'ISSUED',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    assert.strictEqual(conflictRes.status, 409);
    const conflictData = await conflictRes.json();
    assert.ok(conflictData.error.includes('open loan'));
    assert.ok(conflictData.error.includes('Conflict Reason Test Item'));
  });
});


const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../src/index');
const prisma = require('../src/prisma');
const { JWT_SECRET } = require('../src/middleware/auth');
const { LoanStatus, LoanHistoryType } = require('@prisma/client');

let server;
let baseUrl;

describe('Maximum Borrowing Limit (2 Active Items) Integration Tests', () => {
  before(async () => {
    // Start server on an ephemeral port
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

  // Helper to create a fresh, isolated member and generate valid JWT token
  async function createMember() {
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const user = await prisma.user.create({
      data: {
        email: `limit-test-${Date.now()}-${Math.floor(Math.random() * 1000000)}@example.com`,
        passwordHash,
        role: 'MEMBER',
      },
    });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    return { user, token };
  }

  // Helper to create a fresh catalogue item
  async function createItem(customTitle) {
    const code = `BL-ITEM-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    return await prisma.item.create({
      data: {
        title: customTitle || `Borrow Limit Test Item (${code})`,
        category: 'Electronics',
        identifyingCode: code,
        archived: false,
      },
    });
  }

  // Helper to create a direct loan for a user in a specific status
  async function createLoanDirect(borrowerId, itemId, status) {
    const requestedAt = new Date();
    const dueDate = new Date(requestedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    const loan = await prisma.loan.create({
      data: {
        itemId,
        borrowerId,
        borrowDurationDays: 14,
        requestedAt,
        dueDate,
        status,
      },
    });
    await prisma.loanHistory.create({
      data: {
        loanId: loan.id,
        type: status === LoanStatus.ISSUED ? LoanHistoryType.ISSUED : LoanHistoryType.REQUESTED,
        userId: borrowerId,
      },
    });
    return loan;
  }

  test('1. Member with 0 active loans can request an item (201 Created)', async () => {
    const { token, user } = await createMember();
    const item = await createItem('Item for 0 active member');

    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowDurationDays: 14,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.borrowerId, user.id);
    assert.strictEqual(data.loan.status, 'REQUESTED');
  });

  test('2. Member with 1 active loan can request another item (201 Created)', async () => {
    const { token, user } = await createMember();
    const item1 = await createItem('Active Item 1');
    const item2 = await createItem('Active Item 2');

    // Create 1 active loan (REQUESTED)
    await createLoanDirect(user.id, item1.id, LoanStatus.REQUESTED);

    // Request second item
    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        itemId: item2.id,
        borrowDurationDays: 7,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.status, 'REQUESTED');
    assert.strictEqual(data.loan.borrowerId, user.id);
  });

  test('3. Member with 2 active loans (both REQUESTED) receives HTTP 409', async () => {
    const { token, user } = await createMember();
    const item1 = await createItem('Requested Item 1');
    const item2 = await createItem('Requested Item 2');
    const item3 = await createItem('Attempted Item 3');

    // Establish 2 REQUESTED loans
    await createLoanDirect(user.id, item1.id, LoanStatus.REQUESTED);
    await createLoanDirect(user.id, item2.id, LoanStatus.REQUESTED);

    // Attempt 3rd loan
    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        itemId: item3.id,
        borrowDurationDays: 14,
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(
      data.error,
      'You cannot borrow this item because you already have 2 requested or issued items, which is the borrowing limit.'
    );
  });

  test('4. REQUESTED + ISSUED correctly counts as 2 and blocks 3rd loan (409 Conflict)', async () => {
    const { token, user } = await createMember();
    const item1 = await createItem('Req Item');
    const item2 = await createItem('Iss Item');
    const item3 = await createItem('Blocked Item');

    // 1 REQUESTED + 1 ISSUED = 2 active
    await createLoanDirect(user.id, item1.id, LoanStatus.REQUESTED);
    await createLoanDirect(user.id, item2.id, LoanStatus.ISSUED);

    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        itemId: item3.id,
        borrowDurationDays: 14,
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(
      data.error,
      'You cannot borrow this item because you already have 2 requested or issued items, which is the borrowing limit.'
    );
  });

  test('5. Two ISSUED loans count as 2 active loans and block new requests (409 Conflict)', async () => {
    const { token, user } = await createMember();
    const item1 = await createItem('Issued Item 1');
    const item2 = await createItem('Issued Item 2');
    const item3 = await createItem('Attempt Item');

    await createLoanDirect(user.id, item1.id, LoanStatus.ISSUED);
    await createLoanDirect(user.id, item2.id, LoanStatus.ISSUED);

    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        itemId: item3.id,
        borrowDurationDays: 14,
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(
      data.error,
      'You cannot borrow this item because you already have 2 requested or issued items, which is the borrowing limit.'
    );
  });

  test('6. RETURNED and LOST loans do not count toward limit (2 RETURNED + 1 ISSUED -> can request)', async () => {
    const { token, user } = await createMember();
    const item1 = await createItem('Returned Item 1');
    const item2 = await createItem('Returned Item 2');
    const item3 = await createItem('Issued Item 1');
    const item4 = await createItem('New Request Item');

    // 2 RETURNED + 1 ISSUED = only 1 active loan
    await createLoanDirect(user.id, item1.id, LoanStatus.RETURNED);
    await createLoanDirect(user.id, item2.id, LoanStatus.RETURNED);
    await createLoanDirect(user.id, item3.id, LoanStatus.ISSUED);

    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        itemId: item4.id,
        borrowDurationDays: 14,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.status, 'REQUESTED');
  });

  test('7. LOST loans do not count toward limit (1 LOST + 1 ISSUED -> can request)', async () => {
    const { token, user } = await createMember();
    const item1 = await createItem('Lost Item 1');
    const item2 = await createItem('Issued Item 1');
    const item3 = await createItem('New Request Item');

    // 1 LOST + 1 ISSUED = only 1 active loan
    await createLoanDirect(user.id, item1.id, LoanStatus.LOST);
    await createLoanDirect(user.id, item2.id, LoanStatus.ISSUED);

    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        itemId: item3.id,
        borrowDurationDays: 14,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.status, 'REQUESTED');
  });

  test('8. 409 response contains exact clear borrowing-limit error message', async () => {
    const { token, user } = await createMember();
    const item1 = await createItem('L1');
    const item2 = await createItem('L2');
    const item3 = await createItem('L3');

    await createLoanDirect(user.id, item1.id, LoanStatus.REQUESTED);
    await createLoanDirect(user.id, item2.id, LoanStatus.ISSUED);

    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        itemId: item3.id,
        borrowDurationDays: 14,
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(
      data.error,
      'You cannot borrow this item because you already have 2 requested or issued items, which is the borrowing limit.'
    );
  });

  test('9. Other 409 errors (e.g. item open loan conflict) preserve their existing error messages', async () => {
    const { token: member1Token, user: member1 } = await createMember();
    const { token: member2Token } = await createMember();

    const item = await createItem('Conflicted Exclusive Item');

    // Member 1 requests item (active loan = 1)
    await createLoanDirect(member1.id, item.id, LoanStatus.REQUESTED);

    // Member 2 (who has 0 active loans) tries to request the same item
    const res = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member2Token}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowDurationDays: 14,
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    // Must be item conflict message, NOT borrowing limit message
    assert.ok(
      data.error.includes('currently has an open loan'),
      `Expected item open loan message, got: ${data.error}`
    );
    assert.ok(
      !data.error.includes('borrowing limit'),
      'Should not return borrowing limit message for item conflict'
    );
  });

  test('10. Concurrency: Two simultaneous requests cannot bypass the 2-item limit', async () => {
    const { token, user } = await createMember();
    const item1 = await createItem('Initial Active Item');
    const itemA = await createItem('Concurrent Item A');
    const itemB = await createItem('Concurrent Item B');

    // Member starts with 1 active loan
    await createLoanDirect(user.id, item1.id, LoanStatus.ISSUED);

    // Dispatch two simultaneous loan requests for different items
    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/loans/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          itemId: itemA.id,
          borrowDurationDays: 7,
        }),
      }),
      fetch(`${baseUrl}/api/loans/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          itemId: itemB.id,
          borrowDurationDays: 7,
        }),
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepStrictEqual(
      statuses,
      [201, 409],
      `Expected exactly one request to succeed (201) and one to fail with 409, but got ${resA.status} and ${resB.status}`
    );

    const errorRes = resA.status === 409 ? resA : resB;
    const errorData = await errorRes.json();
    assert.strictEqual(
      errorData.error,
      'You cannot borrow this item because you already have 2 requested or issued items, which is the borrowing limit.'
    );

    // Verify member has exactly 2 active loans in database
    const activeCount = await prisma.loan.count({
      where: {
        borrowerId: user.id,
        status: { in: [LoanStatus.REQUESTED, LoanStatus.ISSUED] },
      },
    });
    assert.strictEqual(activeCount, 2, 'Member must end up with exactly 2 active loans');
  });
});

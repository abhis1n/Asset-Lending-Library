const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');
const prisma = require('../src/prisma');

let server;
let baseUrl;

let librarianToken;
let memberToken;
let memberId;

describe('Catalogue Item Availability Integration Tests', () => {
  before(async () => {
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

  // Helper to create an item
  async function createTestItem(prefix) {
    const code = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const res = await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        title: `Item ${prefix}`,
        category: 'Testing',
        identifyingCode: code,
      }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    return data.item;
  }

  // Helper to fetch item by ID using member token
  async function fetchItemAsMember(itemId) {
    const res = await fetch(`${baseUrl}/api/items/${itemId}`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    return data.item;
  }

  // 1. Item with no loans -> Available
  test('1. Item with no loans → Available', async () => {
    const item = await createTestItem('NO-LOANS');

    // Direct detail
    const fetched = await fetchItemAsMember(item.id);
    assert.strictEqual(fetched.isAvailable, true);
    assert.strictEqual(fetched.availability, 'Available');

    // In catalogue list
    const listRes = await fetch(`${baseUrl}/api/items`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    const listData = await listRes.json();
    const found = listData.items.find((i) => i.id === item.id);
    assert.ok(found);
    assert.strictEqual(found.isAvailable, true);
    assert.strictEqual(found.availability, 'Available');
  });

  // 2. Item with a REQUESTED loan -> Unavailable
  test('2. Item with a REQUESTED loan → Unavailable', async () => {
    const item = await createTestItem('REQ-LOAN');

    // Member requests the item
    const reqRes = await fetch(`${baseUrl}/api/loans/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowDurationDays: 14,
        note: 'Requesting test item',
      }),
    });
    assert.strictEqual(reqRes.status, 201);

    const fetched = await fetchItemAsMember(item.id);
    assert.strictEqual(fetched.isAvailable, false);
    assert.strictEqual(fetched.availability, 'Unavailable');
  });

  // 3. Item with an ISSUED loan -> Unavailable
  test('3. Item with an ISSUED loan → Unavailable', async () => {
    const item = await createTestItem('ISS-LOAN');

    // Member requests item
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
    const reqData = await reqRes.json();
    const loanId = reqData.loan.id;

    // Librarian issues the loan
    const issueRes = await fetch(`${baseUrl}/api/loans/${loanId}/issue`, {
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

    const fetched = await fetchItemAsMember(item.id);
    assert.strictEqual(fetched.isAvailable, false);
    assert.strictEqual(fetched.availability, 'Unavailable');
  });

  // 4. Item with a LOST loan -> Unavailable
  test('4. Item with a LOST loan → Unavailable', async () => {
    const item = await createTestItem('LOST-LOAN');

    // Issue loan
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
    const reqData = await reqRes.json();
    const loanId = reqData.loan.id;

    await fetch(`${baseUrl}/api/loans/${loanId}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    // Mark lost
    const lostRes = await fetch(`${baseUrl}/api/loans/${loanId}/lost`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({ note: 'Item was lost' }),
    });
    assert.strictEqual(lostRes.status, 200);

    const fetched = await fetchItemAsMember(item.id);
    assert.strictEqual(fetched.isAvailable, false);
    assert.strictEqual(fetched.availability, 'Unavailable');
  });

  // 5. Item with only a RETURNED loan -> Available
  test('5. Item with only a RETURNED loan → Available', async () => {
    const item = await createTestItem('RET-LOAN');

    // Request, Issue, Return
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
    const reqData = await reqRes.json();
    const loanId = reqData.loan.id;

    await fetch(`${baseUrl}/api/loans/${loanId}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    const retRes = await fetch(`${baseUrl}/api/loans/${loanId}/return`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({ note: 'Returned in perfect shape' }),
    });
    assert.strictEqual(retRes.status, 200);

    const fetched = await fetchItemAsMember(item.id);
    assert.strictEqual(fetched.isAvailable, true);
    assert.strictEqual(fetched.availability, 'Available');
  });

  // 6. Item with historical RETURNED loans and no current unavailable state -> Available
  test('6. Item with historical RETURNED loans and no current unavailable state → Available', async () => {
    const item = await createTestItem('MULTI-RET');

    // Create and return 2 successive loans
    for (let i = 0; i < 2; i++) {
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
      const reqData = await reqRes.json();
      const loanId = reqData.loan.id;

      await fetch(`${baseUrl}/api/loans/${loanId}/issue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${librarianToken}`,
        },
        body: JSON.stringify({
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      await fetch(`${baseUrl}/api/loans/${loanId}/return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${librarianToken}`,
        },
      });
    }

    // Historical loans exist, but no current unavailable loan
    const fetched = await fetchItemAsMember(item.id);
    assert.strictEqual(fetched.isAvailable, true);
    assert.strictEqual(fetched.availability, 'Available');
  });

  // 7. Availability changes correctly when a current REQUESTED/ISSUED loan is returned
  test('7. Availability changes correctly when a current REQUESTED/ISSUED loan is returned', async () => {
    const item = await createTestItem('TRANSITION-RET');

    // Start: item is Available
    let fetched = await fetchItemAsMember(item.id);
    assert.strictEqual(fetched.isAvailable, true);

    // Request: becomes Unavailable
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
    const reqData = await reqRes.json();
    const loanId = reqData.loan.id;

    fetched = await fetchItemAsMember(item.id);
    assert.strictEqual(fetched.isAvailable, false);
    assert.strictEqual(fetched.availability, 'Unavailable');

    // Issue: remains Unavailable
    await fetch(`${baseUrl}/api/loans/${loanId}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    fetched = await fetchItemAsMember(item.id);
    assert.strictEqual(fetched.isAvailable, false);
    assert.strictEqual(fetched.availability, 'Unavailable');

    // Return: becomes Available again
    const retRes = await fetch(`${baseUrl}/api/loans/${loanId}/return`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
    });
    assert.strictEqual(retRes.status, 200);

    fetched = await fetchItemAsMember(item.id);
    assert.strictEqual(fetched.isAvailable, true);
    assert.strictEqual(fetched.availability, 'Available');
  });

  // 8. Availability remains unavailable when an item is marked LOST
  test('8. Availability remains unavailable when an item is marked LOST', async () => {
    const item = await createTestItem('STAYS-LOST');

    // Issue loan
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
    const reqData = await reqRes.json();
    const loanId = reqData.loan.id;

    await fetch(`${baseUrl}/api/loans/${loanId}/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    // Before mark lost: unavailable
    let fetched = await fetchItemAsMember(item.id);
    assert.strictEqual(fetched.isAvailable, false);

    // Mark lost
    const lostRes = await fetch(`${baseUrl}/api/loans/${loanId}/lost`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({ note: 'Item marked lost' }),
    });
    assert.strictEqual(lostRes.status, 200);

    // After mark lost: remains unavailable
    fetched = await fetchItemAsMember(item.id);
    assert.strictEqual(fetched.isAvailable, false);
    assert.strictEqual(fetched.availability, 'Unavailable');
  });
});

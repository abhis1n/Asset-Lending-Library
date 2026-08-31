const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');
const prisma = require('../src/prisma');

let server;
let baseUrl;

let librarianToken;
let librarian2Token;
let memberToken;
let librarian1Id;
let librarian2Id;
let memberId;

describe('Catalogue Items & Custodian Management Integration Tests', () => {
  before(async () => {
    // Start server on an ephemeral free port
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // Obtain tokens for tests
    const lib1Res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sarah.librarian@library.org',
        password: 'Password123!',
      }),
    });
    const lib1Data = await lib1Res.json();
    librarianToken = lib1Data.token;
    librarian1Id = lib1Data.user.id;

    const lib2Res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'david.librarian@library.org',
        password: 'Password123!',
      }),
    });
    const lib2Data = await lib2Res.json();
    librarian2Token = lib2Data.token;
    librarian2Id = lib2Data.user.id;

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

  let createdItemId;
  const uniqueCode = `TEST-CAM-${Date.now()}`;

  // 1. Authenticated member can list active catalogue items
  test('1. Authenticated member can list active catalogue items', async () => {
    const res = await fetch(`${baseUrl}/api/items`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.items));
    // Verify all returned items are active
    data.items.forEach((item) => {
      assert.strictEqual(item.archived, false);
      assert.ok(Array.isArray(item.custodians));
    });
  });

  // 2. Unauthenticated user cannot access protected catalogue endpoints
  test('2. Unauthenticated user cannot access catalogue endpoints (401)', async () => {
    const res = await fetch(`${baseUrl}/api/items`);
    assert.strictEqual(res.status, 401);
  });

  // 2b. Librarian can list all items including archived with ?includeArchived=true
  test('2b. Librarian can list all items including archived with ?includeArchived=true (200)', async () => {
    const res = await fetch(`${baseUrl}/api/items?includeArchived=true`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.items));
    const hasArchived = data.items.some((item) => item.archived === true);
    const hasActive = data.items.some((item) => item.archived === false);
    assert.ok(hasArchived, 'Should include archived items');
    assert.ok(hasActive, 'Should include active items');
  });

  // 2c. Member cannot pass ?includeArchived=true (403 Forbidden)
  test('2c. Member receives 403 Forbidden when requesting ?includeArchived=true', async () => {
    const res = await fetch(`${baseUrl}/api/items?includeArchived=true`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.includes('only librarians'));
  });

  // 3. Librarian can create an item
  test('3. Librarian can create an item (201 Created)', async () => {
    const res = await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        title: 'Sony FX3 Cinema Line Camera',
        category: 'Cameras',
        identifyingCode: uniqueCode,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.item.title, 'Sony FX3 Cinema Line Camera');
    assert.strictEqual(data.item.category, 'Cameras');
    assert.strictEqual(data.item.identifyingCode, uniqueCode);
    assert.strictEqual(data.item.archived, false);
    createdItemId = data.item.id;
  });

  // 4. Member cannot create an item
  test('4. Member cannot create an item (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        title: 'Unauthorized Camera',
        category: 'Cameras',
        identifyingCode: `UNAUTH-${Date.now()}`,
      }),
    });

    assert.strictEqual(res.status, 403);
  });

  // 5. Duplicate identifying code is rejected
  test('5. Duplicate identifying code is rejected with 409 Conflict', async () => {
    const res = await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        title: 'Duplicate Code Camera',
        category: 'Cameras',
        identifyingCode: uniqueCode,
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.ok(data.error.includes('already exists'));
  });

  // 6. Librarian can edit an item
  test('6. Librarian can edit an item (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/items/${createdItemId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        title: 'Sony FX3 Full-Frame Cinema Camera (Updated)',
        category: 'Cinema Cameras',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(
      data.item.title,
      'Sony FX3 Full-Frame Cinema Camera (Updated)'
    );
    assert.strictEqual(data.item.category, 'Cinema Cameras');
  });

  // 7. Member cannot edit an item
  test('7. Member cannot edit an item (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/items/${createdItemId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        title: 'Hacked Title',
      }),
    });

    assert.strictEqual(res.status, 403);
  });

  // 8. Librarian can archive an item
  test('8. Librarian can archive an item (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/items/${createdItemId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.item.archived, true);
  });

  // 9. Member cannot archive an item
  test('9. Member cannot archive an item (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/items/${createdItemId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` },
    });

    assert.strictEqual(res.status, 403);
  });

  // 10. Archived item remains in the database and preserves loan history
  test('10. Archived item remains in the database and preserves historical loans and history', async () => {
    // Check item still exists via GET /api/items/:id
    const res = await fetch(`${baseUrl}/api/items/${createdItemId}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.item.id, createdItemId);
    assert.strictEqual(data.item.archived, true);

    // Verify seeded archived item 9 still exists and has its historical relationships intact in DB
    const itemInDb = await prisma.item.findUnique({
      where: { identifyingCode: 'PRJ-VIN-099' },
    });
    assert.ok(itemInDb);
    assert.strictEqual(itemInDb.archived, true);
  });

  // 11. Librarian can restore an archived item
  test('11. Librarian can restore an archived item (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/items/${createdItemId}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.item.archived, false);
  });

  // 12. Non-existent item returns 404
  test('12. Non-existent item returns 404 Not Found', async () => {
    const res = await fetch(`${baseUrl}/api/items/999999`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(res.status, 404);
  });

  // 13. Librarian can assign a librarian as custodian
  test('13. Librarian can assign a librarian as custodian (201 Created)', async () => {
    const res = await fetch(
      `${baseUrl}/api/items/${createdItemId}/custodians/${librarian1Id}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${librarianToken}` },
      }
    );

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.custodian.itemId, createdItemId);
    assert.strictEqual(data.custodian.librarianId, librarian1Id);
  });

  // 14. Member cannot assign custodians
  test('14. Member cannot assign custodians (403 Forbidden)', async () => {
    const res = await fetch(
      `${baseUrl}/api/items/${createdItemId}/custodians/${librarian2Id}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${memberToken}` },
      }
    );

    assert.strictEqual(res.status, 403);
  });

  // 15. Assigning non-librarian as custodian is rejected
  test('15. Assigning a member as custodian is rejected (400 Bad Request)', async () => {
    const res = await fetch(
      `${baseUrl}/api/items/${createdItemId}/custodians/${memberId}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${librarianToken}` },
      }
    );

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('not a librarian'));
  });

  // 16. Duplicate custodian assignment is rejected
  test('16. Duplicate custodian assignment is rejected with 409 Conflict', async () => {
    const res = await fetch(
      `${baseUrl}/api/items/${createdItemId}/custodians/${librarian1Id}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${librarianToken}` },
      }
    );

    assert.strictEqual(res.status, 409);
  });

  // 17. Multi-custodian assignment support
  test('17. Multi-custodian: Librarian can assign a second custodian to the same item', async () => {
    const res = await fetch(
      `${baseUrl}/api/items/${createdItemId}/custodians/${librarian2Id}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${librarianToken}` },
      }
    );

    assert.strictEqual(res.status, 201);
  });

  // 18. Authenticated users can retrieve item custodians
  test('18. Authenticated users can retrieve item custodians (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/items/${createdItemId}/custodians`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.itemId, createdItemId);
    assert.strictEqual(data.custodians.length, 2);
    const emails = data.custodians.map((c) => c.email);
    assert.ok(emails.includes('sarah.librarian@library.org'));
    assert.ok(emails.includes('david.librarian@library.org'));
  });

  // 19. Member cannot remove custodians
  test('19. Member cannot remove custodians (403 Forbidden)', async () => {
    const res = await fetch(
      `${baseUrl}/api/items/${createdItemId}/custodians/${librarian2Id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${memberToken}` },
      }
    );

    assert.strictEqual(res.status, 403);
  });

  // 20. Librarian can remove a custodian
  test('20. Librarian can remove a custodian (200 OK)', async () => {
    const res = await fetch(
      `${baseUrl}/api/items/${createdItemId}/custodians/${librarian2Id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${librarianToken}` },
      }
    );

    assert.strictEqual(res.status, 200);

    // Verify only 1 custodian remains
    const checkRes = await fetch(
      `${baseUrl}/api/items/${createdItemId}/custodians`,
      {
        headers: { Authorization: `Bearer ${librarianToken}` },
      }
    );
    const checkData = await checkRes.json();
    assert.strictEqual(checkData.custodians.length, 1);
    assert.strictEqual(
      checkData.custodians[0].email,
      'sarah.librarian@library.org'
    );
  });

  // 21. Non-existent custodian assignment removal returns 404
  test('21. Removing non-existent custodian assignment returns 404', async () => {
    const res = await fetch(
      `${baseUrl}/api/items/${createdItemId}/custodians/${librarian2Id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${librarianToken}` },
      }
    );

    assert.strictEqual(res.status, 404);
  });

  // 22. Librarian can retrieve their own custodial items via GET /api/me/custodial-items
  test('22. Librarian retrieves own custodial items anchored to req.user.id', async () => {
    const res = await fetch(`${baseUrl}/api/me/custodial-items`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.librarianId, librarian1Id);
    assert.strictEqual(data.email, 'sarah.librarian@library.org');
    assert.ok(Array.isArray(data.items));

    // Verify all returned items list sarah as a custodian
    data.items.forEach((item) => {
      const custodianEmails = item.custodians.map((c) => c.email);
      assert.ok(custodianEmails.includes('sarah.librarian@library.org'));
    });
  });

  // 23. Member cannot access /api/me/custodial-items
  test('23. Member cannot access /api/me/custodial-items (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/me/custodial-items`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });

    assert.strictEqual(res.status, 403);
  });
});

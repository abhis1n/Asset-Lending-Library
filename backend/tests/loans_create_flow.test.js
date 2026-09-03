const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');
const prisma = require('../src/prisma');

let server;
let baseUrl;

let librarianToken;
let librarianId;
let librarian2Id;
let member1Id;
let member1Email = 'alice.member@example.com';

describe('Librarian Loan Creation Flow Integration Tests', () => {
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
    librarianId = libData.user.id;

    // Fetch second librarian
    const lib2 = await prisma.user.findUnique({
      where: { email: 'david.librarian@library.org' },
    });
    librarian2Id = lib2.id;

    // Fetch member
    const mem1 = await prisma.user.findUnique({
      where: { email: member1Email },
    });
    member1Id = mem1.id;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await prisma.$disconnect();
  });

  test('1. librarian creates loan using valid member ID → succeeds', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Valid Member ID Loan Item',
        category: 'Electronics',
        identifyingCode: `VAL-ID-${Date.now()}`,
        archived: false,
      },
    });

    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
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
        dueDate,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.borrowerId, member1Id);
    assert.strictEqual(data.loan.status, 'ISSUED');
  });

  test('2. librarian creates loan using valid member email → succeeds', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Valid Member Email Loan Item',
        category: 'Electronics',
        identifyingCode: `VAL-EMAIL-${Date.now()}`,
        archived: false,
      },
    });

    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: member1Email,
        status: 'ISSUED',
        dueDate,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.loan.borrower.email, member1Email);
    assert.strictEqual(data.loan.status, 'ISSUED');
  });

  test('3. librarian borrower ID → 400 + useful error message', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Librarian ID Reject Item',
        category: 'Audio',
        identifyingCode: `LIB-ID-${Date.now()}`,
        archived: false,
      },
    });

    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: librarian2Id,
        status: 'ISSUED',
        dueDate,
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'The selected user is a librarian. Please select a member.');
  });

  test('4. librarian borrower email → 400 + useful error message', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Librarian Email Reject Item',
        category: 'Audio',
        identifyingCode: `LIB-EMAIL-${Date.now()}`,
        archived: false,
      },
    });

    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
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
        dueDate,
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'The selected user is a librarian. Please select a member.');
  });

  test('5. nonexistent borrower ID → 404 + useful error message', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Nonexistent ID Item',
        category: 'Lighting',
        identifyingCode: `NONEXIST-ID-${Date.now()}`,
        archived: false,
      },
    });

    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: 999999,
        status: 'ISSUED',
        dueDate,
      }),
    });

    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.error, 'No member found with that ID or email.');
  });

  test('6. nonexistent borrower email → 404 + useful error message', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Nonexistent Email Item',
        category: 'Lighting',
        identifyingCode: `NONEXIST-EMAIL-${Date.now()}`,
        archived: false,
      },
    });

    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${librarianToken}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        borrowerId: 'unknown.ghost@example.com',
        status: 'ISSUED',
        dueDate,
      }),
    });

    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.error, 'No member found with that ID or email.');
  });

  test('7. item with REQUESTED loan → 409 + useful availability message', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Requested Conflict Item',
        category: 'Tools',
        identifyingCode: `REQ-CONF-${Date.now()}`,
        archived: false,
      },
    });

    // Create open REQUESTED loan directly
    await prisma.loan.create({
      data: {
        itemId: item.id,
        borrowerId: member1Id,
        status: 'REQUESTED',
      },
    });

    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
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
        dueDate,
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(
      data.error,
      'This item is currently unavailable because it already has an open loan (status: REQUESTED).'
    );
  });

  test('8. item with ISSUED loan → 409 + useful availability message', async () => {
    const item = await prisma.item.create({
      data: {
        title: 'Issued Conflict Item',
        category: 'Tools',
        identifyingCode: `ISS-CONF-${Date.now()}`,
        archived: false,
      },
    });

    // Create open ISSUED loan directly
    await prisma.loan.create({
      data: {
        itemId: item.id,
        borrowerId: member1Id,
        status: 'ISSUED',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
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
        dueDate,
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(
      data.error,
      'This item is currently unavailable because it already has an open loan (status: ISSUED).'
    );
  });
});

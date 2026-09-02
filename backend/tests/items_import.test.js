const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');
const prisma = require('../src/prisma');

let server;
let baseUrl;

let librarianToken;
let memberToken;

describe('CSV Bulk Catalogue Import Integration Tests', () => {
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
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await prisma.$disconnect();
  });

  // 1. Unauthenticated request is rejected
  test('1. Unauthenticated request is rejected (401 Unauthorized)', async () => {
    const csvData = 'title,category,identifyingCode\nBook A,Fiction,CODE-AUTH-01';
    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csvData,
    });
    assert.strictEqual(res.status, 401);
  });

  // 2. Member request is rejected
  test('2. Member request is rejected (403 Forbidden)', async () => {
    const csvData = 'title,category,identifyingCode\nBook A,Fiction,CODE-MEM-01';
    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${memberToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });
    assert.strictEqual(res.status, 403);
  });

  // 3. Librarian can import valid rows
  test('3. Librarian can import valid rows (200 OK)', async () => {
    const code = `CSV-LIB-${Date.now()}-1`;
    const csvData = `title,category,identifyingCode,archived\nIntroduction to Algorithms,Computer Science,${code},false`;

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.summary.total, 1);
    assert.strictEqual(body.summary.successful, 1);
    assert.strictEqual(body.summary.failed, 0);
    assert.strictEqual(body.successfulItems.length, 1);
    assert.strictEqual(body.successfulItems[0].identifyingCode, code);
    assert.strictEqual(body.successfulItems[0].title, 'Introduction to Algorithms');
    assert.strictEqual(body.successfulItems[0].archived, false);

    // Verify persisted in DB
    const inDb = await prisma.item.findUnique({ where: { identifyingCode: code } });
    assert.ok(inDb);
    assert.strictEqual(inDb.title, 'Introduction to Algorithms');
  });

  // 4. Multiple valid rows are imported
  test('4. Multiple valid rows are imported', async () => {
    const timestamp = Date.now();
    const code1 = `CSV-MULTI-${timestamp}-1`;
    const code2 = `CSV-MULTI-${timestamp}-2`;
    const code3 = `CSV-MULTI-${timestamp}-3`;

    const csvData = [
      'title,category,identifyingCode,archived',
      `Item One,Tools,${code1},false`,
      `Item Two,Hardware,${code2},false`,
      `Item Three,Stationery,${code3},false`,
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.summary.total, 3);
    assert.strictEqual(body.summary.successful, 3);
    assert.strictEqual(body.summary.failed, 0);
    assert.strictEqual(body.successfulItems.length, 3);

    // Verify all in DB
    const items = await prisma.item.findMany({
      where: { identifyingCode: { in: [code1, code2, code3] } },
    });
    assert.strictEqual(items.length, 3);
  });

  // 5. Missing required fields produce row-level errors
  test('5. Missing required fields produce row-level errors', async () => {
    const timestamp = Date.now();
    const validCode = `CSV-REQ-${timestamp}-VALID`;
    const csvData = [
      'title,category,identifyingCode,archived',
      `,Technology,MISSING-TITLE-${timestamp},false`,
      `Missing Category,,MISSING-CAT-${timestamp},false`,
      `Missing Code,Technology,,false`,
      `Valid Item,Technology,${validCode},false`,
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.summary.total, 4);
    assert.strictEqual(body.summary.successful, 1);
    assert.strictEqual(body.summary.failed, 3);
    assert.strictEqual(body.errors.length, 3);

    // Check row numbers and messages
    assert.strictEqual(body.errors[0].row, 2);
    assert.ok(body.errors[0].error.toLowerCase().includes('title'));

    assert.strictEqual(body.errors[1].row, 3);
    assert.ok(body.errors[1].error.toLowerCase().includes('category'));

    assert.strictEqual(body.errors[2].row, 4);
    assert.ok(body.errors[2].error.toLowerCase().includes('identifying code'));

    // Verify the valid row was imported
    assert.strictEqual(body.successfulItems[0].identifyingCode, validCode);
  });

  // 6. Duplicate identifying codes produce row-level errors
  test('6. Duplicate identifying codes produce row-level errors', async () => {
    const dupCode = `CSV-DUP-${Date.now()}`;
    const csvData = [
      'title,category,identifyingCode,archived',
      `First Instance,Category A,${dupCode},false`,
      `Second Instance,Category B,${dupCode},false`,
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.summary.total, 2);
    assert.strictEqual(body.summary.successful, 1);
    assert.strictEqual(body.summary.failed, 1);
    assert.strictEqual(body.errors.length, 1);
    assert.strictEqual(body.errors[0].row, 3);
    assert.ok(body.errors[0].error.includes(dupCode));
  });

  // 7. A mixture of valid and invalid rows results in partial success
  test('7. A mixture of valid and invalid rows results in partial success', async () => {
    const timestamp = Date.now();
    const codeA = `CSV-MIX-${timestamp}-A`;
    const codeB = `CSV-MIX-${timestamp}-B`;

    const csvData = [
      'title,category,identifyingCode,archived',
      `Valid Item A,Cat A,${codeA},false`,
      `,No Title,FAIL-${timestamp}-1,false`,
      `Valid Item B,Cat B,${codeB},false`,
      `No Cat,,FAIL-${timestamp}-2,false`,
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.summary.total, 4);
    assert.strictEqual(body.summary.successful, 2);
    assert.strictEqual(body.summary.failed, 2);
    assert.strictEqual(body.successfulItems.length, 2);
    assert.strictEqual(body.errors.length, 2);
  });

  // 8. One failed row does not roll back successful rows from other rows
  test('8. One failed row does not roll back successful rows from other rows', async () => {
    const validCode = `CSV-INDEP-${Date.now()}-OK`;
    const csvData = [
      'title,category,identifyingCode',
      `Independent Success,Cat,${validCode}`,
      `,Cat,FAIL-ROW`,
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.summary.successful, 1);
    assert.strictEqual(body.summary.failed, 1);

    // Verify DB contains the successful item
    const item = await prisma.item.findUnique({ where: { identifyingCode: validCode } });
    assert.ok(item);
    assert.strictEqual(item.title, 'Independent Success');
  });

  // 9. Omitted archived defaults to false
  test('9. Omitted archived defaults to false', async () => {
    const code = `CSV-NOARCH-${Date.now()}`;
    const csvData = [
      'title,category,identifyingCode',
      `Default Not Archived,Literature,${code}`,
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.successfulItems[0].archived, false);

    const inDb = await prisma.item.findUnique({ where: { identifyingCode: code } });
    assert.strictEqual(inDb.archived, false);
  });

  // 10. Invalid archived values are rejected appropriately
  test('10. Invalid archived values are rejected appropriately', async () => {
    const code = `CSV-BADARCH-${Date.now()}`;
    const csvData = [
      'title,category,identifyingCode,archived',
      `Bad Archived Item,Science,${code},maybe`,
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.summary.successful, 0);
    assert.strictEqual(body.summary.failed, 1);
    assert.ok(body.errors[0].error.toLowerCase().includes('boolean'));

    // Verify not created in DB
    const inDb = await prisma.item.findUnique({ where: { identifyingCode: code } });
    assert.strictEqual(inDb, null);
  });

  // 11. More than 500 data rows is rejected
  test('11. More than 500 data rows is rejected (400 Bad Request)', async () => {
    const rows = ['title,category,identifyingCode'];
    for (let i = 1; i <= 501; i++) {
      rows.push(`Title ${i},Category,OVERLIMIT-${i}`);
    }
    const csvData = rows.join('\n');

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('500'));
  });

  // 12. Malformed CSV is handled appropriately
  test('12. Malformed CSV is handled appropriately (400 Bad Request)', async () => {
    const csvData = 'title,category,identifyingCode\n"Unclosed quoted string,Category,MALFORMED-01';

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.toLowerCase().includes('malformed'));
  });

  // 13. Existing identifying codes cannot be silently overwritten
  test('13. Existing identifying codes cannot be silently overwritten', async () => {
    const existingCode = `CSV-EXIST-${Date.now()}`;
    // Create initial item in DB
    const initialItem = await prisma.item.create({
      data: {
        title: 'Original Title',
        category: 'Original Category',
        identifyingCode: existingCode,
        archived: false,
      },
    });

    // Attempt import with same identifyingCode
    const csvData = [
      'title,category,identifyingCode',
      `Overwritten Attempt,Modified Category,${existingCode}`,
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.summary.successful, 0);
    assert.strictEqual(body.summary.failed, 1);
    assert.ok(body.errors[0].error.includes(existingCode));

    // Verify existing record was untouched in DB
    const afterItem = await prisma.item.findUnique({ where: { id: initialItem.id } });
    assert.strictEqual(afterItem.title, 'Original Title');
    assert.strictEqual(afterItem.category, 'Original Category');
  });

  // 14. Imported records contain only the expected catalogue fields
  test('14. Imported records contain only expected catalogue fields and no sensitive info', async () => {
    const code = `CSV-FIELDS-${Date.now()}`;
    const csvData = [
      'title,category,identifyingCode',
      `Field Check Item,General,${code}`,
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    const item = body.successfulItems[0];

    const expectedKeys = [
      'id',
      'title',
      'category',
      'identifyingCode',
      'archived',
      'createdAt',
      'updatedAt',
      'custodians',
    ];
    assert.deepStrictEqual(Object.keys(item).sort(), expectedKeys.sort());
    assert.strictEqual(item.password, undefined);
    assert.strictEqual(item.passwordHash, undefined);
    assert.strictEqual(item.token, undefined);
  });

  // 15. Handles quoted values and commas inside quoted fields correctly
  test('15. Handles quoted values and commas inside quoted fields correctly', async () => {
    const code = `CSV-COMMA-${Date.now()}`;
    const csvData = [
      'title,category,identifyingCode',
      `"Book, Volume 1: Principles, Patterns, and Practices",Software Engineering,${code}`,
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.summary.successful, 1);
    assert.strictEqual(
      body.successfulItems[0].title,
      'Book, Volume 1: Principles, Patterns, and Practices'
    );
    assert.strictEqual(body.successfulItems[0].category, 'Software Engineering');
  });

  // 16. Empty CSV content returns 400 Bad Request
  test('16. Empty CSV content returns 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: '   ',
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.toLowerCase().includes('empty'));
  });

  // 17. CSV with only headers and no data rows returns 400 Bad Request
  test('17. CSV with only headers and no data rows returns 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: 'title,category,identifyingCode\n',
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.toLowerCase().includes('no data rows'));
  });

  // 18. CSV with missing required headers returns 400 Bad Request
  test('18. CSV with missing required headers returns 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: 'name,department,serialNumber\nItem1,Dept1,SN001',
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.toLowerCase().includes('header'));
  });

  // 19. Explicit archived=true is honored
  test('19. Explicit archived=true imports item as archived', async () => {
    const code = `CSV-ARCH-TRUE-${Date.now()}`;
    const csvData = [
      'title,category,identifyingCode,archived',
      `Legacy Manual,Documentation,${code},true`,
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'text/csv',
      },
      body: csvData,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.successfulItems[0].archived, true);

    const inDb = await prisma.item.findUnique({ where: { identifyingCode: code } });
    assert.strictEqual(inDb.archived, true);
  });

  // 20. Supports JSON payload with { csv: "..." }
  test('20. Supports JSON payload with { csv: "..." }', async () => {
    const code = `CSV-JSON-${Date.now()}`;
    const csvData = [
      'title,category,identifyingCode,archived',
      `JSON Payload Item,Tech,${code},false`,
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/items/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarianToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ csv: csvData }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.summary.successful, 1);
    assert.strictEqual(body.successfulItems[0].identifyingCode, code);
  });
});

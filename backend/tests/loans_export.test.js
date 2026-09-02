const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { parse } = require('csv-parse/sync');
const app = require('../src/index');
const prisma = require('../src/prisma');
const { LoanStatus, LoanHistoryType } = require('@prisma/client');

let server;
let baseUrl;

let librarianToken;
let librarianId;
let member1Token;
let member1Id;
let member2Token;
let member2Id;

describe('Loan CSV Export Integration Tests', () => {
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
    librarianId = libData.user.id;

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
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await prisma.$disconnect();
  });

  // Helper to create test items and loans
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
    const res = await fetch(`${baseUrl}/api/loans/export`);
    assert.strictEqual(res.status, 401);
  });

  // 2. Member can export loans and receives text/csv
  test('2. Member can export loans and receives text/csv (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/loans/export`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });

    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(contentType && contentType.includes('text/csv'));
    const disposition = res.headers.get('content-disposition');
    assert.ok(disposition && disposition.includes('attachment'));
  });

  // 3. Member export contains only that member's loans
  test("3. Member export contains only that member's loans", async () => {
    const timestamp = Date.now();
    await seedLoan({
      borrowerId: member1Id,
      title: `Alice Loan ${timestamp}`,
      category: 'AliceCat',
      identifyingCode: `EXP-ALICE-${timestamp}`,
      status: LoanStatus.ISSUED,
      dueDate: new Date(Date.now() + 86400000),
    });
    await seedLoan({
      borrowerId: member2Id,
      title: `Bob Loan ${timestamp}`,
      category: 'BobCat',
      identifyingCode: `EXP-BOB-${timestamp}`,
      status: LoanStatus.ISSUED,
      dueDate: new Date(Date.now() + 86400000),
    });

    const res = await fetch(`${baseUrl}/api/loans/export`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    const records = parse(text, { columns: true, skip_empty_lines: true });

    // Verify all records belong to member1
    for (const rec of records) {
      assert.strictEqual(parseInt(rec.borrowerId, 10), member1Id);
      assert.strictEqual(rec.borrowerEmail, 'alice.member@example.com');
    }
  });

  // 4. Member cannot bypass scoping with borrowerId
  test('4. Member cannot bypass scoping with borrowerId parameter', async () => {
    const res = await fetch(`${baseUrl}/api/loans/export?borrowerId=${member2Id}`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    const records = parse(text, { columns: true, skip_empty_lines: true });

    for (const rec of records) {
      assert.strictEqual(parseInt(rec.borrowerId, 10), member1Id);
    }
  });

  // 5. Librarian can export loans across members
  test('5. Librarian can export loans across multiple members', async () => {
    const res = await fetch(`${baseUrl}/api/loans/export`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    const records = parse(text, { columns: true, skip_empty_lines: true });

    const borrowerIds = new Set(records.map((r) => parseInt(r.borrowerId, 10)));
    assert.ok(borrowerIds.has(member1Id));
    assert.ok(borrowerIds.has(member2Id));
  });

  // 6. Search filtering works in export
  test('6. Search filtering works in export (item title, identifying code, borrower email)', async () => {
    const uniqueTerm = `SearchTerm${Date.now()}`;
    await seedLoan({
      borrowerId: member1Id,
      title: `Special ${uniqueTerm} Edition`,
      category: 'SearchCat',
      identifyingCode: `SEARCH-EXP-${Date.now()}`,
      status: LoanStatus.ISSUED,
      dueDate: new Date(Date.now() + 86400000),
    });

    const res = await fetch(`${baseUrl}/api/loans/export?search=${uniqueTerm}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    const records = parse(text, { columns: true, skip_empty_lines: true });

    assert.strictEqual(records.length, 1);
    assert.ok(records[0].itemTitle.includes(uniqueTerm));
  });

  // 7. Status filtering works
  test('7. Status filtering works in export', async () => {
    const timestamp = Date.now();
    await seedLoan({
      borrowerId: member1Id,
      title: `Lost Item ${timestamp}`,
      category: 'StatusTest',
      identifyingCode: `STATUS-EXP-LOST-${timestamp}`,
      status: LoanStatus.LOST,
    });

    const res = await fetch(`${baseUrl}/api/loans/export?status=LOST`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    const records = parse(text, { columns: true, skip_empty_lines: true });

    assert.ok(records.length >= 1);
    for (const rec of records) {
      assert.strictEqual(rec.status, 'LOST');
    }
  });

  // 8. Category filtering works
  test('8. Category filtering works in export', async () => {
    const uniqueCat = `UniqueCategory${Date.now()}`;
    await seedLoan({
      borrowerId: member1Id,
      title: 'Category Test Item',
      category: uniqueCat,
      identifyingCode: `CAT-EXP-${Date.now()}`,
      status: LoanStatus.REQUESTED,
    });

    const res = await fetch(`${baseUrl}/api/loans/export?category=${uniqueCat}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    const records = parse(text, { columns: true, skip_empty_lines: true });

    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].category, uniqueCat);
  });

  // 9. Borrower filtering works for librarians
  test('9. Borrower filtering works for librarians', async () => {
    const res = await fetch(`${baseUrl}/api/loans/export?borrowerId=${member2Id}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    const records = parse(text, { columns: true, skip_empty_lines: true });

    assert.ok(records.length >= 1);
    for (const rec of records) {
      assert.strictEqual(parseInt(rec.borrowerId, 10), member2Id);
      assert.strictEqual(rec.borrowerEmail, 'bob.member@example.com');
    }
  });

  // 10. Overdue filtering works using the same dynamic definition
  test('10. Overdue filtering works dynamically (?overdue=true & ?overdue=false)', async () => {
    const timestamp = Date.now();
    // Overdue loan: ISSUED and dueDate in the past
    const pastDate = new Date(Date.now() - 7 * 86400000);
    await seedLoan({
      borrowerId: member1Id,
      title: `Past Due Item ${timestamp}`,
      category: 'OverdueTest',
      identifyingCode: `OVERDUE-YES-${timestamp}`,
      status: LoanStatus.ISSUED,
      dueDate: pastDate,
    });

    // Non-overdue loan: ISSUED and dueDate in future
    const futureDate = new Date(Date.now() + 7 * 86400000);
    await seedLoan({
      borrowerId: member1Id,
      title: `Future Item ${timestamp}`,
      category: 'OverdueTest',
      identifyingCode: `OVERDUE-NO-${timestamp}`,
      status: LoanStatus.ISSUED,
      dueDate: futureDate,
    });

    // Test overdue=true
    const resTrue = await fetch(`${baseUrl}/api/loans/export?category=OverdueTest&overdue=true`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resTrue.status, 200);
    const recordsTrue = parse(await resTrue.text(), { columns: true, skip_empty_lines: true });
    assert.ok(recordsTrue.length >= 1);
    for (const rec of recordsTrue) {
      assert.strictEqual(rec.isOverdue, 'true');
      assert.strictEqual(rec.status, 'ISSUED');
      assert.ok(new Date(rec.dueDate) < new Date());
    }

    // Test overdue=false
    const resFalse = await fetch(`${baseUrl}/api/loans/export?category=OverdueTest&overdue=false`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resFalse.status, 200);
    const recordsFalse = parse(await resFalse.text(), { columns: true, skip_empty_lines: true });
    assert.ok(recordsFalse.length >= 1);
    for (const rec of recordsFalse) {
      assert.strictEqual(rec.isOverdue, 'false');
    }
  });

  // 11. Sorting works
  test('11. Sorting works in export (dueDate asc and desc)', async () => {
    const timestamp = Date.now();
    const d1 = new Date('2027-01-01T00:00:00.000Z');
    const d2 = new Date('2027-06-01T00:00:00.000Z');

    await seedLoan({
      borrowerId: member1Id,
      title: `Sort Early ${timestamp}`,
      category: `SortCat-${timestamp}`,
      identifyingCode: `SORT-EARLY-${timestamp}`,
      status: LoanStatus.ISSUED,
      dueDate: d1,
    });
    await seedLoan({
      borrowerId: member1Id,
      title: `Sort Late ${timestamp}`,
      category: `SortCat-${timestamp}`,
      identifyingCode: `SORT-LATE-${timestamp}`,
      status: LoanStatus.ISSUED,
      dueDate: d2,
    });

    const resAsc = await fetch(
      `${baseUrl}/api/loans/export?category=SortCat-${timestamp}&sortBy=dueDate&sortOrder=asc`,
      { headers: { Authorization: `Bearer ${librarianToken}` } }
    );
    assert.strictEqual(resAsc.status, 200);
    const recordsAsc = parse(await resAsc.text(), { columns: true, skip_empty_lines: true });
    assert.strictEqual(recordsAsc.length, 2);
    assert.strictEqual(recordsAsc[0].dueDate, d1.toISOString());
    assert.strictEqual(recordsAsc[1].dueDate, d2.toISOString());

    const resDesc = await fetch(
      `${baseUrl}/api/loans/export?category=SortCat-${timestamp}&sortBy=dueDate&sortOrder=desc`,
      { headers: { Authorization: `Bearer ${librarianToken}` } }
    );
    assert.strictEqual(resDesc.status, 200);
    const recordsDesc = parse(await resDesc.text(), { columns: true, skip_empty_lines: true });
    assert.strictEqual(recordsDesc.length, 2);
    assert.strictEqual(recordsDesc[0].dueDate, d2.toISOString());
    assert.strictEqual(recordsDesc[1].dueDate, d1.toISOString());
  });

  // 12. Export is not paginated and includes all matching records
  test('12. Export is not paginated and includes all matching records', async () => {
    const timestamp = Date.now();
    const category = `UnpaginatedCat-${timestamp}`;

    // Seed 25 records (standard page size in listing is 20)
    for (let i = 1; i <= 25; i++) {
      await seedLoan({
        borrowerId: member1Id,
        title: `Unpaginated Item ${i}`,
        category,
        identifyingCode: `UNPAG-${timestamp}-${i}`,
        status: LoanStatus.REQUESTED,
      });
    }

    const res = await fetch(`${baseUrl}/api/loans/export?category=${category}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    const records = parse(text, { columns: true, skip_empty_lines: true });
    assert.strictEqual(records.length, 25);
  });

  // 13. CSV header contains the expected columns
  test('13. CSV header contains expected columns', async () => {
    const res = await fetch(`${baseUrl}/api/loans/export`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    const firstLine = text.split(/\r?\n/)[0];
    const expectedHeaders =
      'loanId,itemId,itemTitle,category,identifyingCode,borrowerId,borrowerEmail,requestedAt,dueDate,status,isOverdue';
    assert.strictEqual(firstLine, expectedHeaders);
  });

  // 14. CSV values are correctly escaped when containing commas/quotes/newlines
  test('14. CSV values are correctly escaped when containing commas, quotes, and newlines', async () => {
    const timestamp = Date.now();
    const complexTitle = `Tricky "Title", with commas\nand newlines ${timestamp}`;

    await seedLoan({
      borrowerId: member1Id,
      title: complexTitle,
      category: 'EscapingTest',
      identifyingCode: `ESCAPE-${timestamp}`,
      status: LoanStatus.REQUESTED,
    });

    const res = await fetch(`${baseUrl}/api/loans/export?search=${timestamp}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    const records = parse(text, { columns: true, skip_empty_lines: true });

    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].itemTitle, complexTitle);
  });

  // 15. Null values such as dueDate are handled correctly
  test('15. Null values such as dueDate are represented as empty string', async () => {
    const timestamp = Date.now();
    await seedLoan({
      borrowerId: member1Id,
      title: `Null DueDate Item ${timestamp}`,
      category: 'NullTest',
      identifyingCode: `NULL-DUE-${timestamp}`,
      status: LoanStatus.REQUESTED,
      dueDate: null,
    });

    const res = await fetch(`${baseUrl}/api/loans/export?search=NULL-DUE-${timestamp}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    const records = parse(text, { columns: true, skip_empty_lines: true });

    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].dueDate, '');
  });

  // 16. Export with no matching loans returns headers with no data rows
  test('16. Export with no matching loans returns headers with no data rows', async () => {
    const res = await fetch(`${baseUrl}/api/loans/export?search=NonExistentTermXYZ123456789`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    const records = parse(text, { columns: true, skip_empty_lines: true });

    assert.strictEqual(records.length, 0);
    const lines = text.trim().split(/\r?\n/);
    assert.strictEqual(lines.length, 1);
    assert.ok(lines[0].startsWith('loanId,itemId,itemTitle'));
  });

  // 17. Invalid query parameters are rejected consistently with GET /api/loans (400 Bad Request)
  test('17. Invalid query parameters are rejected consistently with 400 Bad Request', async () => {
    // Invalid status
    const r1 = await fetch(`${baseUrl}/api/loans/export?status=INVALID_STATUS`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(r1.status, 400);

    // Invalid sortBy
    const r2 = await fetch(`${baseUrl}/api/loans/export?sortBy=unknownField`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(r2.status, 400);

    // Invalid sortOrder
    const r3 = await fetch(`${baseUrl}/api/loans/export?sortOrder=sideways`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(r3.status, 400);

    // Invalid overdue
    const r4 = await fetch(`${baseUrl}/api/loans/export?overdue=maybe`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(r4.status, 400);

    // Invalid borrowerId
    const r5 = await fetch(`${baseUrl}/api/loans/export?borrowerId=-1`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(r5.status, 400);
  });

  // 18. No password hashes or other sensitive fields appear in the CSV
  test('18. No password hashes or sensitive fields appear in the CSV', async () => {
    const res = await fetch(`${baseUrl}/api/loans/export`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text.includes('password'), false);
    assert.strictEqual(text.includes('hash'), false);
    assert.strictEqual(text.includes('token'), false);
    assert.strictEqual(text.includes('secret'), false);
  });
});

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');
const prisma = require('../src/prisma');

let server;
let baseUrl;

let librarianToken;
let librarianId;
let member1Token;
let member1Id;
let member2Token;
let member2Id;

describe('Loan Listing, Search, Filtering, Sorting & Pagination Integration Tests', () => {
  before(async () => {
    // Start server on an ephemeral port
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // 1. Authenticate Librarian (Sarah)
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

    // 2. Authenticate Member 1 (Alice)
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

    // 3. Authenticate Member 2 (Bob)
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

  // --- 1. ACCESS CONTROL & MEMBER SCOPING ---

  test('1. Unauthenticated request to GET /api/loans returns 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/loans`);
    assert.strictEqual(res.status, 401);
  });

  test('2. Librarian can list loans across all borrowers with pagination metadata (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/loans`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.loans));
    assert.ok(data.loans.length > 0);
    assert.ok(data.pagination);
    assert.strictEqual(typeof data.pagination.page, 'number');
    assert.strictEqual(typeof data.pagination.pageSize, 'number');
    assert.strictEqual(typeof data.pagination.totalItems, 'number');
    assert.strictEqual(typeof data.pagination.totalPages, 'number');

    // Verify multiple borrowers are visible to librarian
    const borrowerIds = new Set(data.loans.map((l) => l.borrowerId));
    assert.ok(borrowerIds.size >= 2, 'Librarian should see loans from multiple borrowers');
  });

  test('3. Member queries are strictly scoped to their own loans (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/loans`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.loans));
    assert.ok(data.loans.length > 0);

    // Verify all returned loans belong strictly to member1Id (Alice)
    data.loans.forEach((loan) => {
      assert.strictEqual(loan.borrowerId, member1Id);
      assert.strictEqual(loan.borrower.email, 'alice.member@example.com');
    });
  });

  test('4. Member cannot bypass scoping using ?borrowerId=999 (200 OK, returns only own loans)', async () => {
    const res = await fetch(`${baseUrl}/api/loans?borrowerId=${member2Id}`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();

    // Verify borrowerId parameter was overridden by authenticated member ID
    data.loans.forEach((loan) => {
      assert.strictEqual(loan.borrowerId, member1Id);
    });
  });

  // --- 2. SEARCH CAPABILITIES ---

  test('5. Search by item title (case-insensitive)', async () => {
    const res = await fetch(`${baseUrl}/api/loans?search=camera`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.loans.length > 0);
    data.loans.forEach((loan) => {
      const matchTitle = loan.item.title.toLowerCase().includes('camera');
      const matchCode = loan.item.identifyingCode.toLowerCase().includes('camera');
      const matchEmail = loan.borrower.email.toLowerCase().includes('camera');
      assert.ok(matchTitle || matchCode || matchEmail);
    });
  });

  test('6. Search by identifying code', async () => {
    const res = await fetch(`${baseUrl}/api/loans?search=CAM-SONY-001`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.loans.length >= 1);
    data.loans.forEach((loan) => {
      assert.strictEqual(loan.item.identifyingCode, 'CAM-SONY-001');
    });
  });

  test('7. Search by borrower email', async () => {
    const res = await fetch(`${baseUrl}/api/loans?search=alice.member`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.loans.length >= 1);
    data.loans.forEach((loan) => {
      assert.ok(loan.borrower.email.toLowerCase().includes('alice.member'));
    });
  });

  // --- 3. FILTERING CAPABILITIES ---

  test('8. Filter by status (REQUESTED, ISSUED, RETURNED, LOST)', async () => {
    for (const status of ['REQUESTED', 'ISSUED', 'RETURNED', 'LOST']) {
      const res = await fetch(`${baseUrl}/api/loans?status=${status}`, {
        headers: { Authorization: `Bearer ${librarianToken}` },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      data.loans.forEach((loan) => {
        assert.strictEqual(loan.status, status);
      });
    }
  });

  test('9. Filter by item category', async () => {
    const res = await fetch(`${baseUrl}/api/loans?category=Cameras`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.loans.length > 0);
    data.loans.forEach((loan) => {
      assert.strictEqual(loan.item.category.toLowerCase(), 'cameras');
    });
  });

  test('10. Filter by borrower as librarian', async () => {
    const res = await fetch(`${baseUrl}/api/loans?borrowerId=${member2Id}`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    data.loans.forEach((loan) => {
      assert.strictEqual(loan.borrowerId, member2Id);
    });
  });

  test('11. Filter overdue loans (?overdue=true)', async () => {
    const res = await fetch(`${baseUrl}/api/loans?overdue=true`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.loans.length >= 1, 'Should return at least 1 overdue loan from seed data');

    const now = new Date();
    data.loans.forEach((loan) => {
      assert.strictEqual(loan.status, 'ISSUED');
      assert.ok(loan.dueDate !== null);
      assert.ok(new Date(loan.dueDate) < now);
      assert.strictEqual(loan.isOverdue, true);
    });
  });

  test('12. Filter non-overdue loans (?overdue=false)', async () => {
    const res = await fetch(`${baseUrl}/api/loans?overdue=false`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    data.loans.forEach((loan) => {
      assert.strictEqual(loan.isOverdue, false);
    });
  });

  // --- 4. COMBINED FILTERS ---

  test('13. Combined filters: status + category + overdue', async () => {
    const res = await fetch(
      `${baseUrl}/api/loans?status=ISSUED&category=Audio&overdue=true`,
      {
        headers: { Authorization: `Bearer ${librarianToken}` },
      }
    );

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.loans.length >= 1);
    data.loans.forEach((loan) => {
      assert.strictEqual(loan.status, 'ISSUED');
      assert.strictEqual(loan.item.category.toLowerCase(), 'audio');
      assert.strictEqual(loan.isOverdue, true);
    });
  });

  test('14. Combined search + status + category', async () => {
    const res = await fetch(
      `${baseUrl}/api/loans?search=Sony&status=ISSUED&category=Cameras`,
      {
        headers: { Authorization: `Bearer ${librarianToken}` },
      }
    );

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    data.loans.forEach((loan) => {
      assert.strictEqual(loan.status, 'ISSUED');
      assert.strictEqual(loan.item.category.toLowerCase(), 'cameras');
      assert.ok(
        loan.item.title.toLowerCase().includes('sony') ||
          loan.item.identifyingCode.toLowerCase().includes('sony')
      );
    });
  });

  // --- 5. SORTING ---

  test('15. Sort by requestedAt ascending and descending', async () => {
    // 15a. Ascending
    const resAsc = await fetch(
      `${baseUrl}/api/loans?sortBy=requestedAt&sortOrder=asc`,
      {
        headers: { Authorization: `Bearer ${librarianToken}` },
      }
    );
    assert.strictEqual(resAsc.status, 200);
    const dataAsc = await resAsc.json();
    for (let i = 1; i < dataAsc.loans.length; i++) {
      const prev = new Date(dataAsc.loans[i - 1].requestedAt).getTime();
      const curr = new Date(dataAsc.loans[i].requestedAt).getTime();
      assert.ok(curr >= prev, 'requestedAt should be in ascending order');
    }

    // 15b. Descending
    const resDesc = await fetch(
      `${baseUrl}/api/loans?sortBy=requestedAt&sortOrder=desc`,
      {
        headers: { Authorization: `Bearer ${librarianToken}` },
      }
    );
    assert.strictEqual(resDesc.status, 200);
    const dataDesc = await resDesc.json();
    for (let i = 1; i < dataDesc.loans.length; i++) {
      const prev = new Date(dataDesc.loans[i - 1].requestedAt).getTime();
      const curr = new Date(dataDesc.loans[i].requestedAt).getTime();
      assert.ok(curr <= prev, 'requestedAt should be in descending order');
    }
  });

  test('16. Sort by dueDate ascending', async () => {
    const res = await fetch(
      `${baseUrl}/api/loans?status=ISSUED&sortBy=dueDate&sortOrder=asc`,
      {
        headers: { Authorization: `Bearer ${librarianToken}` },
      }
    );

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    for (let i = 1; i < data.loans.length; i++) {
      if (data.loans[i - 1].dueDate && data.loans[i].dueDate) {
        const prev = new Date(data.loans[i - 1].dueDate).getTime();
        const curr = new Date(data.loans[i].dueDate).getTime();
        assert.ok(curr >= prev, 'dueDate should be in ascending order');
      }
    }
  });

  // --- 6. PAGINATION ---

  test('17. Pagination: page size, page navigation, and metadata', async () => {
    // Page 1 with pageSize = 2
    const resPage1 = await fetch(`${baseUrl}/api/loans?page=1&pageSize=2`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resPage1.status, 200);
    const dataPage1 = await resPage1.json();
    assert.strictEqual(dataPage1.loans.length, 2);
    assert.strictEqual(dataPage1.pagination.page, 1);
    assert.strictEqual(dataPage1.pagination.pageSize, 2);
    assert.ok(dataPage1.pagination.totalItems >= 4);

    // Page 2 with pageSize = 2
    const resPage2 = await fetch(`${baseUrl}/api/loans?page=2&pageSize=2`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resPage2.status, 200);
    const dataPage2 = await resPage2.json();
    assert.strictEqual(dataPage2.loans.length, 2);
    assert.strictEqual(dataPage2.pagination.page, 2);

    // Verify distinct records between page 1 and page 2
    const page1Ids = dataPage1.loans.map((l) => l.id);
    const page2Ids = dataPage2.loans.map((l) => l.id);
    page1Ids.forEach((id) => {
      assert.ok(!page2Ids.includes(id), `Page 2 should not contain loan ID ${id} from Page 1`);
    });

    // Page beyond total items returns empty array with correct totalItems
    const resBeyond = await fetch(`${baseUrl}/api/loans?page=999&pageSize=20`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resBeyond.status, 200);
    const dataBeyond = await resBeyond.json();
    assert.strictEqual(dataBeyond.loans.length, 0);
    assert.strictEqual(dataBeyond.pagination.page, 999);
    assert.ok(dataBeyond.pagination.totalItems > 0);
  });

  // --- 7. VALIDATION & SECURITY ---

  test('18. Validation: rejects invalid query parameters with 400 Bad Request', async () => {
    // 18a. Invalid status
    const resBadStatus = await fetch(`${baseUrl}/api/loans?status=INVALID_STATUS`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resBadStatus.status, 400);

    // 18b. Invalid page (< 1 or non-numeric)
    const resBadPage = await fetch(`${baseUrl}/api/loans?page=0`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resBadPage.status, 400);

    const resNaNPage = await fetch(`${baseUrl}/api/loans?page=abc`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resNaNPage.status, 400);

    // 18c. Invalid pageSize (< 1 or > 100)
    const resBadPageSize = await fetch(`${baseUrl}/api/loans?pageSize=-1`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resBadPageSize.status, 400);

    const resOverPageSize = await fetch(`${baseUrl}/api/loans?pageSize=101`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resOverPageSize.status, 400);

    // 18d. Invalid sortBy
    const resBadSort = await fetch(`${baseUrl}/api/loans?sortBy=passwordHash`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resBadSort.status, 400);

    // 18e. Invalid sortOrder
    const resBadOrder = await fetch(`${baseUrl}/api/loans?sortOrder=random`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resBadOrder.status, 400);

    // 18f. Invalid overdue
    const resBadOverdue = await fetch(`${baseUrl}/api/loans?overdue=maybe`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resBadOverdue.status, 400);

    // 18g. Invalid borrowerId
    const resBadBorrower = await fetch(`${baseUrl}/api/loans?borrowerId=abc`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });
    assert.strictEqual(resBadBorrower.status, 400);
  });

  test('19. Security: Sensitive fields (password hashes) are never exposed', async () => {
    const res = await fetch(`${baseUrl}/api/loans`, {
      headers: { Authorization: `Bearer ${librarianToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    data.loans.forEach((loan) => {
      assert.strictEqual(loan.borrower.passwordHash, undefined);
      assert.strictEqual(loan.borrower.password, undefined);
      assert.ok(loan.item.title);
      assert.ok(loan.item.identifyingCode);
      assert.strictEqual(typeof loan.isOverdue, 'boolean');
    });
  });
});

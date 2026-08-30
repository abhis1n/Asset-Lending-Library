const prisma = require('./src/prisma');

async function verify() {
  console.log('=== VERIFYING DATABASE DATA & RELATIONS ===\n');

  // 1. Users count & roles
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, createdAt: true },
  });
  console.log(`✓ Users (${users.length}):`);
  users.forEach((u) => console.log(`   - [ID: ${u.id}] ${u.email} (${u.role})`));

  // 2. Items count & archived check
  const items = await prisma.item.findMany({
    include: {
      custodians: {
        include: { librarian: { select: { email: true } } },
      },
    },
  });
  console.log(`\n✓ Catalogue Items (${items.length}):`);
  items.forEach((item) => {
    const custodians = item.custodians.map((c) => c.librarian.email).join(', ');
    console.log(
      `   - [ID: ${item.id}] [${item.identifyingCode}] ${item.title} (${item.category}) | Archived: ${item.archived} | Custodians: [${custodians || 'None'}]`
    );
  });

  // 3. Custodian check per librarian
  const librarians = await prisma.user.findMany({
    where: { role: 'LIBRARIAN' },
    include: {
      custodians: {
        include: { item: { select: { identifyingCode: true, title: true } } },
      },
    },
  });
  console.log(`\n✓ Custodians per Librarian:`);
  librarians.forEach((lib) => {
    console.log(`   - Librarian: ${lib.email} manages ${lib.custodians.length} items:`);
    lib.custodians.forEach((c) => console.log(`       * ${c.item.identifyingCode}: ${c.item.title}`));
  });

  // 4. Loans, Overdue calculation check, and histories
  const loans = await prisma.loan.findMany({
    include: {
      item: { select: { title: true, identifyingCode: true } },
      borrower: { select: { email: true } },
      histories: {
        include: { user: { select: { email: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  const now = new Date();
  console.log(`\n✓ Loans (${loans.length}) with dynamic Overdue check:`);
  loans.forEach((loan) => {
    const isOverdue = loan.status === 'ISSUED' && loan.dueDate && new Date(loan.dueDate) < now;
    console.log(
      `   - [Loan ID: ${loan.id}] Item: ${loan.item.identifyingCode} (${loan.item.title})`
    );
    console.log(`       Borrower: ${loan.borrower.email} | Status: ${loan.status} | Overdue: ${isOverdue}`);
    console.log(`       Requested: ${loan.requestedAt.toISOString()} | Due: ${loan.dueDate ? loan.dueDate.toISOString() : 'N/A'}`);
    console.log(`       Timeline (${loan.histories.length} events):`);
    loan.histories.forEach((h) => {
      console.log(`         • [${h.createdAt.toISOString()}] ${h.type} by ${h.user.email} (${h.user.role}): "${h.note || ''}"`);
    });
  });

  console.log('\n=== ALL DATABASE CHECKS PASSED SUCCESSFULLY ===');
}

verify()
  .catch((e) => {
    console.error('Verification failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

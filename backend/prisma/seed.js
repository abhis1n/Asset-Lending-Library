const path = require('path');
const dotenv = require('dotenv');

// Single source of truth for environment variables (.env in workspace root)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const { PrismaClient, Role, LoanStatus, LoanHistoryType } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Database Seeding ---');

  // Clean existing records in reverse dependency order
  await prisma.loanHistory.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.custodian.deleteMany();
  await prisma.item.deleteMany();
  await prisma.user.deleteMany();

  const defaultPassword = 'Password123!';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // 1. Seed Users (Librarians and Members)
  console.log('Seeding users...');
  const librarian1 = await prisma.user.create({
    data: {
      email: 'sarah.librarian@library.org',
      passwordHash,
      role: Role.LIBRARIAN,
    },
  });

  const librarian2 = await prisma.user.create({
    data: {
      email: 'david.librarian@library.org',
      passwordHash,
      role: Role.LIBRARIAN,
    },
  });

  const member1 = await prisma.user.create({
    data: {
      email: 'alice.member@example.com',
      passwordHash,
      role: Role.MEMBER,
    },
  });

  const member2 = await prisma.user.create({
    data: {
      email: 'bob.member@example.com',
      passwordHash,
      role: Role.MEMBER,
    },
  });

  const member3 = await prisma.user.create({
    data: {
      email: 'charlie.member@example.com',
      passwordHash,
      role: Role.MEMBER,
    },
  });

  console.log(`Created 2 librarians and 3 members.`);

  // 2. Seed Catalogue Items
  console.log('Seeding catalogue items...');
  const itemsData = [
    {
      title: 'Sony Alpha A7 IV Full-Frame Camera',
      category: 'Cameras',
      identifyingCode: 'CAM-SONY-001',
      archived: false,
    },
    {
      title: 'Canon EOS R5 Mirrorless Camera',
      category: 'Cameras',
      identifyingCode: 'CAM-CAN-002',
      archived: false,
    },
    {
      title: 'Shure SM7B Vocal Microphone',
      category: 'Audio',
      identifyingCode: 'AUD-SHU-001',
      archived: false,
    },
    {
      title: 'Rode Wireless GO II Dual Mic System',
      category: 'Audio',
      identifyingCode: 'AUD-ROD-002',
      archived: false,
    },
    {
      title: 'Aputure Light Storm 300d II LED Light',
      category: 'Lighting',
      identifyingCode: 'LGT-APU-001',
      archived: false,
    },
    {
      title: 'Epson PowerLite 1781W Wireless Projector',
      category: 'Projectors',
      identifyingCode: 'PRJ-EPS-001',
      archived: false,
    },
    {
      title: 'DeWalt 20V Max Cordless Drill Kit',
      category: 'Tools',
      identifyingCode: 'TLS-DEW-001',
      archived: false,
    },
    {
      title: 'DJI RS 3 Pro Gimbal Stabilizer',
      category: 'Gimbals',
      identifyingCode: 'ACC-DJI-001',
      archived: false,
    },
    {
      title: 'Vintage Film Projector 16mm (Retired)',
      category: 'Projectors',
      identifyingCode: 'PRJ-VIN-099',
      archived: true,
    },
  ];

  const createdItems = [];
  for (const itemData of itemsData) {
    const item = await prisma.item.create({
      data: itemData,
    });
    createdItems.push(item);
  }
  console.log(`Created ${createdItems.length} catalogue items.`);

  // 3. Seed Custodians (assigning librarians to catalogue items)
  console.log('Seeding custodians...');
  const custodianAssignments = [
    { itemId: createdItems[0].id, librarianId: librarian1.id }, // Sony A7 IV -> Sarah
    { itemId: createdItems[1].id, librarianId: librarian1.id }, // Canon R5 -> Sarah
    { itemId: createdItems[2].id, librarianId: librarian2.id }, // Shure SM7B -> David
    { itemId: createdItems[3].id, librarianId: librarian2.id }, // Rode Wireless -> David
    { itemId: createdItems[4].id, librarianId: librarian1.id }, // Aputure Light -> Sarah
    { itemId: createdItems[4].id, librarianId: librarian2.id }, // Aputure Light -> David (Multiple custodians)
    { itemId: createdItems[5].id, librarianId: librarian2.id }, // Epson Projector -> David
    { itemId: createdItems[6].id, librarianId: librarian1.id }, // DeWalt Drill -> Sarah
    { itemId: createdItems[7].id, librarianId: librarian1.id }, // DJI RS 3 -> Sarah
    { itemId: createdItems[7].id, librarianId: librarian2.id }, // DJI RS 3 -> David
  ];

  for (const assignment of custodianAssignments) {
    await prisma.custodian.create({
      data: assignment,
    });
  }
  console.log(`Created ${custodianAssignments.length} custodian assignments.`);

  // 4. Seed Initial Loans & Histories (for comprehensive verification)
  console.log('Seeding initial sample loans and loan histories...');
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const oneWeekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  // Loan 1: Active Issued Loan (Sony Camera borrowed by Alice)
  const loan1 = await prisma.loan.create({
    data: {
      itemId: createdItems[0].id,
      borrowerId: member1.id,
      requestedAt: twoWeeksAgo,
      dueDate: oneWeekAhead,
      status: LoanStatus.ISSUED,
    },
  });

  await prisma.loanHistory.createMany({
    data: [
      {
        loanId: loan1.id,
        type: LoanHistoryType.REQUESTED,
        userId: member1.id,
        createdAt: twoWeeksAgo,
        note: 'Requested for weekend photo shoot',
      },
      {
        loanId: loan1.id,
        type: LoanHistoryType.ISSUED,
        userId: librarian1.id,
        createdAt: oneWeekAgo,
        note: 'Issued with 2 batteries and 64GB SD card',
      },
    ],
  });

  // Loan 2: Overdue Issued Loan (Shure SM7B borrowed by Bob, due 2 days ago)
  const loan2 = await prisma.loan.create({
    data: {
      itemId: createdItems[2].id,
      borrowerId: member2.id,
      requestedAt: twoWeeksAgo,
      dueDate: twoDaysAgo, // overdue because current date > dueDate
      status: LoanStatus.ISSUED,
    },
  });

  await prisma.loanHistory.createMany({
    data: [
      {
        loanId: loan2.id,
        type: LoanHistoryType.REQUESTED,
        userId: member2.id,
        createdAt: twoWeeksAgo,
        note: 'Podcast recording session',
      },
      {
        loanId: loan2.id,
        type: LoanHistoryType.ISSUED,
        userId: librarian2.id,
        createdAt: oneWeekAgo,
        note: 'Issued with XLR cable and desk mount',
      },
    ],
  });

  // Loan 3: Returned Loan (Aputure Light borrowed by Charlie, returned last week)
  const loan3 = await prisma.loan.create({
    data: {
      itemId: createdItems[4].id,
      borrowerId: member3.id,
      requestedAt: twoWeeksAgo,
      dueDate: oneWeekAgo,
      status: LoanStatus.RETURNED,
    },
  });

  await prisma.loanHistory.createMany({
    data: [
      {
        loanId: loan3.id,
        type: LoanHistoryType.REQUESTED,
        userId: member3.id,
        createdAt: twoWeeksAgo,
        note: 'Studio interview lighting',
      },
      {
        loanId: loan3.id,
        type: LoanHistoryType.ISSUED,
        userId: librarian1.id,
        createdAt: twoWeeksAgo,
        note: 'Issued with softbox and carrying case',
      },
      {
        loanId: loan3.id,
        type: LoanHistoryType.RETURNED,
        userId: librarian1.id,
        createdAt: oneWeekAgo,
        note: 'Returned in good condition',
      },
    ],
  });

  // Loan 4: Requested Loan (DeWalt Drill requested by Alice, pending approval)
  const loan4 = await prisma.loan.create({
    data: {
      itemId: createdItems[6].id,
      borrowerId: member1.id,
      requestedAt: now,
      dueDate: null,
      status: LoanStatus.REQUESTED,
    },
  });

  await prisma.loanHistory.create({
    data: {
      loanId: loan4.id,
      type: LoanHistoryType.REQUESTED,
      userId: member1.id,
      createdAt: now,
      note: 'Need for assembling shelving units',
    },
  });

  console.log('Sample loans and histories created successfully.');
  console.log('--- Database Seeding Completed ---');
}

main()
  .catch((e) => {
    console.error('Seeding failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

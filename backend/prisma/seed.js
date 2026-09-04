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

  // 4. Seed Initial Loans & Histories (covering active, overdue, requested, and 8-week return history)
  console.log('Seeding initial sample loans and loan histories...');

  const now = new Date();

  // Helper to compute start of ISO week (Monday 00:00:00.000 UTC)
  const getStartOfISOWeek = (d) => {
    const date = new Date(d);
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setUTCDate(date.getUTCDate() + diff);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  };

  const currentWeekStart = getStartOfISOWeek(now);

  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  // Loan 1: Active Issued Loan
  // Issued one week ago, due one week from now.
  // This is 14 days after the issue date, which is within the 1-month limit.
  const loan1IssueDate = oneWeekAgo;
  const loan1DueDate = new Date(
    loan1IssueDate.getTime() + 14 * 24 * 60 * 60 * 1000
  );

  const loan1 = await prisma.loan.create({
    data: {
      itemId: createdItems[0].id,
      borrowerId: member1.id,
      borrowDurationDays: 14,
      requestedAt: twoWeeksAgo,
      dueDate: loan1DueDate,
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
        createdAt: loan1IssueDate,
        note: 'Issued with 2 batteries and 64GB SD card',
      },
    ],
  });

  // Loan 2: Overdue Issued Loan
  // Issued one week ago, due two days ago.
  // Due date is 5 days after issue date and therefore valid.
  const loan2IssueDate = oneWeekAgo;
  const loan2DueDate = twoDaysAgo;

  const loan2 = await prisma.loan.create({
    data: {
      itemId: createdItems[2].id,
      borrowerId: member2.id,
      borrowDurationDays: 5,
      requestedAt: twoWeeksAgo,
      dueDate: loan2DueDate,
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
        createdAt: loan2IssueDate,
        note: 'Issued with XLR cable and desk mount',
      },
    ],
  });

  // Loan 3: Returned Loan (Week -1 / 1 week ago)
  // Issued two weeks ago, due one week ago.
  const loan3ReturnDate = new Date(currentWeekStart.getTime() - 4 * 24 * 60 * 60 * 1000);
  const loan3IssueDate = new Date(loan3ReturnDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const loan3RequestedAt = new Date(loan3IssueDate.getTime() - 3 * 24 * 60 * 60 * 1000);
  const loan3DueDate = loan3ReturnDate;

  const loan3 = await prisma.loan.create({
    data: {
      itemId: createdItems[4].id,
      borrowerId: member3.id,
      borrowDurationDays: 7,
      requestedAt: loan3RequestedAt,
      dueDate: loan3DueDate,
      status: LoanStatus.RETURNED,
    },
  });

  await prisma.loanHistory.createMany({
    data: [
      {
        loanId: loan3.id,
        type: LoanHistoryType.REQUESTED,
        userId: member3.id,
        createdAt: loan3RequestedAt,
        note: 'Studio interview lighting',
      },
      {
        loanId: loan3.id,
        type: LoanHistoryType.ISSUED,
        userId: librarian1.id,
        createdAt: loan3IssueDate,
        note: 'Issued with softbox and carrying case',
      },
      {
        loanId: loan3.id,
        type: LoanHistoryType.RETURNED,
        userId: librarian1.id,
        createdAt: loan3ReturnDate,
        note: 'Returned in good condition',
      },
    ],
  });

  // Loan 4: Requested Loan
  const loan4RequestedAt = new Date(
    now.getTime() - 2 * 24 * 60 * 60 * 1000
  );
  // Due date is 14 days after the request date.
  const loan4DueDate = new Date(
    loan4RequestedAt.getTime() + 14 * 24 * 60 * 60 * 1000
  );

  const loan4 = await prisma.loan.create({
    data: {
      itemId: createdItems[6].id,
      borrowerId: member1.id,
      borrowDurationDays: 14,
      requestedAt: loan4RequestedAt,
      dueDate: loan4DueDate,
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

  // Helper to create historical returned loans covering the 8-week return chart
  // Ensures all borrowing rules (mandatory dueDate, non-overlapping items, valid status & histories) are met.
  const historicalReturns = [
    // Week 0 (Current Week): 1 return
    {
      item: createdItems[1], // Canon EOS R5
      borrower: member2,
      librarian: librarian1,
      returnDate: new Date(currentWeekStart.getTime() + 60 * 1000), // 1 min into Monday
      durationDays: 7,
      requestNote: 'Client headshot session',
      returnNote: 'Returned on schedule in pristine condition',
    },
    // Week -2 (2 weeks ago): 2 returns
    {
      item: createdItems[3], // Rode Wireless GO II
      borrower: member1,
      librarian: librarian2,
      returnDate: new Date(currentWeekStart.getTime() - 10 * 24 * 60 * 60 * 1000),
      durationDays: 7,
      requestNote: 'Outdoor vlog audio capture',
      returnNote: 'All transmitters and cables returned verified',
    },
    {
      item: createdItems[5], // Epson Projector
      borrower: member3,
      librarian: librarian1,
      returnDate: new Date(currentWeekStart.getTime() - 12 * 24 * 60 * 60 * 1000),
      durationDays: 5,
      requestNote: 'Community workshop presentation',
      returnNote: 'Returned with power cable and HDMI adapter',
    },
    // Week -3 (3 weeks ago): 0 returns (Intentionally 0 to verify zero-fill requirement)

    // Week -4 (4 weeks ago): 1 return
    {
      item: createdItems[7], // DJI RS 3 Pro Gimbal
      borrower: member2,
      librarian: librarian2,
      returnDate: new Date(currentWeekStart.getTime() - 25 * 24 * 60 * 60 * 1000),
      durationDays: 7,
      requestNote: 'Music video production',
      returnNote: 'Returned cleanly balanced with briefcase',
    },
    // Week -5 (5 weeks ago): 1 return
    {
      item: createdItems[1], // Canon EOS R5 (sequential loan earlier in time)
      borrower: member1,
      librarian: librarian1,
      returnDate: new Date(currentWeekStart.getTime() - 32 * 24 * 60 * 60 * 1000),
      durationDays: 7,
      requestNote: 'Architecture photo documentary',
      returnNote: 'Returned with clean sensor and lens cap',
    },
    // Week -6 (6 weeks ago): 1 return
    {
      item: createdItems[3], // Rode Wireless GO II (sequential loan earlier in time)
      borrower: member3,
      librarian: librarian2,
      returnDate: new Date(currentWeekStart.getTime() - 39 * 24 * 60 * 60 * 1000),
      durationDays: 7,
      requestNote: 'Panel discussion recording',
      returnNote: 'Checked back in without issues',
    },
    // Week -7 (7 weeks ago, oldest): 1 return
    {
      item: createdItems[5], // Epson Projector (sequential loan earlier in time)
      borrower: member2,
      librarian: librarian1,
      returnDate: new Date(currentWeekStart.getTime() - 46 * 24 * 60 * 60 * 1000),
      durationDays: 7,
      requestNote: 'Film society screening',
      returnNote: 'Returned on time and tested lamp hours',
    },
  ];

  for (const hr of historicalReturns) {
    const returnDate = hr.returnDate;
    const issueDate = new Date(returnDate.getTime() - hr.durationDays * 24 * 60 * 60 * 1000);
    const requestedAt = new Date(issueDate.getTime() - 2 * 24 * 60 * 60 * 1000);
    const dueDate = new Date(issueDate.getTime() + hr.durationDays * 24 * 60 * 60 * 1000);

    const loan = await prisma.loan.create({
      data: {
        itemId: hr.item.id,
        borrowerId: hr.borrower.id,
        borrowDurationDays: hr.durationDays,
        requestedAt,
        dueDate,
        status: LoanStatus.RETURNED,
      },
    });

    await prisma.loanHistory.createMany({
      data: [
        {
          loanId: loan.id,
          type: LoanHistoryType.REQUESTED,
          userId: hr.borrower.id,
          createdAt: requestedAt,
          note: hr.requestNote,
        },
        {
          loanId: loan.id,
          type: LoanHistoryType.ISSUED,
          userId: hr.librarian.id,
          createdAt: issueDate,
          note: `Issued for ${hr.durationDays} days`,
        },
        {
          loanId: loan.id,
          type: LoanHistoryType.RETURNED,
          userId: hr.librarian.id,
          createdAt: returnDate,
          note: hr.returnNote,
        },
      ],
    });
  }

  console.log(`Seeded ${historicalReturns.length + 4} total loans with 8-week return history.`);

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
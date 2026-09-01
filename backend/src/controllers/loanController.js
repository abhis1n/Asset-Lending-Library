const { LoanStatus, LoanHistoryType } = require('@prisma/client');
const prisma = require('../prisma');

/**
 * Format loan object with calculated isOverdue flag and sanitized borrower/item
 */
function formatLoan(loan) {
  if (!loan) return null;

  const now = new Date();
  const isOverdue =
    loan.status === LoanStatus.ISSUED &&
    loan.dueDate !== null &&
    new Date(loan.dueDate) < now;

  return {
    id: loan.id,
    itemId: loan.itemId,
    borrowerId: loan.borrowerId,
    requestedAt: loan.requestedAt,
    dueDate: loan.dueDate,
    status: loan.status,
    isOverdue,
    createdAt: loan.createdAt,
    updatedAt: loan.updatedAt,
    item: loan.item
      ? {
          id: loan.item.id,
          title: loan.item.title,
          category: loan.item.category,
          identifyingCode: loan.item.identifyingCode,
          archived: loan.item.archived,
        }
      : undefined,
    borrower: loan.borrower
      ? {
          id: loan.borrower.id,
          email: loan.borrower.email,
          role: loan.borrower.role,
        }
      : undefined,
  };
}

/**
 * POST /api/loans/request
 * Member requests a loan for an active catalogue item.
 * Concurrency: Locks the item row using PostgreSQL `FOR UPDATE` inside transaction.
 */
async function requestLoan(req, res) {
  try {
    const { itemId, note } = req.body;
    const borrowerId = req.user.id;

    const parsedItemId = parseInt(itemId, 10);
    if (isNaN(parsedItemId)) {
      return res.status(400).json({
        error: 'Invalid itemId. Must be a valid integer.',
      });
    }

    // Execute atomic transaction with pessimistic row-level locking
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock the item row to serialize concurrent loan requests for the same item
      const itemRows = await tx.$queryRaw`
        SELECT id, archived, title FROM items WHERE id = ${parsedItemId} FOR UPDATE
      `;

      if (!itemRows || itemRows.length === 0) {
        throw { status: 404, message: `Catalogue item with ID ${parsedItemId} not found.` };
      }

      const item = itemRows[0];
      if (item.archived) {
        throw {
          status: 409,
          message: `Cannot request archived item '${item.title}'.`,
        };
      }

      // 2. Check for open loans (REQUESTED or ISSUED)
      const openLoan = await tx.loan.findFirst({
        where: {
          itemId: parsedItemId,
          status: { in: [LoanStatus.REQUESTED, LoanStatus.ISSUED] },
        },
      });

      if (openLoan) {
        throw {
          status: 409,
          message: `Item '${item.title}' currently has an open loan (status: ${openLoan.status}) and cannot be requested.`,
        };
      }

      // 3. Create Loan
      const newLoan = await tx.loan.create({
        data: {
          itemId: parsedItemId,
          borrowerId,
          status: LoanStatus.REQUESTED,
          requestedAt: new Date(),
          dueDate: null,
        },
        include: {
          item: true,
          borrower: {
            select: { id: true, email: true, role: true },
          },
        },
      });

      // 4. Create immutable LoanHistory record
      await tx.loanHistory.create({
        data: {
          loanId: newLoan.id,
          type: LoanHistoryType.REQUESTED,
          userId: borrowerId,
          note: note && typeof note === 'string' ? note.trim() : null,
        },
      });

      return newLoan;
    });

    return res.status(201).json({
      message: 'Loan requested successfully.',
      loan: formatLoan(result),
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error requesting loan:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while requesting the loan.',
    });
  }
}

/**
 * POST /api/loans
 * Librarian creates a loan directly for a member.
 * Can create in REQUESTED or ISSUED state.
 * Concurrency: Locks item row via `FOR UPDATE` inside transaction.
 */
async function createLoanDirect(req, res) {
  try {
    const { itemId, borrowerId, dueDate, status, note } = req.body;
    const librarianId = req.user.id;

    const parsedItemId = parseInt(itemId, 10);
    const parsedBorrowerId = parseInt(borrowerId, 10);

    if (isNaN(parsedItemId) || isNaN(parsedBorrowerId)) {
      return res.status(400).json({
        error: 'itemId and borrowerId are required and must be integers.',
      });
    }

    // Verify target borrower exists and has role MEMBER
    const borrower = await prisma.user.findUnique({
      where: { id: parsedBorrowerId },
    });

    if (!borrower) {
      return res.status(404).json({
        error: `Borrower with ID ${parsedBorrowerId} not found.`,
      });
    }

    if (borrower.role !== 'MEMBER') {
      return res.status(400).json({
        error: 'Target borrower must have role MEMBER. Librarians cannot be assigned as loan borrowers.',
      });
    }

    // Determine target initial status (defaults to ISSUED if dueDate provided, or REQUESTED)
    const initialStatus = status === LoanStatus.REQUESTED ? LoanStatus.REQUESTED : LoanStatus.ISSUED;

    let parsedDueDate = null;
    if (initialStatus === LoanStatus.ISSUED) {
      if (!dueDate) {
        return res.status(400).json({
          error: 'dueDate is required when creating an issued loan.',
        });
      }
      parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return res.status(400).json({
          error: 'Invalid dueDate format. Must be a valid date.',
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock item row
      const itemRows = await tx.$queryRaw`
        SELECT id, archived, title FROM items WHERE id = ${parsedItemId} FOR UPDATE
      `;

      if (!itemRows || itemRows.length === 0) {
        throw { status: 404, message: `Catalogue item with ID ${parsedItemId} not found.` };
      }

      const item = itemRows[0];
      if (item.archived) {
        throw {
          status: 409,
          message: `Cannot create a loan for archived item '${item.title}'.`,
        };
      }

      // 2. Check for open loan
      const openLoan = await tx.loan.findFirst({
        where: {
          itemId: parsedItemId,
          status: { in: [LoanStatus.REQUESTED, LoanStatus.ISSUED] },
        },
      });

      if (openLoan) {
        throw {
          status: 409,
          message: `Item '${item.title}' currently has an open loan (status: ${openLoan.status}) and cannot be loaned.`,
        };
      }

      // 3. Create Loan
      const newLoan = await tx.loan.create({
        data: {
          itemId: parsedItemId,
          borrowerId: parsedBorrowerId,
          status: initialStatus,
          requestedAt: new Date(),
          dueDate: parsedDueDate,
        },
        include: {
          item: true,
          borrower: {
            select: { id: true, email: true, role: true },
          },
        },
      });

      // 4. Create LoanHistory
      await tx.loanHistory.create({
        data: {
          loanId: newLoan.id,
          type: initialStatus === LoanStatus.ISSUED ? LoanHistoryType.ISSUED : LoanHistoryType.REQUESTED,
          userId: librarianId,
          note: note && typeof note === 'string' ? note.trim() : null,
        },
      });

      return newLoan;
    });

    return res.status(201).json({
      message: `Loan created directly as ${result.status}.`,
      loan: formatLoan(result),
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error creating direct loan:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while creating the loan.',
    });
  }
}

/**
 * POST /api/loans/:id/issue
 * Librarian issues a requested loan.
 * Valid transition: REQUESTED -> ISSUED
 */
async function issueLoan(req, res) {
  try {
    const loanId = parseInt(req.params.id, 10);
    const { dueDate, note } = req.body;
    const librarianId = req.user.id;

    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID.' });
    }

    if (!dueDate) {
      return res.status(400).json({
        error: 'dueDate is required when issuing a loan.',
      });
    }

    const parsedDueDate = new Date(dueDate);
    if (isNaN(parsedDueDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid dueDate format. Must be a valid date.',
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Fetch loan
      const loan = await tx.loan.findUnique({
        where: { id: loanId },
        include: { item: true, borrower: true },
      });

      if (!loan) {
        throw { status: 404, message: `Loan with ID ${loanId} not found.` };
      }

      // Check state machine transition
      if (loan.status !== LoanStatus.REQUESTED) {
        throw {
          status: 409,
          message: `Cannot issue loan ${loanId} with status '${loan.status}'. Only loans in 'REQUESTED' status can be issued.`,
        };
      }

      // Update Loan
      const updatedLoan = await tx.loan.update({
        where: { id: loanId },
        data: {
          status: LoanStatus.ISSUED,
          dueDate: parsedDueDate,
        },
        include: {
          item: true,
          borrower: {
            select: { id: true, email: true, role: true },
          },
        },
      });

      // Create immutable history record
      await tx.loanHistory.create({
        data: {
          loanId: updatedLoan.id,
          type: LoanHistoryType.ISSUED,
          userId: librarianId,
          note: note && typeof note === 'string' ? note.trim() : null,
        },
      });

      return updatedLoan;
    });

    return res.status(200).json({
      message: 'Loan issued successfully.',
      loan: formatLoan(result),
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error issuing loan:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while issuing the loan.',
    });
  }
}

/**
 * POST /api/loans/:id/return
 * Librarian processes return of an issued loan.
 * Valid transition: ISSUED -> RETURNED
 */
async function returnLoan(req, res) {
  try {
    const loanId = parseInt(req.params.id, 10);
    const { note } = req.body;
    const librarianId = req.user.id;

    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: loanId },
        include: { item: true, borrower: true },
      });

      if (!loan) {
        throw { status: 404, message: `Loan with ID ${loanId} not found.` };
      }

      // Check state machine transition
      if (loan.status !== LoanStatus.ISSUED) {
        throw {
          status: 409,
          message: `Cannot return loan ${loanId} with status '${loan.status}'. Only loans in 'ISSUED' status can be returned.`,
        };
      }

      // Update Loan
      const updatedLoan = await tx.loan.update({
        where: { id: loanId },
        data: {
          status: LoanStatus.RETURNED,
        },
        include: {
          item: true,
          borrower: {
            select: { id: true, email: true, role: true },
          },
        },
      });

      // Create immutable history record
      await tx.loanHistory.create({
        data: {
          loanId: updatedLoan.id,
          type: LoanHistoryType.RETURNED,
          userId: librarianId,
          note: note && typeof note === 'string' ? note.trim() : null,
        },
      });

      return updatedLoan;
    });

    return res.status(200).json({
      message: 'Loan returned successfully.',
      loan: formatLoan(result),
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error returning loan:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while returning the loan.',
    });
  }
}

/**
 * POST /api/loans/:id/lost
 * Librarian marks an issued loan as lost.
 * Valid transition: ISSUED -> LOST
 */
async function markLoanLost(req, res) {
  try {
    const loanId = parseInt(req.params.id, 10);
    const { note } = req.body;
    const librarianId = req.user.id;

    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: loanId },
        include: { item: true, borrower: true },
      });

      if (!loan) {
        throw { status: 404, message: `Loan with ID ${loanId} not found.` };
      }

      // Check state machine transition
      if (loan.status !== LoanStatus.ISSUED) {
        throw {
          status: 409,
          message: `Cannot mark loan ${loanId} lost with status '${loan.status}'. Only loans in 'ISSUED' status can be marked lost.`,
        };
      }

      // Update Loan
      const updatedLoan = await tx.loan.update({
        where: { id: loanId },
        data: {
          status: LoanStatus.LOST,
        },
        include: {
          item: true,
          borrower: {
            select: { id: true, email: true, role: true },
          },
        },
      });

      // Create immutable history record
      await tx.loanHistory.create({
        data: {
          loanId: updatedLoan.id,
          type: LoanHistoryType.LOST,
          userId: librarianId,
          note: note && typeof note === 'string' ? note.trim() : null,
        },
      });

      return updatedLoan;
    });

    return res.status(200).json({
      message: 'Loan marked as lost successfully.',
      loan: formatLoan(result),
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error marking loan lost:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while marking the loan lost.',
    });
  }
}

/**
 * GET /api/loans/:id
 * Retrieve a specific loan.
 * Member can only retrieve their own loan.
 * Librarian can retrieve any loan.
 */
async function getLoanById(req, res) {
  try {
    const loanId = parseInt(req.params.id, 10);
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID.' });
    }

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        item: true,
        borrower: {
          select: { id: true, email: true, role: true },
        },
      },
    });

    if (!loan) {
      return res.status(404).json({
        error: `Loan with ID ${loanId} not found.`,
      });
    }

    // Role check: Member can only view their own loans
    if (req.user.role === 'MEMBER' && loan.borrowerId !== req.user.id) {
      return res.status(403).json({
        error: 'Access forbidden: you do not have permission to view another member’s loan.',
      });
    }

    return res.status(200).json({
      loan: formatLoan(loan),
    });
  } catch (error) {
    console.error('Error fetching loan by ID:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while fetching the loan.',
    });
  }
}

/**
 * GET /api/loans/:id/history
 * Retrieve chronological timeline history for a loan.
 * Ordered by createdAt ascending.
 */
async function getLoanHistory(req, res) {
  try {
    const loanId = parseInt(req.params.id, 10);
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID.' });
    }

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
    });

    if (!loan) {
      return res.status(404).json({
        error: `Loan with ID ${loanId} not found.`,
      });
    }

    // Role check: Member can only view history of their own loans
    if (req.user.role === 'MEMBER' && loan.borrowerId !== req.user.id) {
      return res.status(403).json({
        error: 'Access forbidden: you do not have permission to view another member’s loan history.',
      });
    }

    const histories = await prisma.loanHistory.findMany({
      where: { loanId },
      include: {
        user: {
          select: { id: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const formattedHistory = histories.map((h) => ({
      id: h.id,
      loanId: h.loanId,
      type: h.type,
      createdAt: h.createdAt,
      note: h.note,
      actor: h.user,
    }));

    return res.status(200).json({
      loanId,
      history: formattedHistory,
      total: formattedHistory.length,
    });
  } catch (error) {
    console.error('Error fetching loan history:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while fetching the loan history.',
    });
  }
}

/**
 * GET /api/me/loans
 * Member retrieves their own loans.
 * Strictly anchored to req.user.id.
 */
async function getMyLoans(req, res) {
  try {
    const borrowerId = req.user.id;

    const loans = await prisma.loan.findMany({
      where: { borrowerId },
      include: {
        item: true,
        borrower: {
          select: { id: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      borrowerId,
      email: req.user.email,
      loans: loans.map(formatLoan),
      total: loans.length,
    });
  } catch (error) {
    console.error('Error fetching my loans:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while fetching your loans.',
    });
  }
}

module.exports = {
  requestLoan,
  createLoanDirect,
  issueLoan,
  returnLoan,
  markLoanLost,
  getLoanById,
  getLoanHistory,
  getMyLoans,
  formatLoan,
};

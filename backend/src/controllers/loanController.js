const { LoanStatus, LoanHistoryType } = require('@prisma/client');
const { stringify } = require('csv-stringify/sync');
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
 * Validate loan due date requirements:
 * 1. Due date is required when issuing a loan.
 * 2. Due date must be strictly after the issue date.
 * 3. Due date cannot be the same date as the issue date.
 * 4. Due date must be no more than 1 month after the issue date.
 */
function computeMaxDueDate(issueDate) {
  const max = new Date(issueDate);
  const currentDay = max.getDate();
  max.setMonth(max.getMonth() + 1);
  if (max.getDate() !== currentDay) {
    max.setDate(0);
  }
  return max;
}

function computeMaxDueDateUtc(issueDate) {
  const max = new Date(issueDate);
  const currentDay = max.getUTCDate();
  max.setUTCMonth(max.getUTCMonth() + 1);
  if (max.getUTCDate() !== currentDay) {
    max.setUTCDate(0);
  }
  return max;
}

function validateDueDate(dueDate, issueDate = new Date()) {
  if (!dueDate || (typeof dueDate === 'string' && !dueDate.trim())) {
    return {
      isValid: false,
      error: 'Due date is required when issuing a loan.',
    };
  }

  const parsedDueDate = new Date(dueDate);
  if (isNaN(parsedDueDate.getTime())) {
    return {
      isValid: false,
      error: 'Invalid dueDate format. Must be a valid date.',
    };
  }

  const parsedIssueDate = new Date(issueDate);

  const toDateStringLocal = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const toDateStringUtc = (d) => {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const dueStrLocal = toDateStringLocal(parsedDueDate);
  const dueStrUtc = toDateStringUtc(parsedDueDate);
  const issueStrLocal = toDateStringLocal(parsedIssueDate);
  const issueStrUtc = toDateStringUtc(parsedIssueDate);

  const maxDueDateLocal = computeMaxDueDate(parsedIssueDate);
  const maxDueDateUtc = computeMaxDueDateUtc(parsedIssueDate);
  const maxStrLocal = toDateStringLocal(maxDueDateLocal);
  const maxStrUtc = toDateStringUtc(maxDueDateUtc);

  // Check if due date is same date or in the past
  const isSameOrPast =
    parsedDueDate.getTime() <= parsedIssueDate.getTime() ||
    dueStrLocal <= issueStrLocal ||
    dueStrUtc <= issueStrUtc;

  if (isSameOrPast) {
    return {
      isValid: false,
      error: 'Due date must be strictly after the issue date and cannot be the same date.',
    };
  }

  // Check if due date is more than 1 month after issue date
  const isMoreThanOneMonth =
    dueStrLocal > maxStrLocal && dueStrUtc > maxStrUtc;

  if (isMoreThanOneMonth) {
    return {
      isValid: false,
      error: 'Due date must be no more than 1 month after the issue date.',
    };
  }

  return {
    isValid: true,
    parsedDueDate,
  };
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

    // Determine target initial status (defaults to ISSUED if status !== 'REQUESTED')
    const initialStatus = status === LoanStatus.REQUESTED ? LoanStatus.REQUESTED : LoanStatus.ISSUED;

    let parsedDueDate = null;
    if (initialStatus === LoanStatus.ISSUED) {
      const dateValidation = validateDueDate(dueDate);
      if (!dateValidation.isValid) {
        return res.status(400).json({
          error: dateValidation.error,
        });
      }
      parsedDueDate = dateValidation.parsedDueDate;
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

    const dateValidation = validateDueDate(dueDate);
    if (!dateValidation.isValid) {
      return res.status(400).json({
        error: dateValidation.error,
      });
    }
    const parsedDueDate = dateValidation.parsedDueDate;

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
 * Reusable helper to process a single loan return inside an atomic database transaction.
 * Validates existence and ISSUED status, transitions to RETURNED, and records immutable history.
 */
async function processSingleReturn(loanId, librarianId, note = null) {
  return await prisma.$transaction(async (tx) => {
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
}

/**
 * POST /api/loans/:id/return
 * Librarian processes return of an issued loan.
 * Valid transition: ISSUED -> RETURNED
 */
async function returnLoan(req, res) {
  try {
    const loanId = parseInt(req.params.id, 10);
    const { note } = req.body || {};
    const librarianId = req.user.id;

    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID.' });
    }

    const updatedLoan = await processSingleReturn(loanId, librarianId, note);

    return res.status(200).json({
      message: 'Loan returned successfully.',
      loan: formatLoan(updatedLoan),
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
 * POST /api/loans/bulk-return
 * Librarian bulk returns multiple loans in one request.
 * Each loan is processed independently in its own atomic transaction.
 */
async function bulkReturnLoans(req, res) {
  try {
    const { loanIds, note } = req.body || {};
    const librarianId = req.user.id;

    if (!loanIds || !Array.isArray(loanIds)) {
      return res.status(400).json({
        error: 'loanIds must be an array of integer loan IDs.',
      });
    }

    if (loanIds.length === 0) {
      return res.status(400).json({
        error: 'loanIds array must contain at least one loan ID.',
      });
    }

    if (loanIds.length > 500) {
      return res.status(400).json({
        error: `Batch exceeds maximum limit of 500 loan IDs. Received ${loanIds.length}.`,
      });
    }

    for (let i = 0; i < loanIds.length; i++) {
      const id = loanIds[i];
      if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          error: `Invalid loan ID at index ${i}: '${id}'. All loanIds must be positive integers.`,
        });
      }
    }

    const returnedLoans = [];
    const errors = [];
    const seenLoanIds = new Set();

    for (const loanId of loanIds) {
      if (seenLoanIds.has(loanId)) {
        errors.push({
          loanId,
          error: `Duplicate loan ID ${loanId} in request. Each loan ID can only be processed once per batch.`,
        });
        continue;
      }
      seenLoanIds.add(loanId);

      try {
        const updated = await processSingleReturn(loanId, librarianId, note);
        returnedLoans.push({
          loanId: updated.id,
          status: updated.status,
          loan: formatLoan(updated),
        });
      } catch (err) {
        errors.push({
          loanId,
          error: err.message || 'Failed to return loan.',
        });
      }
    }

    return res.status(200).json({
      message: `Bulk return completed: ${returnedLoans.length} returned, ${errors.length} failed.`,
      total: loanIds.length,
      successful: returnedLoans.length,
      failed: errors.length,
      returnedLoans,
      errors,
    });
  } catch (error) {
    console.error('Error during bulk return of loans:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred during bulk return of loans.',
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
 * Shared helper to build and validate where and orderBy clauses for loan queries.
 * Used by both GET /api/loans (listing) and GET /api/loans/export (CSV export).
 */
function buildLoanQuery({ user, query }) {
  const {
    search,
    status,
    category,
    borrowerId,
    overdue,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = query;

  // 1. Validate Sorting
  const validSortFields = ['requestedAt', 'dueDate', 'createdAt', 'status'];
  if (!validSortFields.includes(sortBy)) {
    return {
      error: `Invalid sortBy field '${sortBy}'. Allowed values: ${validSortFields.join(', ')}.`,
    };
  }

  const normalizedSortOrder = sortOrder.toLowerCase();
  if (!['asc', 'desc'].includes(normalizedSortOrder)) {
    return {
      error: `Invalid sortOrder '${sortOrder}'. Allowed values: asc, desc.`,
    };
  }

  // 2. Construct Where Clause
  const where = {};

  // Member Scoping vs Librarian Filtering
  if (user.role === 'MEMBER') {
    where.borrowerId = user.id;
  } else if (borrowerId !== undefined) {
    const parsedBorrowerId = parseInt(borrowerId, 10);
    if (isNaN(parsedBorrowerId) || parsedBorrowerId < 1) {
      return {
        error: 'Invalid borrowerId. Must be a positive integer.',
      };
    }
    where.borrowerId = parsedBorrowerId;
  }

  // Status Filter
  if (status !== undefined) {
    const validStatuses = Object.values(LoanStatus);
    if (!validStatuses.includes(status)) {
      return {
        error: `Invalid status filter '${status}'. Allowed values: ${validStatuses.join(', ')}.`,
      };
    }
    where.status = status;
  }

  // Category Filter (Item Relation)
  if (category !== undefined && typeof category === 'string' && category.trim()) {
    where.item = {
      ...where.item,
      category: {
        equals: category.trim(),
        mode: 'insensitive',
      },
    };
  }

  // Overdue Filter
  if (overdue !== undefined) {
    const now = new Date();
    if (overdue === 'true' || overdue === '1') {
      where.status = LoanStatus.ISSUED;
      where.dueDate = { lt: now };
    } else if (overdue === 'false' || overdue === '0') {
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { status: { not: LoanStatus.ISSUED } },
          { dueDate: null },
          { dueDate: { gte: now } },
        ],
      });
    } else {
      return {
        error: `Invalid overdue filter '${overdue}'. Allowed values: true, false.`,
      };
    }
  }

  // Search Filter (Item title, identifying code, borrower email)
  if (search !== undefined && typeof search === 'string' && search.trim()) {
    const cleanSearch = search.trim();
    where.AND = where.AND || [];
    where.AND.push({
      OR: [
        { item: { title: { contains: cleanSearch, mode: 'insensitive' } } },
        { item: { identifyingCode: { contains: cleanSearch, mode: 'insensitive' } } },
        { borrower: { email: { contains: cleanSearch, mode: 'insensitive' } } },
      ],
    });
  }

  // Stable Deterministic Order
  const orderBy = [{ [sortBy]: normalizedSortOrder }, { id: 'desc' }];

  return { where, orderBy };
}

/**
 * GET /api/loans
 * List loans across the library with server-side search, filtering, sorting, and pagination.
 * Members are strictly scoped to their own loans (borrowerId = req.user.id).
 * Librarians can view all loans and filter by specific borrowerId.
 */
async function getLoans(req, res) {
  try {
    const { page = '1', pageSize = '20' } = req.query;

    // 1. Validate Pagination
    const parsedPage = parseInt(page, 10);
    if (isNaN(parsedPage) || parsedPage < 1) {
      return res.status(400).json({
        error: 'Invalid page parameter. Must be a positive integer >= 1.',
      });
    }

    const parsedPageSize = parseInt(pageSize, 10);
    if (isNaN(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
      return res.status(400).json({
        error: 'Invalid pageSize parameter. Must be an integer between 1 and 100.',
      });
    }

    // 2. Build & validate query filters
    const queryResult = buildLoanQuery({ user: req.user, query: req.query });
    if (queryResult.error) {
      return res.status(400).json({ error: queryResult.error });
    }
    const { where, orderBy } = queryResult;

    // 3. Execute Count & Query in Parallel
    const [totalItems, loans] = await Promise.all([
      prisma.loan.count({ where }),
      prisma.loan.findMany({
        where,
        skip: (parsedPage - 1) * parsedPageSize,
        take: parsedPageSize,
        orderBy,
        include: {
          item: true,
          borrower: {
            select: { id: true, email: true, role: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / parsedPageSize);

    return res.status(200).json({
      loans: loans.map(formatLoan),
      pagination: {
        page: parsedPage,
        pageSize: parsedPageSize,
        totalItems,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error in getLoans:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while querying loans.',
    });
  }
}

/**
 * GET /api/loans/export
 * Export loans as CSV using identical search, filtering, and sorting rules as GET /api/loans.
 * Members are strictly scoped to their own loans.
 * Exports all matching records without pagination.
 */
async function exportLoansCsv(req, res) {
  try {
    // 1. Build & validate query filters
    const queryResult = buildLoanQuery({ user: req.user, query: req.query });
    if (queryResult.error) {
      return res.status(400).json({ error: queryResult.error });
    }
    const { where, orderBy } = queryResult;

    // 2. Fetch all matching records without pagination, selecting only safe catalogue/borrower fields
    const loans = await prisma.loan.findMany({
      where,
      orderBy,
      select: {
        id: true,
        itemId: true,
        borrowerId: true,
        requestedAt: true,
        dueDate: true,
        status: true,
        item: {
          select: {
            id: true,
            title: true,
            category: true,
            identifyingCode: true,
          },
        },
        borrower: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    const now = new Date();
    const rows = loans.map((loan) => {
      const isOverdue =
        loan.status === LoanStatus.ISSUED &&
        loan.dueDate !== null &&
        new Date(loan.dueDate) < now;

      return {
        loanId: loan.id,
        itemId: loan.itemId,
        itemTitle: loan.item ? loan.item.title : '',
        category: loan.item ? loan.item.category : '',
        identifyingCode: loan.item ? loan.item.identifyingCode : '',
        borrowerId: loan.borrowerId,
        borrowerEmail: loan.borrower ? loan.borrower.email : '',
        requestedAt: loan.requestedAt ? loan.requestedAt.toISOString() : '',
        dueDate: loan.dueDate ? loan.dueDate.toISOString() : '',
        status: loan.status,
        isOverdue: isOverdue ? 'true' : 'false',
      };
    });

    const columns = [
      { key: 'loanId', header: 'loanId' },
      { key: 'itemId', header: 'itemId' },
      { key: 'itemTitle', header: 'itemTitle' },
      { key: 'category', header: 'category' },
      { key: 'identifyingCode', header: 'identifyingCode' },
      { key: 'borrowerId', header: 'borrowerId' },
      { key: 'borrowerEmail', header: 'borrowerEmail' },
      { key: 'requestedAt', header: 'requestedAt' },
      { key: 'dueDate', header: 'dueDate' },
      { key: 'status', header: 'status' },
      { key: 'isOverdue', header: 'isOverdue' },
    ];

    const csvOutput = stringify(rows, {
      header: true,
      columns,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="loans-export.csv"');
    return res.status(200).send(csvOutput);
  } catch (error) {
    console.error('Error exporting loans as CSV:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while exporting loans.',
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

/**
 * Shared helper returning the Prisma query condition for overdue loans.
 * An overdue loan is strictly: status === 'ISSUED' AND dueDate < now.
 */
function getOverdueCondition(now = new Date()) {
  return {
    status: LoanStatus.ISSUED,
    dueDate: { lt: now },
  };
}

/**
 * GET /api/loans/overdue
 * Librarian retrieves overdue loan alerts.
 * Overdue condition: status = ISSUED AND dueDate < NOW().
 * Sorted by dueDate ASC (most overdue first), id DESC.
 */
async function getOverdueAlerts(req, res) {
  try {
    const { category, search } = req.query;
    const now = new Date();

    const where = {
      ...getOverdueCondition(now),
    };

    if (category !== undefined && typeof category === 'string' && category.trim()) {
      where.item = {
        ...where.item,
        category: {
          equals: category.trim(),
          mode: 'insensitive',
        },
      };
    }

    if (search !== undefined && typeof search === 'string' && search.trim()) {
      const cleanSearch = search.trim();
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { item: { title: { contains: cleanSearch, mode: 'insensitive' } } },
          { item: { identifyingCode: { contains: cleanSearch, mode: 'insensitive' } } },
          { borrower: { email: { contains: cleanSearch, mode: 'insensitive' } } },
        ],
      });
    }

    const loans = await prisma.loan.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { id: 'desc' }],
      select: {
        id: true,
        itemId: true,
        borrowerId: true,
        requestedAt: true,
        dueDate: true,
        status: true,
        item: {
          select: {
            title: true,
            identifyingCode: true,
            category: true,
          },
        },
        borrower: {
          select: {
            email: true,
          },
        },
      },
    });

    const overdueLoans = loans.map((loan) => ({
      loanId: loan.id,
      itemId: loan.itemId,
      itemTitle: loan.item ? loan.item.title : null,
      identifyingCode: loan.item ? loan.item.identifyingCode : null,
      category: loan.item ? loan.item.category : null,
      borrowerId: loan.borrowerId,
      borrowerEmail: loan.borrower ? loan.borrower.email : null,
      requestedAt: loan.requestedAt,
      dueDate: loan.dueDate,
      status: loan.status,
      isOverdue: true,
    }));

    return res.status(200).json({
      total: overdueLoans.length,
      overdueLoans,
    });
  } catch (error) {
    console.error('Error fetching overdue loan alerts:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while fetching overdue alerts.',
    });
  }
}

module.exports = {
  getLoans,
  exportLoansCsv,
  buildLoanQuery,
  getOverdueAlerts,
  getOverdueCondition,
  requestLoan,
  createLoanDirect,
  issueLoan,
  returnLoan,
  bulkReturnLoans,
  processSingleReturn,
  markLoanLost,
  getLoanById,
  getLoanHistory,
  getMyLoans,
  formatLoan,
};




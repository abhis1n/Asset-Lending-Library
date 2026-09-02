const express = require('express');
const {
  getLoans,
  exportLoansCsv,
  getOverdueAlerts,
  requestLoan,
  createLoanDirect,
  issueLoan,
  returnLoan,
  bulkReturnLoans,
  markLoanLost,
  getLoanById,
  getLoanHistory,
} = require('../controllers/loanController');
const { authenticate, requireLibrarian } = require('../middleware/auth');

const router = express.Router();

// Loan listing with search, filters, sorting, pagination
router.get('/', authenticate, getLoans);

// Loan export as CSV (Members scoped, Librarians all)
router.get('/export', authenticate, exportLoansCsv);

// Overdue loan alerts (Librarian only)
router.get('/overdue', authenticate, requireLibrarian, getOverdueAlerts);

// Member loan request
router.post('/request', authenticate, requestLoan);


// Librarian direct loan creation
router.post('/', authenticate, requireLibrarian, createLoanDirect);

// Bulk return (Librarian only)
router.post('/bulk-return', authenticate, requireLibrarian, bulkReturnLoans);

// Loan lifecycle transitions (Librarian only)
router.post('/:id/issue', authenticate, requireLibrarian, issueLoan);
router.post('/:id/return', authenticate, requireLibrarian, returnLoan);
router.post('/:id/lost', authenticate, requireLibrarian, markLoanLost);

// Loan details & immutable timeline history
router.get('/:id', authenticate, getLoanById);
router.get('/:id/history', authenticate, getLoanHistory);

module.exports = router;

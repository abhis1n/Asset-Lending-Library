const express = require('express');
const {
  getLoans,
  requestLoan,
  createLoanDirect,
  issueLoan,
  returnLoan,
  markLoanLost,
  getLoanById,
  getLoanHistory,
} = require('../controllers/loanController');
const { authenticate, requireLibrarian } = require('../middleware/auth');

const router = express.Router();

// Loan listing with search, filters, sorting, pagination
router.get('/', authenticate, getLoans);

// Member loan request
router.post('/request', authenticate, requestLoan);

// Librarian direct loan creation
router.post('/', authenticate, requireLibrarian, createLoanDirect);

// Loan lifecycle transitions (Librarian only)
router.post('/:id/issue', authenticate, requireLibrarian, issueLoan);
router.post('/:id/return', authenticate, requireLibrarian, returnLoan);
router.post('/:id/lost', authenticate, requireLibrarian, markLoanLost);

// Loan details & immutable timeline history
router.get('/:id', authenticate, getLoanById);
router.get('/:id/history', authenticate, getLoanHistory);

module.exports = router;

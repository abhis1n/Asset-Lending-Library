const express = require('express');
const { getMyCustodialItems } = require('../controllers/custodianController');
const { getMyLoans } = require('../controllers/loanController');
const { authenticate, requireLibrarian } = require('../middleware/auth');

const router = express.Router();

// GET /api/me/custodial-items (Librarian only)
router.get('/custodial-items', authenticate, requireLibrarian, getMyCustodialItems);

// GET /api/me/loans (Authenticated member)
router.get('/loans', authenticate, getMyLoans);

module.exports = router;

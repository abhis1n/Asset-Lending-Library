const express = require('express');
const { getMyCustodialItems } = require('../controllers/custodianController');
const { authenticate, requireLibrarian } = require('../middleware/auth');

const router = express.Router();

// GET /api/me/custodial-items (Librarian only)
router.get('/custodial-items', authenticate, requireLibrarian, getMyCustodialItems);

module.exports = router;

const express = require('express');
const { getDashboard } = require('../controllers/dashboardController');
const { authenticate, requireLibrarian } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard - Librarian only
router.get('/', authenticate, requireLibrarian, getDashboard);

module.exports = router;

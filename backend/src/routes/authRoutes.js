const express = require('express');
const { login, getMe } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/login', login);

// Protected routes
router.get('/me', authenticate, getMe);

module.exports = router;

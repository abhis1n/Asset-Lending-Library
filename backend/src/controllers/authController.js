const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { JWT_SECRET } = require('../middleware/auth');

/**
 * Handles user login.
 * Validates input, verifies email and passwordHash, returns JWT and user info.
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Look up user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    // Compare password with hash
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    // Generate JWT token (expires in 24 hours)
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred during login.',
    });
  }
}

/**
 * Returns current authenticated user profile.
 */
async function getMe(req, res) {
  try {
    // req.user is set by authenticate middleware
    return res.status(200).json({
      user: req.user,
    });
  } catch (error) {
    console.error('Error in getMe:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred retrieving profile.',
    });
  }
}

module.exports = {
  login,
  getMe,
};

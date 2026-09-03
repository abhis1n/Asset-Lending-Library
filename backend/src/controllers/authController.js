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
 * Handles member sign up (registration).
 * Validates email and password, creates new user with role MEMBER, returns JWT and user info.
 * Rejects existing users with clear error.
 */
async function register(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({
        error: 'Email is required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        error: 'Please provide a valid email address.',
      });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        error: 'Password is required and must be at least 6 characters long.',
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'A user with this email already exists.',
      });
    }

    // Hash password with bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user strictly with role MEMBER (users cannot choose role)
    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        role: 'MEMBER',
      },
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      message: 'Sign up successful.',
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error) {
    console.error('Error during sign up:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred during sign up.',
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
  register,
  getMe,
};


const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_asset_lending_2026';

/**
 * Middleware to authenticate requests via Bearer JWT token.
 * Extracts and verifies the JWT token, then attaches `req.user` with user details.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required. No Bearer token provided.',
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        error: 'Authentication token missing.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        error: 'Invalid or expired authentication token.',
      });
    }

    // Verify user still exists in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      return res.status(401).json({
        error: 'User associated with this token no longer exists.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({
      error: 'Internal server error during authentication.',
    });
  }
}

/**
 * Middleware factory to enforce required roles on routes.
 * Must be placed after `authenticate` middleware.
 * @param  {...string} allowedRoles
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required before role verification.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access forbidden: requires one of [${allowedRoles.join(', ')}] role(s). Current role: ${req.user.role}.`,
      });
    }

    next();
  };
}

/**
 * Specific middleware shorthand to enforce Librarian-only access.
 */
const requireLibrarian = requireRole('LIBRARIAN');

module.exports = {
  authenticate,
  requireRole,
  requireLibrarian,
  JWT_SECRET,
};

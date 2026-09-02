const path = require('path');
const dotenv = require('dotenv');

// Single source of truth for environment variables (.env in workspace root)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const prisma = require('./prisma');
const authRoutes = require('./routes/authRoutes');
const itemRoutes = require('./routes/itemRoutes');
const loanRoutes = require('./routes/loanRoutes');
const userRoutes = require('./routes/userRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const { authenticate, requireLibrarian } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.text({ type: ['text/csv', 'text/plain', 'application/csv'], limit: '5mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/me', userRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Protected Librarian test / verification route
app.get('/api/librarian/verify-role', authenticate, requireLibrarian, (req, res) => {
  res.status(200).json({
    message: 'Authorized librarian access granted.',
    user: req.user,
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      message: 'Asset Lending Library API is running and connected to PostgreSQL',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: error.message,
    });
  }
});

// Start server if executed directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;

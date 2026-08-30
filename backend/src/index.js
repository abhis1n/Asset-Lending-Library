const path = require('path');
const dotenv = require('dotenv');

// Single source of truth for environment variables (.env in workspace root)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const prisma = require('./prisma');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Quick DB connectivity check
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      message: 'Asset Lending Library API is running and connected to PostgreSQL',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;

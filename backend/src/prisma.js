const path = require('path');
const dotenv = require('dotenv');

// Load backend/.env as the single source of truth
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;

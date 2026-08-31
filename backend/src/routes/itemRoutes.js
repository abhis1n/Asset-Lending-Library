const express = require('express');
const {
  getItems,
  getItemById,
  createItem,
  updateItem,
  archiveItem,
  restoreItem,
} = require('../controllers/itemController');
const {
  assignCustodian,
  removeCustodian,
  getItemCustodians,
} = require('../controllers/custodianController');
const { authenticate, requireLibrarian } = require('../middleware/auth');

const router = express.Router();

// Catalogue item routes
router.get('/', authenticate, getItems);
router.get('/:id', authenticate, getItemById);
router.post('/', authenticate, requireLibrarian, createItem);
router.patch('/:id', authenticate, requireLibrarian, updateItem);
router.post('/:id/archive', authenticate, requireLibrarian, archiveItem);
router.post('/:id/restore', authenticate, requireLibrarian, restoreItem);

// Custodian assignment routes on items
router.get('/:itemId/custodians', authenticate, getItemCustodians);
router.post(
  '/:itemId/custodians/:librarianId',
  authenticate,
  requireLibrarian,
  assignCustodian
);
router.delete(
  '/:itemId/custodians/:librarianId',
  authenticate,
  requireLibrarian,
  removeCustodian
);

module.exports = router;

const prisma = require('../prisma');
const { formatItem } = require('./itemController');

/**
 * POST /api/items/:itemId/custodians/:librarianId
 * Assign a librarian as a custodian for an item (Librarian only).
 */
async function assignCustodian(req, res) {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    const librarianId = parseInt(req.params.librarianId, 10);

    if (isNaN(itemId) || isNaN(librarianId)) {
      return res.status(400).json({
        error: 'Invalid itemId or librarianId. Both must be integers.',
      });
    }

    // 1. Verify item exists
    const item = await prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return res.status(404).json({
        error: `Catalogue item with ID ${itemId} not found.`,
      });
    }

    // 2. Verify librarian exists and has LIBRARIAN role
    const librarian = await prisma.user.findUnique({
      where: { id: librarianId },
    });

    if (!librarian) {
      return res.status(404).json({
        error: `User with ID ${librarianId} not found.`,
      });
    }

    if (librarian.role !== 'LIBRARIAN') {
      return res.status(400).json({
        error: `User with ID ${librarianId} is not a librarian. Only librarians can be assigned as custodians.`,
      });
    }

    // 3. Check if assignment already exists
    const existing = await prisma.custodian.findUnique({
      where: {
        itemId_librarianId: {
          itemId,
          librarianId,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        error: `Librarian ${librarian.email} is already a custodian for item '${item.title}'.`,
      });
    }

    // 4. Create assignment
    const custodian = await prisma.custodian.create({
      data: {
        itemId,
        librarianId,
      },
      include: {
        librarian: {
          select: { id: true, email: true, role: true },
        },
        item: {
          select: { id: true, title: true, identifyingCode: true },
        },
      },
    });

    return res.status(201).json({
      message: 'Custodian assigned successfully.',
      custodian: {
        itemId: custodian.itemId,
        itemTitle: custodian.item.title,
        librarianId: custodian.librarianId,
        librarianEmail: custodian.librarian.email,
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'This custodian assignment already exists.',
      });
    }
    console.error('Error assigning custodian:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while assigning custodian.',
    });
  }
}

/**
 * DELETE /api/items/:itemId/custodians/:librarianId
 * Remove a custodian assignment (Librarian only).
 */
async function removeCustodian(req, res) {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    const librarianId = parseInt(req.params.librarianId, 10);

    if (isNaN(itemId) || isNaN(librarianId)) {
      return res.status(400).json({
        error: 'Invalid itemId or librarianId. Both must be integers.',
      });
    }

    // Verify assignment exists
    const existing = await prisma.custodian.findUnique({
      where: {
        itemId_librarianId: {
          itemId,
          librarianId,
        },
      },
    });

    if (!existing) {
      return res.status(404).json({
        error: `Custodian assignment between item ${itemId} and librarian ${librarianId} does not exist.`,
      });
    }

    // Delete assignment
    await prisma.custodian.delete({
      where: {
        itemId_librarianId: {
          itemId,
          librarianId,
        },
      },
    });

    return res.status(200).json({
      message: 'Custodian assignment removed successfully.',
    });
  } catch (error) {
    console.error('Error removing custodian:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while removing custodian.',
    });
  }
}

/**
 * GET /api/items/:itemId/custodians
 * Retrieve all librarians assigned as custodians for an item.
 */
async function getItemCustodians(req, res) {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({
        error: 'Invalid itemId. Must be an integer.',
      });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return res.status(404).json({
        error: `Catalogue item with ID ${itemId} not found.`,
      });
    }

    const custodians = await prisma.custodian.findMany({
      where: { itemId },
      include: {
        librarian: {
          select: { id: true, email: true, role: true },
        },
      },
    });

    return res.status(200).json({
      itemId,
      itemTitle: item.title,
      custodians: custodians.map((c) => c.librarian),
    });
  } catch (error) {
    console.error('Error fetching item custodians:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while fetching custodians.',
    });
  }
}

/**
 * GET /api/me/custodial-items
 * Retrieve all catalogue items for which current authenticated librarian is a custodian.
 * Derived strictly from req.user.id.
 */
async function getMyCustodialItems(req, res) {
  try {
    const librarianId = req.user.id;

    const custodialAssignments = await prisma.custodian.findMany({
      where: { librarianId },
      include: {
        item: {
          include: {
            custodians: {
              include: {
                librarian: {
                  select: { id: true, email: true, role: true },
                },
              },
            },
          },
        },
      },
      orderBy: { itemId: 'asc' },
    });

    const items = custodialAssignments.map((c) => formatItem(c.item));

    return res.status(200).json({
      librarianId,
      email: req.user.email,
      items,
      total: items.length,
    });
  } catch (error) {
    console.error('Error fetching my custodial items:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while fetching custodial items.',
    });
  }
}

module.exports = {
  assignCustodian,
  removeCustodian,
  getItemCustodians,
  getMyCustodialItems,
};

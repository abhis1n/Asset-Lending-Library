const prisma = require('../prisma');
const { parse } = require('csv-parse/sync');

/**
 * Helper to format item response and flatten custodians list
 */
function formatItem(item) {
  if (!item) return null;
  const custodians = item.custodians
    ? item.custodians.map((c) => ({
      id: c.librarian.id,
      email: c.librarian.email,
      role: c.librarian.role,
    }))
    : [];

  return {
    id: item.id,
    title: item.title,
    category: item.category,
    identifyingCode: item.identifyingCode,
    archived: item.archived,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    custodians,
  };
}

/**
 * GET /api/items
 * List catalogue items.
 * Defaults to active items (archived = false).
 * Librarians can pass ?includeArchived=true to view both active and archived items.
 * Members attempting to pass ?includeArchived=true receive 403 Forbidden.
 */
async function getItems(req, res) {
  try {
    const { includeArchived } = req.query;
    const isLibrarian = req.user && req.user.role === 'LIBRARIAN';

    let whereClause = { archived: false };

    if (includeArchived === 'true' || includeArchived === '1') {
      if (!isLibrarian) {
        return res.status(403).json({
          error: 'Access forbidden: only librarians can view archived catalogue items.',
        });
      }
      whereClause = {}; // Return all (active and archived)
    }

    const items = await prisma.item.findMany({
      where: whereClause,
      include: {
        custodians: {
          include: {
            librarian: {
              select: { id: true, email: true, role: true },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    return res.status(200).json({
      items: items.map(formatItem),
      total: items.length,
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while fetching catalogue items.',
    });
  }
}

/**
 * GET /api/items/:id
 * Retrieve a specific catalogue item by ID.
 */
async function getItemById(req, res) {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({
        error: 'Invalid item ID. Must be an integer.',
      });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        custodians: {
          include: {
            librarian: {
              select: { id: true, email: true, role: true },
            },
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({
        error: `Catalogue item with ID ${itemId} not found.`,
      });
    }

    return res.status(200).json({
      item: formatItem(item),
    });
  } catch (error) {
    console.error('Error fetching item by ID:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while fetching the item.',
    });
  }
}

/**
 * POST /api/items
 * Create a new catalogue item (Librarian only).
 */
async function createItem(req, res) {
  try {
    const { title, category, identifyingCode } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        error: 'Item title is required and must be a non-empty string.',
      });
    }

    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({
        error: 'Item category is required and must be a non-empty string.',
      });
    }

    if (
      !identifyingCode ||
      typeof identifyingCode !== 'string' ||
      !identifyingCode.trim()
    ) {
      return res.status(400).json({
        error:
          'Item identifyingCode is required and must be a non-empty string.',
      });
    }

    const cleanTitle = title.trim();
    const cleanCategory = category.trim();
    const cleanIdentifyingCode = identifyingCode.trim();

    // Check if identifyingCode already exists
    const existing = await prisma.item.findUnique({
      where: { identifyingCode: cleanIdentifyingCode },
    });

    if (existing) {
      return res.status(409).json({
        error: `An item with identifying code '${cleanIdentifyingCode}' already exists.`,
      });
    }

    // Create item (archived starts as false)
    const newItem = await prisma.item.create({
      data: {
        title: cleanTitle,
        category: cleanCategory,
        identifyingCode: cleanIdentifyingCode,
        archived: false,
      },
      include: {
        custodians: {
          include: {
            librarian: {
              select: { id: true, email: true, role: true },
            },
          },
        },
      },
    });

    return res.status(201).json({
      message: 'Catalogue item created successfully.',
      item: formatItem(newItem),
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'An item with this identifying code already exists.',
      });
    }
    console.error('Error creating item:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while creating catalogue item.',
    });
  }
}

/**
 * PATCH /api/items/:id
 * Update catalogue item details (Librarian only).
 */
async function updateItem(req, res) {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({
        error: 'Invalid item ID. Must be an integer.',
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

    const { title, category, identifyingCode } = req.body;
    const dataToUpdate = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({
          error: 'Title must be a non-empty string.',
        });
      }
      dataToUpdate.title = title.trim();
    }

    if (category !== undefined) {
      if (typeof category !== 'string' || !category.trim()) {
        return res.status(400).json({
          error: 'Category must be a non-empty string.',
        });
      }
      dataToUpdate.category = category.trim();
    }

    if (identifyingCode !== undefined) {
      if (typeof identifyingCode !== 'string' || !identifyingCode.trim()) {
        return res.status(400).json({
          error: 'Identifying code must be a non-empty string.',
        });
      }
      const cleanCode = identifyingCode.trim();

      // Check collision with other items
      if (cleanCode !== item.identifyingCode) {
        const existing = await prisma.item.findUnique({
          where: { identifyingCode: cleanCode },
        });
        if (existing && existing.id !== itemId) {
          return res.status(409).json({
            error: `An item with identifying code '${cleanCode}' already exists.`,
          });
        }
      }
      dataToUpdate.identifyingCode = cleanCode;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(400).json({
        error: 'No valid fields provided for update (title, category, identifyingCode).',
      });
    }

    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: dataToUpdate,
      include: {
        custodians: {
          include: {
            librarian: {
              select: { id: true, email: true, role: true },
            },
          },
        },
      },
    });

    return res.status(200).json({
      message: 'Catalogue item updated successfully.',
      item: formatItem(updatedItem),
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'An item with this identifying code already exists.',
      });
    }
    console.error('Error updating item:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while updating the item.',
    });
  }
}

/**
 * POST /api/items/:id/archive
 * Soft archive a catalogue item (Librarian only).
 * Sets archived = true, preserves loans and history.
 */
async function archiveItem(req, res) {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({
        error: 'Invalid item ID. Must be an integer.',
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

    if (item.archived) {
      return res.status(200).json({
        message: 'Item is already archived.',
        item: formatItem(item),
      });
    }

    const updated = await prisma.item.update({
      where: { id: itemId },
      data: { archived: true },
      include: {
        custodians: {
          include: {
            librarian: {
              select: { id: true, email: true, role: true },
            },
          },
        },
      },
    });

    return res.status(200).json({
      message: 'Item archived successfully.',
      item: formatItem(updated),
    });
  } catch (error) {
    console.error('Error archiving item:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while archiving the item.',
    });
  }
}

/**
 * POST /api/items/:id/restore
 * Restore an archived catalogue item (Librarian only).
 * Sets archived = false.
 */
async function restoreItem(req, res) {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({
        error: 'Invalid item ID. Must be an integer.',
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

    if (!item.archived) {
      return res.status(200).json({
        message: 'Item is already active.',
        item: formatItem(item),
      });
    }

    const updated = await prisma.item.update({
      where: { id: itemId },
      data: { archived: false },
      include: {
        custodians: {
          include: {
            librarian: {
              select: { id: true, email: true, role: true },
            },
          },
        },
      },
    });

    return res.status(200).json({
      message: 'Item restored successfully.',
      item: formatItem(updated),
    });
  } catch (error) {
    console.error('Error restoring item:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while restoring the item.',
    });
  }
}

/**
 * POST /api/items/import
 * Bulk import catalogue items from CSV (Librarian only).
 * Supports up to 500 data rows per request.
 * Processes each row independently in its own transaction.
 */
async function importItemsCsv(req, res) {
  try {
    let csvContent = null;
    if (typeof req.body === 'string') {
      csvContent = req.body;
    } else if (req.body && typeof req.body === 'object') {
      if (typeof req.body.csv === 'string') {
        csvContent = req.body.csv;
      } else if (typeof req.body.fileContent === 'string') {
        csvContent = req.body.fileContent;
      } else if (typeof req.body.data === 'string') {
        csvContent = req.body.data;
      }
    }

    if (!csvContent || !csvContent.trim()) {
      return res.status(400).json({
        error: 'CSV content is required and cannot be empty.',
      });
    }

    let parsedRecords;
    try {
      parsedRecords = parse(csvContent, {
        columns: (header) => header.map((h) => h.trim()),
        skip_empty_lines: true,
        trim: true,
        info: true,
      });
    } catch (parseErr) {
      return res.status(400).json({
        error: `Malformed CSV: ${parseErr.message}`,
      });
    }

    if (!parsedRecords || parsedRecords.length === 0) {
      return res.status(400).json({
        error: 'CSV contains no data rows to import.',
      });
    }

    if (parsedRecords.length > 500) {
      return res.status(400).json({
        error: `Import exceeds maximum limit of 500 data rows. Received ${parsedRecords.length} rows.`,
      });
    }

    // Verify required header columns
    const firstRecord = parsedRecords[0].record || {};
    const hasTitle = Object.prototype.hasOwnProperty.call(firstRecord, 'title');
    const hasCategory = Object.prototype.hasOwnProperty.call(firstRecord, 'category');
    const hasIdentifyingCode = Object.prototype.hasOwnProperty.call(firstRecord, 'identifyingCode');

    if (!hasTitle || !hasCategory || !hasIdentifyingCode) {
      return res.status(400).json({
        error: 'CSV headers must include: title, category, identifyingCode (and optionally archived).',
      });
    }

    const successfulItems = [];
    const errors = [];

    for (let i = 0; i < parsedRecords.length; i++) {
      const entry = parsedRecords[i];
      const rowNum = entry.info ? entry.info.lines : i + 2;
      const record = entry.record || {};

      const rawTitle = record.title;
      const rawCategory = record.category;
      const rawCode = record.identifyingCode;
      const rawArchived = record.archived;

      // Validate required fields
      if (!rawTitle || typeof rawTitle !== 'string' || !rawTitle.trim()) {
        errors.push({
          row: rowNum,
          identifyingCode: (rawCode && rawCode.trim()) || null,
          error: 'Title is required and must be a non-empty string.',
        });
        continue;
      }

      if (!rawCategory || typeof rawCategory !== 'string' || !rawCategory.trim()) {
        errors.push({
          row: rowNum,
          identifyingCode: (rawCode && rawCode.trim()) || null,
          error: 'Category is required and must be a non-empty string.',
        });
        continue;
      }

      if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
        errors.push({
          row: rowNum,
          identifyingCode: null,
          error: 'Identifying code is required and must be a non-empty string.',
        });
        continue;
      }

      const cleanTitle = rawTitle.trim();
      const cleanCategory = rawCategory.trim();
      const cleanIdentifyingCode = rawCode.trim();

      // Validate archived field (optional, defaults to false)
      let isArchived = false;
      if (rawArchived !== undefined && rawArchived !== null && rawArchived.trim() !== '') {
        const lower = rawArchived.trim().toLowerCase();
        if (lower === 'true' || lower === '1') {
          isArchived = true;
        } else if (lower === 'false' || lower === '0') {
          isArchived = false;
        } else {
          errors.push({
            row: rowNum,
            identifyingCode: cleanIdentifyingCode,
            error: `Invalid archived value '${rawArchived}'. Must be a boolean value (true, false, 1, or 0).`,
          });
          continue;
        }
      }

      // Execute each row in its own separate transaction
      try {
        const createdItem = await prisma.$transaction(async (tx) => {
          const existing = await tx.item.findUnique({
            where: { identifyingCode: cleanIdentifyingCode },
          });
          if (existing) {
            throw new Error(`An item with identifying code '${cleanIdentifyingCode}' already exists.`);
          }

          const item = await tx.item.create({
            data: {
              title: cleanTitle,
              category: cleanCategory,
              identifyingCode: cleanIdentifyingCode,
              archived: isArchived,
            },
          });

          return item;
        });

        successfulItems.push(formatItem(createdItem));
      } catch (rowErr) {
        let msg = rowErr.message;
        if (rowErr.code === 'P2002') {
          msg = `An item with identifying code '${cleanIdentifyingCode}' already exists.`;
        }
        errors.push({
          row: rowNum,
          identifyingCode: cleanIdentifyingCode,
          error: msg,
        });
      }
    }

    return res.status(200).json({
      message: `CSV import completed: ${successfulItems.length} item(s) imported successfully, ${errors.length} row(s) failed.`,
      totalRows: parsedRecords.length,
      successfulRows: successfulItems.length,
      failedRows: errors.length,
      summary: {
        total: parsedRecords.length,
        successful: successfulItems.length,
        failed: errors.length,
      },
      successfulItems,
      errors,
    });
  } catch (error) {
    console.error('Error importing catalogue items from CSV:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while importing catalogue items.',
    });
  }
}

module.exports = {
  getItems,
  getItemById,
  createItem,
  updateItem,
  archiveItem,
  restoreItem,
  importItemsCsv,
  formatItem,
};


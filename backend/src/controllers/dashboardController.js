const { LoanStatus } = require('@prisma/client');
const prisma = require('../prisma');

/**
 * GET /api/dashboard
 * Operational dashboard metrics for librarians.
 * Computes aggregate counts server-side via database queries.
 */
async function getDashboard(req, res) {
  try {
    const now = new Date();

    const [
      activeItems,
      archivedItems,
      requestedLoans,
      issuedLoans,
      returnedLoans,
      lostLoans,
      overdueLoans,
    ] = await Promise.all([
      // Catalogue counts
      prisma.item.count({ where: { archived: false } }),
      prisma.item.count({ where: { archived: true } }),

      // Loan counts by status
      prisma.loan.count({ where: { status: LoanStatus.REQUESTED } }),
      prisma.loan.count({ where: { status: LoanStatus.ISSUED } }),
      prisma.loan.count({ where: { status: LoanStatus.RETURNED } }),
      prisma.loan.count({ where: { status: LoanStatus.LOST } }),

      // Dynamic overdue loans count: status === ISSUED AND dueDate < now
      prisma.loan.count({
        where: {
          status: LoanStatus.ISSUED,
          dueDate: { lt: now },
        },
      }),
    ]);

    const totalCatalogue = activeItems + archivedItems;
    const openLoans = requestedLoans + issuedLoans;
    const nonOverdueIssued = Math.max(0, issuedLoans - overdueLoans);

    return res.status(200).json({
      catalogue: {
        total: totalCatalogue,
        active: activeItems,
        archived: archivedItems,
      },
      loans: {
        requested: requestedLoans,
        issued: issuedLoans,
        returned: returnedLoans,
        lost: lostLoans,
        open: openLoans,
      },
      overdue: {
        total: overdueLoans,
        nonOverdueIssued,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while generating dashboard metrics.',
    });
  }
}

module.exports = {
  getDashboard,
};

const { LoanStatus, LoanHistoryType } = require('@prisma/client');
const prisma = require('../prisma');
const { getOverdueCondition } = require('./loanController');

/**
 * Returns the start of the ISO week (Monday at 00:00:00.000 UTC) for a given date.
 */
function getStartOfISOWeek(d) {
  const date = new Date(d);
  const day = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/**
 * Calculates items returned per week over the last 8 weeks (current week + 7 previous weeks).
 * Exactly 8 weekly data points in chronological order.
 * Weeks with no returns have count: 0.
 *
 * @param {Date} now Current timestamp
 * @param {object} prismaClient Prisma client instance
 * @returns {Promise<Array<{ weekStart: string, weekEnd: string, label: string, count: number, isCurrentWeek: boolean }>>}
 */
async function get8WeekReturnMetrics(now = new Date(), prismaClient = prisma) {
  const currentWeekStart = getStartOfISOWeek(now);
  const weeks = [];

  // Generate 8 week buckets: 7 weeks ago up to current week (index 0 to 7)
  for (let i = 7; i >= 0; i--) {
    const start = new Date(currentWeekStart.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

    const month = start.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = start.getUTCDate();
    const label = `${month} ${day}`;

    weeks.push({
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
      label,
      count: 0,
      isCurrentWeek: i === 0,
    });
  }

  const oldestWeekStart = new Date(weeks[0].weekStart);

  // Query return events from LoanHistory (the source of truth for return events)
  const returnEvents = await prismaClient.loanHistory.findMany({
    where: {
      type: LoanHistoryType.RETURNED,
      createdAt: {
        gte: oldestWeekStart,
      },
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  // Assign each return event to its corresponding week bucket
  for (const event of returnEvents) {
    const eventTime = new Date(event.createdAt).getTime();

    for (let i = 0; i < weeks.length; i++) {
      const startTime = new Date(weeks[i].weekStart).getTime();
      const endTime = new Date(weeks[i].weekEnd).getTime();

      // For the most recent week, include anything >= startTime
      // For earlier weeks, use [startTime, endTime)
      const matches = i === weeks.length - 1
        ? eventTime >= startTime
        : eventTime >= startTime && eventTime < endTime;

      if (matches) {
        weeks[i].count += 1;
        break; // Ensure each event is counted in exactly one bucket
      }
    }
  }

  return weeks;
}

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
      weeklyReturns,
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
        where: getOverdueCondition(now),
      }),

      // 8-week item return metrics
      get8WeekReturnMetrics(now, prisma),
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
      weeklyReturns,
      returnsByWeek: weeklyReturns,
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
  getStartOfISOWeek,
  get8WeekReturnMetrics,
};


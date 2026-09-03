/**
 * Loan Due Date Validation & Formatting Utilities
 *
 * Rules:
 * 1. Due date is required when issuing a loan.
 * 2. Due date must be strictly after the issue date.
 * 3. Due date cannot be the same date as the issue date.
 * 4. Due date must be no more than 1 month after the issue date.
 */

export function formatDateToYYYYMMDD(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeMaxDueDate(issueDate = new Date()) {
  const max = new Date(issueDate);
  const currentDay = max.getDate();
  max.setMonth(max.getMonth() + 1);
  if (max.getDate() !== currentDay) {
    max.setDate(0); // clamp to last day of previous month
  }
  return max;
}

export function computeMinDueDate(issueDate = new Date()) {
  const min = new Date(issueDate);
  min.setDate(min.getDate() + 1);
  return min;
}

export function getLoanDueDateLimits(issueDate = new Date()) {
  const minDate = computeMinDueDate(issueDate);
  const maxDate = computeMaxDueDate(issueDate);

  return {
    minDateString: formatDateToYYYYMMDD(minDate),
    maxDateString: formatDateToYYYYMMDD(maxDate),
    minDate,
    maxDate,
  };
}

export function validateLoanDueDate(dueDate, issueDate = new Date()) {
  if (!dueDate || (typeof dueDate === 'string' && !dueDate.trim())) {
    return {
      isValid: false,
      error: 'Due date is required when issuing a loan.',
    };
  }

  const parsedDueDate = new Date(dueDate);
  if (isNaN(parsedDueDate.getTime())) {
    return {
      isValid: false,
      error: 'Invalid dueDate format. Must be a valid date.',
    };
  }

  const parsedIssueDate = new Date(issueDate);

  const toDateStringLocal = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const toDateStringUtc = (d) => {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const dueStrLocal = toDateStringLocal(parsedDueDate);
  const dueStrUtc = toDateStringUtc(parsedDueDate);
  const issueStrLocal = toDateStringLocal(parsedIssueDate);
  const issueStrUtc = toDateStringUtc(parsedIssueDate);

  const maxDueDateLocal = computeMaxDueDate(parsedIssueDate);
  const maxDueDateUtc = computeMaxDueDate(new Date(Date.UTC(
    parsedIssueDate.getUTCFullYear(),
    parsedIssueDate.getUTCMonth(),
    parsedIssueDate.getUTCDate()
  )));
  const maxStrLocal = toDateStringLocal(maxDueDateLocal);
  const maxStrUtc = toDateStringUtc(maxDueDateUtc);

  // Check if due date is same date or in the past
  const isSameOrPast =
    parsedDueDate.getTime() <= parsedIssueDate.getTime() ||
    dueStrLocal <= issueStrLocal ||
    dueStrUtc <= issueStrUtc;

  if (isSameOrPast) {
    return {
      isValid: false,
      error: 'Due date must be strictly after the issue date and cannot be the same date.',
    };
  }

  // Check if due date is more than 1 month after issue date
  const isMoreThanOneMonth =
    dueStrLocal > maxStrLocal && dueStrUtc > maxStrUtc;

  if (isMoreThanOneMonth) {
    return {
      isValid: false,
      error: 'Due date must be no more than 1 month after the issue date.',
    };
  }

  return {
    isValid: true,
    parsedDueDate,
  };
}

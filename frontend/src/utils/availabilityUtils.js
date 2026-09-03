/**
 * Catalogue Item Availability Utilities
 *
 * Rules:
 * Available:
 * - No current unavailable loan exists.
 * - Previous RETURNED loans do not make it unavailable.
 *
 * Unavailable:
 * - A REQUESTED loan exists.
 * - An ISSUED loan exists.
 * - A LOST loan exists, because the physical item is no longer available.
 */

export const UNAVAILABLE_LOAN_STATUSES = ['REQUESTED', 'ISSUED', 'LOST'];

/**
 * Compute item availability based on backend flags or loan records:
 * @param {Object} item Catalogue item object
 * @returns {{ isAvailable: boolean, label: string }}
 */
export function computeItemAvailability(item) {
  if (!item) return { isAvailable: false, label: 'Unavailable' };

  // 1. If backend already computed isAvailable boolean
  if (typeof item.isAvailable === 'boolean') {
    return {
      isAvailable: item.isAvailable,
      label: item.isAvailable ? 'Available' : 'Unavailable',
    };
  }

  // 2. If backend provided availability string ('Available' / 'Unavailable')
  if (typeof item.availability === 'string') {
    const isAvail = item.availability.toLowerCase() === 'available';
    return {
      isAvailable: isAvail,
      label: isAvail ? 'Available' : 'Unavailable',
    };
  }

  // 3. If item.loans array is present, evaluate loan statuses
  if (Array.isArray(item.loans)) {
    const hasUnavailableLoan = item.loans.some((l) =>
      UNAVAILABLE_LOAN_STATUSES.includes(l.status)
    );
    const isAvail = !hasUnavailableLoan;
    return {
      isAvailable: isAvail,
      label: isAvail ? 'Available' : 'Unavailable',
    };
  }

  // 4. Default fallback: active item is Available unless archived
  const fallbackAvailable = !item.archived;
  return {
    isAvailable: fallbackAvailable,
    label: fallbackAvailable ? 'Available' : 'Unavailable',
  };
}

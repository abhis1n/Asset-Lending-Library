import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { api, setToken } from '../src/services/api.js';
import { computeItemAvailability } from '../src/utils/availabilityUtils.js';

if (typeof globalThis.localStorage === 'undefined') {
  const store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => {
      store[key] = String(val);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
  };
}

describe('Frontend Catalogue Item Availability Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // 1. Item with no loans -> Available
  test('1. Item with no loans → Available', () => {
    const itemWithNoLoans = {
      id: 1,
      title: 'Sony Alpha Camera',
      archived: false,
      isAvailable: true,
      availability: 'Available',
      loans: [],
    };

    const status = computeItemAvailability(itemWithNoLoans);
    assert.strictEqual(status.isAvailable, true);
    assert.strictEqual(status.label, 'Available');

    // Also verify when relying solely on empty loans array
    const rawItem = { id: 1, title: 'Sony Alpha Camera', loans: [] };
    const rawStatus = computeItemAvailability(rawItem);
    assert.strictEqual(rawStatus.isAvailable, true);
    assert.strictEqual(rawStatus.label, 'Available');
  });

  // 2. Item with a REQUESTED loan -> Unavailable
  test('2. Item with a REQUESTED loan → Unavailable', () => {
    const itemWithRequestedLoan = {
      id: 2,
      title: 'Projector Epson',
      archived: false,
      isAvailable: false,
      availability: 'Unavailable',
      loans: [{ id: 101, status: 'REQUESTED' }],
    };

    const status = computeItemAvailability(itemWithRequestedLoan);
    assert.strictEqual(status.isAvailable, false);
    assert.strictEqual(status.label, 'Unavailable');

    // From raw loans array
    const rawStatus = computeItemAvailability({
      id: 2,
      loans: [{ id: 101, status: 'REQUESTED' }],
    });
    assert.strictEqual(rawStatus.isAvailable, false);
    assert.strictEqual(rawStatus.label, 'Unavailable');
  });

  // 3. Item with an ISSUED loan -> Unavailable
  test('3. Item with an ISSUED loan → Unavailable', () => {
    const itemWithIssuedLoan = {
      id: 3,
      title: 'Fluke Multimeter',
      archived: false,
      isAvailable: false,
      availability: 'Unavailable',
      loans: [{ id: 102, status: 'ISSUED' }],
    };

    const status = computeItemAvailability(itemWithIssuedLoan);
    assert.strictEqual(status.isAvailable, false);
    assert.strictEqual(status.label, 'Unavailable');

    const rawStatus = computeItemAvailability({
      id: 3,
      loans: [{ id: 102, status: 'ISSUED' }],
    });
    assert.strictEqual(rawStatus.isAvailable, false);
    assert.strictEqual(rawStatus.label, 'Unavailable');
  });

  // 4. Item with a LOST loan -> Unavailable
  test('4. Item with a LOST loan → Unavailable', () => {
    const itemWithLostLoan = {
      id: 4,
      title: 'Microphone Rode Wireless',
      archived: false,
      isAvailable: false,
      availability: 'Unavailable',
      loans: [{ id: 103, status: 'LOST' }],
    };

    const status = computeItemAvailability(itemWithLostLoan);
    assert.strictEqual(status.isAvailable, false);
    assert.strictEqual(status.label, 'Unavailable');

    const rawStatus = computeItemAvailability({
      id: 4,
      loans: [{ id: 103, status: 'LOST' }],
    });
    assert.strictEqual(rawStatus.isAvailable, false);
    assert.strictEqual(rawStatus.label, 'Unavailable');
  });

  // 5. Item with only a RETURNED loan -> Available
  test('5. Item with only a RETURNED loan → Available', () => {
    const itemWithReturnedLoan = {
      id: 5,
      title: 'Studio Lighting Kit',
      archived: false,
      isAvailable: true,
      availability: 'Available',
      loans: [{ id: 104, status: 'RETURNED' }],
    };

    const status = computeItemAvailability(itemWithReturnedLoan);
    assert.strictEqual(status.isAvailable, true);
    assert.strictEqual(status.label, 'Available');

    const rawStatus = computeItemAvailability({
      id: 5,
      loans: [{ id: 104, status: 'RETURNED' }],
    });
    assert.strictEqual(rawStatus.isAvailable, true);
    assert.strictEqual(rawStatus.label, 'Available');
  });

  // 6. Item with historical RETURNED loans and no current unavailable state -> Available
  test('6. Item with historical RETURNED loans and no current unavailable state → Available', () => {
    const itemWithMultipleReturned = {
      id: 6,
      title: 'Audio Recorder Zoom H6',
      archived: false,
      isAvailable: true,
      availability: 'Available',
      loans: [
        { id: 201, status: 'RETURNED' },
        { id: 202, status: 'RETURNED' },
        { id: 203, status: 'RETURNED' },
      ],
    };

    const status = computeItemAvailability(itemWithMultipleReturned);
    assert.strictEqual(status.isAvailable, true);
    assert.strictEqual(status.label, 'Available');

    const rawStatus = computeItemAvailability({
      id: 6,
      loans: [
        { id: 201, status: 'RETURNED' },
        { id: 202, status: 'RETURNED' },
        { id: 203, status: 'RETURNED' },
      ],
    });
    assert.strictEqual(rawStatus.isAvailable, true);
    assert.strictEqual(rawStatus.label, 'Available');
  });

  // 7. Availability changes correctly when a current REQUESTED/ISSUED loan is returned
  test('7. Availability changes correctly when a current REQUESTED/ISSUED loan is returned', () => {
    // Current state: item has an active ISSUED loan alongside past RETURNED loan
    const itemActive = {
      id: 7,
      title: 'Oscilloscope Rigol',
      loans: [
        { id: 301, status: 'RETURNED' },
        { id: 302, status: 'ISSUED' },
      ],
    };

    const beforeReturn = computeItemAvailability(itemActive);
    assert.strictEqual(beforeReturn.isAvailable, false);
    assert.strictEqual(beforeReturn.label, 'Unavailable');

    // Loan is returned
    const itemAfterReturn = {
      id: 7,
      title: 'Oscilloscope Rigol',
      loans: [
        { id: 301, status: 'RETURNED' },
        { id: 302, status: 'RETURNED' },
      ],
    };

    const afterReturn = computeItemAvailability(itemAfterReturn);
    assert.strictEqual(afterReturn.isAvailable, true);
    assert.strictEqual(afterReturn.label, 'Available');
  });

  // 8. Availability remains unavailable when an item is marked LOST
  test('8. Availability remains unavailable when an item is marked LOST', () => {
    // Current state: item is ISSUED (Unavailable)
    const itemIssued = {
      id: 8,
      title: 'Drone DJI Mini',
      loans: [{ id: 401, status: 'ISSUED' }],
    };

    const issuedStatus = computeItemAvailability(itemIssued);
    assert.strictEqual(issuedStatus.isAvailable, false);
    assert.strictEqual(issuedStatus.label, 'Unavailable');

    // Marked LOST: still Unavailable
    const itemLost = {
      id: 8,
      title: 'Drone DJI Mini',
      loans: [{ id: 401, status: 'LOST' }],
    };

    const lostStatus = computeItemAvailability(itemLost);
    assert.strictEqual(lostStatus.isAvailable, false);
    assert.strictEqual(lostStatus.label, 'Unavailable');
  });

  // 9. API client receives availability fields from GET /items and GET /items/:id
  test('9. API client receives availability fields from GET /items and GET /items/:id', async () => {
    setToken('member-jwt');

    const mockItem = {
      id: 10,
      title: 'Thermal Camera',
      category: 'Inspection',
      identifyingCode: 'THERM-001',
      archived: false,
      isAvailable: false,
      availability: 'Unavailable',
      custodians: [],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.endsWith('/items')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ items: [mockItem], total: 1 }),
        };
      }
      if (url.endsWith('/items/10')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ item: mockItem }),
        };
      }
      throw new Error(`Unhandled url ${url}`);
    };

    try {
      const listData = await api.get('/items');
      assert.strictEqual(listData.items[0].isAvailable, false);
      assert.strictEqual(listData.items[0].availability, 'Unavailable');

      const detailData = await api.get('/items/10');
      assert.strictEqual(detailData.item.isAvailable, false);
      assert.strictEqual(detailData.item.availability, 'Unavailable');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

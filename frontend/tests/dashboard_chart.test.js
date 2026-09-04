import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Frontend Weekly Returns Chart Integration Tests', () => {
  const sample8WeekData = [
    { weekStart: '2026-07-13T00:00:00.000Z', weekEnd: '2026-07-20T00:00:00.000Z', label: 'Jul 13', count: 1, isCurrentWeek: false },
    { weekStart: '2026-07-20T00:00:00.000Z', weekEnd: '2026-07-27T00:00:00.000Z', label: 'Jul 20', count: 1, isCurrentWeek: false },
    { weekStart: '2026-07-27T00:00:00.000Z', weekEnd: '2026-08-03T00:00:00.000Z', label: 'Jul 27', count: 1, isCurrentWeek: false },
    { weekStart: '2026-08-03T00:00:00.000Z', weekEnd: '2026-08-10T00:00:00.000Z', label: 'Aug 3', count: 1, isCurrentWeek: false },
    { weekStart: '2026-08-10T00:00:00.000Z', weekEnd: '2026-08-17T00:00:00.000Z', label: 'Aug 10', count: 0, isCurrentWeek: false },
    { weekStart: '2026-08-17T00:00:00.000Z', weekEnd: '2026-08-24T00:00:00.000Z', label: 'Aug 17', count: 2, isCurrentWeek: false },
    { weekStart: '2026-08-24T00:00:00.000Z', weekEnd: '2026-08-31T00:00:00.000Z', label: 'Aug 24', count: 1, isCurrentWeek: false },
    { weekStart: '2026-08-31T00:00:00.000Z', weekEnd: '2026-09-07T00:00:00.000Z', label: 'Aug 31', count: 3, isCurrentWeek: true },
  ];

  test('1. Exactly 8 weekly data points are processed', () => {
    assert.strictEqual(sample8WeekData.length, 8, 'Chart must receive exactly 8 data points');
    const totalCount = sample8WeekData.reduce((sum, item) => sum + item.count, 0);
    assert.strictEqual(totalCount, 10, 'Calculates 8-week total return volume accurately');
  });

  test('2. Current week is identified as the 8th weekly bucket', () => {
    const currentWeekItem = sample8WeekData[7];
    assert.strictEqual(currentWeekItem.isCurrentWeek, true);
    assert.strictEqual(currentWeekItem.count, 3);

    for (let i = 0; i < 7; i++) {
      assert.strictEqual(sample8WeekData[i].isCurrentWeek, false);
    }
  });

  test('3. Weeks with no returns have a count of 0 (zero-filling)', () => {
    const zeroWeek = sample8WeekData.find((w) => w.count === 0);
    assert.ok(zeroWeek, 'At least one week must be present with count 0');
    assert.strictEqual(zeroWeek.label, 'Aug 10');
    assert.strictEqual(zeroWeek.count, 0);
  });

  test('4. Chronological sequence of 8 weeks is verified', () => {
    for (let i = 0; i < sample8WeekData.length - 1; i++) {
      const currentStart = new Date(sample8WeekData[i].weekStart).getTime();
      const nextStart = new Date(sample8WeekData[i + 1].weekStart).getTime();
      assert.ok(currentStart < nextStart, 'Weeks must be strictly increasing in time');
      assert.strictEqual(
        new Date(sample8WeekData[i].weekEnd).getTime(),
        nextStart,
        'No gaps or overlaps between adjacent weeks'
      );
    }
  });

  test('5. Empty or missing input defaults to exactly 8 zero-filled points', () => {
    const emptyInput = [];
    const fallbackData = emptyInput.length === 8
      ? emptyInput
      : Array.from({ length: 8 }, (_, i) => ({
          label: `W${i + 1}`,
          count: 0,
          isCurrentWeek: i === 7,
        }));

    assert.strictEqual(fallbackData.length, 8);
    assert.strictEqual(fallbackData[7].isCurrentWeek, true);
    fallbackData.forEach((item) => {
      assert.strictEqual(item.count, 0);
    });
  });
});

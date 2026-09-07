import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCountdown } from '../lib/cooking-timer';

void test('countdown formats minute and second boundaries without ending early', () => {
  const cases: [number, string][] = [
    [600000, '10:00'],
    [599000, '09:59'],
    [598000, '09:58'],
    [60001, '01:01'],
    [60000, '01:00'],
    [59999, '01:00'],
    [59000, '00:59'],
    [1001, '00:02'],
    [1000, '00:01'],
    [1, '00:01'],
    [0, '00:00'],
    [-1000, '00:00'],
    [100 * 60000, '100:00'],
  ];
  for (const [remainingMs, label] of cases) {
    assert.equal(formatCountdown(remainingMs), label, `${remainingMs} ms`);
  }
});

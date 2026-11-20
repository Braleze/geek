import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAUNCH_REDIRECT_URL,
  LAUNCH_TARGET_ISO,
  LAUNCH_TARGET_MS,
  formatCountdownPart,
  getCountdownSnapshot,
  pluralizeRu,
} from './launchCountdown';

test('LAUNCH_TARGET_MS equals 2026-12-01 12:00:00 Moscow time (09:00:00 UTC)', () => {
  assert.equal(LAUNCH_TARGET_ISO, '2026-12-01T12:00:00+03:00');
  assert.equal(LAUNCH_TARGET_MS, Date.UTC(2026, 11, 1, 9, 0, 0));
  assert.equal(LAUNCH_REDIRECT_URL, 'https://app.geek-voice.ru');
});

test('getCountdownSnapshot breaks down multi-day remaining time accurately', () => {
  // 2026-11-20T09:15:30+03:00 -> 11 days, 2h 44m 30s before 2026-12-01T12:00:00+03:00
  const now = Date.parse('2026-11-20T09:15:30+03:00');
  const snap = getCountdownSnapshot(now);

  assert.equal(snap.isLaunched, false);
  assert.equal(snap.days, 11);
  assert.equal(snap.hours, 2);
  assert.equal(snap.minutes, 44);
  assert.equal(snap.seconds, 30);
});

test('getCountdownSnapshot handles 1 second before launch, exact launch, and post-launch', () => {
  const before = getCountdownSnapshot(LAUNCH_TARGET_MS - 1000);
  assert.equal(before.isLaunched, false);
  assert.equal(before.days, 0);
  assert.equal(before.hours, 0);
  assert.equal(before.minutes, 0);
  assert.equal(before.seconds, 1);

  const exact = getCountdownSnapshot(LAUNCH_TARGET_MS);
  assert.equal(exact.isLaunched, true);
  assert.equal(exact.totalRemainingMs, 0);
  assert.equal(exact.days, 0);
  assert.equal(exact.hours, 0);
  assert.equal(exact.minutes, 0);
  assert.equal(exact.seconds, 0);

  const after = getCountdownSnapshot(LAUNCH_TARGET_MS + 60_000);
  assert.equal(after.isLaunched, true);
  assert.equal(after.totalRemainingMs, 0);
});

test('formatCountdownPart pads small numbers and preserves 3-digit day counts', () => {
  assert.equal(formatCountdownPart(0), '00');
  assert.equal(formatCountdownPart(7), '07');
  assert.equal(formatCountdownPart(59), '59');
  assert.equal(formatCountdownPart(376), '376');
  assert.equal(formatCountdownPart(-5), '00');
});

test('pluralizeRu selects exact Russian declensions for days, hours, minutes, seconds', () => {
  const days: readonly [string, string, string] = ['день', 'дня', 'дней'];
  assert.equal(pluralizeRu(0, days), 'дней');
  assert.equal(pluralizeRu(1, days), 'день');
  assert.equal(pluralizeRu(2, days), 'дня');
  assert.equal(pluralizeRu(4, days), 'дня');
  assert.equal(pluralizeRu(5, days), 'дней');
  assert.equal(pluralizeRu(11, days), 'дней');
  assert.equal(pluralizeRu(14, days), 'дней');
  assert.equal(pluralizeRu(21, days), 'день');
  assert.equal(pluralizeRu(22, days), 'дня');
  assert.equal(pluralizeRu(111, days), 'дней');
  assert.equal(pluralizeRu(376, days), 'дней');
});

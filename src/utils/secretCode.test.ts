import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECRET_CODE,
  appendDigit,
  clearDigits,
  createInitialKeypadState,
  formatCodeSlots,
  removeDigit,
  submitCode,
  verifySecretCode,
} from './secretCode';

test('verifySecretCode accepts 2027 and rejects other codes', () => {
  assert.equal(SECRET_CODE, '2027');
  assert.equal(verifySecretCode('2027'), true);
  assert.equal(verifySecretCode(' 2027 '), true);
  assert.equal(verifySecretCode('2026'), false);
  assert.equal(verifySecretCode('0000'), false);
  assert.equal(verifySecretCode(''), false);
});

test('entering 2027 digit-by-digit automatically unlocks the secret room', () => {
  let state = createInitialKeypadState();
  state = appendDigit(state, '2');
  assert.equal(state.digits, '2');
  assert.equal(state.status, 'locked');

  state = appendDigit(state, '0');
  state = appendDigit(state, '2');
  assert.equal(state.digits, '202');
  assert.equal(state.status, 'locked');

  state = appendDigit(state, '7');
  assert.equal(state.digits, '2027');
  assert.equal(state.status, 'unlocked');
  assert.equal(state.errorMessage, null);
});

test('entering a wrong 4-digit code sets error state and increments attempts', () => {
  let state = createInitialKeypadState();
  for (const ch of ['1', '2', '3', '4']) {
    state = appendDigit(state, ch);
  }
  assert.equal(state.status, 'error');
  assert.equal(state.attempts, 1);
  assert.ok(state.errorMessage);

  // Typing a new digit after error starts fresh
  state = appendDigit(state, '2');
  assert.equal(state.digits, '2');
  assert.equal(state.status, 'locked');
  assert.equal(state.errorMessage, null);
});

test('submitCode validates incomplete codes', () => {
  let state = createInitialKeypadState();
  state = appendDigit(state, '2');
  state = appendDigit(state, '0');
  state = submitCode(state);
  assert.equal(state.status, 'error');
  assert.equal(state.attempts, 1);
});

test('removeDigit and clearDigits update digits safely', () => {
  let state = createInitialKeypadState();
  state = appendDigit(state, '9');
  state = appendDigit(state, '8');
  state = removeDigit(state);
  assert.equal(state.digits, '9');
  state = clearDigits(state);
  assert.equal(state.digits, '');
});

test('formatCodeSlots always returns 4 slot strings', () => {
  assert.deepEqual(formatCodeSlots(''), ['', '', '', '']);
  assert.deepEqual(formatCodeSlots('20'), ['2', '0', '', '']);
  assert.deepEqual(formatCodeSlots('2027'), ['2', '0', '2', '7']);
});

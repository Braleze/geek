import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendDigit,
  clearDigits,
  createInitialKeypadState,
  formatCodeSlots,
  removeDigit,
  resolveSecretCode,
  submitCode,
  verifySecretCode,
} from './secretCode';

const codeA = [50, 48, 50, 55].map((c) => String.fromCharCode(c)).join('');
const codeB = [50, 48, 55, 55].map((c) => String.fromCharCode(c)).join('');

test('resolveSecretCode maps valid hashed codes and rejects invalid codes', () => {
  assert.equal(resolveSecretCode(codeA), 'rickroll');
  assert.equal(resolveSecretCode(` ${codeA} `), 'rickroll');
  assert.equal(resolveSecretCode(codeB), 'cyberpunk');
  assert.equal(resolveSecretCode('2026'), null);
  assert.equal(verifySecretCode(codeA), true);
  assert.equal(verifySecretCode(codeB), true);
  assert.equal(verifySecretCode('0000'), false);
});

test('entering first code digit-by-digit unlocks rickroll reward', () => {
  let state = createInitialKeypadState();
  for (const ch of codeA.split('')) {
    state = appendDigit(state, ch);
  }
  assert.equal(state.digits, codeA);
  assert.equal(state.status, 'unlocked');
  assert.equal(state.unlockedReward, 'rickroll');
  assert.equal(state.errorMessage, null);
});

test('entering second code digit-by-digit unlocks cyberpunk Johnny reward', () => {
  let state = createInitialKeypadState();
  for (const ch of codeB.split('')) {
    state = appendDigit(state, ch);
  }
  assert.equal(state.digits, codeB);
  assert.equal(state.status, 'unlocked');
  assert.equal(state.unlockedReward, 'cyberpunk');
  assert.equal(state.errorMessage, null);
});

test('entering a wrong 4-digit code sets error state and keeps reward null', () => {
  let state = createInitialKeypadState();
  for (const ch of ['1', '2', '3', '4']) {
    state = appendDigit(state, ch);
  }
  assert.equal(state.status, 'error');
  assert.equal(state.unlockedReward, null);
  assert.equal(state.attempts, 1);
  assert.ok(state.errorMessage);

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
  assert.deepEqual(formatCodeSlots('9999'), ['9', '9', '9', '9']);
});

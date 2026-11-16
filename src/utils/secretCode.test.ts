import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CYBERPUNK_CODE,
  SECRET_CODE,
  appendDigit,
  clearDigits,
  createInitialKeypadState,
  formatCodeSlots,
  removeDigit,
  resolveSecretCode,
  submitCode,
  verifySecretCode,
} from './secretCode';

test('resolveSecretCode maps 2027 to rickroll and 2077 to cyberpunk', () => {
  assert.equal(SECRET_CODE, '2027');
  assert.equal(CYBERPUNK_CODE, '2077');
  assert.equal(resolveSecretCode('2027'), 'rickroll');
  assert.equal(resolveSecretCode(' 2027 '), 'rickroll');
  assert.equal(resolveSecretCode('2077'), 'cyberpunk');
  assert.equal(resolveSecretCode('2026'), null);
  assert.equal(verifySecretCode('2027'), true);
  assert.equal(verifySecretCode('2077'), true);
  assert.equal(verifySecretCode('0000'), false);
});

test('entering 2027 digit-by-digit unlocks rickroll reward', () => {
  let state = createInitialKeypadState();
  for (const ch of ['2', '0', '2', '7']) {
    state = appendDigit(state, ch);
  }
  assert.equal(state.digits, '2027');
  assert.equal(state.status, 'unlocked');
  assert.equal(state.unlockedReward, 'rickroll');
  assert.equal(state.errorMessage, null);
});

test('entering 2077 digit-by-digit unlocks cyberpunk Johnny reward', () => {
  let state = createInitialKeypadState();
  for (const ch of ['2', '0', '7', '7']) {
    state = appendDigit(state, ch);
  }
  assert.equal(state.digits, '2077');
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
  assert.deepEqual(formatCodeSlots('2077'), ['2', '0', '7', '7']);
});

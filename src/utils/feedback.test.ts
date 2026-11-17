import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedbackEntry, validateFeedbackInput } from './feedback';

test('validateFeedbackInput rejects empty and malformed fields', () => {
  const emptyResult = validateFeedbackInput({ name: ' ', email: '', message: '' });
  assert.equal(emptyResult.valid, false);
  assert.ok(emptyResult.errors.name);
  assert.ok(emptyResult.errors.email);
  assert.ok(emptyResult.errors.message);

  const badEmailResult = validateFeedbackInput({
    name: 'Алексей',
    email: 'not-an-email',
    message: 'Когда старт тестирования?',
  });
  assert.equal(badEmailResult.valid, false);
  assert.equal(badEmailResult.errors.name, undefined);
  assert.ok(badEmailResult.errors.email);
  assert.equal(badEmailResult.errors.message, undefined);
});

test('validateFeedbackInput accepts valid feedback and trims values', () => {
  const result = validateFeedbackInput({
    name: '  Артём  ',
    email: ' artem@geek-voice.ru ',
    message: '  Как перенести роли с сервера? ',
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.normalized, {
    name: 'Артём',
    email: 'artem@geek-voice.ru',
    message: 'Как перенести роли с сервера?',
  });
});

test('createFeedbackEntry formats ticket ID and timestamp', () => {
  const fixedDate = new Date('2026-11-16T12:00:00.000Z');
  const entry = createFeedbackEntry(
    {
      name: 'Мария',
      email: 'maria@example.com',
      message: 'Будет ли поддержка Linux?',
    },
    fixedDate,
    4242,
  );
  assert.equal(entry.id, 'GK-4242');
  assert.equal(entry.name, 'Мария');
  assert.equal(entry.email, 'maria@example.com');
  assert.equal(entry.message, 'Будет ли поддержка Linux?');
  assert.equal(entry.createdAt, '2026-11-16T12:00:00.000Z');
});

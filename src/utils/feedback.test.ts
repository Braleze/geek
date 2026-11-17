import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEEDBACK_ENDPOINT,
  FEEDBACK_TARGET_EMAIL,
  buildFeedbackMailtoUrl,
  createFeedbackEntry,
  submitFeedbackRequest,
  validateFeedbackInput,
} from './feedback';

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

test('validateFeedbackInput accepts valid feedback and normalizes topic', () => {
  const result = validateFeedbackInput({
    name: '  Артём  ',
    email: ' artem@geek-voice.ru ',
    message: '  Как перенести роли с сервера? ',
    topic: 'Закрытая бета',
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.normalized, {
    name: 'Артём',
    email: 'artem@geek-voice.ru',
    message: 'Как перенести роли с сервера?',
    topic: 'Закрытая бета',
  });
});

test('createFeedbackEntry formats ticket ID, topic, and timestamp', () => {
  const fixedDate = new Date('2026-11-16T12:00:00.000Z');
  const entry = createFeedbackEntry(
    {
      name: 'Мария',
      email: 'maria@example.com',
      message: 'Будет ли поддержка Linux?',
      topic: 'Идея / Фича',
    },
    fixedDate,
    4242,
  );
  assert.equal(entry.id, 'GK-4242');
  assert.equal(entry.name, 'Мария');
  assert.equal(entry.email, 'maria@example.com');
  assert.equal(entry.topic, 'Идея / Фича');
  assert.equal(entry.message, 'Будет ли поддержка Linux?');
  assert.equal(entry.createdAt, '2026-11-16T12:00:00.000Z');
});

test('buildFeedbackMailtoUrl targets admin@geek-voice.ru with encoded body and topic', () => {
  assert.equal(FEEDBACK_TARGET_EMAIL, 'admin@geek-voice.ru');
  assert.equal(FEEDBACK_ENDPOINT, './api/feedback.php');

  const url = buildFeedbackMailtoUrl({
    id: 'GK-1111',
    name: 'Иван',
    email: 'ivan@example.com',
    topic: 'Сотрудничество',
    message: 'Вопрос по бета-тесту',
  });
  assert.ok(url.startsWith('mailto:admin@geek-voice.ru?subject='));
  assert.ok(url.includes(encodeURIComponent('GK-1111')));
  assert.ok(url.includes(encodeURIComponent('Сотрудничество')));
  assert.ok(url.includes(encodeURIComponent('ivan@example.com')));
});

test('submitFeedbackRequest handles live PHP JSON success, error JSON, and non-PHP fallback', async () => {
  const sampleEntry = createFeedbackEntry(
    {
      name: 'Дмитрий',
      email: 'dmitry@example.com',
      message: 'Подскажите дату запуска',
      topic: 'Закрытая бета',
    },
    new Date('2026-11-16T12:00:00.000Z'),
    5151,
  );

  // 1. Live PHP JSON success
  const okOutcome = await submitFeedbackRequest(sampleEntry, '', async () =>
    new Response(JSON.stringify({ ok: true, id: 'GK-5151', to: 'admin@geek-voice.ru' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    }),
  );
  assert.deepEqual(okOutcome, { ok: true, delivery: 'sent' });

  // 2. Non-PHP raw file response (e.g. Vite preview returning PHP source) -> graceful fallback
  const nonPhpOutcome = await submitFeedbackRequest(sampleEntry, '', async () =>
    new Response('<?php echo "raw";', {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    }),
  );
  assert.deepEqual(nonPhpOutcome, { ok: true, delivery: 'fallback' });

  // 3. Server JSON failure -> reports errorMessage with fallback
  const errOutcome = await submitFeedbackRequest(sampleEntry, '', async () =>
    new Response(JSON.stringify({ ok: false, error: 'SMTP error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  assert.deepEqual(errOutcome, { ok: false, delivery: 'fallback', errorMessage: 'SMTP error' });
});

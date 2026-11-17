import test from 'node:test';
import assert from 'node:assert/strict';
import { PREVIEW_CHANNELS, createUserPreviewMessage } from './platformPreview';

test('PREVIEW_CHANNELS defines 3 channels with non-empty messages', () => {
  assert.equal(PREVIEW_CHANNELS.length, 3);
  for (const ch of PREVIEW_CHANNELS) {
    assert.ok(ch.name.length > 0);
    assert.ok(ch.messages.length >= 2);
  }
});

test('createUserPreviewMessage ignores blank strings and trims valid input', () => {
  assert.equal(createUserPreviewMessage('   '), null);

  const fixed = new Date('2026-11-16T21:05:00');
  const msg = createUserPreviewMessage('  Привет команде Geek!  ', fixed);
  assert.ok(msg);
  assert.equal(msg.author, 'Вы (Гость)');
  assert.equal(msg.text, 'Привет команде Geek!');
  assert.equal(msg.time, '21:05');
});

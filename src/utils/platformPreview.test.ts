import test from 'node:test';
import assert from 'node:assert/strict';
import { PREVIEW_SERVERS, createUserPreviewMessage } from './platformPreview';

test('PREVIEW_SERVERS defines 3 CYBER.NET servers with channels and members', () => {
  assert.equal(PREVIEW_SERVERS.length, 3);
  assert.equal(PREVIEW_SERVERS[0].id, 'cy-4371');
  assert.equal(PREVIEW_SERVERS[0].name, 'Ночной клуб');
  for (const srv of PREVIEW_SERVERS) {
    assert.ok(srv.textChannels.length >= 1);
    assert.ok(srv.members.length >= 1);
    assert.ok(srv.voiceChannel.length > 0);
  }
});

test('createUserPreviewMessage ignores blank strings and trims valid input', () => {
  assert.equal(createUserPreviewMessage('   '), null);

  const fixed = new Date('2026-11-16T21:05:00');
  const msg = createUserPreviewMessage('  Привет команде Geek!  ', fixed);
  assert.ok(msg);
  assert.equal(msg.author, 'Вы (Гость)');
  assert.equal(msg.initials, 'ГО');
  assert.equal(msg.text, 'Привет команде Geek!');
  assert.equal(msg.time, '21:05');
});

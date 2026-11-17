import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PREVIEW_SERVERS,
  createUserPreviewMessage,
} from './platformPreview';

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

test('user messages embed hard cipher clues for codes 1 and 2 without key 3, terminal instructions, or raw codes', () => {
  const allTexts = PREVIEW_SERVERS.flatMap((srv) =>
    srv.textChannels.flatMap((ch) => ch.messages.map((m) => m.text)),
  ).join(' ');

  // Verify embedded hard puzzle tokens exist in user messages
  const nikoMsg = PREVIEW_SERVERS[0].textChannels[0].messages.find((m) => m.author === 'Niko');
  const kiraMsg = PREVIEW_SERVERS[0].textChannels[0].messages.find((m) => m.author === 'Kira');
  assert.ok(nikoMsg);
  assert.ok(kiraMsg);

  const b64Match = nikoMsg.text.match(/([A-Za-z0-9+/]+=+)/);
  const binMatch = nikoMsg.text.match(/0b([01]+)/);
  assert.ok(b64Match && binMatch);
  const decodedYear = Number(Buffer.from(b64Match[1], 'base64').toString('utf8'));
  const offset = parseInt(binMatch[1], 2);
  assert.equal(decodedYear + offset, Number(String.fromCharCode(50, 48, 50, 55)));

  const hexMatch = kiraMsg.text.match(/0x([0-9A-Fa-f]+)/);
  assert.ok(hexMatch);
  const factorA = parseInt(hexMatch[1], 16);
  const factorB = 'C'.charCodeAt(0);
  assert.equal(factorA * factorB, Number(String.fromCharCode(50, 48, 55, 55)));

  // No raw secret codes
  const forbiddenCodes = [
    [50, 48, 49, 51],
    [50, 48, 50, 55],
    [50, 48, 55, 55],
  ].map((arr) => arr.map((c) => String.fromCharCode(c)).join(''));
  for (const code of forbiddenCodes) {
    assert.equal(allTexts.includes(code), false);
  }

  // No Key 3 mentions or terminal-opening instructions anywhere in preview messages
  assert.equal(/горшен[её]в|король и шут|ключ\s*0?3/i.test(allTexts), false);
  assert.equal(/5\s*нажатий|откроют\s*терминал|p2p\s*голос/i.test(allTexts), false);
});

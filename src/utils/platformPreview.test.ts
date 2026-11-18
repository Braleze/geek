import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PREVIEW_QUICK_QUESTIONS,
  PREVIEW_SERVERS,
  createUserPreviewMessage,
  generatePreviewPeerReply,
} from './platformPreview';

test('PREVIEW_SERVERS defines 3 CYBER.NET servers using L30nel, Sergo, and Max', () => {
  assert.equal(PREVIEW_SERVERS.length, 3);
  assert.equal(PREVIEW_SERVERS[0].id, 'cy-4371');
  assert.equal(PREVIEW_SERVERS[0].name, 'Ночной клуб');

  const allowedNicks = new Set(['L30nel', 'Sergo', 'Max']);
  for (const srv of PREVIEW_SERVERS) {
    assert.ok(srv.textChannels.length >= 1);
    assert.ok(srv.members.length >= 1);
    assert.ok(srv.voiceChannel.length > 0);
    for (const m of srv.members) {
      assert.equal(allowedNicks.has(m.nick), true, `Unexpected member nick: ${m.nick}`);
    }
    for (const ch of srv.textChannels) {
      for (const msg of ch.messages) {
        assert.ok(
          msg.author === 'СИСТЕМА GEEK' || allowedNicks.has(msg.author),
          `Unexpected author: ${msg.author}`,
        );
      }
    }
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

test('generatePreviewPeerReply answers user questions in-character from L30nel, Sergo, and Max', () => {
  assert.ok(PREVIEW_QUICK_QUESTIONS.length >= 4);
  const fixed = new Date('2026-11-18T12:15:00');

  const teamReply = generatePreviewPeerReply('Сколько разработчиков делают проект?', 'cy-4371', 'игровая-комната', fixed, 0);
  assert.ok(teamReply);
  assert.equal(teamReply.author, 'Sergo');
  assert.match(teamReply.text, /втро[её]м|L30nel, Sergo и Max/i);
  assert.equal(/двух\s+разработчик/i.test(teamReply.text), false);

  const voiceReply = generatePreviewPeerReply('Как работает P2P-голос?', 'hc-node', 'код-и-архитектура', fixed, 1);
  assert.ok(voiceReply);
  assert.equal(voiceReply.author, 'Sergo');
  assert.match(voiceReply.text, /WebRTC P2P/i);

  const preBetaReply = generatePreviewPeerReply('Как позвонить другу 1-на-1?', 'cy-4371', 'общий', fixed, 2);
  assert.ok(preBetaReply);
  assert.equal(preBetaReply.author, 'L30nel');
  assert.match(preBetaReply.text, /GK-XXXX-XXXX/);

  const customReply = generatePreviewPeerReply('Есть ли поддержка кастомных тем?', 'ma-club', 'идеи-комьюнити', fixed, 3);
  assert.ok(customReply);
  assert.equal(customReply.author, 'Max');
  assert.ok(customReply.text.length > 20);
});

test('user messages embed hard cipher clues for codes 1 and 2 without key 3, terminal instructions, or raw codes', () => {
  const allTexts = PREVIEW_SERVERS.flatMap((srv) =>
    srv.textChannels.flatMap((ch) => ch.messages.map((m) => m.text)),
  ).join(' ');

  const l30nelMsg = PREVIEW_SERVERS[0].textChannels[0].messages.find((m) => m.author === 'L30nel');
  const sergoMsg = PREVIEW_SERVERS[0].textChannels[0].messages.find((m) => m.author === 'Sergo');
  assert.ok(l30nelMsg);
  assert.ok(sergoMsg);

  const b64Match = l30nelMsg.text.match(/([A-Za-z0-9+/]+=+)/);
  const binMatch = l30nelMsg.text.match(/0b([01]+)/);
  assert.ok(b64Match && binMatch);
  const decodedYear = Number(Buffer.from(b64Match[1], 'base64').toString('utf8'));
  const offset = parseInt(binMatch[1], 2);
  assert.equal(decodedYear + offset, Number(String.fromCharCode(50, 48, 50, 55)));

  const hexMatch = sergoMsg.text.match(/0x([0-9A-Fa-f]+)/);
  assert.ok(hexMatch);
  const factorA = parseInt(hexMatch[1], 16);
  const factorB = 'C'.charCodeAt(0);
  assert.equal(factorA * factorB, Number(String.fromCharCode(50, 48, 55, 55)));

  const forbiddenCodes = [
    [50, 48, 49, 51],
    [50, 48, 50, 55],
    [50, 48, 55, 55],
    [48, 54, 48, 50],
  ].map((arr) => arr.map((c) => String.fromCharCode(c)).join(''));
  for (const code of forbiddenCodes) {
    assert.equal(allTexts.includes(code), false);
  }

  assert.equal(/горшен[её]в|король и шут|ключ\s*0?3/i.test(allTexts), false);
  assert.equal(/5\s*нажатий|откроют\s*терминал|p2p\s*голос/i.test(allTexts), false);
});

import { getVoicePeersForServer, toggleVoiceForViewedServer } from './platformPreview';

test('preview starts outside any voice channel and keeps guest only in the joined server when browsing others', () => {
  const nightclub = PREVIEW_SERVERS[0];
  const cyberNode = PREVIEW_SERVERS[1];
  const workshop = PREVIEW_SERVERS[2];

  // Initial state: voiceServerId = null -> guest is NOT in any voice channel
  let voiceServerId: 'cy-4371' | 'hc-node' | 'ma-club' | null = null;
  for (const srv of PREVIEW_SERVERS) {
    const peers = getVoicePeersForServer(srv, voiceServerId);
    assert.equal(
      peers.some((p) => p.isGuest || p.nick === 'Вы (Гость)'),
      false,
      `Guest should not be in ${srv.name} on initial load`,
    );
  }

  // Join voice on Ночной клуб ('cy-4371')
  voiceServerId = toggleVoiceForViewedServer(voiceServerId, nightclub.id);
  assert.equal(voiceServerId, 'cy-4371');
  assert.equal(
    getVoicePeersForServer(nightclub, voiceServerId).some((p) => p.nick === 'Вы (Гость)'),
    true,
  );

  // Switch preview view to Кибер Узел ('hc-node') and Мастерская ('ma-club') -> guest stays in 'cy-4371', NOT shown in others
  assert.equal(
    getVoicePeersForServer(cyberNode, voiceServerId).some((p) => p.nick === 'Вы (Гость)'),
    false,
  );
  assert.equal(
    getVoicePeersForServer(workshop, voiceServerId).some((p) => p.nick === 'Вы (Гость)'),
    false,
  );
  // Returning back to Ночной клуб still shows guest in 'Ночной эфир'
  assert.equal(
    getVoicePeersForServer(nightclub, voiceServerId).some((p) => p.nick === 'Вы (Гость)'),
    true,
  );

  // Clicking Кибер Узел voice channel moves guest from cy-4371 -> hc-node
  voiceServerId = toggleVoiceForViewedServer(voiceServerId, cyberNode.id);
  assert.equal(voiceServerId, 'hc-node');
  assert.equal(
    getVoicePeersForServer(nightclub, voiceServerId).some((p) => p.nick === 'Вы (Гость)'),
    false,
  );
  assert.equal(
    getVoicePeersForServer(cyberNode, voiceServerId).some((p) => p.nick === 'Вы (Гость)'),
    true,
  );
});


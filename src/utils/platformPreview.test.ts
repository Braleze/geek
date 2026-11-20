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

  const launchReply = generatePreviewPeerReply('Где откроется приложение?', 'cy-4371', 'общий', fixed, 2);
  assert.ok(launchReply);
  assert.equal(launchReply.author, 'L30nel');
  assert.match(launchReply.text, /1 декабря 2026/);
  assert.match(launchReply.text, /app\.geek-voice\.ru/);
  assert.equal(/pre-?beta|GK-XXXX-XXXX/i.test(launchReply.text), false);

  const releaseReply = generatePreviewPeerReply('Когда официальный релиз Geek?', 'cy-4371', 'общий', fixed, 3);
  assert.ok(releaseReply);
  assert.match(releaseReply.text, /1 декабря 2026/);
  assert.match(releaseReply.text, /app\.geek-voice\.ru/);
  assert.equal(/pre-?beta/i.test(releaseReply.text), false);

  const customReply = generatePreviewPeerReply('Есть ли поддержка кастомных тем?', 'ma-club', 'идеи-комьюнити', fixed, 4);
  assert.ok(customReply);
  assert.equal(customReply.author, 'Max');
  assert.ok(customReply.text.length > 20);
  assert.equal(/pre-?beta/i.test(customReply.text), false);
});

test('preview messages contain no removed keypad Easter egg clues or secret codes', () => {
  const allTexts = PREVIEW_SERVERS.flatMap((srv) =>
    srv.textChannels.flatMap((ch) => ch.messages.map((m) => m.text)),
  ).join(' ');

  assert.equal(/MTk4Nw==|0b101000|0x1F|заглавную литеру C/i.test(allTexts), false);
  assert.equal(/горшен[её]в|король и шут|ключ\s*0?3|5\s*нажатий|откроют\s*терминал/i.test(allTexts), false);
});

import {
  getVoicePeersForServer,
  resolvePreviewShortcutAction,
  shouldPlayL30nelVoiceAudio,
  toggleVoiceForViewedServer,
} from './platformPreview';

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

test('L30nel plays MP3 audio only when user is connected to Ночной эфир', () => {
  assert.equal(shouldPlayL30nelVoiceAudio({ voiceServerId: null }), false);
  assert.equal(shouldPlayL30nelVoiceAudio({ voiceServerId: 'cy-4371' }), true);
  assert.equal(shouldPlayL30nelVoiceAudio({ voiceServerId: 'hc-node' }), false);
  assert.equal(shouldPlayL30nelVoiceAudio({ voiceServerId: 'ma-club' }), false);
});

test('resolvePreviewShortcutAction handles Escape and Alt binds across EN/RU layouts', () => {
  assert.equal(resolvePreviewShortcutAction({ key: 'Escape', isFullscreen: true }), 'exitFullscreen');
  assert.equal(resolvePreviewShortcutAction({ key: 'Escape', isFullscreen: false }), null);

  assert.equal(resolvePreviewShortcutAction({ key: 'm', code: 'KeyM', altKey: true, isFullscreen: false }), 'mic');
  assert.equal(resolvePreviewShortcutAction({ key: 'в', code: 'KeyD', altKey: true, isFullscreen: true }), 'deafen');
  assert.equal(resolvePreviewShortcutAction({ key: 'с', code: 'KeyC', altKey: true, isFullscreen: true }), 'cam');
  assert.equal(resolvePreviewShortcutAction({ key: 'f', code: 'KeyF', altKey: true, isFullscreen: false }), 'fullscreen');

  // Ignore Alt binds while typing in an input, or without Alt
  assert.equal(
    resolvePreviewShortcutAction({ key: 'm', code: 'KeyM', altKey: true, isFullscreen: true, isEditableTarget: true }),
    null,
  );
  assert.equal(resolvePreviewShortcutAction({ key: 'm', code: 'KeyM', altKey: false, isFullscreen: true }), null);
});

import {
  buildLocalVoiceUnlockMessage,
  matchesLocalVoiceUnlockCode,
  normalizeLocalVoiceCandidate,
} from './platformPreview';

test('matchesLocalVoiceUnlockCode accepts exact, pasted, quoted, uppercase, and command formats via salted hash', () => {
  const validCode = ['gk', 'voice', '7714', 'test'].join('-');
  assert.equal(matchesLocalVoiceUnlockCode(validCode), true);
  assert.equal(matchesLocalVoiceUnlockCode(`\`${validCode.toUpperCase()}\``), true);
  assert.equal(matchesLocalVoiceUnlockCode(`  «"${validCode}\u200B"»  `), true);
  assert.equal(matchesLocalVoiceUnlockCode(`/voice ${validCode}`), true);
  assert.equal(matchesLocalVoiceUnlockCode(`/voicetest "${validCode}"`), true);
  assert.equal(matchesLocalVoiceUnlockCode(['gk', 'voice', '7714', 'test'].join('—')), true);
  assert.equal(normalizeLocalVoiceCandidate(`/voice \`${validCode.toUpperCase()}\``), validCode);

  assert.equal(matchesLocalVoiceUnlockCode(''), false);
  assert.equal(matchesLocalVoiceUnlockCode('gk-voice-0000-test'), false);
  assert.equal(matchesLocalVoiceUnlockCode('привет всем'), false);

  const sysMsg = buildLocalVoiceUnlockMessage(new Date('2026-11-18T22:30:00'));
  assert.equal(sysMsg.author, 'СИСТЕМА GEEK');
  assert.match(sysMsg.text, /Live Голос \(Тест\)/);
});

import { getInitialPreviewPanels, togglePreviewPanel } from './platformPreview';

test('preview sidebars default to collapsed on mobile and expanded on desktop', () => {
  assert.deepEqual(getInitialPreviewPanels(390), {
    showChannels: false,
    showMembers: false,
  });
  assert.deepEqual(getInitialPreviewPanels(768), {
    showChannels: false,
    showMembers: false,
  });
  assert.deepEqual(getInitialPreviewPanels(1024), {
    showChannels: true,
    showMembers: true,
  });
  assert.deepEqual(getInitialPreviewPanels(1440), {
    showChannels: true,
    showMembers: true,
  });
});

test('togglePreviewPanel keeps mobile drawers mutually exclusive and desktop panels independent', () => {
  // Mobile (compact viewport): opening channels keeps members closed; opening members closes channels
  let mobile = getInitialPreviewPanels(390);
  mobile = togglePreviewPanel(mobile, 'channels', true);
  assert.deepEqual(mobile, { showChannels: true, showMembers: false });

  mobile = togglePreviewPanel(mobile, 'members', true);
  assert.deepEqual(mobile, { showChannels: false, showMembers: true });

  mobile = togglePreviewPanel(mobile, 'members', true);
  assert.deepEqual(mobile, { showChannels: false, showMembers: false });

  // Desktop: channels and members collapse/expand independently
  let desktop = getInitialPreviewPanels(1440);
  desktop = togglePreviewPanel(desktop, 'channels', false);
  assert.deepEqual(desktop, { showChannels: false, showMembers: true });

  desktop = togglePreviewPanel(desktop, 'members', false);
  assert.deepEqual(desktop, { showChannels: false, showMembers: false });

  desktop = togglePreviewPanel(desktop, 'channels', false);
  assert.deepEqual(desktop, { showChannels: true, showMembers: false });
});

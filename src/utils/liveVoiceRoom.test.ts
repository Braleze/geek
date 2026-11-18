import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_VOICE_MAX_PARTICIPANTS,
  buildLiveVoiceSnapshot,
  joinLiveVoiceRoom,
  leaveLiveVoiceRoom,
  pruneStaleLiveVoicePeers,
  shouldInitiateRtcMesh,
  computeLiveVoiceInitials,
  updateLiveVoicePeer,
  type LiveVoicePeer,
} from './liveVoiceRoom';

test('liveVoiceRoom supports multi-user join, state updates, leave, and capacity limit', () => {
  const peers = new Map<string, LiveVoicePeer>();
  const t0 = 1_700_000_000_000;

  const p1 = joinLiveVoiceRoom(peers, { peerId: 'peer-a', nick: 'L30nel', hasAudio: true }, t0);
  assert.equal(p1.ok, true);
  const p2 = joinLiveVoiceRoom(peers, { peerId: 'peer-b', nick: 'Sergo', hasAudio: true }, t0 + 10);
  assert.equal(p2.ok, true);
  assert.equal(buildLiveVoiceSnapshot(peers).length, 2);

  const updated = updateLiveVoicePeer(peers, 'peer-a', { speaking: true, camActive: true }, t0 + 20);
  assert.ok(updated);
  assert.equal(updated[0].speaking, true);
  assert.equal(updated[0].camActive, true);

  // Muting hides speaking status cleanly
  const muted = updateLiveVoicePeer(peers, 'peer-a', { micMuted: true }, t0 + 30);
  assert.ok(muted);
  assert.equal(muted[0].speaking, false);

  const left = leaveLiveVoiceRoom(peers, 'peer-a');
  assert.equal(left.removedPeer?.nick, 'L30nel');
  assert.equal(left.snapshot.length, 1);
  assert.equal(left.snapshot[0].peerId, 'peer-b');

  // Fill to capacity
  for (let i = 2; i <= LIVE_VOICE_MAX_PARTICIPANTS; i += 1) {
    const res = joinLiveVoiceRoom(peers, { peerId: `peer-${i}`, nick: `Tester ${i}` }, t0 + i * 10);
    assert.equal(res.ok, true);
  }
  const over = joinLiveVoiceRoom(peers, { peerId: 'peer-overflow', nick: 'Extra' }, t0 + 999);
  assert.equal(over.ok, false);
});

test('pruneStaleLiveVoicePeers removes stale HTTP peers and leaves WS peers intact', () => {
  const peers = new Map<string, LiveVoicePeer>();
  const t0 = 1_700_000_000_000;
  joinLiveVoiceRoom(peers, { peerId: 'ws-peer', nick: 'WS', transport: 'ws' }, t0);
  joinLiveVoiceRoom(peers, { peerId: 'http-peer', nick: 'HTTP', transport: 'http' }, t0);

  const removed = pruneStaleLiveVoicePeers(peers, t0 + 15_000, 12_000);
  assert.deepEqual(removed, ['http-peer']);
  assert.equal(peers.has('ws-peer'), true);
});

test('shouldInitiateRtcMesh picks strictly one deterministic initiator per pair', () => {
  assert.equal(shouldInitiateRtcMesh('peer-a', 'peer-b'), true);
  assert.equal(shouldInitiateRtcMesh('peer-b', 'peer-a'), false);
  assert.equal(shouldInitiateRtcMesh('peer-a', 'peer-a'), false);
});

test('computeLiveVoiceInitials ignores parentheses and punctuation across words', () => {
  assert.equal(computeLiveVoiceInitials('Вы (Гость)'), 'ВГ');
  assert.equal(computeLiveVoiceInitials('L30nel'), 'L3');
  assert.equal(computeLiveVoiceInitials('---'), 'ГК');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_VOICE_MAX_PARTICIPANTS,
  buildLiveVoiceSnapshot,
  filterActiveRemoteVideos,
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

test('updateLiveVoicePeer updates nick and recomputes initials cleanly', () => {
  const peers = new Map<string, LiveVoicePeer>();
  const t0 = 1_700_000_000_000;
  joinLiveVoiceRoom(peers, { peerId: 'peer-a', nick: 'Вы (Гость)' }, t0);

  const renamed = updateLiveVoicePeer(peers, 'peer-a', { nick: '  Кибер   Волк  ' }, t0 + 50);
  assert.ok(renamed);
  assert.equal(renamed[0].nick, 'Кибер Волк');
  assert.equal(renamed[0].initials, 'КВ');

  const truncated = updateLiveVoicePeer(
    peers,
    'peer-a',
    { nick: 'ОченьДлинноеИмяКотороеНужноОбрезать' },
    t0 + 100,
  );
  assert.ok(truncated);
  assert.equal(truncated[0].nick.length, 22);
});

test('filterActiveRemoteVideos hides remote streams as soon as camera and screen are off or peer leaves', () => {
  const peers = new Map<string, LiveVoicePeer>();
  const t0 = 1_700_000_000_000;
  joinLiveVoiceRoom(peers, { peerId: 'peer-a', nick: 'Alpha', screenActive: true }, t0);
  joinLiveVoiceRoom(peers, { peerId: 'peer-b', nick: 'Beta', camActive: true }, t0 + 10);

  const cachedStreams = [
    { peerId: 'peer-a', tag: 'stream-a' },
    { peerId: 'peer-b', tag: 'stream-b' },
    { peerId: 'peer-gone', tag: 'stream-gone' },
  ];

  const initialVisible = filterActiveRemoteVideos(cachedStreams, buildLiveVoiceSnapshot(peers));
  assert.deepEqual(
    initialVisible.map((v) => v.peerId),
    ['peer-a', 'peer-b'],
  );

  // Turning off screen share on peer-a immediately drops peer-a video tile (no frozen last frame)
  const afterScreenStop = updateLiveVoicePeer(peers, 'peer-a', { screenActive: false }, t0 + 20)!;
  const visibleAfterStop = filterActiveRemoteVideos(cachedStreams, afterScreenStop);
  assert.deepEqual(
    visibleAfterStop.map((v) => v.peerId),
    ['peer-b'],
  );

  // Turning off camera on peer-b leaves zero video tiles
  const afterCamStop = updateLiveVoicePeer(peers, 'peer-b', { camActive: false }, t0 + 30)!;
  assert.deepEqual(filterActiveRemoteVideos(cachedStreams, afterCamStop), []);

  // Re-enabling camera on peer-a immediately restores its video tile without requiring a fresh track
  const afterCamRestart = updateLiveVoicePeer(peers, 'peer-a', { camActive: true }, t0 + 40)!;
  assert.deepEqual(
    filterActiveRemoteVideos(cachedStreams, afterCamRestart).map((v) => v.peerId),
    ['peer-a'],
  );
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ICE_SERVERS,
  computeAdaptivePollMs,
  mergeIceServers,
} from './hostBudget';

test('mergeIceServers returns defaults when extra is missing or invalid', () => {
  const fromUndefined = mergeIceServers(undefined);
  assert.equal(fromUndefined.length, DEFAULT_ICE_SERVERS.length);
  assert.equal(fromUndefined[0].urls, 'stun:stun.l.google.com:19302');

  const fromGarbage = mergeIceServers([
    null,
    42,
    { urls: 'https://evil.example.com' },
    { urls: '' },
    { urls: ['javascript:alert(1)'] },
  ]);
  assert.equal(fromGarbage.length, DEFAULT_ICE_SERVERS.length);
});

test('mergeIceServers prioritizes valid TURN servers and preserves credentials', () => {
  const merged = mergeIceServers([
    {
      urls: ['turn:turn.example.com:3478?transport=udp', 'turns:turn.example.com:5349'],
      username: 'geek-user',
      credential: 'secret-pass',
    },
    { urls: 'stun:stun.l.google.com:19302' },
  ]);

  assert.equal(merged.length, DEFAULT_ICE_SERVERS.length + 1);
  assert.deepEqual(merged[0], {
    urls: ['turn:turn.example.com:3478?transport=udp', 'turns:turn.example.com:5349'],
    username: 'geek-user',
    credential: 'secret-pass',
  });
  // Duplicate Google STUN should only appear once
  const googleCount = merged.filter((s) => s.urls === 'stun:stun.l.google.com:19302').length;
  assert.equal(googleCount, 1);
});

test('computeAdaptivePollMs keeps PCM relay fast and throttles when tab is hidden', () => {
  assert.equal(
    computeAdaptivePollMs({
      peerCount: 2,
      audioMode: 'relay',
      negotiating: false,
      hidden: false,
      hasRecentActivity: false,
    }),
    300,
  );
  assert.equal(
    computeAdaptivePollMs({
      peerCount: 2,
      audioMode: 'relay',
      negotiating: false,
      hidden: true,
      hasRecentActivity: true,
    }),
    1200,
  );
});

test('computeAdaptivePollMs prioritizes WebRTC negotiation and recent chat activity', () => {
  assert.equal(
    computeAdaptivePollMs({
      peerCount: 2,
      audioMode: 'waiting',
      negotiating: true,
      hidden: false,
      hasRecentActivity: false,
    }),
    550,
  );
  assert.equal(
    computeAdaptivePollMs({
      peerCount: 2,
      audioMode: 'waiting',
      negotiating: true,
      hidden: true,
      hasRecentActivity: false,
    }),
    1600,
  );
  assert.equal(
    computeAdaptivePollMs({
      peerCount: 2,
      audioMode: 'webrtc',
      negotiating: false,
      hidden: false,
      hasRecentActivity: true,
    }),
    900,
  );
  assert.equal(
    computeAdaptivePollMs({
      peerCount: 2,
      audioMode: 'webrtc',
      negotiating: false,
      hidden: true,
      hasRecentActivity: true,
    }),
    2500,
  );
});

test('computeAdaptivePollMs saves Host-0 CP when WebRTC P2P is stable or user is alone', () => {
  assert.equal(
    computeAdaptivePollMs({
      peerCount: 2,
      audioMode: 'webrtc',
      negotiating: false,
      hidden: false,
      hasRecentActivity: false,
    }),
    2400,
  );
  assert.equal(
    computeAdaptivePollMs({
      peerCount: 2,
      audioMode: 'webrtc',
      negotiating: false,
      hidden: true,
      hasRecentActivity: false,
    }),
    4800,
  );
  assert.equal(
    computeAdaptivePollMs({
      peerCount: 1,
      audioMode: 'waiting',
      negotiating: false,
      hidden: false,
      hasRecentActivity: false,
    }),
    1800,
  );
  assert.equal(
    computeAdaptivePollMs({
      peerCount: 1,
      audioMode: 'idle',
      negotiating: false,
      hidden: true,
      hasRecentActivity: false,
    }),
    4500,
  );
});

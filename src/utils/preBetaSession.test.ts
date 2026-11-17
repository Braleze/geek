import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRE_BETA_DURATION_MS,
  PRE_BETA_MAX_PARTICIPANTS,
  appendPreBetaMessage,
  createEmptyPreBetaStore,
  expireElapsedRooms,
  formatCountdownMs,
  getClientQuotaStatus,
  hydratePreBetaStore,
  issueOneTimePreBetaCode,
  joinPreBetaRoom,
  leavePreBetaRoom,
  normalizePreBetaCode,
  serializePreBetaStore,
} from './preBetaSession';

test('normalizes pre-beta codes across spacing, lowercase, and missing prefix', () => {
  assert.equal(normalizePreBetaCode('gk-ab23-cd45'), 'GK-AB23-CD45');
  assert.equal(normalizePreBetaCode(' ab23 cd45 '), 'GK-AB23-CD45');
  assert.equal(normalizePreBetaCode('bad'), '');
});

test('formats 30-minute countdown cleanly', () => {
  assert.equal(formatCountdownMs(PRE_BETA_DURATION_MS), '30:00');
  assert.equal(formatCountdownMs(61_000), '01:01');
  assert.equal(formatCountdownMs(0), '00:00');
});

test('issues unique code strictly once per clientId and persists remaining 30-minute quota', () => {
  const store = createEmptyPreBetaStore();
  const t0 = 1_700_000_000_000;

  const first = issueOneTimePreBetaCode(store, 'client-alpha-01', t0, () => 0.25);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.alreadyIssued, false);
  assert.match(first.code, /^GK-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(first.remainingMs, PRE_BETA_DURATION_MS);

  // Requesting again 5 minutes later returns the exact same code and decremented time
  const second = issueOneTimePreBetaCode(store, 'client-alpha-01', t0 + 5 * 60_000);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.alreadyIssued, true);
  assert.equal(second.code, first.code);
  assert.equal(second.remainingMs, PRE_BETA_DURATION_MS - 5 * 60_000);

  // Requesting after 30 minutes fails permanently for this device
  const afterExpiry = issueOneTimePreBetaCode(store, 'client-alpha-01', t0 + PRE_BETA_DURATION_MS + 1);
  assert.equal(afterExpiry.ok, false);
  if (!afterExpiry.ok) {
    assert.equal(afterExpiry.reason, 'QUOTA_EXHAUSTED');
  }
  assert.equal(getClientQuotaStatus(store, 'client-alpha-01', t0 + PRE_BETA_DURATION_MS + 1).status, 'EXHAUSTED');
});

test('enforces maximum 2 participants per dialogue and rejects a 3rd participant', () => {
  const store = createEmptyPreBetaStore();
  const t0 = 1_700_000_000_000;
  const issued = issueOneTimePreBetaCode(store, 'host-device-01', t0);
  assert.equal(issued.ok, true);
  if (!issued.ok) return;

  const joinHost = joinPreBetaRoom(
    store,
    { code: issued.code, peerId: 'peer-1', clientId: 'host-device-01', nick: 'Host' },
    t0 + 1000,
  );
  assert.equal(joinHost.ok, true);
  if (joinHost.ok) {
    assert.equal(joinHost.snapshot.participants.length, 1);
    assert.equal(joinHost.snapshot.maxParticipants, PRE_BETA_MAX_PARTICIPANTS);
  }

  const joinFriend = joinPreBetaRoom(
    store,
    { code: issued.code, peerId: 'peer-2', clientId: 'friend-device-02', nick: 'Friend' },
    t0 + 2000,
  );
  assert.equal(joinFriend.ok, true);
  if (joinFriend.ok) {
    assert.equal(joinFriend.snapshot.participants.length, 2);
  }

  // 3rd user must be rejected
  const joinThird = joinPreBetaRoom(
    store,
    { code: issued.code, peerId: 'peer-3', clientId: 'intruder-device-03', nick: 'Third' },
    t0 + 3000,
  );
  assert.equal(joinThird.ok, false);
  if (!joinThird.ok) {
    assert.equal(joinThird.reason, 'ROOM_FULL');
  }

  // Friend leaving frees slot to 1/2
  const left = leavePreBetaRoom(store, issued.code, 'peer-2', t0 + 4000);
  assert.equal(left.removedPeer?.peerId, 'peer-2');
  assert.equal(left.snapshot?.participants.length, 1);
});

test('blocks chat and evicts peers when 30-minute limit expires', () => {
  const store = createEmptyPreBetaStore();
  const t0 = 1_700_000_000_000;
  const issued = issueOneTimePreBetaCode(store, 'host-device-99', t0);
  assert.equal(issued.ok, true);
  if (!issued.ok) return;

  joinPreBetaRoom(store, { code: issued.code, peerId: 'p1', clientId: 'host-device-99' }, t0 + 100);
  const okMsg = appendPreBetaMessage(store, { code: issued.code, peerId: 'p1', rawText: 'Привет!' }, t0 + 500);
  assert.equal(okMsg.ok, true);

  const expiredAt = t0 + PRE_BETA_DURATION_MS + 10;
  const lateMsg = appendPreBetaMessage(
    store,
    { code: issued.code, peerId: 'p1', rawText: 'После лимита' },
    expiredAt,
  );
  assert.equal(lateMsg.ok, false);
  if (!lateMsg.ok) {
    assert.equal(lateMsg.reason, 'ROOM_EXPIRED');
  }

  // Re-join after expiry also rejected
  const lateJoin = joinPreBetaRoom(
    store,
    { code: issued.code, peerId: 'p2', clientId: 'friend-device-88' },
    expiredAt,
  );
  assert.equal(lateJoin.ok, false);
  if (!lateJoin.ok) {
    assert.equal(lateJoin.reason, 'ROOM_EXPIRED');
  }
});

test('expireElapsedRooms detects active rooms whose timer just hit zero', () => {
  const store = createEmptyPreBetaStore();
  const t0 = 1_700_000_000_000;
  const issued = issueOneTimePreBetaCode(store, 'host-device-55', t0);
  assert.equal(issued.ok, true);
  if (!issued.ok) return;

  joinPreBetaRoom(store, { code: issued.code, peerId: 'p1', clientId: 'host-device-55' }, t0 + 100);
  joinPreBetaRoom(store, { code: issued.code, peerId: 'p2', clientId: 'guest-device-66' }, t0 + 200);

  assert.equal(expireElapsedRooms(store, t0 + PRE_BETA_DURATION_MS - 1000).length, 0);
  const expired = expireElapsedRooms(store, t0 + PRE_BETA_DURATION_MS + 1);
  assert.equal(expired.length, 1);
  assert.deepEqual(expired[0].kickedPeerIds, ['p1', 'p2']);
});

test('serializes and hydrates store state cleanly without preserving stale sockets', () => {
  const store = createEmptyPreBetaStore();
  const t0 = 1_700_000_000_000;
  const issued = issueOneTimePreBetaCode(store, 'host-persist-01', t0);
  assert.equal(issued.ok, true);
  if (!issued.ok) return;

  joinPreBetaRoom(store, { code: issued.code, peerId: 'p1', clientId: 'host-persist-01' }, t0 + 100);
  const json = serializePreBetaStore(store);
  const restored = hydratePreBetaStore(json);

  assert.equal(restored.quotasByClientId['host-persist-01'].issuedCode, issued.code);
  assert.equal(restored.rooms[issued.code].participants.length, 0);
  assert.equal(getClientQuotaStatus(restored, 'host-persist-01', t0 + 10_000).status, 'ACTIVE');
});

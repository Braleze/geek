import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RELAY_LEAD_IN_S,
  computePcmPlaybackSlot,
  createResamplerState,
  decodeBase64ToFloat32,
  encodeInt16ToBase64,
  isWebRtcAudioLive,
  resampleFloat32ToInt16,
} from './preBetaAudio.ts';

test('resampleFloat32ToInt16 preserves exact sample rate ratio across frames without drift', () => {
  const state = createResamplerState();
  let totalOut = 0;
  for (let frame = 0; frame < 3; frame += 1) {
    const input = new Float32Array(2048);
    for (let i = 0; i < input.length; i += 1) {
      input[i] = 0.25 * Math.sin(((frame * 2048 + i) * 2 * Math.PI * 440) / 48000);
    }
    const { pcm, peak } = resampleFloat32ToInt16(input, 48000, 16000, state);
    assert.ok(peak > 0.2 && peak <= 0.26);
    totalOut += pcm.length;

    const roundtrip = decodeBase64ToFloat32(encodeInt16ToBase64(pcm));
    assert.ok(roundtrip);
    assert.equal(roundtrip.length, pcm.length);
  }
  // 3 * 2048 / 3 = 2048 samples exact at 16kHz
  assert.equal(totalOut, 2048);
});

test('computePcmPlaybackSlot never overlaps already-scheduled audio frames', () => {
  const now = 10.0;
  let nextPlay = 0;
  const slots: Array<{ start: number; end: number }> = [];

  // Feed 15 chunks of 45ms rapidly at the same timestamp (simulating a heavy burst / HTTP batch)
  for (let i = 0; i < 15; i += 1) {
    const decision = computePcmPlaybackSlot(now, nextPlay, 0.045);
    nextPlay = decision.nextPlayTime;
    if (decision.action === 'schedule') {
      slots.push({ start: decision.startAt, end: decision.nextPlayTime });
    } else if (decision.action === 'reset-and-schedule') {
      slots.length = 0;
      slots.push({ start: decision.startAt, end: decision.nextPlayTime });
    }
  }

  assert.ok(slots.length >= 8);
  assert.equal(slots[0].start, now + RELAY_LEAD_IN_S);
  for (let i = 1; i < slots.length; i += 1) {
    assert.ok(
      slots[i].start >= slots[i - 1].end - 1e-9,
      `Frame ${i} overlapped previous frame (${slots[i].start} < ${slots[i - 1].end})`,
    );
  }

  // Huge stall > 0.7s ahead triggers explicit reset-and-schedule so caller stops stale sources first
  const resetDecision = computePcmPlaybackSlot(10.0, 10.85, 0.045);
  assert.equal(resetDecision.action, 'reset-and-schedule');
  assert.equal(resetDecision.startAt, 10.0 + RELAY_LEAD_IN_S);
});

test('isWebRtcAudioLive checks connectionState or iceConnectionState when track is received', () => {
  assert.equal(isWebRtcAudioLive(null, true), false);
  assert.equal(
    isWebRtcAudioLive({ connectionState: 'connected', iceConnectionState: 'connected' }, false),
    false,
  );
  assert.equal(
    isWebRtcAudioLive({ connectionState: 'connecting', iceConnectionState: 'connected' }, true),
    true,
  );
  assert.equal(
    isWebRtcAudioLive({ connectionState: 'connected', iceConnectionState: 'checking' }, true),
    true,
  );
  assert.equal(
    isWebRtcAudioLive({ connectionState: 'connecting', iceConnectionState: 'checking' }, true),
    false,
  );
});

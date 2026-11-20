import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACK_BASENAMES,
  TRACK_FILENAMES,
  TrackAudioPlayer,
  getTrackCandidateUrls,
  type AudioElementLike,
} from './audioTracks';

test('TRACK_FILENAMES only defines active preview audio track', () => {
  assert.deepEqual(TRACK_BASENAMES, {
    l30nel: 'l30nel',
  });
  assert.deepEqual(TRACK_FILENAMES, {
    l30nel: 'l30nel.mp3',
  });
});

test('getTrackCandidateUrls orders ./audio and ./public/audio candidates cleanly', () => {
  const l30nelUrls = getTrackCandidateUrls('l30nel');
  assert.equal(l30nelUrls[0], './audio/l30nel.mp3');
  assert.equal(l30nelUrls[1], './public/audio/l30nel.mp3');
  assert.ok(l30nelUrls.includes('./audio/l30nel.ogg'));
  assert.ok(l30nelUrls.includes('./audio/l30nel.wav'));
  assert.ok(l30nelUrls.includes('./audio/l30nel.m4a'));
});

test('TrackAudioPlayer cycles candidates on error, handles mute/unmute, and stops cleanly', () => {
  const fakeState = {
    playCount: 0,
    pauseCount: 0,
  };

  const fakeAudio: AudioElementLike = {
    src: '',
    loop: false,
    muted: false,
    volume: 1,
    preload: '',
    paused: true,
    currentTime: 0,
    onerror: null,
    play() {
      fakeState.playCount += 1;
      fakeAudio.paused = false;
      return Promise.resolve();
    },
    pause() {
      fakeState.pauseCount += 1;
      fakeAudio.paused = true;
    },
  };

  const player = new TrackAudioPlayer('l30nel', () => fakeAudio);
  player.start();

  assert.equal(fakeAudio.loop, true);
  assert.equal(fakeAudio.volume, 0.85);
  assert.equal(player.getCurrentUrl(), './audio/l30nel.mp3');
  assert.equal(fakeState.playCount, 1);

  fakeAudio.onerror?.('error');
  assert.equal(player.getCurrentUrl(), './public/audio/l30nel.mp3');
  assert.equal(fakeState.playCount, 2);

  player.setMuted(true);
  assert.equal(fakeAudio.muted, true);
  assert.equal(player.isMuted(), true);
  fakeAudio.paused = true;
  player.setMuted(false);
  assert.equal(fakeAudio.muted, false);
  assert.equal(fakeState.playCount, 3);

  player.stop();
  assert.equal(fakeState.pauseCount, 1);
  assert.equal(fakeAudio.src, '');
  assert.equal(fakeAudio.onerror, null);
});

test('TrackAudioPlayer stops gracefully when all candidate files are missing', () => {
  const fakeAudio: AudioElementLike = {
    src: '',
    loop: false,
    muted: false,
    volume: 1,
    preload: '',
    paused: true,
    currentTime: 0,
    onerror: null,
    play() {
      return Promise.reject(new Error('404'));
    },
    pause() {
      fakeAudio.paused = true;
    },
  };

  const totalCandidates = getTrackCandidateUrls('l30nel').length;
  const player = new TrackAudioPlayer('l30nel', () => fakeAudio);
  player.start();

  for (let i = 0; i < totalCandidates; i++) {
    fakeAudio.onerror?.('error');
  }

  assert.equal(player.getCurrentUrl(), null);
  assert.equal(fakeAudio.onerror, null);
});

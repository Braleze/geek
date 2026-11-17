import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACK_BASENAMES,
  TRACK_FILENAMES,
  TrackAudioPlayer,
  getTrackCandidateUrls,
  type AudioElementLike,
} from './audioTracks';

const FORBIDDEN_DIGITS = ['20' + '13', '20' + '27', '20' + '77', '06' + '02'];

test('TRACK_FILENAMES use expected clean names without exposing secret codes', () => {
  assert.deepEqual(TRACK_FILENAMES, {
    rickroll: 'rickroll.mp3',
    cyberpunk: 'cyberpunk.mp3',
    tribute: 'gorshenev.mp3',
    love: 'love.mp3',
  });

  const combined = [
    ...Object.values(TRACK_BASENAMES),
    ...Object.values(TRACK_FILENAMES),
  ].join(' ');

  for (const digits of FORBIDDEN_DIGITS) {
    assert.equal(combined.includes(digits), false, `Filename must not expose ${digits}`);
  }
});

test('getTrackCandidateUrls orders ./audio and ./public/audio candidates cleanly', () => {
  const tributeUrls = getTrackCandidateUrls('tribute');
  assert.equal(tributeUrls[0], './audio/gorshenev.mp3');
  assert.equal(tributeUrls[1], './public/audio/gorshenev.mp3');
  assert.ok(tributeUrls.includes('./audio/gorshenev.ogg'));
  assert.ok(tributeUrls.includes('./audio/gorshenev.wav'));
  assert.ok(tributeUrls.includes('./audio/gorshenev.m4a'));

  const loveUrls = getTrackCandidateUrls('love');
  assert.equal(loveUrls[0], './audio/love.mp3');
  assert.equal(loveUrls[1], './public/audio/love.mp3');
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

  const player = new TrackAudioPlayer('cyberpunk', () => fakeAudio);
  player.start();

  assert.equal(fakeAudio.loop, true);
  assert.equal(fakeAudio.volume, 0.85);
  assert.equal(player.getCurrentUrl(), './audio/cyberpunk.mp3');
  assert.equal(fakeState.playCount, 1);

  // Simulate 404 on first candidate -> falls back to ./public/audio/cyberpunk.mp3
  fakeAudio.onerror?.('error');
  assert.equal(player.getCurrentUrl(), './public/audio/cyberpunk.mp3');
  assert.equal(fakeState.playCount, 2);

  // Mute and unmute resumes if paused
  player.setMuted(true);
  assert.equal(fakeAudio.muted, true);
  assert.equal(player.isMuted(), true);
  fakeAudio.paused = true;
  player.setMuted(false);
  assert.equal(fakeAudio.muted, false);
  assert.equal(fakeState.playCount, 3);

  // Stop cleans up handlers and resets src
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

  const totalCandidates = getTrackCandidateUrls('rickroll').length;
  const player = new TrackAudioPlayer('rickroll', () => fakeAudio);
  player.start();

  for (let i = 0; i < totalCandidates; i++) {
    fakeAudio.onerror?.('error');
  }

  assert.equal(player.getCurrentUrl(), null);
  assert.equal(fakeAudio.onerror, null);
});

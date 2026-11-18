import test from 'node:test';
import assert from 'node:assert/strict';
import { liveVoiceHttpUrls, probePreviewBackend } from './previewTransport';

test('probePreviewBackend prefers Node endpoint when JSON status succeeds', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = globalThis;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      assert.match(url, /\/api\/preview\/status$/);
      return new Response(JSON.stringify({ ok: true, liveEnabled: true, voiceUnlockEnabled: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const cfg = await probePreviewBackend();
    assert.equal(cfg.transport, 'node');
    assert.equal(cfg.voiceBackend, 'node');
    assert.equal(cfg.liveEnabled, true);
    assert.equal(cfg.replyUrl, './api/preview/reply');
    assert.equal(cfg.voiceUnlockUrl, './api/preview/voice-unlock');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test('probePreviewBackend falls back to PHP endpoint on reg.ru shared hosting', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = globalThis;

  const calls: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/api/preview/status')) {
        return new Response('<html>404 Not Found</html>', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        });
      }
      if (url.includes('/api/preview.php?action=status')) {
        return new Response(JSON.stringify({ ok: true, liveEnabled: true, voiceUnlockEnabled: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const cfg = await probePreviewBackend();
    assert.equal(calls.length, 2);
    assert.equal(cfg.transport, 'php');
    assert.equal(cfg.voiceBackend, 'php');
    assert.equal(cfg.liveEnabled, true);
    assert.equal(cfg.replyUrl, './api/preview.php?action=reply');
    assert.equal(cfg.voiceUnlockUrl, './api/preview.php?action=voice-unlock');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test('probePreviewBackend enables PHP voice unlock even when Gemini liveEnabled is false', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = globalThis;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/preview/status')) {
        return new Response('<html>404</html>', { status: 404, headers: { 'content-type': 'text/html' } });
      }
      return new Response(JSON.stringify({ ok: true, liveEnabled: false, voiceUnlockEnabled: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const cfg = await probePreviewBackend();
    assert.equal(cfg.transport, 'local');
    assert.equal(cfg.voiceBackend, 'php');
    assert.equal(cfg.liveEnabled, false);
    assert.equal(cfg.replyUrl, null);
    assert.equal(cfg.voiceUnlockUrl, './api/preview.php?action=voice-unlock');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test('liveVoiceHttpUrls maps Node and PHP endpoints accurately', () => {
  const node = liveVoiceHttpUrls('node');
  assert.equal(node.join, './api/voice/join');
  assert.equal(node.poll, './api/voice/poll');

  const php = liveVoiceHttpUrls('php');
  assert.equal(php.join, './api/voice.php?action=join');
  assert.equal(php.poll, './api/voice.php?action=poll');
  assert.equal(php.leave, './api/voice.php?action=leave');
});

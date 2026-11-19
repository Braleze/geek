import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVoiceUnlockCandidates,
  liveVoiceHttpUrls,
  probePreviewBackend,
  requestServerVoiceUnlock,
} from './previewTransport';

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

test('probePreviewBackend detects PHP voice.php directly if preview.php is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = globalThis;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/voice.php?action=status')) {
        return new Response(JSON.stringify({ ok: true, peersCount: 1, maxParticipants: 8 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('<html>404</html>', { status: 404, headers: { 'content-type': 'text/html' } });
    }) as typeof fetch;

    const cfg = await probePreviewBackend();
    assert.equal(cfg.voiceBackend, 'php');
    assert.equal(cfg.voiceUnlockUrl, './api/voice.php?action=unlock');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test('requestServerVoiceUnlock falls back from outdated preview.php to voice.php?action=unlock', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = globalThis;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/preview.php?action=voice-unlock')) {
        return new Response(JSON.stringify({ ok: false, reason: 'UNKNOWN_ACTION' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/voice.php?action=unlock')) {
        return new Response(
          JSON.stringify({
            ok: true,
            matched: true,
            voiceUnlockToken: '1999999999999.' + 'a'.repeat(64),
            reply: { id: 'sys-1', author: 'СИСТЕМА GEEK', text: 'ok' },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      return new Response('<html>404</html>', { status: 404, headers: { 'content-type': 'text/html' } });
    }) as typeof fetch;

    const res = await requestServerVoiceUnlock('test-code', './api/preview.php?action=voice-unlock', 'php');
    assert.equal(res.matched, true);
    assert.equal(res.backend, 'php');
    assert.equal(res.unlockUrl, './api/voice.php?action=unlock');
    assert.equal(res.serverReachable, true);
    assert.ok(res.voiceUnlockToken && !res.voiceUnlockToken.startsWith('local-'));
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test('buildVoiceUnlockCandidates orders PHP endpoints first when php backend is active', () => {
  const phpOrder = buildVoiceUnlockCandidates(null, 'php');
  assert.equal(phpOrder[0].url, './api/preview.php?action=voice-unlock');
  assert.equal(phpOrder[1].url, './api/voice.php?action=unlock');
  const nodeOrder = buildVoiceUnlockCandidates(null, 'node');
  assert.equal(nodeOrder[0].url, './api/preview/voice-unlock');
  assert.equal(nodeOrder[1].url, './api/voice/unlock');
});

test('liveVoiceHttpUrls maps Node and PHP endpoints accurately', () => {
  const node = liveVoiceHttpUrls('node');
  assert.equal(node.join, './api/voice/join');
  assert.equal(node.poll, './api/voice/poll');
  assert.equal(node.unlock, './api/voice/unlock');

  const php = liveVoiceHttpUrls('php');
  assert.equal(php.join, './api/voice.php?action=join');
  assert.equal(php.poll, './api/voice.php?action=poll');
  assert.equal(php.unlock, './api/voice.php?action=unlock');
  assert.equal(php.leave, './api/voice.php?action=leave');
});

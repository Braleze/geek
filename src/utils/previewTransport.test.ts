import test from 'node:test';
import assert from 'node:assert/strict';
import { probePreviewBackend } from './previewTransport';

test('probePreviewBackend prefers Node endpoint when JSON status succeeds', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = globalThis;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      assert.match(url, /\/api\/preview\/status$/);
      return new Response(JSON.stringify({ ok: true, liveEnabled: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const cfg = await probePreviewBackend();
    assert.equal(cfg.transport, 'node');
    assert.equal(cfg.liveEnabled, true);
    assert.equal(cfg.replyUrl, './api/preview/reply');
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
        return new Response(JSON.stringify({ ok: true, liveEnabled: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const cfg = await probePreviewBackend();
    assert.equal(calls.length, 2);
    assert.equal(cfg.transport, 'php');
    assert.equal(cfg.liveEnabled, true);
    assert.equal(cfg.replyUrl, './api/preview.php?action=reply');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test('probePreviewBackend falls back to local deterministic replies when neither backend has Gemini enabled', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = globalThis;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/preview/status')) {
        return new Response('<html>404</html>', { status: 404, headers: { 'content-type': 'text/html' } });
      }
      return new Response(JSON.stringify({ ok: true, liveEnabled: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const cfg = await probePreviewBackend();
    assert.equal(cfg.transport, 'local');
    assert.equal(cfg.liveEnabled, false);
    assert.equal(cfg.replyUrl, null);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

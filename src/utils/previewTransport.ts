export interface PreviewEndpointConfig {
  liveEnabled: boolean;
  replyUrl: string | null;
  transport: 'node' | 'php' | 'local';
}

export interface PreviewReplyPayload {
  question: string;
  serverId: string;
  channelId: string;
  history: Array<{ author: string; text: string }>;
}

async function fetchJsonSafe(
  url: string,
  init?: RequestInit,
  timeoutMs: number = 5000,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const ct = res.headers.get('content-type') || '';
    if (!ct.toLowerCase().includes('application/json')) {
      return { ok: false, status: res.status, data: null };
    }
    const parsed = (await res.json()) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data: parsed };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function probePreviewBackend(): Promise<PreviewEndpointConfig> {
  // 1. Check Node Express route (./api/preview/status)
  const nodeRes = await fetchJsonSafe('./api/preview/status');
  if (nodeRes.ok && nodeRes.data && nodeRes.data.ok === true) {
    const liveEnabled = Boolean(nodeRes.data.liveEnabled);
    return {
      liveEnabled,
      replyUrl: liveEnabled ? './api/preview/reply' : null,
      transport: liveEnabled ? 'node' : 'local',
    };
  }

  // 2. Check PHP endpoint for reg.ru shared hosting (./api/preview.php?action=status)
  const phpRes = await fetchJsonSafe('./api/preview.php?action=status');
  if (phpRes.ok && phpRes.data && phpRes.data.ok === true) {
    const liveEnabled = Boolean(phpRes.data.liveEnabled);
    return {
      liveEnabled,
      replyUrl: liveEnabled ? './api/preview.php?action=reply' : null,
      transport: liveEnabled ? 'php' : 'local',
    };
  }

  return {
    liveEnabled: false,
    replyUrl: null,
    transport: 'local',
  };
}

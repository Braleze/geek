export interface PreviewEndpointConfig {
  liveEnabled: boolean;
  replyUrl: string | null;
  voiceUnlockUrl: string | null;
  transport: 'node' | 'php' | 'local';
  voiceBackend: 'node' | 'php' | 'local';
}

export interface PreviewReplyPayload {
  question: string;
  serverId: string;
  channelId: string;
  history: Array<{ author: string; text: string }>;
}

export function liveVoiceHttpUrls(backend: 'node' | 'php') {
  if (backend === 'php') {
    return {
      status: './api/voice.php?action=status',
      join: './api/voice.php?action=join',
      poll: './api/voice.php?action=poll',
      update: './api/voice.php?action=update',
      signal: './api/voice.php?action=signal',
      leave: './api/voice.php?action=leave',
    };
  }
  return {
    status: './api/voice/status',
    join: './api/voice/join',
    poll: './api/voice/poll',
    update: './api/voice/update',
    signal: './api/voice/signal',
    leave: './api/voice/leave',
  };
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
    const voiceUnlockEnabled = Boolean(nodeRes.data.voiceUnlockEnabled);
    return {
      liveEnabled,
      replyUrl: liveEnabled ? './api/preview/reply' : null,
      voiceUnlockUrl: voiceUnlockEnabled ? './api/preview/voice-unlock' : null,
      transport: liveEnabled ? 'node' : 'local',
      voiceBackend: 'node',
    };
  }

  // 2. Check PHP endpoint for reg.ru shared hosting (./api/preview.php?action=status)
  const phpRes = await fetchJsonSafe('./api/preview.php?action=status');
  if (phpRes.ok && phpRes.data && phpRes.data.ok === true) {
    const liveEnabled = Boolean(phpRes.data.liveEnabled);
    const voiceUnlockEnabled = phpRes.data.voiceUnlockEnabled !== false;
    return {
      liveEnabled,
      replyUrl: liveEnabled ? './api/preview.php?action=reply' : null,
      voiceUnlockUrl: voiceUnlockEnabled ? './api/preview.php?action=voice-unlock' : null,
      transport: liveEnabled ? 'php' : 'local',
      voiceBackend: 'php',
    };
  }

  return {
    liveEnabled: false,
    replyUrl: null,
    voiceUnlockUrl: null,
    transport: 'local',
    voiceBackend: 'local',
  };
}

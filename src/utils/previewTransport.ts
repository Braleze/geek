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
      unlock: './api/voice.php?action=unlock',
      join: './api/voice.php?action=join',
      poll: './api/voice.php?action=poll',
      update: './api/voice.php?action=update',
      signal: './api/voice.php?action=signal',
      leave: './api/voice.php?action=leave',
    };
  }
  return {
    status: './api/voice/status',
    unlock: './api/voice/unlock',
    join: './api/voice/join',
    poll: './api/voice/poll',
    update: './api/voice/update',
    signal: './api/voice/signal',
    leave: './api/voice/leave',
  };
}

export function buildVoiceUnlockCandidates(
  preferredUrl?: string | null,
  preferredBackend?: 'node' | 'php' | 'local' | null,
): Array<{ url: string; backend: 'node' | 'php' }> {
  const ordered: Array<{ url: string; backend: 'node' | 'php' }> = [];
  const pushUnique = (url: string | null | undefined, backend: 'node' | 'php') => {
    if (!url) return;
    if (ordered.some((item) => item.url === url)) return;
    ordered.push({ url, backend });
  };

  if (preferredUrl) {
    const inferred: 'node' | 'php' = preferredUrl.includes('.php') ? 'php' : 'node';
    pushUnique(preferredUrl, inferred);
  }

  if (preferredBackend === 'php') {
    pushUnique('./api/preview.php?action=voice-unlock', 'php');
    pushUnique('./api/voice.php?action=unlock', 'php');
    pushUnique('./api/preview/voice-unlock', 'node');
    pushUnique('./api/voice/unlock', 'node');
  } else {
    pushUnique('./api/preview/voice-unlock', 'node');
    pushUnique('./api/voice/unlock', 'node');
    pushUnique('./api/preview.php?action=voice-unlock', 'php');
    pushUnique('./api/voice.php?action=unlock', 'php');
  }

  return ordered;
}

export interface ServerVoiceUnlockResult {
  matched: boolean;
  backend: 'node' | 'php' | null;
  unlockUrl: string | null;
  voiceUnlockToken?: string;
  reply?: Record<string, unknown>;
  serverReachable: boolean;
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

export async function requestServerVoiceUnlock(
  rawCode: string,
  preferredUrl?: string | null,
  preferredBackend?: 'node' | 'php' | 'local' | null,
): Promise<ServerVoiceUnlockResult> {
  const candidates = buildVoiceUnlockCandidates(preferredUrl, preferredBackend);
  let reachableBackend: 'node' | 'php' | null = null;
  let reachableUrl: string | null = null;

  for (const cand of candidates) {
    const res = await fetchJsonSafe(
      cand.url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: rawCode.slice(0, 220) }),
      },
      4500,
    );
    if (!res.ok || !res.data || res.data.ok !== true) {
      continue;
    }
    if (!reachableBackend) {
      reachableBackend = cand.backend;
      reachableUrl = cand.url;
    }
    if (
      res.data.matched === true &&
      typeof res.data.voiceUnlockToken === 'string' &&
      res.data.voiceUnlockToken.length > 0 &&
      res.data.reply &&
      typeof res.data.reply === 'object'
    ) {
      return {
        matched: true,
        backend: cand.backend,
        unlockUrl: cand.url,
        voiceUnlockToken: res.data.voiceUnlockToken,
        reply: res.data.reply as Record<string, unknown>,
        serverReachable: true,
      };
    }
    if (res.data.matched === false) {
      return {
        matched: false,
        backend: cand.backend,
        unlockUrl: cand.url,
        serverReachable: true,
      };
    }
  }

  return {
    matched: false,
    backend: reachableBackend,
    unlockUrl: reachableUrl,
    serverReachable: reachableBackend !== null,
  };
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
      voiceUnlockUrl: voiceUnlockEnabled ? './api/preview/voice-unlock' : './api/voice/unlock',
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
      voiceUnlockUrl: voiceUnlockEnabled
        ? './api/preview.php?action=voice-unlock'
        : './api/voice.php?action=unlock',
      transport: liveEnabled ? 'php' : 'local',
      voiceBackend: 'php',
    };
  }

  // 3. Fallback probe directly to ./api/voice.php?action=status (in case preview.php is unavailable)
  const phpVoiceRes = await fetchJsonSafe('./api/voice.php?action=status');
  if (phpVoiceRes.ok && phpVoiceRes.data && phpVoiceRes.data.ok === true) {
    return {
      liveEnabled: false,
      replyUrl: null,
      voiceUnlockUrl: './api/voice.php?action=unlock',
      transport: 'local',
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

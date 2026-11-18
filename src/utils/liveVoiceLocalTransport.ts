import {
  buildLiveVoiceSnapshot,
  joinLiveVoiceRoom,
  leaveLiveVoiceRoom,
  pruneStaleLiveVoicePeers,
  shouldInitiateRtcMesh,
  updateLiveVoicePeer,
  type LiveVoicePeer,
  type LiveVoicePublicPeer,
} from './liveVoiceRoom';

const LOCAL_PEERS_KEY = 'geek_live_voice_peers_v1';
const LOCAL_CHANNEL_NAME = 'geek_live_voice_ipc_v1';

function readLocalPeersMap(): Map<string, LiveVoicePeer> {
  const map = new Map<string, LiveVoicePeer>();
  try {
    const raw = window.localStorage.getItem(LOCAL_PEERS_KEY);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return map;
    for (const item of parsed) {
      if (item && typeof item === 'object' && typeof (item as LiveVoicePeer).peerId === 'string') {
        const peer = item as LiveVoicePeer;
        map.set(peer.peerId, peer);
      }
    }
    pruneStaleLiveVoicePeers(map, Date.now());
  } catch {
    // Ignore corrupt or blocked localStorage
  }
  return map;
}

function writeLocalPeersMap(map: Map<string, LiveVoicePeer>): void {
  try {
    window.localStorage.setItem(LOCAL_PEERS_KEY, JSON.stringify(Array.from(map.values())));
  } catch {
    // Ignore storage quota errors
  }
}

export interface LocalVoiceSession {
  peerId: string;
  peers: LiveVoicePublicPeer[];
  sendUpdate: (patch: {
    micMuted?: boolean;
    deafened?: boolean;
    hasAudio?: boolean;
    camActive?: boolean;
    screenActive?: boolean;
    speaking?: boolean;
  }) => void;
  sendPacket: (
    toPeerId: string | null,
    packet: Record<string, unknown>,
  ) => void;
  leave: () => void;
}

export function joinLocalBroadcastVoiceRoom(
  input: {
    nick: string;
    hasAudio: boolean;
    micMuted: boolean;
    deafened: boolean;
    camActive: boolean;
    screenActive: boolean;
  },
  onPacket: (packet: Record<string, unknown>) => void,
): LocalVoiceSession {
  const peerId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `lv-${crypto.randomUUID()}`
      : `lv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  let closed = false;
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(LOCAL_CHANNEL_NAME);
    }
  } catch {
    channel = null;
  }

  const postIpc = (payload: Record<string, unknown>) => {
    try {
      channel?.postMessage(payload);
    } catch {
      // Ignore closed channel
    }
  };

  const peersMap = readLocalPeersMap();
  const joinRes = joinLiveVoiceRoom(
    peersMap,
    {
      peerId,
      nick: input.nick,
      hasAudio: input.hasAudio,
      micMuted: input.micMuted,
      deafened: input.deafened,
      camActive: input.camActive,
      screenActive: input.screenActive,
      transport: 'http',
    },
    Date.now(),
  );
  writeLocalPeersMap(peersMap);

  const initialPeers = joinRes.ok ? joinRes.snapshot : buildLiveVoiceSnapshot(peersMap);

  postIpc({ kind: 'state' });
  for (const other of peersMap.values()) {
    if (other.peerId === peerId) continue;
    if (shouldInitiateRtcMesh(peerId, other.peerId)) {
      window.setTimeout(() => {
        if (!closed) {
          onPacket({ type: 'voice:rtc-initiate', targetPeerId: other.peerId });
        }
      }, 40);
    } else {
      postIpc({
        kind: 'direct',
        toPeerId: other.peerId,
        packet: { type: 'voice:rtc-initiate', targetPeerId: peerId },
      });
    }
  }

  if (channel) {
    channel.onmessage = (ev: MessageEvent) => {
      if (closed) return;
      const data = ev.data as Record<string, unknown> | null;
      if (!data || typeof data !== 'object') return;
      if (data.kind === 'state') {
        const latest = readLocalPeersMap();
        onPacket({ type: 'voice:state', peers: buildLiveVoiceSnapshot(latest) });
        return;
      }
      if (data.kind === 'direct' && data.toPeerId === peerId && data.packet && typeof data.packet === 'object') {
        onPacket(data.packet as Record<string, unknown>);
        return;
      }
      if (data.kind === 'broadcast' && data.fromPeerId !== peerId && data.packet && typeof data.packet === 'object') {
        onPacket(data.packet as Record<string, unknown>);
      }
    };
  }

  const onStorage = (ev: StorageEvent) => {
    if (closed || ev.key !== LOCAL_PEERS_KEY) return;
    const latest = readLocalPeersMap();
    onPacket({ type: 'voice:state', peers: buildLiveVoiceSnapshot(latest) });
  };
  window.addEventListener('storage', onStorage);

  const heartbeatId = window.setInterval(() => {
    if (closed) return;
    const latest = readLocalPeersMap();
    const updated = updateLiveVoicePeer(latest, peerId, {}, Date.now());
    if (updated) {
      writeLocalPeersMap(latest);
      onPacket({ type: 'voice:state', peers: updated });
    }
  }, 2500);

  return {
    peerId,
    peers: initialPeers,
    sendUpdate(patch) {
      if (closed) return;
      const latest = readLocalPeersMap();
      const updated = updateLiveVoicePeer(latest, peerId, patch, Date.now());
      if (updated) {
        writeLocalPeersMap(latest);
        postIpc({ kind: 'state' });
        onPacket({ type: 'voice:state', peers: updated });
      }
    },
    sendPacket(toPeerId, packet) {
      if (closed) return;
      if (toPeerId) {
        postIpc({ kind: 'direct', toPeerId, packet });
      } else {
        postIpc({ kind: 'broadcast', fromPeerId: peerId, packet });
      }
    },
    leave() {
      if (closed) return;
      closed = true;
      window.clearInterval(heartbeatId);
      window.removeEventListener('storage', onStorage);
      const latest = readLocalPeersMap();
      const { removedPeer } = leaveLiveVoiceRoom(latest, peerId);
      writeLocalPeersMap(latest);
      if (removedPeer) {
        postIpc({
          kind: 'broadcast',
          fromPeerId: peerId,
          packet: { type: 'voice:peer-left', peerId },
        });
        postIpc({ kind: 'state' });
      }
      try {
        channel?.close();
      } catch {
        // Ignore
      }
      channel = null;
    },
  };
}

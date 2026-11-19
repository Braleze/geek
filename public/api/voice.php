<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

const LIVE_VOICE_MAX_PARTICIPANTS = 8;
const LIVE_VOICE_HTTP_STALE_MS = 30000;
const LIVE_VOICE_SIGNAL_TTL_MS = 60000;
const LIVE_VOICE_SIGNAL_MAX_PER_PEER = 120;
const DEFAULT_VOICE_UNLOCK_CODE = 'gk-voice-7714-test';
const VOICE_UNLOCK_TOKEN_TTL_MS = 86400000;

function getVoiceUnlockHmacSecret(): string {
    $apiKey = gkSetting('gemini_api_key', 'GEMINI_API_KEY', '');
    $voiceCode = gkSetting('preview_voice_unlock_code', 'PREVIEW_VOICE_UNLOCK_CODE', DEFAULT_VOICE_UNLOCK_CODE);
    $baseKey = $apiKey !== '' ? $apiKey : 'local-preview-key';
    return $baseKey . '::voice-unlock::' . $voiceCode;
}

function extractVoiceUnlockCandidate(string $raw): string {
    $cleaned = preg_replace('/[\x{200B}-\x{200D}\x{FEFF}]/u', '', $raw) ?? $raw;
    $trimmed = trim($cleaned);
    if (preg_match('/^\/(?:voice|voicetest)\s+(.+)$/iu', $trimmed, $m)) {
        $trimmed = trim($m[1]);
    }
    $trimmed = preg_replace('/[\x{2010}-\x{2015}\x{2212}]/u', '-', $trimmed) ?? $trimmed;
    $trimmed = trim($trimmed, " \t\n\r\0\x0B`'\"«»");
    return strtolower($trimmed);
}

function isValidVoiceUnlockAttempt(string $raw, string $expectedCode): bool {
    $candidate = extractVoiceUnlockCandidate($raw);
    $expected = strtolower(trim($expectedCode));
    if ($candidate === '' || $expected === '') {
        return false;
    }
    return hash_equals(
        hash('sha256', $candidate, true),
        hash('sha256', $expected, true)
    );
}

function signUnlockToken(string $hmacSecret): string {
    $expMs = (string)(gkNowMs() + VOICE_UNLOCK_TOKEN_TTL_MS);
    $sig = hash_hmac('sha256', $expMs, $hmacSecret);
    return $expMs . '.' . $sig;
}

function verifyUnlockToken($token, string $hmacSecret): bool {
    if (!is_string($token) || $hmacSecret === '') {
        return false;
    }
    $parts = explode('.', $token, 2);
    if (count($parts) !== 2) {
        return false;
    }
    $payload = $parts[0];
    $providedSig = $parts[1];
    if (!preg_match('/^\d{10,16}$/', $payload) || !preg_match('/^[0-9a-f]{64}$/i', $providedSig)) {
        return false;
    }
    if ((int)$payload <= gkNowMs()) {
        return false;
    }
    $expectedSig = hash_hmac('sha256', $payload, $hmacSecret);
    return hash_equals($expectedSig, strtolower($providedSig));
}

function buildVoiceUnlockSystemMessage(): array {
    return [
        'id' => 'voice-unlock-' . gkNowMs() . '-' . bin2hex(random_bytes(3)),
        'author' => 'СИСТЕМА GEEK',
        'initials' => 'СГ',
        'avatarColor' => '#10b981',
        'badgeSet' => 'set1',
        'time' => date('H:i'),
        'text' => '🎙 Тестовый живой голосовой канал «🔊 Live Голос (Тест)» открыт в списке голосовых каналов! Подключайтесь для проверки WebRTC-голоса, камеры, экрана и Эхо-теста. Чтобы снова скрыть канал, отправьте /voice-lock.',
    ];
}

function sanitizeVoiceNick(string $raw, int $fallbackIndex): string {
    $cleaned = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $raw) ?? $raw;
    $cleaned = preg_replace('/\s+/u', ' ', trim($cleaned)) ?? trim($cleaned);
    if (gkUtf8Len($cleaned) > 22) {
        $cleaned = gkUtf8Substr($cleaned, 0, 22);
    }
    return $cleaned !== '' ? $cleaned : ('Участник-' . $fallbackIndex);
}

function computeVoiceInitials(string $nick): string {
    $words = preg_split('/\s+/u', trim($nick)) ?: [];
    $cleanWords = [];
    foreach ($words as $w) {
        $stripped = preg_replace('/[^\p{L}\p{N}]/u', '', $w) ?? '';
        if ($stripped !== '') {
            $cleanWords[] = $stripped;
        }
    }
    if (count($cleanWords) >= 2) {
        $res = gkUtf8Upper(gkUtf8Substr($cleanWords[0], 0, 1) . gkUtf8Substr($cleanWords[1], 0, 1));
        return $res !== '' ? $res : 'ГК';
    }
    $all = preg_replace('/[^\p{L}\p{N}]/u', '', $nick) ?? '';
    $res = gkUtf8Upper(gkUtf8Substr($all, 0, 2));
    return $res !== '' ? $res : 'ГК';
}

function pickVoiceAvatarColor(string $seed): string {
    $palette = ['#00f0ff', '#ff2a85', '#3b82f6', '#10b981', '#b829ff', '#f59e0b'];
    $idx = hexdec(substr(md5($seed), 0, 6)) % count($palette);
    return $palette[(int)$idx];
}

function lvEnqueueSignal(PDO $pdo, string $toPeerId, array $packet, int $now): void {
    $packetType = (string)($packet['type'] ?? 'voice:signal');
    $json = json_encode($packet, JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return;
    }
    $ins = $pdo->prepare(
        'INSERT INTO voice_signals (to_peer_id, packet_type, packet_json, created_at)
         VALUES (:to_peer, :ptype, :pjson, :created_at)'
    );
    $ins->execute([
        ':to_peer' => $toPeerId,
        ':ptype' => $packetType,
        ':pjson' => $json,
        ':created_at' => $now,
    ]);

    // Bound queue length per peer to protect Host-0 DB/CP budget
    $cntStmt = $pdo->prepare('SELECT COUNT(*) FROM voice_signals WHERE to_peer_id = :to_peer');
    $cntStmt->execute([':to_peer' => $toPeerId]);
    $cnt = (int)$cntStmt->fetchColumn();
    if ($cnt > LIVE_VOICE_SIGNAL_MAX_PER_PEER) {
        $overflow = $cnt - LIVE_VOICE_SIGNAL_MAX_PER_PEER;
        $oldStmt = $pdo->prepare(
            "SELECT id FROM voice_signals WHERE to_peer_id = :to_peer AND packet_type = 'voice:audio' ORDER BY id ASC LIMIT " . (int)$overflow
        );
        $oldStmt->execute([':to_peer' => $toPeerId]);
        $ids = $oldStmt->fetchAll(PDO::FETCH_COLUMN);
        if (count($ids) > 0) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $del = $pdo->prepare("DELETE FROM voice_signals WHERE id IN ({$placeholders})");
            $del->execute($ids);
        }
    }
}

function lvDequeueSignals(PDO $pdo, string $peerId): array {
    $stmt = $pdo->prepare('SELECT id, packet_json FROM voice_signals WHERE to_peer_id = :peer ORDER BY id ASC');
    $stmt->execute([':peer' => $peerId]);
    $rows = $stmt->fetchAll();
    if (count($rows) === 0) {
        return [];
    }
    $maxId = (int)$rows[count($rows) - 1]['id'];
    $del = $pdo->prepare('DELETE FROM voice_signals WHERE to_peer_id = :peer AND id <= :max_id');
    $del->execute([':peer' => $peerId, ':max_id' => $maxId]);

    $signals = [];
    foreach ($rows as $row) {
        $decoded = json_decode((string)$row['packet_json'], true);
        if (is_array($decoded)) {
            $signals[] = $decoded;
        }
    }
    return $signals;
}

function lvFetchPeers(PDO $pdo): array {
    $stmt = $pdo->query(
        'SELECT peer_id, nick, initials, avatar_color, mic_muted, deafened, has_audio, cam_active, screen_active, speaking, joined_at, last_seen_at
         FROM voice_peers ORDER BY joined_at ASC'
    );
    return $stmt ? $stmt->fetchAll() : [];
}

function lvFormatPublicPeers(array $rows): array {
    $out = [];
    foreach ($rows as $r) {
        $micMuted = ((int)$r['mic_muted']) !== 0;
        $deafened = ((int)$r['deafened']) !== 0;
        $out[] = [
            'peerId' => (string)$r['peer_id'],
            'nick' => (string)$r['nick'],
            'initials' => (string)$r['initials'],
            'avatarColor' => (string)$r['avatar_color'],
            'micMuted' => $micMuted,
            'deafened' => $deafened,
            'hasAudio' => ((int)$r['has_audio']) !== 0,
            'camActive' => ((int)$r['cam_active']) !== 0,
            'screenActive' => ((int)$r['screen_active']) !== 0,
            'speaking' => (((int)$r['speaking']) !== 0) && !$micMuted && !$deafened,
        ];
    }
    return $out;
}

function lvPruneStale(PDO $pdo, int $now): void {
    $cutoffPeer = $now - LIVE_VOICE_HTTP_STALE_MS;
    $stmt = $pdo->prepare('SELECT peer_id FROM voice_peers WHERE last_seen_at < :cutoff');
    $stmt->execute([':cutoff' => $cutoffPeer]);
    $staleIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (count($staleIds) > 0) {
        $placeholders = implode(',', array_fill(0, count($staleIds), '?'));
        $pdo->prepare("DELETE FROM voice_peers WHERE peer_id IN ({$placeholders})")->execute($staleIds);
        $pdo->prepare("DELETE FROM voice_signals WHERE to_peer_id IN ({$placeholders})")->execute($staleIds);

        $remainingStmt = $pdo->query('SELECT peer_id FROM voice_peers');
        $remainingIds = $remainingStmt ? $remainingStmt->fetchAll(PDO::FETCH_COLUMN) : [];
        foreach ($staleIds as $leftId) {
            foreach ($remainingIds as $otherId) {
                lvEnqueueSignal($pdo, (string)$otherId, [
                    'type' => 'voice:peer-left',
                    'peerId' => (string)$leftId,
                ], $now);
            }
        }
    }

    // Expire orphaned old signals
    $cutoffSig = $now - LIVE_VOICE_SIGNAL_TTL_MS;
    $pdo->prepare('DELETE FROM voice_signals WHERE created_at < :cutoff')->execute([':cutoff' => $cutoffSig]);
}

$action = (string)($_GET['action'] ?? '');
$input = gkReadJsonInput();
if ($action === '' && isset($input['action'])) {
    $action = (string)$input['action'];
}
if ($action === '' && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $action = 'status';
}

$voiceSecret = getVoiceUnlockHmacSecret();

if ($action === 'unlock') {
    $voiceCode = gkSetting('preview_voice_unlock_code', 'PREVIEW_VOICE_UNLOCK_CODE', DEFAULT_VOICE_UNLOCK_CODE);
    $rawCode = (string)($input['code'] ?? ($input['question'] ?? ''));
    if (!isValidVoiceUnlockAttempt($rawCode, $voiceCode)) {
        gkRespondJson(200, ['ok' => true, 'matched' => false]);
    }
    gkRespondJson(200, [
        'ok' => true,
        'matched' => true,
        'voiceUnlockToken' => signUnlockToken($voiceSecret),
        'reply' => buildVoiceUnlockSystemMessage(),
    ]);
}

try {
    $pdo = gkDb();
} catch (Throwable $e) {
    gkRespondJson(500, ['ok' => false, 'message' => 'Ошибка базы данных голосового канала: ' . $e->getMessage()]);
}

$now = gkNowMs();

try {
    gkDbBegin($pdo);
    lvPruneStale($pdo, $now);

    if ($action === 'status') {
        $countStmt = $pdo->query('SELECT COUNT(*) FROM voice_peers');
        $peersCount = $countStmt ? (int)$countStmt->fetchColumn() : 0;
        gkDbCommit($pdo);
        gkRespondJson(200, [
            'ok' => true,
            'peersCount' => $peersCount,
            'maxParticipants' => LIVE_VOICE_MAX_PARTICIPANTS,
            'voiceUnlockEnabled' => true,
            'iceServers' => gkResolveIceServers(),
        ]);
    }

    if ($action === 'join') {
        if (!verifyUnlockToken($input['token'] ?? null, $voiceSecret)) {
            gkDbCommit($pdo);
            gkRespondJson(401, [
                'ok' => false,
                'reason' => 'UNAUTHORIZED',
                'message' => 'Требуется секретный код доступа к голосовому каналу.',
            ]);
        }

        $rawPeerId = isset($input['peerId']) ? trim((string)$input['peerId']) : '';
        $peerId = strlen($rawPeerId) >= 8 ? substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $rawPeerId) ?? '', 0, 64) : '';
        if (strlen($peerId) < 8) {
            $peerId = bin2hex(random_bytes(16));
        }

        $allPeers = lvFetchPeers($pdo);
        $existing = null;
        foreach ($allPeers as $row) {
            if ((string)$row['peer_id'] === $peerId) {
                $existing = $row;
                break;
            }
        }

        if ($existing === null && count($allPeers) >= LIVE_VOICE_MAX_PARTICIPANTS) {
            gkDbCommit($pdo);
            gkRespondJson(409, [
                'ok' => false,
                'reason' => 'ROOM_FULL',
                'message' => 'В тестовом голосовом канале уже максимум (' . LIVE_VOICE_MAX_PARTICIPANTS . ') участников.',
            ]);
        }

        $nick = sanitizeVoiceNick((string)($input['nick'] ?? ''), count($allPeers) + 1);
        $initials = computeVoiceInitials($nick);
        $avatarColor = is_array($existing) ? (string)$existing['avatar_color'] : pickVoiceAvatarColor($peerId);
        $joinedAt = is_array($existing) ? (int)$existing['joined_at'] : $now;

        if ($existing !== null) {
            $upd = $pdo->prepare(
                'UPDATE voice_peers
                 SET nick = :nick, initials = :initials, mic_muted = :mic_muted, deafened = :deafened,
                     has_audio = :has_audio, cam_active = :cam_active, screen_active = :screen_active,
                     speaking = 0, last_seen_at = :seen
                 WHERE peer_id = :peer_id'
            );
            $upd->execute([
                ':nick' => $nick,
                ':initials' => $initials,
                ':mic_muted' => !empty($input['micMuted']) ? 1 : 0,
                ':deafened' => !empty($input['deafened']) ? 1 : 0,
                ':has_audio' => !empty($input['hasAudio']) ? 1 : 0,
                ':cam_active' => !empty($input['camActive']) ? 1 : 0,
                ':screen_active' => !empty($input['screenActive']) ? 1 : 0,
                ':seen' => $now,
                ':peer_id' => $peerId,
            ]);
        } else {
            $ins = $pdo->prepare(
                'INSERT INTO voice_peers
                 (peer_id, nick, initials, avatar_color, mic_muted, deafened, has_audio, cam_active, screen_active, speaking, joined_at, last_seen_at)
                 VALUES (:peer_id, :nick, :initials, :color, :mic_muted, :deafened, :has_audio, :cam_active, :screen_active, 0, :joined_at, :seen)'
            );
            $ins->execute([
                ':peer_id' => $peerId,
                ':nick' => $nick,
                ':initials' => $initials,
                ':color' => $avatarColor,
                ':mic_muted' => !empty($input['micMuted']) ? 1 : 0,
                ':deafened' => !empty($input['deafened']) ? 1 : 0,
                ':has_audio' => !empty($input['hasAudio']) ? 1 : 0,
                ':cam_active' => !empty($input['camActive']) ? 1 : 0,
                ':screen_active' => !empty($input['screenActive']) ? 1 : 0,
                ':joined_at' => $joinedAt,
                ':seen' => $now,
            ]);
        }

        $updatedPeers = lvFetchPeers($pdo);
        foreach ($updatedPeers as $other) {
            $otherId = (string)$other['peer_id'];
            if ($otherId === $peerId) {
                continue;
            }
            if (strcmp($peerId, $otherId) < 0) {
                lvEnqueueSignal($pdo, $peerId, [
                    'type' => 'voice:rtc-initiate',
                    'targetPeerId' => $otherId,
                ], $now);
            } else {
                lvEnqueueSignal($pdo, $otherId, [
                    'type' => 'voice:rtc-initiate',
                    'targetPeerId' => $peerId,
                ], $now);
            }
        }

        $signals = lvDequeueSignals($pdo, $peerId);
        gkDbCommit($pdo);

        gkRespondJson(200, [
            'ok' => true,
            'peerId' => $peerId,
            'peers' => lvFormatPublicPeers($updatedPeers),
            'signals' => $signals,
            'iceServers' => gkResolveIceServers(),
        ]);
    }

    if ($action === 'poll') {
        if (!verifyUnlockToken($input['token'] ?? null, $voiceSecret)) {
            gkDbCommit($pdo);
            gkRespondJson(401, ['ok' => false, 'reason' => 'UNAUTHORIZED', 'message' => 'Доступ запрещён.']);
        }
        $peerId = (string)($input['peerId'] ?? '');
        $chk = $pdo->prepare('SELECT peer_id FROM voice_peers WHERE peer_id = :peer');
        $chk->execute([':peer' => $peerId]);
        if ($peerId === '' || !$chk->fetch()) {
            gkDbCommit($pdo);
            gkRespondJson(409, ['ok' => false, 'reason' => 'NOT_IN_ROOM', 'message' => 'Вы не в голосовом канале.']);
        }
        $pdo->prepare('UPDATE voice_peers SET last_seen_at = :seen WHERE peer_id = :peer')
            ->execute([':seen' => $now, ':peer' => $peerId]);

        $signals = lvDequeueSignals($pdo, $peerId);
        $peers = lvFetchPeers($pdo);
        gkDbCommit($pdo);

        gkRespondJson(200, [
            'ok' => true,
            'peers' => lvFormatPublicPeers($peers),
            'signals' => $signals,
        ]);
    }

    if ($action === 'update') {
        if (!verifyUnlockToken($input['token'] ?? null, $voiceSecret)) {
            gkDbCommit($pdo);
            gkRespondJson(401, ['ok' => false, 'reason' => 'UNAUTHORIZED']);
        }
        $peerId = (string)($input['peerId'] ?? '');
        $chk = $pdo->prepare('SELECT * FROM voice_peers WHERE peer_id = :peer');
        $chk->execute([':peer' => $peerId]);
        $row = $chk->fetch();
        if ($peerId === '' || !$row) {
            gkDbCommit($pdo);
            gkRespondJson(409, ['ok' => false, 'reason' => 'NOT_IN_ROOM']);
        }

        $flagMap = [
            'micMuted' => 'mic_muted',
            'deafened' => 'deafened',
            'hasAudio' => 'has_audio',
            'camActive' => 'cam_active',
            'screenActive' => 'screen_active',
            'speaking' => 'speaking',
        ];
        $sets = ['last_seen_at = :seen'];
        $params = [':seen' => $now, ':peer' => $peerId];
        if (array_key_exists('nick', $input) && is_string($input['nick'])) {
            $nextNick = sanitizeVoiceNick($input['nick'], 1);
            $nextInitials = computeVoiceInitials($nextNick);
            $sets[] = 'nick = :nick';
            $sets[] = 'initials = :initials';
            $params[':nick'] = $nextNick;
            $params[':initials'] = $nextInitials;
        }
        foreach ($flagMap as $jsonKey => $col) {
            if (array_key_exists($jsonKey, $input) && is_bool($input[$jsonKey])) {
                $sets[] = "{$col} = :{$col}";
                $params[":{$col}"] = $input[$jsonKey] ? 1 : 0;
            }
        }

        $sql = 'UPDATE voice_peers SET ' . implode(', ', $sets) . ' WHERE peer_id = :peer';
        $pdo->prepare($sql)->execute($params);
        $peers = lvFetchPeers($pdo);
        gkDbCommit($pdo);

        gkRespondJson(200, [
            'ok' => true,
            'peers' => lvFormatPublicPeers($peers),
        ]);
    }

    if ($action === 'signal') {
        if (!verifyUnlockToken($input['token'] ?? null, $voiceSecret)) {
            gkDbCommit($pdo);
            gkRespondJson(401, ['ok' => false, 'reason' => 'UNAUTHORIZED']);
        }
        $peerId = (string)($input['peerId'] ?? '');
        $chk = $pdo->prepare('SELECT peer_id FROM voice_peers WHERE peer_id = :peer');
        $chk->execute([':peer' => $peerId]);
        if ($peerId === '' || !$chk->fetch()) {
            gkDbCommit($pdo);
            gkRespondJson(409, ['ok' => false, 'reason' => 'NOT_IN_ROOM']);
        }
        $pdo->prepare('UPDATE voice_peers SET last_seen_at = :seen WHERE peer_id = :peer')
            ->execute([':seen' => $now, ':peer' => $peerId]);

        $signalType = (string)($input['signalType'] ?? '');

        if ($signalType === 'audio') {
            $payload = $input['payload'] ?? null;
            if (!is_array($payload) || !isset($payload['data']) || !is_string($payload['data']) || $payload['data'] === '' || strlen($payload['data']) > 32768) {
                gkDbCommit($pdo);
                gkRespondJson(400, ['ok' => false, 'reason' => 'BAD_AUDIO_FRAME']);
            }
            $sr = isset($payload['sr']) && is_numeric($payload['sr']) ? (int)$payload['sr'] : 16000;
            $safeSr = ($sr >= 8000 && $sr <= 48000) ? $sr : 16000;
            $others = lvFetchPeers($pdo);
            foreach ($others as $other) {
                $otherId = (string)$other['peer_id'];
                if ($otherId === $peerId || ((int)$other['deafened']) !== 0) {
                    continue;
                }
                lvEnqueueSignal($pdo, $otherId, [
                    'type' => 'voice:audio',
                    'fromPeerId' => $peerId,
                    'sr' => $safeSr,
                    'data' => $payload['data'],
                ], $now);
            }
            gkDbCommit($pdo);
            gkRespondJson(200, ['ok' => true]);
        }

        $toPeerId = (string)($input['toPeerId'] ?? '');
        $targetChk = $pdo->prepare('SELECT peer_id FROM voice_peers WHERE peer_id = :peer');
        $targetChk->execute([':peer' => $toPeerId]);
        if (
            $toPeerId === '' ||
            $toPeerId === $peerId ||
            !$targetChk->fetch() ||
            ($signalType !== 'offer' && $signalType !== 'answer' && $signalType !== 'ice')
        ) {
            gkDbCommit($pdo);
            gkRespondJson(400, ['ok' => false, 'reason' => 'BAD_SIGNAL']);
        }

        lvEnqueueSignal($pdo, $toPeerId, [
            'type' => 'voice:signal',
            'fromPeerId' => $peerId,
            'signalType' => $signalType,
            'payload' => $input['payload'] ?? null,
        ], $now);
        gkDbCommit($pdo);
        gkRespondJson(200, ['ok' => true]);
    }

    if ($action === 'leave') {
        $peerId = (string)($input['peerId'] ?? '');
        if ($peerId !== '') {
            $del = $pdo->prepare('DELETE FROM voice_peers WHERE peer_id = :peer');
            $del->execute([':peer' => $peerId]);
            $pdo->prepare('DELETE FROM voice_signals WHERE to_peer_id = :peer')->execute([':peer' => $peerId]);
            if ($del->rowCount() > 0) {
                $others = lvFetchPeers($pdo);
                foreach ($others as $other) {
                    lvEnqueueSignal($pdo, (string)$other['peer_id'], [
                        'type' => 'voice:peer-left',
                        'peerId' => $peerId,
                    ], $now);
                }
            }
        }
        gkDbCommit($pdo);
        gkRespondJson(200, ['ok' => true]);
    }

    gkDbCommit($pdo);
    gkRespondJson(400, ['ok' => false, 'reason' => 'UNKNOWN_ACTION', 'message' => 'Неизвестное действие voice API.']);
} catch (Throwable $e) {
    gkDbRollback($pdo);
    gkRespondJson(500, ['ok' => false, 'message' => 'Внутренняя ошибка voice API.']);
}

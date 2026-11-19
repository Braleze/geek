<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

const PRE_BETA_DURATION_MS = 1800000;
const PRE_BETA_MAX_PARTICIPANTS = 2;
const PRE_BETA_MAX_MESSAGES = 80;
const PRE_BETA_HTTP_IDLE_MS = 22000;
const PRE_BETA_SIGNAL_TTL_MS = 60000;
const PRE_BETA_SIGNAL_MAX_PER_PEER = 96;
const PRE_BETA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function pbSanitizeClientId(string $raw): string {
    $cleaned = preg_replace('/[^a-zA-Z0-9_-]/', '', trim($raw)) ?? '';
    if (strlen($cleaned) < 6 || strlen($cleaned) > 64) {
        return '';
    }
    return $cleaned;
}

function pbNormalizeCode(string $raw): string {
    $cleaned = preg_replace('/[^A-Z0-9]/', '', strtoupper($raw)) ?? '';
    $body = strpos($cleaned, 'GK') === 0 ? substr($cleaned, 2) : $cleaned;
    if (strlen($body) !== 8) {
        return '';
    }
    return 'GK-' . substr($body, 0, 4) . '-' . substr($body, 4, 4);
}

function pbSanitizeNick(string $raw, string $fallback): string {
    $cleaned = trim(preg_replace('/\s+/', ' ', $raw) ?? '');
    if ($cleaned === '') {
        return $fallback;
    }
    return gkUtf8Substr($cleaned, 0, 22);
}

function pbFormatMs(int $ms): string {
    $secs = max(0, (int)ceil($ms / 1000));
    $m = intdiv($secs, 60);
    $s = $secs % 60;
    return sprintf('%02d:%02d', $m, $s);
}

function pbTimerRemainingMs(array $timer, int $now): int {
    $base = max(0, (int)($timer['remainingMs'] ?? 0));
    $since = $timer['runningSince'] ?? null;
    if ($since === null) {
        return $base;
    }
    $elapsed = max(0, $now - (int)$since);
    return max(0, $base - $elapsed);
}

function &pbEnsureClientTimer(array &$room, string $clientId): array {
    if (!isset($room['timersByClientId']) || !is_array($room['timersByClientId'])) {
        $room['timersByClientId'] = [];
    }
    if (!isset($room['timersByClientId'][$clientId]) || !is_array($room['timersByClientId'][$clientId])) {
        $hostId = (string)($room['hostClientId'] ?? '');
        $initialRemaining = ($clientId === $hostId && isset($room['remainingMs']))
            ? max(0, (int)$room['remainingMs'])
            : PRE_BETA_DURATION_MS;
        $initialSince = ($clientId === $hostId && isset($room['timerRunningSince']))
            ? $room['timerRunningSince']
            : null;
        $room['timersByClientId'][$clientId] = [
            'remainingMs' => $initialRemaining,
            'runningSince' => $initialSince,
        ];
    }
    return $room['timersByClientId'][$clientId];
}

function pbGetClientRoomRemainingMs(array $room, string $clientId, int $now): int {
    if (isset($room['timersByClientId'][$clientId]) && is_array($room['timersByClientId'][$clientId])) {
        return pbTimerRemainingMs($room['timersByClientId'][$clientId], $now);
    }
    $hostId = (string)($room['hostClientId'] ?? '');
    if ($clientId === $hostId) {
        $base = max(0, (int)($room['remainingMs'] ?? 0));
        $since = $room['timerRunningSince'] ?? null;
        if ($since === null) {
            return $base;
        }
        return max(0, $base - max(0, $now - (int)$since));
    }
    return PRE_BETA_DURATION_MS;
}

function pbIsClientTimerPaused(array $room, string $clientId): bool {
    if (isset($room['timersByClientId'][$clientId]) && is_array($room['timersByClientId'][$clientId])) {
        return ($room['timersByClientId'][$clientId]['runningSince'] ?? null) === null;
    }
    $hostId = (string)($room['hostClientId'] ?? '');
    if ($clientId === $hostId) {
        return ($room['timerRunningSince'] ?? null) === null;
    }
    return true;
}

function pbPauseClientTimer(array &$room, string $clientId, int $now): bool {
    $timer =& pbEnsureClientTimer($room, $clientId);
    $left = pbTimerRemainingMs($timer, $now);
    $wasRunning = ($timer['runningSince'] ?? null) !== null;
    $timer['remainingMs'] = $left;
    $timer['runningSince'] = null;
    unset($timer);

    if ($clientId === (string)($room['hostClientId'] ?? '')) {
        $room['remainingMs'] = $left;
        $room['timerRunningSince'] = null;
        $room['expiresAt'] = null;
    }
    return $wasRunning;
}

function pbResumeClientTimer(array &$room, string $clientId, int $now): bool {
    $timer =& pbEnsureClientTimer($room, $clientId);
    $left = pbTimerRemainingMs($timer, $now);
    if ($left <= 0) {
        $timer['remainingMs'] = 0;
        $timer['runningSince'] = null;
        unset($timer);
        if ($clientId === (string)($room['hostClientId'] ?? '')) {
            $room['remainingMs'] = 0;
            $room['timerRunningSince'] = null;
            $room['expiresAt'] = null;
        }
        return false;
    }
    $resumed = false;
    if (($timer['runningSince'] ?? null) === null) {
        $timer['remainingMs'] = $left;
        $timer['runningSince'] = $now;
        $resumed = true;
    }
    $runningSince = $timer['runningSince'];
    $rem = $timer['remainingMs'];
    unset($timer);

    if ($clientId === (string)($room['hostClientId'] ?? '')) {
        $room['remainingMs'] = $rem;
        $room['timerRunningSince'] = $runningSince;
        $room['expiresAt'] = $runningSince + $rem;
    }
    return $resumed;
}

function pbBuildSnapshot(array $room, int $now, string $forClientId = ''): array {
    $targetClientId = $forClientId !== '' ? $forClientId : (string)($room['hostClientId'] ?? '');
    $remaining = pbGetClientRoomRemainingMs($room, $targetClientId, $now);
    $paused = pbIsClientTimerPaused($room, $targetClientId);
    $participants = [];
    foreach (($room['participants'] ?? []) as $p) {
        $participants[] = [
            'peerId' => (string)$p['peerId'],
            'nick' => (string)$p['nick'],
            'micMuted' => !empty($p['micMuted']),
            'hasAudio' => !empty($p['hasAudio']),
            'isHost' => ($p['clientId'] ?? '') === ($room['hostClientId'] ?? ''),
        ];
    }
    return [
        'code' => $room['code'],
        'createdAt' => (int)$room['createdAt'],
        'expiresAt' => (!$paused && $remaining > 0) ? $now + $remaining : null,
        'remainingMs' => $remaining,
        'paused' => $paused,
        'maxParticipants' => PRE_BETA_MAX_PARTICIPANTS,
        'participants' => $participants,
        'messages' => array_slice($room['messages'] ?? [], -PRE_BETA_MAX_MESSAGES),
    ];
}

function pbLoadQuota(PDO $pdo, string $clientId): ?array {
    $stmt = $pdo->prepare('SELECT client_id, issued_code, created_at, remaining_ms, expires_at FROM prebeta_quotas WHERE client_id = :cid');
    $stmt->execute([':cid' => $clientId]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

function pbSyncHostQuotaDb(PDO $pdo, array $room, int $now): void {
    $hostId = (string)($room['hostClientId'] ?? '');
    if ($hostId === '') {
        return;
    }
    $left = pbGetClientRoomRemainingMs($room, $hostId, $now);
    $paused = pbIsClientTimerPaused($room, $hostId);
    $expiresAt = (!$paused && $left > 0) ? $now + $left : null;
    $upd = $pdo->prepare('UPDATE prebeta_quotas SET remaining_ms = :rem, expires_at = :exp WHERE client_id = :cid');
    $upd->execute([
        ':rem' => $left,
        ':exp' => $expiresAt,
        ':cid' => $hostId,
    ]);
}

function pbLoadRoom(PDO $pdo, string $code): ?array {
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    $sql = $driver === 'mysql'
        ? 'SELECT state_json FROM prebeta_rooms WHERE code = :code FOR UPDATE'
        : 'SELECT state_json FROM prebeta_rooms WHERE code = :code';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':code' => $code]);
    $row = $stmt->fetch();
    if (!is_array($row)) {
        return null;
    }
    $decoded = json_decode((string)$row['state_json'], true);
    return is_array($decoded) ? $decoded : null;
}

function pbSaveRoom(PDO $pdo, array $room, int $now, bool $isNew = false): void {
    $json = json_encode($room, JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return;
    }
    if ($isNew) {
        $ins = $pdo->prepare(
            'INSERT INTO prebeta_rooms (code, host_client_id, created_at, updated_at, state_json)
             VALUES (:code, :host_cid, :created_at, :updated_at, :state_json)'
        );
        $ins->execute([
            ':code' => (string)$room['code'],
            ':host_cid' => (string)$room['hostClientId'],
            ':created_at' => (int)$room['createdAt'],
            ':updated_at' => $now,
            ':state_json' => $json,
        ]);
        return;
    }
    $upd = $pdo->prepare(
        'UPDATE prebeta_rooms SET updated_at = :updated_at, state_json = :state_json WHERE code = :code'
    );
    $upd->execute([
        ':updated_at' => $now,
        ':state_json' => $json,
        ':code' => (string)$room['code'],
    ]);
}

function pbEnqueueSignal(PDO $pdo, string $roomCode, string $toPeerId, string $fromPeerId, string $signalType, $payload, int $now): void {
    $payloadJson = $payload !== null ? json_encode($payload, JSON_UNESCAPED_UNICODE) : null;
    $ins = $pdo->prepare(
        'INSERT INTO prebeta_signals (room_code, to_peer_id, from_peer_id, signal_type, payload_json, created_at)
         VALUES (:code, :to_peer, :from_peer, :stype, :pjson, :created_at)'
    );
    $ins->execute([
        ':code' => $roomCode,
        ':to_peer' => $toPeerId,
        ':from_peer' => $fromPeerId,
        ':stype' => $signalType,
        ':pjson' => $payloadJson,
        ':created_at' => $now,
    ]);

    $cntStmt = $pdo->prepare('SELECT COUNT(*) FROM prebeta_signals WHERE to_peer_id = :to_peer');
    $cntStmt->execute([':to_peer' => $toPeerId]);
    $cnt = (int)$cntStmt->fetchColumn();
    if ($cnt > PRE_BETA_SIGNAL_MAX_PER_PEER) {
        $overflow = $cnt - PRE_BETA_SIGNAL_MAX_PER_PEER;
        $oldStmt = $pdo->prepare(
            "SELECT id FROM prebeta_signals WHERE to_peer_id = :to_peer AND signal_type = 'audio' ORDER BY id ASC LIMIT " . (int)$overflow
        );
        $oldStmt->execute([':to_peer' => $toPeerId]);
        $ids = $oldStmt->fetchAll(PDO::FETCH_COLUMN);
        if (count($ids) > 0) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $pdo->prepare("DELETE FROM prebeta_signals WHERE id IN ({$placeholders})")->execute($ids);
        }
    }
}

function pbDequeueSignals(PDO $pdo, string $peerId): array {
    $stmt = $pdo->prepare(
        'SELECT id, from_peer_id, signal_type, payload_json FROM prebeta_signals WHERE to_peer_id = :peer ORDER BY id ASC'
    );
    $stmt->execute([':peer' => $peerId]);
    $rows = $stmt->fetchAll();
    if (count($rows) === 0) {
        return [];
    }
    $maxId = (int)$rows[count($rows) - 1]['id'];
    $pdo->prepare('DELETE FROM prebeta_signals WHERE to_peer_id = :peer AND id <= :max_id')
        ->execute([':peer' => $peerId, ':max_id' => $maxId]);

    $signals = [];
    foreach ($rows as $row) {
        $payload = $row['payload_json'] !== null ? json_decode((string)$row['payload_json'], true) : null;
        $signals[] = [
            'signalType' => (string)$row['signal_type'],
            'fromPeerId' => (string)$row['from_peer_id'],
            'payload' => $payload,
        ];
    }
    return $signals;
}

function pbPruneRoomParticipants(PDO $pdo, array &$room, int $now): bool {
    $kept = [];
    $changed = false;
    foreach (($room['participants'] ?? []) as $p) {
        $cid = (string)($p['clientId'] ?? '');
        $lastSeen = (int)($p['lastSeenAt'] ?? $now);
        $peerRemaining = $cid !== '' ? pbGetClientRoomRemainingMs($room, $cid, $now) : 0;

        if ($peerRemaining <= 0) {
            $changed = true;
            if ($cid !== '') {
                $t =& pbEnsureClientTimer($room, $cid);
                $t['remainingMs'] = 0;
                $t['runningSince'] = null;
                unset($t);
            }
            $pdo->prepare('DELETE FROM prebeta_signals WHERE to_peer_id = :peer')->execute([':peer' => (string)$p['peerId']]);
            continue;
        }

        if ($now - $lastSeen > PRE_BETA_HTTP_IDLE_MS) {
            $changed = true;
            if ($cid !== '') {
                pbPauseClientTimer($room, $cid, $now);
            }
            $pdo->prepare('DELETE FROM prebeta_signals WHERE to_peer_id = :peer')->execute([':peer' => (string)$p['peerId']]);
            $leftStr = $cid !== '' ? pbFormatMs(pbGetClientRoomRemainingMs($room, $cid, $now)) : '00:00';
            $room['messages'][] = [
                'id' => 'sys-idle-' . $now . '-' . $p['peerId'],
                'authorPeerId' => 'system',
                'authorNick' => 'PRE-BETA ЯДРО',
                'text' => $p['nick'] . " отключился (таймаут). Таймер остановлен на {$leftStr}.",
                'timestamp' => $now,
                'system' => true,
            ];
        } else {
            $kept[] = $p;
        }
    }
    if ($changed) {
        $room['participants'] = $kept;
        $room['messages'] = array_slice($room['messages'], -PRE_BETA_MAX_MESSAGES);
        pbSyncHostQuotaDb($pdo, $room, $now);
    }
    return $changed;
}

$action = (string)($_GET['action'] ?? '');
$input = gkReadJsonInput();
if ($action === '' && isset($input['action'])) {
    $action = (string)$input['action'];
}
if ($action === '' && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $action = 'status';
}

try {
    $pdo = gkDb();
} catch (Throwable $e) {
    gkRespondJson(500, ['ok' => false, 'message' => 'Ошибка базы данных pre-beta комнат: ' . $e->getMessage()]);
}

$now = gkNowMs();

try {
    gkDbBegin($pdo);

    // Light periodic cleanup of expired signals
    $pdo->prepare('DELETE FROM prebeta_signals WHERE created_at < :cutoff')
        ->execute([':cutoff' => $now - PRE_BETA_SIGNAL_TTL_MS]);

    if ($action === 'status') {
        $clientId = pbSanitizeClientId((string)($_GET['clientId'] ?? ($input['clientId'] ?? '')));
        $iceServers = gkResolveIceServers();
        if ($clientId === '') {
            gkDbCommit($pdo);
            gkRespondJson(200, [
                'ok' => true,
                'status' => 'AVAILABLE',
                'code' => null,
                'expiresAt' => null,
                'remainingMs' => PRE_BETA_DURATION_MS,
                'paused' => true,
                'iceServers' => $iceServers,
            ]);
        }
        $rec = pbLoadQuota($pdo, $clientId);
        if ($rec === null) {
            gkDbCommit($pdo);
            gkRespondJson(200, [
                'ok' => true,
                'status' => 'AVAILABLE',
                'code' => null,
                'expiresAt' => null,
                'remainingMs' => PRE_BETA_DURATION_MS,
                'paused' => true,
                'iceServers' => $iceServers,
            ]);
        }
        $code = (string)$rec['issued_code'];
        $room = pbLoadRoom($pdo, $code);
        if ($room !== null && pbPruneRoomParticipants($pdo, $room, $now)) {
            pbSaveRoom($pdo, $room, $now, false);
        }
        $remaining = $room !== null ? pbGetClientRoomRemainingMs($room, $clientId, $now) : max(0, (int)$rec['remaining_ms']);
        $paused = $room !== null ? pbIsClientTimerPaused($room, $clientId) : true;
        gkDbCommit($pdo);

        if ($remaining <= 0) {
            gkRespondJson(200, [
                'ok' => true,
                'status' => 'EXHAUSTED',
                'code' => $code,
                'expiresAt' => null,
                'remainingMs' => 0,
                'paused' => false,
                'iceServers' => $iceServers,
            ]);
        }
        gkRespondJson(200, [
            'ok' => true,
            'status' => 'ACTIVE',
            'code' => $code,
            'expiresAt' => !$paused ? $now + $remaining : null,
            'remainingMs' => $remaining,
            'paused' => $paused,
            'iceServers' => $iceServers,
        ]);
    }

    if ($action === 'issue') {
        $clientId = pbSanitizeClientId((string)($input['clientId'] ?? ''));
        if ($clientId === '') {
            gkDbCommit($pdo);
            gkRespondJson(400, [
                'ok' => false,
                'reason' => 'INVALID_CLIENT',
                'message' => 'Некорректный идентификатор устройства.',
                'remainingMs' => 0,
            ]);
        }

        $rec = pbLoadQuota($pdo, $clientId);
        if ($rec !== null) {
            $code = (string)$rec['issued_code'];
            $room = pbLoadRoom($pdo, $code);
            if ($room !== null && pbPruneRoomParticipants($pdo, $room, $now)) {
                pbSaveRoom($pdo, $room, $now, false);
            }
            $remaining = $room !== null ? pbGetClientRoomRemainingMs($room, $clientId, $now) : max(0, (int)$rec['remaining_ms']);
            $paused = $room !== null ? pbIsClientTimerPaused($room, $clientId) : true;
            gkDbCommit($pdo);
            if ($remaining <= 0) {
                gkRespondJson(403, [
                    'ok' => false,
                    'reason' => 'QUOTA_EXHAUSTED',
                    'message' => '30-минутный pre-beta лимит до релиза полностью исчерпан для этого устройства.',
                    'remainingMs' => 0,
                ]);
            }
            gkRespondJson(200, [
                'ok' => true,
                'alreadyIssued' => true,
                'code' => $code,
                'createdAt' => (int)$rec['created_at'],
                'expiresAt' => !$paused ? $now + $remaining : null,
                'remainingMs' => $remaining,
                'paused' => $paused,
            ]);
        }

        $alphaLen = strlen(PRE_BETA_ALPHABET);
        $code = '';
        $chkStmt = $pdo->prepare('SELECT code FROM prebeta_rooms WHERE code = :code');
        for ($attempt = 0; $attempt < 64; $attempt++) {
            $p1 = '';
            $p2 = '';
            for ($i = 0; $i < 4; $i++) {
                $p1 .= PRE_BETA_ALPHABET[random_int(0, $alphaLen - 1)];
                $p2 .= PRE_BETA_ALPHABET[random_int(0, $alphaLen - 1)];
            }
            $cand = "GK-{$p1}-{$p2}";
            $chkStmt->execute([':code' => $cand]);
            if (!$chkStmt->fetch()) {
                $code = $cand;
                break;
            }
        }
        if ($code === '') {
            gkDbRollback($pdo);
            gkRespondJson(500, ['ok' => false, 'message' => 'Не удалось сгенерировать уникальный код.']);
        }

        $insQ = $pdo->prepare(
            'INSERT INTO prebeta_quotas (client_id, issued_code, created_at, remaining_ms, expires_at)
             VALUES (:cid, :code, :created_at, :rem, NULL)'
        );
        $insQ->execute([
            ':cid' => $clientId,
            ':code' => $code,
            ':created_at' => $now,
            ':rem' => PRE_BETA_DURATION_MS,
        ]);

        $newRoom = [
            'code' => $code,
            'hostClientId' => $clientId,
            'createdAt' => $now,
            'remainingMs' => PRE_BETA_DURATION_MS,
            'timerRunningSince' => null,
            'expiresAt' => null,
            'timersByClientId' => [
                $clientId => [
                    'remainingMs' => PRE_BETA_DURATION_MS,
                    'runningSince' => null,
                ],
            ],
            'participants' => [],
            'messages' => [
                [
                    'id' => 'sys-create-' . $now,
                    'authorPeerId' => 'system',
                    'authorNick' => 'PRE-BETA ЯДРО',
                    'text' => 'Создан приватный канал 1-на-1. Лимит: 30:00 (время каждого участника останавливается при выходе).',
                    'timestamp' => $now,
                    'system' => true,
                ],
            ],
        ];
        pbSaveRoom($pdo, $newRoom, $now, true);
        gkDbCommit($pdo);

        gkRespondJson(200, [
            'ok' => true,
            'alreadyIssued' => false,
            'code' => $code,
            'createdAt' => $now,
            'expiresAt' => null,
            'remainingMs' => PRE_BETA_DURATION_MS,
            'paused' => true,
        ]);
    }

    if ($action === 'join') {
        $clientId = pbSanitizeClientId((string)($input['clientId'] ?? ''));
        $code = pbNormalizeCode((string)($input['code'] ?? ''));
        if ($clientId === '') {
            gkDbCommit($pdo);
            gkRespondJson(400, ['ok' => false, 'reason' => 'INVALID_CLIENT', 'message' => 'Некорректный идентификатор сессии клиента.']);
        }
        if ($code === '') {
            gkDbCommit($pdo);
            gkRespondJson(400, ['ok' => false, 'reason' => 'INVALID_CODE', 'message' => 'Введите корректный код формата GK-XXXX-XXXX.']);
        }
        $room = pbLoadRoom($pdo, $code);
        if ($room === null) {
            gkDbCommit($pdo);
            gkRespondJson(404, ['ok' => false, 'reason' => 'ROOM_NOT_FOUND', 'message' => 'Комната с таким кодом не найдена.']);
        }

        pbPruneRoomParticipants($pdo, $room, $now);

        $hasOwnTimer = isset($room['timersByClientId'][$clientId]);
        if (!$hasOwnTimer && pbGetClientRoomRemainingMs($room, (string)$room['hostClientId'], $now) <= 0) {
            pbSaveRoom($pdo, $room, $now, false);
            gkDbCommit($pdo);
            gkRespondJson(409, ['ok' => false, 'reason' => 'ROOM_EXPIRED', 'message' => 'Время pre-beta сессии (30 минут) для этого диалога истекло.']);
        }

        $clientRemaining = pbGetClientRoomRemainingMs($room, $clientId, $now);
        if ($clientRemaining <= 0) {
            $t =& pbEnsureClientTimer($room, $clientId);
            $t['remainingMs'] = 0;
            $t['runningSince'] = null;
            unset($t);
            pbSyncHostQuotaDb($pdo, $room, $now);
            pbSaveRoom($pdo, $room, $now, false);
            gkDbCommit($pdo);
            gkRespondJson(409, ['ok' => false, 'reason' => 'ROOM_EXPIRED', 'message' => 'Ваше время pre-beta сессии (30 минут) истекло до релиза.']);
        }

        $rawPeerId = isset($input['peerId']) ? trim((string)$input['peerId']) : '';
        $peerId = strlen($rawPeerId) >= 8
            ? substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $rawPeerId) ?? '', 0, 64)
            : '';
        if (strlen($peerId) < 8) {
            $peerId = bin2hex(random_bytes(16));
        }

        $existingIdx = -1;
        foreach ($room['participants'] as $idx => $p) {
            if ($p['peerId'] === $peerId || $p['clientId'] === $clientId) {
                $existingIdx = $idx;
                break;
            }
        }
        if ($existingIdx === -1 && count($room['participants']) >= PRE_BETA_MAX_PARTICIPANTS) {
            pbSaveRoom($pdo, $room, $now, false);
            gkDbCommit($pdo);
            gkRespondJson(409, ['ok' => false, 'reason' => 'ROOM_FULL', 'message' => 'Комната заполнена: в одном диалоге максимум 2 участника (2/2).']);
        }

        $isHost = $clientId === $room['hostClientId'];
        $nick = pbSanitizeNick((string)($input['nick'] ?? ''), $isHost ? 'Создатель' : 'Собеседник');
        $peer = [
            'peerId' => $peerId,
            'clientId' => $clientId,
            'nick' => $nick,
            'joinedAt' => $now,
            'micMuted' => false,
            'hasAudio' => !empty($input['hasAudio']),
            'lastSeenAt' => $now,
        ];

        if ($existingIdx >= 0) {
            $room['participants'][$existingIdx] = $peer;
        } else {
            $room['participants'][] = $peer;
        }

        $timerBefore =& pbEnsureClientTimer($room, $clientId);
        $wasPausedWithPrior = (($timerBefore['runningSince'] ?? null) === null) && ((int)$timerBefore['remainingMs'] < PRE_BETA_DURATION_MS);
        unset($timerBefore);

        pbResumeClientTimer($room, $clientId, $now);
        pbSyncHostQuotaDb($pdo, $room, $now);

        if ($existingIdx === -1) {
            $leftStr = pbFormatMs(pbGetClientRoomRemainingMs($room, $clientId, $now));
            $suffix = $wasPausedWithPrior ? " Таймер продолжен с {$leftStr}." : '';
            $room['messages'][] = [
                'id' => 'sys-join-' . $now . '-' . $peerId,
                'authorPeerId' => 'system',
                'authorNick' => 'PRE-BETA ЯДРО',
                'text' => "{$nick} подключился к диалогу (" . count($room['participants']) . '/' . PRE_BETA_MAX_PARTICIPANTS . ").{$suffix}",
                'timestamp' => $now,
                'system' => true,
            ];
            $room['messages'] = array_slice($room['messages'], -PRE_BETA_MAX_MESSAGES);
        }

        if (count($room['participants']) === 2) {
            $firstPeerId = (string)$room['participants'][0]['peerId'];
            $secondPeerId = (string)$room['participants'][1]['peerId'];
            pbEnqueueSignal($pdo, $code, $firstPeerId, $secondPeerId, 'initiate', ['targetPeerId' => $secondPeerId], $now);
        }

        pbSaveRoom($pdo, $room, $now, false);
        $snapshot = pbBuildSnapshot($room, $now, $clientId);
        gkDbCommit($pdo);

        gkRespondJson(200, [
            'ok' => true,
            'peerId' => $peerId,
            'snapshot' => $snapshot,
            'iceServers' => gkResolveIceServers(),
        ]);
    }

    if ($action === 'poll') {
        $code = pbNormalizeCode((string)($input['code'] ?? ''));
        $peerId = (string)($input['peerId'] ?? '');
        $room = $code !== '' ? pbLoadRoom($pdo, $code) : null;
        if ($room === null || $peerId === '') {
            gkDbCommit($pdo);
            gkRespondJson(404, ['ok' => false, 'reason' => 'ROOM_NOT_FOUND', 'message' => 'Комната не найдена.']);
        }

        pbPruneRoomParticipants($pdo, $room, $now);

        $foundClientId = '';
        foreach ($room['participants'] as &$p) {
            if ($p['peerId'] === $peerId) {
                $foundClientId = (string)($p['clientId'] ?? '');
                if ($foundClientId !== '' && pbGetClientRoomRemainingMs($room, $foundClientId, $now) <= 0) {
                    pbSaveRoom($pdo, $room, $now, false);
                    gkDbCommit($pdo);
                    gkRespondJson(410, ['ok' => false, 'reason' => 'ROOM_EXPIRED', 'message' => '30-минутный pre-beta лимит до релиза истёк. Связь завершена.']);
                }
                $p['lastSeenAt'] = $now;
                break;
            }
        }
        unset($p);

        if ($foundClientId === '') {
            pbSaveRoom($pdo, $room, $now, false);
            gkDbCommit($pdo);
            gkRespondJson(409, ['ok' => false, 'reason' => 'NOT_IN_ROOM', 'message' => 'Сессия участника завершена.']);
        }

        pbSaveRoom($pdo, $room, $now, false);
        $signals = pbDequeueSignals($pdo, $peerId);
        $snapshot = pbBuildSnapshot($room, $now, $foundClientId);
        gkDbCommit($pdo);

        gkRespondJson(200, [
            'ok' => true,
            'snapshot' => $snapshot,
            'signals' => $signals,
        ]);
    }

    if ($action === 'send') {
        $code = pbNormalizeCode((string)($input['code'] ?? ''));
        $peerId = (string)($input['peerId'] ?? '');
        $text = gkUtf8Substr(trim((string)($input['text'] ?? '')), 0, 500);
        $room = $code !== '' ? pbLoadRoom($pdo, $code) : null;
        if ($room === null) {
            gkDbCommit($pdo);
            gkRespondJson(404, ['ok' => false, 'reason' => 'ROOM_NOT_FOUND', 'message' => 'Комната не найдена.']);
        }

        pbPruneRoomParticipants($pdo, $room, $now);

        $nick = '';
        $cid = '';
        foreach ($room['participants'] as &$p) {
            if ($p['peerId'] === $peerId) {
                $p['lastSeenAt'] = $now;
                $nick = (string)$p['nick'];
                $cid = (string)($p['clientId'] ?? '');
                break;
            }
        }
        unset($p);

        if ($nick === '' || $cid === '') {
            pbSaveRoom($pdo, $room, $now, false);
            gkDbCommit($pdo);
            gkRespondJson(409, ['ok' => false, 'reason' => 'NOT_IN_ROOM', 'message' => 'Вы не подключены к комнате.']);
        }
        if (pbGetClientRoomRemainingMs($room, $cid, $now) <= 0) {
            pbSaveRoom($pdo, $room, $now, false);
            gkDbCommit($pdo);
            gkRespondJson(410, ['ok' => false, 'reason' => 'ROOM_EXPIRED', 'message' => '30-минутный лимит pre-beta сессии истёк.']);
        }
        if ($text === '') {
            pbSaveRoom($pdo, $room, $now, false);
            gkDbCommit($pdo);
            gkRespondJson(400, ['ok' => false, 'reason' => 'EMPTY', 'message' => 'Пустое сообщение.']);
        }

        $msg = [
            'id' => 'msg-' . $now . '-' . bin2hex(random_bytes(3)),
            'authorPeerId' => $peerId,
            'authorNick' => $nick,
            'text' => $text,
            'timestamp' => $now,
        ];
        $room['messages'][] = $msg;
        $room['messages'] = array_slice($room['messages'], -PRE_BETA_MAX_MESSAGES);
        pbSaveRoom($pdo, $room, $now, false);
        gkDbCommit($pdo);

        gkRespondJson(200, ['ok' => true, 'message' => $msg]);
    }

    if ($action === 'leave') {
        $code = pbNormalizeCode((string)($input['code'] ?? ''));
        $peerId = (string)($input['peerId'] ?? '');
        if ($peerId !== '') {
            $pdo->prepare('DELETE FROM prebeta_signals WHERE to_peer_id = :peer')->execute([':peer' => $peerId]);
        }
        $room = $code !== '' ? pbLoadRoom($pdo, $code) : null;
        if ($room !== null) {
            $kept = [];
            $removed = null;
            foreach ($room['participants'] as $p) {
                if ($p['peerId'] === $peerId) {
                    $removed = $p;
                } else {
                    $kept[] = $p;
                }
            }
            $room['participants'] = $kept;
            $viewerClientId = (string)($room['hostClientId'] ?? '');
            if ($removed !== null) {
                $remCid = (string)($removed['clientId'] ?? '');
                if ($remCid !== '') {
                    pbPauseClientTimer($room, $remCid, $now);
                    $viewerClientId = $remCid;
                }
                pbSyncHostQuotaDb($pdo, $room, $now);
                $leftStr = $remCid !== '' ? pbFormatMs(pbGetClientRoomRemainingMs($room, $remCid, $now)) : '00:00';
                $pauseText = count($kept) > 0
                    ? " Таймер {$removed['nick']} остановлен на {$leftStr}; у собеседника отсчёт продолжается."
                    : " Время остановлено на {$leftStr} до повторного входа.";
                $room['messages'][] = [
                    'id' => 'sys-leave-' . $now . '-' . $peerId,
                    'authorPeerId' => 'system',
                    'authorNick' => 'PRE-BETA ЯДРО',
                    'text' => "{$removed['nick']} вышел из диалога (" . count($kept) . '/' . PRE_BETA_MAX_PARTICIPANTS . ").{$pauseText}",
                    'timestamp' => $now,
                    'system' => true,
                ];
                $room['messages'] = array_slice($room['messages'], -PRE_BETA_MAX_MESSAGES);
            }
            pbSaveRoom($pdo, $room, $now, false);
            $snapshot = pbBuildSnapshot($room, $now, $viewerClientId);
            gkDbCommit($pdo);
            gkRespondJson(200, ['ok' => true, 'snapshot' => $snapshot]);
        }
        gkDbCommit($pdo);
        gkRespondJson(200, ['ok' => true]);
    }

    if ($action === 'peer') {
        $code = pbNormalizeCode((string)($input['code'] ?? ''));
        $peerId = (string)($input['peerId'] ?? '');
        $room = $code !== '' ? pbLoadRoom($pdo, $code) : null;
        if ($room === null) {
            gkDbCommit($pdo);
            gkRespondJson(404, ['ok' => false]);
        }
        $viewerCid = '';
        foreach ($room['participants'] as &$p) {
            if ($p['peerId'] === $peerId) {
                $p['lastSeenAt'] = $now;
                $viewerCid = (string)($p['clientId'] ?? '');
                if (array_key_exists('micMuted', $input)) {
                    $p['micMuted'] = (bool)$input['micMuted'];
                }
                if (array_key_exists('hasAudio', $input)) {
                    $p['hasAudio'] = (bool)$input['hasAudio'];
                }
                break;
            }
        }
        unset($p);
        pbSaveRoom($pdo, $room, $now, false);
        $snapshot = pbBuildSnapshot($room, $now, $viewerCid);
        gkDbCommit($pdo);
        gkRespondJson(200, ['ok' => true, 'snapshot' => $snapshot]);
    }

    if ($action === 'signal') {
        $code = pbNormalizeCode((string)($input['code'] ?? ''));
        $peerId = (string)($input['peerId'] ?? '');
        $signalType = (string)($input['signalType'] ?? '');
        $room = $code !== '' ? pbLoadRoom($pdo, $code) : null;
        if ($room === null) {
            gkDbCommit($pdo);
            gkRespondJson(404, ['ok' => false]);
        }
        $senderCid = '';
        foreach ($room['participants'] as &$p) {
            if ($p['peerId'] === $peerId) {
                $senderCid = (string)($p['clientId'] ?? '');
                $p['lastSeenAt'] = $now;
                break;
            }
        }
        unset($p);
        if ($senderCid === '' || pbGetClientRoomRemainingMs($room, $senderCid, $now) <= 0) {
            gkDbCommit($pdo);
            gkRespondJson(410, ['ok' => false, 'reason' => 'ROOM_EXPIRED']);
        }
        if ($signalType !== 'offer' && $signalType !== 'answer' && $signalType !== 'ice' && $signalType !== 'audio') {
            gkDbCommit($pdo);
            gkRespondJson(400, ['ok' => false]);
        }
        $payload = $input['payload'] ?? null;
        if ($signalType === 'audio') {
            if (!is_array($payload) || !isset($payload['data']) || !is_string($payload['data']) || strlen($payload['data']) > 32768) {
                gkDbCommit($pdo);
                gkRespondJson(400, ['ok' => false]);
            }
            $sr = isset($payload['sr']) && is_numeric($payload['sr']) ? (int)$payload['sr'] : 16000;
            $payload = [
                'sr' => ($sr >= 8000 && $sr <= 48000) ? $sr : 16000,
                'data' => $payload['data'],
            ];
        }
        foreach ($room['participants'] as $p) {
            if ($p['peerId'] !== $peerId) {
                pbEnqueueSignal($pdo, $code, (string)$p['peerId'], $peerId, $signalType, $payload, $now);
            }
        }
        pbSaveRoom($pdo, $room, $now, false);
        gkDbCommit($pdo);
        gkRespondJson(200, ['ok' => true]);
    }

    gkDbCommit($pdo);
    gkRespondJson(400, ['ok' => false, 'message' => 'Неизвестное действие prebeta API.']);
} catch (Throwable $e) {
    gkDbRollback($pdo);
    gkRespondJson(500, ['ok' => false, 'message' => 'Внутренняя ошибка prebeta API.']);
}

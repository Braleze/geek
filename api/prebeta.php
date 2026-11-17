<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

const PRE_BETA_DURATION_MS = 1800000;
const PRE_BETA_MAX_PARTICIPANTS = 2;
const PRE_BETA_MAX_MESSAGES = 80;
const PRE_BETA_HTTP_IDLE_MS = 18000;
const PRE_BETA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function nowMs(): int {
    return (int)round(microtime(true) * 1000);
}

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function readJsonInput(): array {
    $raw = file_get_contents('php://input');
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }
    return $_POST ?: [];
}

function sanitizeClientId(string $raw): string {
    $cleaned = preg_replace('/[^a-zA-Z0-9_-]/', '', trim($raw)) ?? '';
    if (strlen($cleaned) < 6 || strlen($cleaned) > 64) {
        return '';
    }
    return $cleaned;
}

function normalizeCode(string $raw): string {
    $cleaned = preg_replace('/[^A-Z0-9]/', '', strtoupper($raw)) ?? '';
    $body = strpos($cleaned, 'GK') === 0 ? substr($cleaned, 2) : $cleaned;
    if (strlen($body) !== 8) {
        return '';
    }
    return 'GK-' . substr($body, 0, 4) . '-' . substr($body, 4, 4);
}

function sanitizeNick(string $raw, string $fallback): string {
    $cleaned = trim(preg_replace('/\s+/', ' ', $raw) ?? '');
    if ($cleaned === '') {
        return $fallback;
    }
    return function_exists('mb_substr') ? mb_substr($cleaned, 0, 22, 'UTF-8') : substr($cleaned, 0, 22);
}

function formatMs(int $ms): string {
    $secs = max(0, (int)ceil($ms / 1000));
    $m = intdiv($secs, 60);
    $s = $secs % 60;
    return sprintf('%02d:%02d', $m, $s);
}

function getRoomRemainingMs(array $room, int $now): int {
    $base = max(0, (int)($room['remainingMs'] ?? 0));
    $since = $room['timerRunningSince'] ?? null;
    if ($since === null) {
        return $base;
    }
    $elapsed = max(0, $now - (int)$since);
    return max(0, $base - $elapsed);
}

function pauseRoomTimer(array &$room, int $now): bool {
    $left = getRoomRemainingMs($room, $now);
    $room['remainingMs'] = $left;
    $room['expiresAt'] = null;
    if (($room['timerRunningSince'] ?? null) !== null) {
        $room['timerRunningSince'] = null;
        return true;
    }
    return false;
}

function resumeRoomTimer(array &$room, int $now): bool {
    $left = getRoomRemainingMs($room, $now);
    if ($left <= 0) {
        $room['remainingMs'] = 0;
        $room['timerRunningSince'] = null;
        $room['expiresAt'] = null;
        return false;
    }
    if (($room['timerRunningSince'] ?? null) === null) {
        $room['remainingMs'] = $left;
        $room['timerRunningSince'] = $now;
        $room['expiresAt'] = $now + $left;
        return true;
    }
    return false;
}

function syncHostQuota(array &$store, array $room, int $now): void {
    $hostId = $room['hostClientId'] ?? '';
    if ($hostId !== '' && isset($store['quotasByClientId'][$hostId])) {
        $left = getRoomRemainingMs($room, $now);
        $store['quotasByClientId'][$hostId]['remainingMs'] = $left;
        $store['quotasByClientId'][$hostId]['expiresAt'] =
            ($room['timerRunningSince'] ?? null) !== null && $left > 0 ? $now + $left : null;
    }
}

function buildSnapshot(array $room, int $now): array {
    $remaining = getRoomRemainingMs($room, $now);
    $paused = ($room['timerRunningSince'] ?? null) === null;
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

function pruneAndExpireRooms(array &$store, int $now): void {
    foreach ($store['rooms'] as $code => &$room) {
        $kept = [];
        $removedAny = false;
        foreach (($room['participants'] ?? []) as $p) {
            $lastSeen = (int)($p['lastSeenAt'] ?? $now);
            if ($now - $lastSeen > PRE_BETA_HTTP_IDLE_MS) {
                $removedAny = true;
                unset($store['signalsByPeerId'][$p['peerId']]);
                $room['messages'][] = [
                    'id' => 'sys-idle-' . $now . '-' . $p['peerId'],
                    'authorPeerId' => 'system',
                    'authorNick' => 'PRE-BETA ЯДРО',
                    'text' => $p['nick'] . ' отключился (таймаут).',
                    'timestamp' => $now,
                    'system' => true,
                ];
            } else {
                $kept[] = $p;
            }
        }
        if ($removedAny) {
            $room['participants'] = $kept;
            if (count($kept) === 0) {
                pauseRoomTimer($room, $now);
                $leftStr = formatMs(getRoomRemainingMs($room, $now));
                $room['messages'][] = [
                    'id' => 'sys-pause-' . $now,
                    'authorPeerId' => 'system',
                    'authorNick' => 'PRE-BETA ЯДРО',
                    'text' => "Участники вышли — время остановлено на {$leftStr} до повторного входа.",
                    'timestamp' => $now,
                    'system' => true,
                ];
            }
            $room['messages'] = array_slice($room['messages'], -PRE_BETA_MAX_MESSAGES);
            syncHostQuota($store, $room, $now);
        }

        if (getRoomRemainingMs($room, $now) <= 0) {
            $room['remainingMs'] = 0;
            $room['timerRunningSince'] = null;
            $room['expiresAt'] = null;
            $room['participants'] = [];
            syncHostQuota($store, $room, $now);
        }
    }
    unset($room);
}

$statePath = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'geek_prebeta_state_v2.json';
$fp = @fopen($statePath, 'c+');
if ($fp === false) {
    respond(500, ['ok' => false, 'message' => 'Не удалось открыть хранилище pre-beta комнат.']);
}

if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    respond(500, ['ok' => false, 'message' => 'Ошибка блокировки хранилища.']);
}

$rawStore = stream_get_contents($fp);
$store = is_string($rawStore) && $rawStore !== '' ? json_decode($rawStore, true) : null;
if (!is_array($store)) {
    $store = ['rooms' => [], 'quotasByClientId' => [], 'signalsByPeerId' => []];
}
$store['rooms'] = $store['rooms'] ?? [];
$store['quotasByClientId'] = $store['quotasByClientId'] ?? [];
$store['signalsByPeerId'] = $store['signalsByPeerId'] ?? [];

$now = nowMs();
pruneAndExpireRooms($store, $now);

$action = (string)($_GET['action'] ?? '');
$input = readJsonInput();
if ($action === '' && isset($input['action'])) {
    $action = (string)$input['action'];
}

$saveAndRespond = function (int $status, array $payload) use ($fp, &$store): void {
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($store, JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    respond($status, $payload);
};

if ($action === 'status') {
    $clientId = sanitizeClientId((string)($_GET['clientId'] ?? ($input['clientId'] ?? '')));
    if ($clientId === '' || !isset($store['quotasByClientId'][$clientId])) {
        $saveAndRespond(200, [
            'ok' => true,
            'status' => 'AVAILABLE',
            'code' => null,
            'expiresAt' => null,
            'remainingMs' => PRE_BETA_DURATION_MS,
            'paused' => true,
        ]);
    }
    $rec = $store['quotasByClientId'][$clientId];
    $code = $rec['issuedCode'];
    $room = $store['rooms'][$code] ?? null;
    $remaining = $room ? getRoomRemainingMs($room, $now) : max(0, (int)($rec['remainingMs'] ?? 0));
    $paused = $room ? (($room['timerRunningSince'] ?? null) === null) : true;
    if ($remaining <= 0) {
        $saveAndRespond(200, [
            'ok' => true,
            'status' => 'EXHAUSTED',
            'code' => $code,
            'expiresAt' => null,
            'remainingMs' => 0,
            'paused' => false,
        ]);
    }
    $saveAndRespond(200, [
        'ok' => true,
        'status' => 'ACTIVE',
        'code' => $code,
        'expiresAt' => !$paused ? $now + $remaining : null,
        'remainingMs' => $remaining,
        'paused' => $paused,
    ]);
}

if ($action === 'issue') {
    $clientId = sanitizeClientId((string)($input['clientId'] ?? ''));
    if ($clientId === '') {
        $saveAndRespond(400, [
            'ok' => false,
            'reason' => 'INVALID_CLIENT',
            'message' => 'Некорректный идентификатор устройства.',
            'remainingMs' => 0,
        ]);
    }
    if (isset($store['quotasByClientId'][$clientId])) {
        $rec = $store['quotasByClientId'][$clientId];
        $code = $rec['issuedCode'];
        $room = $store['rooms'][$code] ?? null;
        $remaining = $room ? getRoomRemainingMs($room, $now) : max(0, (int)($rec['remainingMs'] ?? 0));
        $paused = $room ? (($room['timerRunningSince'] ?? null) === null) : true;
        if ($remaining <= 0) {
            $saveAndRespond(403, [
                'ok' => false,
                'reason' => 'QUOTA_EXHAUSTED',
                'message' => '30-минутный pre-beta лимит до релиза полностью исчерпан для этого устройства.',
                'remainingMs' => 0,
            ]);
        }
        $saveAndRespond(200, [
            'ok' => true,
            'alreadyIssued' => true,
            'code' => $code,
            'createdAt' => (int)$rec['createdAt'],
            'expiresAt' => !$paused ? $now + $remaining : null,
            'remainingMs' => $remaining,
            'paused' => $paused,
        ]);
    }

    $alphaLen = strlen(PRE_BETA_ALPHABET);
    $code = '';
    for ($attempt = 0; $attempt < 64; $attempt++) {
        $p1 = '';
        $p2 = '';
        for ($i = 0; $i < 4; $i++) {
            $p1 .= PRE_BETA_ALPHABET[random_int(0, $alphaLen - 1)];
            $p2 .= PRE_BETA_ALPHABET[random_int(0, $alphaLen - 1)];
        }
        $cand = "GK-{$p1}-{$p2}";
        if (!isset($store['rooms'][$cand])) {
            $code = $cand;
            break;
        }
    }
    if ($code === '') {
        $saveAndRespond(500, ['ok' => false, 'message' => 'Не удалось сгенерировать уникальный код.']);
    }

    $store['quotasByClientId'][$clientId] = [
        'clientId' => $clientId,
        'issuedCode' => $code,
        'createdAt' => $now,
        'remainingMs' => PRE_BETA_DURATION_MS,
        'expiresAt' => null,
    ];
    $store['rooms'][$code] = [
        'code' => $code,
        'hostClientId' => $clientId,
        'createdAt' => $now,
        'remainingMs' => PRE_BETA_DURATION_MS,
        'timerRunningSince' => null,
        'expiresAt' => null,
        'participants' => [],
        'messages' => [
            [
                'id' => 'sys-create-' . $now,
                'authorPeerId' => 'system',
                'authorNick' => 'PRE-BETA ЯДРО',
                'text' => 'Создан приватный канал 1-на-1. Лимит: 30:00 (время ставится на паузу, когда в комнате никого нет).',
                'timestamp' => $now,
                'system' => true,
            ],
        ],
    ];

    $saveAndRespond(200, [
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
    $clientId = sanitizeClientId((string)($input['clientId'] ?? ''));
    $code = normalizeCode((string)($input['code'] ?? ''));
    if ($clientId === '') {
        $saveAndRespond(400, ['ok' => false, 'reason' => 'INVALID_CLIENT', 'message' => 'Некорректный идентификатор сессии клиента.']);
    }
    if ($code === '') {
        $saveAndRespond(400, ['ok' => false, 'reason' => 'INVALID_CODE', 'message' => 'Введите корректный код формата GK-XXXX-XXXX.']);
    }
    if (!isset($store['rooms'][$code])) {
        $saveAndRespond(404, ['ok' => false, 'reason' => 'ROOM_NOT_FOUND', 'message' => 'Комната с таким кодом не найдена.']);
    }
    $room =& $store['rooms'][$code];
    if (getRoomRemainingMs($room, $now) <= 0) {
        $saveAndRespond(409, ['ok' => false, 'reason' => 'ROOM_EXPIRED', 'message' => 'Время pre-beta сессии (30 минут) истекло до релиза.']);
    }

    $peerId = isset($input['peerId']) && strlen((string)$input['peerId']) >= 8
        ? substr((string)$input['peerId'], 0, 64)
        : bin2hex(random_bytes(16));

    $existingIdx = -1;
    foreach ($room['participants'] as $idx => $p) {
        if ($p['peerId'] === $peerId || $p['clientId'] === $clientId) {
            $existingIdx = $idx;
            break;
        }
    }
    if ($existingIdx === -1 && count($room['participants']) >= PRE_BETA_MAX_PARTICIPANTS) {
        $saveAndRespond(409, ['ok' => false, 'reason' => 'ROOM_FULL', 'message' => 'Комната заполнена: в одном диалоге максимум 2 участника (2/2).']);
    }

    $isHost = $clientId === $room['hostClientId'];
    $nick = sanitizeNick((string)($input['nick'] ?? ''), $isHost ? 'Создатель' : 'Собеседник');
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

    $wasPausedWithPrior = (($room['timerRunningSince'] ?? null) === null) && ((int)$room['remainingMs'] < PRE_BETA_DURATION_MS);
    resumeRoomTimer($room, $now);
    syncHostQuota($store, $room, $now);

    if ($existingIdx === -1) {
        $leftStr = formatMs(getRoomRemainingMs($room, $now));
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
        $firstPeerId = $room['participants'][0]['peerId'];
        $secondPeerId = $room['participants'][1]['peerId'];
        $store['signalsByPeerId'][$firstPeerId] = $store['signalsByPeerId'][$firstPeerId] ?? [];
        $store['signalsByPeerId'][$firstPeerId][] = [
            'signalType' => 'initiate',
            'fromPeerId' => $secondPeerId,
            'payload' => ['targetPeerId' => $secondPeerId],
        ];
    }

    $snapshot = buildSnapshot($room, $now);
    $saveAndRespond(200, [
        'ok' => true,
        'peerId' => $peerId,
        'snapshot' => $snapshot,
    ]);
}

if ($action === 'poll') {
    $code = normalizeCode((string)($input['code'] ?? ''));
    $peerId = (string)($input['peerId'] ?? '');
    if ($code === '' || $peerId === '' || !isset($store['rooms'][$code])) {
        $saveAndRespond(404, ['ok' => false, 'reason' => 'ROOM_NOT_FOUND', 'message' => 'Комната не найдена.']);
    }
    $room =& $store['rooms'][$code];
    if (getRoomRemainingMs($room, $now) <= 0) {
        $saveAndRespond(410, ['ok' => false, 'reason' => 'ROOM_EXPIRED', 'message' => '30-минутный pre-beta лимит до релиза истёк. Связь завершена.']);
    }
    $found = false;
    foreach ($room['participants'] as &$p) {
        if ($p['peerId'] === $peerId) {
            $p['lastSeenAt'] = $now;
            $found = true;
            break;
        }
    }
    unset($p);
    if (!$found) {
        $saveAndRespond(409, ['ok' => false, 'reason' => 'NOT_IN_ROOM', 'message' => 'Сессия участника завершена.']);
    }
    $signals = $store['signalsByPeerId'][$peerId] ?? [];
    unset($store['signalsByPeerId'][$peerId]);
    $snapshot = buildSnapshot($room, $now);
    $saveAndRespond(200, [
        'ok' => true,
        'snapshot' => $snapshot,
        'signals' => $signals,
    ]);
}

if ($action === 'send') {
    $code = normalizeCode((string)($input['code'] ?? ''));
    $peerId = (string)($input['peerId'] ?? '');
    $text = trim((string)($input['text'] ?? ''));
    $text = function_exists('mb_substr') ? mb_substr($text, 0, 500, 'UTF-8') : substr($text, 0, 500);
    if ($code === '' || !isset($store['rooms'][$code])) {
        $saveAndRespond(404, ['ok' => false, 'reason' => 'ROOM_NOT_FOUND', 'message' => 'Комната не найдена.']);
    }
    $room =& $store['rooms'][$code];
    if (getRoomRemainingMs($room, $now) <= 0) {
        $saveAndRespond(410, ['ok' => false, 'reason' => 'ROOM_EXPIRED', 'message' => '30-минутный лимит pre-beta сессии истёк.']);
    }
    $nick = '';
    foreach ($room['participants'] as &$p) {
        if ($p['peerId'] === $peerId) {
            $p['lastSeenAt'] = $now;
            $nick = (string)$p['nick'];
            break;
        }
    }
    unset($p);
    if ($nick === '') {
        $saveAndRespond(409, ['ok' => false, 'reason' => 'NOT_IN_ROOM', 'message' => 'Вы не подключены к комнате.']);
    }
    if ($text === '') {
        $saveAndRespond(400, ['ok' => false, 'reason' => 'EMPTY', 'message' => 'Пустое сообщение.']);
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
    $saveAndRespond(200, ['ok' => true, 'message' => $msg]);
}

if ($action === 'leave') {
    $code = normalizeCode((string)($input['code'] ?? ''));
    $peerId = (string)($input['peerId'] ?? '');
    unset($store['signalsByPeerId'][$peerId]);
    if ($code !== '' && isset($store['rooms'][$code])) {
        $room =& $store['rooms'][$code];
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
        if ($removed !== null) {
            if (count($kept) === 0) {
                pauseRoomTimer($room, $now);
            }
            syncHostQuota($store, $room, $now);
            $leftStr = formatMs(getRoomRemainingMs($room, $now));
            $pauseText = count($kept) === 0
                ? " Время остановлено на {$leftStr} до повторного входа."
                : '';
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
        $saveAndRespond(200, ['ok' => true, 'snapshot' => buildSnapshot($room, $now)]);
    }
    $saveAndRespond(200, ['ok' => true]);
}

if ($action === 'peer') {
    $code = normalizeCode((string)($input['code'] ?? ''));
    $peerId = (string)($input['peerId'] ?? '');
    if ($code === '' || !isset($store['rooms'][$code])) {
        $saveAndRespond(404, ['ok' => false]);
    }
    $room =& $store['rooms'][$code];
    foreach ($room['participants'] as &$p) {
        if ($p['peerId'] === $peerId) {
            $p['lastSeenAt'] = $now;
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
    $saveAndRespond(200, ['ok' => true, 'snapshot' => buildSnapshot($room, $now)]);
}

if ($action === 'signal') {
    $code = normalizeCode((string)($input['code'] ?? ''));
    $peerId = (string)($input['peerId'] ?? '');
    $signalType = (string)($input['signalType'] ?? '');
    if ($code === '' || !isset($store['rooms'][$code])) {
        $saveAndRespond(404, ['ok' => false]);
    }
    $room =& $store['rooms'][$code];
    if (getRoomRemainingMs($room, $now) <= 0) {
        $saveAndRespond(410, ['ok' => false, 'reason' => 'ROOM_EXPIRED']);
    }
    if ($signalType !== 'offer' && $signalType !== 'answer' && $signalType !== 'ice') {
        $saveAndRespond(400, ['ok' => false]);
    }
    foreach ($room['participants'] as $p) {
        if ($p['peerId'] !== $peerId) {
            $store['signalsByPeerId'][$p['peerId']] = $store['signalsByPeerId'][$p['peerId']] ?? [];
            $store['signalsByPeerId'][$p['peerId']][] = [
                'signalType' => $signalType,
                'fromPeerId' => $peerId,
                'payload' => $input['payload'] ?? null,
            ];
        }
    }
    $saveAndRespond(200, ['ok' => true]);
}

$saveAndRespond(400, ['ok' => false, 'message' => 'Неизвестное действие prebeta API.']);

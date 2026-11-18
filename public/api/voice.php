<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

const LIVE_VOICE_MAX_PARTICIPANTS = 8;
const LIVE_VOICE_HTTP_STALE_MS = 12000;
const DEFAULT_VOICE_UNLOCK_CODE = 'gk-voice-7714-test';

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

function readEnvSetting(string $name): string {
    $candidates = [
        getenv($name),
        $_ENV[$name] ?? null,
        $_SERVER[$name] ?? null,
        $_SERVER['REDIRECT_' . $name] ?? null,
    ];
    foreach ($candidates as $val) {
        if (is_string($val)) {
            $trimmed = trim($val);
            if ($trimmed !== '' && $trimmed !== 'MY_GEMINI_API_KEY' && $trimmed !== 'MY_APP_URL') {
                return $trimmed;
            }
        }
    }

    $envPaths = [
        dirname(__DIR__) . '/.env',
        dirname(__DIR__, 2) . '/.env',
        __DIR__ . '/.env',
    ];
    foreach ($envPaths as $path) {
        if (!@is_file($path) || !@is_readable($path)) {
            continue;
        }
        $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            continue;
        }
        foreach ($lines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '' || strpos($trimmed, '#') === 0) {
                continue;
            }
            if (strpos($trimmed, 'export ') === 0) {
                $trimmed = trim(substr($trimmed, 7));
            }
            $eqPos = strpos($trimmed, '=');
            if ($eqPos === false) {
                continue;
            }
            $key = trim(substr($trimmed, 0, $eqPos));
            if ($key !== $name) {
                continue;
            }
            $rawVal = trim(substr($trimmed, $eqPos + 1));
            $first = substr($rawVal, 0, 1);
            $last = substr($rawVal, -1);
            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                $rawVal = substr($rawVal, 1, -1);
            }
            $rawVal = trim($rawVal);
            if ($rawVal !== '' && $rawVal !== 'MY_GEMINI_API_KEY' && $rawVal !== 'MY_APP_URL') {
                return $rawVal;
            }
        }
    }

    return '';
}

function getVoiceUnlockHmacSecret(): string {
    $apiKey = readEnvSetting('GEMINI_API_KEY');
    $voiceCode = readEnvSetting('PREVIEW_VOICE_UNLOCK_CODE') ?: DEFAULT_VOICE_UNLOCK_CODE;
    $baseKey = $apiKey !== '' ? $apiKey : 'local-preview-key';
    return $baseKey . '::voice-unlock::' . $voiceCode;
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
    $nowMs = nowMs();
    if ((int)$payload <= $nowMs) {
        return false;
    }
    $expectedSig = hash_hmac('sha256', $payload, $hmacSecret);
    return hash_equals($expectedSig, strtolower($providedSig));
}

function sanitizeNick(string $raw, int $fallbackIndex): string {
    $cleaned = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $raw) ?? $raw;
    $cleaned = preg_replace('/\s+/u', ' ', trim($cleaned)) ?? trim($cleaned);
    $len = function_exists('mb_strlen') ? mb_strlen($cleaned, 'UTF-8') : strlen($cleaned);
    if ($len > 22) {
        $cleaned = function_exists('mb_substr') ? mb_substr($cleaned, 0, 22, 'UTF-8') : substr($cleaned, 0, 22);
    }
    return $cleaned !== '' ? $cleaned : ('Участник-' . $fallbackIndex);
}

function computeInitials(string $nick): string {
    $words = preg_split('/\s+/u', trim($nick)) ?: [];
    $cleanWords = [];
    foreach ($words as $w) {
        $stripped = preg_replace('/[^\p{L}\p{N}]/u', '', $w) ?? '';
        if ($stripped !== '') {
            $cleanWords[] = $stripped;
        }
    }
    $upper = function (string $s): string {
        return function_exists('mb_strtoupper') ? mb_strtoupper($s, 'UTF-8') : strtoupper($s);
    };
    $sub = function (string $s, int $start, int $len): string {
        return function_exists('mb_substr') ? mb_substr($s, $start, $len, 'UTF-8') : substr($s, $start, $len);
    };
    if (count($cleanWords) >= 2) {
        $res = $upper($sub($cleanWords[0], 0, 1) . $sub($cleanWords[1], 0, 1));
        return $res !== '' ? $res : 'ГК';
    }
    $all = preg_replace('/[^\p{L}\p{N}]/u', '', $nick) ?? '';
    $res = $upper($sub($all, 0, 2));
    return $res !== '' ? $res : 'ГК';
}

function pickAvatarColor(string $seed): string {
    $palette = ['#00f0ff', '#ff2a85', '#3b82f6', '#10b981', '#b829ff', '#f59e0b'];
    $idx = hexdec(substr(md5($seed), 0, 6)) % count($palette);
    return $palette[(int)$idx];
}

function buildPublicSnapshot(array $peers): array {
    $list = array_values($peers);
    usort($list, static function (array $a, array $b): int {
        return ((int)($a['joinedAt'] ?? 0)) <=> ((int)($b['joinedAt'] ?? 0));
    });
    $out = [];
    foreach ($list as $p) {
        $micMuted = !empty($p['micMuted']);
        $deafened = !empty($p['deafened']);
        $out[] = [
            'peerId' => (string)$p['peerId'],
            'nick' => (string)$p['nick'],
            'initials' => (string)$p['initials'],
            'avatarColor' => (string)$p['avatarColor'],
            'micMuted' => $micMuted,
            'deafened' => $deafened,
            'hasAudio' => !empty($p['hasAudio']),
            'camActive' => !empty($p['camActive']),
            'screenActive' => !empty($p['screenActive']),
            'speaking' => !empty($p['speaking']) && !$micMuted && !$deafened,
        ];
    }
    return $out;
}

function enqueueVoiceSignal(array &$store, string $toPeerId, array $packet): void {
    $list = $store['signalsByPeerId'][$toPeerId] ?? [];
    $list[] = $packet;
    $limit = 120;
    if (count($list) > $limit) {
        $toDrop = count($list) - $limit;
        $audioDropped = 0;
        $trimmed = [];
        foreach ($list as $item) {
            if (($item['type'] ?? '') === 'voice:audio' && $audioDropped < $toDrop) {
                $audioDropped++;
            } else {
                $trimmed[] = $item;
            }
        }
        $list = array_slice($trimmed, -$limit);
    }
    $store['signalsByPeerId'][$toPeerId] = $list;
}

function pruneStalePeers(array &$store, int $now): void {
    $removedIds = [];
    foreach ($store['peers'] as $peerId => $peer) {
        $lastSeen = (int)($peer['lastSeenAt'] ?? $now);
        if ($now - $lastSeen > LIVE_VOICE_HTTP_STALE_MS) {
            unset($store['peers'][$peerId], $store['signalsByPeerId'][$peerId]);
            $removedIds[] = (string)$peerId;
        }
    }
    if (count($removedIds) > 0) {
        foreach ($removedIds as $leftPeerId) {
            foreach ($store['peers'] as $otherId => $_peer) {
                enqueueVoiceSignal($store, (string)$otherId, [
                    'type' => 'voice:peer-left',
                    'peerId' => $leftPeerId,
                ]);
            }
        }
    }
}

$action = (string)($_GET['action'] ?? '');
$input = readJsonInput();
if ($action === '' && isset($input['action'])) {
    $action = (string)$input['action'];
}
if ($action === '' && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $action = 'status';
}

$stateCandidates = [
    rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'geek_live_voice_state_v1.json',
    __DIR__ . DIRECTORY_SEPARATOR . '.geek_live_voice_state_v1.json',
];
$fp = false;
foreach ($stateCandidates as $candidatePath) {
    $opened = @fopen($candidatePath, 'c+');
    if ($opened !== false) {
        $fp = $opened;
        break;
    }
}
if ($fp === false) {
    respond(500, ['ok' => false, 'message' => 'Не удалось открыть хранилище голосового канала.']);
}

if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    respond(500, ['ok' => false, 'message' => 'Ошибка блокировки хранилища голосового канала.']);
}

$rawStore = stream_get_contents($fp);
$store = is_string($rawStore) && $rawStore !== '' ? json_decode($rawStore, true) : null;
if (!is_array($store)) {
    $store = ['peers' => [], 'signalsByPeerId' => []];
}
$store['peers'] = is_array($store['peers'] ?? null) ? $store['peers'] : [];
$store['signalsByPeerId'] = is_array($store['signalsByPeerId'] ?? null) ? $store['signalsByPeerId'] : [];

$now = nowMs();
pruneStalePeers($store, $now);

$saveAndRespond = static function (int $status, array $payload) use ($fp, &$store): void {
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($store, JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    respond($status, $payload);
};

if ($action === 'status') {
    $saveAndRespond(200, [
        'ok' => true,
        'peersCount' => count($store['peers']),
        'maxParticipants' => LIVE_VOICE_MAX_PARTICIPANTS,
    ]);
}

$voiceSecret = getVoiceUnlockHmacSecret();

if ($action === 'join') {
    if (!verifyUnlockToken($input['token'] ?? null, $voiceSecret)) {
        $saveAndRespond(401, [
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

    $existing = $store['peers'][$peerId] ?? null;
    if ($existing === null && count($store['peers']) >= LIVE_VOICE_MAX_PARTICIPANTS) {
        $saveAndRespond(409, [
            'ok' => false,
            'reason' => 'ROOM_FULL',
            'message' => 'В тестовом голосовом канале уже максимум (' . LIVE_VOICE_MAX_PARTICIPANTS . ') участников.',
        ]);
    }

    $nick = sanitizeNick((string)($input['nick'] ?? ''), count($store['peers']) + 1);
    $peer = [
        'peerId' => $peerId,
        'nick' => $nick,
        'initials' => computeInitials($nick),
        'avatarColor' => is_array($existing) ? (string)$existing['avatarColor'] : pickAvatarColor($peerId),
        'micMuted' => !empty($input['micMuted']),
        'deafened' => !empty($input['deafened']),
        'hasAudio' => !empty($input['hasAudio']),
        'camActive' => !empty($input['camActive']),
        'screenActive' => !empty($input['screenActive']),
        'speaking' => false,
        'joinedAt' => is_array($existing) ? (int)$existing['joinedAt'] : $now,
        'lastSeenAt' => $now,
    ];
    $store['peers'][$peerId] = $peer;

    foreach ($store['peers'] as $otherId => $_otherPeer) {
        $otherIdStr = (string)$otherId;
        if ($otherIdStr === $peerId) {
            continue;
        }
        if (strcmp($peerId, $otherIdStr) < 0) {
            enqueueVoiceSignal($store, $peerId, [
                'type' => 'voice:rtc-initiate',
                'targetPeerId' => $otherIdStr,
            ]);
        } else {
            enqueueVoiceSignal($store, $otherIdStr, [
                'type' => 'voice:rtc-initiate',
                'targetPeerId' => $peerId,
            ]);
        }
    }

    $signals = $store['signalsByPeerId'][$peerId] ?? [];
    unset($store['signalsByPeerId'][$peerId]);

    $saveAndRespond(200, [
        'ok' => true,
        'peerId' => $peerId,
        'peers' => buildPublicSnapshot($store['peers']),
        'signals' => $signals,
    ]);
}

if ($action === 'poll') {
    if (!verifyUnlockToken($input['token'] ?? null, $voiceSecret)) {
        $saveAndRespond(401, ['ok' => false, 'reason' => 'UNAUTHORIZED', 'message' => 'Доступ запрещён.']);
    }
    $peerId = (string)($input['peerId'] ?? '');
    if ($peerId === '' || !isset($store['peers'][$peerId])) {
        $saveAndRespond(409, ['ok' => false, 'reason' => 'NOT_IN_ROOM', 'message' => 'Вы не в голосовом канале.']);
    }
    $store['peers'][$peerId]['lastSeenAt'] = $now;
    $signals = $store['signalsByPeerId'][$peerId] ?? [];
    unset($store['signalsByPeerId'][$peerId]);
    $saveAndRespond(200, [
        'ok' => true,
        'peers' => buildPublicSnapshot($store['peers']),
        'signals' => $signals,
    ]);
}

if ($action === 'update') {
    if (!verifyUnlockToken($input['token'] ?? null, $voiceSecret)) {
        $saveAndRespond(401, ['ok' => false, 'reason' => 'UNAUTHORIZED']);
    }
    $peerId = (string)($input['peerId'] ?? '');
    if ($peerId === '' || !isset($store['peers'][$peerId])) {
        $saveAndRespond(409, ['ok' => false, 'reason' => 'NOT_IN_ROOM']);
    }
    $peer =& $store['peers'][$peerId];
    foreach (['micMuted', 'deafened', 'hasAudio', 'camActive', 'screenActive', 'speaking'] as $flag) {
        if (array_key_exists($flag, $input) && is_bool($input[$flag])) {
            $peer[$flag] = $input[$flag];
        }
    }
    $peer['lastSeenAt'] = $now;
    unset($peer);
    $saveAndRespond(200, [
        'ok' => true,
        'peers' => buildPublicSnapshot($store['peers']),
    ]);
}

if ($action === 'signal') {
    if (!verifyUnlockToken($input['token'] ?? null, $voiceSecret)) {
        $saveAndRespond(401, ['ok' => false, 'reason' => 'UNAUTHORIZED']);
    }
    $peerId = (string)($input['peerId'] ?? '');
    if ($peerId === '' || !isset($store['peers'][$peerId])) {
        $saveAndRespond(409, ['ok' => false, 'reason' => 'NOT_IN_ROOM']);
    }
    $store['peers'][$peerId]['lastSeenAt'] = $now;
    $signalType = (string)($input['signalType'] ?? '');

    if ($signalType === 'audio') {
        $payload = $input['payload'] ?? null;
        if (!is_array($payload) || !isset($payload['data']) || !is_string($payload['data']) || $payload['data'] === '' || strlen($payload['data']) > 32768) {
            $saveAndRespond(400, ['ok' => false, 'reason' => 'BAD_AUDIO_FRAME']);
        }
        $sr = isset($payload['sr']) && is_numeric($payload['sr']) ? (int)$payload['sr'] : 16000;
        $safeSr = ($sr >= 8000 && $sr <= 48000) ? $sr : 16000;
        foreach ($store['peers'] as $otherId => $otherPeer) {
            $otherIdStr = (string)$otherId;
            if ($otherIdStr === $peerId || !empty($otherPeer['deafened'])) {
                continue;
            }
            enqueueVoiceSignal($store, $otherIdStr, [
                'type' => 'voice:audio',
                'fromPeerId' => $peerId,
                'sr' => $safeSr,
                'data' => $payload['data'],
            ]);
        }
        $saveAndRespond(200, ['ok' => true]);
    }

    $toPeerId = (string)($input['toPeerId'] ?? '');
    if (
        $toPeerId === '' ||
        $toPeerId === $peerId ||
        !isset($store['peers'][$toPeerId]) ||
        ($signalType !== 'offer' && $signalType !== 'answer' && $signalType !== 'ice')
    ) {
        $saveAndRespond(400, ['ok' => false, 'reason' => 'BAD_SIGNAL']);
    }

    enqueueVoiceSignal($store, $toPeerId, [
        'type' => 'voice:signal',
        'fromPeerId' => $peerId,
        'signalType' => $signalType,
        'payload' => $input['payload'] ?? null,
    ]);
    $saveAndRespond(200, ['ok' => true]);
}

if ($action === 'leave') {
    $peerId = (string)($input['peerId'] ?? '');
    if ($peerId !== '' && isset($store['peers'][$peerId])) {
        unset($store['peers'][$peerId], $store['signalsByPeerId'][$peerId]);
        foreach ($store['peers'] as $otherId => $_otherPeer) {
            enqueueVoiceSignal($store, (string)$otherId, [
                'type' => 'voice:peer-left',
                'peerId' => $peerId,
            ]);
        }
    }
    $saveAndRespond(200, ['ok' => true]);
}

$saveAndRespond(400, ['ok' => false, 'reason' => 'UNKNOWN_ACTION', 'message' => 'Неизвестное действие voice API.']);

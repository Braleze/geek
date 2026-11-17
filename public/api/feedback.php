<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'ok' => false,
        'error' => 'Метод не поддерживается. Используйте POST.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$rawBody = file_get_contents('php://input');
$data = [];
if (is_string($rawBody) && $rawBody !== '') {
    $decoded = json_decode($rawBody, true);
    if (is_array($decoded)) {
        $data = $decoded;
    }
}
if (empty($data) && !empty($_POST)) {
    $data = $_POST;
}

$honeypot = isset($data['_gotcha']) ? trim((string)$data['_gotcha']) : '';
if ($honeypot !== '') {
    echo json_encode([
        'ok' => true,
        'id' => 'GK-0000',
        'to' => 'admin@geek-voice.ru',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$name = trim((string)($data['name'] ?? ''));
$email = trim((string)($data['email'] ?? ''));
$message = trim((string)($data['message'] ?? ''));
$ticketId = trim((string)($data['id'] ?? ''));

$safeName = preg_replace('/[\r\n]+/', ' ', $name) ?? '';
$safeEmail = preg_replace('/[\r\n]+/', '', $email) ?? '';
$safeTicketId = preg_replace('/[^A-Za-z0-9\-]/', '', $ticketId) ?? '';
if ($safeTicketId === '') {
    $safeTicketId = 'GK-' . (string)random_int(1000, 9999);
}

$nameLen = function_exists('mb_strlen') ? mb_strlen($safeName, 'UTF-8') : strlen($safeName);
$msgLen = function_exists('mb_strlen') ? mb_strlen($message, 'UTF-8') : strlen($message);

if ($nameLen < 2 || $nameLen > 120) {
    http_response_code(422);
    echo json_encode([
        'ok' => false,
        'error' => 'Укажите корректное имя (от 2 до 120 символов).',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!filter_var($safeEmail, FILTER_VALIDATE_EMAIL) || strlen($safeEmail) > 190) {
    http_response_code(422);
    echo json_encode([
        'ok' => false,
        'error' => 'Укажите корректный email адрес.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($msgLen < 5 || $msgLen > 5000) {
    http_response_code(422);
    echo json_encode([
        'ok' => false,
        'error' => 'Сообщение должно содержать от 5 до 5000 символов.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$recipient = 'admin@geek-voice.ru';
$subjectText = "[Geek] Обращение {$safeTicketId} от {$safeName}";
$encodedSubject = '=?UTF-8?B?' . base64_encode($subjectText) . '?=';
$encodedFromName = '=?UTF-8?B?' . base64_encode('Geek Feedback') . '?=';
$encodedReplyName = '=?UTF-8?B?' . base64_encode($safeName) . '?=';

$remoteIp = isset($_SERVER['REMOTE_ADDR']) ? (string)$_SERVER['REMOTE_ADDR'] : 'unknown';
$submittedAt = gmdate('Y-m-d H:i:s') . ' UTC';

$body = "Новое обращение с сайта geek-voice.ru\n"
    . "====================================\n"
    . "Номер обращения: {$safeTicketId}\n"
    . "Имя: {$safeName}\n"
    . "Email для ответа: {$safeEmail}\n"
    . "Время (UTC): {$submittedAt}\n"
    . "IP: {$remoteIp}\n\n"
    . "Сообщение:\n"
    . $message . "\n";

$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    "From: {$encodedFromName} <noreply@geek-voice.ru>",
    "Reply-To: {$encodedReplyName} <{$safeEmail}>",
    'X-Mailer: Geek-Site-PHP/' . phpversion(),
];

$sent = @mail($recipient, $encodedSubject, $body, implode("\r\n", $headers), '-fnoreply@geek-voice.ru');
if (!$sent) {
    $sent = @mail($recipient, $encodedSubject, $body, implode("\r\n", $headers));
}

if (!$sent) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Сервер временно не смог отправить письмо через PHP mail().',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode([
    'ok' => true,
    'id' => $safeTicketId,
    'to' => $recipient,
], JSON_UNESCAPED_UNICODE);

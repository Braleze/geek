<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    gkRespondJson(405, [
        'ok' => false,
        'error' => 'Метод не поддерживается. Используйте POST.',
    ]);
}

$data = gkReadJsonInput();

$recipient = gkSetting('feedback_to', 'FEEDBACK_TO', 'admin@geek-voice.ru');
$senderFrom = gkSetting('feedback_from', 'FEEDBACK_FROM', 'noreply@geek-voice.ru');

$honeypot = isset($data['_gotcha']) ? trim((string)$data['_gotcha']) : '';
if ($honeypot !== '') {
    gkRespondJson(200, [
        'ok' => true,
        'id' => 'GK-0000',
        'to' => $recipient,
        'savedToDb' => false,
        'emailSent' => false,
    ]);
}

$name = trim((string)($data['name'] ?? ''));
$email = trim((string)($data['email'] ?? ''));
$message = trim((string)($data['message'] ?? ''));
$topic = trim((string)($data['topic'] ?? 'Общий вопрос'));
$ticketId = trim((string)($data['id'] ?? ''));

$safeName = preg_replace('/[\r\n]+/', ' ', $name) ?? '';
$safeEmail = preg_replace('/[\r\n]+/', '', $email) ?? '';
$safeTopic = preg_replace('/[\r\n]+/', ' ', $topic) ?? 'Общий вопрос';
if ($safeTopic === '') {
    $safeTopic = 'Общий вопрос';
}
$safeTicketId = preg_replace('/[^A-Za-z0-9\-]/', '', $ticketId) ?? '';
if ($safeTicketId === '') {
    $safeTicketId = 'GK-' . (string)random_int(1000, 9999);
}

$nameLen = gkUtf8Len($safeName);
$msgLen = gkUtf8Len($message);

if ($nameLen < 2 || $nameLen > 120) {
    gkRespondJson(422, [
        'ok' => false,
        'error' => 'Укажите корректное имя (от 2 до 120 символов).',
    ]);
}

if (!filter_var($safeEmail, FILTER_VALIDATE_EMAIL) || strlen($safeEmail) > 190) {
    gkRespondJson(422, [
        'ok' => false,
        'error' => 'Укажите корректный email адрес.',
    ]);
}

if ($msgLen < 5 || $msgLen > 5000) {
    gkRespondJson(422, [
        'ok' => false,
        'error' => 'Сообщение должно содержать от 5 до 5000 символов.',
    ]);
}

$remoteIp = isset($_SERVER['REMOTE_ADDR']) ? substr((string)$_SERVER['REMOTE_ADDR'], 0, 64) : 'unknown';
$now = gkNowMs();
$savedToDb = false;
$dbRowId = 0;

try {
    $pdo = gkDb();
    $stmt = $pdo->prepare(
        'INSERT INTO feedback_tickets (ticket_code, topic, name, email, message, ip_addr, email_sent, created_at)
         VALUES (:code, :topic, :name, :email, :message, :ip, 0, :created_at)'
    );
    $stmt->execute([
        ':code' => $safeTicketId,
        ':topic' => gkUtf8Substr($safeTopic, 0, 120),
        ':name' => gkUtf8Substr($safeName, 0, 120),
        ':email' => substr($safeEmail, 0, 190),
        ':message' => $message,
        ':ip' => $remoteIp,
        ':created_at' => $now,
    ]);
    $dbRowId = (int)$pdo->lastInsertId();
    $savedToDb = true;
} catch (Throwable $e) {
    $savedToDb = false;
}

$subjectText = "[Geek · {$safeTopic}] Обращение {$safeTicketId} от {$safeName}";
$encodedSubject = '=?UTF-8?B?' . base64_encode($subjectText) . '?=';
$encodedFromName = '=?UTF-8?B?' . base64_encode('Geek Feedback') . '?=';
$encodedReplyName = '=?UTF-8?B?' . base64_encode($safeName) . '?=';
$submittedAt = gmdate('Y-m-d H:i:s') . ' UTC';

$body = "Новое обращение с сайта geek-voice.ru\n"
    . "====================================\n"
    . "Номер обращения: {$safeTicketId}\n"
    . "Тема: {$safeTopic}\n"
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
    "From: {$encodedFromName} <{$senderFrom}>",
    "Reply-To: {$encodedReplyName} <{$safeEmail}>",
    'X-Mailer: Geek-Host0-PHP/' . PHP_VERSION,
];

$sent = @mail($recipient, $encodedSubject, $body, implode("\r\n", $headers), '-f' . $senderFrom);
if (!$sent) {
    $sent = @mail($recipient, $encodedSubject, $body, implode("\r\n", $headers));
}

if ($sent && $savedToDb && $dbRowId > 0) {
    try {
        $pdo = gkDb();
        $upd = $pdo->prepare('UPDATE feedback_tickets SET email_sent = 1 WHERE id = :id');
        $upd->execute([':id' => $dbRowId]);
    } catch (Throwable $e) {
        // Non-fatal
    }
}

if (!$sent && !$savedToDb) {
    gkRespondJson(500, [
        'ok' => false,
        'error' => 'Сервер временно не смог сохранить и отправить обращение.',
    ]);
}

gkRespondJson(200, [
    'ok' => true,
    'id' => $safeTicketId,
    'to' => $recipient,
    'savedToDb' => $savedToDb,
    'emailSent' => $sent,
]);

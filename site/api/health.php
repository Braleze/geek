<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$driver = gkGetDbDriverName();
$dbOk = false;
$dbError = null;
$tables = [];

try {
    $pdo = gkDb();
    $dbOk = true;
    $actualDriver = (string)$pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($actualDriver === 'sqlite') {
        $stmt = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
        $tables = $stmt ? $stmt->fetchAll(PDO::FETCH_COLUMN) : [];
    } else {
        $stmt = $pdo->query('SHOW TABLES');
        $tables = $stmt ? $stmt->fetchAll(PDO::FETCH_COLUMN) : [];
    }
} catch (Throwable $e) {
    $dbError = $e->getMessage();
}

$isHttps =
    (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
    (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');

gkRespondJson($dbOk ? 200 : 500, [
    'ok' => $dbOk,
    'host' => 'reg.ru-host-0',
    'phpVersion' => PHP_VERSION,
    'https' => $isHttps,
    'dbDriver' => $driver,
    'dbConnected' => $dbOk,
    'dbError' => $dbError,
    'tables' => $tables,
    'extensions' => [
        'pdo' => extension_loaded('PDO'),
        'pdo_sqlite' => extension_loaded('pdo_sqlite'),
        'pdo_mysql' => extension_loaded('pdo_mysql'),
        'curl' => extension_loaded('curl'),
        'mbstring' => extension_loaded('mbstring'),
    ],
    'features' => [
        'configPhpPresent' => gkFindUserConfigPath() !== null,
        'geminiConfigured' => gkSetting('gemini_api_key', 'GEMINI_API_KEY', '') !== '',
        'turnConfigured' => count(gkResolveIceServers()) > 0,
    ],
    'serverTimeUtc' => gmdate('Y-m-d\TH:i:s\Z'),
]);

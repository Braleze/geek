<?php
declare(strict_types=1);

/**
 * Единый bootstrap-слой Geek PHP API для REG.RU Host-0.
 * Поддерживает PDO SQLite (WAL, работает из коробки) и PDO MySQL (переключается через api/config.php).
 */

function gkNowMs(): int {
    return (int)round(microtime(true) * 1000);
}

function gkRespondJson(int $status, array $payload): void {
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('X-Content-Type-Options: nosniff');
    }
    http_response_code($status);
    $flags = JSON_UNESCAPED_UNICODE;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
        $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    }
    echo json_encode($payload, $flags);
    exit;
}

function gkReadJsonInput(): array {
    $raw = file_get_contents('php://input');
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }
    return is_array($_POST) ? $_POST : [];
}

function gkUtf8Len(string $s): int {
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
}

function gkUtf8Substr(string $s, int $start, ?int $len = null): string {
    if (function_exists('mb_substr')) {
        return $len === null
            ? mb_substr($s, $start, null, 'UTF-8')
            : mb_substr($s, $start, $len, 'UTF-8');
    }
    return $len === null ? substr($s, $start) : substr($s, $start, $len);
}

function gkUtf8Lower(string $s): string {
    return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
}

function gkUtf8Upper(string $s): string {
    return function_exists('mb_strtoupper') ? mb_strtoupper($s, 'UTF-8') : strtoupper($s);
}

function gkFindUserConfigPath(): ?string {
    $candidates = [
        __DIR__ . '/config.php',
        dirname(__DIR__, 2) . '/api/config.php',
        dirname(__DIR__, 2) . '/config.php',
    ];
    foreach ($candidates as $path) {
        if (@is_file($path) && @is_readable($path)) {
            return $path;
        }
    }
    return null;
}

function gkLoadConfig(): array {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $defaults = [
        'db_driver' => 'sqlite',
        'sqlite_path' => __DIR__ . '/.data/geek.sqlite',
        'mysql_host' => 'localhost',
        'mysql_port' => 3306,
        'mysql_db' => '',
        'mysql_user' => '',
        'mysql_pass' => '',
        'mysql_charset' => 'utf8mb4',
        'gemini_api_key' => '',
        'gemini_api_base' => '',
        'gemini_proxy_url' => '',
        'preview_unlock_code' => '',
        'preview_voice_unlock_code' => '',
        'feedback_to' => 'admin@geek-voice.ru',
        'feedback_from' => 'noreply@geek-voice.ru',
        'ice_servers' => [],
    ];

    $exampleFile = __DIR__ . '/config.example.php';
    if (@is_file($exampleFile) && @is_readable($exampleFile)) {
        $loadedExample = @include $exampleFile;
        if (is_array($loadedExample)) {
            $defaults = array_merge($defaults, $loadedExample);
        }
    }

    $userFile = gkFindUserConfigPath();
    if ($userFile !== null) {
        $loadedUser = @include $userFile;
        if (is_array($loadedUser)) {
            $defaults = array_merge($defaults, $loadedUser);
        }
    }

    $cached = $defaults;
    return $cached;
}

function gkReadEnvFileMap(): array {
    static $map = null;
    if ($map !== null) {
        return $map;
    }
    $map = [];
    $envPaths = [
        __DIR__ . '/.env',
        dirname(__DIR__) . '/.env',
        dirname(__DIR__, 2) . '/.env',
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
            if ($key === '' || array_key_exists($key, $map)) {
                continue;
            }
            $rawVal = trim(substr($trimmed, $eqPos + 1));
            $first = substr($rawVal, 0, 1);
            $last = substr($rawVal, -1);
            if (strlen($rawVal) >= 2 && (($first === '"' && $last === '"') || ($first === "'" && $last === "'"))) {
                $rawVal = substr($rawVal, 1, -1);
            }
            $map[$key] = trim($rawVal);
        }
    }
    return $map;
}

function gkSetting(string $configKey, string $envName = '', string $fallback = ''): string {
    $cfg = gkLoadConfig();
    if ($configKey !== '' && isset($cfg[$configKey]) && is_string($cfg[$configKey])) {
        $v = trim($cfg[$configKey]);
        if ($v !== '' && $v !== 'MY_GEMINI_API_KEY' && $v !== 'MY_APP_URL') {
            return $v;
        }
    }

    if ($envName !== '') {
        $candidates = [
            getenv($envName),
            $_ENV[$envName] ?? null,
            $_SERVER[$envName] ?? null,
            $_SERVER['REDIRECT_' . $envName] ?? null,
        ];
        foreach ($candidates as $val) {
            if (is_string($val)) {
                $trimmed = trim($val);
                if ($trimmed !== '' && $trimmed !== 'MY_GEMINI_API_KEY' && $trimmed !== 'MY_APP_URL') {
                    return $trimmed;
                }
            }
        }
        $envMap = gkReadEnvFileMap();
        if (isset($envMap[$envName])) {
            $trimmed = trim((string)$envMap[$envName]);
            if ($trimmed !== '' && $trimmed !== 'MY_GEMINI_API_KEY' && $trimmed !== 'MY_APP_URL') {
                return $trimmed;
            }
        }
    }

    return $fallback;
}

function gkResolveIceServers(): array {
    $cfg = gkLoadConfig();
    $servers = [];
    if (isset($cfg['ice_servers']) && is_array($cfg['ice_servers'])) {
        foreach ($cfg['ice_servers'] as $item) {
            if (!is_array($item) || empty($item['urls'])) {
                continue;
            }
            $entry = ['urls' => $item['urls']];
            if (!empty($item['username']) && is_string($item['username'])) {
                $entry['username'] = $item['username'];
            }
            if (!empty($item['credential']) && is_string($item['credential'])) {
                $entry['credential'] = $item['credential'];
            }
            $servers[] = $entry;
        }
    }

    $turnUrlsRaw = gkSetting('', 'TURN_URLS', '');
    if ($turnUrlsRaw !== '') {
        $urls = array_values(array_filter(array_map('trim', explode(',', $turnUrlsRaw))));
        if (count($urls) > 0) {
            $entry = ['urls' => count($urls) === 1 ? $urls[0] : $urls];
            $u = gkSetting('', 'TURN_USERNAME', '');
            $c = gkSetting('', 'TURN_CREDENTIAL', '');
            if ($u !== '') {
                $entry['username'] = $u;
            }
            if ($c !== '') {
                $entry['credential'] = $c;
            }
            $servers[] = $entry;
        }
    }

    return $servers;
}

function gkGetDbDriverName(): string {
    $cfg = gkLoadConfig();
    $raw = strtolower(trim((string)($cfg['db_driver'] ?? 'sqlite')));
    $envDriver = strtolower(gkSetting('', 'GEEK_DB_DRIVER', ''));
    if ($envDriver === 'mysql' || $envDriver === 'sqlite') {
        $raw = $envDriver;
    }
    return $raw === 'mysql' ? 'mysql' : 'sqlite';
}

function gkDb(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = gkLoadConfig();
    $driver = gkGetDbDriverName();
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    if ($driver === 'mysql') {
        $host = gkSetting('mysql_host', 'GEEK_MYSQL_HOST', 'localhost');
        $port = (int)($cfg['mysql_port'] ?? 3306);
        $dbName = gkSetting('mysql_db', 'GEEK_MYSQL_DB', '');
        $user = gkSetting('mysql_user', 'GEEK_MYSQL_USER', '');
        $pass = gkSetting('mysql_pass', 'GEEK_MYSQL_PASS', '');
        $charset = gkSetting('mysql_charset', '', 'utf8mb4');
        if ($dbName === '' || $user === '') {
            throw new RuntimeException('MySQL не настроен в api/config.php (укажите mysql_db и mysql_user).');
        }
        $dsn = "mysql:host={$host};port={$port};dbname={$dbName};charset={$charset}";
        $pdo = new PDO($dsn, $user, $pass, $options);
        gkEnsureSchema($pdo, 'mysql');
        return $pdo;
    }

    $sqlitePath = (string)($cfg['sqlite_path'] ?? (__DIR__ . '/.data/geek.sqlite'));
    $dataDir = dirname($sqlitePath);
    if (!@is_dir($dataDir)) {
        @mkdir($dataDir, 0755, true);
    }
    $htPath = $dataDir . '/.htaccess';
    if (@is_dir($dataDir) && !@is_file($htPath)) {
        @file_put_contents($htPath, "Require all denied\nDeny from all\n");
    }

    if (!@is_writable($dataDir)) {
        $sqlitePath = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'geek_host0_v1.sqlite';
    }

    $pdo = new PDO('sqlite:' . $sqlitePath, null, null, $options);
    $pdo->exec('PRAGMA journal_mode = WAL;');
    $pdo->exec('PRAGMA synchronous = NORMAL;');
    $pdo->exec('PRAGMA busy_timeout = 5000;');
    gkEnsureSchema($pdo, 'sqlite');
    return $pdo;
}

function gkEnsureSchema(PDO $pdo, string $driver): void {
    if ($driver === 'mysql') {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS prebeta_quotas (
                client_id VARCHAR(64) NOT NULL PRIMARY KEY,
                issued_code VARCHAR(16) NOT NULL,
                created_at BIGINT NOT NULL,
                remaining_ms BIGINT NOT NULL,
                expires_at BIGINT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS prebeta_rooms (
                code VARCHAR(16) NOT NULL PRIMARY KEY,
                host_client_id VARCHAR(64) NOT NULL,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL,
                state_json MEDIUMTEXT NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS prebeta_signals (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                room_code VARCHAR(16) NOT NULL,
                to_peer_id VARCHAR(64) NOT NULL,
                from_peer_id VARCHAR(64) NOT NULL,
                signal_type VARCHAR(24) NOT NULL,
                payload_json MEDIUMTEXT NULL,
                created_at BIGINT NOT NULL,
                INDEX idx_pb_sig_peer (to_peer_id, id),
                INDEX idx_pb_sig_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS voice_peers (
                peer_id VARCHAR(64) NOT NULL PRIMARY KEY,
                nick VARCHAR(64) NOT NULL,
                initials VARCHAR(8) NOT NULL,
                avatar_color VARCHAR(16) NOT NULL,
                mic_muted TINYINT(1) NOT NULL DEFAULT 0,
                deafened TINYINT(1) NOT NULL DEFAULT 0,
                has_audio TINYINT(1) NOT NULL DEFAULT 0,
                cam_active TINYINT(1) NOT NULL DEFAULT 0,
                screen_active TINYINT(1) NOT NULL DEFAULT 0,
                speaking TINYINT(1) NOT NULL DEFAULT 0,
                joined_at BIGINT NOT NULL,
                last_seen_at BIGINT NOT NULL,
                INDEX idx_lv_seen (last_seen_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS voice_signals (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                to_peer_id VARCHAR(64) NOT NULL,
                packet_type VARCHAR(32) NOT NULL,
                packet_json MEDIUMTEXT NOT NULL,
                created_at BIGINT NOT NULL,
                INDEX idx_lv_sig_peer (to_peer_id, id),
                INDEX idx_lv_sig_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS feedback_tickets (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                ticket_code VARCHAR(32) NOT NULL,
                topic VARCHAR(120) NOT NULL,
                name VARCHAR(120) NOT NULL,
                email VARCHAR(190) NOT NULL,
                message TEXT NOT NULL,
                ip_addr VARCHAR(64) NOT NULL,
                email_sent TINYINT(1) NOT NULL DEFAULT 0,
                created_at BIGINT NOT NULL,
                INDEX idx_fb_ticket (ticket_code),
                INDEX idx_fb_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        return;
    }

    // SQLite schema
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS prebeta_quotas (
            client_id TEXT PRIMARY KEY,
            issued_code TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            remaining_ms INTEGER NOT NULL,
            expires_at INTEGER NULL
        )
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS prebeta_rooms (
            code TEXT PRIMARY KEY,
            host_client_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            state_json TEXT NOT NULL
        )
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS prebeta_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code TEXT NOT NULL,
            to_peer_id TEXT NOT NULL,
            from_peer_id TEXT NOT NULL,
            signal_type TEXT NOT NULL,
            payload_json TEXT NULL,
            created_at INTEGER NOT NULL
        )
    ");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_pb_sig_peer ON prebeta_signals (to_peer_id, id)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_pb_sig_created ON prebeta_signals (created_at)");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS voice_peers (
            peer_id TEXT PRIMARY KEY,
            nick TEXT NOT NULL,
            initials TEXT NOT NULL,
            avatar_color TEXT NOT NULL,
            mic_muted INTEGER NOT NULL DEFAULT 0,
            deafened INTEGER NOT NULL DEFAULT 0,
            has_audio INTEGER NOT NULL DEFAULT 0,
            cam_active INTEGER NOT NULL DEFAULT 0,
            screen_active INTEGER NOT NULL DEFAULT 0,
            speaking INTEGER NOT NULL DEFAULT 0,
            joined_at INTEGER NOT NULL,
            last_seen_at INTEGER NOT NULL
        )
    ");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_lv_seen ON voice_peers (last_seen_at)");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS voice_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            to_peer_id TEXT NOT NULL,
            packet_type TEXT NOT NULL,
            packet_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
    ");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_lv_sig_peer ON voice_signals (to_peer_id, id)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_lv_sig_created ON voice_signals (created_at)");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS feedback_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_code TEXT NOT NULL,
            topic TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            ip_addr TEXT NOT NULL,
            email_sent INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        )
    ");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_fb_ticket ON feedback_tickets (ticket_code)");
}

function gkDbTxState(?bool $set = null): bool {
    static $sqliteActive = false;
    if ($set !== null) {
        $sqliteActive = $set;
    }
    return $sqliteActive;
}

function gkDbBegin(PDO $pdo): void {
    $driver = (string)$pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
        if (!gkDbTxState()) {
            $pdo->exec('BEGIN IMMEDIATE');
            gkDbTxState(true);
        }
    } elseif (!$pdo->inTransaction()) {
        $pdo->beginTransaction();
    }
}

function gkDbCommit(PDO $pdo): void {
    $driver = (string)$pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
        if (gkDbTxState()) {
            $pdo->exec('COMMIT');
            gkDbTxState(false);
        }
    } elseif ($pdo->inTransaction()) {
        $pdo->commit();
    }
}

function gkDbRollback(PDO $pdo): void {
    $driver = (string)$pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
        if (gkDbTxState()) {
            try {
                $pdo->exec('ROLLBACK');
            } catch (Throwable $e) {
                // Ignore if already rolled back by SQLite
            }
            gkDbTxState(false);
        }
    } elseif ($pdo->inTransaction()) {
        try {
            $pdo->rollBack();
        } catch (Throwable $e) {
            // Ignore rollback error
        }
    }
}

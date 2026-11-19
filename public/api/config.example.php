<?php
declare(strict_types=1);

/**
 * Конфигурация бэкенда Geek для виртуального хостинга REG.RU (Host-0).
 *
 * Как настроить на хостинге:
 * 1. Скопируйте этот файл рядом под именем `config.php` (в папку `api/`).
 * 2. По умолчанию всё работает сразу «из коробки» на SQLite (`api/.data/geek.sqlite`).
 * 3. Чтобы переключиться на MySQL REG.RU (13 ГБ SSD):
 *    поменяйте 'db_driver' => 'mysql' и заполните mysql_db / mysql_user / mysql_pass.
 *    Таблицы создадутся автоматически при первом запросе.
 * 4. Для живых AI-ответов в демо-чате вставьте ключ в 'gemini_api_key'.
 */
return [
    // 'sqlite' (работает сразу из коробки) или 'mysql' (БД MySQL из панели REG.RU)
    'db_driver' => 'sqlite',

    // Путь к файлу SQLite (используется при db_driver === 'sqlite')
    'sqlite_path' => __DIR__ . '/.data/geek.sqlite',

    // Настройки MySQL REG.RU (используются при db_driver === 'mysql')
    'mysql_host' => 'localhost',
    'mysql_port' => 3306,
    'mysql_db' => '',
    'mysql_user' => '',
    'mysql_pass' => '',
    'mysql_charset' => 'utf8mb4',

    // Gemini API для живых ответов участников в демо-чате (необязательно; без ключа работают встроенные ответы)
    'gemini_api_key' => '',
    'gemini_api_base' => 'https://generativelanguage.googleapis.com',
    'gemini_proxy_url' => '',

    // Секретные коды превью (оставьте пустыми, чтобы использовать значения по умолчанию или .env)
    'preview_unlock_code' => '',
    'preview_voice_unlock_code' => '',

    // Почта для формы обратной связи (доменная почта REG.RU)
    'feedback_to' => 'admin@geek-voice.ru',
    'feedback_from' => 'noreply@geek-voice.ru',

    // Опциональный TURN-сервер для WebRTC (например, бесплатный Metered/Cloudflare TURN)
    // Позволяет голосу работать через любые мобильные сети и строгие роутеры без нагрузки на CP хостинга.
    // Пример:
    // 'ice_servers' => [
    //     [
    //         'urls' => ['turn:global.relay.metered.ca:80', 'turns:global.relay.metered.ca:443'],
    //         'username' => '...',
    //         'credential' => '...',
    //     ],
    // ],
    'ice_servers' => [],
];

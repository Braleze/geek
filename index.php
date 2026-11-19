<?php
declare(strict_types=1);

/**
 * Точка входа для REG.RU Host-0 при загрузке всего архива проекта в корень домена.
 * Отдаёт готовую скомпилированную версию из site/index.html, автоматически подставляет
 * актуальные файлы ассетов (app.js / app.css + chunk-*.js) с cache-busting по filemtime,
 * и показывает подробную диагностику, если на сервере не хватает файлов сборки.
 */

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('X-Content-Type-Options: nosniff');

function gkPickBundleAsset(string $assetsDir, string $preferredName, string $fallbackGlob): ?string {
    if (@is_file($assetsDir . '/' . $preferredName)) {
        return $preferredName;
    }
    $matches = @glob($assetsDir . '/' . $fallbackGlob);
    if (!is_array($matches) || count($matches) === 0) {
        return null;
    }
    usort($matches, static function (string $a, string $b): int {
        return (@filemtime($b) ?: 0) <=> (@filemtime($a) ?: 0);
    });
    return basename($matches[0]);
}

function gkListDirBrief(string $dir): string {
    if (!@is_dir($dir)) {
        return 'папка отсутствует';
    }
    $items = @scandir($dir);
    if (!is_array($items)) {
        return 'нет доступа к чтению';
    }
    $filtered = array_values(array_filter($items, static function (string $name): bool {
        return $name !== '.' && $name !== '..';
    }));
    if (count($filtered) === 0) {
        return 'папка пуста';
    }
    return implode(', ', array_slice($filtered, 0, 20));
}

function gkServeBuiltHtml(string $bundleDir, string $publicPrefix): bool {
    $indexPath = $bundleDir . '/index.html';
    if (!@is_file($indexPath) || !@is_readable($indexPath)) {
        return false;
    }
    $html = file_get_contents($indexPath);
    if (!is_string($html) || $html === '') {
        return false;
    }

    $assetsDir = $bundleDir . '/assets';
    if (!@is_dir($assetsDir)) {
        return false;
    }

    $jsFile = gkPickBundleAsset($assetsDir, 'app.js', 'index-*.js');
    $cssFile = gkPickBundleAsset($assetsDir, 'app.css', 'index-*.css');
    if ($jsFile === null) {
        return false;
    }

    $prefixUrl = $publicPrefix === '' ? './assets/' : './' . $publicPrefix . '/assets/';
    $jsVer = (string)(@filemtime($assetsDir . '/' . $jsFile) ?: time());
    $jsPublicUrl = $prefixUrl . $jsFile . '?v=' . $jsVer;

    // 1. Rewrite main entry script with filemtime cache-buster
    $html = preg_replace(
        '/src="\.\/assets\/[^"]+\.js(?:\?[^"]*)?"/',
        'src="' . $jsPublicUrl . '"',
        $html,
        1
    ) ?? $html;

    // 2. Rewrite main stylesheet with filemtime cache-buster
    if ($cssFile !== null) {
        $cssVer = (string)(@filemtime($assetsDir . '/' . $cssFile) ?: time());
        $cssPublicUrl = $prefixUrl . $cssFile . '?v=' . $cssVer;
        $html = preg_replace(
            '/href="\.\/assets\/[^"]+\.css(?:\?[^"]*)?"/',
            'href="' . $cssPublicUrl . '"',
            $html,
            1
        ) ?? $html;
    }

    // 3. Rewrite any remaining ./assets/ links (e.g. modulepreload chunk-*.js) to the public bundle prefix
    if ($publicPrefix !== '') {
        $html = str_replace(
            ['href="./assets/', 'src="./assets/'],
            ['href="' . $prefixUrl, 'src="' . $prefixUrl],
            $html
        );
    }

    echo $html;
    return true;
}

if (gkServeBuiltHtml(__DIR__ . '/site', 'site')) {
    exit;
}

if (gkServeBuiltHtml(__DIR__ . '/dist', 'dist')) {
    exit;
}

if (gkServeBuiltHtml(__DIR__, '')) {
    exit;
}

$siteAssetsList = gkListDirBrief(__DIR__ . '/site/assets');
$distAssetsList = gkListDirBrief(__DIR__ . '/dist/assets');

http_response_code(503);
echo '<!doctype html><html lang="ru"><head><meta charset="UTF-8"><title>Geek — Ошибка сборки</title></head>'
    . '<body style="background:#0b0714;color:#e2e8f0;font-family:system-ui,sans-serif;padding:40px;text-align:center;line-height:1.6;">'
    . '<div style="max-width:600px;margin:40px auto;padding:24px;border:1px solid rgba(0,240,255,0.35);border-radius:14px;background:#0f0b1d;">'
    . '<h1 style="margin:0 0 12px;color:#00f0ff;font-size:22px;">Geek — Не найден JS-бандл (app.js)</h1>'
    . '<p style="margin:0 0 10px;">В папках <code>site/assets/</code> и <code>dist/assets/</code> не найден файл <code>app.js</code>.</p>'
    . '<p style="margin:0 0 12px;padding:10px;border-radius:8px;background:#050814;border:1px solid rgba(255,42,133,0.3);font-family:monospace;font-size:12px;color:#cbd5e1;text-align:left;">'
    . 'site/assets: ' . htmlspecialchars($siteAssetsList, ENT_QUOTES, 'UTF-8') . '<br>'
    . 'dist/assets: ' . htmlspecialchars($distAssetsList, ENT_QUOTES, 'UTF-8')
    . '</p>'
    . '<p style="margin:0;color:#94a3b8;font-size:14px;">Загрузите обновлённую папку <code>site/assets/</code> целиком из архива проекта.</p>'
    . '</div></body></html>';

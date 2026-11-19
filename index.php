<?php
declare(strict_types=1);

/**
 * Точка входа для REG.RU Host-0 при загрузке всего архива проекта в корень домена.
 * Отдаёт готовую скомпилированную версию из site/index.html, автоматически подставляет
 * актуальные файлы ассетов (app.js / app.css или свежие index-*.js / index-*.css)
 * с cache-busting по filemtime, и показывает понятную диагностику, если site/assets/ пуста.
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
        http_response_code(503);
        echo '<!doctype html><html lang="ru"><head><meta charset="UTF-8"><title>Geek — Ошибка сборки</title></head>'
            . '<body style="background:#0b0714;color:#e2e8f0;font-family:system-ui,sans-serif;padding:40px;text-align:center;">'
            . '<h1 style="color:#00f0ff;">Geek — Не найден JS-бандл в ' . htmlspecialchars($publicPrefix, ENT_QUOTES, 'UTF-8') . '/assets/</h1>'
            . '<p>Папка <code>' . htmlspecialchars($publicPrefix, ENT_QUOTES, 'UTF-8') . '/assets/</code> существует, но в ней нет <code>app.js</code> (или <code>index-*.js</code>).</p>'
            . '<p style="color:#94a3b8;font-size:14px;">Загрузите на хостинг всю папку <code>site/assets/</code> из архива проекта.</p>'
            . '</body></html>';
        return true;
    }

    $jsVer = (string)(@filemtime($assetsDir . '/' . $jsFile) ?: time());
    $jsPublicUrl = './' . $publicPrefix . '/assets/' . $jsFile . '?v=' . $jsVer;
    $html = preg_replace(
        '/src="\.\/assets\/[^"]+\.js(?:\?[^"]*)?"/',
        'src="' . $jsPublicUrl . '"',
        $html,
        1
    ) ?? $html;

    if ($cssFile !== null) {
        $cssVer = (string)(@filemtime($assetsDir . '/' . $cssFile) ?: time());
        $cssPublicUrl = './' . $publicPrefix . '/assets/' . $cssFile . '?v=' . $cssVer;
        $html = preg_replace(
            '/href="\.\/assets\/[^"]+\.css(?:\?[^"]*)?"/',
            'href="' . $cssPublicUrl . '"',
            $html,
            1
        ) ?? $html;
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

http_response_code(503);
echo '<!doctype html><html lang="ru"><head><meta charset="UTF-8"><title>Geek</title></head>'
    . '<body style="background:#0b0714;color:#e2e8f0;font-family:system-ui,sans-serif;padding:40px;text-align:center;">'
    . '<h1 style="color:#00f0ff;">Geek — Не найдена папка site/</h1>'
    . '<p>Загрузите весь архив проекта (вместе с папкой <code>site/</code>) либо содержимое папки <code>site/</code> в корень домена.</p>'
    . '</body></html>';

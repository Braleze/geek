<?php
declare(strict_types=1);

/**
 * Точка входа для REG.RU Host-0 при загрузке всего архива проекта в корень домена.
 * Отдаёт готовую скомпилированную версию из site/index.html и автоматически подставляет
 * актуальные файлы ассетов из site/assets/ (даже если index.html ссылался на старый хеш).
 */

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('X-Content-Type-Options: nosniff');

function gkPickLatestAsset(string $assetsDir, string $pattern): ?string {
    $matches = @glob($assetsDir . '/' . $pattern);
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
    if (@is_dir($assetsDir)) {
        if (preg_match('/src="\.\/assets\/([^"]+\.js)"/', $html, $jsMatch)) {
            $refJs = $jsMatch[1];
            $latestJs = gkPickLatestAsset($assetsDir, 'index-*.js');
            if ($latestJs !== null && (!@is_file($assetsDir . '/' . $refJs) || $latestJs !== $refJs)) {
                $html = str_replace('src="./assets/' . $refJs . '"', 'src="./assets/' . $latestJs . '"', $html);
            }
        }
        if (preg_match('/href="\.\/assets\/([^"]+\.css)"/', $html, $cssMatch)) {
            $refCss = $cssMatch[1];
            $latestCss = gkPickLatestAsset($assetsDir, 'index-*.css');
            if ($latestCss !== null && (!@is_file($assetsDir . '/' . $refCss) || $latestCss !== $refCss)) {
                $html = str_replace('href="./assets/' . $refCss . '"', 'href="./assets/' . $latestCss . '"', $html);
            }
        }
    }

    $html = str_replace(
        ['src="./assets/', 'href="./assets/'],
        ['src="./' . $publicPrefix . '/assets/', 'href="./' . $publicPrefix . '/assets/'],
        $html
    );

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

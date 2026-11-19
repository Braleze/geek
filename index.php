<?php
declare(strict_types=1);

/**
 * Точка входа для REG.RU Host-0 при загрузке всего архива проекта в корень домена.
 * Отдаёт готовую скомпилированную версию из site/index.html и направляет ассеты в ./site/assets/.
 */

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('X-Content-Type-Options: nosniff');

$siteIndex = __DIR__ . '/site/index.html';
if (@is_file($siteIndex) && @is_readable($siteIndex)) {
    $html = file_get_contents($siteIndex);
    if (is_string($html) && $html !== '') {
        $html = str_replace(
            ['src="./assets/', 'href="./assets/'],
            ['src="./site/assets/', 'href="./site/assets/'],
            $html
        );
        echo $html;
        exit;
    }
}

$distIndex = __DIR__ . '/dist/index.html';
if (@is_file($distIndex) && @is_readable($distIndex)) {
    $html = file_get_contents($distIndex);
    if (is_string($html) && $html !== '') {
        $html = str_replace(
            ['src="./assets/', 'href="./assets/'],
            ['src="./dist/assets/', 'href="./dist/assets/'],
            $html
        );
        echo $html;
        exit;
    }
}

http_response_code(503);
echo '<!doctype html><html lang="ru"><head><meta charset="UTF-8"><title>Geek</title></head>'
    . '<body style="background:#0b0714;color:#e2e8f0;font-family:system-ui,sans-serif;padding:40px;text-align:center;">'
    . '<h1 style="color:#00f0ff;">Geek — Не найдена папка site/</h1>'
    . '<p>Загрузите весь архив проекта (вместе с папкой <code>site/</code>) либо содержимое папки <code>site/</code> в корень домена.</p>'
    . '</body></html>';

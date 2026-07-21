<?php
/**
 * Storage Diagnostic Script
 * Upload to PUBLIC folder, run once, DELETE.
 * URL: https://pmsv2.api.techxaro.com/fix-storage.php
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

$basePath = dirname(__FILE__);
$publicStorage = $basePath . '/storage';
$realStorage   = $basePath . '/../storage/app/public';
$docDir        = 'user_documents';

echo "<h1>Storage Diagnostic</h1>";

// 1. Check paths
echo "<h2>1. Path Check</h2>";
echo "<p>Script location: " . htmlspecialchars(__FILE__) . "</p>";
echo "<p>basePath: " . htmlspecialchars($basePath) . "</p>";
echo "<p>public/storage: " . htmlspecialchars($publicStorage) . "</p>";
echo "<p>storage/app/public: " . htmlspecialchars(realpath($realStorage) ?: $realStorage) . "</p>";

// 2. Symlink check
echo "<h2>2. public/storage Status</h2>";
if (is_link($publicStorage)) {
    echo "<p style='color:green'>IS A SYMLINK</p>";
    echo "<p>Target: " . readlink($publicStorage) . "</p>";
    echo "<p>Readable: " . (is_readable($publicStorage) ? 'YES' : 'NO - BROKEN!') . "</p>";
} elseif (is_dir($publicStorage)) {
    echo "<p style='color:orange'>IS A REAL DIRECTORY (not symlink)</p>";
    $items = glob($publicStorage . '/*');
    echo "<p>Contains: " . count($items) . " items</p>";
} else {
    echo "<p style='color:red'>DOES NOT EXIST</p>";
}

echo "<p>storage/app/public exists: " . (is_dir($realStorage) ? 'YES' : 'NO') . "</p>";

// 3. PHP settings
echo "<h2>3. PHP Settings</h2>";
echo "<p>open_basedir: " . (ini_get('open_basedir') ?: 'NOT SET') . "</p>";

// 4. Check User 110 files in BOTH locations
echo "<h2>4. User 110 Files</h2>";

$locations = [
    'public/storage' => $publicStorage . '/' . $docDir . '/110',
    'storage/app/public' => $realStorage . '/' . $docDir . '/110',
];

foreach ($locations as $label => $dir) {
    echo "<h3>$label:</h3>";
    if (is_dir($dir)) {
        echo "<p style='color:green'>Directory EXISTS</p>";
        $files = glob($dir . '/*');
        echo "<p>Files: " . count($files) . "</p>";
        foreach ($files as $f) {
            echo "<p style='margin-left:20px'>- " . basename($f) . " (" . number_format(filesize($f)) . " bytes)</p>";
        }
    } else {
        echo "<p style='color:red'>Directory NOT FOUND</p>";
    }
}

// 5. List ALL user_documents directories
echo "<h2>5. All user_documents directories</h2>";

foreach (['public/storage', 'storage/app/public'] as $label) {
    $base = ($label === 'public/storage') ? $publicStorage : $realStorage;
    $docPath = $base . '/' . $docDir;
    echo "<h3>$label/user_documents/:</h3>";
    if (is_dir($docPath)) {
        $dirs = glob($docPath . '/*', GLOB_ONLYDIR);
        sort($dirs, SORT_NUMERIC);
        echo "<p>Total user folders: " . count($dirs) . "</p>";
        foreach ($dirs as $d) {
            $userId = basename($d);
            $files = glob($d . '/*');
            echo "<p style='margin-left:10px'>User $userId: " . count($files) . " files</p>";
        }
    } else {
        echo "<p style='color:red'>NOT FOUND</p>";
    }
}

// 6. open_basedir safe mode check
echo "<h2>6. Safe Mode Check</h2>";
$ob = ini_get('open_basedir');
if ($ob) {
    $paths = explode(':', $ob);
    echo "<p>open_basedir restrictions: " . implode(', ', $paths) . "</p>";
    $projectParent = dirname($basePath);
    $allowed = false;
    foreach ($paths as $p) {
        $p = trim($p);
        if (strpos($projectParent, $p) === 0 || strpos($basePath, $p) === 0) {
            $allowed = true;
        }
    }
    echo "<p>Project accessible: " . ($allowed ? '<span style="color:green">YES</span>' : '<span style="color:red">NO</span>') . "</p>";
} else {
    echo "<p>No open_basedir restriction</p>";
}

echo "<hr><p style='color:red;font-weight:bold;'>DELETE this file immediately after use!</p>";

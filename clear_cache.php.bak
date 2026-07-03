<?php
echo "<h2>PMS Cache Clear Script</h2>";

function rrmdir($dir) {
    if (is_dir($dir)) {
        $objects = scandir($dir);
        foreach ($objects as $object) {
            if ($object != "." && $object != "..") {
                if (is_dir($dir . "/" . $object))
                    rrmdir($dir . "/" . $object);
                else
                    unlink($dir . "/" . $object);
            }
        }
        rmdir($dir);
    }
}

// 1. Show current .env values
$envPaths = [
    __DIR__ . '/.env',
    dirname(__DIR__) . '/.env',
];

$dotenvPath = null;
foreach ($envPaths as $path) {
    if (file_exists($path)) {
        $dotenvPath = $path;
        break;
    }
}

echo "<p><b>.env path:</b> " . ($dotenvPath ?: 'NOT FOUND') . "</p>";

if ($dotenvPath) {
    $envContent = file_get_contents($dotenvPath);
    $keys = ['FRONTEND_URL', 'APP_URL', 'APP_ENV', 'DB_DATABASE', 'DB_USERNAME'];
    foreach ($keys as $key) {
        if (preg_match('/^' . preg_quote($key) . '=(.+)/m', $envContent, $matches)) {
            echo "<p><b>$key:</b> <span style='color:green'>" . trim($matches[1]) . "</span></p>";
        }
    }
} else {
    echo "<p style='color:red;font-size:18px'>ERROR: .env file NOT FOUND!</p>";
}

echo "<hr><h3>Clearing caches...</h3>";

// 2. Clear bootstrap/cache
$cacheDir = __DIR__ . '/bootstrap/cache';
if (is_dir($cacheDir)) {
    $files = glob($cacheDir . '/*');
    $count = 0;
    foreach ($files as $file) {
        if (is_file($file)) {
            unlink($file);
            echo "<p>Deleted: " . basename($file) . "</p>";
            $count++;
        }
    }
    echo "<p style='color:green'>bootstrap/cache cleared! ($count files deleted)</p>";
} else {
    echo "<p style='color:orange'>bootstrap/cache not found at root, checking subfolders...</p>";
}

// 3. Clear storage/framework/cache
$storageCache = __DIR__ . '/storage/framework/cache/data';
if (is_dir($storageCache)) {
    rrmdir($storageCache);
    mkdir($storageCache, 0775, true);
    echo "<p style='color:green'>storage/cache cleared!</p>";
}

// 4. Clear compiled views
$viewsDir = __DIR__ . '/storage/framework/views';
if (is_dir($viewsDir)) {
    $files = glob($viewsDir . '/*');
    foreach ($files as $file) {
        if (is_file($file)) unlink($file);
    }
    echo "<p style='color:green'>Compiled views cleared!</p>";
}

// 5. Create .user.ini to disable OPcache
$userIni = __DIR__ . '/.user.ini';
file_put_contents($userIni, "opcache.enable=0\nopcache.validate_timestamps=1\nopcache.revalidate_freq=0\n");
echo "<p style='color:green'>OPcache disabled via .user.ini</p>";

echo "<hr>";
echo "<h3 style='color:green'>DONE! Ab ye karo:</h3>";
echo "<ol>";
echo "<li><b>Ctrl + Shift + R</b> se browser cache clear karo</li>";
echo "<li>Ya <b>Incognito/Private window</b> mein website kholo</li>";
echo "<li>Phir <b>clear_cache.php</b> file DELETE kar dena!</li>";
echo "</ol>";

<?php
/**
 * Fix all issues: migrations + storage link + cache clear.
 * Upload to cPanel PUBLIC folder, run ONCE, then DELETE.
 * URL: https://pmsv2.api.techxaro.com/run-all-temp.php
 */

$basePath = dirname(__DIR__);
echo "<h2>Fix: " . htmlspecialchars($basePath) . "</h2>";

echo "<h2>1. Running Migrations</h2>";
$output = []; $returnCode = 0;
exec("cd " . escapeshellarg($basePath) . " && php artisan migrate --force 2>&1", $output, $returnCode);
echo "<pre>" . htmlspecialchars(implode("\n", $output)) . "</pre>";
echo $returnCode === 0 ? "<p style='color:green'> Done</p>" : "<p style='color:red'> Failed</p>";

echo "<h2>2. Storage Link Setup</h2>";
$publicStorage = $basePath . '/public/storage';
$targetStorage = $basePath . '/storage/app/public';

// Remove old real directory if it exists (from previous run)
if (file_exists($publicStorage) && is_dir($publicStorage) && !is_link($publicStorage)) {
    echo "<p>Removing old real directory: $publicStorage</p>";
    exec("rm -rf " . escapeshellarg($publicStorage));
}

// Try php artisan storage:link
exec("cd " . escapeshellarg($basePath) . " && php artisan storage:link 2>&1", $linkOutput, $linkCode);
echo "<pre>" . htmlspecialchars(implode("\n", $linkOutput)) . "</pre>";

if ($linkCode === 0) {
    echo "<p style='color:green'> Symlink created successfully</p>";
} else {
    echo "<p style='color:orange'> Fallback: creating real directory with permissions</p>";
    if (!is_dir($publicStorage)) {
        @mkdir($publicStorage, 0777, true);
        @chmod($publicStorage, 0777);
    }
}

// Set permissions on target
if (is_dir($targetStorage)) {
    @chmod($targetStorage, 0777);
    echo "<p>Permissions set on: $targetStorage</p>";
}

echo "<h2>3. Clearing Cache</h2>";
exec("cd " . escapeshellarg($basePath) . " && php artisan config:clear && php artisan route:clear && php artisan view:clear && php artisan cache:clear 2>&1", $clearOutput);
echo "<pre>" . htmlspecialchars(implode("\n", $clearOutput)) . "</pre>";

echo "<h2>4. Storage Diagnostics</h2>";
echo "<p>public/storage exists: " . (file_exists($publicStorage) ? 'YES' : 'NO') . "</p>";
echo "<p>public/storage is link: " . (is_link($publicStorage) ? 'YES (symlink)' : 'NO (real directory)') . "</p>";
echo "<p>public/storage writable: " . (is_writable($publicStorage) ? 'YES' : 'NO') . "</p>";
echo "<p>storage/app/public exists: " . (is_dir($targetStorage) ? 'YES' : 'NO') . "</p>";
echo "<p>storage/app/public writable: " . (is_writable($targetStorage) ? 'YES' : 'NO') . "</p>";

echo "<p style='font-weight:bold;margin-top:20px;color:red;'> DELETE this file immediately after run!</p>";

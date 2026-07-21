<?php
/**
 * Storage Diagnostic & Fix Script for HostArmada
 * Upload to the project root (NOT public), run once, then DELETE.
 *
 * This script:
 * 1. Checks symlink status
 * 2. Finds all user_documents in both locations
 * 3. Copies files from public/storage to storage/app/public if needed
 * 4. Checks specific user 110 documents
 */

$basePath = dirname(__FILE__);
$publicStorage = $basePath . '/public/storage';
$realStorage   = $basePath . '/storage/app/public';
$docDir        = 'user_documents';

echo "<h1>Storage Diagnostic & Fix</h1>";

// 1. Symlink check
echo "<h2>1. Symlink Status</h2>";
if (is_link($publicStorage)) {
    echo "<p style='color:green'>public/storage is a SYMLINK</p>";
    echo "<p>Target: " . readlink($publicStorage) . "</p>";
    echo "<p>Readable: " . (is_readable($publicStorage) ? 'YES' : 'NO - BROKEN!') . "</p>";
} elseif (is_dir($publicStorage)) {
    echo "<p style='color:orange'>public/storage is a REAL DIRECTORY (not symlink)</p>";
    $count = count(glob($publicStorage . '/*'));
    echo "<p>Contains $count items</p>";
} else {
    echo "<p style='color:red'>public/storage DOES NOT EXIST</p>";
}

echo "<p>storage/app/public exists: " . (is_dir($realStorage) ? 'YES' : 'NO') . "</p>";
echo "<p>open_basedir: " . (ini_get('open_basedir') ?: 'NOT SET (unrestricted)') . "</p>";

// 2. List user 110 documents
echo "<h2>2. User 110 (techxaro_regulations) Documents</h2>";

$user110File = 'techxaro_regulations_1783401029_TECHXARO REGULATIONS Strict Policies, Conduct Code, And Procedures signed.pdf';
$paths = [
    "public/storage/$docDir/110/$user110File",
    "storage/app/public/$docDir/110/$user110File",
];

foreach ($paths as $p) {
    $full = $basePath . '/' . $p;
    $exists = file_exists($full);
    echo "<p><strong>$p:</strong> " . ($exists ? "<span style='color:green'>EXISTS (" . filesize($full) . " bytes)</span>" : "<span style='color:red'>NOT FOUND</span>") . "</p>";
}

// List ALL files for user 110
echo "<h3>All files for user 110:</h3>";
foreach ([$realStorage, $publicStorage] as $location) {
    $dir = "$location/$docDir/110";
    $label = str_replace($basePath . '/', '', $location);
    if (is_dir($dir)) {
        echo "<p><strong>$label:</strong></p>";
        foreach (glob($dir . '/*') as $f) {
            echo "<p style='margin-left:20px'>- " . basename($f) . " (" . filesize($f) . " bytes)</p>";
        }
    } else {
        echo "<p><strong>$label/$docDir/110:</strong> directory does not exist</p>";
    }
}

// 3. Compare both locations
echo "<h2>3. Files Only in public/storage (not in storage/app/public)</h2>";
$moved = 0;
if (is_dir("$publicStorage/$docDir")) {
    $allFiles = new RecursiveIteratorIterator(new RecursiveDirectoryIterator("$publicStorage/$docDir"));
    foreach ($allFiles as $file) {
        if ($file->isFile()) {
            $relative = str_replace($publicStorage . '/', '', $file->getPathname());
            $target = "$realStorage/$docDir/$relative";
            if (!file_exists($target)) {
                echo "<p style='color:orange'>EXISTS in public/storage but NOT in storage/app/public: $relative</p>";
            }
        }
    }
} else {
    echo "<p>public/storage/$docDir does not exist</p>";
}

// 4. Files only in storage/app/public (not in public/storage)
echo "<h2>4. Files in storage/app/public (correct location)</h2>";
$totalFiles = 0;
$totalSize = 0;
if (is_dir("$realStorage/$docDir")) {
    $allFiles = new RecursiveIteratorIterator(new RecursiveDirectoryIterator("$realStorage/$docDir"));
    foreach ($allFiles as $file) {
        if ($file->isFile()) {
            $totalFiles++;
            $totalSize += $file->getSize();
        }
    }
    echo "<p>Total files: $totalFiles</p>";
    echo "<p>Total size: " . number_format($totalSize / 1024 / 1024, 2) . " MB</p>";

    // List user directories
    $userDirs = glob("$realStorage/$docDir/*", GLOB_ONLYDIR);
    echo "<p>User directories: " . count($userDirs) . "</p>";
} else {
    echo "<p style='color:red'>storage/app/public/$docDir does NOT exist!</p>";
}

// 5. Summary & Fix recommendation
echo "<h2>5. Summary</h2>";
echo "<p>The fix changes the filesystem config from <code>public_path('storage')</code> to <code>storage_path('app/public')</code>.</p>";
echo "<p>This means Laravel will read/write directly to <strong>storage/app/public/</strong> without needing the symlink.</p>";
echo "<p>After deploying the code change, existing files in <strong>storage/app/public/user_documents/</strong> will be found correctly.</p>";

if (is_dir("$publicStorage/$docDir") && !is_link($publicStorage)) {
    echo "<p style='color:orange;font-weight:bold;'>WARNING: public/storage is a REAL directory, not a symlink. You may need to manually copy files from public/storage/user_documents to storage/app/public/user_documents.</p>";
    echo "<p><a href='?action=copy' style='color:blue;font-weight:bold;'>Click here to copy files from public/storage to storage/app/public</a></p>";
}

// 6. Execute copy if requested
if (isset($_GET['action']) && $_GET['action'] === 'copy' && is_dir("$publicStorage/$docDir")) {
    echo "<h2>6. Copying files...</h2>";
    $allFiles = new RecursiveIteratorIterator(new RecursiveDirectoryIterator("$publicStorage/$docDir"));
    $copied = 0;
    foreach ($allFiles as $file) {
        if ($file->isFile()) {
            $relative = str_replace($publicStorage . '/', '', $file->getPathname());
            $target = "$realStorage/$docDir/$relative";
            if (!file_exists($target)) {
                $targetDir = dirname($target);
                if (!is_dir($targetDir)) {
                    mkdir($targetDir, 0755, true);
                }
                copy($file->getPathname(), $target);
                $copied++;
                echo "<p style='color:green'>Copied: $relative</p>";
            }
        }
    }
    echo "<p><strong>Copied $copied files</strong></p>";
}

echo "<hr><p style='color:red;font-weight:bold;'>DELETE this file after use!</p>";

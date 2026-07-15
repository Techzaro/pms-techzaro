<?php
/**
 * Check if specific files exist on disk.
 * Upload to cPanel public/, run once, DELETE.
 */

$basePath = dirname(__DIR__);
$symlinkPath = $basePath . '/public/storage';
$realPath = $basePath . '/storage/app/public';

echo "<h2>File Existence Check</h2>";

// Check the symlink
echo "<h3>Symlink Check:</h3>";
echo "<p>public/storage is_link: " . (is_link($symlinkPath) ? 'YES' : 'NO') . "</p>";
echo "<p>public/storage is_dir: " . (is_dir($symlinkPath) ? 'YES' : 'NO') . "</p>";
echo "<p>public/storage is_file: " . (is_file($symlinkPath) ? 'YES' : 'NO') . "</p>";

// Check specific files from the error logs
$filesToCheck = [
    'user_documents/121/offer_letter_1784031087_SEO Internship Offer Letter - Muhammad.pdf',
    'user_documents/121/other_document_1784031087_73819_Matric.jpeg',
    'user_documents/122/other_document_1784028555_67543_Resume - Syed Ali Raza.pdf',
];

echo "<h3>Checking Files via Storage Disk:</h3>";
foreach ($filesToCheck as $f) {
    $path1 = $symlinkPath . '/' . $f;
    $path2 = $realPath . '/' . $f;
    echo "<p><strong>$f</strong></p>";
    echo "<ul>";
    echo "<li>via symlink: " . (file_exists($path1) ? 'EXISTS' : 'NOT FOUND') . " | " . (is_readable($path1) ? 'readable' : 'NOT readable') . "</li>";
    echo "<li>via real path: " . (file_exists($path2) ? 'EXISTS' : 'NOT FOUND') . " | " . (is_readable($path2) ? 'readable' : 'NOT readable') . "</li>";
    echo "</ul>";
}

// Check PHP settings
echo "<h3>PHP Settings:</h3>";
echo "<p>open_basedir: " . ini_get('open_basedir') . "</p>";
echo "<p>upload_max_filesize: " . ini_get('upload_max_filesize') . "</p>";
echo "<p>post_max_size: " . ini_get('post_max_size') . "</p>";
echo "<p>upload_tmp_dir: " . ini_get('upload_tmp_dir') . "</p>";

// List user_documents directories
echo "<h3>user_documents directories (user 120-130):</h3>";
$docDir = $realPath . '/user_documents';
if (is_dir($docDir)) {
    $dirs = glob($docDir . '/1[2-3]*', GLOB_ONLYDIR);
    if (empty($dirs)) {
        echo "<p>No directories found for user 120-130</p>";
    } else {
        foreach ($dirs as $d) {
            $userId = basename($d);
            $files = glob($d . '/*');
            echo "<p>User $userId: " . count($files) . " files</p>";
            foreach ($files as $file) {
                echo "<p style='margin-left:20px'>- " . basename($file) . " (" . filesize($file) . " bytes)</p>";
            }
        }
    }
} else {
    echo "<p>user_documents directory NOT FOUND</p>";
}

echo "<hr><p style='color:red;font-weight:bold;'>DELETE this file immediately!</p>";

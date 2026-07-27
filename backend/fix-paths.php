<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$diskRoot = storage_path('app/public');
$fields = ['employment_contract', 'offer_letter', 'techxaro_regulations'];
$users = App\Models\User::all();
$fixed = 0;
$notFound = 0;

echo "<h1>Database Path Fix Script</h1>";
echo "<pre>";

foreach ($users as $u) {
    foreach ($fields as $f) {
        $path = $u->$f;
        if (!$path) continue;

        $full = $diskRoot . '/' . $path;

        if (!file_exists($full)) {
            $dir = $diskRoot . '/user_documents/' . $u->id . '/';
            if (is_dir($dir)) {
                $pattern = $f . '_*';
                $matches = glob($dir . $pattern);
                if (!empty($matches)) {
                    $newPath = 'user_documents/' . $u->id . '/' . basename($matches[0]);
                    $u->update([$f => $newPath]);
                    echo "FIXED: User {$u->id} - {$f}\n";
                    echo "  OLD: {$path}\n";
                    echo "  NEW: {$newPath}\n\n";
                    $fixed++;
                } else {
                    echo "NO FILE: User {$u->id} - {$f} (directory exists but no matching file)\n";
                    $notFound++;
                }
            } else {
                echo "NO DIR: User {$u->id} - {$f}\n";
                $notFound++;
            }
        }
    }
}

echo "\n=== SUMMARY ===\n";
echo "Total fixed: {$fixed}\n";
echo "Not found: {$notFound}\n";
echo "</pre>";
echo "<p style='color:red;font-weight:bold;'>DELETE THIS FILE AFTER USE!</p>";

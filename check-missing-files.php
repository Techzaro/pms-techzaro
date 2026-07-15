<?php
/**
 * Check which files are in database but missing from disk.
 * Upload to cPanel public/, run once, DELETE.
 */

$basePath = dirname(__DIR__);
require_once $basePath . '/vendor/autoload.php';
$app = require_once $basePath . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

echo "<h2>Missing Files Report</h2>";

$disk = Storage::disk('public');

$docFields = ['employment_contract', 'offer_letter', 'techxaro_regulations', 'cv', 'latest_education_cert', 'previous_exp_letter'];

echo "<h3>Checking user_documents...</h3>";

$users = DB::table('users')->select('id', 'name', ...$docFields)->get();

$missing = [];
$found = 0;

foreach ($users as $user) {
    foreach ($docFields as $field) {
        $path = $user->$field;
        if (empty($path)) continue;

        if (!$disk->exists($path)) {
            $missing[] = [
                'user_id' => $user->id,
                'name' => $user->name,
                'field' => $field,
                'path' => $path,
            ];
        } else {
            $found++;
        }
    }

    // Check other_document (JSON)
    if (!empty($user->other_document)) {
        $docs = json_decode($user->other_document, true);
        if (is_array($docs)) {
            foreach ($docs as $doc) {
                $docPath = is_array($doc) ? ($doc['path'] ?? null) : $doc;
                if (empty($docPath)) continue;

                if (!$disk->exists($docPath)) {
                    $missing[] = [
                        'user_id' => $user->id,
                        'name' => $user->name,
                        'field' => 'other_document',
                        'path' => $docPath,
                    ];
                } else {
                    $found++;
                }
            }
        }
    }
}

echo "<p><strong>Found on disk: $found</strong></p>";
echo "<p><strong>Missing from disk: " . count($missing) . "</strong></p>";

if (!empty($missing)) {
    echo "<h3>Missing Files:</h3>";
    echo "<table border='1' cellpadding='5' cellspacing='0'>";
    echo "<tr><th>User ID</th><th>Name</th><th>Field</th><th>Path</th></tr>";
    foreach ($missing as $m) {
        echo "<tr>";
        echo "<td>{$m['user_id']}</td>";
        echo "<td>" . htmlspecialchars($m['name']) . "</td>";
        echo "<td>{$m['field']}</td>";
        echo "<td style='font-size:11px'>" . htmlspecialchars($m['path']) . "</td>";
        echo "</tr>";
    }
    echo "</table>";
}

echo "<hr><p style='color:red;font-weight:bold;'>DELETE this file immediately!</p>";

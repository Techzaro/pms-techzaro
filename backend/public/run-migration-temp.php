<?php
/**
 * RUN MIGRATIONS - Upload to pmsv2.api.techxaro.com/public/, run once, then DELETE.
 */

$artisan = dirname(__DIR__) . '/artisan';

echo "<h3>Running: php artisan migrate</h3><pre>";

// Method 1: Try shell exec
$output = [];
$returnCode = 0;
exec("php " . escapeshellarg($artisan) . " migrate --force 2>&1", $output, $returnCode);

echo implode("\n", $output);

if ($returnCode !== 0) {
    echo "\n--- Shell exec failed, trying alternative ---\n";

    // Method 2: Try proc_open
    $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $process = proc_open("php " . escapeshellarg($artisan) . " migrate --force", $descriptors, $pipes);
    if (is_resource($process)) {
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);
        echo $stdout;
        if ($stderr) echo "STDERR: " . $stderr;
    }
}

echo "</pre>";
echo "<p style='font-weight:bold;color:red;'>DELETE this file immediately!</p>";

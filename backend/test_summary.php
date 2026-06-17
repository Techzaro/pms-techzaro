<?php

require_once __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;
use App\Http\Controllers\EventController;
use Illuminate\Http\Request;

echo "=== UNIFIED SUMMARY ENDPOINT TEST ===\n\n";

// Get a test user
$user = User::first();
if (!$user) {
    echo "✗ FAIL: No users found in database\n";
    exit(1);
}

echo "Testing user: ID {$user->id} ({$user->name}), Role: {$user->role}\n\n";

// Instantiate the controller
$controller = new EventController();

// Simulate request
$request = Request::create('/api/unified-summary', 'GET', [
    'local_date' => '2026-06-16', // test date
]);
$request->setUserResolver(function () use ($user) {
    return $user;
});

try {
    $response = $controller->unifiedSummary($request);
    $data = json_decode($response->getContent(), true);

    if (isset($data['today']) && isset($data['upcoming'])) {
        echo "✓ PASS: Response contains 'today' and 'upcoming' keys\n";
        echo "Total today events: " . count($data['today']) . "\n";
        echo "Total upcoming events: " . count($data['upcoming']) . "\n\n";

        // Validate today events date logic
        $todayOk = true;
        foreach ($data['today'] as $ev) {
            $start = isset($ev['start_date']) ? explode('T', $ev['start_date'])[0] : null;
            if (!$start && isset($ev['date'])) {
                $start = explode('T', $ev['date'])[0];
            }
            $end = isset($ev['end_date']) ? explode('T', $ev['end_date'])[0] : $start;

            if ($start && $end) {
                if (!('2026-06-16' >= $start && '2026-06-16' <= $end)) {
                    echo "✗ FAIL: Event '{$ev['title']}' ({$ev['id']}) starts at {$start} and ends at {$end}, which does not cover 2026-06-16\n";
                    $todayOk = false;
                }
            }
        }
        if ($todayOk) {
            echo "✓ PASS: All events in 'today' are active on 2026-06-16\n";
        }

        // Validate upcoming events date logic
        $upcomingOk = true;
        foreach ($data['upcoming'] as $ev) {
            $start = isset($ev['start_date']) ? explode('T', $ev['start_date'])[0] : null;
            if (!$start && isset($ev['date'])) {
                $start = explode('T', $ev['date'])[0];
            }

            if ($start) {
                if ($start <= '2026-06-16') {
                    echo "✗ FAIL: Upcoming event '{$ev['title']}' ({$ev['id']}) starts at {$start}, which is not in the future\n";
                    $upcomingOk = false;
                }
            }
        }
        if ($upcomingOk) {
            echo "✓ PASS: All events in 'upcoming' start after 2026-06-16\n";
        }

    } else {
        echo "✗ FAIL: Response missing 'today' or 'upcoming' keys. Received: " . print_r($data, true) . "\n";
    }

} catch (\Exception $e) {
    echo "✗ ERROR: Exception thrown during execution: " . $e->getMessage() . "\n";
    echo $e->getTraceAsString() . "\n";
}

echo "\nTest complete!\n";

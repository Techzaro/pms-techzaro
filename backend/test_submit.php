<?php
$base = 'http://127.0.0.1:8000/api';

$opts = [
  'http' => [
    'method' => 'POST',
    'header' => "Content-Type: application/json\r\n",
    'content' => json_encode(['email'=>'admin@example.com','password'=>'password']),
    'ignore_errors' => true
  ]
];

$body = file_get_contents("$base/login", false, stream_context_create($opts));
echo "Login response: $body\n\n";
$r = json_decode($body, true);
if (!$r || empty($r['token'])) { echo "LOGIN FAILED\n"; exit(1); }

$token = $r['token'];
$userId = $r['user']['id'];

echo "User ID: $userId, Token: " . substr($token, 0, 20) . "...\n\n";

// Create task
$opts2 = $opts;
$opts2['http']['header'] = "Content-Type: application/json\r\nAuthorization: Bearer $token\r\n";
$opts2['http']['content'] = json_encode([
  'title' => 'Test Submit Task',
  'description' => 'Testing submission',
  'priority' => 'medium',
  'assigned_to' => [(string)$userId],
  'end_date' => '2026-07-16',
]);
$body2 = file_get_contents("$base/tasks", false, stream_context_create($opts2));
echo "Create task: $body2\n\n";
$r2 = json_decode($body2, true);
$taskId = $r2['task']['id'] ?? 0;
echo "Task ID: $taskId\n\n";

// Submit
if ($taskId) {
  $opts3 = $opts2;
  $opts3['http']['content'] = json_encode(['comment' => 'test submission']);
  $body3 = file_get_contents("$base/tasks/$taskId/submit", false, stream_context_create($opts3));
  echo "Submit response: $body3\n";
}

<?php
$base = 'http://127.0.0.1:8000/api';

$opts = [
  'http' => [
    'method' => 'POST',
    'header' => "Content-Type: application/json\r\n",
    'content' => json_encode(['email'=>'admin@test.com','password'=>'password']),
    'ignore_errors' => true
  ]
];
$body = file_get_contents("$base/login", false, stream_context_create($opts));
echo "Login: $body\n\n";
$r = json_decode($body, true);
$token = $r['token'] ?? '';
if (!$token) { echo "Login failed\n"; exit; }

// Get tasks list
$opts2 = $opts;
$opts2['http']['method'] = 'GET';
$opts2['http']['header'] = "Authorization: Bearer $token\r\n";
unset($opts2['http']['content']);
$tasks = file_get_contents("$base/tasks", false, stream_context_create($opts2));
echo "Tasks response: " . substr($tasks, 0, 300) . "\n\n";

// Get first task details
$tasksData = json_decode($tasks, true);
$firstTaskId = $tasksData['data'][0]['id'] ?? 0;
if ($firstTaskId) {
  $detail = file_get_contents("$base/tasks/$firstTaskId", false, stream_context_create($opts2));
  $detailData = json_decode($detail, true);
  echo "Task detail keys with perm:\n";
  $t = $detailData['task'] ?? [];
  echo "  can_edit: " . json_encode($t['can_edit'] ?? 'MISSING') . "\n";
  echo "  can_submit: " . json_encode($t['can_submit'] ?? 'MISSING') . "\n";
  echo "  is_creator: " . json_encode($t['is_creator'] ?? 'MISSING') . "\n";
  echo "  is_assignee: " . json_encode($t['is_assignee'] ?? 'MISSING') . "\n";
  echo "  assigned_by: " . ($t['assigned_by'] ?? 'MISSING') . "\n";
}

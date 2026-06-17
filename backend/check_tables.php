<?php
try {
  $pdo = new PDO('mysql:host=127.0.0.1;dbname=pms_techxaro', 'root', '');
  $r = $pdo->query("SHOW TABLES LIKE 'task_files'");
  echo "task_files: " . ($r->fetch() ? 'EXISTS' : 'MISSING') . "\n";
  $r = $pdo->query("SHOW TABLES LIKE 'project_submissions'");
  echo "project_submissions: " . ($r->fetch() ? 'EXISTS' : 'MISSING') . "\n";
  $r = $pdo->query("SHOW TABLES LIKE 'task_submissions'");
  echo "task_submissions: " . ($r->fetch() ? 'EXISTS' : 'MISSING') . "\n";
  $r = $pdo->query("SHOW TABLES LIKE 'task_workflow_events'");
  echo "task_workflow_events: " . ($r->fetch() ? 'EXISTS' : 'MISSING') . "\n";
  $r = $pdo->query("SHOW TABLES LIKE 'submission_attachments'");
  echo "submission_attachments: " . ($r->fetch() ? 'EXISTS' : 'MISSING') . "\n";
  $r = $pdo->query("SHOW TABLES LIKE 'deliverable_workflow_events'");
  echo "deliverable_workflow_events: " . ($r->fetch() ? 'EXISTS' : 'MISSING') . "\n";
} catch (Exception $e) {
  echo "Error: " . $e->getMessage();
}

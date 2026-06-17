<?php
try {
  $pdo = new PDO('mysql:host=127.0.0.1;dbname=pms_techxaro', 'root', '');
  $r = $pdo->query('SELECT id, name, email, password FROM users');
  echo "Users in DB:\n";
  foreach ($r as $row) {
    echo "  ID:{$row['id']} Name:{$row['name']} Email:{$row['email']} Password:{$row['password']}\n";
    echo "  Password hash check (password): " . (password_verify('password', $row['password']) ? 'MATCHES' : 'NO MATCH') . "\n";
  }
  echo "Total users: " . $r->rowCount() . "\n";
} catch (Exception $e) {
  echo "Error: " . $e->getMessage() . "\n";
}

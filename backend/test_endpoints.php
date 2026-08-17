<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

// Test 1: branding endpoint
$req = Illuminate\Http\Request::create('/api/organization-settings/branding', 'GET');
$req->headers->set('Accept', 'application/json');
$req->headers->set('Authorization', 'Bearer test');
$req->headers->set('X-Tenant-ID', 'farhan-cor');
$resp = $kernel->handle($req);
echo "Branding: " . $resp->getStatusCode() . "\n";
echo substr($resp->getContent(), 0, 500) . "\n\n";

// Test 2: unread-count endpoint
$req2 = Illuminate\Http\Request::create('/api/notifications/unread-count', 'GET');
$req2->headers->set('Accept', 'application/json');
$req2->headers->set('Authorization', 'Bearer test');
$req2->headers->set('X-Tenant-ID', 'farhan-cor');
$resp2 = $kernel->handle($req2);
echo "Unread count: " . $resp2->getStatusCode() . "\n";
echo substr($resp2->getContent(), 0, 500) . "\n";

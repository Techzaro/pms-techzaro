<?php

namespace App\Listeners;

use App\Services\AuditService;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\Request;

class LogAuthenticationEvents
{
    private AuditService $auditService;

    public function __construct(AuditService $auditService)
    {
        $this->auditService = $auditService;
    }

    public function handleLogin(Login $event): void
    {
        $this->auditService->log(
            module: 'auth',
            action: 'login',
            description: "User {$event->user->name} logged in",
            user: $event->user,
            status: 'success'
        );
    }

    public function handleLogout(Logout $event): void
    {
        if ($event->user) {
            $this->auditService->log(
                module: 'auth',
                action: 'logout',
                description: "User {$event->user->name} logged out",
                user: $event->user,
                status: 'success'
            );
        }
    }

    public function handleFailedLogin(Failed $event): void
    {
        $this->auditService->log(
            module: 'auth',
            action: 'failed_login',
            description: "Failed login attempt for " . ($event->credentials['email'] ?? 'unknown'),
            status: 'failed'
        );
    }

    public function handlePasswordReset(PasswordReset $event): void
    {
        $this->auditService->log(
            module: 'auth',
            action: 'password_reset',
            description: "User {$event->user->name} reset their password",
            user: $event->user,
            status: 'success'
        );
    }
}

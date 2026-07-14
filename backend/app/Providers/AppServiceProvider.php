<?php

namespace App\Providers;

use App\Listeners\LogAuthenticationEvents;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(\App\Services\AuditService::class);
        $this->app->singleton(\App\Services\AuditExportService::class);
    }

    public function boot(): void
    {
        Event::listen(Login::class, [LogAuthenticationEvents::class, 'handleLogin']);
        Event::listen(Logout::class, [LogAuthenticationEvents::class, 'handleLogout']);
        Event::listen(Failed::class, [LogAuthenticationEvents::class, 'handleFailedLogin']);
        Event::listen(PasswordReset::class, [LogAuthenticationEvents::class, 'handlePasswordReset']);
    }
}

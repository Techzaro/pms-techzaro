<?php

namespace App\Providers;

use App\Listeners\LogAuthenticationEvents;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Auth\Events\PasswordReset;
use App\Models\KnowledgeBase;
use App\Models\Task;
use App\Models\Deliverable;
use App\Policies\KnowledgeBasePolicy;
use App\Policies\TaskPolicy;
use App\Policies\DeliverablePolicy;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(\App\Services\AuditService::class);
        $this->app->singleton(\App\Services\AuditExportService::class);
        $this->app->singleton(\App\Services\DraftService::class);
        $this->app->singleton(\App\Services\Saas\Infrastructure\TenantCacheManager::class);
    }

    public function boot(): void
    {
        Gate::policy(KnowledgeBase::class, KnowledgeBasePolicy::class);
        Gate::policy(Task::class, TaskPolicy::class);
        Gate::policy(Deliverable::class, DeliverablePolicy::class);

        Event::listen(Login::class, [LogAuthenticationEvents::class, 'handleLogin']);
        Event::listen(Logout::class, [LogAuthenticationEvents::class, 'handleLogout']);
        Event::listen(Failed::class, [LogAuthenticationEvents::class, 'handleFailedLogin']);
        Event::listen(PasswordReset::class, [LogAuthenticationEvents::class, 'handlePasswordReset']);
    }
}

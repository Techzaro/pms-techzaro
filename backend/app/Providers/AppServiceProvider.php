<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

/**
 * Bootstrap and register application-wide services.
 *
 * This is the primary service provider for the application.
 * Use boot() for shared bindings and register() for container bindings.
 */
class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services into the container.
     *
     * @return void
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services (run on every request).
     *
     * @return void
     */
    public function boot(): void
    {
        //
    }
}

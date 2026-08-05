<?php

use App\Providers\AppServiceProvider;
use App\Providers\TenantServiceProvider;
use App\Providers\TenantInfrastructureServiceProvider;

return [
    AppServiceProvider::class,
    TenantServiceProvider::class,
    TenantInfrastructureServiceProvider::class,
];

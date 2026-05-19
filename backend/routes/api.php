<?php

/**
 * API route definitions for the PMS backend.
 *
 * Public routes are available without authentication.
 * Protected routes require a valid Sanctum token.
 * Role-specific routes use RoleMiddleware to enforce access.
 */
use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\TeamController;

/*
| PUBLIC ROUTES
*/

// Login (no auth required)
Route::post('/login', [AuthController::class, 'login']);


/*
| PROTECTED ROUTES (Need Token)
*/

Route::middleware('auth:sanctum')->group(function () {

    // Logout
    Route::post('/logout', [AuthController::class, 'logout']);

    // Get logged in user
    Route::get('/user', function (Request $request) {
        return $request->user();
    });

    // Change password
    Route::put('/user/change-password', [AuthController::class, 'changePassword']);

    // User management (admin and manager)
    // RoleMiddleware is applied here so admins and managers may access user CRUD routes.
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::put('/users/{user}', [UserController::class, 'update']);
        Route::delete('/users/{user}', [UserController::class, 'destroy']);
    });

    // Get users for team management (all authenticated users)
    Route::get('/team-users', [UserController::class, 'getTeamUsers']);

    // Team management (all authenticated users)
    Route::get('/teams', [TeamController::class, 'index']);
    Route::post('/teams', [TeamController::class, 'store']);
    Route::put('/teams/{team}/leader', [TeamController::class, 'setLeader']);
    Route::post('/teams/{team}/members', [TeamController::class, 'addMember']);
    Route::delete('/teams/{team}/members/{user}', [TeamController::class, 'removeMember']);
    Route::delete('/teams/{team}', [TeamController::class, 'destroy']);

    // Project management (all authenticated users)
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::post('/projects', [ProjectController::class, 'store']);
    Route::get('/projects/{project}', [ProjectController::class, 'show']);
    Route::put('/projects/{project}', [ProjectController::class, 'update']);
    Route::patch('/projects/{project}', [ProjectController::class, 'patch']);
    Route::delete('/projects/{project}', [ProjectController::class, 'destroy']);
    Route::post('/projects/{project}/tasks', [TaskController::class, 'store']);
    Route::delete('/tasks/{task}', [TaskController::class, 'destroy']);

    /*
    | ROLE BASED ROUTES
    */

    // ADMIN ROUTES
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin')->group(function () {

        Route::get('/admin-dashboard', function () {
            return response()->json([
                'message' => 'Welcome Admin'
            ]);
        });

    });


    // MANAGER ROUTES
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':manager')->group(function () {

        Route::get('/manager-dashboard', function () {
            return response()->json([
                'message' => 'Welcome Manager'
            ]);
        });

    });


    // TEAM LEAD ROUTES
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':teamlead')->group(function () {

        Route::get('/teamlead-dashboard', function () {
            return response()->json([
                'message' => 'Welcome Team Lead'
            ]);
        });

    });


    // MEMBER ROUTES
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':member')->group(function () {

        Route::get('/member-dashboard', function () {
            return response()->json([
                'message' => 'Welcome Member'
            ]);
        });

    });

});
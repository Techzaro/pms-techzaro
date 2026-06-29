<?php

/**
 * Web route definitions for the PMS backend.
 * This file serves web pages for the PMS application.
 */
use Illuminate\Support\Facades\Route;

/*
| Web Routes
| Routes for web pages and views.
*/

// Welcome page (landing page)
Route::get('/', function () {
    return view('welcome');
});

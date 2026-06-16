<?php

/**
 * Web route definitions for the PMS backend.
 * This file serves web pages for the PMS application.
 */
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

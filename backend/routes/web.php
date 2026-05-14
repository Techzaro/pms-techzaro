<?php

/**
 * Web route definitions for the PMS backend.
 * This file currently serves the default welcome page.
 */
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

<?php

/**
 * Eloquent model for application users and authentication.
 */

namespace App\Models;

use Laravel\Sanctum\HasApiTokens;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * Eloquent model for application users.
 * Uses Sanctum tokens and standard authentication behavior.
 */
class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Mass Assignable Fields
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'active'
    ];

    /**
     * Hidden Fields
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Casts
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
        'active' => 'boolean',
    ];
}

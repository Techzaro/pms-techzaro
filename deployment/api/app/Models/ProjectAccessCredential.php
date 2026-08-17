<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

class ProjectAccessCredential extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'website_name',
        'website_url',
        'username',
        'password',
        'created_by',
    ];

    protected $hidden = [
        'password',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function assignedUsers()
    {
        return $this->belongsToMany(User::class, 'project_access_credential_user', 'credential_id', 'user_id');
    }

    public function setPasswordAttribute($value)
    {
        $this->attributes['password'] = Crypt::encryptString($value);
    }

    public function getPasswordDecryptedAttribute()
    {
        try {
            return Crypt::decryptString($this->attributes['password']);
        } catch (\Exception $e) {
            return '';
        }
    }
}

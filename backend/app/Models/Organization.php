<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
class Organization extends Model
{
    use SoftDeletes;
    protected $guarded = [];
    protected $casts = [ 'settings' => 'array', 'trial_ends_at' => 'datetime', 'suspended_at' => 'datetime' ];
    public function applicationTypes() { return $this->hasMany(HrmApplicationType::class); }
}

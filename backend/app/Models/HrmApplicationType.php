<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
class HrmApplicationType extends Model
{
    protected $guarded = [];
    protected static function booted() {
        static::addGlobalScope('organization', function (Builder $builder) {
            if (auth()->check() && auth()->user()->organization_id) {
                $builder->where('organization_id', auth()->user()->organization_id);
            }
        });
    }
    public function fields() { return $this->hasMany(HrmApplicationField::class, 'application_type_id'); }
}

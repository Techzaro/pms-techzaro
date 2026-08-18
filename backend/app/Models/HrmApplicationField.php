<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
class HrmApplicationField extends Model
{
    protected $guarded = [];
    protected $casts = [ 'options' => 'array', 'is_required' => 'boolean' ];
    protected static function booted() {
        static::addGlobalScope('organization', function (Builder $builder) {
            $organizationId = request()?->attributes->get('currentOrganization')?->id;
            if ($organizationId) {
                $builder->where('organization_id', $organizationId);
            }
        });
    }
}

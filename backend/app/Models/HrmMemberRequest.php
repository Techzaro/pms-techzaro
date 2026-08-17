<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
class HrmMemberRequest extends Model
{
    protected $guarded = [];
    protected $casts = [ 'submitted_at' => 'datetime', 'approved_at' => 'datetime', 'rejected_at' => 'datetime', 'closed_at' => 'datetime' ];
    protected static function booted() {
        static::addGlobalScope('organization', function (Builder $builder) {
            $organizationId = request()?->attributes->get('currentOrganization')?->id;
            if ($organizationId) {
                $builder->where('organization_id', $organizationId);
            }
        });
    }

    public function fields() { return $this->hasMany(HrmMemberRequestField::class, 'request_id'); }
    public function history() { return $this->hasMany(HrmRequestHistory::class, 'request_id'); }
    public function employee() { return $this->belongsTo(User::class, 'employee_id'); }
    public function approvals() { return $this->hasMany(HrmRequestApproval::class, 'request_id')->orderBy('step_order'); }
}

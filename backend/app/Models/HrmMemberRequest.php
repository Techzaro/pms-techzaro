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
            if (auth()->check() && auth()->user()->organization_id) {
                $builder->where('organization_id', auth()->user()->organization_id);
            }
        });
    }

    public function fields() { return $this->hasMany(HrmMemberRequestField::class, 'request_id'); }
    public function history() { return $this->hasMany(HrmRequestHistory::class, 'request_id'); }
    public function employee() { return $this->belongsTo(User::class, 'employee_id'); }
    public function approvals() { return $this->hasMany(HrmRequestApproval::class, 'request_id')->orderBy('step_order'); }
}

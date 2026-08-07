<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class HrmRequestHistory extends Model
{
    protected $guarded = [];
    public function performedBy() { return $this->belongsTo(User::class, 'performed_by'); }
}

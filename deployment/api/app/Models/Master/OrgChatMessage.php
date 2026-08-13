<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;

class OrgChatMessage extends Model
{
    protected $connection = 'mysql_master';
    protected $table = 'org_chat_messages';

    protected $fillable = [
        'conversation_id',
        'user_id',
        'organization_id',
        'body',
        'file_path',
        'file_name',
    ];

    public function conversation()
    {
        return $this->belongsTo(OrgChatConversation::class, 'conversation_id');
    }

    public function organization()
    {
        return $this->belongsTo(Organization::class, 'organization_id');
    }
}

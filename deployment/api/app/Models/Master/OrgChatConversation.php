<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OrgChatConversation extends Model
{
    protected $connection = 'mysql_master';
    protected $table = 'org_chat_conversations';

    protected $fillable = [
        'subject',
        'organization_id',
        'created_by_user_id',
    ];

    public function messages(): HasMany
    {
        return $this->hasMany(OrgChatMessage::class, 'conversation_id')->oldest();
    }

    public function latestMessage()
    {
        return $this->hasOne(OrgChatMessage::class, 'conversation_id')->latestOfMany();
    }

    public function organization()
    {
        return $this->belongsTo(Organization::class, 'organization_id');
    }
}

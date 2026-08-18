<?php
foreach(\App\Models\HrmMemberRequest::where('status', 'Approved')->get() as $req) {
    $req->approvals()->where('status', 'Pending')->update(['status' => 'Approved']);
}
echo "Done.";

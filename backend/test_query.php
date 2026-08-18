<?php
require __DIR__."/vendor/autoload.php";
$app = require_once __DIR__."/bootstrap/app.php";
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$user = App\Models\User::find(138); 
$q = App\Models\HrmMemberRequest::where(function ($q1) use ($user) { 
  $q1->whereHas("approvals", function ($q2) use ($user) { 
    $q2->where(function($q3) use ($user) { 
      $q3->where("approver_type", "User")->where("approver_id", $user->id); 
    })->orWhere(function($q4) use ($user) { 
      $roleMap = ["team_lead" => "Team Lead", "manager" => "Manager"]; 
      $mappedRole = $roleMap[$user->role] ?? $user->role; 
      $q4->where("approver_type", "Role")->whereIn("approver_id", [$user->role, $mappedRole]); 
    }); 
  }); 
  
  if (in_array($user->role, ["team_lead", "manager"])) { 
    $q1->whereHas("employee", function($q5) use ($user) { 
      $q5->where("department", $user->department); 
    }); 
  } 
}); 
echo json_encode($q->pluck("id"));


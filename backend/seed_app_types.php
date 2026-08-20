<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\HrmApplicationType;
use App\Models\HrmApplicationField;
use Illuminate\Support\Str;
use App\Models\Organization;
use App\Models\User;

$user = User::first();
$orgId = $user ? $user->organization_id : null;
if (!$orgId) {
    $org = Organization::first();
    $orgId = $org ? $org->id : null;
}

$types = [
    "Leave Request" => [
        ['label' => 'Leave Type', 'name' => 'leaveType', 'type' => 'dropdown', 'options' => json_encode(["Casual Leave", "Sick Leave", "Annual Leave"]), 'required' => true],
        ['label' => 'Leave Duration', 'name' => 'duration', 'type' => 'daterange', 'required' => true],
        ['label' => 'Reason for Leave', 'name' => 'reason', 'type' => 'richtext', 'required' => true],
        ['label' => 'Supporting Document', 'name' => 'attachment', 'type' => 'attachment', 'required' => false],
    ],
    "Advance Salary Request" => [
        ['label' => 'Salary Type', 'name' => 'salaryType', 'type' => 'dropdown', 'options' => json_encode(["Half Salary", "Full Salary", "Custom Amount"]), 'required' => true],
        ['label' => 'Requested Amount', 'name' => 'amount', 'type' => 'amount', 'required' => true],
        ['label' => 'Required Payment Date', 'name' => 'requiredDate', 'type' => 'date', 'required' => true],
        ['label' => 'Reason', 'name' => 'reason', 'type' => 'richtext', 'required' => true],
    ],
    "Expense Request" => [
        ['label' => 'Expense Date', 'name' => 'expenseDate', 'type' => 'date', 'required' => true],
        ['label' => 'Amount', 'name' => 'amount', 'type' => 'amount', 'required' => true],
        ['label' => 'Expense Description', 'name' => 'description', 'type' => 'richtext', 'required' => true],
        ['label' => 'Receipts', 'name' => 'receipts', 'type' => 'attachment', 'required' => true],
    ],
    "Attendance Correction" => [
        ['label' => 'Correction Date', 'name' => 'corrDate', 'type' => 'date', 'required' => true],
        ['label' => 'Clock In Time', 'name' => 'corrIn', 'type' => 'time', 'required' => true],
        ['label' => 'Clock Out Time', 'name' => 'corrOut', 'type' => 'time', 'required' => true],
        ['label' => 'Reason for Correction', 'name' => 'reason', 'type' => 'richtext', 'required' => true],
    ],
    "Travel Request" => [
        ['label' => 'Destination', 'name' => 'destination', 'type' => 'text', 'required' => true],
        ['label' => 'Travel Period', 'name' => 'travelPeriod', 'type' => 'daterange', 'required' => true],
        ['label' => 'Purpose of Travel', 'name' => 'purpose', 'type' => 'richtext', 'required' => true],
    ],
    "Other Requests" => [
        ['label' => 'Request Title', 'name' => 'title', 'type' => 'text', 'required' => true],
        ['label' => 'Request Details', 'name' => 'details', 'type' => 'richtext', 'required' => true],
        ['label' => 'Attachments', 'name' => 'attachments', 'type' => 'attachment', 'required' => false],
    ],
];

foreach ($types as $typeName => $fields) {
    $type = HrmApplicationType::firstOrCreate(
        ['name' => $typeName],
        [
            'organization_id' => $orgId,
            'code' => strtoupper(substr(str_replace(' ', '', $typeName), 0, 5)),
            'slug' => Str::slug($typeName),
            'category' => 'General',
            'status' => 'Active',
            'created_by' => $user ? $user->id : null,
        ]
    );

    foreach ($fields as $idx => $f) {
        HrmApplicationField::firstOrCreate(
            [
                'application_type_id' => $type->id,
                'field_name' => $f['name'],
            ],
            [
                'organization_id' => $orgId,
                'field_label' => $f['label'],
                'field_type' => $f['type'],
                'is_required' => $f['required'],
                'options' => $f['options'] ?? null,
                'sort_order' => $idx,
            ]
        );
    }
}

echo "Successfully seeded default application types!\n";

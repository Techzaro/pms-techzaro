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
    // 1. Attendance Requests
    "Attendance Correction" => [
        ['label' => 'Date', 'name' => 'corrDate', 'type' => 'date', 'required' => true],
        ['label' => 'Correction', 'name' => 'corrTime', 'type' => 'text', 'required' => true]
    ],
    "Missing Punch" => [
        ['label' => 'Date', 'name' => 'punchDate', 'type' => 'date', 'required' => true],
        ['label' => 'Punch Type', 'name' => 'punchType', 'type' => 'dropdown', 'options' => json_encode(["Check In", "Check Out"]), 'required' => true]
    ],
    "Late Arrival Justification" => [
        ['label' => 'Date', 'name' => 'lateDate', 'type' => 'date', 'required' => true],
        ['label' => 'Expected Time', 'name' => 'expectedTime', 'type' => 'time', 'required' => true],
        ['label' => 'Reason', 'name' => 'reason', 'type' => 'richtext', 'required' => true]
    ],
    "Overtime Request" => [
        ['label' => 'Date', 'name' => 'otDate', 'type' => 'date', 'required' => true],
        ['label' => 'Hours', 'name' => 'otHours', 'type' => 'number', 'required' => true],
        ['label' => 'Project', 'name' => 'project', 'type' => 'text', 'required' => true]
    ],
    "Overtime Approval" => [
        ['label' => 'Employee', 'name' => 'employee', 'type' => 'text', 'required' => true],
        ['label' => 'Hours', 'name' => 'otHours', 'type' => 'number', 'required' => true]
    ],
    "Shift Swap" => [
        ['label' => 'Swap With', 'name' => 'swapWith', 'type' => 'text', 'required' => true],
        ['label' => 'Date', 'name' => 'swapDate', 'type' => 'date', 'required' => true]
    ],
    "Shift Change" => [
        ['label' => 'Current Shift', 'name' => 'currentShift', 'type' => 'text', 'required' => true],
        ['label' => 'Requested Shift', 'name' => 'reqShift', 'type' => 'text', 'required' => true]
    ],
    "Work From Home Request" => [
        ['label' => 'Date', 'name' => 'wfhDate', 'type' => 'date', 'required' => true],
        ['label' => 'Reason', 'name' => 'wfhReason', 'type' => 'richtext', 'required' => true]
    ],

    // 2. Leave Requests
    "Full Day Leave" => [
        ['label' => 'Leave Type', 'name' => 'leaveType', 'type' => 'dropdown', 'options' => json_encode(["Annual", "Casual", "Sick", "Maternity", "Paternity", "Marriage", "Pilgrimage", "Study", "Bereavement"]), 'required' => true],
        ['label' => 'Date', 'name' => 'leaveDate', 'type' => 'daterange', 'required' => true],
        ['label' => 'Reason', 'name' => 'leaveReason', 'type' => 'richtext', 'required' => true],
        ['label' => 'Supporting Documents', 'name' => 'attachment', 'type' => 'attachment', 'required' => false]
    ],
    "Half Day Leave" => [
        ['label' => 'Date', 'name' => 'leaveDate', 'type' => 'date', 'required' => true],
        ['label' => 'Time', 'name' => 'leaveTime', 'type' => 'text', 'required' => true],
        ['label' => 'Reason', 'name' => 'leaveReason', 'type' => 'richtext', 'required' => true],
        ['label' => 'Supporting Documents', 'name' => 'attachment', 'type' => 'attachment', 'required' => false]
    ],
    "Leave Encashment" => [
        ['label' => 'No. of leaves', 'name' => 'numLeaves', 'type' => 'number', 'required' => true],
        ['label' => 'Types of leaves', 'name' => 'leaveTypes', 'type' => 'text', 'required' => true]
    ],

    // 3. Payroll Requests
    "Salary Advance" => [
        ['label' => 'Amount', 'name' => 'amount', 'type' => 'amount', 'required' => true],
        ['label' => 'Month', 'name' => 'month', 'type' => 'text', 'required' => true]
    ],
    "Loan Request" => [
        ['label' => 'Amount', 'name' => 'amount', 'type' => 'amount', 'required' => true],
        ['label' => 'Repayment Schedule', 'name' => 'schedule', 'type' => 'text', 'required' => true]
    ],
    "Increment Request" => [
        ['label' => 'Reason for Increment', 'name' => 'reason', 'type' => 'richtext', 'required' => true]
    ],
    "Expense Reimbursement" => [
        ['label' => 'Amount', 'name' => 'amount', 'type' => 'amount', 'required' => true],
        ['label' => 'Month', 'name' => 'month', 'type' => 'text', 'required' => true]
    ],
    "Allowance Request" => [
        ['label' => 'Type', 'name' => 'allowanceType', 'type' => 'dropdown', 'options' => json_encode(["Travel", "Fuel", "Mobile", "Housing", "Internet", "Meal"]), 'required' => true],
        ['label' => 'Amount', 'name' => 'amount', 'type' => 'amount', 'required' => true],
        ['label' => 'Month', 'name' => 'month', 'type' => 'text', 'required' => true]
    ],
    "Performance Bonus Claim" => [
        ['label' => 'Amount', 'name' => 'amount', 'type' => 'amount', 'required' => true],
        ['label' => 'Month', 'name' => 'month', 'type' => 'text', 'required' => true]
    ],
    "Commission Request" => [
        ['label' => 'Amount', 'name' => 'amount', 'type' => 'amount', 'required' => true],
        ['label' => 'Month', 'name' => 'month', 'type' => 'text', 'required' => true]
    ],
    "Salary Correction" => [
        ['label' => 'Amount', 'name' => 'amount', 'type' => 'amount', 'required' => true],
        ['label' => 'Month', 'name' => 'month', 'type' => 'text', 'required' => true]
    ],
    "Bank Account Change" => [
        ['label' => 'New Bank Details', 'name' => 'newBankDetails', 'type' => 'richtext', 'required' => true]
    ],
    "Final Settlement Request" => [
        ['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]
    ],
    "Health Insurance Enrollment" => [
        ['label' => 'Type', 'name' => 'enrollType', 'type' => 'dropdown', 'options' => json_encode(["Add Dependent", "Remove Dependent", "Claim"]), 'required' => true],
        ['label' => 'Amount (if claim)', 'name' => 'amount', 'type' => 'amount', 'required' => false],
        ['label' => 'Month', 'name' => 'month', 'type' => 'text', 'required' => false],
        ['label' => 'Dependent Name', 'name' => 'depName', 'type' => 'text', 'required' => false]
    ],

    // 4. HR Requests
    "Promotion Request" => [
        ['label' => 'Current Position', 'name' => 'currPos', 'type' => 'text', 'required' => true],
        ['label' => 'New Position', 'name' => 'newPos', 'type' => 'text', 'required' => true]
    ],
    "Issue Of Document" => [
        ['label' => 'Document Type', 'name' => 'docType', 'type' => 'dropdown', 'options' => json_encode(["Employment Certificate", "Payslip", "Experience Letter", "NOC", "Visa"]), 'required' => true],
        ['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]
    ],
    "Change/Transfer Request" => [
        ['label' => 'Transfer Type', 'name' => 'transferType', 'type' => 'dropdown', 'options' => json_encode(["Department", "Manager", "Designation"]), 'required' => true],
        ['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]
    ],
    "Resignation" => [
        ['label' => 'Reason', 'name' => 'reason', 'type' => 'richtext', 'required' => true]
    ],
    "Resignation Withdrawal" => [
        ['label' => 'Reason', 'name' => 'reason', 'type' => 'richtext', 'required' => true]
    ],
    "Retirement Request" => [
        ['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]
    ],

    // 5. Asset Requests
    "Company Assets Issue" => [
        ['label' => 'Asset Requested', 'name' => 'assetType', 'type' => 'dropdown', 'options' => json_encode(["Laptop", "Desktop", "Mobile Phone", "SIM Card", "Headset", "Keyboard", "Mouse", "Monitor", "Chair", "Docking Station", "Access Card"]), 'required' => true],
        ['label' => 'Justification', 'name' => 'details', 'type' => 'richtext', 'required' => true]
    ],
    "Asset Replacement" => [
        ['label' => 'Asset Details', 'name' => 'assetDetails', 'type' => 'text', 'required' => true],
        ['label' => 'Reason for Replacement', 'name' => 'reason', 'type' => 'richtext', 'required' => true]
    ],

    // 6. IT Requests
    "Password Reset" => [['label' => 'System Name', 'name' => 'system', 'type' => 'text', 'required' => true]],
    "Email Creation" => [['label' => 'Details', 'name' => 'details', 'type' => 'text', 'required' => true]],
    "Email Access" => [['label' => 'Details', 'name' => 'details', 'type' => 'text', 'required' => true]],
    "Software Installation" => [
        ['label' => 'Software Name', 'name' => 'software', 'type' => 'text', 'required' => true],
        ['label' => 'Action', 'name' => 'action', 'type' => 'dropdown', 'options' => json_encode(["Installation", "Removal"]), 'required' => true]
    ],
    "Shared Folder Access" => [['label' => 'Folder Name', 'name' => 'folderName', 'type' => 'text', 'required' => true]],
    "Network Access" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Internet Issue" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "New User Setup" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Computer Repair" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Hardware Upgrade" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],

    // 7. Finance Requests
    "Purchase Request" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Vendor Payment" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Budget Approval" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Cash Advance" => [
        ['label' => 'Amount', 'name' => 'amount', 'type' => 'amount', 'required' => true],
        ['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]
    ],
    "Expense Claim" => [
        ['label' => 'Amount', 'name' => 'amount', 'type' => 'amount', 'required' => true],
        ['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true],
        ['label' => 'Receipts', 'name' => 'attachment', 'type' => 'attachment', 'required' => true]
    ],
    "Refund Request" => [
        ['label' => 'Amount', 'name' => 'amount', 'type' => 'amount', 'required' => true],
        ['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]
    ],

    // 8. Travel Requests
    "Business Trip" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Flight Booking" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Hotel Booking" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Visa Request" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Airport Pickup" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Travel Insurance" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Travel Extension" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Travel Expense Claim" => [
        ['label' => 'Amount', 'name' => 'amount', 'type' => 'amount', 'required' => true],
        ['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]
    ],

    // 9. Training Requests
    "Course Registration" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Certification Request" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Mentorship Request" => [['label' => 'Mentor Name/Position', 'name' => 'mentor', 'type' => 'text', 'required' => true]],
    "Seminar Attendance" => [
        ['label' => 'Seminar Name', 'name' => 'seminarName', 'type' => 'text', 'required' => true],
        ['label' => 'Date', 'name' => 'seminarDate', 'type' => 'date', 'required' => true],
        ['label' => 'Comments', 'name' => 'comments', 'type' => 'richtext', 'required' => true],
        ['label' => 'Supporting Documents', 'name' => 'attachment', 'type' => 'attachment', 'required' => false]
    ],

    // 10. Facilities Requests
    "Meeting Room Booking" => [
        ['label' => 'Date', 'name' => 'meetDate', 'type' => 'date', 'required' => true],
        ['label' => 'Time', 'name' => 'meetTime', 'type' => 'time', 'required' => true],
        ['label' => 'Comments', 'name' => 'comments', 'type' => 'richtext', 'required' => false],
        ['label' => 'Supporting Documents', 'name' => 'attachment', 'type' => 'attachment', 'required' => false]
    ],
    "Cleaning Request" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Stationery Request" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],

    // 11. Compliance Requests
    "Harassment Complaint" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],

    // 12. Miscellaneous
    "Miscellaneous Request" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],

    // 16. Organization Requests
    "Reporting Manager Change" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Cost Center Change" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Branch Transfer" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Project Allocation" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Team Allocation" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],

    // 19. Security Requests
    "Visitor Access" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Temporary Access Card" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Building Access" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "Restricted Area Access" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]],
    "CCTV Review Request" => [['label' => 'Details', 'name' => 'details', 'type' => 'richtext', 'required' => true]]
];

foreach ($types as $typeName => $fields) {
    // Generate a unique code
    $baseCode = strtoupper(substr(str_replace([' ', '/', '-'], '', $typeName), 0, 5));
    $code = $baseCode;
    $counter = 1;
    while (HrmApplicationType::where('code', $code)->where('name', '!=', $typeName)->exists()) {
        $code = substr($baseCode, 0, 3) . sprintf('%02d', $counter);
        $counter++;
    }

    $type = HrmApplicationType::firstOrCreate(
        ['name' => $typeName],
        [
            'organization_id' => $orgId,
            'code' => $code,
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

echo "Successfully seeded ".count($types)." extended application types!\n";

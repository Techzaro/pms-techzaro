<?php
namespace Database\Seeders;
use Illuminate\Database\Seeder;
use App\Models\Organization;
use App\Models\HrmApplicationType;
use App\Models\HrmApplicationField;
use Illuminate\Support\Str;

class HrmApplicationTypeSeeder extends Seeder
{
    public function run(): void
    {
        $orgs = Organization::all();
        $types = [
            'Sick Leave' => [
                ['label' => 'Leave From', 'name' => 'leave_from', 'type' => 'Date'],
                ['label' => 'Leave To', 'name' => 'leave_to', 'type' => 'Date'],
                ['label' => 'Start Time (Timer)', 'name' => 'start_time', 'type' => 'Time'],
                ['label' => 'End Time (Timer)', 'name' => 'end_time', 'type' => 'Time'],
                ['label' => 'Half Day?', 'name' => 'half_day', 'type' => 'Dropdown', 'options' => ['Full Day', 'Half Day (First Half)', 'Half Day (Second Half)']],
                ['label' => 'Reason', 'name' => 'reason', 'type' => 'Textarea'],
                ['label' => 'Medical Certificate (Required if >2 days)', 'name' => 'medical_certificate', 'type' => 'File Upload'],
                ['label' => 'Emergency Contact', 'name' => 'emergency_contact', 'type' => 'Text']
            ],
            'Advance Salary' => [
                ['label' => 'Requested Amount', 'name' => 'requested_amount', 'type' => 'Number'],
                ['label' => 'Reason', 'name' => 'reason', 'type' => 'Textarea'],
                ['label' => 'Preferred Deduction Month', 'name' => 'preferred_deduction_month', 'type' => 'Dropdown', 'options' => ['Next Month', 'Two Months from Now', 'Over 3 Months']],
                ['label' => 'Manager Comments', 'name' => 'manager_comments', 'type' => 'Textarea']
            ],
            'Expense Reimbursement' => [
                ['label' => 'Expense Category', 'name' => 'expense_category', 'type' => 'Dropdown', 'options' => ['Travel', 'Meals', 'Supplies', 'Accommodation', 'Other']],
                ['label' => 'Expense Date', 'name' => 'expense_date', 'type' => 'Date'],
                ['label' => 'Amount', 'name' => 'amount', 'type' => 'Number'],
                ['label' => 'Currency', 'name' => 'currency', 'type' => 'Dropdown', 'options' => ['USD', 'PKR', 'EUR', 'GBP', 'INR']],
                ['label' => 'Vendor Name', 'name' => 'vendor_name', 'type' => 'Text'],
                ['label' => 'Project', 'name' => 'project', 'type' => 'Text'],
                ['label' => 'Receipt Upload', 'name' => 'receipt_upload', 'type' => 'File Upload'],
                ['label' => 'Description', 'name' => 'description', 'type' => 'Textarea']
            ],
            'Equipment Request' => [
                ['label' => 'Equipment Type', 'name' => 'equipment_type', 'type' => 'Dropdown', 'options' => ['Laptop', 'Monitor', 'Mouse/Keyboard', 'Headset', 'Chair', 'Other']],
                ['label' => 'Quantity', 'name' => 'quantity', 'type' => 'Number'],
                ['label' => 'Priority', 'name' => 'priority', 'type' => 'Dropdown', 'options' => ['Low', 'Medium', 'High', 'Urgent']],
                ['label' => 'Business Justification', 'name' => 'business_justification', 'type' => 'Textarea'],
                ['label' => 'Manager Approval Required', 'name' => 'manager_approval_required', 'type' => 'Checkbox']
            ],
            'Work From Home' => [
                ['label' => 'Date From', 'name' => 'date_from', 'type' => 'Date'],
                ['label' => 'Date To', 'name' => 'date_to', 'type' => 'Date'],
                ['label' => 'Reason', 'name' => 'reason', 'type' => 'Textarea'],
                ['label' => 'Working Address', 'name' => 'working_address', 'type' => 'Text'],
                ['label' => 'Internet Speed', 'name' => 'internet_speed', 'type' => 'Text'],
                ['label' => 'Manager Approval', 'name' => 'manager_approval', 'type' => 'Checkbox']
            ]
        ];

        foreach ($orgs as $org) {
            foreach ($types as $name => $fields) {
                $type = HrmApplicationType::updateOrCreate(
                    ['organization_id' => $org->id, 'name' => $name],
                    ['slug' => Str::slug($name), 'code' => Str::upper(Str::slug($name, '_')) . '_' . $org->id, 'category' => 'General', 'status' => 'Active']
                );

                // Optionally clear old fields if re-running
                HrmApplicationField::where('application_type_id', $type->id)->delete();

                foreach ($fields as $idx => $field) {
                    HrmApplicationField::create([
                        'organization_id' => $org->id,
                        'application_type_id' => $type->id,
                        'field_name' => $field['name'],
                        'field_label' => $field['label'],
                        'field_type' => $field['type'],
                        'options' => isset($field['options']) ? json_encode($field['options']) : null,
                        'sort_order' => $idx,
                        'is_required' => true,
                    ]);
                }
            }
        }
    }
}

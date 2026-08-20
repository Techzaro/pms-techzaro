<?php
namespace Database\Seeders;
use Illuminate\Database\Seeder;
use App\Models\Organization;
use App\Models\HrmApplicationType;
use Illuminate\Support\Str;

class OtherApplicationTypeSeeder extends Seeder
{
    public function run(): void
    {
        $orgs = Organization::all();
        foreach ($orgs as $org) {
            HrmApplicationType::updateOrCreate(
                ['organization_id' => $org->id, 'name' => 'Other (Custom Request)'],
                ['slug' => 'other-custom-request', 'code' => 'OTHER_' . $org->id, 'category' => 'General', 'status' => 'Active']
            );
        }
    }
}

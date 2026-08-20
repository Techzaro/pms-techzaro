<?php
namespace Database\Seeders;
use Illuminate\Database\Seeder;
use App\Models\Organization;

class OrganizationSeeder extends Seeder
{
    public function run(): void
    {
        Organization::updateOrCreate(['slug' => 'techxaro'], [
            'name' => 'TechXaro',
            'type' => 'owner',
            'status' => 'active',
            'timezone' => 'Asia/Karachi'
        ]);

        Organization::updateOrCreate(['slug' => 'demo-corporation'], [
            'name' => 'Demo Corporation',
            'type' => 'standard',
            'status' => 'active',
            'timezone' => 'Asia/Karachi'
        ]);
    }
}

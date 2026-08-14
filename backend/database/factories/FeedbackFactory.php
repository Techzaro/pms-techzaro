<?php

namespace Database\Factories;

use App\Models\Feedback;
use Illuminate\Database\Eloquent\Factories\Factory;

class FeedbackFactory extends Factory
{
    protected $model = Feedback::class;

    public function definition(): array
    {
        return [
            'reference_number' => 'FB-' . $this->faker->unique()->numberBetween(1000, 9999),
            'feedback_type' => $this->faker->randomElement(['Bug Report', 'Feature Request', 'General Suggestion', 'Feature Rating', 'General Feedback']),
            'subject' => $this->faker->sentence(5),
            'description' => $this->faker->paragraph(),
            'priority' => $this->faker->randomElement(['Low', 'Medium', 'High', 'Urgent']),
            'rating' => $this->faker->numberBetween(1, 5),
            'status' => $this->faker->randomElement(['New', 'Under Review', 'Accepted', 'In Development', 'Resolved', 'Closed']),
            'organization_name' => 'Techzaro',
            'user_name' => $this->faker->name(),
            'user_role' => $this->faker->randomElement(['admin', 'manager', 'member']),
            'module' => $this->faker->randomElement(['Dashboard', 'Tasks', 'Deliverables', 'Templates', 'Settings']),
            'current_page' => '/deliveries',
            'submitted_at' => now()->subDays(rand(0, 15)),
            'browser' => 'Chrome 125.0',
            'operating_system' => 'Windows 11',
            'device_type' => 'Desktop',
            'ip_address' => '127.0.0.1',
            'app_version' => '1.0.0',
        ];
    }
}

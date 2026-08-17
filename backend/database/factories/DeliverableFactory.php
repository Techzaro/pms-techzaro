<?php

namespace Database\Factories;

use App\Models\Deliverable;
use Illuminate\Database\Eloquent\Factories\Factory;

class DeliverableFactory extends Factory
{
    protected $model = Deliverable::class;

    public function definition(): array
    {
        return [
            'title' => $this->faker->sentence(3),
            'description' => $this->faker->paragraph(),
            'status' => $this->faker->randomElement(['pending', 'in_progress', 'completed', 'submitted']),
            'priority' => $this->faker->randomElement(['Low', 'Medium', 'High', 'Urgent']),
            'start_date' => now()->subDays(rand(1, 5)),
            'due_date' => now()->addDays(rand(2, 14)),
            'estimated_hours' => $this->faker->numberBetween(2, 40),
            'estimated_minutes' => 0,
        ];
    }
}

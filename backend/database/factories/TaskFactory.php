<?php

namespace Database\Factories;

use App\Models\Task;
use Illuminate\Database\Eloquent\Factories\Factory;

class TaskFactory extends Factory
{
    protected $model = Task::class;

    public function definition(): array
    {
        return [
            'title' => $this->faker->sentence(4),
            'description' => $this->faker->paragraph(),
            'requirements' => $this->faker->paragraph(),
            'status' => $this->faker->randomElement(['pending', 'in_progress', 'completed', 'review', 'rejected']),
            'priority' => $this->faker->randomElement(['Low', 'Medium', 'High', 'Urgent']),
            'start_date' => now()->subDays(rand(1, 10)),
            'end_date' => now()->addDays(rand(5, 20)),
        ];
    }
}

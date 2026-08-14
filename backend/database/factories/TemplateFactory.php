<?php

namespace Database\Factories;

use App\Models\Template;
use Illuminate\Database\Eloquent\Factories\Factory;

class TemplateFactory extends Factory
{
    protected $model = Template::class;

    public function definition(): array
    {
        return [
            'title' => $this->faker->catchPhrase() . ' Template',
            'description' => $this->faker->sentence(),
            'category' => $this->faker->randomElement(['Software Development', 'Design System', 'Marketing Campaign', 'QA Testing', 'Operations']),
            'visibility_level' => $this->faker->randomElement(['private', 'project_team', 'department_team', 'organization']),
            'department' => $this->faker->randomElement(['Engineering', 'Product', 'Design', 'Marketing']),
            'organization' => 'Techzaro',
            'data' => [
                'type' => 'workflow',
                'steps' => ['Planning', 'Execution', 'Review', 'Deployment'],
            ],
        ];
    }
}

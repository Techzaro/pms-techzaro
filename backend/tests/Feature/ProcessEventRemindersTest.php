<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\EventReminder;
use App\Models\Notification;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class ProcessEventRemindersTest extends TestCase
{
    use DatabaseTransactions;

    private User $user;
    private User $attendee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create([
            'role' => 'admin',
            'status' => 'active',
            'timezone' => 'UTC',
        ]);

        $this->attendee = User::factory()->create([
            'role' => 'employee',
            'status' => 'active',
            'timezone' => 'America/New_York',
        ]);
    }

    /**
     * Test dynamic reminder is dispatched when trigger time is reached.
     */
    public function test_dispatches_due_reminders_and_marks_sent(): void
    {
        // Create event starting in 15 minutes
        $event = Event::create([
            'user_id' => $this->user->id,
            'title' => 'Sprint Retro',
            'type' => 'event',
            'start_date' => now()->addMinutes(15),
            'end_date' => now()->addMinutes(45),
            'status' => 'scheduled',
            'visibility_level' => 'organization',
        ]);

        $event->assignedUsers()->sync([$this->attendee->id]);

        // Create 15-minute dynamic reminder (due right now)
        $reminder = EventReminder::create([
            'event_id' => $event->id,
            'value' => 15,
            'unit' => 'minutes',
            'is_sent' => false,
        ]);

        // Run artisan command
        Artisan::call('events:process-reminders');

        // Assert reminder marked as sent
        $reminder->refresh();
        $this->assertTrue((bool) $reminder->is_sent);
        $this->assertNotNull($reminder->sent_at);

        // Assert notification created
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->attendee->id,
            'type' => 'event_reminder',
            'related_id' => $event->id,
        ]);
    }

    /**
     * Test future reminders are not dispatched prematurely.
     */
    public function test_does_not_dispatch_future_reminders(): void
    {
        // Event starting tomorrow
        $event = Event::create([
            'user_id' => $this->user->id,
            'title' => 'Future Workshop',
            'type' => 'event',
            'start_date' => now()->addDays(2),
            'end_date' => now()->addDays(2)->addHours(2),
            'status' => 'scheduled',
            'visibility_level' => 'organization',
        ]);

        $reminder = EventReminder::create([
            'event_id' => $event->id,
            'value' => 30,
            'unit' => 'minutes',
            'is_sent' => false,
        ]);

        Artisan::call('events:process-reminders');

        $reminder->refresh();
        $this->assertFalse((bool) $reminder->is_sent);
        $this->assertNull($reminder->sent_at);
    }

    /**
     * Test cancelled events do not send reminders.
     */
    public function test_skips_cancelled_events(): void
    {
        $event = Event::create([
            'user_id' => $this->user->id,
            'title' => 'Cancelled Meeting',
            'type' => 'event',
            'start_date' => now()->addMinutes(10),
            'end_date' => now()->addMinutes(30),
            'status' => 'cancelled',
            'visibility_level' => 'organization',
        ]);

        $reminder = EventReminder::create([
            'event_id' => $event->id,
            'value' => 10,
            'unit' => 'minutes',
            'is_sent' => false,
        ]);

        Artisan::call('events:process-reminders');

        $reminder->refresh();
        $this->assertFalse((bool) $reminder->is_sent);
    }
}

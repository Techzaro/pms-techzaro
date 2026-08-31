<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\EventAttachment;
use App\Models\EventParticipant;
use App\Models\EventReminder;
use App\Models\Notification;
use App\Models\User;
use App\Models\Activity;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class EventControllerTest extends TestCase
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
     * Test full event creation with dynamic reminders, attendees, and attachments.
     */
    public function test_create_event_with_reminders_and_participants(): void
    {
        Storage::fake('public');

        $file = UploadedFile::fake()->create('agenda.pdf', 1024, 'application/pdf');

        $payload = [
            'title' => 'Quarterly Product Strategy',
            'description' => '<p>Discussion on product roadmap and milestones.</p>',
            'type' => 'event',
            'start_date' => now()->addDays(2)->format('Y-m-d H:i:s'),
            'end_date' => now()->addDays(2)->addHours(2)->format('Y-m-d H:i:s'),
            'start_time' => '10:00',
            'end_time' => '12:00',
            'all_day' => 0,
            'visibility_level' => 'organization',
            'location' => 'Main Boardroom',
            'meeting_link' => 'https://meet.google.com/abc-defg-hij',
            'color' => '#2563eb',
            'assigned_user_ids' => [$this->attendee->id],
            'participant_user_ids' => [$this->attendee->id],
            'reminders' => [
                ['value' => 30, 'unit' => 'minutes'],
                ['value' => 2, 'unit' => 'hours'],
            ],
            'attachments' => [$file],
        ];

        $response = $this->actingAs($this->user)
            ->postJson('/api/events', $payload);

        $response->assertStatus(201);
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('data.title', 'Quarterly Product Strategy');

        $eventId = $response->json('data.id');

        // Assert database records
        $this->assertDatabaseHas('events', [
            'id' => $eventId,
            'title' => 'Quarterly Product Strategy',
            'meeting_link' => 'https://meet.google.com/abc-defg-hij',
            'status' => 'scheduled',
        ]);

        $this->assertDatabaseHas('event_participants', [
            'event_id' => $eventId,
            'user_id' => $this->attendee->id,
            'status' => 'invited',
        ]);

        $this->assertDatabaseHas('event_reminders', [
            'event_id' => $eventId,
            'value' => 30,
            'unit' => 'minutes',
            'is_sent' => false,
        ]);

        $this->assertDatabaseHas('event_reminders', [
            'event_id' => $eventId,
            'value' => 2,
            'unit' => 'hours',
            'is_sent' => false,
        ]);

        $this->assertDatabaseHas('event_attachments', [
            'event_id' => $eventId,
            'file_name' => 'agenda.pdf',
        ]);

        // Assert Granular Activity Log
        $this->assertDatabaseHas('activities', [
            'activity_type' => 'event_created',
            'related_id' => $eventId,
            'user_id' => $this->user->id,
        ]);
    }

    /**
     * Test updating event details and granular logging.
     */
    public function test_update_event_logs_granular_event_updated(): void
    {
        $event = Event::create([
            'user_id' => $this->user->id,
            'title' => 'Initial Event Title',
            'type' => 'event',
            'start_date' => now()->addDay(),
            'end_date' => now()->addDay()->addHour(),
            'status' => 'scheduled',
            'visibility_level' => 'organization',
        ]);

        $updatePayload = [
            'title' => 'Updated Event Title',
            'location' => 'Room 402',
            'meeting_link' => 'https://zoom.us/j/123456789',
        ];

        $response = $this->actingAs($this->user)
            ->putJson("/api/events/{$event->id}", $updatePayload);

        $response->assertStatus(200);
        $response->assertJsonPath('data.title', 'Updated Event Title');

        $this->assertDatabaseHas('events', [
            'id' => $event->id,
            'title' => 'Updated Event Title',
            'location' => 'Room 402',
        ]);

        // Assert Granular Activity Log
        $this->assertDatabaseHas('activities', [
            'activity_type' => 'event_updated',
            'related_id' => $event->id,
            'user_id' => $this->user->id,
        ]);
    }

    /**
     * Test cancelling an event.
     */
    public function test_cancel_event_logs_granular_event_cancelled(): void
    {
        $event = Event::create([
            'user_id' => $this->user->id,
            'title' => 'Event To Cancel',
            'type' => 'event',
            'start_date' => now()->addDay(),
            'end_date' => now()->addDay()->addHour(),
            'status' => 'scheduled',
            'visibility_level' => 'organization',
        ]);

        $response = $this->actingAs($this->user)
            ->postJson("/api/events/{$event->id}/cancel");

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'cancelled');

        $this->assertDatabaseHas('events', [
            'id' => $event->id,
            'status' => 'cancelled',
        ]);

        $this->assertDatabaseHas('activities', [
            'activity_type' => 'event_cancelled',
            'related_id' => $event->id,
            'user_id' => $this->user->id,
        ]);
    }

    /**
     * Test adding and removing participants.
     */
    public function test_add_and_remove_participants(): void
    {
        $event = Event::create([
            'user_id' => $this->user->id,
            'title' => 'Team Sync',
            'type' => 'event',
            'start_date' => now()->addDay(),
            'end_date' => now()->addDay()->addHour(),
            'status' => 'scheduled',
            'visibility_level' => 'custom',
        ]);

        // Add participant
        $addRes = $this->actingAs($this->user)
            ->postJson("/api/events/{$event->id}/participants", [
                'user_ids' => [$this->attendee->id],
            ]);

        $addRes->assertStatus(200);
        $this->assertDatabaseHas('event_participants', [
            'event_id' => $event->id,
            'user_id' => $this->attendee->id,
        ]);
        $this->assertDatabaseHas('activities', [
            'activity_type' => 'event_participant_added',
            'related_id' => $event->id,
        ]);

        // Remove participant
        $removeRes = $this->actingAs($this->user)
            ->deleteJson("/api/events/{$event->id}/participants/{$this->attendee->id}");

        $removeRes->assertStatus(200);
        $this->assertDatabaseMissing('event_participants', [
            'event_id' => $event->id,
            'user_id' => $this->attendee->id,
        ]);
        $this->assertDatabaseHas('activities', [
            'activity_type' => 'event_participant_removed',
            'related_id' => $event->id,
        ]);
    }

    /**
     * Test RSVP to an event.
     */
    public function test_rsvp_to_event(): void
    {
        $event = Event::create([
            'user_id' => $this->user->id,
            'title' => 'All Hands Meeting',
            'type' => 'event',
            'start_date' => now()->addDay(),
            'end_date' => now()->addDay()->addHour(),
            'status' => 'scheduled',
            'visibility_level' => 'organization',
        ]);

        $response = $this->actingAs($this->attendee)
            ->postJson("/api/events/{$event->id}/rsvp", [
                'status' => 'accepted',
                'response_notes' => 'Looking forward to attending.',
            ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('event_participants', [
            'event_id' => $event->id,
            'user_id' => $this->attendee->id,
            'status' => 'accepted',
            'response_notes' => 'Looking forward to attending.',
        ]);

        $this->assertDatabaseHas('activities', [
            'activity_type' => 'rsvp',
            'related_id' => $event->id,
            'user_id' => $this->attendee->id,
        ]);
    }

    /**
     * Test deleting an event cascades properly and logs deletion.
     */
    public function test_delete_event_cascades_and_logs(): void
    {
        $event = Event::create([
            'user_id' => $this->user->id,
            'title' => 'Temporary Event',
            'type' => 'event',
            'start_date' => now()->addDay(),
            'end_date' => now()->addDay()->addHour(),
            'status' => 'scheduled',
            'visibility_level' => 'organization',
        ]);

        $reminder = EventReminder::create([
            'event_id' => $event->id,
            'value' => 15,
            'unit' => 'minutes',
        ]);

        $response = $this->actingAs($this->user)
            ->deleteJson("/api/events/{$event->id}");

        $response->assertStatus(200);
        $this->assertDatabaseMissing('events', ['id' => $event->id]);
        $this->assertDatabaseMissing('event_reminders', ['id' => $reminder->id]);

        $this->assertDatabaseHas('activities', [
            'activity_type' => 'event_deleted',
            'related_id' => $event->id,
            'user_id' => $this->user->id,
        ]);
    }
}

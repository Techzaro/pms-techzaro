<?php

namespace Tests\Unit;

use App\Models\Task;
use App\Models\User;
use App\Services\DelegationService;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

class DelegationRoutingTest extends TestCase
{
    private DelegationService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = (new ReflectionClass(DelegationService::class))->newInstanceWithoutConstructor();
    }

    public function test_direct_transfer_bypasses_user_but_keeps_earlier_required_checkpoint(): void
    {
        $task = $this->task([
            ['delegated_by' => 2, 'delegated_to' => 3, 'status' => 'accepted', 'return_to_transferor' => true],
            ['delegated_by' => 3, 'delegated_to' => 4, 'status' => 'accepted', 'return_to_transferor' => false],
        ]);

        $this->assertSame([4, 2, 1], $this->service->submissionRoute($task, 4));
        $this->assertSame(2, $this->service->nextSubmissionReviewer($task, 4));
        $this->assertSame(1, $this->service->nextSubmissionReviewer($task, 4, [2]));
    }

    public function test_all_direct_transfers_route_to_creator(): void
    {
        $task = $this->task([
            ['delegated_by' => 2, 'delegated_to' => 3, 'status' => 'accepted', 'return_to_transferor' => false],
            ['delegated_by' => 3, 'delegated_to' => 4, 'status' => 'accepted', 'return_to_transferor' => false],
        ]);

        $this->assertSame([4, 1], $this->service->submissionRoute($task, 4));
        $this->assertSame(1, $this->service->nextSubmissionReviewer($task, 4));
    }

    public function test_viewer_status_is_pending_above_checkpoint_and_submitted_for_bypassed_user(): void
    {
        $task = $this->task([
            ['delegated_by' => 2, 'delegated_to' => 3, 'status' => 'accepted', 'return_to_transferor' => true],
            ['delegated_by' => 3, 'delegated_to' => 4, 'status' => 'accepted', 'return_to_transferor' => false],
        ]);
        $task->forceFill([
            'status' => 'submitted',
            'submission_stage' => 'awaiting_checkpoint',
            'current_submitter_id' => 4,
            'current_reviewer_id' => 2,
        ]);

        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(1))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(2))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(3))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(4))['display_status']);
    }

    public function test_acknowledgement_status_is_shared_across_the_assignment_chain(): void
    {
        $task = $this->task([]);
        $task->forceFill(['status' => 'pending', 'submission_stage' => null]);
        $this->assertSame('pending', $this->service->routingPayload($task, $this->user(1))['display_status']);
        $this->assertSame('pending', $this->service->routingPayload($task, $this->user(2))['display_status']);

        $task->forceFill(['status' => 'in_progress']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(1))['display_status']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(2))['display_status']);
    }

    public function test_pending_handoff_is_pending_only_for_transferor_and_delegatee(): void
    {
        $task = $this->task([
            ['delegated_by' => 2, 'delegated_to' => 3, 'status' => 'pending', 'return_to_transferor' => true],
        ]);
        $task->forceFill([
            'status' => 'pending',
            'submission_stage' => null,
            'current_owner' => 3,
        ]);

        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(1))['display_status']);
        $this->assertSame('pending', $this->service->routingPayload($task, $this->user(2))['display_status']);
        $this->assertSame('pending', $this->service->routingPayload($task, $this->user(3))['display_status']);
    }

    public function test_only_latest_handoff_participants_are_pending_in_a_deeper_chain(): void
    {
        $task = $this->task([
            ['delegated_by' => 2, 'delegated_to' => 3, 'status' => 'accepted', 'return_to_transferor' => true],
            ['delegated_by' => 3, 'delegated_to' => 4, 'status' => 'pending', 'return_to_transferor' => true],
        ]);
        $task->forceFill([
            'status' => 'pending',
            'submission_stage' => null,
            'current_owner' => 4,
        ]);

        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(1))['display_status']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(2))['display_status']);
        $this->assertSame('pending', $this->service->routingPayload($task, $this->user(3))['display_status']);
        $this->assertSame('pending', $this->service->routingPayload($task, $this->user(4))['display_status']);
    }

    public function test_reopened_status_is_visible_to_every_accepted_route_participant(): void
    {
        $task = $this->task([
            ['delegated_by' => 2, 'delegated_to' => 3, 'status' => 'accepted', 'return_to_transferor' => true],
            ['delegated_by' => 3, 'delegated_to' => 4, 'status' => 'accepted', 'return_to_transferor' => true],
        ]);
        $task->forceFill([
            'status' => 'reopened',
            'submission_stage' => 'declined',
            'current_submitter_id' => 4,
            'reopened_by' => 2,
        ]);

        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(1))['display_status']);
        $this->assertSame('reopened', $this->service->routingPayload($task, $this->user(2))['display_status']);
        $this->assertSame('reopened', $this->service->routingPayload($task, $this->user(3))['display_status']);
        $this->assertSame('reopened', $this->service->routingPayload($task, $this->user(4))['display_status']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(99))['display_status']);
    }

    public function test_initial_unacknowledged_task_shows_pending_to_both_creator_and_assignee(): void
    {
        $task = (new Task())->forceFill([
            'assigned_by' => 1,
            'creator_id' => 1,
            'assigned_to' => 2,
            'current_owner' => 2,
            'delegation_chain' => [],
            'submission_forwarded_by' => [],
            'status' => 'pending',
            'submission_stage' => null,
        ]);

        $this->assertSame('pending', $this->service->routingPayload($task, $this->user(1))['display_status']);
        $this->assertSame('pending', $this->service->routingPayload($task, $this->user(2))['display_status']);
    }

    public function test_active_creator_reviewer_is_submitted_even_with_incomplete_legacy_route_metadata(): void
    {
        $task = $this->task([
            ['delegated_by' => 2, 'delegated_to' => 3, 'status' => 'accepted', 'return_to_transferor' => true],
            ['delegated_by' => 3, 'delegated_to' => 4, 'status' => 'accepted', 'return_to_transferor' => true],
        ]);
        $task->forceFill([
            'status' => 'submitted',
            'submission_stage' => 'awaiting_creator',
            'current_submitter_id' => 4,
            'current_reviewer_id' => 1,
            // Simulate legacy metadata whose creator is not present in the route.
            'creator_id' => null,
            'assigned_by' => null,
        ]);

        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(1))['display_status']);
    }

    public function test_six_user_delegation_submission_forwarding_matrix(): void
    {
        $chain = [
            ['delegated_by' => 2, 'delegated_to' => 3, 'status' => 'accepted', 'return_to_transferor' => true],
            ['delegated_by' => 3, 'delegated_to' => 4, 'status' => 'accepted', 'return_to_transferor' => true],
            ['delegated_by' => 4, 'delegated_to' => 5, 'status' => 'accepted', 'return_to_transferor' => true],
            ['delegated_by' => 5, 'delegated_to' => 6, 'status' => 'accepted', 'return_to_transferor' => true],
        ];

        // Step 1: User 6 Submits to User 5 (Active Reviewer = 5)
        $task = $this->task($chain)->forceFill([
            'status' => 'in_progress',
            'submission_stage' => 'awaiting_checkpoint',
            'current_submitter_id' => 6,
            'current_reviewer_id' => 5,
            'submission_forwarded_by' => [],
        ]);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(6))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(5))['display_status']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(4))['display_status']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(3))['display_status']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(2))['display_status']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(1))['display_status']);

        // Step 2: User 5 forwards to User 4 (Active Reviewer = 4)
        $task->forceFill([
            'current_reviewer_id' => 4,
            'submission_forwarded_by' => [5],
        ]);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(6))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(5))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(4))['display_status']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(3))['display_status']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(2))['display_status']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(1))['display_status']);

        // Step 3: User 4 forwards to User 3 (Active Reviewer = 3)
        $task->forceFill([
            'current_reviewer_id' => 3,
            'submission_forwarded_by' => [5, 4],
        ]);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(6))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(5))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(4))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(3))['display_status']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(2))['display_status']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(1))['display_status']);

        // Step 4: User 3 forwards to User 2 (Active Reviewer = 2)
        $task->forceFill([
            'current_reviewer_id' => 2,
            'submission_forwarded_by' => [5, 4, 3],
        ]);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(6))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(5))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(4))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(3))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(2))['display_status']);
        $this->assertSame('in_progress', $this->service->routingPayload($task, $this->user(1))['display_status']);

        // Step 5: User 2 forwards to User 1 (Active Reviewer = 1)
        $task->forceFill([
            'current_reviewer_id' => 1,
            'submission_stage' => 'awaiting_creator',
            'submission_forwarded_by' => [5, 4, 3, 2],
        ]);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(6))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(5))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(4))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(3))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(2))['display_status']);
        $this->assertSame('submitted', $this->service->routingPayload($task, $this->user(1))['display_status']);

        // Step 6: User 1 Approves
        $task->forceFill([
            'status' => 'approved',
            'submission_stage' => null,
        ]);
        $this->assertSame('approved', $this->service->routingPayload($task, $this->user(6))['display_status']);
        $this->assertSame('approved', $this->service->routingPayload($task, $this->user(5))['display_status']);
        $this->assertSame('approved', $this->service->routingPayload($task, $this->user(4))['display_status']);
        $this->assertSame('approved', $this->service->routingPayload($task, $this->user(3))['display_status']);
        $this->assertSame('approved', $this->service->routingPayload($task, $this->user(2))['display_status']);
        $this->assertSame('approved', $this->service->routingPayload($task, $this->user(1))['display_status']);
    }

    private function task(array $chain): Task
    {
        return (new Task())->forceFill([
            'assigned_by' => 1,
            'creator_id' => 1,
            'assigned_to' => 2,
            'current_owner' => 4,
            'delegation_chain' => $chain,
            'submission_forwarded_by' => [],
            'status' => 'in_progress',
        ]);
    }

    private function user(int $id): User
    {
        return (new User())->forceFill(['id' => $id, 'name' => 'User '.$id]);
    }
}

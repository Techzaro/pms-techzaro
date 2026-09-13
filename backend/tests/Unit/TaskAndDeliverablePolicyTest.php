<?php

namespace Tests\Unit;

use App\Models\Deliverable;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Policies\DeliverablePolicy;
use App\Policies\TaskPolicy;
use PHPUnit\Framework\TestCase;

class TaskAndDeliverablePolicyTest extends TestCase
{
    private TaskPolicy $taskPolicy;
    private DeliverablePolicy $deliverablePolicy;

    protected function setUp(): void
    {
        parent::setUp();
        $this->taskPolicy = new TaskPolicy();
        $this->deliverablePolicy = new DeliverablePolicy();
    }

    private function user(int $id, string $role = 'member', ?int $orgId = 1): User
    {
        $user = new User();
        $user->forceFill([
            'id' => $id,
            'role' => $role,
            'organization_id' => $orgId,
            'active' => true,
        ]);
        return $user;
    }

    public function test_admin_can_view_and_update_task(): void
    {
        $admin = $this->user(1, 'admin');
        $task = new Task();
        $task->forceFill(['id' => 10, 'assigned_by' => 2, 'assigned_to' => 3]);

        $this->assertTrue($this->taskPolicy->view($admin, $task));
        $this->assertTrue($this->taskPolicy->update($admin, $task));
    }

    public function test_task_creator_and_assignee_can_view_and_update(): void
    {
        $creator = $this->user(2, 'member');
        $assignee = $this->user(3, 'member');
        $task = new Task();
        $task->forceFill(['id' => 10, 'assigned_by' => 2, 'assigned_to' => 3]);

        $this->assertTrue($this->taskPolicy->view($creator, $task));
        $this->assertTrue($this->taskPolicy->update($creator, $task));

        $this->assertTrue($this->taskPolicy->view($assignee, $task));
        $this->assertTrue($this->taskPolicy->update($assignee, $task));
    }

    public function test_project_member_can_view_task_read_only_but_cannot_update(): void
    {
        $projectMember = $this->user(4, 'member');
        $project = new Project();
        $project->forceFill([
            'id' => 100,
            'created_by' => 5,
            'assigned_users' => [4, 6],
        ]);

        $task = new Task();
        $task->forceFill([
            'id' => 10,
            'project_id' => 100,
            'assigned_by' => 5,
            'assigned_to' => 6,
        ]);
        $task->setRelation('project', $project);

        // Project member 4 CAN view the task
        $this->assertTrue($this->taskPolicy->view($projectMember, $task));

        // Project member 4 CANNOT update the task (only 5 and 6 can update)
        $this->assertFalse($this->taskPolicy->update($projectMember, $task));
        $this->assertFalse($this->taskPolicy->updateStatus($projectMember, $task));
    }

    public function test_non_project_member_cannot_view_or_update_task(): void
    {
        $outsider = $this->user(99, 'member');
        $project = new Project();
        $project->forceFill([
            'id' => 100,
            'created_by' => 5,
            'assigned_users' => [4, 6],
        ]);

        $task = new Task();
        $task->forceFill([
            'id' => 10,
            'project_id' => 100,
            'assigned_by' => 5,
            'assigned_to' => 6,
        ]);
        $task->setRelation('project', $project);

        $this->assertFalse($this->taskPolicy->view($outsider, $task));
        $this->assertFalse($this->taskPolicy->update($outsider, $task));
    }

    public function test_standalone_task_access_rules(): void
    {
        $creator = $this->user(2, 'member');
        $assignee = $this->user(3, 'member');
        $otherUser = $this->user(4, 'member');

        $standaloneTask = new Task();
        $standaloneTask->forceFill([
            'id' => 20,
            'project_id' => null,
            'assigned_by' => 2,
            'assigned_to' => 3,
        ]);

        $this->assertTrue($this->taskPolicy->view($creator, $standaloneTask));
        $this->assertTrue($this->taskPolicy->update($creator, $standaloneTask));

        $this->assertTrue($this->taskPolicy->view($assignee, $standaloneTask));
        $this->assertTrue($this->taskPolicy->update($assignee, $standaloneTask));

        $this->assertFalse($this->taskPolicy->view($otherUser, $standaloneTask));
        $this->assertFalse($this->taskPolicy->update($otherUser, $standaloneTask));
    }

    public function test_project_member_can_view_deliverable_read_only_but_cannot_update(): void
    {
        $projectMember = $this->user(4, 'member');
        $project = new Project();
        $project->forceFill([
            'id' => 100,
            'created_by' => 5,
            'assigned_users' => [4, 6],
        ]);

        $deliverable = new Deliverable();
        $deliverable->forceFill([
            'id' => 50,
            'project_id' => 100,
            'created_by' => 5,
            'assigned_to' => 6,
        ]);
        $deliverable->setRelation('project', $project);

        // Project member 4 CAN view deliverable
        $this->assertTrue($this->deliverablePolicy->view($projectMember, $deliverable));

        // Project member 4 CANNOT update deliverable
        $this->assertFalse($this->deliverablePolicy->update($projectMember, $deliverable));
    }

    public function test_project_member_can_view_subtask_via_task_project(): void
    {
        $projectMember = $this->user(4, 'member');
        $project = new Project();
        $project->forceFill([
            'id' => 100,
            'created_by' => 5,
            'assigned_users' => [4, 6],
        ]);

        $task = new Task();
        $task->forceFill([
            'id' => 10,
            'project_id' => 100,
            'assigned_by' => 5,
            'assigned_to' => 6,
        ]);
        $task->setRelation('project', $project);

        $subtask = new Deliverable();
        $subtask->forceFill([
            'id' => 51,
            'task_id' => 10,
            'created_by' => 5,
            'assigned_to' => 6,
        ]);
        $subtask->setRelation('task', $task);

        // Project member 4 CAN view subtask
        $this->assertTrue($this->deliverablePolicy->view($projectMember, $subtask));

        // Project member 4 CANNOT update subtask
        $this->assertFalse($this->deliverablePolicy->update($projectMember, $subtask));
    }

    public function test_non_project_member_cannot_view_or_update_deliverable(): void
    {
        $outsider = $this->user(99, 'member');
        $project = new Project();
        $project->forceFill([
            'id' => 100,
            'created_by' => 5,
            'assigned_users' => [4, 6],
        ]);

        $deliverable = new Deliverable();
        $deliverable->forceFill([
            'id' => 50,
            'project_id' => 100,
            'created_by' => 5,
            'assigned_to' => 6,
        ]);
        $deliverable->setRelation('project', $project);

        $this->assertFalse($this->deliverablePolicy->view($outsider, $deliverable));
        $this->assertFalse($this->deliverablePolicy->update($outsider, $deliverable));
    }

    public function test_project_followers_and_manual_visibility_can_view_read_only(): void
    {
        $followerUser = $this->user(7, 'member');
        $visibleUser = $this->user(8, 'member');

        $project = new Project();
        $project->forceFill([
            'id' => 100,
            'created_by' => 5,
            'assigned_users' => [6],
        ]);
        $project->setRelation('followers', collect([$this->user(7)]));
        $project->setRelation('manuallyVisibleTo', collect([(object)['user_id' => 8, 'is_visible' => true]]));

        $task = new Task();
        $task->forceFill(['id' => 10, 'project_id' => 100, 'assigned_by' => 5, 'assigned_to' => 6]);
        $task->setRelation('project', $project);

        $deliverable = new Deliverable();
        $deliverable->forceFill(['id' => 50, 'project_id' => 100, 'created_by' => 5, 'assigned_to' => 6]);
        $deliverable->setRelation('project', $project);

        // Follower can view task and deliverable (read-only)
        $this->assertTrue($this->taskPolicy->view($followerUser, $task));
        $this->assertFalse($this->taskPolicy->update($followerUser, $task));
        $this->assertTrue($this->deliverablePolicy->view($followerUser, $deliverable));
        $this->assertFalse($this->deliverablePolicy->update($followerUser, $deliverable));

        // Manually visible user can view task and deliverable (read-only)
        $this->assertTrue($this->taskPolicy->view($visibleUser, $task));
        $this->assertFalse($this->taskPolicy->update($visibleUser, $task));
        $this->assertTrue($this->deliverablePolicy->view($visibleUser, $deliverable));
        $this->assertFalse($this->deliverablePolicy->update($visibleUser, $deliverable));
    }

    public function test_guest_user_project_access(): void
    {
        $guestAllowed = $this->user(15, 'guest');
        $guestDenied = $this->user(16, 'guest');

        $project = new Project();
        $project->forceFill([
            'id' => 100,
            'created_by' => 5,
            'guest_ids' => [15],
        ]);

        $task = new Task();
        $task->forceFill(['id' => 10, 'project_id' => 100, 'assigned_by' => 5, 'assigned_to' => 6]);
        $task->setRelation('project', $project);

        $deliverable = new Deliverable();
        $deliverable->forceFill(['id' => 50, 'project_id' => 100, 'created_by' => 5, 'assigned_to' => 6]);
        $deliverable->setRelation('project', $project);

        // Guest with access can view (read-only)
        $this->assertTrue($this->taskPolicy->view($guestAllowed, $task));
        $this->assertFalse($this->taskPolicy->update($guestAllowed, $task));
        $this->assertTrue($this->deliverablePolicy->view($guestAllowed, $deliverable));
        $this->assertFalse($this->deliverablePolicy->update($guestAllowed, $deliverable));

        // Guest without access cannot view
        $this->assertFalse($this->taskPolicy->view($guestDenied, $task));
        $this->assertFalse($this->taskPolicy->update($guestDenied, $task));
        $this->assertFalse($this->deliverablePolicy->view($guestDenied, $deliverable));
        $this->assertFalse($this->deliverablePolicy->update($guestDenied, $deliverable));
    }

    public function test_project_team_leader_and_team_members_can_view_task(): void
    {
        $teamLead = $this->user(20, 'team_lead');
        $teamMember = $this->user(21, 'member');

        $team = new \App\Models\Team();
        $team->forceFill(['id' => 5, 'leader_id' => 20]);
        $team->setRelation('members', collect([$teamLead, $teamMember]));

        $project = new Project();
        $project->forceFill(['id' => 100, 'created_by' => 5, 'team_id' => 5]);
        $project->setRelation('team', $team);

        $task = new Task();
        $task->forceFill(['id' => 10, 'project_id' => 100, 'assigned_by' => 5, 'assigned_to' => 6]);
        $task->setRelation('project', $project);

        $this->assertTrue($this->taskPolicy->view($teamLead, $task));
        $this->assertTrue($this->taskPolicy->view($teamMember, $task));
        $this->assertFalse($this->taskPolicy->update($teamMember, $task));
    }

    public function test_comment_view_authorization_aligned_with_task_policy(): void
    {
        $projectMember = $this->user(30, 'member');
        $outsider = $this->user(99, 'member');

        $project = new Project();
        $project->forceFill(['id' => 200, 'created_by' => 1, 'assigned_users' => [30]]);

        $task = new Task();
        $task->forceFill(['id' => 20, 'project_id' => 200, 'assigned_by' => 1, 'assigned_to' => 2]);
        $task->setRelation('project', $project);

        $deliverable = new Deliverable();
        $deliverable->forceFill(['id' => 70, 'task_id' => 20, 'project_id' => 200, 'created_by' => 1, 'assigned_to' => 2]);
        $deliverable->setRelation('task', $task);
        $deliverable->setRelation('project', $project);

        // Project member has view authorization for task and deliverable (and therefore comments)
        $this->assertTrue($this->taskPolicy->view($projectMember, $task));
        $this->assertTrue($this->deliverablePolicy->view($projectMember, $deliverable));

        // Outsider does not have view authorization
        $this->assertFalse($this->taskPolicy->view($outsider, $task));
        $this->assertFalse($this->deliverablePolicy->view($outsider, $deliverable));
    }

    public function test_acknowledge_and_submit_deliverable_authorization(): void
    {
        $admin = $this->user(1, 'admin');
        $manager = $this->user(2, 'manager');
        $creator = $this->user(3, 'member');
        $assignee = $this->user(4, 'member');
        $otherMember = $this->user(5, 'member');

        $deliverable = new Deliverable();
        $deliverable->forceFill([
            'id' => 10,
            'created_by' => 3,
            'assigned_to' => 4,
            'status' => 'pending',
        ]);

        // Admin, Manager, Creator, and Assignee can acknowledge
        $this->assertTrue($this->deliverablePolicy->acknowledge($admin, $deliverable));
        $this->assertTrue($this->deliverablePolicy->acknowledge($manager, $deliverable));
        $this->assertTrue($this->deliverablePolicy->acknowledge($creator, $deliverable));
        $this->assertTrue($this->deliverablePolicy->acknowledge($assignee, $deliverable));
        $this->assertFalse($this->deliverablePolicy->acknowledge($otherMember, $deliverable));

        // Admin, Manager, Creator, and Assignee can submit
        $this->assertTrue($this->deliverablePolicy->submit($admin, $deliverable));
        $this->assertTrue($this->deliverablePolicy->submit($manager, $deliverable));
        $this->assertTrue($this->deliverablePolicy->submit($creator, $deliverable));
        $this->assertTrue($this->deliverablePolicy->submit($assignee, $deliverable));
        $this->assertFalse($this->deliverablePolicy->submit($otherMember, $deliverable));

        // Admin and Manager can approve/reject/reopen
        $this->assertTrue($this->deliverablePolicy->approve($admin, $deliverable));
        $this->assertTrue($this->deliverablePolicy->approve($manager, $deliverable));
        $this->assertTrue($this->deliverablePolicy->approve($creator, $deliverable));
        $this->assertFalse($this->deliverablePolicy->approve($assignee, $deliverable));
    }

    public function test_acknowledge_and_submit_task_authorization(): void
    {
        $admin = $this->user(1, 'admin');
        $manager = $this->user(2, 'manager');
        $assigner = $this->user(3, 'member');
        $assignee = $this->user(4, 'member');
        $otherMember = $this->user(5, 'member');

        $task = new Task();
        $task->forceFill([
            'id' => 20,
            'assigned_by' => 3,
            'assigned_to' => 4,
            'status' => 'pending',
        ]);

        // Admin, Manager, Assigner, and Assignee can acknowledge pending task
        $this->assertTrue($this->taskPolicy->acknowledge($admin, $task));
        $this->assertTrue($this->taskPolicy->acknowledge($manager, $task));
        $this->assertTrue($this->taskPolicy->acknowledge($assigner, $task));
        $this->assertTrue($this->taskPolicy->acknowledge($assignee, $task));
        $this->assertFalse($this->taskPolicy->acknowledge($otherMember, $task));

        // Admin, Manager, Assigner, and Assignee can submit task
        $this->assertTrue($this->taskPolicy->submit($admin, $task));
        $this->assertTrue($this->taskPolicy->submit($manager, $task));
        $this->assertTrue($this->taskPolicy->submit($assigner, $task));
        $this->assertTrue($this->taskPolicy->submit($assignee, $task));
        $this->assertFalse($this->taskPolicy->submit($otherMember, $task));

        // Admin, Manager, Assigner can approve task
        $this->assertTrue($this->taskPolicy->approve($admin, $task));
        $this->assertTrue($this->taskPolicy->approve($manager, $task));
        $this->assertTrue($this->taskPolicy->approve($assigner, $task));
        $this->assertFalse($this->taskPolicy->approve($assignee, $task));
    }
}

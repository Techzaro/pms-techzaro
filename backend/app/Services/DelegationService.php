<?php

namespace App\Services;

use App\Models\Deliverable;
use App\Models\Task;
use App\Models\TaskDelegation;
use App\Models\TaskWorkflowEvent;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Service for managing task delegation chains and approval workflows.
 * Handles delegation creation, acceptance, rejection, revocation, and chain-based approval routing.
 */
class DelegationService
{
    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService,
        private AuditService $auditService
    ) {}

    /** Permanent final owner of the task. Existing tasks fall back to assigned_by. */
    public function creatorId(Task $task): ?int
    {
        $id = $task->creator_id ?: $task->assigned_by;
        return $id ? (int) $id : null;
    }

    /**
     * Build the return route from accepted delegations.
     * A return_to_transferor step is required; direct-transfer users are bypassed.
     */
    public function submissionRoute(Task $task, ?int $submitterId = null): array
    {
        $submitterId ??= $task->current_submitter_id ?: $task->current_owner ?: $task->assigned_to;
        $route = [];
        if ($submitterId) {
            $route[] = (int) $submitterId;
        }

        $chain = array_values(array_filter(
            $task->delegation_chain ?? [],
            fn ($entry) => strtolower((string) ($entry['status'] ?? '')) === 'accepted'
        ));

        foreach (array_reverse($chain) as $entry) {
            if (($entry['return_to_transferor'] ?? true) && ! empty($entry['delegated_by'])) {
                $route[] = (int) $entry['delegated_by'];
            }
        }

        $creatorId = $this->creatorId($task);
        if ($creatorId) {
            $route[] = $creatorId;
        }

        return array_values(array_unique($route));
    }

    public function nextSubmissionReviewer(Task $task, ?int $submitterId = null, array $forwardedBy = []): ?int
    {
        $route = $this->submissionRoute($task, $submitterId);
        $completed = array_map('intval', array_merge(
            $submitterId ? [$submitterId] : [],
            $forwardedBy
        ));

        foreach ($route as $userId) {
            if (! in_array((int) $userId, $completed, true)) {
                return (int) $userId;
            }
        }

        return null;
    }

    /** Viewer-specific status and action permissions for every API consumer. */
    public function routingPayload(Task $task, User $viewer): array
    {
        $rawStatus = strtolower((string) $task->status);
        $stage = $task->submission_stage;
        $viewerId = (int) $viewer->id;
        $creatorId = $this->creatorId($task);
        $reviewerId = $task->current_reviewer_id ? (int) $task->current_reviewer_id : null;
        $submitterId = $task->current_submitter_id ? (int) $task->current_submitter_id : null;
        $displayStatus = $rawStatus;

        if (in_array($rawStatus, ['approved', 'completed', 'done'], true)) {
            $displayStatus = 'approved';
        } elseif (! $stage && $rawStatus === 'pending') {
            $pendingDelegation = collect($task->delegation_chain ?? [])
                ->reverse()
                ->first(fn ($entry) => strtolower((string) ($entry['status'] ?? '')) === 'pending');

            if ($pendingDelegation) {
                $transferorId = (int) ($pendingDelegation['delegated_by'] ?? 0);
                $delegateeId = (int) ($pendingDelegation['delegated_to'] ?? 0);

                // Only the users participating in the unacknowledged hand-off are pending.
                // Earlier users already have an acknowledged assignee below them, so their
                // view remains in progress while the next delegate decides whether to accept.
                $displayStatus = in_array($viewerId, [$transferorId, $delegateeId], true)
                    ? 'pending'
                    : 'in_progress';
            }
        } elseif (in_array($stage, ['awaiting_checkpoint', 'awaiting_creator'], true)) {
            $route = $this->submissionRoute($task, $submitterId);
            $reviewerIndex = array_search($reviewerId, $route, true);
            $viewerIndex = array_search($viewerId, $route, true);
            // The active reviewer has received the submission even if legacy or
            // partially migrated route metadata omits them from the derived route.
            if ($reviewerId && $viewerId === $reviewerId) {
                $displayStatus = 'submitted';
            } elseif ($viewerIndex !== false && $reviewerIndex !== false) {
                $displayStatus = $viewerIndex <= $reviewerIndex ? 'submitted' : 'in_progress';
            } elseif ($viewerId === $creatorId && $viewerId !== $reviewerId) {
                $displayStatus = 'in_progress';
            } else {
                // Delegation participants omitted from the return route are bypassed.
                $displayStatus = 'submitted';
            }
        } elseif (in_array($stage, ['declined', 'returned'], true) || in_array($rawStatus, ['reopened', 'rejected', 'declined'], true)) {
            $reopenedById = (int) ($task->reopened_by ?: $task->rejected_by ?: 0);
            $subId = (int) ($task->current_submitter_id ?: $task->assigned_to ?: 0);
            $reopenedParticipants = [$subId, $reopenedById];
            foreach ($task->delegation_chain ?? [] as $entry) {
                if (strtolower((string) ($entry['status'] ?? '')) !== 'accepted') {
                    continue;
                }
                $reopenedParticipants[] = (int) ($entry['delegated_by'] ?? 0);
                $reopenedParticipants[] = (int) ($entry['delegated_to'] ?? 0);
            }
            $reopenedParticipants = array_values(array_unique(array_filter(array_map('intval', $reopenedParticipants))));

            // If task is reopened or pending, its core workflow status is pending
            if ($task->is_reopened || $rawStatus === 'pending' || $rawStatus === 'reopened') {
                $displayStatus = 'pending';
            } elseif (! $subId || in_array($viewerId, $reopenedParticipants, true)) {
                $displayStatus = in_array($rawStatus, ['rejected', 'declined'], true) ? $rawStatus : 'declined';
            } else {
                $displayStatus = 'in_progress';
            }
        }

        $nextId = null;
        if ($reviewerId === $viewerId) {
            $forwarded = $task->submission_forwarded_by ?? [];
            $nextId = $this->nextSubmissionReviewer($task, $submitterId, array_merge($forwarded, [$viewerId]));
        }

        return [
            'display_status' => $displayStatus,
            'submission_stage' => $stage,
            'current_reviewer_id' => $reviewerId,
            'current_submitter_id' => $submitterId,
            'can_submit_to_next' => $reviewerId === $viewerId && $viewerId !== $creatorId && in_array($stage, ['awaiting_checkpoint'], true),
            'can_decline_submission' => $reviewerId === $viewerId && in_array($stage, ['awaiting_checkpoint', 'awaiting_creator'], true),
            'can_final_approve' => $reviewerId === $viewerId && $viewerId === $creatorId && $stage === 'awaiting_creator',
            'next_route_user_id' => $nextId,
        ];
    }

    /**
     * Delegate a task to another user, building the delegation chain.
     */
    public function delegateTask(
        Task $task,
        User $delegatedBy,
        User $delegatedTo,
        string $reason,
        ?string $reasonDetail = null,
        ?string $notes = null,
        bool $returnToTransferor = true
    ): TaskDelegation {
        // Determine delegation level
        $existingChain = $task->delegation_chain ?? [];
        $level = count($existingChain) + 1;

        // Create delegation record
        $delegation = TaskDelegation::create([
            'task_id' => $task->id,
            'deliverable_id' => null,
            'delegated_by' => $delegatedBy->id,
            'delegated_to' => $delegatedTo->id,
            'parent_delegation_id' => $level > 1 ? $this->getParentDelegationId($task) : null,
            'reason' => $reason,
            'reason_detail' => $reasonDetail,
            'delegation_level' => $level,
            'status' => 'pending',
            'notes' => $notes,
            'return_to_transferor' => $returnToTransferor,
        ]);

        // Update delegation chain on task
        $chainEntry = [
            'id' => $delegation->id,
            'delegated_by' => $delegatedBy->id,
            'delegated_by_name' => $delegatedBy->name,
            'delegated_to' => $delegatedTo->id,
            'delegated_to_name' => $delegatedTo->name,
            'reason' => $reason,
            'level' => $level,
            'status' => 'pending',
            'return_to_transferor' => $returnToTransferor,
            'created_at' => now()->toISOString(),
        ];

        $existingChain[] = $chainEntry;
        $approvalChain = $this->buildApprovalChain($existingChain);

        $task->update([
            'current_owner' => $delegatedTo->id,
            'delegation_chain' => $existingChain,
            'approval_chain' => $approvalChain,
            'delegation_count' => $level,
            'status' => 'pending',
            'is_transferred' => true,
            'states' => array_values(array_unique(array_merge(is_array($task->states) ? $task->states : [], ['Transferred']))),
        ]);
        $task->stopTimer();

        // If no original_assigner set yet, save the first assigner
        if (empty($task->original_assigner)) {
            $task->update(['original_assigner' => $delegatedBy->id]);
        }

        // Create workflow event
        $comment = "{$delegatedBy->name} delegated this task to {$delegatedTo->name}. Reason: {$reason}";
        if (! empty($reasonDetail)) {
            $comment .= " ({$reasonDetail})";
        }
        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $delegatedBy->id,
            'action' => 'delegated',
            'comment' => $comment,
        ]);

        // Add to assignees if not already
        if (! $task->assignees()->where('users.id', $delegatedTo->id)->exists()) {
            $task->assignees()->attach($delegatedTo->id, [
                'status' => 'pending',
            ]);
        }

        // Send notification to the delegatee
        $this->notificationService->notify(
            $delegatedTo->id,
            $delegatedBy->id,
            'task_delegated',
            'task',
            $task->id,
            'Task Delegated to You',
            "{$delegatedBy->name} has delegated task {$task->business_id} (\"{$task->title}\") to you. Reason: {$reason}",
            '/tasks/task-details/'.$task->id.'?from=tasks'
        );

        // Log activity
        $this->activityService->log(
            $delegatedBy->id,
            'task_delegated',
            "You delegated task \"{$task->title}\" to {$delegatedTo->name}",
            'task',
            $task->id
        );

        // Audit log
        try {
            $this->auditService->log(
                module: 'task_management',
                action: 'delegate',
                description: "Delegated task {$task->title} to {$delegatedTo->name}",
                user: $delegatedBy,
                entityType: 'Task',
                entityId: $task->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            Log::error('Failed to log audit for delegation', ['error' => $e->getMessage()]);
        }

        return $delegation;
    }

    /**
     * Delegate a deliverable to another user.
     */
    public function delegateDeliverable(
        Deliverable $deliverable,
        User $delegatedBy,
        User $delegatedTo,
        string $reason,
        ?string $reasonDetail = null,
        ?string $notes = null,
        bool $returnToTransferor = true
    ): TaskDelegation {
        $existingChain = $deliverable->delegation_chain ?? [];
        $level = count($existingChain) + 1;

        $delegation = TaskDelegation::create([
            'task_id' => $deliverable->task_id,
            'deliverable_id' => $deliverable->id,
            'delegated_by' => $delegatedBy->id,
            'delegated_to' => $delegatedTo->id,
            'parent_delegation_id' => $level > 1 ? $this->getParentDelegationIdForDeliverable($deliverable) : null,
            'reason' => $reason,
            'reason_detail' => $reasonDetail,
            'delegation_level' => $level,
            'status' => 'pending',
            'notes' => $notes,
            'return_to_transferor' => $returnToTransferor,
        ]);

        $chainEntry = [
            'id' => $delegation->id,
            'delegated_by' => $delegatedBy->id,
            'delegated_by_name' => $delegatedBy->name,
            'delegated_to' => $delegatedTo->id,
            'delegated_to_name' => $delegatedTo->name,
            'reason' => $reason,
            'level' => $level,
            'status' => 'pending',
            'return_to_transferor' => $returnToTransferor,
            'created_at' => now()->toISOString(),
        ];

        $existingChain[] = $chainEntry;
        $approvalChain = $this->buildApprovalChain($existingChain);

        $deliverable->update([
            'current_owner' => $delegatedTo->id,
            'delegation_chain' => $existingChain,
            'approval_chain' => $approvalChain,
            'delegation_count' => $level,
            'status' => 'pending',
            'is_transferred' => true,
            'states' => array_values(array_unique(array_merge(is_array($deliverable->states) ? $deliverable->states : [], ['Transferred']))),
        ]);

        if (empty($deliverable->original_assigner)) {
            $deliverable->update(['original_assigner' => $delegatedBy->id]);
        }

        // System comment on deliverable's parent task
        $comment = "{$delegatedBy->name} delegated subtask \"{$deliverable->title}\" to {$delegatedTo->name}. Reason: {$reason}";
        if (! empty($reasonDetail)) {
            $comment .= " ({$reasonDetail})";
        }

        TaskWorkflowEvent::create([
            'task_id' => $deliverable->task_id,
            'user_id' => $delegatedBy->id,
            'action' => 'delegated',
            'comment' => $comment,
        ]);

        $this->notificationService->notify(
            $delegatedTo->id,
            $delegatedBy->id,
            'task_delegated',
            'task',
            $deliverable->task_id,
            'Subtask Delegated to You',
            "{$delegatedBy->name} has delegated subtask \"{$deliverable->title}\" to you. Reason: {$reason}",
            '/tasks/task-details/'.$deliverable->task_id.'?from=tasks'
        );

        $this->activityService->log(
            $delegatedBy->id,
            'task_delegated',
            "You delegated subtask \"{$deliverable->title}\" to {$delegatedTo->name}",
            'task',
            $deliverable->task_id
        );

        return $delegation;
    }

    /**
     * Accept a pending delegation.
     */
    public function acceptDelegation(TaskDelegation $delegation, User $acceptor): TaskDelegation
    {
        if ((int) $delegation->delegated_to !== (int) $acceptor->id) {
            throw new \InvalidArgumentException('Only the delegated user can accept this delegation.');
        }
        if ($delegation->status !== 'pending') {
            throw new \InvalidArgumentException('This delegation is no longer pending.');
        }

        $model = $delegation->deliverable_id ? $delegation->deliverable : $delegation->task;
        $isDeliverable = (bool) $delegation->deliverable_id;
        $entityType = $isDeliverable ? 'deliverable' : 'task';

        // Keep every state-changing part atomic. A workflow/timer failure must not
        // leave an accepted delegation behind while the endpoint reports failure.
        DB::transaction(function () use ($delegation, $acceptor, $model, $isDeliverable, $entityType) {
            $delegation->update([
                'status' => 'accepted',
                'accepted_at' => now(),
            ]);

            // Update chain entry status on the correct model (task or deliverable)
            $chain = $model->delegation_chain ?? [];
            foreach ($chain as &$entry) {
                if ((int) $entry['id'] === (int) $delegation->id) {
                    $entry['status'] = 'accepted';
                    break;
                }
            }
            unset($entry);
            $approvalChain = $this->buildApprovalChain($chain);
            $model->update([
                'delegation_chain' => $chain,
                'approval_chain' => $approvalChain,
                'status' => 'in_progress',
                'acknowledged_at' => now(),
                'acknowledged_by' => $acceptor->id,
            ]);

            $model->assignees()->updateExistingPivot($acceptor->id, [
                'status' => 'in_progress',
            ]);

            $taskId = $isDeliverable ? $model->task_id : $model->id;
            TaskWorkflowEvent::create([
                'task_id' => $taskId,
                'user_id' => $acceptor->id,
                'action' => 'delegation_accepted',
                'comment' => "{$acceptor->name} accepted the delegation of this {$entityType}.",
            ]);
            TaskWorkflowEvent::create([
                'task_id' => $taskId,
                'user_id' => $acceptor->id,
                'action' => 'acknowledged',
                'comment' => "{$acceptor->name} acknowledged this {$entityType}",
            ]);
        });

        $link = $isDeliverable
            ? '/deliverables/'.$model->id
            : '/tasks/task-details/'.$model->id.'?from=tasks';

        // Notify: if return_to_transferor=false, notify the original assigner instead of the transferor
        $notifyUserId = $delegation->delegated_by;
        if ($delegation->return_to_transferor === false || $delegation->return_to_transferor === 0) {
            $notifyUserId = $isDeliverable
                ? ($model->task?->assigned_by ?? $model->created_by)
                : $model->assigned_by;
        }
        // These are secondary effects: their failure must not change a successful
        // acknowledgement into an error response.
        try {
            $this->notificationService->notify(
                $notifyUserId,
                $acceptor->id,
                'task_delegation_accepted',
                $entityType,
                $model->id,
                'Delegation Accepted',
                "{$acceptor->name} has accepted the delegation of {$entityType} {$model->business_id}.",
                $link
            );
        } catch (\Throwable $e) {
            Log::warning('Delegation acceptance notification failed', ['error' => $e->getMessage()]);
        }

        try {
            $this->activityService->log(
                $acceptor->id,
                'task_delegation_accepted',
                "You accepted delegation of {$entityType} \"{$model->title}\"",
                $entityType,
                $model->id
            );
        } catch (\Throwable $e) {
            Log::warning('Delegation acceptance activity log failed', ['error' => $e->getMessage()]);
        }

        return $delegation;
    }

    /**
     * Reject a pending delegation.
     */
    public function rejectDelegation(TaskDelegation $delegation, User $rejector, ?string $reason = null): TaskDelegation
    {
        if ((int) $delegation->delegated_to !== (int) $rejector->id) {
            throw new \InvalidArgumentException('Only the delegated user can reject this delegation.');
        }
        if ($delegation->status !== 'pending') {
            throw new \InvalidArgumentException('This delegation is no longer pending.');
        }

        $delegation->update([
            'status' => 'rejected',
            'rejected_at' => now(),
            'notes' => $reason,
        ]);

        // Update chain entry status
        $task = $delegation->task;
        $chain = $task->delegation_chain ?? [];
        foreach ($chain as &$entry) {
            if ((int) $entry['id'] === (int) $delegation->id) {
                $entry['status'] = 'rejected';
                break;
            }
        }
        unset($entry);

        // Revert task ownership back to the delegator
        $task->update([
            'delegation_chain' => $chain,
            'current_owner' => $delegation->delegated_by,
            'status' => 'pending',
        ]);

        $comment = "{$rejector->name} rejected the delegation.".($reason ? " Reason: {$reason}" : '');

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $rejector->id,
            'action' => 'delegation_rejected',
            'comment' => $comment,
        ]);

        $this->notificationService->notify(
            $delegation->delegated_by,
            $rejector->id,
            'task_delegation_rejected',
            'task',
            $task->id,
            'Delegation Rejected',
            "{$rejector->name} has rejected the delegation of task {$task->business_id}.".($reason ? " Reason: {$reason}" : ''),
            '/tasks/task-details/'.$task->id.'?from=tasks'
        );

        return $delegation;
    }

    /**
     * Revoke a delegation (by the delegator or admin).
     */
    public function revokeDelegation(TaskDelegation $delegation, User $revoker): TaskDelegation
    {
        if ((int) $delegation->delegated_by !== (int) $revoker->id && ! in_array($revoker->role, ['admin', 'manager'])) {
            throw new \InvalidArgumentException('Only the delegator or an admin can revoke this delegation.');
        }
        if (! in_array($delegation->status, ['pending', 'accepted'])) {
            throw new \InvalidArgumentException('This delegation cannot be revoked.');
        }

        $delegation->update([
            'status' => 'revoked',
            'revoked_at' => now(),
        ]);

        // Update chain entry status
        $task = $delegation->task;
        $chain = $task->delegation_chain ?? [];
        foreach ($chain as &$entry) {
            if ((int) $entry['id'] === (int) $delegation->id) {
                $entry['status'] = 'revoked';
                break;
            }
        }
        unset($entry);

        // Revert task ownership back to the delegator
        $task->update([
            'delegation_chain' => $chain,
            'current_owner' => $delegation->delegated_by,
            'status' => 'pending',
        ]);

        $comment = "{$revoker->name} revoked the delegation.";

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $revoker->id,
            'action' => 'delegation_revoked',
            'comment' => $comment,
        ]);

        $this->notificationService->notify(
            $delegation->delegated_to,
            $revoker->id,
            'task_delegation_revoked',
            'task',
            $task->id,
            'Delegation Revoked',
            "The delegation of task {$task->business_id} has been revoked by {$revoker->name}.",
            '/tasks/task-details/'.$task->id.'?from=tasks'
        );

        return $delegation;
    }

    /**
     * Determine who should approve a submission based on the delegation chain.
     * Returns the user ID who should approve, or null if the original assigner should approve.
     */
    public function getNextApprover(Task $task): ?int
    {
        $chain = $task->delegation_chain ?? [];
        $approvalChain = $task->approval_chain ?? [];

        if (empty($chain)) {
            return null; // Original assigner approves
        }

        // Check if transferor has already approved in approval_chain
        foreach ($approvalChain as $aEntry) {
            if ($aEntry['status'] === 'approved') {
                // This transferor already approved; route to original assigner
                return null;
            }
        }

        // Fallback: if approval_chain is empty/stale, check if the transferor is already current_owner
        // with task in_progress (meaning they already approved)
        $lastAccepted = null;
        foreach ($chain as $entry) {
            if ($entry['status'] === 'accepted') {
                $lastAccepted = $entry;
            }
        }
        if ($lastAccepted && ($lastAccepted['return_to_transferor'] ?? true)) {
            $transferorId = (int) $lastAccepted['delegated_by'];
            if ((int) ($task->current_owner ?? 0) === $transferorId && $task->status === 'in_progress') {
                return null; // Transferor already approved; route to original assigner
            }
        }

        if ($lastAccepted) {
            $returnToTransferor = $lastAccepted['return_to_transferor'] ?? true;

            if ($returnToTransferor) {
                // Return to the person who transferred (delegated_by)
                return (int) $lastAccepted['delegated_by'];
            } else {
                // Skip the transferor, go directly to original assigner
                // Find who delegated to the transferor
                foreach ($chain as $entry) {
                    if ($entry['status'] === 'accepted' && (int) $entry['delegated_to'] === (int) $lastAccepted['delegated_by']) {
                        return (int) $entry['delegated_by'];
                    }
                }

                // If no upper entry found, original assigner approves
                return null;
            }
        }

        // If no one accepted yet, the original assigner should approve
        return null;
    }

    /**
     * Determine who should approve a deliverable submission.
     */
    public function getDeliverableApprover(Deliverable $deliverable): ?int
    {
        $chain = $deliverable->delegation_chain ?? [];
        $approvalChain = $deliverable->approval_chain ?? [];

        if (empty($chain)) {
            return null;
        }

        // Check if transferor has already approved
        foreach ($approvalChain as $aEntry) {
            if ($aEntry['status'] === 'approved') {
                return null;
            }
        }

        $lastAccepted = null;
        foreach ($chain as $entry) {
            if ($entry['status'] === 'accepted') {
                $lastAccepted = $entry;
            }
        }

        if ($lastAccepted) {
            $returnToTransferor = $lastAccepted['return_to_transferor'] ?? true;

            if ($returnToTransferor) {
                return (int) $lastAccepted['delegated_by'];
            } else {
                // Skip the transferor
                foreach ($chain as $entry) {
                    if ($entry['status'] === 'accepted' && (int) $entry['delegated_to'] === (int) $lastAccepted['delegated_by']) {
                        return (int) $entry['delegated_by'];
                    }
                }

                return null;
            }
        }

        return null;
    }

    /**
     * Get the full delegation chain with user details.
     */
    public function getChainDetails(Task $task): array
    {
        $delegations = TaskDelegation::where('task_id', $task->id)
            ->with(['delegatedBy:id,name,email,role', 'delegatedTo:id,name,email,role'])
            ->orderBy('delegation_level')
            ->get();

        return $delegations->toArray();
    }

    /**
     * Get the full delegation chain for a deliverable.
     */
    public function getDeliverableChainDetails(Deliverable $deliverable): array
    {
        $delegations = TaskDelegation::where('deliverable_id', $deliverable->id)
            ->with(['delegatedBy:id,name,email,role', 'delegatedTo:id,name,email,role'])
            ->orderBy('delegation_level')
            ->get();

        return $delegations->toArray();
    }

    /**
     * Check if a user is the current owner of a task.
     */
    public function isCurrentOwner(Task $task, User $user): bool
    {
        if ($task->current_owner) {
            return (int) $task->current_owner === (int) $user->id;
        }

        return $task->assignees()->where('users.id', $user->id)->exists();
    }

    /**
     * Check if a user is in the delegation chain (delegator or delegatee).
     */
    public function isInDelegationChain(Task $task, User $user): bool
    {
        $chain = $task->delegation_chain ?? [];
        foreach ($chain as $entry) {
            if ((int) $entry['delegated_by'] === (int) $user->id || (int) $entry['delegated_to'] === (int) $user->id) {
                return true;
            }
        }

        return false;
    }

    /**
     * Build the approval chain (reversed delegation chain for approval routing).
     * If return_to_transferor is true, include the transferor in the chain.
     * If false, skip the transferor and go directly to the original assigner.
     */
    private function buildApprovalChain(array $delegationChain): array
    {
        $approvalChain = [];
        $reversed = array_reverse($delegationChain);

        foreach ($reversed as $entry) {
            $returnToTransferor = $entry['return_to_transferor'] ?? true;

            if ($returnToTransferor) {
                // Include this person (the transferor) in the approval chain
                $approvalChain[] = [
                    'approver_id' => $entry['delegated_by'],
                    'approver_name' => $entry['delegated_by_name'],
                    'level' => $entry['level'],
                    'status' => 'pending',
                ];
            } else {
                // Skip this transferor, jump to the next person in chain
                // Find who delegated TO this transferor (the person above them)
                foreach ($reversed as $upperEntry) {
                    if ((int) $upperEntry['delegated_to'] === (int) $entry['delegated_by']) {
                        $approvalChain[] = [
                            'approver_id' => $upperEntry['delegated_by'],
                            'approver_name' => $upperEntry['delegated_by_name'],
                            'level' => $upperEntry['level'],
                            'status' => 'pending',
                        ];
                        break;
                    }
                }
                // If no upper entry found, the original assigner will approve (handled by getNextApprover returning null)
            }
        }

        return $approvalChain;
    }

    /**
     * Rebuild the approval chain from the delegation chain (public for use by controllers).
     */
    public function rebuildApprovalChain(Task $task): array
    {
        $chain = $task->delegation_chain ?? [];
        $approvalChain = $this->buildApprovalChain($chain);
        $task->update(['approval_chain' => $approvalChain]);

        return $approvalChain;
    }

    /**
     * Get the parent delegation ID for chained task delegations.
     */
    private function getParentDelegationId(Task $task): ?int
    {
        $lastDelegation = TaskDelegation::where('task_id', $task->id)
            ->orderBy('delegation_level', 'desc')
            ->first();

        return $lastDelegation?->id;
    }

    /**
     * Get the parent delegation ID for chained deliverable delegations.
     */
    private function getParentDelegationIdForDeliverable(Deliverable $deliverable): ?int
    {
        $lastDelegation = TaskDelegation::where('deliverable_id', $deliverable->id)
            ->orderBy('delegation_level', 'desc')
            ->first();

        return $lastDelegation?->id;
    }

    /**
     * Check if a user is the current owner of a deliverable.
     */
    public function isCurrentOwnerDeliverable(Deliverable $deliverable, User $user): bool
    {
        if ($deliverable->current_owner) {
            return (int) $deliverable->current_owner === (int) $user->id;
        }

        return (int) ($deliverable->assigned_to ?? 0) === (int) $user->id;
    }

    /**
     * Check if a user is in the deliverable's delegation chain.
     */
    public function isInDeliverableDelegationChain(Deliverable $deliverable, User $user): bool
    {
        $chain = $deliverable->delegation_chain ?? [];
        foreach ($chain as $entry) {
            if ((int) $entry['delegated_by'] === (int) $user->id || (int) $entry['delegated_to'] === (int) $user->id) {
                return true;
            }
        }

        return false;
    }
}

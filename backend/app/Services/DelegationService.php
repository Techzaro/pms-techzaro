<?php

namespace App\Services;

use App\Models\Task;
use App\Models\Deliverable;
use App\Models\TaskDelegation;
use App\Models\User;
use App\Models\TaskComment;
use App\Models\TaskWorkflowEvent;
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
        ]);

        // If no original_assigner set yet, save the first assigner
        if (empty($task->original_assigner)) {
            $task->update(['original_assigner' => $delegatedBy->id]);
        }

        // Add system comment
        $comment = "{$delegatedBy->name} delegated this task to {$delegatedTo->name}. Reason: {$reason}";
        if (!empty($reasonDetail)) {
            $comment .= " ({$reasonDetail})";
        }
        TaskComment::create([
            'task_id' => $task->id,
            'user_id' => $delegatedBy->id,
            'body' => $comment,
        ]);

        // Create workflow event
        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $delegatedBy->id,
            'action' => 'delegated',
            'comment' => $comment,
        ]);

        // Add to assignees if not already
        if (!$task->assignees()->where('users.id', $delegatedTo->id)->exists()) {
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
            '/tasks/task-details/' . $task->id . '?from=tasks'
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
        ]);

        if (empty($deliverable->original_assigner)) {
            $deliverable->update(['original_assigner' => $delegatedBy->id]);
        }

        // System comment on deliverable's parent task
        $comment = "{$delegatedBy->name} delegated subtask \"{$deliverable->title}\" to {$delegatedTo->name}. Reason: {$reason}";
        if (!empty($reasonDetail)) {
            $comment .= " ({$reasonDetail})";
        }

        TaskComment::create([
            'task_id' => $deliverable->task_id,
            'user_id' => $delegatedBy->id,
            'body' => $comment,
        ]);

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
            '/tasks/task-details/' . $deliverable->task_id . '?from=tasks'
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

        $delegation->update([
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);

        // Update chain entry status
        $task = $delegation->task;
        $chain = $task->delegation_chain ?? [];
        foreach ($chain as &$entry) {
            if ((int) $entry['id'] === (int) $delegation->id) {
                $entry['status'] = 'accepted';
                break;
            }
        }
        unset($entry);
        $task->update(['delegation_chain' => $chain]);

        // System comment
        $comment = "{$acceptor->name} accepted the delegation of this task.";
        TaskComment::create([
            'task_id' => $task->id,
            'user_id' => $acceptor->id,
            'body' => $comment,
        ]);

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $acceptor->id,
            'action' => 'delegation_accepted',
            'comment' => $comment,
        ]);

        // Notify the delegator
        $this->notificationService->notify(
            $delegation->delegated_by,
            $acceptor->id,
            'task_delegation_accepted',
            'task',
            $task->id,
            'Delegation Accepted',
            "{$acceptor->name} has accepted the delegation of task {$task->business_id}.",
            '/tasks/task-details/' . $task->id . '?from=tasks'
        );

        $this->activityService->log(
            $acceptor->id,
            'task_delegation_accepted',
            "You accepted delegation of task \"{$task->title}\"",
            'task',
            $task->id
        );

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
        ]);

        $comment = "{$rejector->name} rejected the delegation." . ($reason ? " Reason: {$reason}" : '');
        TaskComment::create([
            'task_id' => $task->id,
            'user_id' => $rejector->id,
            'body' => $comment,
        ]);

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
            "{$rejector->name} has rejected the delegation of task {$task->business_id}." . ($reason ? " Reason: {$reason}" : ''),
            '/tasks/task-details/' . $task->id . '?from=tasks'
        );

        return $delegation;
    }

    /**
     * Revoke a delegation (by the delegator or admin).
     */
    public function revokeDelegation(TaskDelegation $delegation, User $revoker): TaskDelegation
    {
        if ((int) $delegation->delegated_by !== (int) $revoker->id && !in_array($revoker->role, ['admin', 'manager'])) {
            throw new \InvalidArgumentException('Only the delegator or an admin can revoke this delegation.');
        }
        if (!in_array($delegation->status, ['pending', 'accepted'])) {
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
        ]);

        $comment = "{$revoker->name} revoked the delegation.";
        TaskComment::create([
            'task_id' => $task->id,
            'user_id' => $revoker->id,
            'body' => $comment,
        ]);

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
            '/tasks/task-details/' . $task->id . '?from=tasks'
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
        if (empty($chain)) {
            return null; // Original assigner approves
        }

        // Find the last accepted delegation in the chain
        $lastAccepted = null;
        foreach ($chain as $entry) {
            if ($entry['status'] === 'accepted') {
                $lastAccepted = $entry;
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
        if (empty($chain)) {
            return null;
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
            if ($entry['status'] === 'accepted') {
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
                        if ($upperEntry['status'] === 'accepted' && (int) $upperEntry['delegated_to'] === (int) $entry['delegated_by']) {
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
        }

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

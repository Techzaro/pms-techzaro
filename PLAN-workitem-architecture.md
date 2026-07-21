# Enterprise Work Item Architecture - Complete Redesign Plan

## Executive Summary

This plan transforms the PMS from two parallel modules (Task + Deliverable/Subtask) into a unified Enterprise Work Item architecture. Both entities share one reusable workflow engine, eliminating ~80% of code duplication while preserving all existing functionality with zero breaking API changes.

**Key Finding:** Task and Deliverable share ~80% identical code across models (~460 lines each), controllers (3,256 + 1,734 lines), and frontend (5+ pages, 4+ components). The refactoring consolidates this into shared services and traits.

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [Target Architecture](#2-target-architecture)
3. [Backend Service Layer](#3-backend-service-layer)
4. [Model Trait Extraction](#4-model-trait-extraction)
5. [Workflow Engine Design](#5-workflow-engine-design)
6. [Adapter Pattern](#6-adapter-pattern)
7. [API Route Strategy](#7-api-route-strategy)
8. [Frontend Component Architecture](#8-frontend-component-architecture)
9. [Implementation Phases](#9-implementation-phases)
10. [File Inventory](#10-file-inventory)
11. [Risk Mitigation](#11-risk-mitigation)
12. [Code Reduction Summary](#12-code-reduction-summary)

---

## 1. Current Architecture Analysis

### 1.1 Duplication Map

| Category | Task Location | Deliverable Location | Lines | Similarity |
|----------|--------------|---------------------|-------|------------|
| Timer methods (8) | `Task.php:275-457` | `Deliverable.php:287-462` | ~180 | 100% identical |
| Scope filter | `Task.php:112-140` | `Deliverable.php:120-162` | ~30 | 95% identical |
| Relationships (14) | `Task.php:143-272` | `Deliverable.php:164-284` | ~80 | 90% structural |
| Submit workflow | `TaskController.php` | `DeliverableController.php:566-690` | ~120 | 85-90% |
| Approve workflow | `TaskController.php` | `DeliverableController.php:699-758` | ~60 | 90% |
| Reject workflow | `TaskController.php` | `DeliverableController.php:767-837` | ~60 | 90% |
| Reopen workflow | `TaskController.php` | `DeliverableController.php:849-945` | ~80 | 85% |
| Acknowledge | `TaskController.php` | `DeliverableController.php:1165-1200` | ~50 | 85% |
| Pause/Resume | `TaskController.php` | `DeliverableController.php:1207-1269` | ~80 | 80% |
| File management (5) | `TaskController.php` | `DeliverableController.php:1320-1438` | ~100 | 90% |
| Notes (3) | `TaskUserNoteController.php` | `DeliverableController.php:1445-1481` | ~40 | 95% |
| Timer payload | `TaskController.php:3225-3256` | `DeliverableController.php:1274-1288` | ~30 | 95% |
| List queries (4) | `TaskController.php` | `DeliverableController.php:51-175` | ~300 | 75-80% |
| **Total duplicated** | | | **~1,260** | **~85% avg** |

### 1.2 Entity-Specific Differences

| Feature | Task Only | Deliverable Only |
|---------|-----------|-----------------|
| Business Code | `task_code` (TSK-xxx) | `subtask_code` (SUB-xxx) |
| Creator field | `assigned_by` | `created_by` |
| Hierarchy | Belongs to Project | Belongs to Task + Project |
| Recurring | `recurrence_settings`, `task_type` | N/A |
| Access Credentials | `TaskAccessCredential` model | N/A |
| Comments/Discussion | `TaskComment` model | Reuses TaskDiscussion |
| Assigner Pause | Full implementation | Columns exist, not implemented |
| Self-Review | N/A | `selfApprove()`, `selfRework()` |
| Rework Status | N/A | `rework_required` status + fields |
| Templates | N/A | `DeliverableTemplate` model |
| Due Date | `end_date` | `due_date` (validated against parent) |
| Estimates | N/A | `estimated_hours`, `estimated_minutes` |
| Labels/Tags | `requirements` (JSON) | `labels`, `tags`, `followers`, `dependencies` |

---

## 2. Target Architecture

### 2.1 Design Principles

1. **Separate tables, shared logic** - Keep `tasks` and `deliverables` tables separate (preserves FKs, API contracts)
2. **Trait extraction** - Shared model logic lives in reusable traits
3. **Service layer** - All business logic extracted from controllers into services
4. **Adapter pattern** - Entity-specific differences handled by adapters
5. **Interface contracts** - Services accept interfaces, not concrete types
6. **Zero API breaking** - All existing routes and response formats preserved

### 2.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      API Routes                              │
│  /tasks/{id}/submit    /deliverables/{id}/submit             │
│  /tasks/{id}/approve   /deliverables/{id}/approve            │
│  /tasks/{id}/files     /deliverables/{id}/files              │
│  (ALL EXISTING ROUTES PRESERVED)                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   Thin Controllers                           │
│  TaskController.php (3256→~800 lines)                       │
│  DeliverableController.php (1734→~500 lines)                │
│  Delegates ALL workflow to services                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                 Shared Service Layer                         │
│  ┌─────────────────┐  ┌──────────────────┐                  │
│  │ WorkflowEngine   │  │ WorkItemService  │                  │
│  │ (submit/approve  │  │ (timer/pause/    │                  │
│  │  reject/reopen)  │  │  resume/stop)    │                  │
│  └────────┬────────┘  └────────┬─────────┘                  │
│           │                    │                             │
│  ┌────────▼────────────────────▼─────────┐                  │
│  │          Adapters                      │                  │
│  │  TaskWorkflowAdapter                   │                  │
│  │  DeliverableWorkflowAdapter            │                  │
│  └───────────────────────────────────────┘                  │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ FileService  │ │ ChangeTrack  │ │ Submission   │        │
│  │              │ │ Service      │ │ Service      │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ Notification │ │ Activity     │ │ Audit        │        │
│  │ Service      │ │ Service      │ │ Service      │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    Model Layer                               │
│  Task.php (458→~200 lines)     Deliverable.php (463→~200)  │
│  uses: HasTimer, HasWorkflow, HasFiles                      │
│  implements: WorkItemInterface                               │
│                                                              │
│  Traits:                                                     │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │ HasTimer   │ │ HasWorkflow│ │ HasFiles   │              │
│  │ (~180 ln)  │ │ (~80 ln)   │ │ (~20 ln)  │              │
│  └────────────┘ └────────────┘ └────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Backend Service Layer Design

### 3.1 New Contracts

#### `app/Contracts/WorkItemInterface.php`

```php
<?php

namespace App\Contracts;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Contract that both Task and Deliverable must implement.
 * Ensures the WorkflowEngine can operate on any work item type.
 */
interface WorkItemInterface
{
    // Identity
    public function getTable(): string;
    public function getMorphClass(): string;  // 'task' or 'deliverable'
    public function getBusinessCode(): ?string;  // task_code or subtask_code
    public function getCodeField(): string;  // 'task_code' or 'subtask_code'

    // Hierarchy
    public function getProjectId(): ?int;
    public function getTaskId(): ?int;  // null for tasks
    public function getParentTitle(): ?string;

    // People
    public function getCreatorId(): int;  // assigned_by (task) or created_by (deliverable)
    public function getAssigneeId(): ?int;
    public function getAssigneeIds(): array;
    public function canBeApprovedBy(User $user): bool;
    public function canBeSubmittedBy(User $user): bool;

    // Status
    public function getStatus(): string;
    public function setStatus(string $status): void;
    public function getSubmittableStatuses(): array;

    // Storage
    public function getStoragePrefix(): string;  // 'task-submissions' or 'deliverable-submissions'

    // URLs
    public function getDetailUrl(): string;
    public function getListUrl(): string;

    // Timer (delegates to HasTimer trait)
    public function startTimer(): void;
    public function pauseTimer(?string $reason = null, ?string $reasonDetail = null, bool $isAutoPaused = false, ?int $userId = null): void;
    public function resumeTimer(?int $resumedBy = null): void;
    public function stopTimer(): void;
    public function getCurrentWorkSeconds(): int;
    public function getCurrentElapsedSeconds(): int;

    // Relationships
    public function pauseSessions(): HasMany;
    public function workflowEvents(): HasMany;
    public function changes(): HasMany;
    public function unviewedChanges(): HasMany;
    public function submissions(): HasMany;
    public function latestSubmission();
    public function files(): HasMany;
}
```

### 3.2 New Traits

#### `app/Traits/HasTimer.php`

```php
<?php

namespace App\Traits;

use App\Models\TaskPauseSession;
use App\Models\DeliverablePauseSession;

/**
 * Shared timer logic for Task and Deliverable.
 * Extracted from Task.php:275-457 and Deliverable.php:287-462.
 * Eliminates ~180 lines of exact duplication.
 */
trait HasTimer
{
    /** Start the work timer. */
    public function startTimer(): void
    {
        $this->update([
            'work_started_at' => now(),
            'elapsed_seconds' => 0,
            'total_work_seconds' => 0,
            'pause_count' => 0,
            'total_pause_seconds' => 0,
            'resume_count' => 0,
            'timer_state' => 'running',
            'last_timer_event_at' => now(),
            'work_completed_at' => null,
        ]);
    }

    /** Pause the running timer, accumulating elapsed and work seconds. */
    public function pauseTimer(
        ?string $reason = null,
        ?string $reasonDetail = null,
        bool $isAutoPaused = false,
        ?int $userId = null
    ): void {
        if ($this->timer_state !== 'running') {
            return;
        }

        $now = now();
        $elapsed = $this->last_timer_event_at
            ? max(0, abs((int) $now->diffInSeconds($this->last_timer_event_at)))
            : 0;

        $totalElapsed = $this->last_timer_event_at && $this->acknowledged_at
            ? max(0, abs((int) $now->diffInSeconds($this->acknowledged_at)))
            : ($this->elapsed_seconds ?? 0);

        $this->update([
            'total_work_seconds' => max(0, $this->total_work_seconds + $elapsed),
            'elapsed_seconds' => $totalElapsed,
            'timer_state' => 'paused',
            'last_timer_event_at' => $now,
            'pause_count' => ($this->pause_count ?? 0) + 1,
        ]);

        // Create pause session (polymorphic via getMorphClass)
        $pauseSessionClass = $this->getPauseSessionClass();
        $foreignKey = $this->getMorphClass() === 'task' ? 'task_id' : 'deliverable_id';

        $pauseSessionClass::create([
            $foreignKey => $this->id,
            'user_id' => $userId ?? $this->paused_by,
            'reason' => $reason ?? 'Other',
            'reason_detail' => $reasonDetail,
            'paused_at' => $now,
            'is_auto_paused' => $isAutoPaused,
        ]);
    }

    /** Resume a paused timer. */
    public function resumeTimer(?int $resumedBy = null): void
    {
        if ($this->timer_state !== 'paused') {
            return;
        }

        $session = $this->pauseSessions()->whereNull('resumed_at')->latest()->first();
        if ($session) {
            $duration = max(0, abs((int) now()->diffInSeconds($session->paused_at)));
            $session->update([
                'resumed_at' => now(),
                'duration_seconds' => $duration,
                'resumed_by' => $resumedBy,
            ]);

            $this->update([
                'total_pause_seconds' => ($this->total_pause_seconds ?? 0) + $duration,
            ]);
        }

        $totalElapsed = $this->acknowledged_at
            ? max(0, abs((int) now()->diffInSeconds($this->acknowledged_at)))
            : ($this->elapsed_seconds ?? 0);

        $this->update([
            'timer_state' => 'running',
            'last_timer_event_at' => now(),
            'elapsed_seconds' => $totalElapsed,
            'resume_count' => ($this->resume_count ?? 0) + 1,
        ]);
    }

    /** Stop the timer permanently (on submit). */
    public function stopTimer(): void
    {
        $now = now();

        if ($this->timer_state === 'running') {
            $elapsed = $this->last_timer_event_at
                ? max(0, abs((int) $now->diffInSeconds($this->last_timer_event_at)))
                : 0;

            $totalElapsed = $this->acknowledged_at
                ? max(0, abs((int) $now->diffInSeconds($this->acknowledged_at)))
                : ($this->elapsed_seconds ?? 0);

            $this->update([
                'total_work_seconds' => max(0, $this->total_work_seconds + $elapsed),
                'elapsed_seconds' => $totalElapsed,
                'timer_state' => 'completed',
                'last_timer_event_at' => $now,
                'work_completed_at' => $now,
            ]);
        } else {
            $totalElapsed = $this->acknowledged_at
                ? max(0, abs((int) now()->diffInSeconds($this->acknowledged_at)))
                : ($this->elapsed_seconds ?? 0);

            $this->update([
                'elapsed_seconds' => $totalElapsed,
                'timer_state' => 'completed',
                'work_completed_at' => $now,
            ]);
        }

        $openSession = $this->pauseSessions()->whereNull('resumed_at')->latest()->first();
        if ($openSession) {
            $duration = max(0, abs((int) $now->diffInSeconds($openSession->paused_at)));
            $openSession->update([
                'resumed_at' => $now,
                'duration_seconds' => $duration,
            ]);
            $this->update([
                'total_pause_seconds' => ($this->total_pause_seconds ?? 0) + $duration,
            ]);
        }
    }

    /** Get current work duration in seconds (computed from persisted state). */
    public function getCurrentWorkSeconds(): int
    {
        $base = $this->total_work_seconds ?? 0;

        if ($this->timer_state === 'running' && $this->last_timer_event_at) {
            $base += max(0, abs((int) now()->diffInSeconds($this->last_timer_event_at)));
        }

        return max(0, $base);
    }

    /** Get current elapsed seconds since acknowledge (computed live). */
    public function getCurrentElapsedSeconds(): int
    {
        if (! $this->acknowledged_at) {
            return 0;
        }

        return max(0, abs((int) now()->diffInSeconds($this->acknowledged_at)));
    }

    /** Format seconds into HH:MM:SS. */
    public static function formatDuration(int $seconds): string
    {
        $seconds = max(0, $seconds);
        $h = intdiv($seconds, 3600);
        $m = intdiv($seconds % 3600, 60);
        $s = $seconds % 60;

        return sprintf('%02d:%02d:%02d', $h, $m, $s);
    }

    /** Get pause reason labels map. */
    public static function pauseReasons(): array
    {
        return [
            'waiting_client' => 'Waiting for Client',
            'waiting_approval' => 'Waiting for Manager Approval',
            'waiting_dependency' => 'Waiting for Dependency',
            'technical_issue' => 'Technical Issue',
            'personal_break' => 'Personal Break',
            'meeting' => 'Meeting',
            'internet_issue' => 'Internet or System Issue',
            'auto_paused' => 'Auto Paused Due To Inactivity',
            'other' => 'Other',
        ];
    }

    /** Get the pause session model class for this entity. */
    abstract protected function getPauseSessionClass(): string;

    /** Build the timer payload for API responses. */
    public function getTimerPayload(): array
    {
        return [
            'state' => $this->timer_state,
            'work_started_at' => $this->work_started_at?->format('Y-m-d\TH:i:s'),
            'total_work_seconds' => $this->getCurrentWorkSeconds(),
            'elapsed_seconds' => $this->getCurrentElapsedSeconds(),
            'pause_count' => $this->pause_count ?? 0,
            'total_pause_seconds' => $this->total_pause_seconds ?? 0,
            'resume_count' => $this->resume_count ?? 0,
        ];
    }
}
```

#### `app/Traits/HasWorkflow.php`

```php
<?php

namespace App\Traits;

use Illuminate\Database\Eloquent\Builder;

/**
 * Shared workflow relationships and query scopes.
 * Extracted from Task and Deliverable model duplicates.
 */
trait HasWorkflow
{
    /** Apply filters for querying work items. */
    public function scopeFilter(Builder $query, array $filters): Builder
    {
        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        if (! empty($filters['priority'])) {
            $query->where('priority', $filters['priority']);
        }
        if (! empty($filters['assigned_to'])) {
            $query->where('assigned_to', $filters['assigned_to']);
        }
        if (! empty($filters['project_id'])) {
            $query->where('project_id', $filters['project_id']);
        }
        if (! empty($filters['search'])) {
            $query->where(function ($q) use ($filters) {
                $codeField = $this->getCodeField();
                $q->where('title', 'like', '%'.$filters['search'].'%')
                    ->orWhere($codeField, 'like', '%'.$filters['search'].'%');
            });
        }
        if (! empty($filters['start_date_from'])) {
            $query->where('start_date', '>=', $filters['start_date_from']);
        }
        if (! empty($filters['start_date_to'])) {
            $query->where('start_date', '<=', $filters['start_date_to']);
        }

        return $query;
    }

    /** Get the list of statuses that can be submitted from. */
    public function getSubmittableStatuses(): array
    {
        return ['pending', 'rejected', 'reopened', 'rework_required'];
    }
}
```

#### `app/Traits/HasFiles.php`

```php
<?php

namespace App\Traits;

/**
 * Shared file attachment relationship.
 */
trait HasFiles
{
    public function files()
    {
        return $this->hasMany($this->getFileModelClass())->orderBy('sort_order');
    }

    abstract protected function getFileModelClass(): string;
}
```

### 3.3 New Services

#### `app/Services/WorkflowEngine.php`

```php
<?php

namespace App\Services;

use App\Contracts\WorkItemInterface;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

/**
 * Unified workflow engine for all work items (Task, Deliverable, future modules).
 * Single implementation for: submit, approve, reject, reopen, acknowledge, pause, resume.
 */
class WorkflowEngine
{
    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService,
        private AuditService $auditService,
        private SubmissionService $submissionService,
        private ChangeTrackingService $changeTrackingService,
        private FileManagementService $fileService,
        private CacheService $cacheService,
    ) {}

    /**
     * Submit a work item for review.
     * Works identically for Task and Deliverable.
     */
    public function submit(WorkItemInterface $item, Request $request, User $user): JsonResponse
    {
        // Authorization
        if (! $item->canBeSubmittedBy($user)) {
            return response()->json([
                'success' => false,
                'message' => 'Only the assignee or authorized roles can submit this item',
            ], 403);
        }

        // Status check
        if (! in_array($item->getStatus(), $item->getSubmittableStatuses())) {
            return response()->json([
                'success' => false,
                'message' => 'This item cannot be submitted in its current status',
            ], 422);
        }

        // Validate
        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
            'file' => 'nullable|file|max:51200',
            'files' => 'nullable|array', 'files.*' => 'file|max:51200',
            'links' => 'nullable|array', 'links.*' => 'string|max:2048',
        ]);

        // Create submission
        $submission = $this->submissionService->create($item, $request, $user);

        // Determine resubmission
        $isResubmit = in_array($item->getStatus(), ['rejected', 'reopened', 'rework_required']);

        // Update status
        $updateData = ['status' => 'submitted', 'submitted_at' => now()];
        if (in_array($item->getStatus(), ['rejected', 'reopened'])) {
            foreach (['rejected_at', 'rejected_by', 'rejection_comment', 'reopened_at', 'reopened_by', 'reopen_comment', 'reopen_instructions', 'reopen_new_deadline'] as $f) {
                $updateData[$f] = null;
            }
        }
        if ($item->getStatus() === 'rework_required') {
            foreach (['rework_comment', 'rework_instructions', 'rework_new_deadline', 'rework_file_path', 'rework_file_name'] as $f) {
                $updateData[$f] = null;
            }
        }
        $item->update($updateData);

        // Stop timer
        $item->stopTimer();

        // Record workflow event
        $this->changeTrackingService->recordWorkflowEvent(
            $item,
            $isResubmit ? 'resubmitted' : 'submitted',
            $user,
            $validated['comment'] ?? null
        );

        // Notify creator/reviewer
        $this->notifyReviewer($item, $user, $isResubmit, $validated['comment'] ?? null);

        // Confirmation email
        $actionLabel = $isResubmit ? 'Resubmitted' : 'Submitted';
        $this->notificationService->confirmAction($user, $actionLabel, $item->getMorphClass(), $item->title, [
            'Project' => $item->project->title ?? 'N/A',
            'Task' => $item->parentTitle ?? 'N/A',
            $item->getCodeField() => $item->getBusinessCode() ?? 'N/A',
            'Submitted To' => $this->getReviewerName($item),
        ]);

        // Activity + Audit + Cache
        $this->activityService->log(
            $user->id,
            $item->getMorphClass().'_'.$actionLabel,
            'You '.strtolower($actionLabel).' '.$item->getMorphClass().' "'.$item->title.'" for review',
            $item->getMorphClass(),
            $item->getKey()
        );
        $this->cacheService->clearForUser($user->id);

        try {
            $this->auditService->log(
                module: $item->getMorphClass().'_management',
                action: 'submit',
                description: "$actionLabel {$item->getMorphClass()} {$item->title}",
                user: $user,
                entityType: class_basename($item),
                entityId: $item->getKey(),
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => ucfirst($item->getMorphClass()).' submitted successfully',
            $item->getMorphClass() => $item->fresh()->load($item->getEagerLoadRelations()),
        ]);
    }

    /**
     * Approve a submitted work item.
     */
    public function approve(WorkItemInterface $item, User $user): JsonResponse
    {
        if (! $item->canBeApprovedBy($user)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($item->getStatus() !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only approve submitted items'], 422);
        }

        $item->update([
            'status' => 'approved',
            'approved_at' => now(),
            'approved_by' => $user->id,
            'updated_by' => $user->id,
        ]);

        $this->changeTrackingService->recordWorkflowEvent($item, 'approval', $user);

        // Notify assignee
        if ($item->getAssigneeId() && $item->getAssigneeId() !== $user->id) {
            $this->notificationService->notify(
                $item->getAssigneeId(),
                $user->id,
                $item->getMorphClass().'_approved',
                $item->getMorphClass(),
                $item->getKey(),
                ucfirst($item->getMorphClass()).' Approved',
                'Your '.$item->getMorphClass().' "'.$item->title.'" has been approved.',
                $item->getListUrl()
            );
        }

        $this->notificationService->confirmAction($user, 'Approved', $item->getMorphClass(), $item->title, [
            'Project' => $item->project->title ?? 'N/A',
            'Task' => $item->parentTitle ?? 'N/A',
            $item->getCodeField() => $item->getBusinessCode() ?? 'N/A',
            'Assigned To' => $item->assignee->name ?? 'N/A',
        ]);

        $this->activityService->log($user->id, $item->getMorphClass().'_approved', 'You approved '.$item->getMorphClass().' "'.$item->title.'"', $item->getMorphClass(), $item->getKey());
        $this->cacheService->clearForUser($user->id);

        try {
            $this->auditService->log(
                module: $item->getMorphClass().'_management',
                action: 'approve',
                description: "Approved {$item->getMorphClass()} {$item->title}",
                user: $user,
                entityType: class_basename($item),
                entityId: $item->getKey(),
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => ucfirst($item->getMorphClass()).' approved successfully',
            $item->getMorphClass() => $item->fresh()->load($item->getEagerLoadRelations()),
        ]);
    }

    /**
     * Reject a submitted work item.
     */
    public function reject(WorkItemInterface $item, Request $request, User $user): JsonResponse
    {
        if (! $item->canBeApprovedBy($user)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($item->getStatus() !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only reject submitted items'], 422);
        }

        $validated = $request->validate(['comment' => 'nullable|string|max:2000']);

        $item->update([
            'status' => 'rejected',
            'rejected_at' => now(),
            'rejected_by' => $user->id,
            'rejection_comment' => $validated['comment'] ?? null,
            'updated_by' => $user->id,
        ]);

        $this->changeTrackingService->recordWorkflowEvent($item, 'rejected', $user, $validated['comment'] ?? null);

        if ($item->getAssigneeId() && $item->getAssigneeId() !== $user->id) {
            $msg = 'Your '.$item->getMorphClass().' "'.$item->title.'" has been rejected. Please review and resubmit.';
            if (! empty($validated['comment'])) {
                $msg .= ' Reason: '.$validated['comment'];
            }
            $this->notificationService->notify(
                $item->getAssigneeId(),
                $user->id,
                $item->getMorphClass().'_rejected',
                $item->getMorphClass(),
                $item->getKey(),
                ucfirst($item->getMorphClass()).' Rejected',
                $msg,
                $item->getListUrl()
            );
        }

        $this->notificationService->confirmAction($user, 'Rejected', $item->getMorphClass(), $item->title, [
            'Project' => $item->project->title ?? 'N/A',
            'Task' => $item->parentTitle ?? 'N/A',
            $item->getCodeField() => $item->getBusinessCode() ?? 'N/A',
            'Assigned To' => $item->assignee->name ?? 'N/A',
            'Reason' => $validated['comment'] ?? 'N/A',
        ]);

        $this->activityService->log($user->id, $item->getMorphClass().'_rejected', 'You rejected '.$item->getMorphClass().' "'.$item->title.'"', $item->getMorphClass(), $item->getKey());
        $this->cacheService->clearForUser($user->id);

        try {
            $this->auditService->log(
                module: $item->getMorphClass().'_management',
                action: 'reject',
                description: "Rejected {$item->getMorphClass()} {$item->title}",
                user: $user,
                entityType: class_basename($item),
                entityId: $item->getKey(),
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => ucfirst($item->getMorphClass()).' rejected',
            $item->getMorphClass() => $item->fresh()->load($item->getEagerLoadRelations()),
        ]);
    }

    /**
     * Reopen a submitted work item for revision.
     */
    public function reopen(WorkItemInterface $item, Request $request, User $user): JsonResponse
    {
        if (! $item->canBeApprovedBy($user)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($item->getStatus() !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only reopen submitted items'], 422);
        }

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
            'instructions' => 'nullable|string|max:2000',
            'new_deadline' => 'nullable|date',
            'file' => 'nullable|file|max:51200',
        ]);

        $filePath = $fileName = null;
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            $filePath = $file->store($item->getMorphClass().'-reopen/'.$item->getKey(), 'public');
        }

        $updateData = [
            'status' => 'reopened',
            'reopened_at' => now(),
            'reopened_by' => $user->id,
            'reopen_comment' => $validated['comment'] ?? null,
            'reopen_instructions' => $validated['instructions'] ?? null,
            'updated_by' => $user->id,
        ];
        if (! empty($validated['new_deadline'])) {
            $updateData['reopen_new_deadline'] = $validated['new_deadline'];
        }
        if (! empty($filePath)) {
            $updateData['reopen_file_path'] = $filePath;
            $updateData['reopen_file_name'] = $fileName;
        }

        $item->update($updateData);

        $this->changeTrackingService->recordWorkflowEvent($item, 'reopened', $user, $validated['comment'] ?? null, $validated['instructions'] ?? null, $validated['new_deadline'] ?? null, $filePath, $fileName);

        if ($item->getAssigneeId() && $item->getAssigneeId() !== $user->id) {
            $msg = 'Your '.$item->getMorphClass().' "'.$item->title.'" has been reopened for revision.';
            if (! empty($validated['comment'])) {
                $msg .= ' Comment: '.$validated['comment'];
            }
            if (! empty($validated['instructions'])) {
                $msg .= ' Instructions: '.$validated['instructions'];
            }
            $this->notificationService->notify(
                $item->getAssigneeId(),
                $user->id,
                $item->getMorphClass().'_reopened',
                $item->getMorphClass(),
                $item->getKey(),
                ucfirst($item->getMorphClass()).' Reopened',
                $msg,
                $item->getListUrl()
            );
        }

        $this->notificationService->confirmAction($user, 'Reopened', $item->getMorphClass(), $item->title, [
            'Project' => $item->project->title ?? 'N/A',
            'Task' => $item->parentTitle ?? 'N/A',
            $item->getCodeField() => $item->getBusinessCode() ?? 'N/A',
            'Assigned To' => $item->assignee->name ?? 'N/A',
            'Instructions' => $validated['instructions'] ?? 'N/A',
        ]);

        $this->activityService->log($user->id, $item->getMorphClass().'_reopened', 'You reopened '.$item->getMorphClass()." \"{$item->title}\" for revision", $item->getMorphClass(), $item->getKey());
        $this->cacheService->clearForUser($user->id);

        try {
            $this->auditService->log(
                module: $item->getMorphClass().'_management',
                action: 'reopen',
                description: "Reopened {$item->getMorphClass()} {$item->title}",
                user: $user,
                entityType: class_basename($item),
                entityId: $item->getKey(),
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => ucfirst($item->getMorphClass()).' reopened successfully',
            $item->getMorphClass() => $item->fresh()->load($item->getEagerLoadRelations()),
        ]);
    }

    /**
     * Acknowledge a work item assignment (pending → in_progress).
     */
    public function acknowledge(WorkItemInterface $item, User $user): JsonResponse
    {
        if (! $item->canBeSubmittedBy($user)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($item->getStatus() !== 'pending') {
            return response()->json(['success' => false, 'message' => 'Can only acknowledge pending items'], 422);
        }

        $item->update([
            'status' => 'in_progress',
            'acknowledged_at' => now(),
            'acknowledged_by' => $user->id,
            'updated_by' => $user->id,
        ]);

        $item->startTimer();

        $this->changeTrackingService->recordWorkflowEvent($item, 'acknowledged', $user, 'Acknowledged and started working');

        $this->activityService->log(
            $user->id,
            $item->getMorphClass().'_acknowledged',
            'You acknowledged '.$item->getMorphClass()." \"{$item->title}\"",
            $item->getMorphClass(),
            $item->getKey()
        );

        return response()->json([
            'success' => true,
            'message' => ucfirst($item->getMorphClass()).' acknowledged',
            $item->getMorphClass() => $item->fresh()->load($item->getEagerLoadRelations()),
        ]);
    }

    /**
     * Pause a running work item timer.
     */
    public function pause(WorkItemInterface $item, Request $request, User $user): JsonResponse
    {
        if (! $item->canBeSubmittedBy($user) && ! in_array($user->role, ['admin', 'manager', 'team_lead'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($item->timer_state !== 'running') {
            return response()->json(['success' => false, 'message' => 'Timer is not running'], 422);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:64',
            'reason_detail' => 'nullable|string|max:500',
        ]);

        $item->pauseTimer($validated['reason'] ?? null, $validated['reason_detail'] ?? null, false, $user->id);
        $item->update(['paused_by' => $user->id, 'paused_at' => now(), 'updated_by' => $user->id]);

        $this->changeTrackingService->recordWorkflowEvent(
            $item,
            'paused',
            $user,
            'Timer paused'.($validated['reason'] ? ' - '.$validated['reason'] : '')
        );

        return response()->json([
            'success' => true,
            'message' => 'Timer paused',
            $item->getMorphClass() => $item->fresh(),
        ]);
    }

    /**
     * Resume a paused work item timer.
     */
    public function resume(WorkItemInterface $item, User $user): JsonResponse
    {
        if (! $item->canBeSubmittedBy($user) && ! in_array($user->role, ['admin', 'manager', 'team_lead'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($item->timer_state !== 'paused') {
            return response()->json(['success' => false, 'message' => 'Timer is not paused'], 422);
        }

        $item->resumeTimer($user->id);
        $item->update(['updated_by' => $user->id]);

        $this->changeTrackingService->recordWorkflowEvent($item, 'resumed', $user, 'Timer resumed');

        return response()->json([
            'success' => true,
            'message' => 'Timer resumed',
            $item->getMorphClass() => $item->fresh(),
        ]);
    }

    // ─── Private Helpers ──────────────────────────────────────

    private function notifyReviewer(WorkItemInterface $item, User $actor, bool $isResubmit, ?string $comment): void
    {
        $reviewerId = $item->getCreatorId();
        if ($reviewerId && $reviewerId !== $actor->id) {
            $this->notificationService->notify(
                $reviewerId,
                $actor->id,
                $item->getMorphClass().'_submitted',
                $item->getMorphClass(),
                $item->getKey(),
                ucfirst($item->getMorphClass()).' Submitted',
                $actor->name.' has submitted the '.$item->getMorphClass().' "'.$item->title.'" for your review.',
                $item->getListUrl()
            );
        }
    }

    private function getReviewerName(WorkItemInterface $item): string
    {
        $creatorId = $item->getCreatorId();
        if (! $creatorId) {
            return 'N/A';
        }
        return \App\Models\User::find($creatorId)?->name ?? 'N/A';
    }
}
```

#### `app/Services/SubmissionService.php`

```php
<?php

namespace App\Services;

use App\Contracts\WorkItemInterface;
use App\Models\SubmissionAttachment;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Shared submission creation logic for Task and Deliverable.
 */
class SubmissionService
{
    public function create(WorkItemInterface $item, Request $request, User $user): mixed
    {
        $submissionClass = $item->getMorphClass() === 'task'
            ? \App\Models\TaskSubmission::class
            : \App\Models\DeliverableSubmission::class;

        $foreignKey = $item->getMorphClass() === 'task' ? 'task_id' : 'deliverable_id';

        $filePath = $fileName = null;
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            $filePath = $file->store($item->getStoragePrefix().'/'.$item->getKey(), 'public');
        }

        $submission = $submissionClass::create([
            $foreignKey => $item->getKey(),
            'submitted_by' => $user->id,
            'comment' => $request->input('comment'),
            'file_path' => $filePath,
            'file_name' => $fileName,
        ]);

        // Handle multiple files
        if ($request->hasFile('files')) {
            $submission->attachments()->createMany(
                collect($request->file('files'))->map(fn ($file) => [
                    'submission_type' => $item->getMorphClass(),
                    'file_name' => basename($path = $file->store($item->getStoragePrefix().'/'.$item->getKey(), 'public')),
                    'original_name' => $file->getClientOriginalName(),
                    'file_path' => $path,
                    'file_type' => $file->getMimeType(),
                    'file_size' => $file->getSize(),
                    'attachment_type' => str_starts_with($file->getMimeType(), 'image/') ? 'image' : 'file',
                    'url' => '/storage/'.$path,
                ])->toArray()
            );
        }

        // Handle links
        $links = $request->input('links', []);
        if (! empty($links)) {
            $submission->attachments()->createMany(
                collect($links)->map(fn ($url) => [
                    'submission_type' => $item->getMorphClass(),
                    'file_name' => $url,
                    'original_name' => $url,
                    'attachment_type' => 'link',
                    'url' => $url,
                ])->toArray()
            );
        }

        return $submission;
    }
}
```

#### `app/Services/ChangeTrackingService.php`

```php
<?php

namespace App\Services;

use App\Contracts\WorkItemInterface;
use App\Models\User;

/**
 * Shared change tracking and workflow event recording.
 */
class ChangeTrackingService
{
    /**
     * Record a workflow event for any work item.
     */
    public function recordWorkflowEvent(
        WorkItemInterface $item,
        string $eventType,
        User $user,
        ?string $comment = null,
        ?string $instructions = null,
        ?string $newDeadline = null,
        ?string $filePath = null,
        ?string $fileName = null
    ): void {
        $eventClass = $item->getMorphClass() === 'task'
            ? \App\Models\TaskWorkflowEvent::class
            : \App\Models\DeliverableWorkflowEvent::class;

        $foreignKey = $item->getMorphClass() === 'task' ? 'task_id' : 'deliverable_id';

        $eventClass::create([
            $foreignKey => $item->getKey(),
            'event_type' => $eventType,
            'user_id' => $user->id,
            'comment' => $comment,
            'instructions' => $instructions,
            'new_deadline' => $newDeadline,
            'file_path' => $filePath,
            'file_name' => $fileName,
        ]);
    }

    /**
     * Track field changes and create change records + workflow events.
     */
    public function trackFieldChanges(WorkItemInterface $item, array $oldValues, array $newValues, User $user): array
    {
        $changeClass = $item->getMorphClass() === 'task'
            ? \App\Models\TaskChange::class
            : \App\Models\DeliverableChange::class;

        $foreignKey = $item->getMorphClass() === 'task' ? 'task_id' : 'deliverable_id';

        $changes = [];
        foreach ($oldValues as $field => $oldVal) {
            $newVal = $newValues[$field] ?? null;
            $oldStr = is_object($oldVal) && method_exists($oldVal, 'format') ? $oldVal->format('Y-m-d H:i') : (string) $oldVal;
            $newStr = is_object($newVal) && method_exists($newVal, 'format') ? $newVal->format('Y-m-d H:i') : (string) $newVal;
            if ($oldStr !== $newStr) {
                $changes[] = [
                    'field_name' => $field,
                    'label' => ucfirst(str_replace('_', ' ', $field)),
                    'old_value' => $oldStr,
                    'new_value' => $newStr,
                ];
            }
        }

        if (! empty($changes)) {
            $changeClass::insert(
                array_map(fn ($c) => [
                    $foreignKey => $item->getKey(),
                    'field_name' => $c['field_name'],
                    'old_value' => $c['old_value'],
                    'new_value' => $c['new_value'],
                    'modified_by' => $user->id,
                    'is_viewed' => false,
                ], $changes)
            );

            $eventClass = $item->getMorphClass() === 'task'
                ? \App\Models\TaskWorkflowEvent::class
                : \App\Models\DeliverableWorkflowEvent::class;

            $eventClass::insert(
                array_map(fn ($c) => [
                    $foreignKey => $item->getKey(),
                    'event_type' => 'field_changed',
                    'user_id' => $user->id,
                    'comment' => $c['label'].': '.$c['old_value'].' → '.$c['new_value'],
                ], $changes)
            );
        }

        return $changes;
    }

    /**
     * Mark all unviewed changes as read.
     */
    public function markChangesRead(WorkItemInterface $item): void
    {
        $item->changes()->where('is_viewed', false)->update(['is_viewed' => true]);
    }
}
```

#### `app/Services/FileManagementService.php`

```php
<?php

namespace App\Services;

use App\Contracts\WorkItemInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Shared file/link management for Task and Deliverable.
 */
class FileManagementService
{
    public function uploadFile(WorkItemInterface $item, Request $request)
    {
        $request->validate([
            'file' => 'required|file|max:51200',
            'name' => 'nullable|string|max:255',
        ]);

        $file = $request->file('file');
        $path = $file->store($item->getMorphClass().'-files/'.$item->getKey(), 'public');
        $name = $request->input('name', $file->getClientOriginalName());

        $fileModel = $item->files()->create([
            'name' => $name,
            'url' => '/storage/'.$path,
        ]);

        $item->update(['updated_by' => $request->user()->id]);

        return response()->json([
            'success' => true,
            'message' => 'File uploaded successfully',
            'file' => $fileModel,
        ], 201);
    }

    public function addLink(WorkItemInterface $item, Request $request)
    {
        $validated = $request->validate([
            'url' => 'required|url|max:2048',
            'name' => 'nullable|string|max:255',
        ]);

        $fileModel = $item->files()->create([
            'name' => $validated['name'] ?? $validated['url'],
            'url' => $validated['url'],
        ]);

        $item->update(['updated_by' => $request->user()->id]);

        return response()->json([
            'success' => true,
            'message' => 'Link added successfully',
            'file' => $fileModel,
        ], 201);
    }

    public function renameFile(WorkItemInterface $item, $file, Request $request)
    {
        $validated = $request->validate(['name' => 'required|string|max:255']);
        $file->update(['name' => $validated['name']]);

        return response()->json(['success' => true, 'message' => 'File renamed', 'file' => $file->fresh()]);
    }

    public function deleteFile(WorkItemInterface $item, $file)
    {
        if ($file->url && str_starts_with($file->url, '/storage/') && Storage::disk('public')->exists(str_replace('/storage/', '', $file->url))) {
            Storage::disk('public')->delete(str_replace('/storage/', '', $file->url));
        }

        $file->delete();
        $item->update(['updated_by' => request()->user()->id]);

        return response()->json(['success' => true, 'message' => 'File deleted']);
    }

    public function reorderFiles(WorkItemInterface $item, Request $request)
    {
        $request->validate([
            'items' => 'required|array',
            'items.*.id' => 'required|integer',
            'items.*.sort_order' => 'required|integer|min:0',
        ]);

        $fileModelClass = $item->getMorphClass() === 'task'
            ? \App\Models\TaskFile::class
            : \App\Models\DeliverableFile::class;

        foreach ($request->items as $item_data) {
            $fileModelClass::where('id', $item_data['id'])
                ->where($item->getMorphClass().'_id', $item->getKey())
                ->update(['sort_order' => $item_data['sort_order']]);
        }

        return response()->json(['success' => true, 'message' => 'Files reordered']);
    }
}
```

#### `app/Services/CacheService.php`

```php
<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

/**
 * Centralized dashboard cache clearing.
 */
class CacheService
{
    public function clearForUser(int $userId): void
    {
        Cache::forget('dashboard_'.$userId);
        Cache::forget('dashboard_counts_'.$userId);
    }
}
```

### 3.4 Refactored Models

#### `app/Models/Task.php` (Reduced from 458 → ~200 lines)

```php
<?php

namespace App\Models;

use App\Contracts\WorkItemInterface;
use App\Traits\HasTimer;
use App\Traits\HasWorkflow;
use App\Traits\HasFiles;
use App\Services\BusinessIdService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\User;

class Task extends Model implements WorkItemInterface
{
    use HasTimer, HasWorkflow, HasFiles;

    protected $fillable = [
        'task_code', 'project_id', 'title', 'description', 'requirements',
        'status', 'priority', 'start_date', 'end_date',
        'assigned_to', 'assigned_by', 'updated_by',
        'submitted_at', 'approved_at', 'rejected_at', 'rejection_comment',
        'approved_by', 'rejected_by', 'reopened_at', 'reopened_by',
        'reopen_comment', 'reopen_instructions', 'reopen_new_deadline',
        'reopen_file_path', 'reopen_file_name',
        'acknowledged_at', 'acknowledged_by',
        'paused_at', 'paused_by', 'assigner_paused', 'assigner_paused_at', 'assigner_paused_by',
        'work_started_at', 'total_work_seconds', 'elapsed_seconds',
        'pause_count', 'total_pause_seconds', 'resume_count',
        'timer_state', 'last_timer_event_at', 'work_completed_at',
        'sort_order', 'task_type', 'recurrence_settings', 'recurrence_status', 'deliverables_generated',
    ];

    protected $casts = [
        'requirements' => 'array', 'recurrence_settings' => 'array',
        'start_date' => 'datetime:Y-m-d\TH:i:s', 'end_date' => 'datetime:Y-m-d\TH:i:s',
        'submitted_at' => 'datetime:Y-m-d\TH:i:s', 'approved_at' => 'datetime:Y-m-d\TH:i:s',
        'rejected_at' => 'datetime:Y-m-d\TH:i:s', 'reopened_at' => 'datetime:Y-m-d\TH:i:s',
        'reopen_new_deadline' => 'datetime:Y-m-d\TH:i:s',
        'acknowledged_at' => 'datetime:Y-m-d\TH:i:s', 'paused_at' => 'datetime:Y-m-d\TH:i:s',
        'assigner_paused_at' => 'datetime:Y-m-d\TH:i:s',
        'work_started_at' => 'datetime:Y-m-d\TH:i:s', 'last_timer_event_at' => 'datetime:Y-m-d\TH:i:s',
        'work_completed_at' => 'datetime:Y-m-d\TH:i:s',
        'assigner_paused' => 'boolean',
        'total_work_seconds' => 'integer', 'elapsed_seconds' => 'integer',
        'pause_count' => 'integer', 'total_pause_seconds' => 'integer', 'resume_count' => 'integer',
        'deliverables_generated' => 'integer',
    ];

    protected static function booted(): void
    {
        static::creating(function (Task $task) {
            if (empty($task->task_code)) {
                if ($task->project_id && $task->project) {
                    $task->task_code = app(BusinessIdService::class)->generateTaskCode($task->project);
                } else {
                    $task->task_code = 'TSK-'.$task->id;
                }
            }
        });
        static::created(function (Task $task) {
            if (empty($task->task_code) || $task->task_code === 'TSK-') {
                $task->task_code = 'TSK-'.$task->id;
                $task->saveQuietly();
            }
        });
    }

    // ─── WorkItemInterface Implementation ───────────────────

    public function getMorphClass(): string { return 'task'; }
    public function getBusinessCode(): ?string { return $this->task_code; }
    public function getCodeField(): string { return 'task_code'; }
    public function getProjectId(): ?int { return $this->project_id; }
    public function getTaskId(): ?int { return null; } // Tasks don't have parent tasks
    public function getParentTitle(): ?string { return $this->project?->title; }
    public function getCreatorId(): int { return $this->assigned_by; }
    public function getAssigneeId(): ?int { return $this->assigned_to; }
    public function getAssigneeIds(): array { return $this->assignees->pluck('id')->toArray(); }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $status): void { $this->status = $status; $this->save(); }
    public function getStoragePrefix(): string { return 'task-submissions'; }
    public function getDetailUrl(): string { return '/tasks?selectedTask='.$this->id; }
    public function getListUrl(): string { return '/tasks?selectedTask='.$this->id; }
    public function getSubmittableStatuses(): array { return ['pending', 'rejected', 'reopened']; }

    public function canBeApprovedBy(User $user): bool
    {
        $isCreator = (int) $this->assigned_by === (int) $user->id;
        return $isCreator || in_array($user->role, ['admin', 'manager', 'team_lead']);
    }

    public function canBeSubmittedBy(User $user): bool
    {
        $isAssignee = (int) ($this->assigned_to ?? 0) === (int) $user->id;
        return $isAssignee || in_array($user->role, ['admin', 'manager', 'team_lead']);
    }

    public function getEagerLoadRelations(): array
    {
        return ['project:id,title', 'assignees:id,name,email,role', 'assigner:id,name,email,role',
            'approvedBy:id,name,role', 'rejectedBy:id,name,role', 'reopenedBy:id,name,role', 'updatedBy:id,name,role'];
    }

    // ─── Trait Abstract Methods ────────────────────────────

    protected function getPauseSessionClass(): string { return TaskPauseSession::class; }
    protected function getFileModelClass(): string { return TaskFile::class; }

    // ─── Task-Specific Relationships ───────────────────────

    public function project(): BelongsTo { return $this->belongsTo(Project::class); }
    public function assignee(): BelongsTo { return $this->belongsTo(User::class, 'assigned_to'); }
    public function assigner(): BelongsTo { return $this->belongsTo(User::class, 'assigned_by'); }
    public function updatedBy(): BelongsTo { return $this->belongsTo(User::class, 'updated_by'); }
    public function assignees(): BelongsToMany { return $this->belongsToMany(User::class, 'task_user')->withPivot('due_date', 'status', 'submitted_at')->withTimestamps(); }
    public function deliverables(): HasMany { return $this->hasMany(Deliverable::class)->orderBy('sort_order')->latest('updated_at'); }
    public function deliverableTemplates(): HasMany { return $this->hasMany(DeliverableTemplate::class)->orderBy('sort_order'); }
    public function submissions(): HasMany { return $this->hasMany(TaskSubmission::class); }
    public function latestSubmission() { return $this->hasOne(TaskSubmission::class)->latestOfMany(); }
    public function workflowEvents(): HasMany { return $this->hasMany(TaskWorkflowEvent::class)->latest(); }
    public function approvedBy(): BelongsTo { return $this->belongsTo(User::class, 'approved_by'); }
    public function rejectedBy(): BelongsTo { return $this->belongsTo(User::class, 'rejected_by'); }
    public function reopenedBy(): BelongsTo { return $this->belongsTo(User::class, 'reopened_by'); }
    public function acknowledgedBy(): BelongsTo { return $this->belongsTo(User::class, 'acknowledged_by'); }
    public function pausedBy(): BelongsTo { return $this->belongsTo(User::class, 'paused_by'); }
    public function assignerPausedBy(): BelongsTo { return $this->belongsTo(User::class, 'assigner_paused_by'); }
    public function changes(): HasMany { return $this->hasMany(TaskChange::class)->latest(); }
    public function unviewedChanges() { return $this->hasMany(TaskChange::class)->where('is_viewed', false); }
    public function comments() { return $this->hasMany(TaskComment::class)->latest(); }
    public function accessCredentials() { return $this->hasMany(TaskAccessCredential::class); }
    public function pauseSessions(): HasMany { return $this->hasMany(TaskPauseSession::class)->orderBy('paused_at'); }
}
```

#### `app/Models/Deliverable.php` (Reduced from 463 → ~220 lines)

```php
<?php

namespace App\Models;

use App\Contracts\WorkItemInterface;
use App\Traits\HasTimer;
use App\Traits\HasWorkflow;
use App\Traits\HasFiles;
use App\Services\BusinessIdService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\User;

class Deliverable extends Model implements WorkItemInterface
{
    use HasTimer, HasWorkflow, HasFiles;

    protected $fillable = [
        'subtask_code', 'project_id', 'task_id', 'title', 'description',
        'status', 'priority', 'start_date', 'due_date',
        'assigned_to', 'created_by', 'updated_by',
        'estimated_hours', 'estimated_minutes', 'labels', 'tags', 'followers', 'dependencies',
        'submitted_at', 'approved_at', 'rejected_at', 'rejection_comment',
        'approved_by', 'rejected_by', 'reopened_at', 'reopened_by',
        'reopen_comment', 'reopen_instructions', 'reopen_new_deadline',
        'reopen_file_path', 'reopen_file_name',
        'rework_comment', 'rework_instructions', 'rework_new_deadline',
        'rework_file_path', 'rework_file_name',
        'acknowledged_by', 'acknowledged_at',
        'paused_by', 'paused_at', 'assigner_paused', 'assigner_paused_at', 'assigner_paused_by',
        'work_started_at', 'total_work_seconds', 'elapsed_seconds',
        'pause_count', 'total_pause_seconds', 'resume_count',
        'timer_state', 'last_timer_event_at', 'work_completed_at',
        'sort_order',
    ];

    protected $casts = [
        'start_date' => 'datetime:Y-m-d\TH:i:s', 'due_date' => 'datetime:Y-m-d\TH:i:s',
        'submitted_at' => 'datetime:Y-m-d\TH:i:s', 'approved_at' => 'datetime:Y-m-d\TH:i:s',
        'rejected_at' => 'datetime:Y-m-d\TH:i:s', 'reopened_at' => 'datetime:Y-m-d\TH:i:s',
        'reopen_new_deadline' => 'datetime:Y-m-d\TH:i:s', 'rework_new_deadline' => 'datetime:Y-m-d\TH:i:s',
        'acknowledged_at' => 'datetime:Y-m-d\TH:i:s', 'paused_at' => 'datetime:Y-m-d\TH:i:s',
        'assigner_paused_at' => 'datetime:Y-m-d\TH:i:s',
        'work_started_at' => 'datetime:Y-m-d\TH:i:s', 'last_timer_event_at' => 'datetime:Y-m-d\TH:i:s',
        'work_completed_at' => 'datetime:Y-m-d\TH:i:s',
        'labels' => 'array', 'tags' => 'array', 'followers' => 'array', 'dependencies' => 'array',
        'estimated_hours' => 'integer', 'estimated_minutes' => 'integer',
        'total_work_seconds' => 'integer', 'elapsed_seconds' => 'integer',
        'pause_count' => 'integer', 'total_pause_seconds' => 'integer', 'resume_count' => 'integer',
        'assigner_paused' => 'boolean',
    ];

    protected static function booted(): void
    {
        static::created(function (Deliverable $deliverable) {
            if (empty($deliverable->subtask_code)) {
                if ($deliverable->task_id && $deliverable->task) {
                    $deliverable->subtask_code = app(BusinessIdService::class)->generateSubtaskCode($deliverable->task);
                } elseif ($deliverable->project_id && $deliverable->project) {
                    $deliverable->subtask_code = app(BusinessIdService::class)->generateProjectDeliverableCode($deliverable->project, $deliverable->id);
                } else {
                    $deliverable->subtask_code = 'SUB-'.$deliverable->id;
                }
                $deliverable->saveQuietly();
            }
        });
    }

    // ─── WorkItemInterface Implementation ───────────────────

    public function getMorphClass(): string { return 'deliverable'; }
    public function getBusinessCode(): ?string { return $this->subtask_code; }
    public function getCodeField(): string { return 'subtask_code'; }
    public function getProjectId(): ?int { return $this->project_id; }
    public function getTaskId(): ?int { return $this->task_id; }
    public function getParentTitle(): ?string { return $this->task?->title; }
    public function getCreatorId(): int { return $this->created_by; }
    public function getAssigneeId(): ?int { return $this->assigned_to; }
    public function getAssigneeIds(): array { return $this->assignees->pluck('id')->toArray(); }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $status): void { $this->status = $status; $this->save(); }
    public function getStoragePrefix(): string { return 'deliverable-submissions'; }
    public function getDetailUrl(): string { return '/deliveries?selectedDeliverable='.$this->id; }
    public function getListUrl(): string { return '/deliveries?selectedDeliverable='.$this->id; }
    public function getSubmittableStatuses(): array { return ['pending', 'rejected', 'reopened', 'rework_required']; }

    public function canBeApprovedBy(User $user): bool
    {
        $isCreator = (int) $this->created_by === (int) $user->id;
        return $isCreator || in_array($user->role, ['admin', 'manager', 'team_lead']);
    }

    public function canBeSubmittedBy(User $user): bool
    {
        $isAssignee = (int) ($this->assigned_to ?? 0) === (int) $user->id;
        return $isAssignee || in_array($user->role, ['admin', 'manager', 'team_lead']);
    }

    public function getEagerLoadRelations(): array
    {
        return ['project:id,title', 'assignee:id,name,email,role', 'creator:id,name',
            'task:id,title,project_id', 'task.project:id,title',
            'approvedBy:id,name,role', 'rejectedBy:id,name,role', 'reopenedBy:id,name,role', 'updatedBy:id,name,role'];
    }

    // ─── Trait Abstract Methods ────────────────────────────

    protected function getPauseSessionClass(): string { return DeliverablePauseSession::class; }
    protected function getFileModelClass(): string { return DeliverableFile::class; }

    // ─── Deliverable-Specific Relationships ────────────────

    public function project(): BelongsTo { return $this->belongsTo(Project::class); }
    public function assignee(): BelongsTo { return $this->belongsTo(User::class, 'assigned_to'); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
    public function updatedBy(): BelongsTo { return $this->belongsTo(User::class, 'updated_by'); }
    public function task(): BelongsTo { return $this->belongsTo(Task::class); }
    public function submissions(): HasMany { return $this->hasMany(DeliverableSubmission::class); }
    public function latestSubmission() { return $this->hasOne(DeliverableSubmission::class)->latestOfMany(); }
    public function approvedBy(): BelongsTo { return $this->belongsTo(User::class, 'approved_by'); }
    public function rejectedBy(): BelongsTo { return $this->belongsTo(User::class, 'rejected_by'); }
    public function reopenedBy(): BelongsTo { return $this->belongsTo(User::class, 'reopened_by'); }
    public function acknowledgedBy(): BelongsTo { return $this->belongsTo(User::class, 'acknowledged_by'); }
    public function pausedBy(): BelongsTo { return $this->belongsTo(User::class, 'paused_by'); }
    public function assignerPausedBy(): BelongsTo { return $this->belongsTo(User::class, 'assigner_paused_by'); }
    public function workflowEvents(): HasMany { return $this->hasMany(DeliverableWorkflowEvent::class)->latest(); }
    public function changes(): HasMany { return $this->hasMany(DeliverableChange::class)->latest(); }
    public function unviewedChanges() { return $this->hasMany(DeliverableChange::class)->where('is_viewed', false); }
    public function assignees(): BelongsToMany { return $this->belongsToMany(User::class, 'deliverable_user')->withPivot('due_date', 'status', 'submitted_at')->withTimestamps(); }
    public function files(): HasMany { return $this->hasMany(DeliverableFile::class)->orderBy('sort_order'); }
    public function pauseSessions(): HasMany { return $this->hasMany(DeliverablePauseSession::class)->orderBy('paused_at'); }
    public function userNotes(): HasMany { return $this->hasMany(DeliverableUserNote::class); }
}
```

### 3.5 Refactored Controllers

#### `app/Http/Controllers/TaskController.php` (Reduced from 3,256 → ~800 lines)

```php
<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\User;
use App\Services\WorkflowEngine;
use App\Services\FileManagementService;
use App\Services\ChangeTrackingService;
use App\Services\NotificationService;
use App\Services\ActivityService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class TaskController extends Controller
{
    public function __construct(
        private WorkflowEngine $workflowEngine,
        private FileManagementService $fileService,
        private ChangeTrackingService $changeTrackingService,
        private NotificationService $notificationService,
        private ActivityService $activityService,
    ) {}

    // ─── Workflow Actions (Thin Delegates) ─────────────────

    public function acknowledge(Request $request, Task $task): JsonResponse
    {
        return $this->workflowEngine->acknowledge($task, $request->user());
    }

    public function pause(Request $request, Task $task): JsonResponse
    {
        return $this->workflowEngine->pause($task, $request, $request->user());
    }

    public function continueTask(Request $request, Task $task): JsonResponse
    {
        return $this->workflowEngine->resume($task, $request->user());
    }

    public function submit(Request $request, Task $task): JsonResponse
    {
        return $this->workflowEngine->submit($task, $request, $request->user());
    }

    public function approve(Request $request, Task $task): JsonResponse
    {
        return $this->workflowEngine->approve($task, $request->user());
    }

    public function reject(Request $request, Task $task): JsonResponse
    {
        return $this->workflowEngine->reject($task, $request, $request->user());
    }

    public function reopen(Request $request, Task $task): JsonResponse
    {
        return $this->workflowEngine->reopen($task, $request, $request->user());
    }

    // ─── Timer ─────────────────────────────────────────────

    public function timer(Request $request, Task $task): JsonResponse
    {
        return response()->json(['success' => true, 'timer' => $task->getTimerPayload()]);
    }

    public function timerSessions(Request $request, Task $task): JsonResponse
    {
        $sessions = $task->pauseSessions()
            ->with(['user:id,name', 'resumedByUser:id,name'])
            ->get()
            ->map(fn ($s) => [
                'id' => $s->id, 'reason' => $s->reason, 'reason_label' => $s->reason_label,
                'reason_detail' => $s->reason_detail,
                'paused_at' => $s->paused_at?->format('Y-m-d\TH:i:s'),
                'resumed_at' => $s->resumed_at?->format('Y-m-d\TH:i:s'),
                'duration_seconds' => $s->duration_seconds, 'formatted_duration' => $s->formatted_duration,
                'user' => $s->user ? ['id' => $s->user->id, 'name' => $s->user->name] : null,
                'resumed_by_user' => $s->resumedByUser ? ['id' => $s->resumedByUser->id, 'name' => $s->resumedByUser->name] : null,
                'is_auto_paused' => $s->is_auto_paused,
            ]);

        return response()->json(['success' => true, 'sessions' => $sessions]);
    }

    // ─── Files (Thin Delegates) ────────────────────────────

    public function uploadFile(Request $request, Task $task) { return $this->fileService->uploadFile($task, $request); }
    public function addLink(Request $request, Task $task) { return $this->fileService->addLink($task, $request); }
    public function renameFile(Request $request, Task $task, \App\Models\TaskFile $file) { return $this->fileService->renameFile($task, $file, $request); }
    public function deleteFile(Request $request, Task $task, \App\Models\TaskFile $file) { return $this->fileService->deleteFile($task, $file); }
    public function reorderFiles(Request $request, Task $task) { return $this->fileService->reorderFiles($task, $request); }

    // ─── Changes ───────────────────────────────────────────

    public function markChangesRead(Request $request, Task $task): JsonResponse
    {
        $this->changeTrackingService->markChangesRead($task);
        return response()->json(['success' => true, 'message' => 'Changes marked as read']);
    }

    // ─── CRUD (stays in controller, task-specific) ─────────

    public function show(Request $request, Task $task) { /* ... existing logic ... */ }
    public function store(Request $request, Project $project) { /* ... existing logic ... */ }
    public function storeStandalone(Request $request) { /* ... existing logic ... */ }
    public function update(Request $request, Task $task) { /* ... uses ChangeTrackingService ... */ }
    public function destroy(Task $task) { /* ... existing logic ... */ }
    public function myTasks(Request $request) { /* ... existing logic ... */ }
    public function assignedByMe(Request $request) { /* ... existing logic ... */ }
    public function mySelfTasks(Request $request) { /* ... existing logic ... */ }
    public function allTasks(Request $request) { /* ... existing logic ... */ }
    public function userTasks(Request $request, $userId) { /* ... existing logic ... */ }
    public function reorderTasks(Request $request) { /* ... existing logic ... */ }
    public function assignerPause(Request $request, Task $task) { /* ... task-specific */ }
    public function assignerResume(Request $request, Task $task) { /* ... task-specific */ }
    public function completeTask(Request $request, Task $task) { /* ... task-specific */ }
    public function updateStatus(Request $request, Task $task) { /* ... task-specific */ }
    public function updateRecurring(Request $request, Task $task) { /* ... task-specific */ }
    public function recurringPreview(Request $request) { /* ... task-specific */ }
    public function latestSubmission(Request $request, Task $task) { /* ... */ }
    public function downloadSubmissionFile(TaskSubmission $submission) { /* ... */ }
    public function getAccessCredentials(Request $request, Task $task) { /* ... task-specific */ }
    public function storeAccessCredential(Request $request, Task $task) { /* ... task-specific */ }
    public function updateAccessCredential(Request $request, Task $task, TaskAccessCredential $credential) { /* ... task-specific */ }
    public function deleteAccessCredential(Request $request, Task $task, TaskAccessCredential $credential) { /* ... task-specific */ }
}
```

#### `app/Http/Controllers/DeliverableController.php` (Reduced from 1,734 → ~500 lines)

```php
<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Services\WorkflowEngine;
use App\Services\FileManagementService;
use App\Services\ChangeTrackingService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class DeliverableController extends Controller
{
    public function __construct(
        private WorkflowEngine $workflowEngine,
        private FileManagementService $fileService,
        private ChangeTrackingService $changeTrackingService,
    ) {}

    // ─── Workflow Actions (Thin Delegates) ─────────────────

    public function acknowledge(Request $request, Deliverable $deliverable): JsonResponse
    {
        return $this->workflowEngine->acknowledge($deliverable, $request->user());
    }

    public function pause(Request $request, Deliverable $deliverable): JsonResponse
    {
        return $this->workflowEngine->pause($deliverable, $request, $request->user());
    }

    public function continueTimer(Request $request, Deliverable $deliverable): JsonResponse
    {
        return $this->workflowEngine->resume($deliverable, $request->user());
    }

    public function submit(Request $request, Deliverable $deliverable): JsonResponse
    {
        return $this->workflowEngine->submit($deliverable, $request, $request->user());
    }

    public function approve(Request $request, Deliverable $deliverable): JsonResponse
    {
        return $this->workflowEngine->approve($deliverable, $request->user());
    }

    public function reject(Request $request, Deliverable $deliverable): JsonResponse
    {
        return $this->workflowEngine->reject($deliverable, $request, $request->user());
    }

    public function reopen(Request $request, Deliverable $deliverable): JsonResponse
    {
        return $this->workflowEngine->reopen($deliverable, $request, $request->user());
    }

    // ─── Timer ─────────────────────────────────────────────

    public function timer(Request $request, Deliverable $deliverable): JsonResponse
    {
        return response()->json(['success' => true, 'timer' => $deliverable->getTimerPayload()]);
    }

    public function timerSessions(Request $request, Deliverable $deliverable): JsonResponse { /* ... */ }

    // ─── Files (Thin Delegates) ────────────────────────────

    public function uploadFile(Request $request, Deliverable $deliverable) { return $this->fileService->uploadFile($deliverable, $request); }
    public function addLink(Request $request, Deliverable $deliverable) { return $this->fileService->addLink($deliverable, $request); }
    public function renameFile(Request $request, Deliverable $deliverable, \App\Models\DeliverableFile $file) { return $this->fileService->renameFile($deliverable, $file, $request); }
    public function deleteFile(Request $request, Deliverable $deliverable, \App\Models\DeliverableFile $file) { return $this->fileService->deleteFile($deliverable, $file); }
    public function reorderFiles(Request $request, Deliverable $deliverable) { return $this->fileService->reorderFiles($deliverable, $request); }

    // ─── Self-Review (Deliverable-Specific) ────────────────

    public function selfApprove(Request $request, Deliverable $deliverable) { /* ... deliverable-specific */ }
    public function selfRework(Request $request, Deliverable $deliverable) { /* ... deliverable-specific */ }

    // ─── CRUD (stays in controller, deliverable-specific) ──

    public function show(Request $request, $id) { /* ... existing logic ... */ }
    public function store(Request $request, Project $project) { /* ... existing logic ... */ }
    public function update(Request $request, Deliverable $deliverable) { /* ... uses ChangeTrackingService ... */ }
    public function destroy(Deliverable $deliverable) { /* ... existing logic ... */ }
    public function index(Request $request) { /* ... existing logic ... */ }
    public function assignedByMe(Request $request) { /* ... existing logic ... */ }
    public function mySelfDeliverables(Request $request) { /* ... existing logic ... */ }
    public function allDeliverables(Request $request) { /* ... existing logic ... */ }
    public function reorder(Request $request) { /* ... existing logic ... */ }
    public function markChangesRead(Request $request, Deliverable $deliverable) { /* ... */ }
    public function latestSubmission(Request $request, Deliverable $deliverable) { /* ... */ }
    public function downloadSubmissionFile(DeliverableSubmission $submission) { /* ... */ }
    public function myNote(Request $request, Deliverable $deliverable) { /* ... */ }
    public function storeNote(Request $request, Deliverable $deliverable) { /* ... */ }
    public function destroyNote(Request $request, Deliverable $deliverable, DeliverableUserNote $note) { /* ... */ }
}
```

---

## 4. Frontend Component Architecture

### 4.1 Shared Components to Create

```
frontend/src/components/work-items/
├── WorkItemTimer.jsx              # Shared timer display with work/elapsed/pause
├── WorkItemWorkflowPanel.jsx      # Submit/approve/reject/reopen action buttons
├── WorkItemPauseModal.jsx         # Pause reason modal with 9 reasons
├── WorkItemFileSection.jsx        # File upload/link/rename/delete/reorder
├── WorkItemReopenDialog.jsx       # Reopen with comment, instructions, deadline, file
├── WorkItemStatusBadge.jsx        # Color-coded status pill
├── WorkItemTimeline.jsx           # Workflow event history timeline
├── WorkItemNotes.jsx              # Personal notes
└── WorkItemChanges.jsx            # Unviewed field changes
```

### 4.2 Shared Hooks to Create

```
frontend/src/hooks/
├── useWorkItemTimer.js            # Unified timer API calls
├── useWorkItemWorkflow.js         # Submit/approve/reject/reopen handlers
├── useWorkItemFiles.js            # File CRUD operations
└── useWorkItemChanges.js          # Change tracking + mark-read
```

### 4.3 Status Constants (Eliminate Duplication)

```
frontend/src/constants/
├── workItemStatuses.js            # Shared status definitions, colors, labels
├── priorityConfig.js              # Priority colors and labels
└── pauseReasons.js                # Shared pause reason options
```

### 4.4 Example: WorkItemTimer Component

```jsx
// components/work-items/WorkItemTimer.jsx
import { useWorkItemTimer } from '../../hooks/useWorkItemTimer';

export default function WorkItemTimer({ entityType, entityId, timerData, onPause, onResume }) {
  const { workDisplay, elapsedDisplay, pauseCount, pauseDisplay } = useWorkItemTimer(timerData);

  return (
    <div className="work-item-timer">
      <div className="timer-row">
        <span className="timer-label">Work Time:</span>
        <span className="timer-value">{workDisplay}</span>
      </div>
      <div className="timer-row">
        <span className="timer-label">Elapsed:</span>
        <span className="timer-value">{elapsedDisplay}</span>
      </div>
      <div className="timer-row">
        <span className="timer-label">Pauses:</span>
        <span className="timer-value">{pauseCount} ({pauseDisplay})</span>
      </div>
    </div>
  );
}
```

---

## 5. Implementation Phases

### Phase 1: Backend Traits Extraction (No API Changes)
**Estimated: 3-5 days**

| Step | File | Action |
|------|------|--------|
| 1.1 | `app/Contracts/WorkItemInterface.php` | Create interface |
| 1.2 | `app/Traits/HasTimer.php` | Extract from Task.php:275-457 and Deliverable.php:287-462 |
| 1.3 | `app/Traits/HasWorkflow.php` | Extract shared scope and relationships |
| 1.4 | `app/Traits/HasFiles.php` | Extract file relationship |
| 1.5 | `app/Models/Task.php` | Refactor to use traits, implement WorkItemInterface |
| 1.6 | `app/Models/Deliverable.php` | Refactor to use traits, implement WorkItemInterface |
| 1.7 | Run `php artisan test` | Verify no regressions |

**Verification:** All existing API responses identical. All tests pass.

### Phase 2: Backend Service Extraction (No API Changes)
**Estimated: 5-7 days**

| Step | File | Action |
|------|------|--------|
| 2.1 | `app/Services/CacheService.php` | Create |
| 2.2 | `app/Services/ChangeTrackingService.php` | Create |
| 2.3 | `app/Services/SubmissionService.php` | Create |
| 2.4 | `app/Services/FileManagementService.php` | Create |
| 2.5 | `app/Services/WorkflowEngine.php` | Create |
| 2.6 | `app/Http/Controllers/TaskController.php` | Refactor workflow methods to delegate to WorkflowEngine |
| 2.7 | `app/Http/Controllers/DeliverableController.php` | Refactor workflow methods to delegate to WorkflowEngine |
| 2.8 | Run `php artisan test` | Verify no regressions |

**Verification:** All API responses identical. Controllers reduced by ~70%.

### Phase 3: Frontend Shared Components
**Estimated: 4-6 days**

| Step | File | Action |
|------|------|--------|
| 3.1 | `frontend/src/constants/workItemStatuses.js` | Create shared status constants |
| 3.2 | `frontend/src/constants/priorityConfig.js` | Create shared priority constants |
| 3.3 | `frontend/src/components/work-items/WorkItemTimer.jsx` | Create shared timer component |
| 3.4 | `frontend/src/components/work-items/WorkItemStatusBadge.jsx` | Create shared status badge |
| 3.5 | `frontend/src/components/work-items/WorkItemPauseModal.jsx` | Create shared pause modal |
| 3.6 | `frontend/src/components/work-items/WorkItemReopenDialog.jsx` | Create shared reopen dialog |
| 3.7 | `frontend/src/components/work-items/WorkItemFileSection.jsx` | Create shared file section |
| 3.8 | `frontend/src/components/work-items/WorkItemWorkflowPanel.jsx` | Create shared workflow panel |
| 3.9 | `frontend/src/pages/TaskDetails.jsx` | Refactor to use shared components |
| 3.10 | `frontend/src/pages/DeliverableDetails.jsx` | Refactor to use shared components |
| 3.11 | Remove duplicated STATUS_COLORS from list pages | Use shared constants |

**Verification:** All UI interactions work identically. Visual regression testing.

### Phase 4: Unified Routes (Optional, Future)
**Estimated: 2-3 days**

| Step | File | Action |
|------|------|--------|
| 4.1 | `app/Http/Controllers/WorkItemController.php` | Create generic work item controller |
| 4.2 | `routes/api.php` | Add optional unified work item routes |
| 4.3 | Test with a third entity type (e.g., Issue) | Verify engine extensibility |

---

## 6. File Inventory

### New Backend Files

| File | Purpose | Lines (Est.) |
|------|---------|-------------|
| `app/Contracts/WorkItemInterface.php` | Interface for all work items | ~60 |
| `app/Traits/HasTimer.php` | Shared timer logic | ~180 |
| `app/Traits/HasWorkflow.php` | Shared workflow scopes/relationships | ~50 |
| `app/Traits/HasFiles.php` | Shared file relationship | ~20 |
| `app/Services/WorkflowEngine.php` | Unified workflow transitions | ~350 |
| `app/Services/SubmissionService.php` | Shared submission creation | ~80 |
| `app/Services/FileManagementService.php` | Shared file/link CRUD | ~120 |
| `app/Services/ChangeTrackingService.php` | Shared change + event tracking | ~100 |
| `app/Services/CacheService.php` | Cache clearing | ~15 |
| **Total new** | | **~975** |

### Modified Backend Files

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| `app/Models/Task.php` | 458 lines | ~200 lines | -56% |
| `app/Models/Deliverable.php` | 463 lines | ~220 lines | -52% |
| `app/Http/Controllers/TaskController.php` | 3,256 lines | ~800 lines | -75% |
| `app/Http/Controllers/DeliverableController.php` | 1,734 lines | ~500 lines | -71% |
| **Total modified** | **5,911 lines** | **~1,720 lines** | **-71%** |

### New Frontend Files

| File | Purpose | Lines (Est.) |
|------|---------|-------------|
| `src/constants/workItemStatuses.js` | Shared status definitions | ~40 |
| `src/constants/priorityConfig.js` | Shared priority config | ~25 |
| `src/components/work-items/WorkItemTimer.jsx` | Shared timer display | ~80 |
| `src/components/work-items/WorkItemStatusBadge.jsx` | Shared status badge | ~40 |
| `src/components/work-items/WorkItemPauseModal.jsx` | Shared pause modal | ~120 |
| `src/components/work-items/WorkItemReopenDialog.jsx` | Shared reopen dialog | ~130 |
| `src/components/work-items/WorkItemFileSection.jsx` | Shared file section | ~180 |
| `src/components/work-items/WorkItemWorkflowPanel.jsx` | Shared workflow panel | ~150 |
| `src/hooks/useWorkItemTimer.js` | Timer API hook | ~60 |
| `src/hooks/useWorkItemWorkflow.js` | Workflow API hook | ~120 |
| `src/hooks/useWorkItemFiles.js` | File API hook | ~100 |
| **Total new** | | **~1,045** |

---

## 7. Risk Mitigation

### 7.1 API Contract Preservation

| Risk | Mitigation |
|------|------------|
| Frontend breaks | All existing routes unchanged. Response formats identical. |
| Mobile app breaks | No route or response changes. |
| Notification links break | `getDetailUrl()` adapter returns same URL format. |

### 7.2 Incremental Safety

| Risk | Mitigation |
|------|------------|
| Big-bang failure | Phases are independently deployable. Phase 1-2 are backend-only. |
| Trait conflicts | Each trait is namespaced. No method name collisions. |
| Missing edge cases | Write integration tests BEFORE refactoring. |

### 7.3 Testing Strategy

1. **Before Phase 1:** Write integration tests for ALL Task workflow actions
2. **Before Phase 1:** Write integration tests for ALL Deliverable workflow actions
3. **After each phase:** Run full test suite. If ANY test fails, roll back.
4. **PHPUnit tests to create:**
   - `tests/Feature/TaskWorkflowTest.php`
   - `tests/Feature/DeliverableWorkflowTest.php`
   - `tests/Feature/WorkItemServiceTest.php`
   - `tests/Feature/WorkflowEngineTest.php`

### 7.4 Rollback Plan

- Each phase is a separate Git branch
- Controllers are never deleted, only refactored
- Database is never modified in Phases 1-3
- Original code stays in Git history

---

## 8. Future Module Extensibility

Any future module (Issues, Bugs, Tickets, etc.) can reuse the engine by:

1. Create entity model implementing `WorkItemInterface`
2. Use `HasTimer`, `HasWorkflow`, `HasFiles` traits
3. Create database table with standard work item columns
4. Create thin controller delegating to `WorkflowEngine`
5. The workflow works automatically

```php
// Example: Future Issue model
class Issue extends Model implements WorkItemInterface
{
    use HasTimer, HasWorkflow, HasFiles;

    protected $table = 'issues';

    public function getMorphClass(): string { return 'issue'; }
    public function getCodeField(): string { return 'issue_code'; }
    // ... implement all interface methods
}

// Controller is ~50 lines
class IssueController extends Controller
{
    public function submit(Request $request, Issue $issue) {
        return $this->workflowEngine->submit($issue, $request, $request->user());
    }
    // ... other thin delegates
}
```

---

## 9. Business ID Hierarchy

The existing Business ID system already supports hierarchical codes:

| Level | Format | Example | Generator |
|-------|--------|---------|-----------|
| Project | PRJ-{id} | PRJ-5 | `BusinessIdService::generateProjectCode()` |
| Task | TSK-{project}.{seq} | TSK-5.3 | `BusinessIdService::generateTaskCode()` |
| Deliverable (under task) | TSK-{project}.{task}.{seq} | TSK-5.3.2 | `BusinessIdService::generateSubtaskCode()` |
| Deliverable (standalone) | SUB-{project}.{seq} | SUB-5.1 | `BusinessIdService::generateProjectDeliverableCode()` |

No changes needed. The hierarchy is already encoded in the business codes.

---

## 10. Summary

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Backend duplicated code | ~1,260 lines | ~0 lines | -100% |
| Task.php | 458 lines | ~200 lines | -56% |
| Deliverable.php | 463 lines | ~220 lines | -52% |
| TaskController.php | 3,256 lines | ~800 lines | -75% |
| DeliverableController.php | 1,734 lines | ~500 lines | -71% |
| Frontend duplicated components | ~1,100 lines | ~0 lines | -100% |
| New shared services | 0 | ~975 lines | - |
| New shared components | 0 | ~1,045 lines | - |
| **Net code reduction** | **~5,911** | **~2,765** | **-53%** |
| **Duplication eliminated** | **~2,360 lines** | **0** | **-100%** |
| API breaking changes | - | 0 | 100% safe |
| Database migrations needed | - | 0 | Zero risk |

This architecture transforms the PMS into a truly enterprise-grade system where:
- **One workflow engine** powers all work items
- **Zero code duplication** between Task and Deliverable
- **Future modules** can reuse the engine with minimal effort
- **All existing functionality** is preserved with zero breaking changes

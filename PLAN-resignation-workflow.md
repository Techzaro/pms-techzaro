# Implementation Plan: Enterprise Resignation Workflow & Draft Recovery System

## Key Findings

**Current State**: The resignation flow is minimal — `UserController::resign()` (line 648) sets `active = false`, revokes tokens, sends email, and logs audit. No work items are recovered. The Draft system (model, service, controller, frontend) is fully built and supports project/task/deliverable/event module types.

**What's Needed**: A centralized `ResignationWorkflowService` that wraps the resign operation in a DB transaction: analyzes unfinished work, creates drafts owned by original assigners, sends targeted notifications, and produces audit logs. A "Returned from Resignation" tab in DraftCenter shows returned items with resigning user context. Edit + reassign auto-publishes the draft back to a live task and deletes the draft.

---

## Architecture Overview

```
ResignationWorkflowService (NEW)
├── analyzeImpact(userId)           → Counts of affected items per assigner
├── executeResignation(userId, admin) → Full transactional workflow
│   ├── 1. Find all unfinished items assigned to user
│   ├── 2. For each item, determine original assigner
│   ├── 3. Create Draft record (is_returned=true) owned by original assigner
│   ├── 4. Send in-app + email notifications to each assigner
│   ├── 5. Create comprehensive audit log
│   ├── 6. Revoke all tokens & sessions
│   └── 7. Mark account as resigned
└── Uses: DraftService, NotificationService, AuditService
```

**User Decisions:**
- ✅ Tab inside Draft Center (not a new page)
- ✅ Auto-publish & remove draft when reassigning
- ✅ Keep original name with "(Resigned)" indicator in comments/chats

---

## Files to Create/Modify

### 1. Database Migration — Add resignation tracking fields to users

**File:** `backend/database/migrations/2026_07_20_210000_add_resignation_fields_to_users_table.php` (NEW)

```php
Schema::table('users', function (Blueprint $table) {
    $table->timestamp('resigned_at')->nullable()->after('last_login_at');
    $table->foreignId('resigned_by')->nullable()->after('resigned_at')->constrained('users')->nullOnDelete();
    $table->text('resignation_notes')->nullable()->after('resigned_by');
});
```

### 2. Database Migration — Create resignation_logs table

**File:** `backend/database/migrations/2026_07_20_210001_create_resignation_logs_table.php` (NEW)

```php
Schema::create('resignation_logs', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->foreignId('resigned_by')->constrained('users')->cascadeOnDelete();
    $table->timestamp('resigned_at');
    $table->text('ip_address')->nullable();
    $table->text('user_agent')->nullable();
    $table->integer('total_projects_returned')->default(0);
    $table->integer('total_tasks_returned')->default(0);
    $table->integer('total_deliverables_returned')->default(0);
    $table->integer('total_events_returned')->default(0);
    $table->integer('total_drafts_created')->default(0);
    $table->integer('total_notifications_sent')->default(0);
    $table->json('draft_owners')->nullable();
    $table->json('affected_items')->nullable();
    $table->timestamps();
});
```

### 3. Database Migration — Add returned-draft fields to drafts

**File:** `backend/database/migrations/2026_07_20_210002_add_returned_fields_to_drafts_table.php` (NEW)

```php
Schema::table('drafts', function (Blueprint $table) {
    $table->boolean('is_returned')->default(false)->after('is_important');
    $table->foreignId('returned_from_user_id')->nullable()->after('is_returned')->constrained('users')->nullOnDelete();
    $table->timestamp('returned_at')->nullable()->after('returned_from_user_id');
    $table->text('return_reason')->nullable()->after('returned_at');
});
```

### 4. ResignationLog Model (NEW)

**File:** `backend/app/Models/ResignationLog.php` (NEW)

```php
class ResignationLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'resigned_by', 'resigned_at', 'ip_address', 'user_agent',
        'total_projects_returned', 'total_tasks_returned', 'total_deliverables_returned',
        'total_events_returned', 'total_drafts_created', 'total_notifications_sent',
        'draft_owners', 'affected_items',
    ];

    protected $casts = [
        'resigned_at' => 'datetime',
        'draft_owners' => 'array',
        'affected_items' => 'array',
    ];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function resignedByUser(): BelongsTo { return $this->belongsTo(User::class, 'resigned_by'); }
}
```

### 5. User Model — Add fillable + relationships

**File:** `backend/app/Models/User.php`

**Changes:**
- Add `'resigned_at'`, `'resigned_by'`, `'resignation_notes'` to `$fillable`
- Add relationships:
```php
public function resignedByUser(): BelongsTo
{
    return $this->belongsTo(User::class, 'resigned_by');
}

public function resignationLog(): HasOne
{
    return $this->hasOne(\App\Models\ResignationLog::class);
}
```

### 6. Draft Model — Add returned fields

**File:** `backend/app/Models/Draft.php`

**Changes:**
- Add to `$fillable`: `'is_returned'`, `'returned_from_user_id'`, `'returned_at'`, `'return_reason'`
- Add to `$casts`: `'is_returned' => 'boolean'`, `'returned_at' => 'datetime'`
- Add relationship:
```php
public function returnedFromUser(): BelongsTo
{
    return $this->belongsTo(User::class, 'returned_from_user_id');
}
```

### 7. ResignationWorkflowService (NEW) — Core business logic

**File:** `backend/app/Services/ResignationWorkflowService.php` (NEW)

**Methods:**

#### `analyzeImpact(User $user): array`
Returns pre-resignation impact analysis:
```php
[
    'user' => $user->only('id', 'name', 'email', 'role', 'department', 'designation'),
    'active_projects' => [
        // Projects where user is in assigned_users JSON AND status NOT in ['Completed','Cancelled','Archived']
        // Owner = project.created_by
        ['id', 'title', 'project_code', 'assigner' => ['id', 'name']],
    ],
    'active_tasks' => [
        // Tasks where assigned_to = user.id OR user in task_user pivot
        // AND status in UNFINISHED_STATUSES
        // Owner = task.assigned_by
        ['id', 'title', 'task_code', 'assigner' => ['id', 'name'], 'project' => ['id', 'title', 'project_code']],
    ],
    'active_deliverables' => [
        // Deliverables where assigned_to = user.id OR user in deliverable_user pivot
        // AND status in UNFINISHED_STATUSES
        // Owner = deliverable.created_by
        ['id', 'title', 'subtask_code', 'assigner' => ['id', 'name'], 'task' => ['id', 'title', 'task_code']],
    ],
    'active_events' => [
        // Events where user_id = user.id OR user in event_users pivot
        // AND start_date >= now()
        // Owner = event.user_id
        ['id', 'title', 'type', 'assigner' => ['id', 'name']],
    ],
    'summary' => [
        'total_projects' => N,
        'total_tasks' => N,
        'total_deliverables' => N,
        'total_events' => N,
        'total_items' => N,
    ],
]
```

**Unfinished statuses:**
```php
private const UNFINISHED_STATUSES = [
    'pending', 'acknowledged', 'in_progress', 'submitted',
    'rejected', 'reopened', 'blocked',
];
```

#### `executeResignation(User $user, User $admin, ?string $notes = null): ResignationLog`
Full transactional workflow:

```
DB::transaction(function () use ($user, $admin, $notes) {
    1. $impact = $this->analyzeImpact($user);
    2. Create Drafts for each active item:
       - Projects  → owner = created_by
       - Tasks     → owner = assigned_by
       - Deliverables → owner = created_by
       - Events    → owner = user_id
       Each draft: is_returned=true, returned_from_user_id=user.id, returned_at=now()
    3. Send notifications to each draft owner (grouped by owner)
    4. Revoke all tokens: $user->tokens()->delete()
    5. Update user: active=false, must_change_password=false, resigned_at, resigned_by, resignation_notes
    6. Clear cache: all_users_list, admin_manager_ids, user_profile_{id}
    7. Create ResignationLog record
    8. AuditService::log() — comprehensive entry
    9. ActivityService::log() — activity feed entry
    10. Send UserResigned email to resigned user
    11. NotificationService::confirmAction() to admin
    return $resignationLog;
});
```

**Draft creation helpers:**
```php
private function createDraftFromProject(Project $project, int $ownerId, User $admin): Draft
private function createDraftFromTask(Task $task, int $ownerId, User $admin): Draft
private function createDraftFromDeliverable(Deliverable $deliverable, int $ownerId, User $admin): Draft
private function createDraftFromEvent(Event $event, int $ownerId, User $admin): Draft
```

Each creates a Draft with:
- `module_type` = 'project'|'task'|'deliverable'|'event'
- `original_record_id` = the original item ID
- `draft_data` = full JSON snapshot of the original item
- `created_by` = owner ID (original assigner)
- `last_edited_by` = admin ID
- `status` = 'draft'
- `is_returned` = true
- `returned_from_user_id` = resigned user ID
- `returned_at` = now()
- `return_reason` = "Employee {name} resigned"

**Notification helper:**
```php
private function sendResignationNotification(int $ownerId, User $resignedUser, int itemCount, User $admin): void
```
Sends via `NotificationService::notify()`:
- type: `'work_items_returned'`
- related_module: `'system'`
- title: `'Work Items Returned to Draft'`
- message: `"{$admin->name} resigned {$resignedUser->name}. {$itemCount} assigned work item(s) have been moved to your Drafts for review and reassignment."`
- link: `'/drafts?tab=returned'`
- changes: `['resigned_user' => ..., 'items_count' => ..., 'resigned_by' => ...]`

### 8. UserController — Replace resign() + add resignationImpact()

**File:** `backend/app/Http/Controllers/UserController.php`

**Add new method `resignationImpact()`:**
```php
public function resignationImpact(Request $request, User $user): JsonResponse
{
    $service = app(\App\Services\ResignationWorkflowService::class);
    $impact = $service->analyzeImpact($user);
    return response()->json(['success' => true, 'impact' => $impact]);
}
```

**Replace `resign()` (line 648-749):**
```php
public function resign(Request $request, User $user)
{
    $authUser = $request->user();
    // ... existing validation checks ...

    try {
        $service = app(\App\Services\ResignationWorkflowService::class);
        $resignationLog = $service->executeResignation(
            user: $user,
            admin: $authUser,
            notes: $request->input('notes')
        );

        return response()->json([
            'success' => true,
            'message' => 'User resigned successfully. All unfinished work has been returned to original assigners as drafts.',
            'user' => $user->fresh(),
            'resignation_log' => $resignationLog,
        ]);
    } catch (\Throwable $e) {
        Log::error("Resignation failed for user {$user->id}: " . $e->getMessage());
        return response()->json(['success' => false, 'message' => 'Failed to resign user.'], 500);
    }
}
```

### 9. API Routes — Add impact analysis endpoint

**File:** `backend/routes/api.php`

Add after line 111 (existing resign route):
```php
// Get resignation impact analysis (before confirming)
Route::get('/users/{user}/resignation-impact', [UserController::class, 'resignationImpact']);
```

### 10. DraftService — Add returned drafts filtering

**File:** `backend/app/Services/DraftService.php`

Update `getDrafts()` (line 464) to support `is_returned` filter:
```php
// In getDrafts(), add filter:
if (isset($filters['is_returned']) && $filters['is_returned'] === 'true') {
    $query->where('is_returned', true);
}
```

Update `canUserAccess()` to allow access to returned drafts (already works — owner is original assigner).

Add method to publish and delete returned draft:
```php
public function publishReturnedDraft(Draft $draft, array $newData, User $user): ?object
{
    return DB::transaction(function () use ($draft, $newData, $user) {
        // Merge new assignment data into draft_data
        $mergedData = array_merge($draft->draft_data, $newData);

        // Publish using existing publish logic
        $entity = $this->publishDraftWith($draft, $mergedData, $user);

        if ($entity) {
            $draft->delete(); // Soft delete the draft after successful publish
        }

        return $entity;
    });
}
```

### 11. DraftController — Add returned-draft publish endpoint

**File:** `backend/app/Http/Controllers/DraftController.php`

Add new method:
```php
public function publishReturned(Request $request, Draft $draft): JsonResponse
{
    if (!$draft->is_returned) {
        return response()->json(['success' => false, 'message' => 'This is not a returned draft.'], 422);
    }

    if (!$this->draftService->canUserAccess($draft, $request->user())) {
        return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
    }

    $validated = $request->validate([
        'draft_data' => 'required|array',
    ]);

    $entity = $this->draftService->publishReturnedDraft($draft, $validated['draft_data'], $request->user());

    if (!$entity) {
        return response()->json(['success' => false, 'message' => 'Failed to publish draft.'], 500);
    }

    return response()->json([
        'success' => true,
        'message' => 'Draft published and reassigned successfully.',
        'data' => $entity,
    ]);
}
```

### 12. API Routes — Add returned-draft publish endpoint

**File:** `backend/routes/api.php`

Add in the drafts section:
```php
// Publish a returned-from-resignation draft with new assignment
Route::post('/drafts/{draft}/publish-returned', [DraftController::class, 'publishReturned']);
```

### 13. Frontend — ResignationConfirmModal (NEW)

**File:** `frontend/src/components/ResignationConfirmModal.jsx` (NEW)

A rich confirmation dialog showing:

**Layout:**
```
┌─────────────────────────────────────────────┐
│  Resign User                          [X]   │
│  ─────────────────────────────────────────  │
│  👤 John Smith                               │
│     john@company.com · Manager · Engineering │
│  ─────────────────────────────────────────  │
│                                              │
│  Impact Summary                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │  2   │ │  5   │ │  3   │ │  1   │       │
│  │Projects│ │Tasks │ │Subtasks│ │Events│     │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
│                                              │
│  Total: 11 items will return to drafts       │
│                                              │
│  Affected Items                              │
│  ┌──────────────────────────────────────┐   │
│  │Type   │Code      │Title    │Return To│   │
│  │Task   │TSK-001.01│Design UI│Manager A│   │
│  │Subtask│SUB-001.01│Wireframe│Lead B   │   │
│  │ ... (scrollable, max 300px)          │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ⚠️ Warning banner (red)                     │
│  "This user will lose access immediately..." │
│                                              │
│  Notes (optional textarea)                   │
│  ┌──────────────────────────────────────┐   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
│                                              │
│              [Cancel]  [Confirm Resignation] │
└─────────────────────────────────────────────┘
```

**Props:** `{ isOpen, onClose, onConfirm, user, impact, loading }`

**API flow:**
1. When modal opens → fetch `GET /users/{id}/resignation-impact`
2. Display impact data
3. On confirm → call `PUT /users/{id}/resign` with notes
4. Call `onSuccess(data)` to update parent

### 14. Frontend — ResignationConfirmModal.css (NEW)

**File:** `frontend/src/components/ResignationConfirmModal.css` (NEW)

Full CSS for the modal, user card, impact badges, items table, warning banner, notes, buttons.

### 15. Frontend — Update ManageUsers.jsx

**File:** `frontend/src/pages/ManageUsers.jsx`

**Changes:**
1. Import `ResignationConfirmModal`
2. Add state: `resignImpact`, `resignImpactLoading`, `resignUser`
3. Replace `handleResignUser`:
```jsx
const handleResignUser = async (userId) => {
  const user = users.find(u => u.id === userId);
  setResignUser(user);
  setResignImpact(null);
  setResignImpactLoading(true);
  setResignConfirmOpen(true);
  try {
    const res = await fetch(`${API_URL}/users/${userId}/resignation-impact`, {
      headers: { Accept: "application/json", ...authHeaders() },
    });
    const data = await res.json();
    if (data.success) setResignImpact(data.impact);
  } catch (err) {
    notify.error("Failed to load impact analysis");
    setResignConfirmOpen(false);
  } finally {
    setResignImpactLoading(false);
  }
};
```
4. Replace `ConfirmModal` with `ResignationConfirmModal`:
```jsx
<ResignationConfirmModal
  isOpen={resignConfirmOpen}
  onClose={() => { setResignConfirmOpen(false); setResignUser(null); setResignImpact(null); }}
  onConfirm={confirmResignUser}
  user={resignUser}
  impact={resignImpact}
  loading={resignImpactLoading}
/>
```
5. Update `confirmResignUser` to pass notes:
```jsx
const confirmResignUser = async (notes) => {
  // ... existing logic, add notes to body
};
```

### 16. Frontend — Update UserProfile.jsx

**File:** `frontend/src/pages/UserProfile.jsx`

**Changes:**
1. Import `ResignationConfirmModal`
2. Add state: `resignImpact`, `resignImpactLoading`
3. Replace `handleResignUser` to fetch impact first
4. Replace `ConfirmModal` with `ResignationConfirmModal`

### 17. Frontend — DraftCenter.jsx — Add "Returned" tab

**File:** `frontend/src/pages/DraftCenter.jsx`

**Changes:**

1. Add tab state:
```jsx
const [activeTab, setActiveTab] = useState("all"); // "all" | "returned"
```

2. Add tab bar above filters:
```jsx
<div className="dc-tabs">
  <button
    className={`dc-tab ${activeTab === "all" ? "dc-tab-active" : ""}`}
    onClick={() => { setActiveTab("all"); setModuleFilter(""); setStatusFilter(""); }}
  >
    All Drafts
  </button>
  <button
    className={`dc-tab ${activeTab === "returned" ? "dc-tab-active" : ""}`}
    onClick={() => { setActiveTab("returned"); }}
  >
    Returned from Resignation
    {returnedCount > 0 && <span className="dc-tab-badge">{returnedCount}</span>}
  </button>
</div>
```

3. When `activeTab === "returned"`, pass `is_returned: "true"` to the API:
```jsx
if (activeTab === "returned") params.is_returned = "true";
```

4. In the table rows, show returned-draft info:
```jsx
{draft.is_returned && (
  <div className="dc-returned-info">
    <span className="dc-returned-badge">Returned from Resignation</span>
    <span className="dc-returned-user">
      Former assignee: {draft.returned_from_user?.name || "Unknown"}
    </span>
    <span className="dc-returned-date">
      Returned: {new Date(draft.returned_at).toLocaleDateString()}
    </span>
  </div>
)}
```

5. Add "Reassign" action button for returned drafts:
```jsx
{draft.is_returned && (
  <button
    className="action-icon-btn action-reassign"
    title="Edit & Reassign"
    onClick={() => handleEdit(draft)}
  >
    <MdPersonAdd size={16} />
  </button>
)}
```

6. Fetch returned count for badge:
```jsx
useEffect(() => {
  const fetchReturnedCount = async () => {
    try {
      const data = await draftService.list({ is_returned: "true", per_page: 1 });
      setReturnedCount(data.total || 0);
    } catch {}
  };
  fetchReturnedCount();
}, []);
```

### 18. Frontend — DraftDetailModal.jsx — Add reassignment for returned drafts

**File:** `frontend/src/components/DraftDetailModal.jsx`

**Changes:**
1. Add state for editing mode:
```jsx
const [isReassigning, setIsReassigning] = useState(draft?.is_returned === true);
const [assigneeId, setAssigneeId] = useState(null);
```

2. When `is_returned`, show "Reassign To" dropdown and "Publish & Reassign" button:
```jsx
{draft?.is_returned && (
  <div className="ddm-section">
    <h3>Reassign Work Item</h3>
    <p className="ddm-reassign-info">
      This task was returned because the original assignee was resigned.
      Assign it to a new team member and publish it back.
    </p>
    <UserSelectDropdown
      value={assigneeId}
      onChange={setAssigneeId}
      label="Assign to"
    />
    <button
      className="ddm-publish-btn"
      onClick={handlePublishAndReassign}
      disabled={!assigneeId}
    >
      Publish & Reassign
    </button>
  </div>
)}
```

3. Add `handlePublishAndReassign`:
```jsx
const handlePublishAndReassign = async () => {
  try {
    // Merge new assignee into draft data
    const updatedData = { ...draft.draft_data, assigned_to: assigneeId };
    const data = await draftService.publishReturned(draft.id, { draft_data: updatedData });
    notify.success("Draft published and reassigned successfully");
    onClose();
    publish("drafts:changed");
  } catch (err) {
    notify.error(err.message);
  }
};
```

4. Show "Resigned User" info card at top:
```jsx
{draft?.is_returned && (
  <div className="ddm-returned-banner">
    <svg>...</svg>
    <div>
      <strong>Returned from Resignation</strong>
      <p>Original assignee: {draft.returned_from_user?.name} (Resigned)</p>
      <p>Returned: {new Date(draft.returned_at).toLocaleDateString()}</p>
    </div>
  </div>
)}
```

### 19. Frontend — draftService.js — Add publishReturned method

**File:** `frontend/src/services/draftService.js`

Add:
```javascript
publishReturned: (id, data) => api.post(`/drafts/${id}/publish-returned`, data),
```

### 20. Frontend — DraftCenter.css — Add tab + returned styles

**File:** `frontend/src/pages/DraftCenter.css`

Add:
```css
/* Tabs */
.dc-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 2px solid var(--border-color, #e5e7eb);
  padding-bottom: 0;
}

.dc-tab {
  padding: 10px 20px;
  border: none;
  background: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s;
}

.dc-tab:hover {
  color: var(--text-primary, #1f2937);
}

.dc-tab-active {
  color: #4f46e5;
  border-bottom-color: #4f46e5;
  font-weight: 600;
}

.dc-tab-badge {
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
}

/* Returned draft info */
.dc-returned-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dc-returned-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  width: fit-content;
}

.dc-returned-user {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.dc-returned-date {
  font-size: 11px;
  color: var(--text-secondary, #9ca3af);
}

/* Reassign button */
.action-reassign {
  background: #fef3c7 !important;
  color: #92400e !important;
  border: 1px solid #fcd34d !important;
}

.action-reassign:hover {
  background: #fde68a !important;
}
```

### 21. Frontend — DraftDetailModal.css — Add returned/reassign styles

**File:** `frontend/src/components/DraftDetailModal.css`

Add:
```css
/* Returned banner */
.ddm-returned-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  margin-bottom: 20px;
}

.ddm-returned-banner strong {
  color: #92400e;
  font-size: 14px;
}

.ddm-returned-banner p {
  margin: 2px 0 0;
  font-size: 12px;
  color: #a16207;
}

/* Reassign section */
.ddm-reassign-info {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 12px;
  line-height: 1.5;
}

.ddm-publish-btn {
  width: 100%;
  padding: 10px;
  margin-top: 12px;
  border: none;
  border-radius: 8px;
  background: #059669;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.ddm-publish-btn:hover:not(:disabled) {
  background: #047857;
}

.ddm-publish-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### 22. Comments — Keep original name with "(Resigned)" indicator

**File:** `backend/app/Models/TaskComment.php` (and similar comment models)

No model changes needed. The display logic is in the frontend comment rendering components. When displaying a comment, check if the author is resigned:

```jsx
// In TaskDiscussion.jsx or similar comment component
<span className="comment-author">
  {comment.user?.name}
  {!comment.user?.active && (
    <span className="resigned-indicator">(Resigned)</span>
  )}
</span>
```

**File:** Frontend comment rendering components (TaskDiscussion, chat components)

Add CSS:
```css
.resigned-indicator {
  color: #dc2626;
  font-size: 11px;
  font-weight: 500;
  margin-left: 4px;
}
```

---

## Summary of All Files

### New Files (8)
1. `backend/database/migrations/2026_07_20_210000_add_resignation_fields_to_users_table.php`
2. `backend/database/migrations/2026_07_20_210001_create_resignation_logs_table.php`
3. `backend/database/migrations/2026_07_20_210002_add_returned_fields_to_drafts_table.php`
4. `backend/app/Models/ResignationLog.php`
5. `backend/app/Services/ResignationWorkflowService.php`
6. `frontend/src/components/ResignationConfirmModal.jsx`
7. `frontend/src/components/ResignationConfirmModal.css`
8. `frontend/src/components/DraftDetailModal.css` (extend existing, or update in-place)

### Modified Files (12)
1. `backend/app/Models/User.php` — Add fillable + relationships
2. `backend/app/Models/Draft.php` — Add returned fields + relationship
3. `backend/app/Http/Controllers/UserController.php` — Replace resign() + add resignationImpact()
4. `backend/app/Http/Controllers/DraftController.php` — Add publishReturned()
5. `backend/app/Services/DraftService.php` — Add is_returned filter + publishReturnedDraft()
6. `backend/routes/api.php` — Add 2 new endpoints
7. `frontend/src/services/draftService.js` — Add publishReturned()
8. `frontend/src/pages/ManageUsers.jsx` — Use ResignationConfirmModal
9. `frontend/src/pages/UserProfile.jsx` — Use ResignationConfirmModal
10. `frontend/src/pages/DraftCenter.jsx` — Add "Returned" tab + badge
11. `frontend/src/pages/DraftCenter.css` — Tab + returned styles
12. `frontend/src/components/DraftDetailModal.jsx` — Reassign flow for returned drafts
13. `frontend/src/components/DraftDetailModal.css` — Returned/reassign styles
14. Frontend comment components — "(Resigned)" indicator

---

## Verification Plan

1. **Run migrations**: `php artisan migrate`
2. **Run build**: `cd frontend && npm run build`
3. **Test resignation flow**:
   - Login as Admin
   - Go to Manage Users → Select a user with active tasks
   - Click Resign → Verify impact modal shows correct counts and items
   - Add optional notes → Confirm resignation
   - Verify:
     - User is marked as resigned
     - Drafts created in original assigners' Draft pages
     - "Returned from Resignation" tab shows the drafts
     - Each draft shows resigned user name, returned date
     - Notifications sent to assigners
     - Audit log entry with full details
     - Resignation email sent
4. **Test reassignment flow**:
   - Login as the original assigner
   - Go to Drafts → "Returned from Resignation" tab
   - Click Edit on a returned draft
   - See the "Reassign" section with user dropdown
   - Select new assignee → Click "Publish & Reassign"
   - Verify:
     - Draft is deleted
     - Original task/deliverable is now assigned to new user
     - New user sees it in their tasks
5. **Test edge cases**:
   - Resign user with no active work → Empty impact, no drafts created
   - Manager tries to resign admin → Blocked
   - Already resigned user → Blocked
   - Verify completed items NOT affected
   - Verify comments show "(Resigned)" indicator

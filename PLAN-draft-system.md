# Enterprise Draft Management System - Implementation Plan

## Architecture Analysis Summary

The PMS is a **Laravel 12 + React 19** monorepo with:
- **Backend**: Sanctum auth, role middleware (admin/manager/team_lead/member/guest), ActivityService + AuditService for logging, BusinessIdService for hierarchical IDs (PRJ-{}, TSK-{}, SUB-{})
- **Frontend**: React Router v7 (role-prefixed URLs), native fetch API, createPortal modals, useConfirmOnClose hook for unsaved changes, Tailwind + CSS variables
- **Key Pattern**: Forms use `useState` + `handleChange` + `validateForm` + `useSubmit` hook; modals dispatch `modal-state` custom events

---

## Phase 1: Database Layer

### 1.1 Create `drafts` table migration
**File**: `backend/database/migrations/2026_07_20_100000_create_drafts_table.php`

```php
Schema::create('drafts', function (Blueprint $table) {
    $table->id();
    $table->string('draft_code', 20)->unique();          // DRF-{n}
    $table->string('module_type', 50);                    // project, task, deliverable, event, user, team
    $table->unsignedBigInteger('original_record_id')->nullable(); // null for new items
    $table->json('draft_data');                           // all form field values
    $table->string('title', 255);                         // user-editable title for draft center
    $table->unsignedBigInteger('created_by');
    $table->unsignedBigInteger('last_edited_by');
    $table->string('status', 30)->default('draft');       // draft, auto_saved, ready_to_publish, published, archived
    $table->timestamp('last_auto_saved_at')->nullable();
    $table->unsignedInteger('version')->default(1);
    $table->unsignedBigInteger('project_id')->nullable();  // for project context
    $table->unsignedBigInteger('parent_id')->nullable();   // parent task for deliverables
    $table->timestamps();
    $table->softDeletes();

    $table->foreign('created_by')->references('id')->on('users')->cascadeOnDelete();
    $table->foreign('last_edited_by')->references('id')->on('users')->cascadeOnDelete();
    $table->foreign('project_id')->references('id')->on('projects')->nullOnDelete();
    $table->foreign('parent_id')->references('id')->on('tasks')->nullOnDelete();
    $table->index(['module_type', 'created_by']);
    $table->index(['status', 'created_by']);
    $table->index('project_id');
});
```

### 1.2 Create `draft_versions` table migration
**File**: `backend/database/migrations/2026_07_20_100001_create_draft_versions_table.php`

```php
Schema::create('draft_versions', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('draft_id');
    $table->unsignedInteger('version');
    $table->json('draft_data');
    $table->unsignedBigInteger('edited_by');
    $table->timestamp('edited_at');
    $table->timestamps();

    $table->foreign('draft_id')->references('id')->on('drafts')->cascadeOnDelete();
    $table->foreign('edited_by')->references('id')->on('users')->cascadeOnDelete();
    $table->unique(['draft_id', 'version']);
});
```

---

## Phase 2: Backend Models & Service

### 2.1 Draft Model
**File**: `backend/app/Models/Draft.php`

- Relationships: `creator()`, `lastEditor()`, `project()`, `parentTask()`, `versions()`
- Scopes: `byModule()`, `byStatus()`, `byCreator()`, `byProject()`, `search()`
- Accessors: `draft_data_formatted` (decoded JSON), `module_label` (human-readable)
- Constants for MODULE_TYPES, STATUSES

### 2.2 DraftVersion Model
**File**: `backend/app/Models/DraftVersion.php`

- Relationships: `draft()`, `editor()`

### 2.3 DraftService
**File**: `backend/app/Services/DraftService.php`

Core service with these methods:

```php
class DraftService
{
    // CRUD
    public function create(array $data, User $user): Draft
    public function update(Draft $draft, array $data, User $user): Draft
    public function delete(Draft $draft, User $user): bool
    public function duplicate(Draft $draft, User $user): Draft

    // Auto-save
    public function autoSave(Draft $draft, array $data, User $user): Draft

    // Version management
    public function saveVersion(Draft $draft, array $data, User $user): DraftVersion
    public function restoreVersion(Draft $draft, int $version): Draft

    // Publishing
    public function publish(Draft $draft, User $user): mixed  // returns created/updated entity

    // Business ID
    public function generateDraftCode(): string  // DRF-{n}

    // Listing & filtering
    public function getDrafts(array $filters, User $user): LengthAwarePaginator

    // Cleanup
    public function cleanup(int $days = 30): int  // returns deleted count
    public function archive(int $days = 90): int  // returns archived count
}
```

**Publish logic per module type**:
- `project` → Creates or updates a Project using BusinessIdService
- `task` → Creates or updates a Task
- `deliverable` → Creates or updates a Deliverable
- `event` → Creates or updates an Event
- `user` → Creates or updates a User (admin only)
- `team` → Creates or updates a Team

### 2.4 DraftController
**File**: `backend/app/Http/Controllers/DraftController.php`

Endpoints:
```php
// Standard CRUD
GET    /drafts                    → index (list with filters)
POST   /drafts                    → store (manual save)
GET    /drafts/{draft}            → show
PUT    /drafts/{draft}            → update (manual save / auto-save)
DELETE /drafts/{draft}            → destroy

// Actions
POST   /drafts/{draft}/publish   → publish (create/update live record)
POST   /drafts/{draft}/duplicate → duplicate
POST   /drafts/{draft}/restore/{version} → restoreVersion

// Auto-save (same as update but sets auto_saved status)
POST   /drafts/{draft}/auto-save → autoSave

// Cleanup (admin only)
POST   /drafts/cleanup           → cleanup
POST   /drafts/archive           → archive
```

### 2.5 Update BusinessIdService
**File**: `backend/app/Services/BusinessIdService.php`

Add method:
```php
public function generateDraftCode(): string
{
    // DRF-{n} format
    $nextNumber = Cache::remember('business_id_draft_counter', 3600, function () {
        $maxCode = DB::table('drafts')
            ->whereNotNull('draft_code')
            ->orderByRaw("CAST(SUBSTRING(draft_code, 5) AS UNSIGNED) DESC")
            ->value('draft_code');
        if ($maxCode) {
            return (int) str_replace('DRF-', '', $maxCode) + 1;
        }
        return 1;
    });
    Cache::increment('business_id_draft_counter');
    return 'DRF-' . $nextNumber;
}
```

### 2.6 Register Routes
**File**: `backend/routes/api.php`

Add inside `auth:sanctum` group:
```php
/*
| Draft Management Routes
| Centralized draft system for all modules.
*/
use App\Http\Controllers\DraftController;

Route::get('/drafts', [DraftController::class, 'index']);
Route::post('/drafts', [DraftController::class, 'store']);
Route::get('/drafts/{draft}', [DraftController::class, 'show']);
Route::put('/drafts/{draft}', [DraftController::class, 'update']);
Route::delete('/drafts/{draft}', [DraftController::class, 'destroy']);
Route::post('/drafts/{draft}/publish', [DraftController::class, 'publish']);
Route::post('/drafts/{draft}/duplicate', [DraftController::class, 'duplicate']);
Route::post('/drafts/{draft}/restore/{version}', [DraftController::class, 'restoreVersion']);
Route::post('/drafts/{draft}/auto-save', [DraftController::class, 'autoSave']);

// Admin-only cleanup
Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
    Route::post('/drafts/cleanup', [DraftController::class, 'cleanup']);
    Route::post('/drafts/archive', [DraftController::class, 'archive']);
});
```

### 2.7 Scheduled Cleanup Job
**File**: `backend/app/Jobs/CleanupDraftsJob.php`

```php
class CleanupDraftsJob implements ShouldQueue
{
    public function handle(DraftService $draftService): void
    {
        $config = config('drafts', []);
        $cleanupDays = $config['cleanup_days'] ?? 30;
        $archiveDays = $config['archive_days'] ?? 90;

        $draftService->archive($archiveDays);
        $draftService->cleanup($cleanupDays);
    }
}
```

**File**: `backend/config/drafts.php`
```php
return [
    'cleanup_days' => 30,
    'archive_days' => 90,
    'auto_save_delay_seconds' => 20,
    'keep_important_indefinitely' => true,
];
```

Register in `backend/app/Providers/AppServiceProvider.php`:
```php
$this->app->singleton(DraftService::class, fn() => new DraftService());
```

Register schedule in `backend/routes/console.php` or `bootstrap/app.php`:
```php
$schedule->job(new CleanupDraftsJob)->daily();
```

---

## Phase 3: Frontend - Draft Service & Hooks

### 3.1 Draft API Service
**File**: `frontend/src/services/draftService.js`

```js
import { api } from '../lib/api';

const draftService = {
  list: (params) => api.get('/drafts', params),
  get: (id) => api.get(`/drafts/${id}`),
  create: (data) => api.post('/drafts', data),
  update: (id, data) => api.put(`/drafts/${id}`, data),
  delete: (id) => api.delete(`/drafts/${id}`),
  publish: (id) => api.post(`/drafts/${id}/publish`),
  duplicate: (id) => api.post(`/drafts/${id}/duplicate`),
  restoreVersion: (draftId, version) => api.post(`/drafts/${draftId}/restore/${version}`),
  autoSave: (id, data) => api.post(`/drafts/${id}/auto-save`, data),
};

export default draftService;
```

### 3.2 useAutoSave Hook
**File**: `frontend/src/hooks/useAutoSave.js`

Custom hook that:
- Accepts `draftId` (null for new), `formData`, `moduleType`, `enabled` flag
- Debounces changes by 20 seconds (configurable)
- Calls `draftService.autoSave()` or `draftService.create()` on first save
- Returns `{ lastSaved, isSaving, draftId: currentDraftId }`
- Creates draft on first change, updates on subsequent changes
- Only fires if `isDirty` is true

```js
export default function useAutoSave({ draftId, formData, moduleType, enabled = true }) {
  const [lastSaved, setLastSaved] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState(draftId);
  const timerRef = useRef(null);
  const latestDataRef = useRef(formData);

  useEffect(() => {
    latestDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    if (!enabled) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        if (currentDraftId) {
          await draftService.autoSave(currentDraftId, latestDataRef.current);
        } else {
          const result = await draftService.create({
            module_type: moduleType,
            title: latestDataRef.current.title || 'Untitled Draft',
            draft_data: latestDataRef.current,
          });
          setCurrentDraftId(result.data.id);
        }
        setLastSaved(new Date());
      } catch (err) {
        console.error('Auto-save failed:', err);
      } finally {
        setIsSaving(false);
      }
    }, 20000);

    return () => clearTimeout(timerRef.current);
  }, [formData, currentDraftId, moduleType, enabled]);

  return { lastSaved, isSaving, draftId: currentDraftId };
}
```

### 3.3 useDraftGuard Hook (Enhanced useConfirmOnClose)
**File**: `frontend/src/hooks/useDraftGuard.jsx`

Enhanced version of existing `useConfirmOnClose` that adds "Save as Draft" option:

```jsx
export default function useDraftGuard(onClose, { draftSaveHandler, hasDraftFeature = true }) {
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const handleSaveDraft = useCallback(async () => {
    if (draftSaveHandler) {
      await draftSaveHandler();
    }
    setShowConfirm(false);
    setIsDirty(false);
    onClose();
  }, [draftSaveHandler, onClose]);

  const handleDiscard = useCallback(() => {
    setShowConfirm(false);
    setIsDirty(false);
    onClose();
  }, [onClose]);

  const ConfirmDialog = hasDraftFeature ? (
    <DraftGuardDialog
      isOpen={showConfirm}
      onClose={() => setShowConfirm(false)}
      onSaveDraft={handleSaveDraft}
      onDiscard={handleDiscard}
    />
  ) : (
    // Fallback to existing ConfirmModal for modules without draft support
    <ConfirmModal
      isOpen={showConfirm}
      onClose={() => setShowConfirm(false)}
      onConfirm={handleDiscard}
      title="Unsaved Changes"
      message="You have unsaved changes. Are you sure you want to close? All changes will be lost."
      confirmText="Yes, Discard"
      cancelText="Keep Editing"
      danger
    />
  );

  return { isDirty, setIsDirty, handleClose, ConfirmDialog };
}
```

### 3.4 DraftGuardDialog Component
**File**: `frontend/src/components/DraftGuardDialog.jsx`

Three-button confirmation dialog:
- **Save as Draft** (primary blue) - saves and closes
- **Discard Changes** (danger red) - discards and closes
- **Continue Editing** (neutral) - dismisses dialog

Uses createPortal pattern matching existing ConfirmModal. Styles in `DraftGuardDialog.css`.

### 3.5 AutoSaveIndicator Component
**File**: `frontend/src/components/AutoSaveIndicator.jsx`

Small status indicator shown in form modals:
```jsx
// States: idle | saving | saved | error
// Shows: "Saving...", "Saved at 10:45 AM", "Last saved 2 min ago"
```

---

## Phase 4: Frontend - Draft Center Page

### 4.1 DraftCenter Page
**File**: `frontend/src/pages/DraftCenter.jsx`

Full page component following existing table page patterns (like AuditLogs.jsx, Deliveries.jsx):

**Layout:**
- Page header with title "Drafts" and draft count
- Filter bar (module, status, project, owner, date range)
- Sort dropdown (Newest, Oldest, Recently Edited, Alphabetical)
- Search bar (full-text search)
- Table with columns:
  - Draft Title (DRF-xxxxx)
  - Module (badge: Project/Task/Subtask/Event/User/Team)
  - Project (if applicable)
  - Parent Task (if applicable)
  - Status (Draft/Auto Saved/Ready to Publish)
  - Created By (avatar + name)
  - Last Edited By (avatar + name)
  - Last Saved (relative time)
  - Version
  - Actions dropdown (Continue Editing, Rename, Duplicate, Delete, Publish, View Details)

**State management:** local useState with fetch on mount and filter changes
**Pagination:** using existing Pagination component
**Empty states:** using existing empty state patterns

### 4.2 DraftDetailModal
**File**: `frontend/src/components/DraftDetailModal.jsx`

Modal showing full draft data in read-only format with:
- All form fields displayed
- Version history timeline
- Action buttons: Continue Editing, Publish, Delete

### 4.3 DraftRenameModal
**File**: `frontend/src/components/DraftRenameModal.jsx`

Simple modal for renaming a draft (just the title field).

### 4.4 CSS
**File**: `frontend/src/pages/DraftCenter.css`

Styling following existing patterns (AuditLogs.css, Deliveries.css).

---

## Phase 5: Frontend - Sidebar & Routing Integration

### 5.1 Update Sidebar
**File**: `frontend/src/components/layout/Sidebar.jsx`

Add "Drafts" link directly below Calendar, before the `<hr>`:

```jsx
{/* Drafts link - all roles */}
<Link
  to={rolePath("drafts")}
  className={`sidebar-link ${isActive("drafts") ? "active" : ""}`}
  onClick={(e) => e.stopPropagation()}
>
  <MdEditNote />
  <span>Drafts</span>
</Link>
```

Import `MdEditNote` from `react-icons/md`.

### 5.2 Update App.jsx Routes
**File**: `frontend/src/App.jsx`

Add lazy import and route:
```jsx
const DraftCenter = lazy(() => import("./pages/DraftCenter"));
// ...
<Route path="/:role/drafts" element={<ProtectedRoute><DraftCenter /></ProtectedRoute>} />
```

---

## Phase 6: Integration into Existing Modals

### 6.1 CreateProjectModal Integration
**File**: `frontend/src/components/CreateProjectModal.jsx`

Changes:
1. Import `useAutoSave`, `AutoSaveIndicator`, `useDraftGuard`
2. Replace `useConfirmOnClose` with `useDraftGuard`
3. Add auto-save hook:
   ```js
   const { lastSaved, isSaving, draftId } = useAutoSave({
     draftId: initialDraftId,
     formData: form,
     moduleType: 'project',
     enabled: isDirty
   });
   ```
4. Add "Save Draft" button in modal footer alongside existing buttons
5. Add `<AutoSaveIndicator>` in modal header
6. Accept `initialDraftId` prop for draft restoration
7. On draft restore: pre-populate all form state from `draft.draft_data`

**Footer buttons become:**
```
[Cancel] [Save Draft] [Save & Close] [Create]
```

### 6.2 EditProjectModal Integration
**File**: `frontend/src/components/EditProjectModal.jsx`

Same pattern as CreateProjectModal but:
- `moduleType: 'project'`
- `originalRecordId: project.id`
- On publish: PUT to `/projects/{id}` instead of POST

### 6.3 CreateTaskModal Integration
**File**: `frontend/src/components/CreateTaskModal.jsx`

Same pattern:
- `moduleType: 'task'`
- `project_id` included in draft data
- On publish: POST to `/projects/{pid}/tasks` or `/tasks`

### 6.4 EditTaskModal Integration
**File**: `frontend/src/components/EditTaskModal.jsx`

Same pattern with `moduleType: 'task'` and `originalRecordId`.

### 6.5 CreateDeliverableModel Integration
**File**: `frontend/src/components/layout/CreateDeliverableModel.jsx`

Same pattern:
- `moduleType: 'deliverable'`
- `project_id` and `task_id` in draft data
- On publish: POST to `/projects/{pid}/tasks/{tid}/deliverables`

### 6.6 Event Modal Integration
**File**: `frontend/src/components/Event.jsx`

Same pattern:
- `moduleType: 'event'`
- On publish: POST to `/events`

---

## Phase 7: Permission & Security

### 7.1 Draft Visibility Rules
Implemented in `DraftService::getDrafts()`:

```php
if ($user->role === 'admin') {
    // See all drafts
} elseif ($user->role === 'manager') {
    // See own drafts + drafts in managed projects
    $query->where(function ($q) use ($user) {
        $q->where('created_by', $user->id)
          ->orWhereHas('project', fn($pq) => $pq->where('created_by', $user->id));
    });
} else {
    // See only own drafts
    $query->where('created_by', $user->id);
}
```

### 7.2 Draft Ownership Validation
- Only creator can edit/delete their own draft
- Admin can delete any draft
- Manager can delete drafts within their managed projects
- Publishing respects existing role permissions for the target module

---

## Phase 8: Activity Logging

### 8.1 Draft Actions to Log

Using existing `AuditService::log()` and `ActivityService::log()`:

| Action | AuditService Module | AuditService Action | ActivityService |
|--------|-------------------|--------------------|-----------------| 
| Draft Created | `Draft` | `created` | Yes |
| Auto Saved | `Draft` | `auto_saved` | No (too frequent) |
| Draft Updated | `Draft` | `updated` | Yes |
| Draft Published | `Draft` | `published` | Yes |
| Draft Deleted | `Draft` | `deleted` | Yes |
| Draft Restored | `Draft` | `restored` | Yes |
| Draft Duplicated | `Draft` | `duplicated` | Yes |

**No notifications sent on any draft action.** Notifications only fire when the published entity is created/updated (handled by existing module controllers).

---

## Phase 9: Business ID Integration

### 9.1 Draft ID Format
- Draft Code: `DRF-{n}` (e.g., DRF-000001)
- Generated on draft creation via `BusinessIdService::generateDraftCode()`
- Immutable after creation
- Stored in `drafts.draft_code` column

### 9.2 Live Record ID on Publish
- Publishing a draft triggers the normal module's ID generation
- Example: Publishing a project draft → BusinessIdService generates `PRJ-{n}`
- The draft's `original_record_id` is set to the new entity's ID
- Draft status changes to `published`

---

## Implementation Order

1. **Database migrations** (1.1, 1.2)
2. **Models** (2.1, 2.2)
3. **BusinessIdService update** (2.5)
4. **DraftService** (2.3)
5. **DraftController** (2.4)
6. **Routes** (2.6)
7. **Config + Scheduled Job** (2.7)
8. **Frontend draft service** (3.1)
9. **Frontend hooks** (3.2, 3.3)
10. **DraftGuardDialog** (3.4)
11. **AutoSaveIndicator** (3.5)
12. **DraftCenter page + components** (4.1, 4.2, 4.3, 4.4)
13. **Sidebar + routing** (5.1, 5.2)
14. **Modal integrations** (6.1–6.6) - one at a time
15. **Testing & refinement**

---

## Files to Create (New)

| # | File | Purpose |
|---|------|---------|
| 1 | `backend/database/migrations/2026_07_20_100000_create_drafts_table.php` | Drafts table |
| 2 | `backend/database/migrations/2026_07_20_100001_create_draft_versions_table.php` | Version history |
| 3 | `backend/app/Models/Draft.php` | Draft model |
| 4 | `backend/app/Models/DraftVersion.php` | Draft version model |
| 5 | `backend/app/Services/DraftService.php` | Core draft business logic |
| 6 | `backend/app/Http/Controllers/DraftController.php` | API endpoints |
| 7 | `backend/app/Jobs/CleanupDraftsJob.php` | Scheduled cleanup |
| 8 | `backend/config/drafts.php` | Draft configuration |
| 9 | `frontend/src/services/draftService.js` | Frontend API service |
| 10 | `frontend/src/hooks/useAutoSave.js` | Auto-save hook |
| 11 | `frontend/src/hooks/useDraftGuard.jsx` | Enhanced unsaved changes hook |
| 12 | `frontend/src/components/DraftGuardDialog.jsx` | 3-button confirmation dialog |
| 13 | `frontend/src/components/DraftGuardDialog.css` | Dialog styles |
| 14 | `frontend/src/components/AutoSaveIndicator.jsx` | Save status indicator |
| 15 | `frontend/src/components/AutoSaveIndicator.css` | Indicator styles |
| 16 | `frontend/src/pages/DraftCenter.jsx` | Draft management page |
| 17 | `frontend/src/pages/DraftCenter.css` | Page styles |
| 18 | `frontend/src/components/DraftDetailModal.jsx` | View draft details |
| 19 | `frontend/src/components/DraftDetailModal.css` | Detail modal styles |
| 20 | `frontend/src/components/DraftRenameModal.jsx` | Rename draft modal |

## Files to Modify (Existing)

| # | File | Changes |
|---|------|---------|
| 1 | `backend/app/Services/BusinessIdService.php` | Add `generateDraftCode()` |
| 2 | `backend/app/Providers/AppServiceProvider.php` | Register DraftService singleton |
| 3 | `backend/routes/api.php` | Add draft routes |
| 4 | `frontend/src/App.jsx` | Add DraftCenter route + lazy import |
| 5 | `frontend/src/components/layout/Sidebar.jsx` | Add Drafts menu item |
| 6 | `frontend/src/components/CreateProjectModal.jsx` | Integrate auto-save + draft buttons |
| 7 | `frontend/src/components/EditProjectModal.jsx` | Integrate auto-save + draft buttons |
| 8 | `frontend/src/components/CreateTaskModal.jsx` | Integrate auto-save + draft buttons |
| 9 | `frontend/src/components/EditTaskModal.jsx` | Integrate auto-save + draft buttons |
| 10 | `frontend/src/components/layout/CreateDeliverableModel.jsx` | Integrate auto-save + draft buttons |
| 11 | `frontend/src/components/Event.jsx` | Integrate auto-save + draft buttons |

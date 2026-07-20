# Implementation Plan: Add Start Date & Time to Sub-Tasks

## Key Findings

**Good news**: The `start_date` column already exists in the `deliverables` database table (added by migration `2026_07_16_100001`), and the `Deliverable` model already has it in `$fillable` and `$casts`. The `TaskDetails.jsx` subtasks tab already has a "Start & Due Date" column header that renders `d.start_date`.

**What's missing**: The frontend never collects `start_date` when creating/editing subtasks, the backend never saves it, and the API resource never returns it. This is a straightforward wiring task.

---

## Files to Modify

### 1. Backend — DeliverableResource (return start_date in API)
**File:** `backend/app/Http/Resources/DeliverableResource.php`
- Add `'start_date' => $this->start_date?->format('Y-m-d\TH:i:s')` to the `toArray()` response (line ~32, after `priority`)

### 2. Backend — TaskController store() validation + creation (inline deliverables)
**File:** `backend/app/Http/Controllers/TaskController.php`
- Add `'deliverables.*.start_date' => 'nullable|date'` to validation rules (line ~501)
- Add `'start_date' => $del['start_date'] ?? null` to deliverable creation array in `store()` (line ~583)
- Add `'start_date' => $del['start_date'] ?? null` to deliverable creation array in `storeStandalone()` (line ~881)

### 3. Backend — TaskController update() validation + update/create deliverables
**File:** `backend/app/Http/Controllers/TaskController.php`
- Add `'deliverables.*.start_date' => 'sometimes|nullable|date'` to update validation rules (line ~1130 area)
- Add `'start_date' => $del['start_date'] ?? null` to existing deliverable update (line ~1184)
- Add `'start_date' => $del['start_date'] ?? null` to new deliverable creation (line ~1195)

### 4. Frontend — CreateTaskModal.jsx (add start_date field to subtask input)
**File:** `frontend/src/components/CreateTaskModal.jsx`
- Add `start_datetime` to `subtaskInput` state (line 169): `{ title: "", due_datetime: "", start_datetime: "" }`
- Add a "Start Date & Time" `<input type="datetime-local">` field in the Subtasks card (between Subtask Name and Due Date)
- Update `handleAddSubtask()` (line 282) to include `start_date: toUTCIso(subtaskInput.start_datetime)` in the subtask object
- Update the `deliverables` array in the submit body (line 386) to include `start_date: d.start_date || null`
- Update the subtask list item display (line 789) to also show the start date
- Update `setSubtaskInput` reset (line 288) to include `start_datetime: ""`
- Add validation: start_date is required, due_date must be after start_date

### 5. Frontend — EditTaskModal.jsx (add start_date field to subtask input + existing subtask display)
**File:** `frontend/src/components/EditTaskModal.jsx`
- Add `start_datetime` to `subtaskInput` state (line 176): `{ title: "", due_datetime: "", start_datetime: "" }`
- Add a "Start Date & Time" `<input type="datetime-local">` field in the Subtasks card (between Subtask Name and Due Date)
- Update `handleAddSubtask()` (line 271) to include `start_date: toUTCIso(subtaskInput.start_datetime)` in the subtask object
- Update the `deliverables` array in the submit body (line 492) to include `start_date: d.start_date || null`
- Update the subtask list item display (line 1058) to show both start and due dates
- Update `setSubtaskInput` reset (line 277) to include `start_datetime: ""`
- Add validation: start_date is required, due_date must be after start_date

### 6. Frontend — TaskDetails.jsx (subtasks tab already handles this — no changes needed)
**File:** `frontend/src/pages/TaskDetails.jsx`
- Line 940: Column header "Start & Due Date" — **already exists**
- Line 971: Row renders `formatDateTimeShort(d.start_date)` — **already exists**
- Once `start_date` is returned by the API, these will display correctly automatically

---

## Validation Rules

### Frontend (CreateTaskModal + EditTaskModal)
- Start Date & Time: required when adding a subtask
- Due Date & Time: required when adding a subtask
- Due Date must be >= Start Date
- Both dates must be <= task end_date (existing constraint for due_date)
- Start Date must be >= task start_date (optional constraint)

### Backend (TaskController)
- `deliverables.*.start_date`: `nullable|date` (store), `sometimes|nullable|date` (update)
- The backend does not enforce due >= start at the deliverable level (task-level validation handles deadline logic)

---

## Implementation Order

1. DeliverableResource — add `start_date` to API response
2. TaskController store() — add validation + creation for start_date
3. TaskController storeStandalone() — add creation for start_date
4. TaskController update() — add validation + update/create for start_date
5. CreateTaskModal — add start_date input field + wire up to state and submit
6. EditTaskModal — add start_date input field + wire up to state and submit
7. Run linting/typecheck

-- ============================================================
-- SQL FIX: Correct assigned_by / creator_id for cross-org tasks
-- Run this on Org A's database (pms_tenant_mughal-s-furnitures-2)
-- ============================================================

-- Step 1: Find Dummy's user ID in Org A's DB
-- (Replace 'dummy@email.com' with Dummy's actual email if different)
SELECT id, name, email FROM users WHERE LOWER(email) = 'dummy%';

-- Step 2: Find Test's user ID in Org A's DB (for reference)
SELECT id, name, email FROM users WHERE LOWER(email) = 'test%';

-- Step 3: Find all tasks where assigned_by needs fixing
-- These are tasks where assigned_by = Test's ID but were actually created by Dummy
SELECT t.id, t.business_id, t.title, t.assigned_by, t.assigned_to, t.creator_id,
       u_assigner.name as assigner_name, u_assigner.email as assigner_email,
       u_assignee.name as assignee_name, u_assignee.email as assignee_email
FROM tasks t
LEFT JOIN users u_assigner ON u_assigner.id = t.assigned_by
LEFT JOIN users u_assignee ON u_assignee.id = t.assigned_to
ORDER BY t.id DESC;

-- Step 4: Update tasks created by Dummy in shared projects
-- Replace {DUMMY_ID_IN_ORG_A} with the actual ID from Step 1
-- This fixes tasks where Dummy (Org B) created tasks in Org A's shared project
-- but assigned_by was set to Dummy's raw Org B ID which mapped to Test in Org A

-- Example (replace IDs):
-- UPDATE tasks SET assigned_by = {DUMMY_ID_IN_ORG_A}, creator_id = {DUMMY_ID_IN_ORG_A}
-- WHERE assigned_by = {TEST_ID}
-- AND project_id IN (
--     SELECT resource_id FROM shared_resources
--     WHERE resource_type = 'project' AND shared_with_organization_id = 91
-- );

-- If you're unsure, run Step 3 first to see which tasks need fixing,
-- then update individually:
-- UPDATE tasks SET assigned_by = {DUMMY_ID_IN_ORG_A}, creator_id = {DUMMY_ID_IN_ORG_A} WHERE id = {TASK_ID};

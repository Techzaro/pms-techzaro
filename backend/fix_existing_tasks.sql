-- ============================================================
-- FIX: Correct assigned_by for cross-org tasks in Org A
-- Database: pms_tenant_mughal-s-furnitures-2
-- ============================================================

-- Dummy's ID in Org A = 2 (found via email: dummy@gmail.com)
-- Test's ID in Org A = 1 (found via email: sufyan.sufyan1029@gmail.com)

-- Fix tasks that Dummy (Org B) actually created:
-- TSK-0020 "3rd task" (id=20) — assigned to dummy (id=2)
UPDATE tasks SET assigned_by = 2, creator_id = 2 WHERE id = 20;

-- TSK-0021 "5th task" (id=21) — assigned to Test (was supposed to be)
UPDATE tasks SET assigned_by = 2, creator_id = 2 WHERE id = 21;

-- Fix workflow events for these tasks too
UPDATE task_workflow_events SET user_id = 2 WHERE task_id = 20 AND action = 'created';
UPDATE task_workflow_events SET user_id = 2 WHERE task_id = 21 AND action = 'created';

-- Verify the fix:
SELECT t.id, t.business_id, t.title, t.assigned_by, t.assigned_to, 
       u.name as assigner_name, u.email as assigner_email
FROM tasks t 
LEFT JOIN users u ON u.id = t.assigned_by 
ORDER BY t.id DESC;

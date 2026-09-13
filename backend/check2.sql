SELECT id, resource_type, resource_id, resource_name, shared_by_organization_id, shared_with_organization_id, permission, status, connection_id FROM `pms_tenant_test-org`.shared_resources WHERE resource_type='project';
SELECT '---MUGHALS---';
SELECT id, resource_type, resource_id, resource_name, shared_by_organization_id, shared_with_organization_id, permission, status, connection_id FROM `pms_tenant_mughal-s-furnitures-2`.shared_resources WHERE resource_type='project';
SELECT '---CONNECTIONS---';
SELECT id, requesting_organization_id, receiving_organization_id, status FROM saas_master.organization_connections WHERE (requesting_organization_id IN (90,91) OR receiving_organization_id IN (90,91));


SELECT '---MUGHALS_SHARED_RESOURCES---';
SELECT id, resource_type, resource_id, resource_name, shared_by_organization_id, shared_with_organization_id, permission, status FROM pms_tenant_mughal-s-furnitures-2.shared_resources WHERE shared_with_organization_id=90 AND resource_type='project' AND status='active';

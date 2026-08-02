// Mock data for Super Admin Dashboard
// All data is static — no API calls. Ready for future integration.

export const organizations = [
  { id: 1, name: 'TechXaro', slug: 'techxaro', logo: null, domain: 'techxaro.pms.test', database: 'pms_techxaro', plan: 'Enterprise', type: 'owner', status: 'active', users: 25, storage: '2.4 GB', storagePercent: 12, projects: 18, createdAt: '2025-01-15' },
  { id: 2, name: 'Acme Corporation', slug: 'acme', logo: null, domain: 'acme.pms.test', database: 'pms_tenant_acme', plan: 'Professional', type: 'standard', status: 'active', users: 42, storage: '18.7 GB', storagePercent: 37, projects: 34, createdAt: '2025-03-22' },
  { id: 3, name: 'Globex Industries', slug: 'globex', logo: null, domain: 'globex.pms.test', database: 'pms_tenant_globex', plan: 'Starter', type: 'standard', status: 'trial', users: 8, storage: '1.2 GB', storagePercent: 24, projects: 5, createdAt: '2025-06-10' },
  { id: 4, name: 'Initech', slug: 'initech', logo: null, domain: 'initech.pms.test', database: 'pms_tenant_initech', plan: 'Professional', type: 'standard', status: 'active', users: 15, storage: '5.8 GB', storagePercent: 11, projects: 12, createdAt: '2025-04-05' },
  { id: 5, name: 'Umbrella Corp', slug: 'umbrella', logo: null, domain: 'umbrella.pms.test', database: 'pms_tenant_umbrella', plan: 'Enterprise', type: 'standard', status: 'suspended', users: 67, storage: '45.2 GB', storagePercent: 90, projects: 52, createdAt: '2024-11-20' },
  { id: 6, name: 'Wayne Enterprises', slug: 'wayne', logo: null, domain: 'wayne.pms.test', database: 'pms_tenant_wayne', plan: 'Professional', type: 'standard', status: 'active', users: 31, storage: '12.3 GB', storagePercent: 24, projects: 22, createdAt: '2025-02-28' },
  { id: 7, name: 'Stark Industries', slug: 'stark', logo: null, domain: 'stark.pms.test', database: 'pms_tenant_stark', plan: 'Enterprise', type: 'standard', status: 'archived', users: 89, storage: '67.8 GB', storagePercent: 13, projects: 71, createdAt: '2024-08-15' },
  { id: 8, name: 'Cyberdyne Systems', slug: 'cyberdyne', logo: null, domain: 'cyberdyne.pms.test', database: 'pms_tenant_cyberdyne', plan: 'Starter', type: 'standard', status: 'active', users: 5, storage: '0.8 GB', storagePercent: 16, projects: 3, createdAt: '2025-07-01' },
];

export const plans = [
  { id: 1, name: 'Starter', slug: 'starter', price: 29, priceYearly: 290, maxUsers: 10, maxProjects: 10, maxStorage: 5, isDefault: true, isActive: true, modules: ['projects', 'tasks', 'deliverables', 'teams', 'events', 'notifications', 'chat', 'drafts', 'activities', 'profiles', 'company_documents', 'work_timers'] },
  { id: 2, name: 'Professional', slug: 'professional', price: 79, priceYearly: 790, maxUsers: 50, maxProjects: 50, maxStorage: 50, isDefault: false, isActive: true, modules: ['projects', 'tasks', 'deliverables', 'teams', 'events', 'notifications', 'chat', 'drafts', 'activities', 'profiles', 'company_documents', 'work_timers', 'reports', 'audit_logs', 'guest_portal', 'delegation'] },
  { id: 3, name: 'Enterprise', slug: 'enterprise', price: 199, priceYearly: 1990, maxUsers: 9999, maxProjects: 9999, maxStorage: 500, isDefault: false, isActive: true, modules: ['projects', 'tasks', 'deliverables', 'teams', 'events', 'notifications', 'chat', 'drafts', 'activities', 'profiles', 'company_documents', 'work_timers', 'reports', 'audit_logs', 'guest_portal', 'delegation', 'recurring_tasks'] },
];

export const modules = [
  { id: 1, name: 'Projects', slug: 'projects', category: 'core', version: '1.0', isActive: true, isDefault: true, description: 'Full project lifecycle management with milestones, files, and visibility controls.', supportedPlans: ['starter', 'professional', 'enterprise'] },
  { id: 2, name: 'Tasks', slug: 'tasks', category: 'core', version: '1.0', isActive: true, isDefault: true, description: 'Task management with assignments, status tracking, timers, and submission workflows.', supportedPlans: ['starter', 'professional', 'enterprise'] },
  { id: 3, name: 'Deliverables', slug: 'deliverables', category: 'core', version: '1.0', isActive: true, isDefault: true, description: 'Subtask management with delegation, approval chains, and file attachments.', supportedPlans: ['starter', 'professional', 'enterprise'] },
  { id: 4, name: 'Teams', slug: 'teams', category: 'core', version: '1.0', isActive: true, isDefault: true, description: 'Team organization with leaders, member assignments, and team-level views.', supportedPlans: ['starter', 'professional', 'enterprise'] },
  { id: 5, name: 'Calendar & Events', slug: 'events', category: 'core', version: '1.0', isActive: true, isDefault: true, description: 'Calendar with events, reminders, and unified scheduling across tasks and projects.', supportedPlans: ['starter', 'professional', 'enterprise'] },
  { id: 6, name: 'Notifications', slug: 'notifications', category: 'core', version: '1.0', isActive: true, isDefault: true, description: 'In-app and push notifications with device token management.', supportedPlans: ['starter', 'professional', 'enterprise'] },
  { id: 7, name: 'Chat', slug: 'chat', category: 'core', version: '1.0', isActive: true, isDefault: true, description: 'Project-based messaging between team members and guests.', supportedPlans: ['starter', 'professional', 'enterprise'] },
  { id: 8, name: 'Drafts', slug: 'drafts', category: 'core', version: '1.0', isActive: true, isDefault: true, description: 'Draft system with auto-save, versioning, and publish workflows.', supportedPlans: ['starter', 'professional', 'enterprise'] },
  { id: 9, name: 'Activity Feed', slug: 'activities', category: 'core', version: '1.0', isActive: true, isDefault: true, description: 'Real-time activity tracking across all modules.', supportedPlans: ['starter', 'professional', 'enterprise'] },
  { id: 10, name: 'User Profiles', slug: 'profiles', category: 'core', version: '1.0', isActive: true, isDefault: true, description: 'Comprehensive user profiles with employment details and document management.', supportedPlans: ['starter', 'professional', 'enterprise'] },
  { id: 11, name: 'Company Documents', slug: 'company_documents', category: 'core', version: '1.0', isActive: true, isDefault: true, description: 'Company-wide document management for contracts, policies, and more.', supportedPlans: ['starter', 'professional', 'enterprise'] },
  { id: 12, name: 'Work Timers', slug: 'work_timers', category: 'core', version: '1.0', isActive: true, isDefault: true, description: 'Time tracking with pause sessions, timer history, and productivity metrics.', supportedPlans: ['starter', 'professional', 'enterprise'] },
  { id: 13, name: 'Reports', slug: 'reports', category: 'premium', version: '1.0', isActive: true, isDefault: false, description: 'Advanced analytics with team performance, project reports, and export capabilities.', supportedPlans: ['professional', 'enterprise'] },
  { id: 14, name: 'Audit Logs', slug: 'audit_logs', category: 'premium', version: '1.0', isActive: true, isDefault: false, description: 'Complete audit trail with filtering, export, and compliance support.', supportedPlans: ['professional', 'enterprise'] },
  { id: 15, name: 'Guest Portal', slug: 'guest_portal', category: 'premium', version: '1.0', isActive: true, isDefault: false, description: 'Client-facing portal for external stakeholders to view assigned work.', supportedPlans: ['professional', 'enterprise'] },
  { id: 16, name: 'Delegation', slug: 'delegation', category: 'premium', version: '1.0', isActive: true, isDefault: false, description: 'Task and deliverable delegation with approval chains and status tracking.', supportedPlans: ['professional', 'enterprise'] },
  { id: 17, name: 'Recurring Tasks', slug: 'recurring_tasks', category: 'enterprise', version: '1.0', isActive: true, isDefault: false, description: 'Automated recurring task generation with daily, weekly, and monthly schedules.', supportedPlans: ['enterprise'] },
];

export const domains = [
  { id: 1, orgId: 1, orgName: 'TechXaro', primaryDomain: 'techxaro.pms.test', customDomain: null, ssl: true, verified: true, status: 'active', dns: 'configured' },
  { id: 2, orgId: 2, orgName: 'Acme Corporation', primaryDomain: 'acme.pms.test', customDomain: 'app.acme.com', ssl: true, verified: true, status: 'active', dns: 'configured' },
  { id: 3, orgId: 3, orgName: 'Globex Industries', primaryDomain: 'globex.pms.test', customDomain: null, ssl: true, verified: true, status: 'active', dns: 'configured' },
  { id: 4, orgId: 4, orgName: 'Initech', primaryDomain: 'initech.pms.test', customDomain: null, ssl: true, verified: true, status: 'active', dns: 'configured' },
  { id: 5, orgId: 5, orgName: 'Umbrella Corp', primaryDomain: 'umbrella.pms.test', customDomain: 'pm.umbrella.co', ssl: false, verified: false, status: 'suspended', dns: 'pending' },
];

export const activityLogs = [
  { id: 1, user: 'System', action: 'Provisioned', target: 'Cyberdyne Systems', ip: '127.0.0.1', timestamp: '2025-07-01 14:30:00', status: 'success' },
  { id: 2, user: 'Admin', action: 'Suspended', target: 'Umbrella Corp', ip: '192.168.1.100', timestamp: '2025-06-28 09:15:00', status: 'warning' },
  { id: 3, user: 'System', action: 'Backup completed', target: 'Acme Corporation', ip: '127.0.0.1', timestamp: '2025-06-27 03:00:00', status: 'success' },
  { id: 4, user: 'Admin', action: 'Activated', target: 'Wayne Enterprises', ip: '192.168.1.100', timestamp: '2025-06-25 16:45:00', status: 'success' },
  { id: 5, user: 'System', action: 'Health check passed', target: 'All tenants', ip: '127.0.0.1', timestamp: '2025-06-27 00:00:00', status: 'success' },
  { id: 6, user: 'Admin', action: 'Archived', target: 'Stark Industries', ip: '192.168.1.100', timestamp: '2025-06-20 11:00:00', status: 'info' },
  { id: 7, user: 'System', action: 'Plan upgraded', target: 'Initech', ip: '127.0.0.1', timestamp: '2025-06-18 08:30:00', status: 'success' },
  { id: 8, user: 'Admin', action: 'Domain added', target: 'Acme Corporation', ip: '192.168.1.100', timestamp: '2025-06-15 13:20:00', status: 'success' },
  { id: 9, user: 'System', action: 'Migration completed', target: 'Globex Industries', ip: '127.0.0.1', timestamp: '2025-06-10 00:01:00', status: 'success' },
  { id: 10, user: 'System', action: 'Session invalidated', target: 'Umbrella Corp', ip: '127.0.0.1', timestamp: '2025-06-28 09:15:01', status: 'warning' },
];

export const healthStatus = {
  overall: 'healthy',
  masterDatabase: { status: 'healthy', latency: '2.1ms', version: '8.0.35', lastChecked: '2025-06-27 15:30:00' },
  tenantDatabases: { status: 'healthy', count: 8, avgLatency: '3.4ms', lastChecked: '2025-06-27 15:30:00' },
  queue: { status: 'healthy', connection: 'database', size: 0, lastChecked: '2025-06-27 15:30:00' },
  mail: { status: 'healthy', mailer: 'smtp', lastChecked: '2025-06-27 15:30:00' },
  cache: { status: 'healthy', driver: 'database', lastChecked: '2025-06-27 15:30:00' },
  redis: { status: 'not_configured', driver: 'database', lastChecked: '2025-06-27 15:30:00' },
  storage: { status: 'healthy', disk: 'local', usage: '156 GB', lastChecked: '2025-06-27 15:30:00' },
  scheduler: { status: 'healthy', lastRun: '2025-06-27 03:00:00', lastChecked: '2025-06-27 15:30:00' },
};

export const dashboardStats = {
  totalOrganizations: 8,
  activeOrganizations: 5,
  trialOrganizations: 1,
  suspendedOrganizations: 1,
  totalUsers: 282,
  totalProjects: 217,
  storageUsage: '154.2 GB',
  monthlyRevenue: 1247,
  cpuUsage: 23,
  databaseCount: 9,
};

export const revenueData = [
  { month: 'Jan', revenue: 890 },
  { month: 'Feb', revenue: 1020 },
  { month: 'Mar', revenue: 1150 },
  { month: 'Apr', revenue: 1080 },
  { month: 'May', revenue: 1200 },
  { month: 'Jun', revenue: 1247 },
];

export const organizationGrowth = [
  { month: 'Jan', count: 3 },
  { month: 'Feb', count: 4 },
  { month: 'Mar', count: 5 },
  { month: 'Apr', count: 5 },
  { month: 'May', count: 7 },
  { month: 'Jun', count: 8 },
];

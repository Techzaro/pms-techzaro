const dashboardMock = {
  summary: {
    active_projects: 3,
    tasks_due_today: 4,
    completed_tasks: 2,
    pending_tasks: 5,
  },
  todayWorkload: [
    { id: 1, title: "Navbar Design", assignees: [{id:1,name:"Ahmad"}], end_date: new Date().toISOString(), priority: "High" },
    { id: 2, title: "API Integration", assignees: [{id:1,name:"Ahmad"}], end_date: new Date().toISOString(), priority: "Medium" },
    { id: 3, title: "Database Optimization", assignees: [{id:1,name:"Ahmad"}], end_date: new Date().toISOString(), priority: "Low" },
    { id: 4, title: "QA Review", assignees: [{id:1,name:"Ahmad"}], end_date: new Date().toISOString(), priority: "Medium" },
  ],
  activeProjects: [
    { id: 101, name: "Website Redesign", client: "TechVision Inc.", progress: 80, deadline: "30 Oct 2036", members: [{id:1}] },
    { id: 102, name: "Car System", client: "Go Drive", progress: 61, deadline: "30 Oct 2036", members: [{id:1}] },
    { id: 103, name: "Mobile App", client: "SoftLabs", progress: 68, deadline: "30 Oct 2036", members: [{id:1}] },
  ],
  completedToday: [
    { id: 201, title: "Navbar Design", project: "Website Redesign", completed_at: new Date().toLocaleString() },
    { id: 202, title: "Upload files to CRM", project: "Car System", completed_at: new Date().toLocaleString() },
  ],
  recentActivity: [
    { id: 301, summary: "Ahmad completed the task 'Navbar Design' in Website Redesign", created_at: new Date().toISOString() },
    { id: 302, summary: "Sarah uploaded 5 new files to CRM System", created_at: new Date().toISOString() },
  ],
};

export default dashboardMock;

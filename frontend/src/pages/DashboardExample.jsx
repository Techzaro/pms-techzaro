// Example Usage - Dashboard Page using Figma Components

import React, { useState } from 'react';
import FigmaCreateTaskModal from '../components/FigmaCreateTaskModal';
import FigmaCreateProjectModal from '../components/FigmaCreateProjectModal';
import { 
  useModal, 
  StatusBadge, 
  PriorityBadge, 
  UserAvatar, 
  Button,
  Card,
  Toast,
  LoadingSpinner 
} from '../components/FigmaUIKit';

export default function Dashboard() {
  const taskModal = useModal();
  const projectModal = useModal();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Handle task creation
  const handleTaskSubmit = async (taskData) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      const payload = {
        project_id: taskData.project,
        title: taskData.taskName,
        description: taskData.description,
        assigned_users: taskData.assignTo,
        status: taskData.status,
        priority: taskData.priority,
        start_date: taskData.startDate,
        due_date: taskData.dueDate,
        is_recurring: taskData.isRecurring,
        attachments: taskData.links,
      };

      const response = await fetch("http://127.0.0.1:8000/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to create task");
      
      setToast({ message: "Task created successfully!", type: "success" });
      taskModal.close();
      
      // Refresh task list
      // await fetchTasks();
      
    } catch (error) {
      setToast({ message: error.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Handle project creation
  const handleProjectSubmit = async (projectData) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      const payload = {
        title: projectData.projectName,
        description: projectData.description,
        category: projectData.category,
        goals: projectData.projectGoals.map(g => g.text),
        team_id: projectData.team,
        assigned_users: projectData.teamMembers,
      };

      const response = await fetch("http://127.0.0.1:8000/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to create project");
      
      setToast({ message: "Project created successfully!", type: "success" });
      projectModal.close();
      
      // Refresh project list
      // await fetchProjects();
      
    } catch (error) {
      setToast({ message: error.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-2">Welcome back! Here's what's happening with your projects.</p>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="primary"
              onClick={taskModal.open}
            >
              + New Task
            </Button>
            <Button 
              variant="success"
              onClick={projectModal.open}
            >
              + New Project
            </Button>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <Card>
            <p className="text-gray-600 text-sm font-medium mb-2">Total Projects</p>
            <p className="text-3xl font-bold text-gray-900">12</p>
          </Card>
          <Card>
            <p className="text-gray-600 text-sm font-medium mb-2">Active Tasks</p>
            <p className="text-3xl font-bold text-gray-900">28</p>
          </Card>
          <Card>
            <p className="text-gray-600 text-sm font-medium mb-2">Team Members</p>
            <p className="text-3xl font-bold text-gray-900">8</p>
          </Card>
          <Card>
            <p className="text-gray-600 text-sm font-medium mb-2">Completion Rate</p>
            <p className="text-3xl font-bold text-gray-900">75%</p>
          </Card>
        </div>

        {/* Tasks Section */}
        <div className="grid grid-cols-2 gap-8">
          {/* Recent Tasks */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Tasks</h2>
            <div className="space-y-3">
              {[
                { title: "Design homepage", status: "In Progress", priority: "High" },
                { title: "Setup database", status: "Planned", priority: "Medium" },
                { title: "Code review", status: "Completed", priority: "Low" },
              ].map((task, idx) => (
                <Card key={idx}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900">{task.title}</p>
                      <div className="flex gap-2 mt-2">
                        <StatusBadge status={task.status} />
                        <PriorityBadge priority={task.priority} />
                      </div>
                    </div>
                    <UserAvatar name="John Doe" size="sm" />
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Recent Projects */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Projects</h2>
            <div className="space-y-3">
              {[
                { name: "E-Commerce Platform", category: "Web Development" },
                { name: "Mobile App", category: "Mobile App" },
                { name: "Dashboard UI", category: "UI/UX Design" },
              ].map((project, idx) => (
                <Card key={idx}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900">{project.name}</p>
                      <p className="text-xs text-gray-600 mt-1">{project.category}</p>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3].map(i => (
                        <UserAvatar key={i} name={`User ${i}`} size="sm" />
                      ))}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <FigmaCreateTaskModal
        isOpen={taskModal.isOpen}
        onClose={taskModal.close}
        onSubmit={handleTaskSubmit}
      />

      <FigmaCreateProjectModal
        isOpen={projectModal.isOpen}
        onClose={projectModal.close}
        onSubmit={handleProjectSubmit}
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={3000}
        />
      )}
    </div>
  );
}

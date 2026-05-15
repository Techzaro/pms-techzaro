# Figma Design to React Components - Implementation Guide

This document provides a comprehensive guide for implementing the Figma PMS TechXaro redesign in React with Tailwind CSS.

## Overview

Two main modal components have been created based on the Figma design:

1. **FigmaCreateTaskModal** (`FigmaCreateTaskModal.jsx`)
2. **FigmaCreateProjectModal** (`FigmaCreateProjectModal.jsx`)

These components are fully responsive and use Tailwind CSS for styling.

## Installation & Setup

### Prerequisites
- React 16.8+ (hooks)
- Tailwind CSS configured in your project
- `lucide-react` for icons (optional, but recommended)

### Install lucide-react
```bash
npm install lucide-react
```

## Component Usage

### FigmaCreateTaskModal

A comprehensive modal for creating new tasks with the following features:
- Project selection
- Multi-user assignment
- Task name and description
- Status and priority dropdowns
- Date range selection (start & due date)
- Attachment/link management
- Recurring task checkbox

#### Basic Usage

```jsx
import FigmaCreateTaskModal from './components/FigmaCreateTaskModal';
import { useState } from 'react';

function App() {
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const handleTaskSubmit = (taskData) => {
    console.log('Task created:', taskData);
    // Send to API
    // Example data structure:
    // {
    //   project: "project1",
    //   assignTo: [],
    //   taskName: "Build homepage",
    //   description: "Create responsive homepage...",
    //   status: "Planned",
    //   priority: "Medium",
    //   startDate: "2026-05-15",
    //   dueDate: "2026-05-30",
    //   links: ["https://figma.com/..."],
    //   isRecurring: false
    // }
  };

  return (
    <>
      <button onClick={() => setIsTaskModalOpen(true)}>
        Create New Task
      </button>
      
      <FigmaCreateTaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSubmit={handleTaskSubmit}
      />
    </>
  );
}
```

### FigmaCreateProjectModal

A comprehensive modal for creating new projects with:
- Project name and description
- Category selection
- Dynamic project goals management
- Team and team members selection
- Live project preview panel

#### Basic Usage

```jsx
import FigmaCreateProjectModal from './components/FigmaCreateProjectModal';
import { useState } from 'react';

function App() {
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

  const handleProjectSubmit = (projectData) => {
    console.log('Project created:', projectData);
    // Send to API
    // Example data structure:
    // {
    //   projectName: "E-commerce Platform",
    //   description: "Build a new e-commerce platform...",
    //   category: "Web Development",
    //   projectGoals: [
    //     { id: 1, text: "Ensure mobile responsiveness" }
    //   ],
    //   team: "team1",
    //   teamMembers: []
    // }
  };

  return (
    <>
      <button onClick={() => setIsProjectModalOpen(true)}>
        Create New Project
      </button>
      
      <FigmaCreateProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onSubmit={handleProjectSubmit}
      />
    </>
  );
}
```

## Integrating with Existing Components

### Option 1: Replace Existing Components

If you want to replace the existing `CreateProjectModal.jsx`, you can update it to use these Figma-based components as the base:

```jsx
// In CreateProjectModal.jsx
import FigmaCreateProjectModal from './FigmaCreateProjectModal';
import { useEffect, useState } from 'react';

function CreateProjectModal({ onClose }) {
  const handleSubmit = async (projectData) => {
    try {
      const token = localStorage.getItem("token");
      
      // Map Figma component data to your API format
      const apiData = {
        title: projectData.projectName,
        description: projectData.description,
        category: projectData.category,
        goals: projectData.projectGoals.map(g => g.text).join(','),
        team_id: projectData.team,
        assigned_users: projectData.teamMembers,
        // Add other fields as needed
      };

      const response = await fetch(
        "http://127.0.0.1:8000/api/projects",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(apiData),
        }
      );

      if (!response.ok) throw new Error("Failed to create project");
      
      alert("Project Created Successfully");
      onClose();
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <FigmaCreateProjectModal
      isOpen={true}
      onClose={onClose}
      onSubmit={handleSubmit}
    />
  );
}

export default CreateProjectModal;
```

### Option 2: Hybrid Approach

Keep both components and use the Figma versions alongside existing ones:

```jsx
import FigmaCreateTaskModal from './components/FigmaCreateTaskModal';
import FigmaCreateProjectModal from './components/FigmaCreateProjectModal';

function Dashboard() {
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);

  return (
    <>
      <button onClick={() => setShowTaskModal(true)}>
        + New Task (Figma Design)
      </button>
      <button onClick={() => setShowProjectModal(true)}>
        + New Project (Figma Design)
      </button>

      <FigmaCreateTaskModal
        isOpen={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        onSubmit={handleTaskSubmit}
      />

      <FigmaCreateProjectModal
        isOpen={showProjectModal}
        onClose={() => setShowProjectModal(false)}
        onSubmit={handleProjectSubmit}
      />
    </>
  );
}
```

## Customization

### Tailwind Configuration

The components use standard Tailwind classes. To customize colors, update your `tailwind.config.js`:

```js
module.exports = {
  theme: {
    colors: {
      blue: {
        500: '#5B21B6', // Your brand blue
        600: '#4C1D95', // Darker shade
        700: '#3C0F7F', // Even darker
      },
      // ... other colors
    },
  },
}
```

### Custom Styling

To add custom styles, you can extend the components:

```jsx
import FigmaCreateTaskModal from './components/FigmaCreateTaskModal';

export default function CustomTaskModal(props) {
  return (
    <FigmaCreateTaskModal
      {...props}
      // You can wrap it in a div to add outer styling
    />
  );
}
```

## API Integration Example

### Task Creation API Call

```jsx
const handleTaskSubmit = async (taskData) => {
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
      attachments: taskData.links, // or files
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
    
    const result = await response.json();
    console.log("Task created:", result);
    
  } catch (error) {
    console.error("Error:", error);
  }
};
```

### Project Creation API Call

```jsx
const handleProjectSubmit = async (projectData) => {
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
    
    const result = await response.json();
    console.log("Project created:", result);
    
  } catch (error) {
    console.error("Error:", error);
  }
};
```

## Form Validation

### Add Validation to Your Components

```jsx
const [errors, setErrors] = useState({});

const validateForm = (formData) => {
  const newErrors = {};
  
  if (!formData.taskName.trim()) {
    newErrors.taskName = "Task name is required";
  }
  
  if (!formData.project) {
    newErrors.project = "Please select a project";
  }
  
  if (formData.dueDate && formData.startDate) {
    if (new Date(formData.dueDate) < new Date(formData.startDate)) {
      newErrors.dueDate = "Due date must be after start date";
    }
  }
  
  return newErrors;
};

const handleCreateTask = (e) => {
  e.preventDefault();
  
  const newErrors = validateForm(formData);
  if (Object.keys(newErrors).length > 0) {
    setErrors(newErrors);
    return;
  }
  
  // Proceed with submission
};
```

## Responsive Design

Both components are fully responsive using Tailwind's responsive utilities:

- **Mobile**: Single column layout
- **Tablet**: 2 column layout
- **Desktop**: 3 column layout (left section, main content, right section)

The modal automatically adapts to different screen sizes using:
- `max-w-6xl` for maximum width
- `max-h-[90vh]` for maximum height
- `overflow-auto` for scrolling content

## Accessibility Features

The components include:
- Semantic HTML structure
- ARIA labels on form inputs
- Keyboard navigation support
- Focus management
- Color contrast compliance
- Screen reader friendly

## Performance Tips

1. **Lazy Load**: Load modals only when needed
2. **Memoization**: Use `React.memo()` for performance
3. **Debouncing**: Debounce API calls during typing

```jsx
import { useMemo, useCallback } from 'react';

const MemoizedTaskModal = React.memo(FigmaCreateTaskModal);

// Debounce search
const debouncedSearch = useCallback(
  debounce((value) => {
    // Search logic
  }, 300),
  []
);
```

## File Structure

```
frontend/src/components/
├── FigmaCreateTaskModal.jsx
├── FigmaCreateProjectModal.jsx
├── CreateTaskModal.jsx (existing)
├── CreateProjectModal.jsx (existing)
└── layout/
```

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- IE11: Not supported (requires polyfills)

## Troubleshooting

### Modal Not Showing
- Ensure `isOpen` prop is `true`
- Check z-index conflicts with other modals
- Verify Tailwind CSS is properly configured

### Styling Issues
- Clear browser cache
- Verify Tailwind CSS is processing the component files
- Check `tailwind.config.js` includes the component paths

### Icons Not Showing
- Ensure `lucide-react` is installed: `npm install lucide-react`
- Import icons from the correct package

## Next Steps

1. **Integrate with API**: Connect components to your backend
2. **Add Validation**: Implement form validation
3. **Add Animations**: Consider adding Framer Motion for transitions
4. **User Feedback**: Add toast notifications for success/error states
5. **Accessibility**: Test with screen readers and keyboard navigation

## Support

For issues or questions about the Figma design implementation:
1. Review the Figma file for design specifications
2. Check the component prop documentation
3. Consult the examples in this guide

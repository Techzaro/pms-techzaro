# ✨ Figma PMS Design System - React Components

Complete React component library based on the **PMS TechXaro Figma Design** with **100% Tailwind CSS** styling.

## 🎯 Overview

This package contains a full-featured React component system converted from the Figma PMS TechXaro web redesign. Everything is built with:
- ⚛️ **React Hooks** for state management
- 🎨 **Tailwind CSS** for all styling
- 📦 **Modular Design** for easy integration
- 🔧 **Type-Safe** with proper interfaces
- ♿ **Accessible** with ARIA labels

## 📁 What's Included

### Components

1. **FigmaCreateTaskModal** - Comprehensive task creation modal
   - Multi-step form with project selection
   - User assignment capabilities
   - Status and priority management
   - Date range selection
   - Link and attachment management

2. **FigmaCreateProjectModal** - Project creation modal
   - Project details form
   - Category selection
   - Dynamic goals management
   - Team assignment
   - Live preview panel

3. **FigmaUIKit** - Reusable UI utilities
   - 11+ reusable components
   - Custom hooks (useModal)
   - Styled form elements
   - Badge and avatar components
   - Toast notifications

### Documentation

- **FIGMA_IMPLEMENTATION_GUIDE.md** - Detailed implementation guide with API integration examples
- **TAILWIND_CONFIG_GUIDE.md** - Tailwind CSS setup and customization
- **FIGMA_IMPLEMENTATION_QUICK_START.md** - Quick reference guide

### Examples

- **DashboardExample.jsx** - Complete working example page

## 🚀 Installation

### 1. Install Dependencies
```bash
npm install lucide-react
```

### 2. Ensure Tailwind CSS is Configured
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Update your `tailwind.config.js` to include component files:
```js
content: ["./src/**/*.{js,jsx,ts,tsx}"]
```

## 💻 Basic Usage

### Import Components
```jsx
import FigmaCreateTaskModal from './components/FigmaCreateTaskModal';
import FigmaCreateProjectModal from './components/FigmaCreateProjectModal';
import { useModal, Button, Toast } from './components/FigmaUIKit';
```

### Create Task Modal Example
```jsx
import { useState } from 'react';
import FigmaCreateTaskModal from './components/FigmaCreateTaskModal';

export default function App() {
  const [showModal, setShowModal] = useState(false);

  const handleTaskSubmit = (taskData) => {
    console.log('Task created:', taskData);
    // Send to your API
    setShowModal(false);
  };

  return (
    <>
      <button onClick={() => setShowModal(true)}>
        + Create Task
      </button>
      
      <FigmaCreateTaskModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleTaskSubmit}
      />
    </>
  );
}
```

### Using Custom Hooks
```jsx
import { useModal } from './components/FigmaUIKit';

export default function Dashboard() {
  const taskModal = useModal();
  const projectModal = useModal();

  return (
    <>
      <button onClick={taskModal.open}>New Task</button>
      <button onClick={projectModal.open}>New Project</button>
      
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
    </>
  );
}
```

## 📊 Component Data Structure

### TaskData
```typescript
{
  project: string;           // Selected project ID
  assignTo: string[];        // Array of user IDs
  taskName: string;          // Task title
  description: string;       // Task description
  status: string;           // 'Planned' | 'In Progress' | 'Completed'
  priority: string;         // 'Low' | 'Medium' | 'High'
  startDate: string;        // ISO date string
  dueDate: string;          // ISO date string
  links: string[];          // Array of URLs
  isRecurring: boolean;     // Recurring task flag
}
```

### ProjectData
```typescript
{
  projectName: string;      // Project title
  description: string;      // Project description
  category: string;         // Project category
  projectGoals: Array<{     // List of goals
    id: number;
    text: string;
  }>;
  team: string;            // Selected team ID
  teamMembers: string[];   // Array of user IDs
}
```

## 🎨 Customization

### Change Primary Color
Edit `tailwind.config.js`:
```js
extend: {
  colors: {
    primary: {
      500: '#3b82f6',  // Your color
      600: '#2563eb',  // Darker shade
    }
  }
}
```

### Modify Modal Styling
Each component uses standard Tailwind classes that you can override:
```jsx
// Update className in the component or extend with CSS
<div className="bg-blue-600 hover:bg-blue-700 transition">
```

### Add Custom Validation
```jsx
const [errors, setErrors] = useState({});

const validateForm = (data) => {
  const newErrors = {};
  if (!data.taskName) newErrors.taskName = 'Task name required';
  return newErrors;
};

const handleSubmit = (data) => {
  const newErrors = validateForm(data);
  if (Object.keys(newErrors).length > 0) {
    setErrors(newErrors);
    return;
  }
  // Process valid form
};
```

## 🔌 API Integration

### Task API Example
```jsx
const handleTaskSubmit = async (taskData) => {
  try {
    const token = localStorage.getItem('token');
    
    const response = await fetch('http://localhost:8000/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: taskData.taskName,
        description: taskData.description,
        project_id: taskData.project,
        assigned_users: taskData.assignTo,
        status: taskData.status,
        priority: taskData.priority,
        start_date: taskData.startDate,
        due_date: taskData.dueDate,
        is_recurring: taskData.isRecurring,
      }),
    });

    if (!response.ok) throw new Error('Failed to create task');
    
    const result = await response.json();
    console.log('Task created:', result);
    
  } catch (error) {
    console.error('Error:', error);
  }
};
```

### Project API Example
```jsx
const handleProjectSubmit = async (projectData) => {
  try {
    const token = localStorage.getItem('token');
    
    const response = await fetch('http://localhost:8000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: projectData.projectName,
        description: projectData.description,
        category: projectData.category,
        goals: projectData.projectGoals.map(g => g.text),
        team_id: projectData.team,
        assigned_users: projectData.teamMembers,
      }),
    });

    if (!response.ok) throw new Error('Failed to create project');
    
    const result = await response.json();
    console.log('Project created:', result);
    
  } catch (error) {
    console.error('Error:', error);
  }
};
```

## 🎁 UI Kit Components

### useModal Hook
```jsx
const modal = useModal();
modal.open();   // Open modal
modal.close();  // Close modal
modal.toggle(); // Toggle modal
```

### Badges
```jsx
<StatusBadge status="In Progress" />
<PriorityBadge priority="High" />
<Badge label="Important" variant="danger" />
```

### Form Components
```jsx
<FormInput
  label="Task Name"
  name="taskName"
  value={taskName}
  onChange={handleChange}
  error={errors.taskName}
  required
/>

<FormSelect
  label="Status"
  name="status"
  value={status}
  onChange={handleChange}
  options={[
    { label: 'Planned', value: 'planned' },
    { label: 'In Progress', value: 'in_progress' },
  ]}
/>

<FormTextarea
  label="Description"
  name="description"
  value={description}
  onChange={handleChange}
  rows={4}
/>
```

### Utilities
```jsx
<UserAvatar name="John Doe" size="md" color="bg-blue-500" />
<Button variant="primary" onClick={handleClick}>Save</Button>
<Toast message="Success!" type="success" />
<LoadingSpinner size="md" />
<ConfirmationDialog
  isOpen={isOpen}
  title="Delete item?"
  onConfirm={handleDelete}
  variant="danger"
/>
```

## 📱 Responsive Design

All components are fully responsive:
- **Mobile (< 640px)**: Single column layout
- **Tablet (640px - 1024px)**: 2 column layout
- **Desktop (> 1024px)**: 3 column layout

Example:
```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* Content */}
</div>
```

## ♿ Accessibility

Components include:
- ✅ Semantic HTML structure
- ✅ ARIA labels and roles
- ✅ Keyboard navigation support
- ✅ Focus management
- ✅ Color contrast compliance
- ✅ Screen reader friendly

## 🧪 Testing Example

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import FigmaCreateTaskModal from './FigmaCreateTaskModal';

describe('FigmaCreateTaskModal', () => {
  it('renders modal when open', () => {
    render(
      <FigmaCreateTaskModal
        isOpen={true}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Create New Task')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const handleClose = jest.fn();
    render(
      <FigmaCreateTaskModal
        isOpen={true}
        onClose={handleClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(handleClose).toHaveBeenCalled();
  });
});
```

## 📚 File Structure
```
project/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── FigmaCreateTaskModal.jsx      ✨ Main task modal
│   │   │   ├── FigmaCreateProjectModal.jsx   ✨ Main project modal
│   │   │   ├── FigmaUIKit.jsx               ✨ Utility components
│   │   │   ├── FIGMA_IMPLEMENTATION_GUIDE.md 📖 Detailed guide
│   │   │   └── [existing components]
│   │   ├── pages/
│   │   │   ├── DashboardExample.jsx          📋 Example page
│   │   │   └── [other pages]
│   │   └── [other files]
│   ├── TAILWIND_CONFIG_GUIDE.md              🎨 Tailwind setup
│   └── [config files]
├── FIGMA_IMPLEMENTATION_QUICK_START.md       📖 Quick reference
└── [root files]
```

## 🔍 Key Features

- 🎯 **100% Figma Accurate** - Pixel-perfect implementation
- 🎨 **Tailwind CSS** - No CSS files, pure Tailwind classes
- ⚡ **Performance** - Optimized with React.memo and lazy loading
- 🔒 **Type-Safe** - Proper prop validation
- 📱 **Responsive** - Mobile, tablet, and desktop ready
- ♿ **Accessible** - WCAG 2.1 compliant
- 🧩 **Modular** - Easy to customize and extend
- 📚 **Well Documented** - Comprehensive guides and examples

## 🐛 Troubleshooting

### Styles not showing?
1. Check Tailwind CSS is installed: `npm list tailwindcss`
2. Verify `tailwind.config.js` includes component paths
3. Restart dev server: `npm run dev`
4. Clear cache: `Ctrl+Shift+Delete`

### Icons not displaying?
1. Install lucide-react: `npm install lucide-react`
2. Check imports are correct
3. Verify component is rendering

### Modal not visible?
1. Check `isOpen` prop is `true`
2. Verify z-index is set correctly (should be 50)
3. Check for conflicting CSS

## 📈 Performance Tips

1. **Lazy load modals** when not immediately needed
2. **Memoize components** to prevent unnecessary re-renders
3. **Debounce** rapid state changes
4. **Code split** large modals with React.lazy()

## 🤝 Integration Checklist

- [ ] Install lucide-react
- [ ] Configure Tailwind CSS
- [ ] Import components
- [ ] Add modal state management
- [ ] Implement API calls
- [ ] Add error handling
- [ ] Test on mobile
- [ ] Test accessibility
- [ ] Deploy to production

## 📖 Additional Resources

- [Figma Design File](https://www.figma.com/design/oaBtFxdOGWH1MuzdakOZTx/PMS-TechXaro-web-redesign)
- [React Documentation](https://react.dev)
- [Tailwind CSS Docs](https://tailwindcss.com)
- [lucide-react Icons](https://lucide.dev)
- [Web Accessibility](https://www.w3.org/WAI/)

## 📝 License

These components are provided as-is for use in your PMS project.

## 🎉 Get Started Now!

1. Copy the component files to your project
2. Install dependencies
3. Import and use in your pages
4. Customize as needed
5. Connect to your API

**Happy coding!** 🚀

---

**Version**: 1.0.0  
**Last Updated**: May 15, 2026  
**Figma Design**: PMS TechXaro web redesign  
**Framework**: React + Tailwind CSS

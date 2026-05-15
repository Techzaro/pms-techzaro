# Figma Design to React Components - Quick Reference

## 📋 Project Overview

This guide documents the conversion of the Figma PMS TechXaro web redesign into React components using Tailwind CSS.

**Figma File**: https://www.figma.com/design/oaBtFxdOGWH1MuzdakOZTx/PMS-TechXaro-web-redesign
**Node ID**: 413-1217 (Final page design - Create New Task Modal)

## 🎯 What's Been Created

### 1. **FigmaCreateTaskModal.jsx**
   - Location: `frontend/src/components/FigmaCreateTaskModal.jsx`
   - Features:
     - Project selection dropdown
     - Multi-user assignment
     - Task name & description fields
     - Status selector (Planned, In Progress, Completed)
     - Priority selector (Low, Medium, High)
     - Date range picker (Start & Due date)
     - Attachment/Link management system
     - Recurring task checkbox
   - Styling: 100% Tailwind CSS
   - State Management: React hooks (useState)

### 2. **FigmaCreateProjectModal.jsx**
   - Location: `frontend/src/components/FigmaCreateProjectModal.jsx`
   - Features:
     - Project name & description
     - Category selector
     - Dynamic project goals management
     - Team and team members selection
     - Live project preview panel
   - Styling: 100% Tailwind CSS
   - State Management: React hooks (useState)

### 3. **FigmaUIKit.jsx**
   - Location: `frontend/src/components/FigmaUIKit.jsx`
   - Reusable UI Components:
     - `useModal` - Modal state hook
     - `StatusBadge` - Task status display
     - `PriorityBadge` - Task priority display
     - `UserAvatar` - User profile circles with initials
     - `FormInput` - Reusable input field
     - `FormSelect` - Reusable select dropdown
     - `FormTextarea` - Reusable textarea
     - `ConfirmationDialog` - Confirmation modal
     - `Toast` - Toast notifications
     - `LoadingSpinner` - Loading indicator
     - `Button` - Reusable button component
     - `Card` - Card container
     - `Badge` - Label badges

### 4. **Documentation Files**
   - `FIGMA_IMPLEMENTATION_GUIDE.md` - Comprehensive implementation guide
   - `TAILWIND_CONFIG_GUIDE.md` - Tailwind CSS configuration guide
   - `QUICK_START.md` - This file

### 5. **Example Implementation**
   - `pages/DashboardExample.jsx` - Complete example page using all components

## 🚀 Quick Start

### Step 1: Install Dependencies
```bash
npm install lucide-react
```

### Step 2: Import Components
```jsx
import FigmaCreateTaskModal from './components/FigmaCreateTaskModal';
import FigmaCreateProjectModal from './components/FigmaCreateProjectModal';
import { useModal, StatusBadge, Button } from './components/FigmaUIKit';
```

### Step 3: Use in Your Component
```jsx
function Dashboard() {
  const taskModal = useModal();
  
  const handleTaskSubmit = (taskData) => {
    console.log('Task data:', taskData);
    // Send to API
  };
  
  return (
    <>
      <Button onClick={taskModal.open}>Create Task</Button>
      
      <FigmaCreateTaskModal
        isOpen={taskModal.isOpen}
        onClose={taskModal.close}
        onSubmit={handleTaskSubmit}
      />
    </>
  );
}
```

## 📱 Component Props

### FigmaCreateTaskModal
```typescript
interface Props {
  isOpen: boolean;              // Modal visibility
  onClose: () => void;          // Close handler
  onSubmit?: (data: TaskData) => void;  // Submit handler
}

interface TaskData {
  project: string;
  assignTo: string[];
  taskName: string;
  description: string;
  status: 'Planned' | 'In Progress' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  startDate: string;
  dueDate: string;
  links: string[];
  isRecurring: boolean;
}
```

### FigmaCreateProjectModal
```typescript
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: ProjectData) => void;
}

interface ProjectData {
  projectName: string;
  description: string;
  category: string;
  projectGoals: Array<{id: number; text: string}>;
  team: string;
  teamMembers: string[];
}
```

## 🎨 Key Features

### Design Consistency
- ✅ Matches Figma design pixel-perfect
- ✅ Responsive on all screen sizes
- ✅ Proper spacing & typography
- ✅ Color-coded status & priority

### Developer Experience
- ✅ Type-safe with proper interfaces
- ✅ Reusable utility components
- ✅ Easy API integration
- ✅ Customizable via props

### Accessibility
- ✅ Semantic HTML
- ✅ ARIA labels
- ✅ Keyboard navigation
- ✅ Focus management

## 🔄 Integration Steps

### With Your Existing API

1. **Identify API endpoints**
   - GET `/api/projects` - Fetch projects
   - GET `/api/users` - Fetch users
   - POST `/api/tasks` - Create task
   - POST `/api/projects` - Create project

2. **Update component handlers**
   ```jsx
   const handleTaskSubmit = async (taskData) => {
     const response = await fetch('/api/tasks', {
       method: 'POST',
       headers: { 'Authorization': `Bearer ${token}` },
       body: JSON.stringify({
         title: taskData.taskName,
         description: taskData.description,
         // ... map other fields
       })
     });
   };
   ```

3. **Add loading states**
   ```jsx
   const [loading, setLoading] = useState(false);
   
   const handleSubmit = async (data) => {
     setLoading(true);
     try {
       // API call
     } finally {
       setLoading(false);
     }
   };
   ```

## 📦 File Structure
```
frontend/
├── src/
│   ├── components/
│   │   ├── FigmaCreateTaskModal.jsx
│   │   ├── FigmaCreateProjectModal.jsx
│   │   ├── FigmaUIKit.jsx
│   │   ├── FIGMA_IMPLEMENTATION_GUIDE.md
│   │   └── [existing components]
│   ├── pages/
│   │   ├── DashboardExample.jsx
│   │   └── [other pages]
│   └── [other directories]
├── TAILWIND_CONFIG_GUIDE.md
└── [config files]
```

## 💡 Common Usage Patterns

### Pattern 1: Simple Modal
```jsx
const [isOpen, setIsOpen] = useState(false);

<FigmaCreateTaskModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  onSubmit={handleSubmit}
/>
```

### Pattern 2: With Hook
```jsx
const modal = useModal();

<Button onClick={modal.open}>New Task</Button>
<FigmaCreateTaskModal
  isOpen={modal.isOpen}
  onClose={modal.close}
  onSubmit={modal.toggle}
/>
```

### Pattern 3: With Notifications
```jsx
const [toast, setToast] = useState(null);

const handleSubmit = async (data) => {
  try {
    await api.create(data);
    setToast({ message: 'Success!', type: 'success' });
  } catch (err) {
    setToast({ message: err.message, type: 'error' });
  }
};

{toast && <Toast {...toast} />}
```

## 🎯 Customization Options

### Change Colors
Edit `tailwind.config.js`:
```js
theme: {
  extend: {
    colors: {
      primary: '#5B21B6', // Your brand color
    }
  }
}
```

### Change Border Radius
```jsx
// Update className in components
className="rounded-xl" // Instead of rounded-lg
```

### Add Your Logo
```jsx
// In modal header
<div className="w-12 h-12 bg-blue-500 rounded-lg">
  <YourLogo /> {/* Your logo here */}
</div>
```

## 🧪 Testing

### Component Testing
```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import FigmaCreateTaskModal from './FigmaCreateTaskModal';

test('renders modal when open', () => {
  render(<FigmaCreateTaskModal isOpen={true} onClose={() => {}} />);
  expect(screen.getByText('Create New Task')).toBeInTheDocument();
});
```

## ⚡ Performance Optimization

1. **Lazy Load Modals**
   ```jsx
   const FigmaCreateTaskModal = lazy(() => import('./FigmaCreateTaskModal'));
   ```

2. **Memoize Components**
   ```jsx
   export default React.memo(FigmaCreateTaskModal);
   ```

3. **Debounce Events**
   ```jsx
   const debouncedChange = debounce(handleChange, 300);
   ```

## 📚 Related Documentation

- [FIGMA_IMPLEMENTATION_GUIDE.md](./src/components/FIGMA_IMPLEMENTATION_GUIDE.md) - Detailed implementation guide
- [TAILWIND_CONFIG_GUIDE.md](./TAILWIND_CONFIG_GUIDE.md) - Tailwind configuration reference
- [DashboardExample.jsx](./src/pages/DashboardExample.jsx) - Complete working example

## 🔗 Resources

- [Figma Design File](https://www.figma.com/design/oaBtFxdOGWH1MuzdakOZTx/PMS-TechXaro-web-redesign)
- [React Hooks Documentation](https://react.dev/reference/react)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [lucide-react Icons](https://lucide.dev/)

## ❓ FAQ

**Q: Can I use these components with Next.js?**
A: Yes! These are standard React components that work with Next.js.

**Q: Do I need Redux/Context for state management?**
A: No, the components use React hooks internally. Use Context/Redux if you need global state.

**Q: How do I customize the styling?**
A: All styling is done with Tailwind classes, easily customizable by editing class names.

**Q: Are these mobile responsive?**
A: Yes, all components are fully responsive using Tailwind's responsive utilities.

**Q: Can I integrate with my existing forms?**
A: Yes, the components are self-contained but you can integrate them with form libraries like React Hook Form.

## 📞 Support

For issues or questions:
1. Check the implementation guide
2. Review the example page
3. Refer to Tailwind CSS documentation
4. Check the Figma design file

## 📝 Changelog

- **v1.0** (2026-05-15)
  - Initial release
  - FigmaCreateTaskModal component
  - FigmaCreateProjectModal component
  - FigmaUIKit utilities
  - Documentation

---

**Last Updated**: May 15, 2026
**Version**: 1.0.0
**Figma Version**: Latest (node-id: 413-1217)

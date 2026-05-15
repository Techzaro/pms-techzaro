# Tailwind CSS Configuration for Figma Design System

This file contains recommended Tailwind CSS configuration to support the Figma design components.

## Installation

If you haven't installed Tailwind CSS yet:

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

## Recommended tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',  // Primary blue
          600: '#2563eb',  // Darker blue
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        
        // Status colors
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
        },
        
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#eab308',
          600: '#ca8a04',
        },
        
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
        },
        
        // Neutral colors (for borders, backgrounds)
        neutral: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
        },
      },
      
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
      },
      
      spacing: {
        // Custom spacing for consistent design
        0: '0',
        0.5: '0.125rem',
        1: '0.25rem',
        1.5: '0.375rem',
        2: '0.5rem',
        2.5: '0.625rem',
        3: '0.75rem',
        3.5: '0.875rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        7: '1.75rem',
        8: '2rem',
        9: '2.25rem',
        10: '2.5rem',
        12: '3rem',
        14: '3.5rem',
        16: '4rem',
        20: '5rem',
        24: '6rem',
        28: '7rem',
        32: '8rem',
        36: '9rem',
        40: '10rem',
        44: '11rem',
        48: '12rem',
        52: '13rem',
        56: '14rem',
        60: '15rem',
        64: '16rem',
        72: '18rem',
        80: '20rem',
        96: '24rem',
      },
      
      borderRadius: {
        none: '0',
        sm: '0.375rem',
        base: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        '2xl': '2rem',
        '3xl': '2.5rem',
        full: '9999px',
      },
      
      boxShadow: {
        none: 'none',
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        base: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      },
      
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'fade-in-up': 'fadeInUp 0.3s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-in-out',
        'pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin': 'spin 1s linear infinite',
      },
      
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      
      transitionDuration: {
        75: '75ms',
        100: '100ms',
        150: '150ms',
        200: '200ms',
        300: '300ms',
        500: '500ms',
        700: '700ms',
        1000: '1000ms',
      },
      
      // Z-index layers
      zIndex: {
        hide: '-1',
        auto: 'auto',
        0: '0',
        10: '10',
        20: '20',
        30: '30',
        40: '40',
        50: '50',
        dropdown: '1000',
        sticky: '1100',
        fixed: '1200',
        modal: '1300',
        popover: '1400',
        tooltip: '1500',
      },
    },
  },
  
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
```

## Custom CSS Utilities

Add these custom utilities to your `globals.css` or `tailwind.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom Components */
@layer components {
  /* Cards */
  .card {
    @apply bg-white border border-gray-200 rounded-lg shadow-sm;
  }
  
  .card-lg {
    @apply card shadow-md;
  }
  
  /* Buttons */
  .btn-primary {
    @apply px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition;
  }
  
  .btn-secondary {
    @apply px-4 py-2.5 bg-white border border-gray-300 text-gray-900 rounded-lg font-medium hover:bg-gray-50 transition;
  }
  
  .btn-sm {
    @apply px-3 py-1.5 text-sm;
  }
  
  /* Form Elements */
  .form-input {
    @apply w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white transition;
  }
  
  .form-input-error {
    @apply border-red-500 focus:border-red-500;
  }
  
  .form-label {
    @apply block text-sm font-semibold text-gray-900 mb-2;
  }
  
  .form-group {
    @apply space-y-2;
  }
  
  /* Badges */
  .badge {
    @apply inline-block px-2.5 py-1 rounded-full text-xs font-medium;
  }
  
  .badge-primary {
    @apply badge bg-blue-100 text-blue-800;
  }
  
  .badge-success {
    @apply badge bg-green-100 text-green-800;
  }
  
  .badge-warning {
    @apply badge bg-yellow-100 text-yellow-800;
  }
  
  .badge-danger {
    @apply badge bg-red-100 text-red-800;
  }
  
  /* Grid */
  .grid-auto-fit {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }
  
  /* Text */
  .text-truncate {
    @apply overflow-hidden text-ellipsis whitespace-nowrap;
  }
  
  .text-gradient {
    @apply bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent;
  }
}

/* Custom Utilities */
@layer utilities {
  .flex-center {
    @apply flex items-center justify-center;
  }
  
  .flex-between {
    @apply flex items-center justify-between;
  }
  
  .gap-gutter {
    @apply gap-6;
  }
  
  .transitions-smooth {
    @apply transition-all duration-200 ease-in-out;
  }
  
  .focus-ring {
    @apply focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
  }
  
  .glass-effect {
    @apply bg-white/80 backdrop-blur-md border border-white/20;
  }
}

/* Scrollbar Styling */
@layer utilities {
  .scrollbar-hidden {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  
  .scrollbar-hidden::-webkit-scrollbar {
    display: none;
  }
  
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: rgb(209 213 219) transparent;
  }
  
  .scrollbar-thin::-webkit-scrollbar {
    width: 6px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background-color: rgb(209 213 219);
    border-radius: 3px;
  }
}

/* Dark Mode Support (Optional) */
@media (prefers-color-scheme: dark) {
  .card {
    @apply bg-gray-900 border-gray-800;
  }
  
  .form-input {
    @apply bg-gray-800 text-gray-100 border-gray-700 focus:bg-gray-900;
  }
}
```

## PostCSS Configuration

Your `postcss.config.js` should look like:

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

## Usage Examples

### Using Custom Components

```jsx
// Button
<button className="btn-primary">Click me</button>
<button className="btn-secondary btn-sm">Small button</button>

// Forms
<input type="text" className="form-input" placeholder="Enter text..." />
<input type="text" className="form-input form-input-error" />

// Cards
<div className="card">
  <p>Card content</p>
</div>

<div className="card-lg">
  <p>Large card with more shadow</p>
</div>

// Badges
<span className="badge-primary">Primary</span>
<span className="badge-success">Success</span>

// Utilities
<div className="flex-center">
  Centered content
</div>

<div className="flex-between">
  <span>Left</span>
  <span>Right</span>
</div>
```

## Responsive Design Breakpoints

The default Tailwind breakpoints work well with our design:

- `sm`: 640px (small phones)
- `md`: 768px (tablets)
- `lg`: 1024px (desktops)
- `xl`: 1280px (large screens)
- `2xl`: 1536px (extra large)

### Example Responsive Grid

```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* Items */}
</div>
```

## Performance Tips

1. **Purge unused styles**: Tailwind automatically purges unused CSS in production
2. **Use CSS layers**: Organize styles with `@layer` directives
3. **Minimize custom CSS**: Prefer Tailwind utilities over custom CSS
4. **Use arbitrary values** when needed: `w-[500px]`, `text-[#1e3a8a]`

## Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support (iOS 12+)
- IE11: ❌ Not supported

## Troubleshooting

### Styles not appearing
1. Check that content paths in `tailwind.config.js` include your component files
2. Restart your dev server after config changes
3. Clear browser cache (`Ctrl+Shift+Delete`)

### Class conflicts
- Use the CSS specificity rules or `!important` as last resort
- Organize classes logically for easier debugging

### Large bundle size
- Ensure Tailwind is set to purge unused styles
- Use component classes instead of inline utilities when possible

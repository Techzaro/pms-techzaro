/**
 * @file main.jsx
 * @description React application bootstrap file.
 * Mounts the root App component into the global providers
 * and sets up a fetch interceptor for automatic cache invalidation.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import 'bootstrap/dist/css/bootstrap.min.css';
// Keep application/Tailwind styles after Bootstrap so utility classes win.
import './index.css'
import { LoadingProvider } from './context/LoadingContext.jsx'
import { NotificationProvider } from './context/NotificationContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { PersonalizationProvider } from './context/PersonalizationContext.jsx'
import LoadingSpinner from './components/LoadingSpinner.jsx'
import ToastContainer from './components/Toast.jsx'
import { queryClient } from './lib/queryClient.js'
import { publish } from './utils/eventBus.js'

// Scoped fetch interceptor — only invalidate related query keys, not ALL queries
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const response = await originalFetch.apply(window, args);
  if (response.ok) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    const options = args[1] || {};
    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (url && (
        url.includes('/tasks') ||
        url.includes('/projects') ||
        url.includes('/deliverables') ||
        url.includes('/events') ||
        url.includes('/deliveries')
      )) {
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['activities'] });
        window.dispatchEvent(new CustomEvent('calendar-sync'));
        publish('data:changed', { url, method });
      } else if (url && url.includes('/teams')) {
        queryClient.invalidateQueries({ queryKey: ['teams'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        publish('data:changed', { url, method });
      } else if (url && url.includes('/notifications')) {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        publish('data:changed', { url, method });
      } else if (url && url.includes('/users')) {
        queryClient.invalidateQueries({ queryKey: ['users'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        publish('data:changed', { url, method });
      }
    }
  }
  return response;
};

// Render the application with providers
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <NotificationProvider>
          <LoadingProvider>
            <PersonalizationProvider>
              <LoadingSpinner />
              <ToastContainer />
              <App />
            </PersonalizationProvider>
          </LoadingProvider>
        </NotificationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)

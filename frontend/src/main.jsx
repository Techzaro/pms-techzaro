/**
 * @file main.jsx
 * @description React application bootstrap file.
 * Mounts the root App component into the DOM with global providers
 * and sets up a fetch interceptor for automatic cache invalidation.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import './index.css'
import 'bootstrap/dist/css/bootstrap.min.css';
import { LoadingProvider } from './context/LoadingContext.jsx'
import { NotificationProvider } from './context/NotificationContext.jsx'
import LoadingSpinner from './components/LoadingSpinner.jsx'
import ToastContainer from './components/Toast.jsx'
import { queryClient } from './lib/queryClient.js'

// Global fetch interceptor for automatic cache invalidation on mutations
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const response = await originalFetch.apply(window, args);
  if (response.ok) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    const options = args[1] || {};
    const method = (options.method || 'GET').toUpperCase();
    // Invalidate all queries on write operations
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      queryClient.invalidateQueries();
      // Trigger calendar sync for relevant endpoints
      if (url && (
        url.includes('/tasks') || 
        url.includes('/projects') || 
        url.includes('/deliverables') || 
        url.includes('/events') ||
        url.includes('/deliveries')
      )) {
        window.dispatchEvent(new CustomEvent('calendar-sync'));
      }
    }
  }
  return response;
};

// Render the application with providers
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <LoadingProvider>
          <LoadingSpinner />
          <ToastContainer />
          <App />
        </LoadingProvider>
      </NotificationProvider>
    </QueryClientProvider>
  </StrictMode>,
)

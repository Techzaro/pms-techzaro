/**
 * React application bootstrap file.
 * Mounts the root App component into the DOM.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import './index.css'
import 'bootstrap/dist/css/bootstrap.min.css';
import { LoadingProvider } from './context/LoadingContext.jsx'
import LoadingSpinner from './components/LoadingSpinner.jsx'
import { queryClient } from './lib/queryClient.js'

const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const response = await originalFetch.apply(window, args);
  if (response.ok) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    const options = args[1] || {};
    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      queryClient.invalidateQueries();
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LoadingProvider>
        <LoadingSpinner />
        <App />
      </LoadingProvider>
    </QueryClientProvider>
  </StrictMode>,
)

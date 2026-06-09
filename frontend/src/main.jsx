/**
 * React application bootstrap file.
 * Mounts the root App component into the DOM.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import 'bootstrap/dist/css/bootstrap.min.css';
import { LoadingProvider } from './context/LoadingContext.jsx'
import LoadingSpinner from './components/LoadingSpinner.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LoadingProvider>
      <LoadingSpinner />
      <App />
    </LoadingProvider>
  </StrictMode>,
)

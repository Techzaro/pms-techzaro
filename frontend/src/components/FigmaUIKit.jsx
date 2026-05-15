import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

/**
 * Modal Hook - Manages modal state
 */
export function useModal(initialState = false) {
  const [isOpen, setIsOpen] = useState(initialState);
  
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  const toggle = () => setIsOpen(prev => !prev);
  
  return { isOpen, open, close, toggle };
}

/**
 * StatusBadge Component - Display task/project status with color coding
 */
export function StatusBadge({ status }) {
  const statusConfig = {
    'Planned': { color: 'bg-blue-100', textColor: 'text-blue-800', dot: 'bg-blue-500' },
    'In Progress': { color: 'bg-yellow-100', textColor: 'text-yellow-800', dot: 'bg-yellow-500' },
    'Completed': { color: 'bg-green-100', textColor: 'text-green-800', dot: 'bg-green-500' },
    'Abandoned': { color: 'bg-red-100', textColor: 'text-red-800', dot: 'bg-red-500' },
  };

  const config = statusConfig[status] || statusConfig['Planned'];

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${config.color}`}>
      <div className={`w-2 h-2 rounded-full ${config.dot}`}></div>
      <span className={`text-xs font-medium ${config.textColor}`}>{status}</span>
    </div>
  );
}

/**
 * PriorityBadge Component - Display task priority with color coding
 */
export function PriorityBadge({ priority }) {
  const priorityConfig = {
    'Low': { color: 'bg-blue-100', textColor: 'text-blue-800', dot: 'bg-blue-500' },
    'Medium': { color: 'bg-yellow-100', textColor: 'text-yellow-800', dot: 'bg-yellow-500' },
    'High': { color: 'bg-red-100', textColor: 'text-red-800', dot: 'bg-red-500' },
  };

  const config = priorityConfig[priority] || priorityConfig['Medium'];

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${config.color}`}>
      <div className={`w-2 h-2 rounded-full ${config.dot}`}></div>
      <span className={`text-xs font-medium ${config.textColor}`}>{priority}</span>
    </div>
  );
}

/**
 * UserAvatar Component - Display user initials in a colored circle
 */
export function UserAvatar({ name, size = 'md', color = 'bg-blue-500' }) {
  const sizeConfig = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
    xl: 'w-12 h-12 text-lg',
  };

  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase();

  return (
    <div className={`${sizeConfig[size]} ${color} rounded-full flex items-center justify-center text-white font-semibold`}>
      {initials}
    </div>
  );
}

/**
 * FormInput Component - Reusable form input with label and error handling
 */
export function FormInput({
  label,
  name,
  value,
  onChange,
  error,
  required = false,
  type = 'text',
  placeholder = '',
  disabled = false,
}) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-4 py-2.5 border rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white transition ${
          error
            ? 'border-red-500 focus:border-red-500'
            : 'border-gray-200 focus:border-blue-500'
        } ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

/**
 * FormSelect Component - Reusable form select with label and error handling
 */
export function FormSelect({
  label,
  name,
  value,
  onChange,
  options = [],
  error,
  required = false,
  disabled = false,
  placeholder = 'Select an option',
}) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full px-4 py-2.5 border rounded-lg bg-gray-50 text-gray-700 focus:outline-none focus:bg-white transition appearance-none cursor-pointer ${
          error
            ? 'border-red-500 focus:border-red-500'
            : 'border-gray-200 focus:border-blue-500'
        } ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
      >
        <option value="">{placeholder}</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

/**
 * FormTextarea Component - Reusable textarea with label and error handling
 */
export function FormTextarea({
  label,
  name,
  value,
  onChange,
  error,
  required = false,
  placeholder = '',
  rows = 4,
  disabled = false,
}) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={`w-full px-4 py-2.5 border rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white transition resize-none ${
          error
            ? 'border-red-500 focus:border-red-500'
            : 'border-gray-200 focus:border-blue-500'
        } ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

/**
 * ConfirmationDialog Component - Reusable confirmation dialog
 */
export function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'warning', // 'warning', 'danger', 'success'
}) {
  if (!isOpen) return null;

  const variantConfig = {
    warning: { bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200', buttonColor: 'bg-yellow-600 hover:bg-yellow-700' },
    danger: { bgColor: 'bg-red-50', borderColor: 'border-red-200', buttonColor: 'bg-red-600 hover:bg-red-700' },
    success: { bgColor: 'bg-green-50', borderColor: 'border-green-200', buttonColor: 'bg-green-600 hover:bg-green-700' },
  };

  const config = variantConfig[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={`bg-white rounded-lg shadow-lg max-w-sm w-full mx-4 border ${config.borderColor}`}>
        <div className={`p-6 ${config.bgColor}`}>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600 mt-2">{message}</p>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-50 transition font-medium text-sm"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg transition font-medium text-sm ${config.buttonColor}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Toast Notification Component
 */
export function Toast({ message, type = 'success', duration = 3000 }) {
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!isVisible) return null;

  const typeConfig = {
    success: { bgColor: 'bg-green-50', borderColor: 'border-green-200', icon: Check, iconColor: 'text-green-600', textColor: 'text-green-800' },
    error: { bgColor: 'bg-red-50', borderColor: 'border-red-200', icon: X, iconColor: 'text-red-600', textColor: 'text-red-800' },
    warning: { bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200', icon: Check, iconColor: 'text-yellow-600', textColor: 'text-yellow-800' },
    info: { bgColor: 'bg-blue-50', borderColor: 'border-blue-200', icon: Check, iconColor: 'text-blue-600', textColor: 'text-blue-800' },
  };

  const config = typeConfig[type];
  const IconComponent = config.icon;

  return (
    <div className={`fixed bottom-4 right-4 max-w-sm ${config.bgColor} border ${config.borderColor} rounded-lg p-4 shadow-lg flex items-center gap-3 z-50 animate-fade-in-up`}>
      <IconComponent size={20} className={config.iconColor} />
      <span className={`text-sm font-medium ${config.textColor}`}>{message}</span>
    </div>
  );
}

/**
 * Loading Spinner Component
 */
export function LoadingSpinner({ size = 'md' }) {
  const sizeConfig = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div className={`${sizeConfig[size]} border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin`}></div>
  );
}

/**
 * Button Component - Reusable button with variants
 */
export function Button({
  children,
  variant = 'primary', // 'primary', 'secondary', 'danger', 'success'
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
  ...props
}) {
  const variantConfig = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-white border border-gray-300 text-gray-900 hover:bg-gray-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-green-600 text-white hover:bg-green-700',
  };

  const sizeConfig = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`rounded-lg font-medium transition flex items-center gap-2 justify-center ${variantConfig[variant]} ${sizeConfig[size]} ${
        disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
      {...props}
    >
      {loading && <LoadingSpinner size="sm" />}
      {children}
    </button>
  );
}

/**
 * Card Component - Reusable card container
 */
export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition p-4 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Badge Component - Display labels with color variants
 */
export function Badge({ label, variant = 'default' }) {
  const variantConfig = {
    default: 'bg-gray-100 text-gray-800',
    primary: 'bg-blue-100 text-blue-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${variantConfig[variant]}`}>
      {label}
    </span>
  );
}

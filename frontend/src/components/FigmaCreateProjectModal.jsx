import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

/**
 * FigmaCreateProjectModal - Create Project Modal Component based on Figma Design
 * Uses Tailwind CSS for styling to match the Figma design
 */
export default function FigmaCreateProjectModal({ isOpen, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    projectName: '',
    description: '',
    category: 'Web Development',
    projectGoals: [],
    team: '',
    teamMembers: [],
  });

  const [goals, setGoals] = useState([]);
  const [newGoal, setNewGoal] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddGoal = () => {
    if (newGoal.trim()) {
      setGoals([...goals, { id: Date.now(), text: newGoal }]);
      setNewGoal('');
    }
  };

  const handleRemoveGoal = (id) => {
    setGoals(goals.filter(goal => goal.id !== id));
  };

  const handleCreateProject = (e) => {
    e.preventDefault();
    if (onSubmit) {
      onSubmit({ ...formData, projectGoals: goals });
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-3xl w-full max-w-6xl max-h-[90vh] overflow-auto shadow-2xl">
        
        {/* Header */}
        <div className="sticky top-0 flex items-start justify-between p-6 border-b border-gray-200 bg-white">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center shadow-md">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="pt-1">
              <h2 className="text-2xl font-bold text-gray-900">Create New Project</h2>
              <p className="text-sm text-gray-500 mt-1">Add project details and assign it to team members.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition p-2"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleCreateProject} className="p-6">
          <div className="grid grid-cols-3 gap-6">
            
            {/* Left Section - Main Form */}
            <div className="col-span-2 space-y-6">
              
              {/* Project Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="projectName"
                  value={formData.projectName}
                  onChange={handleInputChange}
                  placeholder="Enter Project name.."
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Enter project description.."
                  rows="4"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white transition resize-none"
                />
              </div>

              {/* Category & Project Goals Input */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Category (Optional)
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                  >
                    <option value="Web Development">Web Development</option>
                    <option value="Mobile App">Mobile App</option>
                    <option value="UI/UX">UI/UX Design</option>
                    <option value="Backend">Backend</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Project Goals
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newGoal}
                      onChange={(e) => setNewGoal(e.target.value)}
                      placeholder="Enter a goal.."
                      className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddGoal())}
                    />
                    <button
                      type="button"
                      onClick={handleAddGoal}
                      className="px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Goals List */}
              <div className="space-y-2">
                {goals.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">Project Goals:</p>
                    <div className="space-y-2">
                      {goals.map((goal) => (
                        <div key={goal.id} className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition group">
                          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span className="flex-1 text-sm text-gray-700">{goal.text}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveGoal(goal.id)}
                            className="text-gray-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Team & Team Members */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Team (Optional)
                  </label>
                  <select
                    name="team"
                    value={formData.team}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                  >
                    <option value="">Select team</option>
                    <option value="team1">Team 1</option>
                    <option value="team2">Team 2</option>
                    <option value="team3">Team 3</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Team Members
                  </label>
                  <select
                    multiple
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                  >
                    <option>Select user(s)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1.5">Hold Ctrl/Cmd to select multiple</p>
                </div>
              </div>
            </div>

            {/* Right Section - Project Preview */}
            <div>
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 sticky top-24">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-500 rounded-lg mx-auto mb-4 flex items-center justify-center shadow-md">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Project Details</h3>
                  <p className="text-xs text-gray-600 mb-4">
                    {formData.projectName || 'Your project name will appear here'}
                  </p>
                  <div className="space-y-2 text-left">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      <span className="text-xs text-gray-700">Category: {formData.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      <span className="text-xs text-gray-700">Goals: {goals.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-50 transition font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm flex items-center gap-2 shadow-md hover:shadow-lg"
            >
              <Plus size={18} />
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

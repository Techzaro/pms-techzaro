// import React, { useState } from 'react';
// import { X, Plus } from 'lucide-react';

// /**
//  * FigmaTaskModal - Create Task Modal Component based on Figma Design
//  * Uses Tailwind CSS for styling
//  */
// export default function FigmaCreateTaskModal({ isOpen, onClose, onSubmit }) {
//   const [formData, setFormData] = useState({
//     project: '',
//     assignTo: [],
//     taskName: '',
//     description: '',
//     status: 'Planned',
//     priority: 'Medium',
//     startDate: '',
//     dueDate: '',
//     links: [],
//     isRecurring: false,
//   });

//   const [linkInput, setLinkInput] = useState('');
//   const [links, setLinks] = useState([]);

//   const handleInputChange = (e) => {
//     const { name, value, type, checked } = e.target;
//     setFormData(prev => ({
//       ...prev,
//       [name]: type === 'checkbox' ? checked : value,
//     }));
//   };

//   const handleAddLink = () => {
//     if (linkInput.trim()) {
//       setLinks([...links, linkInput]);
//       setLinkInput('');
//     }
//   };

//   const handleRemoveLink = (index) => {
//     setLinks(links.filter((_, i) => i !== index));
//   };

//   const handleCreateTask = (e) => {
//     e.preventDefault();
//     if (onSubmit) {
//       onSubmit({ ...formData, links });
//     }
//     onClose();
//   };

//   if (!isOpen) return null;

//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center">
//       {/* Overlay */}
//       <div 
//         className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
//         onClick={onClose}
//       />
      
//       {/* Modal */}
//       <div className="relative bg-white rounded-3xl w-full max-w-6xl max-h-[90vh] overflow-auto shadow-2xl">
        
//         {/* Header */}
//         <div className="sticky top-0 flex items-start justify-between p-6 border-b border-gray-200 bg-white">
//           <div className="flex items-start gap-4">
//             <div className="flex-shrink-0 w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center shadow-md">
//               <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
//               </svg>
//             </div>
//             <div className="pt-1">
//               <h2 className="text-2xl font-bold text-gray-900">Create New Task</h2>
//               <p className="text-sm text-gray-500 mt-1">Add task details and assign it to team members.</p>
//             </div>
//           </div>
//           <button
//             onClick={onClose}
//             className="text-gray-400 hover:text-gray-600 transition p-2"
//           >
//             <X size={24} />
//           </button>
//         </div>

//         {/* Form Content */}
//         <form onSubmit={handleCreateTask} className="p-6">
//           <div className="grid grid-cols-3 gap-6">
            
//             {/* Left Section - Main Form */}
//             <div className="col-span-2 space-y-6">
              
//               {/* Row 1: Project & Assign To */}
//               <div className="grid grid-cols-2 gap-4">
//                 <div>
//                   <label className="block text-sm font-semibold text-gray-900 mb-2">
//                     Projects <span className="text-red-500">*</span>
//                   </label>
//                   <div className="relative">
//                     <select
//                       name="project"
//                       value={formData.project}
//                       onChange={handleInputChange}
//                       required
//                       className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
//                     >
//                       <option value="">Select project</option>
//                       <option value="project1">Project 1</option>
//                       <option value="project2">Project 2</option>
//                     </select>
//                     <svg className="absolute right-3 top-3 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
//                     </svg>
//                   </div>
//                 </div>

//                 <div>
//                   <label className="block text-sm font-semibold text-gray-900 mb-2">
//                     Assign To <span className="text-red-500">*</span>
//                   </label>
//                   <div className="relative">
//                     <select
//                       multiple
//                       className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 focus:outline-none focus:border-blue-500 focus:bg-white transition"
//                     >
//                       <option>Select user(s)</option>
//                     </select>
//                   </div>
//                   <p className="text-xs text-gray-500 mt-1.5">Hold Ctrl/Cmd to select multiple</p>
//                 </div>
//               </div>

//               {/* Task Name */}
//               <div>
//                 <label className="block text-sm font-semibold text-gray-900 mb-2">
//                   Task Name <span className="text-red-500">*</span>
//                 </label>
//                 <input
//                   type="text"
//                   name="taskName"
//                   value={formData.taskName}
//                   onChange={handleInputChange}
//                   placeholder="Enter task name.."
//                   required
//                   className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
//                 />
//               </div>

//               {/* Description */}
//               <div>
//                 <label className="block text-sm font-semibold text-gray-900 mb-2">
//                   Description
//                 </label>
//                 <textarea
//                   name="description"
//                   value={formData.description}
//                   onChange={handleInputChange}
//                   placeholder="Enter task description.."
//                   rows="4"
//                   className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white transition resize-none"
//                 />
//               </div>
//             </div>

//             {/* Right Section - Status, Priority, Dates */}
//             <div className="space-y-4">
              
//               {/* Status */}
//               <div className="bg-white border border-gray-200 p-4 rounded-lg hover:border-gray-300 transition">
//                 <label className="block text-sm font-semibold text-gray-900 mb-3">
//                   Status
//                 </label>
//                 <select
//                   name="status"
//                   value={formData.status}
//                   onChange={handleInputChange}
//                   className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 text-sm focus:outline-none focus:border-blue-500 transition"
//                 >
//                   <option value="Planned">🔵 Planned</option>
//                   <option value="In Progress">🟡 In Progress</option>
//                   <option value="Completed">🟢 Completed</option>
//                 </select>
//               </div>

//               {/* Priority */}
//               <div className="bg-white border border-gray-200 p-4 rounded-lg hover:border-gray-300 transition">
//                 <label className="block text-sm font-semibold text-gray-900 mb-3">
//                   Priority
//                 </label>
//                 <select
//                   name="priority"
//                   value={formData.priority}
//                   onChange={handleInputChange}
//                   className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 text-sm focus:outline-none focus:border-blue-500 transition"
//                 >
//                   <option value="Low">🔵 Low</option>
//                   <option value="Medium">🟡 Medium</option>
//                   <option value="High">🔴 High</option>
//                 </select>
//               </div>

//               {/* Dates */}
//               <div className="bg-white border border-gray-200 p-4 rounded-lg">
//                 <label className="block text-sm font-semibold text-gray-900 mb-3">
//                   📅 Dates
//                 </label>
//                 <div className="space-y-3">
//                   <input
//                     type="date"
//                     name="startDate"
//                     value={formData.startDate}
//                     onChange={handleInputChange}
//                     className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 text-sm focus:outline-none focus:border-blue-500 transition"
//                   />
//                   <input
//                     type="date"
//                     name="dueDate"
//                     value={formData.dueDate}
//                     onChange={handleInputChange}
//                     className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 text-sm focus:outline-none focus:border-blue-500 transition"
//                   />
//                 </div>
//               </div>

//               {/* Attachments */}
//               <div className="bg-white border-2 border-dashed border-gray-300 p-4 rounded-lg">
//                 <label className="block text-sm font-semibold text-gray-900 mb-3">
//                   📎 Attachments
//                 </label>
                
//                 {/* Drag & Drop */}
//                 <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:bg-blue-50 hover:border-blue-300 transition cursor-pointer mb-3">
//                   <svg className="w-6 h-6 text-blue-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
//                   </svg>
//                   <p className="text-xs text-gray-600">
//                     Drag & drop files here or <span className="text-blue-500 font-semibold">browse</span>
//                   </p>
//                 </div>

//                 {/* Divider */}
//                 <div className="flex items-center gap-2 my-3">
//                   <div className="flex-1 border-t border-gray-300"></div>
//                   <span className="text-xs text-gray-500 font-medium">OR</span>
//                   <div className="flex-1 border-t border-gray-300"></div>
//                 </div>

//                 {/* Link Input */}
//                 <div className="space-y-2">
//                   <input
//                     type="url"
//                     value={linkInput}
//                     onChange={(e) => setLinkInput(e.target.value)}
//                     placeholder="Paste link (Drive, Figma, Website, etc.)"
//                     className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500 transition"
//                   />
//                   <button
//                     type="button"
//                     onClick={handleAddLink}
//                     className="w-full px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium"
//                   >
//                     Add Link
//                   </button>
//                 </div>

//                 {/* Links List */}
//                 {links.length > 0 && (
//                   <div className="mt-3 space-y-2">
//                     {links.map((link, index) => (
//                       <div key={index} className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
//                         <span className="text-gray-700 truncate">{link}</span>
//                         <button
//                           type="button"
//                           onClick={() => handleRemoveLink(index)}
//                           className="text-gray-400 hover:text-red-500 transition"
//                         >
//                           ✕
//                         </button>
//                       </div>
//                     ))}
//                   </div>
//                 )}
//               </div>

//               {/* Recurring Task */}
//               <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition">
//                 <input
//                   type="checkbox"
//                   name="isRecurring"
//                   checked={formData.isRecurring}
//                   onChange={handleInputChange}
//                   className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
//                 />
//                 <span className="text-sm font-medium text-gray-900">Mark as Recurring Task</span>
//               </label>
//             </div>
//           </div>

//           {/* Footer */}
//           <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
//             <button
//               type="button"
//               onClick={onClose}
//               className="px-6 py-2.5 border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-50 transition font-medium text-sm"
//             >
//               Cancel
//             </button>
//             <button
//               type="submit"
//               className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm flex items-center gap-2 shadow-md hover:shadow-lg"
//             >
//               <Plus size={18} />
//               Create Task












































































































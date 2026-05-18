import PropTypes from "prop-types";

const CreateProjectModal = ({ onClose, className = "" }) => {
  return (
    <div
      className={`flex w-[998px] max-w-full max-h-[calc(100vh-80px)] flex-col items-center gap-[10px] rounded-[24px] border border-[#EAECF0] bg-white shadow-[0_20px_60px_12px_rgba(16,24,40,0.18)] overflow-hidden ${className}`}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between self-stretch gap-4 border-b border-[#EAECF0] bg-white px-5 py-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#ECEAFE]">
            <img
              src="/Header-Icon.svg"
              alt="Project icon"
              className="h-5 w-5"
            />
          </div>

          <div>
            <h2 className="text-3xl font-semibold text-[#101828]">
              Create New Project
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
              Add project details and assign it to team members.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          type="button"
          className="rounded-2xl bg-[#F9FAFB] p-3 transition hover:bg-gray-100"
        >
          <img
            src="/Close-Icon.svg"
            alt="Close modal"
            className="h-4 w-4"
          />
        </button>
      </div>

      {/* BODY */}
      <div className="grid w-full grid-cols-12 gap-6 overflow-y-auto p-8 max-lg:grid-cols-1">
        {/* LEFT SIDE */}
        <div className="col-span-7 flex flex-col gap-6">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Project Name <span className="text-red-500">*</span>
            </label>

            <input
              type="text"
              placeholder="Enter Project name.."
              className="w-full rounded-2xl border border-[#EAECF0] bg-[#F8FAFC] px-4 py-3 outline-none transition focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Description
            </label>

            <textarea
              placeholder="Enter project description.."
              className="min-h-[220px] w-full resize-none rounded-2xl border border-[#EAECF0] bg-[#F8FAFC] px-4 py-4 outline-none transition focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Category
              </label>

              <select className="w-full rounded-2xl border border-[#EAECF0] bg-[#F8FAFC] px-4 py-3 outline-none focus:border-indigo-500">
                <option>Web Development</option>
                <option>Mobile App</option>
                <option>Design System</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Project Goals
              </label>

              <input
                type="text"
                placeholder="Enter Project Goals"
                className="w-full rounded-2xl border border-[#EAECF0] bg-[#F8FAFC] px-4 py-3 outline-none transition focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Team
              </label>

              <select className="w-full rounded-2xl border border-[#EAECF0] bg-[#F8FAFC] px-4 py-3 outline-none focus:border-indigo-500">
                <option>Select Team</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Team Members
              </label>

              <select className="w-full rounded-2xl border border-[#EAECF0] bg-[#F8FAFC] px-4 py-3 outline-none focus:border-indigo-500">
                <option>Select User(s)</option>
              </select>

              <p className="mt-2 text-xs text-gray-500">
                Hold Ctrl/Cmd to select multiple
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="col-span-5 flex flex-col gap-5">
          {/* STATUS */}
          <div className="rounded-[20px] border border-[#EAECF0] bg-[#FCFCFD] p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Status</p>

              <span className="text-sm text-gray-500">To Do</span>
            </div>

            <select className="w-full rounded-2xl border border-[#EAECF0] bg-white px-4 py-3 outline-none focus:border-indigo-500">
              <option>To Do</option>
              <option>In Progress</option>
              <option>Done</option>
            </select>
          </div>

          {/* PRIORITY */}
          <div className="rounded-[20px] border border-[#EAECF0] bg-[#FCFCFD] p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Priority</p>

              <span className="text-sm text-gray-500">Medium</span>
            </div>

            <select className="w-full rounded-2xl border border-[#EAECF0] bg-white px-4 py-3 outline-none focus:border-indigo-500">
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          </div>

          {/* DEADLINES */}
          <div className="rounded-[20px] border border-[#EAECF0] bg-[#FCFCFD] p-5">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">
              Deadlines
            </h3>

            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <select className="w-full rounded-2xl border border-[#EAECF0] bg-white px-4 py-3 outline-none focus:border-indigo-500">
                <option>Add Phase</option>
              </select>

              <input
                type="date"
                className="w-full rounded-2xl border border-[#EAECF0] bg-white px-4 py-3 outline-none focus:border-indigo-500"
              />
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-[#EAECF0] bg-white px-4 py-3 text-sm text-gray-600">
              <span>Design Phase</span>

              <span className="text-gray-400">24 May, 2026</span>
            </div>
          </div>

          {/* ATTACHMENTS */}
          <div className="rounded-[20px] border border-[#EAECF0] bg-[#FCFCFD] p-5">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">
              Attachments
            </h3>

            <div className="rounded-[20px] border-2 border-dashed border-[#D9E2EC] bg-white p-6 text-center text-gray-500">
              <p>Drag & drop files here</p>

              <p className="mt-2 text-indigo-600">or browse</p>
            </div>

            <div className="mt-4 flex gap-3 max-sm:flex-col">
              <input
                type="text"
                placeholder="Paste link (Drive, Figma, Website, etc.)"
                className="flex-1 rounded-2xl border border-[#EAECF0] bg-white px-4 py-3 outline-none focus:border-indigo-500"
              />

              <button
                type="button"
                className="h-12 rounded-2xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Add Link
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="flex w-full flex-col gap-3 border-t border-[#EAECF0] px-8 py-5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="h-11 rounded-2xl border border-[#EAECF0] bg-white px-5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Cancel
        </button>

        <button
          type="button"
          className="h-11 rounded-2xl bg-indigo-600 px-6 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          Create Project
        </button>
      </div>
    </div>
  );
};

CreateProjectModal.propTypes = {
  onClose: PropTypes.func,
  className: PropTypes.string,
};

export default CreateProjectModal;
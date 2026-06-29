/**
 * CreateProject.jsx — Create Project Page
 *
 * Wrapper page that renders the CreateProjectModal centered on screen.
 * After project creation, navigates back to the projects list.
 * If cancelled, navigates to the previous page.
 */
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import CreateProjectModal from "../components/CreateProjectModal";
import { rolePath } from "../utils/auth";

/**
 * CreateProject — Page component that centers the CreateProjectModal.
 * @param {Function} handleClose - Called when modal closes; navigates to projects if created
 */
function CreateProject() {
  const navigate = useNavigate();

  // Navigate back to projects list if project was created, otherwise go to previous page
  const handleClose = (created) => {
    if (created) {
      navigate(rolePath("projects"));
    } else {
      navigate(-1);
    }
  };

  return (
    <DashboardLayout hideRightSidebar={true}>
      <div className="min-h-screen flex items-center justify-center">
        <CreateProjectModal onClose={handleClose} />
      </div>
    </DashboardLayout>
  );
}

export default CreateProject;

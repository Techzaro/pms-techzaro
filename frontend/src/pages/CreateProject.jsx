import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import CreateProjectModal from "../components/CreateProjectModal";
import { rolePath } from "../utils/auth";

function CreateProject() {
  const navigate = useNavigate();

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

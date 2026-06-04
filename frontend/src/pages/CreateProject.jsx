import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import CreateProjectModal from "../components/CreateProjectModal";

function CreateProject() {
  const navigate = useNavigate();

  const handleClose = (created) => {
    if (created) {
      navigate("/projects");
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

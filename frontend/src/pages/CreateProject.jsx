import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import CreateProjectModal from "../components/CreateProjectModal";

function CreateProject() {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="min-h-screen flex items-center justify-center">
        <CreateProjectModal onClose={() => navigate(-1)} />
      </div>
    </DashboardLayout>
  );
}

export default CreateProject;

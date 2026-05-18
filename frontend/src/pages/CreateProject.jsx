import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import CreateProjectModal from "../components/CreateProjectModal";

function CreateProject() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F8F9FD] flex items-center justify-center p-8">
      <CreateProjectModal onClose={() => navigate(-1)} />
    </div>
  );
}

export default CreateProject;

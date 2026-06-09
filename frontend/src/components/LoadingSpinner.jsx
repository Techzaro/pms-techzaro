import { useLoading } from "../context/LoadingContext";
import "./LoadingSpinner.css";

function LoadingSpinner() {
  const { loading } = useLoading();

  if (!loading) return null;

  return (
    <div className="global-loading-overlay">
      <div className="global-loading-spinner">
        <div className="spinner-blade"></div>
        <div className="spinner-blade"></div>
        <div className="spinner-blade"></div>
        <div className="spinner-blade"></div>
        <div className="spinner-blade"></div>
        <div className="spinner-blade"></div>
        <div className="spinner-blade"></div>
        <div className="spinner-blade"></div>
      </div>
    </div>
  );
}

export default LoadingSpinner;

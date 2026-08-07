import React from "react";
import { Check, Clock, Eye, AlertCircle, RefreshCw } from "lucide-react";
import "./HRMStatusTimeline.css";

export default function HRMStatusTimeline({ status }) {
  // Define steps
  const steps = [
    { label: "Submitted", activeStatus: ["pending", "under review", "approved", "rejected", "returned"] },
    { label: "Under Review", activeStatus: ["under review", "approved", "rejected", "returned"] },
    { label: "Final Decision", activeStatus: ["approved", "rejected", "returned"] }
  ];

  const currentStatus = (status || "pending").toLowerCase();

  const getStepIcon = (label, isActive, isLast) => {
    if (!isActive) return <Clock size={14} />;
    if (isLast) {
      if (currentStatus === "approved") return <Check size={14} />;
      if (currentStatus === "rejected") return <AlertCircle size={14} />;
      if (currentStatus === "returned") return <RefreshCw size={14} />;
      return <Eye size={14} />;
    }
    return <Check size={14} />;
  };

  const getStepClass = (label, isActive, isLast) => {
    if (!isActive) return "hrm-tl-step";
    if (isLast) {
      if (currentStatus === "approved") return "hrm-tl-step hrm-tl-step-approved";
      if (currentStatus === "rejected") return "hrm-tl-step hrm-tl-step-rejected";
      if (currentStatus === "returned") return "hrm-tl-step hrm-tl-step-returned";
      return "hrm-tl-step hrm-tl-step-active";
    }
    return "hrm-tl-step hrm-tl-step-completed";
  };

  return (
    <div className="hrm-timeline-container">
      <h3 className="hrm-timeline-title">Status Timeline</h3>
      <div className="hrm-timeline">
        {steps.map((step, index) => {
          const isActive = step.activeStatus.includes(currentStatus);
          const isLast = index === steps.length - 1 || (!steps[index+1].activeStatus.includes(currentStatus));
          return (
            <div key={index} className={getStepClass(step.label, isActive, isLast)}>
              <div className="hrm-tl-icon-wrap">
                <div className="hrm-tl-icon">{getStepIcon(step.label, isActive, isLast)}</div>
                {index < steps.length - 1 && <div className="hrm-tl-line"></div>}
              </div>
              <div className="hrm-tl-content">
                <div className="hrm-tl-label">{step.label}</div>
                {isLast && isActive && (
                  <div className="hrm-tl-status-text">
                    Current Status: <strong style={{ textTransform: 'capitalize' }}>{currentStatus}</strong>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

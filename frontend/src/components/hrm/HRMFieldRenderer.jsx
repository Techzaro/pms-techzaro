import "react";
import HRMDatePicker from "./HRMDatePicker";
import HRMTimePicker from "./HRMTimePicker";
import HRMDateTimePicker from "./HRMDateTimePicker";
import HRMDateRangePicker from "./HRMDateRangePicker";
import HRMRichTextEditor from "./HRMRichTextEditor";
import HRMAttachmentUploader from "./HRMAttachmentUploader";

export default function HRMFieldRenderer({ field, value, onChange }) {
  const { type, label, required, options } = field;

  switch (type) {
    case "date":
      return <HRMDatePicker label={label} value={value} onChange={onChange} required={required} onClear={() => onChange("")} />;
    case "time":
      return <HRMTimePicker label={label} value={value} onChange={onChange} required={required} onClear={() => onChange("")} />;
    case "datetime":
      return <HRMDateTimePicker label={label} value={value} onChange={onChange} required={required} onClear={() => onChange("")} />;
    case "daterange":
      return <HRMDateRangePicker label={label} value={value} onChange={onChange} required={required} onClear={() => onChange({ start: "", end: "" })} />;
    case "dropdown":
      return (
        <div className="hrm-picker-container">
          {label && <label className="hrm-picker-label">{label} {required && <span className="req">*</span>}</label>}
          <select 
            className="hrm-picker-input" 
            style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px' }} 
            value={value || ""} 
            onChange={(e) => onChange(e.target.value)} 
            required={required}
          >
            <option value="">Select...</option>
            {options?.map((opt, i) => (
              <option key={i} value={opt.value || opt}>{opt.label || opt}</option>
            ))}
          </select>
        </div>
      );
    case "amount":
    case "number":
      return (
        <div className="hrm-picker-container">
          {label && <label className="hrm-picker-label">{label} {required && <span className="req">*</span>}</label>}
          <input 
            type="number" 
            className="hrm-picker-input" 
            style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px' }} 
            value={value || ""} 
            onChange={(e) => onChange(e.target.value)} 
            required={required}
            placeholder={type === "amount" ? "0.00" : ""}
          />
        </div>
      );
    case "text":
      return (
        <div className="hrm-picker-container">
          {label && <label className="hrm-picker-label">{label} {required && <span className="req">*</span>}</label>}
          <input 
            type="text" 
            className="hrm-picker-input" 
            style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px' }} 
            value={value || ""} 
            onChange={(e) => onChange(e.target.value)} 
            required={required}
          />
        </div>
      );
    case "richtext":
      return <HRMRichTextEditor label={label} value={value} onChange={onChange} required={required} />;
    case "attachment":
      return <HRMAttachmentUploader label={label} files={value} onChange={onChange} required={required} />;
    default:
      return <div>Unsupported field type: {type}</div>;
  }
}

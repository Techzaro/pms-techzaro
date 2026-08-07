import React, { useRef, useState } from "react";
import { UploadCloud, X, File, Image as ImageIcon } from "lucide-react";
import "./HRMAttachmentUploader.css";

export default function HRMAttachmentUploader({ label, files, onChange, required, accept = "*/*", maxFiles = 5 }) {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    processFiles(selectedFiles);
  };

  const processFiles = (newFiles) => {
    const validFiles = newFiles.slice(0, maxFiles - (files?.length || 0));
    if (validFiles.length > 0) {
      const updatedFiles = [...(files || []), ...validFiles];
      onChange(updatedFiles);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeFile = (index) => {
    const updatedFiles = [...files];
    updatedFiles.splice(index, 1);
    onChange(updatedFiles.length > 0 ? updatedFiles : []);
  };

  return (
    <div className="hrm-upload-container">
      {label && <label className="hrm-upload-label">{label} {required && <span className="req">*</span>}</label>}
      
      <div 
        className={`hrm-upload-area ${isDragging ? "dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloud size={32} className="hrm-upload-icon" />
        <p><strong>Click to upload</strong> or drag and drop</p>
        <p className="hrm-upload-hint">Supported files (max {maxFiles})</p>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: "none" }} 
          multiple 
          accept={accept}
          onChange={handleFileSelect}
        />
      </div>

      {files && files.length > 0 && (
        <ul className="hrm-upload-list">
          {files.map((file, i) => (
            <li key={i} className="hrm-upload-item">
              <div className="hrm-upload-file-info">
                {file.type?.startsWith("image/") ? <ImageIcon size={16} /> : <File size={16} />}
                <span className="hrm-upload-filename">{file.name}</span>
                <span className="hrm-upload-size">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
              </div>
              <button type="button" className="hrm-upload-remove" onClick={() => removeFile(i)}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

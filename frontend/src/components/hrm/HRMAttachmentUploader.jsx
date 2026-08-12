import React, { useRef, useState, useEffect } from "react";
import { UploadCloud, X, File, Image as ImageIcon, Eye, ArrowLeft } from "lucide-react";
import "./HRMAttachmentUploader.css";

export default function HRMAttachmentUploader({ label, files, onChange, required, accept = "*/*", maxFiles = 5 }) {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [fileUrls, setFileUrls] = useState([]);

  useEffect(() => {
    if (files && files.length > 0) {
      const urls = files.map(file => URL.createObjectURL(file));
      setFileUrls(urls);
      return () => urls.forEach(url => URL.revokeObjectURL(url));
    } else {
      setFileUrls([]);
    }
  }, [files]);

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
              <div className="hrm-upload-file-info" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {file.type?.startsWith("image/") ? <ImageIcon size={16} /> : <File size={16} />}
                <span className="hrm-upload-filename">{file.name}</span>
                <span className="hrm-upload-size">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button type="button" className="hrm-upload-preview" onClick={() => setPreviewIndex(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pms-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }} title="Preview">
                  <Eye size={16} />
                </button>
                <button type="button" className="hrm-upload-remove" onClick={() => removeFile(i)}>
                  <X size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {previewIndex !== null && fileUrls.length > 0 && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '1200px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', color: 'white' }}>
            <div style={{ fontSize: '16px', fontWeight: '600' }}>
              Preview {previewIndex + 1} of {files.length} ({files[previewIndex].name})
            </div>
            <button onClick={() => setPreviewIndex(null)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
              &times; Close
            </button>
          </div>
          <div style={{ width: '100%', maxWidth: '1200px', height: '80vh', background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', display: 'flex', position: 'relative' }}>
            {files.length > 1 && (
              <button 
                onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                disabled={previewIndex === 0}
                style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: previewIndex === 0 ? 'not-allowed' : 'pointer', zIndex: 10, opacity: previewIndex === 0 ? 0.3 : 1 }}
              >
                <ArrowLeft size={24} />
              </button>
            )}
            
            <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
              {files[previewIndex].type?.startsWith("image/") ? (
                <img src={fileUrls[previewIndex]} alt={`Preview ${previewIndex + 1}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <iframe src={fileUrls[previewIndex]} style={{ width: '100%', height: '100%', border: 'none' }} title={`Document Preview ${previewIndex + 1}`} />
              )}
            </div>

            {files.length > 1 && (
              <button 
                onClick={() => setPreviewIndex((i) => Math.min(files.length - 1, i + 1))}
                disabled={previewIndex === files.length - 1}
                style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: previewIndex === files.length - 1 ? 'not-allowed' : 'pointer', zIndex: 10, opacity: previewIndex === files.length - 1 ? 0.3 : 1 }}
              >
                <ArrowLeft size={24} style={{ transform: 'rotate(180deg)' }} />
              </button>
            )}
          </div>
          
          {files.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              {files.map((_, idx) => (
                <button 
                  key={idx}
                  onClick={() => setPreviewIndex(idx)}
                  style={{ width: '12px', height: '12px', borderRadius: '50%', border: 'none', background: idx === previewIndex ? '#3b82f6' : 'rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'background 0.2s' }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

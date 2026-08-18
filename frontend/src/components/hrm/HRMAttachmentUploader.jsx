import { useRef, useState, useEffect } from "react";
import { UploadCloud, Trash2, File, Image as ImageIcon, ExternalLink } from "lucide-react";
import "./HRMAttachmentUploader.css";

export default function HRMAttachmentUploader({ label, files, onChange, required, accept = "*/*", maxFiles = 5 }) {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileUrls, setFileUrls] = useState([]);

  // Safely normalize files prop (can be array, JSON string, single URL string, null, etc.)
  const normalizeFiles = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed;
        } catch (e) {}
      }
      return [trimmed];
    }
    return [];
  };

  const safeFiles = normalizeFiles(files);

  useEffect(() => {
    if (safeFiles && safeFiles.length > 0) {
      const urls = safeFiles.map(file => typeof file === 'string' ? file : URL.createObjectURL(file));
      setFileUrls(urls);
      return () => urls.forEach(url => { if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url); });
    } else {
      setFileUrls([]);
    }
  }, [files]);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    processFiles(selectedFiles);
  };

  const processFiles = (newFiles) => {
    const validFiles = newFiles.slice(0, maxFiles - (safeFiles?.length || 0));
    if (validFiles.length > 0) {
      const updatedFiles = [...safeFiles, ...validFiles];
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
    const updatedFiles = [...safeFiles];
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

      {safeFiles && safeFiles.length > 0 && (
        <ul className="hrm-upload-list">
          {safeFiles.map((file, i) => {
            const fileName = typeof file === 'string' ? (file.split('/').pop() || `File ${i + 1}`) : (file.name || `File ${i + 1}`);
            const isImage = typeof file === 'string' ? Boolean(file.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i)) : Boolean(file.type?.startsWith("image/"));
            const fileSize = file.size ? `(${(file.size / 1024 / 1024).toFixed(2)} MB)` : null;
            const fileUrl = fileUrls[i];

            return (
              <li key={i} className="hrm-upload-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '8px' }}>
                <div className="hrm-upload-file-info" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isImage ? <ImageIcon size={16} style={{ color: '#3b82f6' }} /> : <File size={16} style={{ color: '#64748b' }} />}
                  <span className="hrm-upload-filename" style={{ fontWeight: '500', fontSize: '13.5px', color: '#1e293b' }}>{fileName}</span>
                  {fileSize && <span className="hrm-upload-size" style={{ fontSize: '12px', color: '#64748b' }}>{fileSize}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {fileUrl && (
                    <a 
                      href={fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '5px', 
                        padding: '6px 12px', 
                        background: '#3b82f6', 
                        color: '#ffffff', 
                        borderRadius: '6px', 
                        fontSize: '12px', 
                        fontWeight: '600', 
                        textDecoration: 'none',
                        boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)'
                      }}
                    >
                      <ExternalLink size={13} /> View Document
                    </a>
                  )}
                  <button 
                    type="button" 
                    className="hrm-upload-remove" 
                    onClick={() => removeFile(i)}
                    style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600' }}
                    title="Remove Document"
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

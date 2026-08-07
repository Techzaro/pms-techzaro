import React, { useRef, useEffect } from "react";
import { Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import "./HRMRichTextEditor.css";

export default function HRMRichTextEditor({ label, value, onChange, required }) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const execCmd = (cmd, arg = null) => {
    document.execCommand(cmd, false, arg);
    editorRef.current.focus();
    handleChange();
  };

  const handleChange = () => {
    if (onChange && editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  return (
    <div className="hrm-rt-container">
      {label && <label className="hrm-rt-label">{label} {required && <span className="req">*</span>}</label>}
      <div className="hrm-rt-wrapper">
        <div className="hrm-rt-toolbar">
          <button type="button" onClick={() => execCmd("bold")} title="Bold"><Bold size={14} /></button>
          <button type="button" onClick={() => execCmd("italic")} title="Italic"><Italic size={14} /></button>
          <button type="button" onClick={() => execCmd("underline")} title="Underline"><Underline size={14} /></button>
          <div className="hrm-rt-divider"></div>
          <button type="button" onClick={() => execCmd("insertUnorderedList")} title="Bullet List"><List size={14} /></button>
          <button type="button" onClick={() => execCmd("insertOrderedList")} title="Numbered List"><ListOrdered size={14} /></button>
          <div className="hrm-rt-divider"></div>
          <button type="button" onClick={() => execCmd("justifyLeft")} title="Align Left"><AlignLeft size={14} /></button>
          <button type="button" onClick={() => execCmd("justifyCenter")} title="Align Center"><AlignCenter size={14} /></button>
          <button type="button" onClick={() => execCmd("justifyRight")} title="Align Right"><AlignRight size={14} /></button>
        </div>
        <div
          ref={editorRef}
          className="hrm-rt-editor"
          contentEditable
          onInput={handleChange}
          onBlur={handleChange}
          role="textbox"
          aria-multiline="true"
        ></div>
      </div>
    </div>
  );
}

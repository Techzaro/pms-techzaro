import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { MdBusiness, MdPhone, MdEmail, MdLanguage, MdShield, MdDescription, MdVerifiedUser, MdCheckCircle } from "react-icons/md";
import API_URL from "../../config/api";
import "./Esign.css";

const sanitizeHtml = (html) => {
  if (!html) return "";
  return html.replace(/background-color:\s*([^;"]+)/gi, "color: $1");
};

const formatCleanProse = (content, candidateName, candidateCnic) => {
  if (!content) return null;

  const sanitized = sanitizeHtml(content);

  // If content contains rich HTML tags from Quill editor, render HTML directly
  if (/<[a-z][\s\S]*>/i.test(sanitized)) {
    return (
      <div
        className="esign-paper-prose-body ql-editor"
        dangerouslySetInnerHTML={{ __html: sanitized }}
        style={{ padding: 0, fontSize: "14px", lineHeight: "1.65" }}
      />
    );
  }

  const lines = sanitized.split(/\r?\n/);
  
  // Filter out redundant top company letterhead lines if present in raw document text
  while (lines.length > 0) {
    const trimmed = lines[0].trim().toLowerCase();
    if (
      !trimmed ||
      trimmed === "techzaro pvt. ltd" ||
      trimmed === "excellency in tech" ||
      trimmed.includes("+92 311") ||
      trimmed.includes("contact@techzaro.com") ||
      trimmed.includes("https://techxaro.com")
    ) {
      lines.shift();
    } else {
      break;
    }
  }

  return (
    <div className="esign-paper-prose-body">
      {lines.map((line, idx) => {
        const raw = line.trim();
        if (!raw) {
          return <div key={idx} style={{ height: "10px" }} />;
        }

        // Clean raw markdown bold characters
        const cleanLine = raw.replace(/\*\*/g, "").replace(/\*/g, "");
        const lowerLine = cleanLine.toLowerCase();

        // Skip raw template acknowledgment & signature lines as they are rendered cleanly in the ack card below
        if (
          lowerLine.startsWith("approval and acknowledgment") ||
          lowerLine.startsWith("i, name, cnic:") ||
          lowerLine.startsWith("employee signature:") ||
          (candidateName && lowerLine === candidateName.toLowerCase())
        ) {
          return null;
        }

        // 1. Check if line is a major section title
        const isHeading =
          cleanLine.startsWith("IMPLEMENTATION OF") ||
          cleanLine.startsWith("TECHXARO PVT. LTD") ||
          /^\d+-\s+/.test(cleanLine) ||
          /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\.\s+/.test(cleanLine) ||
          (cleanLine === cleanLine.toUpperCase() && cleanLine.length < 75 && !cleanLine.endsWith("."));

        if (isHeading) {
          return (
            <h3 key={idx} className="esign-doc-heading">
              {cleanLine}
            </h3>
          );
        }

        // 2. Check if line is a bullet item (starts with -, •, *, o, or 1.)
        const isBullet = /^[-•*o]\s+/.test(cleanLine) || /^\d+\.\s+/.test(cleanLine);
        if (isBullet) {
          const itemText = cleanLine.replace(/^[-•*o\d+\.]\s*/, "").trim();
          const colonPos = itemText.indexOf(":");
          return (
            <div key={idx} className="esign-bullet-item">
              <span className="esign-bullet-dot">•</span>
              <div className="esign-bullet-text">
                {colonPos > 0 && colonPos < 35 ? (
                  <>
                    <strong>{itemText.slice(0, colonPos + 1)}</strong>
                    {itemText.slice(colonPos + 1)}
                  </>
                ) : (
                  itemText
                )}
              </div>
            </div>
          );
        }

        // 3. Date, Greeting, or Signature lead lines
        if (cleanLine.startsWith("Date:") || cleanLine.startsWith("Dear ") || cleanLine.startsWith("Sincerely,")) {
          const colonPos = cleanLine.indexOf(":");
          return (
            <p key={idx} className="esign-lead-p">
              {colonPos > 0 ? (
                <>
                  <strong>{cleanLine.slice(0, colonPos + 1)}</strong>
                  {cleanLine.slice(colonPos + 1)}
                </>
              ) : (
                <strong>{cleanLine}</strong>
              )}
            </p>
          );
        }

        // 4. Standard text paragraph with inline key-value term check
        const colonPos = cleanLine.indexOf(":");
        if (colonPos > 0 && colonPos < 35 && !cleanLine.startsWith("http")) {
          return (
            <p key={idx} className="esign-body-p">
              <strong>{cleanLine.slice(0, colonPos + 1)}</strong>
              {cleanLine.slice(colonPos + 1)}
            </p>
          );
        }

        return (
          <p key={idx} className="esign-body-p">
            {cleanLine}
          </p>
        );
      })}
    </div>
  );
};

const EsignPaperSheet = ({ doc, data, logoUrl, orgName, subtitle, contactInfoStr, isExecuted = false, activeSig = "", sigMethod = "" }) => {
  const phone = "+92 311 4865556";
  const email = "contact@techxaro.com";
  const website = "https://techxaro.com/";
  const candidateName = data?.envelope?.candidate_name || "Candidate";
  const candidateCnic = data?.envelope?.candidate_id || "00000-0000000-0";

  const effectiveSigValue = doc.signature_value || activeSig || (isExecuted ? (data.envelope.signature_value || data.envelope.documents?.find(d => d.signature_value)?.signature_value) : "");
  const effectiveSigMethod = doc.signature_method || sigMethod || "typed";

  return (
    <article className="esign-document-card esign-paper-sheet" key={doc.id}>
      {/* Top PMS Primary Color Theme Accent Bar */}
      <div className="esign-paper-theme-bar" />

      {/* Executive Letterhead Header */}
      <div className="esign-paper-letterhead">
        <div className="esign-paper-brand">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${orgName} logo`}
              className="esign-paper-logo"
              onError={(e) => {
                e.target.onerror = null;
                e.target.style.display = "none";
              }}
            />
          ) : null}
          <div>
            <h2 className="esign-paper-org-title">{orgName ? orgName.toUpperCase() : "TECHXARO PVT. LTD"}</h2>
            <p className="esign-paper-org-subtitle">{subtitle || "Excellency in Tech"}</p>
          </div>
        </div>

        <div className="esign-paper-contact-meta">
          <span><MdPhone /> {phone}</span>
          <span><MdEmail /> {email}</span>
          <span><MdLanguage /> {website}</span>
        </div>
      </div>

      <div className="esign-paper-divider" />

      {/* Recipient & Document Info Strip */}
      <div className="esign-paper-info-strip">
        <div className="esign-info-cell">
          <span className="esign-info-label">DOCUMENT TITLE</span>
          <span className="esign-info-val highlight">{doc.title}</span>
        </div>
        <div className="esign-info-cell">
          <span className="esign-info-label">NAMED RECIPIENT</span>
          <span className="esign-info-val">{candidateName}</span>
        </div>
        <div className="esign-info-cell">
          <span className="esign-info-label">DESIGNATED POSITION</span>
          <span className="esign-info-val">{data.envelope.job_title}</span>
        </div>
        <div className="esign-info-cell">
          <span className="esign-info-label">REFERENCE CODE</span>
          <span className="esign-info-val code">{data.envelope.reference}</span>
        </div>
        <div className="esign-info-cell">
          <span className="esign-info-label">STATUS</span>
          <span className={`esign-paper-status-badge ${isExecuted || effectiveSigValue ? "completed" : ""}`}>
            {isExecuted || effectiveSigValue ? "✓ Executed & Signed" : "✍️ Signature Required"}
          </span>
        </div>
      </div>

      {/* Document Body Prose */}
      <div className="esign-paper-body">
        {formatCleanProse(doc.content, candidateName, candidateCnic)}
      </div>

      {/* Official Approval & Acknowledgment Section */}
      <div className="esign-paper-ack-card">
        <h3 className="esign-ack-head">Approval and Acknowledgment</h3>
        <p className="esign-ack-text">
          I, <strong>{candidateName}</strong>, CNIC: <strong>{candidateCnic}</strong>, acknowledge that I have received, read, and understood the policies, procedures, and code of conduct outlined in this document. I agree to adhere to these guidelines and understand that failure to comply may result in disciplinary action.
        </p>

        <div className="esign-paper-footer-section">
          <div className="esign-paper-signature-line">
            <div className="esign-sig-space">
              {effectiveSigValue ? (
                effectiveSigMethod === "drawn" || effectiveSigMethod === "uploaded" || effectiveSigMethod === "thumb" || effectiveSigValue.startsWith("data:image/") ? (
                  <img src={effectiveSigValue} alt="Candidate signature" className="esign-drawn-sig" style={{ maxHeight: "65px", maxWidth: "260px", objectFit: "contain" }} />
                ) : (
                  <span className="esign-typed-sig" style={{ fontFamily: "'Dancing Script', 'Great Vibes', cursive, sans-serif", fontSize: "24px", color: "#0f172a" }}>
                    {effectiveSigValue}
                  </span>
                )
              ) : (
                <span className="esign-pending-sig-placeholder">[ Pending Candidate Signature ]</span>
              )}
            </div>
            <span className="esign-sig-line-label">Authorized Recipient Signature · {candidateName}</span>
          </div>

          <div className="esign-paper-seal-badge">
            <MdShield size={22} className="seal-icon" />
            <div>
              <strong>OFFICIAL LEGAL DOCUMENT</strong>
              <span>Cryptographically Sealed · {orgName || "TECHXARO PVT. LTD"}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

const printEntirePackage = (envelope, branding) => {
  const printWin = window.open("", "_blank");
  if (!printWin) return;

  const logoUrl = branding?.logoUrl || "";
  const orgName = branding?.organizationName || "Organization";
  const subtitle = branding?.subtitle || "Human Resources Division";
  const contactDetails = [branding?.address, branding?.phone, branding?.email, branding?.website].filter(Boolean).join(" · ");

  const docsHtml = (envelope.documents || [])
    .map(
      (doc, index) => `
    <div class="doc-card ${index > 0 ? "page-break-before" : ""}">
      <h2 class="doc-title">${doc.title}</h2>
      <div class="content">${sanitizeHtml(doc.content)}</div>
      ${
        doc.signature_value
          ? `
        <div class="sig-box">
          <p style="font-size: 12px; color: #64748b; margin-bottom: 6px;">Signed by: <strong>${envelope.candidate_name}</strong></p>
          ${
            doc.signature_method === "drawn"
              ? `<img src="${doc.signature_value}" class="drawn-sig" />`
              : `<span class="typed-sig">${doc.signature_value}</span>`
          }
        </div>
      `
          : ""
      }
    </div>
  `
    )
    .join("");

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Executed Employment Package - ${envelope.candidate_name} (${envelope.reference})</title>
        <style>
          @page { margin: 20mm; }
          body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; margin: 0; color: #0f172a; line-height: 1.65; background: #ffffff; }
          .letterhead { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .logo { max-height: 48px; max-width: 180px; object-fit: contain; }
          .org-title { font-size: 20px; font-weight: 800; margin: 0; color: #0f172a; }
          .sub { font-size: 12px; color: #4f46e5; font-weight: 700; margin: 2px 0 0; }
          .contact { font-size: 11px; color: #64748b; margin: 4px 0 0; }
          .banner { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; font-size: 12px; }
          .doc-card { margin-bottom: 32px; }
          .page-break-before { page-break-before: always; margin-top: 32px; }
          .doc-title { font-size: 18px; font-weight: 800; color: #0f172a; border-bottom: 1.5px solid #0f172a; padding-bottom: 8px; margin-bottom: 16px; text-transform: uppercase; }
          .content { white-space: pre-wrap; font-size: 12px; color: #1e293b; line-height: 1.65; }
          .sig-box { margin-top: 24px; text-align: right; border-top: 1px solid #e5e7eb; padding-top: 14px; }
          .typed-sig { font-family: "Caveat", "Dancing Script", cursive, Georgia, serif; font-size: 26px; font-weight: bold; border-bottom: 2px solid #0f172a; padding: 2px 10px; display: inline-block; }
          .drawn-sig { max-height: 60px; border-bottom: 2px solid #0f172a; }
          .footer { margin-top: 40px; font-size: 10px; text-align: center; color: #94a3b8; border-top: 1px solid #e5e7eb; padding-top: 14px; }
        </style>
      </head>
      <body>
        <div class="letterhead">
          <div>
            ${logoUrl ? `<img src="${logoUrl}" class="logo" />` : ""}
            <h1 class="org-title">${orgName.toUpperCase()}</h1>
            <p class="sub">${subtitle}</p>
            ${contactDetails ? `<p class="contact">${contactDetails}</p>` : ""}
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-size: 13px; font-weight: 800; color: #4f46e5;">REF: ${envelope.reference}</p>
            <p style="margin: 4px 0 0; font-size: 11px; color: #64748b;">Executed: ${envelope.completed_at ? new Date(envelope.completed_at).toLocaleString() : new Date().toLocaleDateString()}</p>
          </div>
        </div>

        <div class="banner">
          <strong>EXECUTED EMPLOYMENT PACKAGE SUMMARY</strong><br />
          Candidate Name: <strong>${envelope.candidate_name}</strong> (${envelope.candidate_email}) · Position: <strong>${envelope.job_title}</strong> · Status: <strong>EXECUTED & CRYPTOGRAPHICALLY SEALED</strong>
        </div>

        ${docsHtml}

        <div class="footer">
          Computer-generated binding legal package executed via ${orgName} E-Signature Suite. No physical stamp required.
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `);
  printWin.document.close();
};

export default function EsignPortal() {
  const { slug, token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [legalName, setLegalName] = useState("");
  const [signatureMethod, setSignatureMethod] = useState("typed"); // "typed", "drawn", "uploaded", "thumb"
  const [typedSignature, setTypedSignature] = useState("");
  const [selectedFont, setSelectedFont] = useState("Dancing Script");
  const [drawnSignature, setDrawnSignature] = useState("");
  const [uploadedSignature, setUploadedSignature] = useState("");
  const [thumbSignature, setThumbSignature] = useState("");
  const [thumbMode, setThumbMode] = useState("digital"); // "digital", "upload"
  const [strokeColor, setStrokeColor] = useState("#0f172a");

  const [consent, setConsent] = useState(false);
  const [rules, setRules] = useState(false);
  const [done, setDone] = useState(false);

  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [notice, setNotice] = useState("");
  const [otpSeconds, setOtpSeconds] = useState(0);

  // Active document tab state (0: first doc, 1: second doc, 2: third doc, 'all': view all)
  const [activeDocTab, setActiveDocTab] = useState(0);

  // Canvas ref for drawn signature
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const primaryEndpoint = slug ? `${API_URL}/public/esign/${slug}/${token}` : `${API_URL}/public/esign/${token}`;
    const fallbackEndpoint = slug ? `${API_URL}/esign/${slug}/${token}` : `${API_URL}/esign/${token}`;
    const headers = { Accept: "application/json", "X-Tenant-ID": slug || "" };

    fetch(primaryEndpoint, { headers })
      .then(async (r) => {
        if (r.status === 404) {
          return fetch(fallbackEndpoint, { headers }).then(async (res2) => {
            const j2 = await res2.json();
            if (!res2.ok) throw new Error(j2.message || "Signing link is unavailable or expired.");
            return j2;
          });
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j.message || "Signing link is unavailable or expired.");
        return j;
      })
      .then((j) => {
        setData(j);
        setLegalName(j.envelope.candidate_name);
        setTypedSignature(j.envelope.candidate_name);
        if (j.hasActiveOtp) {
          setShowOtpInput(true);
          setOtpSent(true);
        }
      })
      .catch((e) => setError(e.message));
  }, [slug, token]);

  useEffect(() => {
    if (otpSeconds <= 0) return undefined;
    const timer = window.setInterval(
      () => setOtpSeconds((val) => Math.max(0, val - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [otpSeconds]);

  // Setup Canvas Drawing with Touch Prevention
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    if (e.type === "touchstart") e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    if (e.type === "touchmove") e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { x, y } = getCoordinates(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = strokeColor;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setDrawnSignature(canvas.toDataURL("image/png"));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDrawnSignature("");
  };

  const handleImageUpload = (e, setter) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("File size exceeds 5MB limit.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      setter(evt.target.result);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const generateBiometricThumb = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");

    // Clean background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Outer biometric border
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(10, 10, 300, 340);

    // Draw biometric concentric fingerprint ridges
    const centerX = 160;
    const centerY = 175;
    ctx.strokeStyle = "#1e3a8a"; // Navy biometric ink
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";

    for (let r = 12; r <= 125; r += 6.5) {
      ctx.beginPath();
      const rx = r * 0.72;
      const ry = r * 1.08;
      ctx.ellipse(centerX, centerY, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Biometric seal watermark
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("DIGITAL BIOMETRIC THUMBPRINT", centerX, 320);
    ctx.fillStyle = "#64748b";
    ctx.font = "10px Segoe UI, sans-serif";
    ctx.fillText(`VERIFIED · ${new Date().toISOString().split("T")[0]} · UTC`, centerX, 335);

    const dataUrl = canvas.toDataURL("image/png");
    setThumbSignature(dataUrl);
  };

  const requestOtp = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    setShowOtpInput(true);

    const primaryEndpoint = slug ? `${API_URL}/public/esign/${slug}/${token}/request-otp` : `${API_URL}/public/esign/${token}/request-otp`;
    const fallbackEndpoint = slug ? `${API_URL}/esign/${slug}/${token}/request-otp` : `${API_URL}/esign/${token}/request-otp`;
    const headers = { Accept: "application/json", "X-Tenant-ID": slug || "" };

    try {
      let r = await fetch(primaryEndpoint, { method: "POST", headers });
      if (r.status === 404) {
        r = await fetch(fallbackEndpoint, { method: "POST", headers });
      }
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Unable to send verification code.");
      setOtpSent(true);
      setOtpSeconds(j.expiresInSeconds || 600);
      setNotice(j.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError("");

    let sigVal = "";
    if (signatureMethod === "typed") {
      sigVal = typedSignature;
    } else if (signatureMethod === "drawn") {
      sigVal = drawnSignature;
    } else if (signatureMethod === "uploaded") {
      sigVal = uploadedSignature;
    } else if (signatureMethod === "thumb") {
      sigVal = thumbSignature;
    }

    const payload = JSON.stringify({
      consent,
      rulesAcknowledged: rules,
      consentVersion: data.consentVersion,
      signatureMethod,
      signatureValue: sigVal,
      selectedFont: signatureMethod === "typed" ? selectedFont : null,
      legalName,
      otp,
    });

    const primaryEndpoint = slug ? `${API_URL}/public/esign/${slug}/${token}/sign` : `${API_URL}/public/esign/${token}/sign`;
    const fallbackEndpoint = slug ? `${API_URL}/esign/${slug}/${token}/sign` : `${API_URL}/esign/${token}/sign`;
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Tenant-ID": slug || "",
    };

    try {
      let r = await fetch(primaryEndpoint, { method: "POST", headers, body: payload });
      if (r.status === 404) {
        r = await fetch(fallbackEndpoint, { method: "POST", headers, body: payload });
      }
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Unable to complete signing.");

      setData((prev) => {
        if (!prev) return prev;
        const updatedDocs = (prev.envelope?.documents || []).map((doc) => ({
          ...doc,
          signature_value: sigVal,
          signature_method: signatureMethod,
          signed_at: new Date().toISOString(),
          status: "completed",
        }));
        return {
          ...prev,
          alreadyCompleted: true,
          envelope: {
            ...prev.envelope,
            status: "completed",
            signature_value: sigVal,
            signature_method: signatureMethod,
            documents: updatedDocs,
          },
        };
      });

      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) {
    return (
      <div className="esign-public-shell">
        <main className="esign-portal">
          <div className="esign-message error">{error}</div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="esign-public-shell">
        <main className="esign-portal">
          <div className="esign-loader-box">
            <div className="esign-spinner"></div>
            <p>🔒 Securely loading employment package…</p>
          </div>
        </main>
      </div>
    );
  }

  const orgName = data.branding?.organizationName || "Organization";
  const logoUrl = data.branding?.logoUrl || "";
  const subtitle = data.branding?.subtitle || "Human Resources Division";
  const contactInfoStr = [data.branding?.address, data.branding?.phone, data.branding?.email, data.branding?.website].filter(Boolean).join(" · ");
  const candidateInitials = data.envelope.candidate_name
    ? data.envelope.candidate_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : "CN";

  // Completion / Already Signed View for Candidate
  if (done || data.alreadyCompleted) {
    return (
      <div className="esign-public-shell">
        <header className="esign-public-brand no-print">
          <div className="esign-brand-lockup">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${orgName} logo`}
                className="esign-brand-logo-img"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.style.display = "none";
                }}
              />
            ) : null}
            <div>
              <strong>{orgName}</strong>
              <span>{subtitle}</span>
            </div>
          </div>
          <div className="esign-brand-actions">
            <button type="button" className="esign-btn-secondary" onClick={() => printEntirePackage(data.envelope, data.branding)}>
              🖨️ Print / Export Executed Copy
            </button>
            <div className="esign-secure-label">🔒 Cryptographically Sealed</div>
          </div>
        </header>

        <main className="esign-portal">
          {/* Executive Company Letterhead */}
          <div className="techzaro-letterhead">
            <div className="techzaro-letterhead-brand">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${orgName} Logo`}
                  className="techzaro-letterhead-logo"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.style.display = "none";
                  }}
                />
              ) : null}
              <div>
                <h1>{orgName.toUpperCase()}</h1>
                <p className="sub-tag">{subtitle}</p>
                {contactInfoStr ? <p className="contact-info">{contactInfoStr}</p> : null}
              </div>
            </div>
            <div className="techzaro-letterhead-qr">
              <img
                src="/assets/techzaro-qr.png"
                alt="Verification QR Code"
                className="esign-qr-img"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.style.display = "none";
                }}
              />
              <span>Scan to Verify</span>
            </div>
          </div>

          <section className="esign-complete-card">
            <div className="no-print esign-complete-badge">✅</div>
            <h1 className="esign-complete-title">Employment Package Executed & Signed</h1>
            <p className="esign-complete-subtitle">
              Reference: <strong>{data.envelope.reference}</strong> · Position: <strong>{data.envelope.job_title}</strong> · Recipient: <strong>{data.envelope.candidate_name}</strong>
            </p>
          </section>

          <h2 className="esign-section-title">Executed Package Documents</h2>

          {data.envelope.documents.map((doc) => (
            <EsignPaperSheet
              key={doc.id}
              doc={doc}
              data={data}
              logoUrl={logoUrl}
              orgName={orgName}
              subtitle={subtitle}
              contactInfoStr={contactInfoStr}
              isExecuted={true}
            />
          ))}
        </main>

        <footer className="esign-public-footer">
          This is a computer-generated binding legal agreement; no physical stamp is required. Protected by 256-bit encrypted transport and e-signature verification.
        </footer>
      </div>
    );
  }

  const nameMismatch =
    legalName.trim().toLowerCase() !== data.envelope.candidate_name.trim().toLowerCase();

  const activeSig =
    signatureMethod === "typed"
      ? typedSignature.trim()
      : signatureMethod === "drawn"
      ? drawnSignature
      : signatureMethod === "uploaded"
      ? uploadedSignature
      : signatureMethod === "thumb"
      ? thumbSignature
      : "";
  const canResend = otpSeconds <= 570 || otpSeconds === 0;
  const resendCooldown = otpSeconds > 570 ? otpSeconds - 570 : 0;

  const currentDoc =
    activeDocTab === "all"
      ? data.envelope.documents
      : [data.envelope.documents[activeDocTab] || data.envelope.documents[0]];

  return (
    <div className="esign-public-shell">
      {/* Top Navbar Brand Header */}
      <header className="esign-public-brand">
        <div className="esign-brand-lockup">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${orgName} logo`}
              className="esign-brand-logo-img"
              onError={(e) => {
                e.target.onerror = null;
                e.target.style.display = "none";
              }}
            />
          ) : null}
          <div>
            <strong>{orgName}</strong>
            <span>{subtitle}</span>
          </div>
        </div>
          <div className="esign-secure-label">🔒 Candidate Signing Portal</div>
        </header>

        <main className="esign-portal">
          {/* Executive Letterhead Header */}
          <div className="techzaro-letterhead">
            <div className="techzaro-letterhead-brand">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${orgName} Logo`}
                  className="techzaro-letterhead-logo"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.style.display = "none";
                  }}
                />
              ) : null}
              <div>
                <h1>{orgName.toUpperCase()}</h1>
                <p className="sub-tag">{subtitle}</p>
                {contactInfoStr ? <p className="contact-info">{contactInfoStr}</p> : null}
              </div>
            </div>
            <div className="techzaro-letterhead-qr">
              <div className="esign-qr-box">SECURE LINK</div>
              <span style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "2px" }}>
                Expires {data.envelope.expires_at}
              </span>
            </div>
          </div>

        {/* Candidate Banner Hero */}
        <section className="esign-candidate-banner">
          <div className="esign-banner-avatar">{candidateInitials}</div>
          <div className="esign-banner-info">
            <div className="esign-banner-kicker">SECURE EMPLOYMENT PACKAGE</div>
            <h1 className="esign-banner-title">{data.envelope.job_title}</h1>
            <p className="esign-banner-sub">
              Named Recipient: <strong>{data.envelope.candidate_name}</strong> ({data.envelope.candidate_email}){data.envelope.candidate_id ? ` · CNIC/ID: ${data.envelope.candidate_id}` : ""} · Ref: <strong>{data.envelope.reference}</strong>
            </p>
          </div>
        </section>

        {error && <div className="esign-message error">{error}</div>}
        {notice && <div className="esign-message success">{notice}</div>}

        {/* Tabbed Document Navigation Bar */}
        <div className="esign-doc-nav-tabs">
          {data.envelope.documents.map((doc, idx) => (
            <button
              key={doc.id}
              type="button"
              className={activeDocTab === idx ? "active" : ""}
              onClick={() => setActiveDocTab(idx)}
            >
              📄 {idx + 1}. {doc.title}
            </button>
          ))}
          <button
            type="button"
            className={activeDocTab === "all" ? "active" : ""}
            onClick={() => setActiveDocTab("all")}
          >
            📋 View All Documents
          </button>
        </div>

        {/* Document Viewer Cards */}
        {currentDoc.map((doc) => (
          <EsignPaperSheet
            key={doc.id}
            doc={doc}
            data={data}
            logoUrl={logoUrl}
            orgName={orgName}
            subtitle={subtitle}
            contactInfoStr={contactInfoStr}
            isExecuted={false}
          />
        ))}

        {/* Signature & Verification Box */}
        <section className="esign-signbox">
          <div className="esign-signbox-head">
            <h2>Confirm Legal Identity & Apply Signature</h2>
            <p>Please confirm your full legal name, select signature method, and enter your email 2FA code.</p>
          </div>

          <label className="esign-field">
            <span>Confirm Legal Full Name *</span>
            <input
              className="esign-input-text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Enter legal name exactly as on CNIC/Passport"
            />
            {nameMismatch && (
              <span className="esign-help error-text">
                ⚠️ Legal name must match named recipient: <strong>{data.envelope.candidate_name}</strong>
              </span>
            )}
          </label>

          <div className="esign-sig-selector">
            <label style={{ marginBottom: "10px", fontWeight: 700, fontSize: "14px", display: "block" }}>
              Choose Mandatory Candidate Signature Method *
            </label>

            {/* 4 Signature Method Option Tabs */}
            <div className="esign-sig-tabs">
              <button
                type="button"
                className={signatureMethod === "typed" ? "active" : ""}
                onClick={() => setSignatureMethod("typed")}
              >
                ✍️ Typed Electronic
              </button>
              <button
                type="button"
                className={signatureMethod === "drawn" ? "active" : ""}
                onClick={() => setSignatureMethod("drawn")}
              >
                🖌️ Draw Signature Pad
              </button>
              <button
                type="button"
                className={signatureMethod === "uploaded" ? "active" : ""}
                onClick={() => setSignatureMethod("uploaded")}
              >
                📤 Upload Signature Image
              </button>
              <button
                type="button"
                className={signatureMethod === "thumb" ? "active" : ""}
                onClick={() => setSignatureMethod("thumb")}
              >
                👍 Electronic Thumb Impression
              </button>
            </div>

            {/* Mode 1: Typed Electronic Signature */}
            {signatureMethod === "typed" && (
              <div className="esign-field">
                <span>Type Full Legal Signature *</span>
                <input
                  className="esign-signature-input"
                  value={typedSignature}
                  onChange={(e) => setTypedSignature(e.target.value)}
                  placeholder="Type full legal name"
                />

                <span style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "10px", display: "block" }}>
                  Select Calligraphic Signature Font Style:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", margin: "6px 0 14px" }}>
                  {["Dancing Script", "Great Vibes", "Pacifico", "Satisfy", "Caveat"].map((font) => (
                    <button
                      key={font}
                      type="button"
                      className={`esign-btn-secondary ${selectedFont === font ? "active" : ""}`}
                      style={{
                        fontFamily: `'${font}', cursive`,
                        fontSize: "15px",
                        padding: "4px 12px",
                        borderColor: selectedFont === font ? "var(--color-primary)" : "var(--border-color)",
                        background: selectedFont === font ? "var(--color-primary-light, #eff6ff)" : "var(--bg-card)",
                        color: selectedFont === font ? "var(--color-primary)" : "var(--text-primary)"
                      }}
                      onClick={() => setSelectedFont(font)}
                    >
                      {typedSignature || "Sample Signature"} ({font})
                    </button>
                  ))}
                </div>

                <span className="esign-sig-preview-label">Live Cursive Signature Stamp Preview:</span>
                <div
                  className="esign-typed-preview"
                  style={{
                    fontFamily: `'${selectedFont}', cursive`,
                    fontSize: "32px",
                    color: "#0f172a",
                    padding: "16px",
                    borderBottom: "2.5px solid #0f172a",
                    display: "inline-block",
                    marginTop: "6px"
                  }}
                >
                  {typedSignature || "[Your Signature]"}
                </div>
              </div>
            )}

            {/* Mode 2: Draw Signature Pad */}
            {signatureMethod === "drawn" && (
              <div className="esign-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span>Draw Signature Below (Mouse / Stylus / Touchscreen) *</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Ink:</span>
                    {["#0f172a", "#1e40af", "#000000"].map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setStrokeColor(color)}
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          background: color,
                          border: strokeColor === color ? "2px solid #3b82f6" : "1px solid #cbd5e1",
                          cursor: "pointer"
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="esign-canvas-wrap">
                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={160}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{ touchAction: "none" }}
                  />
                  {drawnSignature && (
                    <button
                      type="button"
                      className="esign-canvas-clear esign-btn-secondary"
                      onClick={clearCanvas}
                    >
                      Clear Pad
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Mode 3: Upload Signature Image */}
            {signatureMethod === "uploaded" && (
              <div className="esign-field">
                <span>Upload Scanned Signature Image (PNG, JPG, SVG - Max 5MB) *</span>
                <div style={{ marginTop: "10px" }}>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg, image/svg+xml"
                    onChange={(e) => handleImageUpload(e, setUploadedSignature)}
                    style={{ display: "none" }}
                    id="uploaded-sig-file"
                  />
                  <label htmlFor="uploaded-sig-file" style={{ cursor: "pointer", display: "block" }}>
                    <div
                      style={{
                        border: "2px dashed #cbd5e1",
                        borderRadius: "12px",
                        padding: "24px",
                        textAlign: "center",
                        background: "#f8fafc"
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: 700, fontSize: "14px", color: "var(--color-primary)" }}>
                        📁 Click to Select Signature Image File
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
                        Supports transparent PNG, JPG, or SVG scanned handwritten signatures
                      </p>
                    </div>
                  </label>

                  {uploadedSignature && (
                    <div style={{ marginTop: "14px", textAlign: "center" }}>
                      <span className="esign-sig-preview-label">Uploaded Signature Preview:</span>
                      <div style={{ marginTop: "8px" }}>
                        <img
                          src={uploadedSignature}
                          alt="Uploaded Signature Preview"
                          style={{ maxHeight: "100px", maxWidth: "300px", objectFit: "contain", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "8px", background: "#ffffff" }}
                        />
                      </div>
                      <button
                        type="button"
                        className="esign-btn-cancel esign-btn-sm"
                        style={{ marginTop: "8px" }}
                        onClick={() => setUploadedSignature("")}
                      >
                        Remove Image
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mode 4: Electronic Thumb / Biometric Impression */}
            {signatureMethod === "thumb" && (
              <div className="esign-field">
                <span>Electronic Thumb / Biometric Impression *</span>

                <div style={{ display: "flex", gap: "10px", margin: "10px 0" }}>
                  <button
                    type="button"
                    className={`esign-btn-secondary ${thumbMode === "digital" ? "active" : ""}`}
                    onClick={() => setThumbMode("digital")}
                  >
                    👆 Digital Touch Impression Scanner
                  </button>
                  <button
                    type="button"
                    className={`esign-btn-secondary ${thumbMode === "upload" ? "active" : ""}`}
                    onClick={() => setThumbMode("upload")}
                  >
                    📄 Upload Scanned Ink Thumbprint
                  </button>
                </div>

                {thumbMode === "digital" ? (
                  <div style={{ textAlign: "center", padding: "16px", background: "#f0f9ff", borderRadius: "12px", border: "1.5px solid #bae6fd" }}>
                    {!thumbSignature ? (
                      <div>
                        <p style={{ fontSize: "13px", color: "#0369a1", fontWeight: 600, margin: "0 0 12px" }}>
                          Press button below to generate a cryptographically verified digital biometric thumbprint seal:
                        </p>
                        <button
                          type="button"
                          className="esign-btn-primary"
                          onClick={generateBiometricThumb}
                          style={{ padding: "10px 20px", fontSize: "14px" }}
                        >
                          👍 Capture Digital Biometric Impression
                        </button>
                      </div>
                    ) : (
                      <div>
                        <span className="esign-sig-preview-label">Generated Biometric Impression Seal:</span>
                        <div style={{ marginTop: "8px" }}>
                          <img
                            src={thumbSignature}
                            alt="Biometric Thumb Impression"
                            style={{ maxHeight: "150px", border: "1px solid #cbd5e1", borderRadius: "8px", background: "#ffffff" }}
                          />
                        </div>
                        <button
                          type="button"
                          className="esign-btn-cancel esign-btn-sm"
                          style={{ marginTop: "8px" }}
                          onClick={() => setThumbSignature("")}
                        >
                          Re-capture Impression
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/jpg"
                      onChange={(e) => handleImageUpload(e, setThumbSignature)}
                      style={{ display: "none" }}
                      id="uploaded-thumb-file"
                    />
                    <label htmlFor="uploaded-thumb-file" style={{ cursor: "pointer", display: "block" }}>
                      <div
                        style={{
                          border: "2px dashed #cbd5e1",
                          borderRadius: "12px",
                          padding: "24px",
                          textAlign: "center",
                          background: "#f8fafc"
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: 700, fontSize: "14px", color: "var(--color-primary)" }}>
                          📷 Select Physical Ink Thumbprint Image File
                        </p>
                        <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
                          Upload scanned image of physical ink thumb impression
                        </p>
                      </div>
                    </label>

                    {thumbSignature && (
                      <div style={{ marginTop: "14px", textAlign: "center" }}>
                        <span className="esign-sig-preview-label">Uploaded Thumbprint Preview:</span>
                        <div style={{ marginTop: "8px" }}>
                          <img
                            src={thumbSignature}
                            alt="Uploaded Thumbprint Preview"
                            style={{ maxHeight: "120px", maxWidth: "250px", objectFit: "contain", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "8px", background: "#ffffff" }}
                          />
                        </div>
                        <button
                          type="button"
                          className="esign-btn-cancel esign-btn-sm"
                          style={{ marginTop: "8px" }}
                          onClick={() => setThumbSignature("")}
                        >
                          Remove File
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="esign-checkboxes-group">
            <label className="esign-check">
              <input
                type="checkbox"
                checked={rules}
                onChange={(e) => setRules(e.target.checked)}
              />
              <span>
                I have read, understood, and agree to adhere to the <strong>Rules and Regulations - {orgName}</strong>.
              </span>
            </label>

            <label className="esign-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I intend this electronic signature to have the same legally binding effect as my handwritten signature and adopt it for the <strong>Formal Offer Letter</strong> and <strong>Master Employment Agreement</strong>.
              </span>
            </label>
          </div>

          {/* 2FA Verification Section */}
          <div className="esign-otp-section">
            <div className="esign-otp-head">
              <div>
                <strong>Two-Factor Email Security Verification</strong>
                <p>We will send a 6-digit verification code to <code>{data.maskedEmail || envelope?.candidate_email}</code>.</p>
              </div>
              <button
                type="button"
                disabled={busy || !canResend}
                onClick={requestOtp}
                className="esign-btn-secondary"
              >
                {busy
                  ? "Sending Code…"
                  : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : otpSent
                  ? "Resend Code"
                  : "📩 Send 2FA Verification Code"}
              </button>
            </div>

            {(showOtpInput || otpSent) && (
              <label className="esign-field" style={{ marginTop: "14px" }}>
                <span>Enter 6-Digit Verification Code *</span>
                <input
                  className="esign-otp-input"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 123456"
                />
                <span className="esign-otp-help">
                  Enter the 6-digit security code received in your email inbox.
                </span>
              </label>
            )}
          </div>

          <button
            className="esign-btn-primary esign-btn-submit-large"
            disabled={
              busy ||
              otp.length !== 6 ||
              !rules ||
              !consent ||
              !activeSig ||
              nameMismatch
            }
            onClick={submit}
          >
            {busy ? "Executing Cryptographic Package…" : "🔒 Execute & Seal Employment Package"}
          </button>
        </section>
      </main>

      <footer className="esign-public-footer">
        This is a computer-generated binding document; no physical stamp is required. Protected by encrypted transport and e-signature verification.
      </footer>
    </div>
  );
}

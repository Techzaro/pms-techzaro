import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/layout/DashboardLayout';
import Breadcrumb from '../components/Breadcrumb';
import { useOrgBranding, useUpdateBranding } from '../hooks/useOrgBranding';

export default function BrandingPage() {
  const { t } = useTranslation();
  return (
    <DashboardLayout>
      <Breadcrumb items={[{ label: t('Branding', { defaultValue: 'Branding' }) }]} />
      <BrandingSection />
    </DashboardLayout>
  );
}

function BrandingSection() {
  const { t } = useTranslation();
  const { data: branding, isLoading } = useOrgBranding();
  const updateBranding = useUpdateBranding();

  const [subtitle, setSubtitle] = useState('');
  const [orgName, setOrgName] = useState('');
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [origSubtitle, setOrigSubtitle] = useState('');
  const [origOrgName, setOrigOrgName] = useState('');
  const [origLogoUrl, setOrigLogoUrl] = useState(null);
  const fileInputRef = useRef(null);

  if (isLoading && !initialized) {
    return (
      <div style={{ background: "var(--bg-card)", borderRadius: "20px", padding: "24px", boxShadow: "var(--shadow-sm)" }}>
        <div className="animate-pulse space-y-4">
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-64" />
        </div>
      </div>
    );
  }

  if (branding && !initialized) {
    const sub = branding.subtitle || 'PMS Portal';
    const org = branding.org_name || '';
    const logo = branding.logo_url || null;
    setSubtitle(sub);
    setOrgName(org);
    setLogoPreview(logo);
    setOrigSubtitle(sub);
    setOrigOrgName(org);
    setOrigLogoUrl(logo);
    setInitialized(true);
  }

  const isDirty = subtitle !== origSubtitle || orgName !== origOrgName || logoPreview !== origLogoUrl || logoFile !== null || removeLogo;

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type)) return;
    if (file.size > 2 * 1024 * 1024) return;

    setLogoFile(file);
    setRemoveLogo(false);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setRemoveLogo(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveBranding = async () => {
    const formData = new FormData();
    formData.append('subtitle', subtitle);
    formData.append('org_name', orgName);
    if (logoFile) {
      formData.append('logo', logoFile);
    }
    if (removeLogo) {
      formData.append('remove_logo', '1');
    }

    try {
      await updateBranding.mutateAsync(formData);
      const fresh = useQueryClient().getQueryData(["organization-branding"]);
      if (fresh) {
        const serverLogo = fresh.logo_url || null;
        setOrigSubtitle(fresh.subtitle || 'PMS Portal');
        setOrigOrgName(fresh.org_name || '');
        setOrigLogoUrl(serverLogo);
        setLogoPreview(serverLogo);
        setLogoFile(null);
        setRemoveLogo(false);
      }
    } catch (err) {
      // error handled by mutation
    }
  };

  const initials = (subtitle || 'PMS').substring(0, 2).toUpperCase();

  return (
    <div style={{ background: "var(--bg-card)", borderRadius: "20px", padding: "24px", boxShadow: "var(--shadow-sm)" }}>
      <div className="flex flex-col sm:flex-row gap-8 items-start">
        {/* Left side - Form */}
        <div className="flex-1 space-y-5">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>{t('Subtitle Text', { defaultValue: 'Subtitle Text' })}</label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                maxLength={100}
                className="w-full"
                style={{
                  padding: "10px 14px",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "12px",
                  fontSize: "14px",
                  color: "var(--text-dark)",
                  outline: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "var(--color-primary)"}
                onBlur={(e) => e.target.style.borderColor = "var(--border-light)"}
                placeholder={t("e.g. PMS Portal", { defaultValue: "e.g. PMS Portal" })}
              />
            </div>

            <div className="flex-1">
              <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>{t('Organization Name', { defaultValue: 'Organization Name' })}</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                maxLength={100}
                className="w-full"
                style={{
                  padding: "10px 14px",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "12px",
                  fontSize: "14px",
                  color: "var(--text-dark)",
                  outline: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "var(--color-primary)"}
                onBlur={(e) => e.target.style.borderColor = "var(--border-light)"}
                placeholder={t("e.g. TechXaro, Foxstax", { defaultValue: "e.g. TechXaro, Foxstax" })}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>{t('Organization Logo', { defaultValue: 'Organization Logo' })}</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              onChange={handleLogoChange}
              className="hidden"
              id="logo-upload"
            />
            <div className="flex items-center gap-3 mt-1.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  background: "var(--color-primary)",
                  color: "white",
                  borderRadius: "12px",
                  fontSize: "14px",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  transition: "0.2s",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {logoFile ? t('Change Logo', { defaultValue: 'Change Logo' }) : t('Upload Logo', { defaultValue: 'Upload Logo' })}
              </button>
              {logoPreview && (
                <button
                  onClick={handleRemoveLogo}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "10px 18px",
                    background: "var(--bg-hover)",
                    color: "var(--text-dark)",
                    borderRadius: "12px",
                    fontSize: "14px",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    transition: "0.2s",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  {t('Remove', { defaultValue: 'Remove' })}
                </button>
              )}
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>{t('JPG, PNG, WebP or SVG. Max 2MB.', { defaultValue: 'JPG, PNG, WebP or SVG. Max 2MB.' })}</p>
          </div>
        </div>

        {/* Right side - Preview */}
        <div className="flex-shrink-0">
          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "10px" }}>{t('Preview', { defaultValue: 'Preview' })}</p>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 18px",
            background: "var(--bg-hover)",
            borderRadius: "14px",
            border: "1px solid var(--border-light)",
          }}>
            <div style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              background: "var(--text-heading)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}>
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ color: "white", fontSize: "14px", fontWeight: 700 }}>{initials}</span>
              )}
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text-heading)", lineHeight: 1.2 }}>{subtitle || t('PMS Portal', { defaultValue: 'PMS Portal' })}</h4>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{orgName || t('Organization', { defaultValue: 'Organization' })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ marginTop: "24px", paddingTop: "18px", borderTop: "1px solid var(--border-light)", display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleSaveBranding}
          disabled={updateBranding.isPending || !isDirty}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            background: "var(--color-primary)",
            color: "white",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: 600,
            border: "none",
            cursor: updateBranding.isPending || !isDirty ? "not-allowed" : "pointer",
            opacity: updateBranding.isPending || !isDirty ? 0.5 : 1,
            transition: "0.2s",
          }}
        >
          <Save className="w-4 h-4" />
          {updateBranding.isPending ? t('Saving...', { defaultValue: 'Saving...' }) : t('Save Branding', { defaultValue: 'Save Branding' })}
        </button>
      </div>
    </div>
  );
}

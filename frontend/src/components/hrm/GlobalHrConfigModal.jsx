import "react";
import { X } from "lucide-react";

export default function GlobalHrConfigModal({
  isOpen,
  onClose,
  country,
  state,
  currency,
  timeZone,
  payrollFreq,
  worldData,
  onCountryChange,
  onStateChange,
  onCurrencyChange,
  onTimeZoneChange,
  onPayrollFreqChange,
  onAutoFetchUsDefaults,
  onSaveSettings,
}) {
  if (!isOpen) return null;

  return (
    <div className="att-modal-overlay" onClick={onClose}>
      <div className="att-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px" }}>
        <div className="att-modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>Global Enterprise HR &amp; System Settings</h3>
            <span style={{ fontSize: "11px", color: "#64748b" }}>
              Configure enterprise country, state/province, currency, time zone &amp; payroll parameters
            </span>
          </div>
          <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSaveSettings}>
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "10px 14px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "12px", color: "#1e40af" }}>
                <strong>Enterprise Location Auto-Preset:</strong> Load US Enterprise Standard Settings
              </div>
              <button
                type="button"
                style={{ padding: "6px 12px", fontSize: "11px", fontWeight: "700", background: "#0082ff", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
                onClick={onAutoFetchUsDefaults}
              >
                🇺🇸 Auto-Fetch United States Defaults
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label htmlFor="cfg-country" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Primary Country</label>
                <select
                  id="cfg-country"
                  className="att-input"
                  value={country}
                  onChange={(e) => onCountryChange(e.target.value)}
                >
                  {Object.keys(worldData || {}).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="cfg-state" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>State / Province / Region</label>
                <select
                  id="cfg-state"
                  className="att-input"
                  value={state}
                  onChange={(e) => onStateChange(e.target.value)}
                >
                  {((worldData?.[country]?.states) || [state]).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="cfg-currency" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>System Currency</label>
                <select
                  id="cfg-currency"
                  className="att-input"
                  value={currency}
                  onChange={(e) => onCurrencyChange(e.target.value)}
                >
                  <option value="USD">USD ($) - US Dollar</option>
                  <option value="GBP">GBP (£) - British Pound</option>
                  <option value="EUR">EUR (€) - Euro</option>
                  <option value="CAD">CAD ($) - Canadian Dollar</option>
                  <option value="AUD">AUD ($) - Australian Dollar</option>
                  <option value="AED">AED (AED) - UAE Dirham</option>
                  <option value="SAR">SAR (SR) - Saudi Riyal</option>
                  <option value="PKR">PKR (Rs) - Pakistani Rupee</option>
                  <option value="INR">INR (₹) - Indian Rupee</option>
                  <option value="SGD">SGD ($) - Singapore Dollar</option>
                  <option value="JPY">JPY (¥) - Japanese Yen</option>
                </select>
              </div>

              <div>
                <label htmlFor="cfg-timezone" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Time Zone</label>
                <select
                  id="cfg-timezone"
                  className="att-input"
                  value={timeZone}
                  onChange={(e) => onTimeZoneChange(e.target.value)}
                >
                  {((worldData?.[country]?.timezones) || [timeZone]).map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="cfg-payroll" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Payroll Cycle Frequency</label>
                <select id="cfg-payroll" className="att-input" value={payrollFreq} onChange={(e) => onPayrollFreqChange(e.target.value)}>
                  <option value="Monthly">Monthly Salary (End of Month)</option>
                  <option value="Bi-Weekly">Bi-Weekly Salary (Every 2 Weeks)</option>
                  <option value="Weekly">Weekly Wages (Every Friday)</option>
                  <option value="Daily">Daily Wage Rate</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
            <button type="button" className="att-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="att-btn att-btn--primary">
              Save HR Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

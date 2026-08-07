import React, { useState, useEffect } from "react";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";
import ApplicationDetailsPage from "../../components/hrm/ApplicationDetailsPage";
import ApplicationTypesManager from "../../components/hrm/ApplicationTypesManager";
import {
  Search,
  Filter,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  Printer,
  Sliders,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  RotateCcw,
  HelpCircle,
  Lock,
  ChevronLeft,
  ChevronRight,
  User,
  Building,
  Tag,
  Calendar,
  Layers,
  Paperclip,
  MessageSquare
} from "lucide-react";
import "./ApplicationHistoryTab.css";

function ApplicationHistoryTab() {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, per_page: 15, last_page: 1, stats: {} });
  const [filtersData, setFiltersData] = useState({ employees: [], types: [], statuses: [] });
  const [loading, setLoading] = useState(true);

  // Active Filter state
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("All");
  const [applicationTypeId, setApplicationTypeId] = useState("All");
  const [status, setStatus] = useState("All");

  // Pagination & Sorting
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);

  // Modal State
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, [page, perPage, employeeId, applicationTypeId, status, search]);

  const fetchApplications = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = authToken();
      const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };

      let url = `${API_URL}/hrm/application-history?page=${page}&per_page=${perPage}`;
      if (employeeId !== "All") url += `&employee_id=${employeeId}`;
      if (applicationTypeId !== "All") url += `&application_type_id=${applicationTypeId}`;
      if (status !== "All") url += `&status=${status}`;

      const res = await fetch(url, { headers });
      const json = await res.json();

      if (json.success) {
        setData(json.data);
        setMeta(json.meta);
        setFiltersData(json.filters);
      }
    } catch (err) {
      console.error("Failed to fetch application history", err);
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setSearch("");
    setEmployeeId("All");
    setApplicationTypeId("All");
    setStatus("All");
    setPage(1);
  };

  const getStatusBadge = (statusStr) => {
    const s = (statusStr || "Pending").toLowerCase();
    if (s === "approved") return <span className="app-badge app-badge--approved"><CheckCircle size={12} /> Approved</span>;
    if (s === "rejected") return <span className="app-badge app-badge--rejected"><XCircle size={12} /> Rejected</span>;
    if (s === "returned") return <span className="app-badge app-badge--returned"><RotateCcw size={12} /> Returned</span>;
    if (s === "closed" || s === "cancelled") return <span className="app-badge app-badge--closed"><Lock size={12} /> {statusStr}</span>;
    return <span className="app-badge app-badge--pending"><Clock size={12} /> Pending</span>;
  };

  if (selectedRequest) {
    return (
      <ApplicationDetailsPage
        requestId={selectedRequest}
        onBack={() => setSelectedRequest(null)}
        onRefresh={fetchApplications}
        isAdmin={true}
      />
    );
  }

  return (
    <section className="app-history-page" id="section-complete-application-history">
      {/* METRIC OVERVIEW CARDS */}
      <div className="history-stats-grid">
        <div className="stat-box">
          <span className="stat-label">Total Applications</span>
          <h3 className="stat-val">{meta.stats?.total || 0}</h3>
        </div>
        <div className="stat-box stat-box--pending">
          <span className="stat-label">Pending Approval</span>
          <h3 className="stat-val">{meta.stats?.pending || 0}</h3>
        </div>
        <div className="stat-box stat-box--approved">
          <span className="stat-label">Approved</span>
          <h3 className="stat-val">{meta.stats?.approved || 0}</h3>
        </div>
        <div className="stat-box stat-box--rejected">
          <span className="stat-label">Rejected / Cancelled</span>
          <h3 className="stat-val">{(meta.stats?.rejected || 0) + (meta.stats?.cancelled || 0)}</h3>
        </div>
      </div>

      {/* FILTER & CONTROL TOOLBAR */}
      <div className="history-toolbar-card">
        <div className="toolbar-top-row">
          <div className="export-controls">
            <button className="btn-refresh" onClick={() => fetchApplications()} title="Refresh Live Data">
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </div>

        <div className="filters-grid">
          <div className="filter-item">
            <label><User size={12} /> Employee:</label>
            <select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setPage(1); }}>
              <option value="All">All Employees</option>
              {filtersData.employees?.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label><Layers size={12} /> Type:</label>
            <select value={applicationTypeId} onChange={(e) => { setApplicationTypeId(e.target.value); setPage(1); }}>
              <option value="All">All Types</option>
              {filtersData.types?.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label><Clock size={12} /> Status:</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="All">All Statuses</option>
              {filtersData.statuses?.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="filter-item reset-col">
            <button className="btn-reset-filters" onClick={handleResetFilters}>Reset Filters</button>
          </div>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="history-table-card">
        {loading ? (
          <div className="table-loading">
            <p>Loading application history...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="table-empty">
            <p>No applications found.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Employee</th>
                  <th>Application Type</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Submitted Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.request_number}</strong></td>
                    <td>{row.employee?.name}</td>
                    <td>{row.type?.name}</td>
                    <td>{row.title}</td>
                    <td>{getStatusBadge(row.status)}</td>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td>
                      <button className="btn-view-details" onClick={() => setSelectedRequest(row.id)}>
                        <Eye size={14} /> View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION FOOTER */}
        <div className="table-footer">
          <div className="per-page-selector">
            <span>Show:</span>
            <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
              <option value={15}>15</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="pagination-controls">
            <button className="btn-page" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="page-indicator">Page {page} of {meta.last_page || 1}</span>
            <button className="btn-page" disabled={page >= (meta.last_page || 1)} onClick={() => setPage(p => p + 1)}>
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL */}
      <ApplicationTypesManager isOpen={manageTypesOpen} onClose={() => setManageTypesOpen(false)} />
    </section>
  );
}

export default ApplicationHistoryTab;

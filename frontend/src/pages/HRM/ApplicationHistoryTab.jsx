import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import API_URL from "../../config/api";
import { authToken, getCurrentRole } from "../../utils/auth";
import { subscribe } from "../../utils/eventBus";
import ApplicationDetailsPage from "../../components/hrm/ApplicationDetailsPage";
import ApplicationTypesManager from "../../components/hrm/ApplicationTypesManager";
import {
  Search,
  RefreshCw,
  FileText,
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
  Calendar,
  Layers
} from "lucide-react";
import "./ApplicationHistoryTab.css";

function ApplicationHistoryTab({ approverMode = false, excludeOwn = false }) {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, per_page: 15, last_page: 1, stats: {} });
  const [filtersData, setFiltersData] = useState({ employees: [], types: [], statuses: [] });
  const [loading, setLoading] = useState(true);

  // Active Filter state
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("All");
  const [department, setDepartment] = useState("All");
  const [applicationType, setApplicationType] = useState("All");
  const [status, setStatus] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // In approverMode always filter to assigned-to-me only
  const [assignedToMe, setAssignedToMe] = useState(approverMode);

  // Pagination & Sorting
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");

  // Modal State
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);

  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (id) {
      setSelectedRequest(Number(id));
    }
  }, [location.search]);


  useEffect(() => {
    fetchApplications();
    const interval = setInterval(() => {
      fetchApplications(true);
    }, 5000);
    const unsubscribe = subscribe('data:changed', () => fetchApplications(true));
    const refreshOnFocus = () => fetchApplications(true);
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      clearInterval(interval);
      unsubscribe();
      window.removeEventListener('focus', refreshOnFocus);
    };
    // The explicit query inputs define when polling must be restarted.
    // The explicit query inputs define when polling must be restarted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, employeeId, department, applicationType, status, search, dateFrom, dateTo, sortBy, sortDir, assignedToMe]);

  const fetchApplications = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = authToken();
      const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };

      let url = `${API_URL}/hrm/application-history?page=${page}&per_page=${perPage}&sort_by=${sortBy}&sort_dir=${sortDir}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (!approverMode && employeeId !== "All") url += `&employee_id=${employeeId}`;
      if (!approverMode && department !== "All") url += `&department=${encodeURIComponent(department)}`;
      if (applicationType !== "All") url += `&application_type=${applicationType}`;
      if (status !== "All") url += `&status=${encodeURIComponent(status)}`;
      if (dateFrom) url += `&date_from=${dateFrom}`;
      if (dateTo) url += `&date_to=${dateTo}`;
      // In approverMode: always filter to assigned-to-me only
      if (approverMode) url += `&assigned_to_me=1`;
      else if (assignedToMe) url += `&assigned_to_me=1`;
      // Always exclude viewer's own applications when excludeOwn is set
      if (excludeOwn || approverMode) url += `&exclude_own=1`;

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
    setDepartment("All");
    setApplicationType("All");
    setStatus("All");
    setDateFrom("");
    setDateTo("");
    setAssignedToMe(false);
    setSortBy("created_at");
    setSortDir("desc");
    setPage(1);
  };

  const getStatusBadge = (statusStr) => {
    const s = (statusStr || "Pending").toLowerCase();
    if (s === "approved" || s === "completed") return <span className="app-badge app-badge--approved"><CheckCircle size={12} /> {statusStr}</span>;
    if (s === "rejected") return <span className="app-badge app-badge--rejected"><XCircle size={12} /> Rejected</span>;
    if (s === "returned") return <span className="app-badge app-badge--returned"><RotateCcw size={12} /> Returned</span>;
    if (s === "additional information required") return <span className="app-badge app-badge--returned" style={{background:'#faf5ff', color:'#9333ea', borderColor:'#e9d5ff'}}><HelpCircle size={12} /> Info Req.</span>;
    if (s === "closed" || s === "cancelled") return <span className="app-badge app-badge--closed"><Lock size={12} /> {statusStr}</span>;
    if (s === "in progress") return <span className="app-badge app-badge--pending" style={{background:'#eff6ff', color:'#2563eb', borderColor:'#bfdbfe'}}><Clock size={12} /> In Progress</span>;
    if (s === "draft" || s === "submitted") return <span className="app-badge app-badge--closed"><FileText size={12} /> {statusStr}</span>;
    return <span className="app-badge app-badge--pending"><Clock size={12} /> {statusStr}</span>;
  };

  if (selectedRequest) {
    const role = getCurrentRole();
    const isUserAdminOrManager = ["admin", "manager", "hr_manager", "owner"].includes(role);
    return (
      <ApplicationDetailsPage
        requestId={selectedRequest}
        onBack={() => {
          setSelectedRequest(null);
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        }}
        onRefresh={fetchApplications}
        isAdmin={isUserAdminOrManager}
        isApprover={approverMode || isUserAdminOrManager}
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
          <div className="filter-item filter-search">
            <label><Search size={12} /> Search:</label>
            <input 
              type="text" 
              placeholder="Request ID, Name, Title"
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              onBlur={() => setPage(1)}
              onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
            />
          </div>

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
            <label><Building size={12} /> Department:</label>
            <select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }}>
              <option value="All">All Departments</option>
              {filtersData.departments?.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label><Layers size={12} /> Type:</label>
            <select value={applicationType} onChange={(e) => { setApplicationType(e.target.value); setPage(1); }}>
              <option value="All">All Types</option>
              {filtersData.types?.map(t => (
                <option key={t} value={t}>{t}</option>
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

          <div className="filter-item">
            <label><Calendar size={12} /> Date From:</label>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          </div>

          <div className="filter-item">
            <label><Calendar size={12} /> Date To:</label>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          </div>

          <div className="filter-item">
            <label><Sliders size={12} /> Sort By:</label>
            <select value={`${sortBy}|${sortDir}`} onChange={(e) => { 
                const [sb, sd] = e.target.value.split('|'); 
                setSortBy(sb); 
                setSortDir(sd); 
                setPage(1); 
            }}>
              <option value="created_at|desc">Newest First</option>
              <option value="created_at|asc">Oldest First</option>
              <option value="status|asc">Status (A-Z)</option>
              <option value="title|asc">Title (A-Z)</option>
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
                    <td>{row.application_type}</td>
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

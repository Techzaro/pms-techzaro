import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Breadcrumb from '../components/Breadcrumb';
import api from '../lib/api';
import {
  Building2, CreditCard, HardDrive, Users, FolderKanban, Calendar, Clock,
  Globe, Mail, Phone, Shield, Check, X, Database, FileText, Loader2,
  Info, CheckCircle, AlertTriangle, Settings, User, MailCheck, Trash2, Bell, Eye, Download, Receipt,
} from 'lucide-react';

const STATUS_MAP = {
  active: { bg: 'rgba(16,185,129,0.1)', color: '#059669', label: 'Active' },
  trial: { bg: 'rgba(99,102,241,0.1)', color: '#6366f1', label: 'Trial' },
  suspended: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626', label: 'Suspended' },
  cancelled: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626', label: 'Cancelled' },
  past_due: { bg: 'rgba(245,158,11,0.1)', color: '#d97706', label: 'Past Due' },
};
const INV_STATUS = {
  pending: { bg: 'rgba(245,158,11,0.1)', color: '#d97706', icon: Clock },
  approved: { bg: 'rgba(16,185,129,0.1)', color: '#059669', icon: CheckCircle },
  paid: { bg: 'rgba(16,185,129,0.1)', color: '#059669', icon: CheckCircle },
  rejected: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626', icon: X },
};


const fmt$ = (a,c='USD') => new Intl.NumberFormat('en-US',{style:'currency',currency:c,minimumFractionDigits:0,maximumFractionDigits:2}).format(a||0);
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}) : 'N/A';
const fmtDT = (d) => { if(!d) return null; const x=new Date(d); return { date:x.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}), time:x.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) }; };
const fmtB = (b) => { if(!b) return '0 B'; const g=b/(1024**3); return g>=1?`${g.toFixed(2)} GB`:`${(b/(1024**2)).toFixed(2)} MB`; };

function Badge({status}){ const s=STATUS_MAP[status]||STATUS_MAP.active; return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full" style={{background:s.bg,color:s.color}}><span className="w-1.5 h-1.5 rounded-full" style={{background:s.color}}/>{s.label}</span>; }

const sc = {
  card:{background:'var(--bg-card)',border:'1px solid var(--border-light)',borderRadius:'16px'},
  cardAlt:{background:'var(--bg-card)',border:'1px solid var(--border-light)',borderRadius:'12px'},
  infoBox:{background:'var(--color-primary-bg)',border:'1px solid var(--color-primary)'},
  text:{color:'var(--text-dark)'},
  th:{color:'var(--text-heading)'},
  ts:{color:'var(--text-secondary)'},
  tm:{color:'var(--text-muted)'},
};

export default function OrganizationDetailsPage() {
  const [data,setData]=useState(null);
  const [stSum,setStSum]=useState(null);
  const [bill,setBill]=useState(null);
  const [hist,setHist]=useState(null);
  const [ld,setLd]=useState(true);
  const [tab,setTab]=useState('details');
  const [stTab,setStTab]=useState('overview');
  const [stData,setStData]=useState(null);
  const [stNotif,setStNotif]=useState([]);
  const [stPinned,setStPinned]=useState([]);
  const [stPref,setStPref]=useState(null);
  const [stLd,setStLd]=useState(false);
  const [stPrefLd,setStPrefLd]=useState(false);
  const [stPrefSav,setStPrefSav]=useState(false);
  const [delModal,setDelModal]=useState(null);
  const [delLd,setDelLd]=useState(false);
  const [viewInv,setViewInv]=useState(null);
  const [now,setNow]=useState(new Date());
  const [tz,setTz]=useState('');
  const [savTz,setSavTz]=useState(false);
  const [toast,setToast]=useState(null);

  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t);},[]);

  const load=useCallback(async()=>{
    setLd(true);
    try{
      const[dR,sR]=await Promise.all([api.get('/organization-settings/details'),api.get('/organization/storage/summary')]);
      if(dR.success)setData(dR);
      if(sR.success)setStSum(sR);
    }catch{}
    setLd(false);
  },[]);

  useEffect(()=>{load();},[load]);

  const loadBill=useCallback(async()=>{try{const r=await api.get('/organization-settings/billing-history');if(r.success)setBill(r);}catch{}},[]);
  const loadHist=useCallback(async()=>{try{const r=await api.get('/organization-settings/subscription-history');if(r.success)setHist(r);}catch{}},[]);

  useEffect(()=>{if(tab==='bill'&&!bill)loadBill();if(tab==='hist'&&!hist)loadHist();},[tab,bill,hist,loadBill,loadHist]);

  const loadStData=useCallback(async()=>{setStLd(true);try{const r=await api.get('/organization/storage');if(r.success)setStData(r.storage);}catch{}setStLd(false);},[]);
  const loadStNotif=useCallback(async()=>{try{const r=await api.get('/organization/storage/notifications');if(r.success){setStNotif(r.notifications||[]);setStPinned(r.pinned||[]);}}catch{}},[]);
  const loadStPref=useCallback(async()=>{setStPrefLd(true);try{const r=await api.get('/organization/storage/preferences');if(r.success)setStPref(r.preferences);}catch{}setStPrefLd(false);},[]);

  useEffect(()=>{if(tab==='storage')loadStData();},[tab,loadStData]);
  useEffect(()=>{if(tab==='storage'&&stTab==='notifications')loadStNotif();if(tab==='storage'&&stTab==='preferences')loadStPref();},[tab,stTab,loadStNotif,loadStPref]);

  const{organization:o,subscription:sub,plan,trial_config:tc,modules,usage,domains}=data||{};
  const sUsed=stSum?.storage?.total_bytes||0;
  const sLim=plan?.max_storage_gb||5;
  const sLimB=sLim*1024**3;
  const sPct=sLimB>0?Math.min(100,Math.round(sUsed/sLimB*100)):0;
  const tFiles=stSum?.storage?.total_files||0;
  const isTrial=sub?.status==='trial';
  const isYr=sub?.billing_period==='yearly';
  const cPrice=isYr?(plan?.price_yearly||0):(plan?.price_monthly||0);
  let tl='';
  if(sub?.ends_at){const d=new Date(sub.ends_at)-now;if(d>0){if(isTrial&&tc?.trial_duration_unit==='minutes')tl=`${Math.floor(d/60000)} min left`;else if(isTrial&&tc?.trial_duration_unit==='hours')tl=`${Math.floor(d/3600000)} hr left`;else{const dy=Math.ceil(d/864e5);tl=`${dy} day${dy!==1?'s':''} left`;}}}

  if(ld)return <DashboardLayout hideRightSidebar><div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" style={{color:'var(--color-primary)'}}/><span className="ml-2 text-sm" style={{color:'var(--text-secondary)'}}>Loading...</span></div></DashboardLayout>;

  return (
    <DashboardLayout hideRightSidebar>
      <Breadcrumb items={[{label:'Settings'},{label:'Organization Details'}]}/>
      {toast&&<div style={{position:'fixed',top:20,right:20,zIndex:9999,padding:'12px 20px',borderRadius:12,background:toast.t==='s'?'var(--color-success-bg)':'var(--color-danger-bg)',border:`1px solid ${toast.t==='s'?'var(--color-success)':'var(--color-danger)'}`,display:'flex',alignItems:'center',gap:8,boxShadow:'var(--shadow-md)'}}>
        {toast.t==='s'?<CheckCircle className="w-4 h-4" style={{color:'var(--color-success)'}}/>:<AlertTriangle className="w-4 h-4" style={{color:'var(--color-danger)'}}/>}
        <span style={{fontSize:13,fontWeight:600,color:toast.t==='s'?'var(--color-success)':'var(--color-danger)'}}>{toast.m}</span>
      </div>}

      <div className="flex items-center gap-4 mb-5">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {o?.id&&<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold" style={{background:'var(--color-primary-bg)',color:'var(--color-primary)',fontFamily:'monospace'}}>#{o.id}</span>}
            <h1 className="text-2xl font-bold" style={sc.th}>{o?.name||'Organization'}</h1>
            <Badge status={o?.status}/>
          </div>
          <p className="text-sm mt-0.5" style={sc.ts}>{o?.domain}</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
          {[{k:'details',l:'Details'},{k:'storage',l:'Storage',i:HardDrive},{k:'bill',l:'Billing',i:CreditCard},{k:'hist',l:'History',i:Clock}].map(t=>
            <button key={t.k} onClick={()=>setTab(t.k)} className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-all${t.i?' flex items-center gap-1.5':''}`} style={tab===t.k?{background:'#4f46e5',color:'#fff',boxShadow:'0 2px 6px rgba(79,70,229,0.25)'}:{background:'#f1f5f9',color:'#334155',border:'1px solid #cbd5e1'}}>{t.i&&<t.i className="w-4 h-4"/>}{t.l}</button>
          )}
        </div>
      </div>

      {tab==='details'&&<div className="flex flex-col gap-6">
        <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
          <h3 className="text-lg font-semibold mb-4" style={sc.th}>Admin Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {icon:User,l:'Admin Name',v:o?.admin_name||'N/A'},
              {icon:MailCheck,l:'Admin Email',v:o?.admin_email||'N/A'},
              {icon:Phone,l:'Phone',v:o?.admin_phone||'N/A'},
            ].map(x=>
              <div key={x.l} className="p-4 rounded-lg" style={sc.infoBox}>
                <div className="flex items-center gap-2 mb-1">
                  <x.icon className="w-4 h-4" style={{color:'var(--color-primary)'}}/>
                  <p className="text-xs" style={{color:'var(--color-primary)'}}>{x.l}</p>
                </div>
                <p className="text-sm font-medium" style={sc.text}>{x.v}</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {icon:Globe,l:'Domain',v:o?.domain},
            {icon:Database,l:'Database',v:o?.database_name},
            {icon:Shield,l:'Plan',v:plan?.name||'None'},
            {icon:Users,l:'Users',v:usage?.users??0},
            {icon:FolderKanban,l:'Projects',v:usage?.projects??0},
            {icon:Calendar,l:'Created',v:o?.created_at?new Date(o.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'},
          ].map(x=>
            <div key={x.l} className="flex items-center gap-3 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow" style={sc.cardAlt}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={sc.infoBox}>
                <x.icon className="w-5 h-5" style={{color:'var(--color-primary)'}}/>
              </div>
              <div>
                <p className="text-xs" style={{color:'var(--color-primary)'}}>{x.l}</p>
                <p className="text-sm font-medium" style={sc.text}>{x.v}</p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={sc.th}>
            <CreditCard className="w-5 h-5" style={{color:'var(--color-primary)'}}/> Subscription Plan
            <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-md" style={{background:'var(--color-primary-bg)',color:'var(--color-primary)',fontFamily:'monospace'}}>
              Org #{o?.id}
            </span>
          </h3>
          {plan?<div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xl font-bold" style={sc.th}>{plan.name}</h4>
                  <Badge status={sub?.status}/>
                  {plan.is_custom&&<span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{background:'rgba(245,158,11,0.12)',color:'#d97706'}}>Custom</span>}
                </div>
                <p className="text-sm mt-0.5" style={sc.ts}>
                  {isTrial&&tc?`${tc.trial_duration} ${tc.trial_duration_unit} trial`:`${isYr?'Yearly':'Monthly'} billing`}
                  {sub?.starts_at&&<> — Started {fmtD(sub.starts_at)}</>}
                  {tl&&<> — {isTrial?'Expires':'Renews'} {fmtD(sub?.ends_at)} ({tl})</>}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold" style={sc.th}>${cPrice}</p>
                <p className="text-sm" style={sc.ts}>/{isYr?'year':'month'}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-3" style={{borderTop:'1px solid var(--border-light)'}}>
              {[{icon:Users,l:'Users',v:plan.max_users>=9999?'Unlimited':plan.max_users},{icon:FolderKanban,l:'Projects',v:plan.max_projects>=9999?'Unlimited':plan.max_projects},{icon:HardDrive,l:'Storage',v:`${plan.max_storage_gb} GB`}].map(x=>
                <div key={x.l} className="p-3 rounded-lg" style={sc.infoBox}>
                  <div className="flex items-center gap-2 mb-1">
                    <x.icon className="w-4 h-4" style={{color:'var(--color-primary)'}}/>
                    <p className="text-xs" style={{color:'var(--color-primary)'}}>{x.l}</p>
                  </div>
                  <p className="text-lg font-semibold" style={sc.text}>{x.v}</p>
                </div>
              )}
            </div>

            {modules&&(modules.enabled?.length>0||modules.disabled?.length>0)&&
              <div className="pt-3" style={{borderTop:'1px solid var(--border-light)'}}>
                <p className="text-xs font-medium uppercase tracking-wider mb-2" style={sc.tm}>Included Modules</p>
                <div className="flex flex-wrap gap-2">
                  {[...(modules?.enabled||[]),...(modules?.disabled||[])].map(m=>{
                    const on=modules?.enabled?.some(e=>e.id===m.id);
                    return <span key={m.id||m.slug} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md" style={{background:on?'var(--color-success-bg)':'var(--bg-hover)',color:on?'var(--color-success)':'var(--text-muted)',border:`1px solid ${on?'var(--color-success)':'var(--border-light)'}`}}>{on?<Check className="w-3 h-3"/>:<X className="w-3 h-3"/>}{m.name}</span>;
                  })}
                </div>
              </div>
            }
          </div>:<p className="text-sm" style={sc.ts}>No subscription plan assigned</p>}
        </div>
      </div>}

      {tab==='storage'&&<div className="flex flex-col gap-6">
        {stLd?(
          <div className="rounded-xl p-10 shadow-sm flex items-center justify-center gap-3" style={sc.card}>
            <Loader2 className="w-5 h-5 animate-spin" style={{color:'var(--color-primary)'}}/>
            <span style={{color:'var(--text-secondary)',fontSize:'14px'}}>Loading storage data...</span>
          </div>
        ):stSum?.summary?(
          <>
            <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2" style={sc.th}>
                  <HardDrive className="w-5 h-5" style={{color:'var(--color-primary)'}}/> Storage Usage
                </h3>
                <span className="px-3 py-1 rounded-full text-xs font-bold" style={{
                  background:stSum.summary.usage_percent>95?'var(--color-danger-bg)':stSum.summary.usage_percent>80?'var(--color-warning-bg)':'var(--color-success-bg)',
                  color:stSum.summary.usage_percent>95?'var(--color-danger)':stSum.summary.usage_percent>80?'var(--color-warning)':'var(--color-success)',
                }}>{stSum.summary.usage_percent}% Used</span>
              </div>
              <div className="mb-3">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-semibold" style={sc.text}>{stSum.summary.total_gb} GB used</span>
                  <span className="text-sm" style={sc.ts}>of {stSum.summary.max_storage_gb} GB</span>
                </div>
                <div className="w-full h-3 rounded-full" style={{background:'var(--bg-hover)'}}>
                  <div className="h-3 rounded-full transition-all" style={{width:`${Math.min(stSum.summary.usage_percent,100)}%`,background:stSum.summary.usage_percent>95?'var(--color-danger)':stSum.summary.usage_percent>80?'var(--color-warning)':'var(--color-primary)'}}/>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs" style={sc.tm}>{stSum.summary.usage_percent}% used</span>
                  <span className="text-xs" style={sc.tm}>{stSum.summary.remaining_gb} GB remaining</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {l:'Total Files',v:stSum.summary.total_files,color:'var(--color-primary)'},
                  {l:'Used Space',v:`${stSum.summary.total_gb} GB`,color:'var(--color-primary)'},
                  {l:'Storage Limit',v:`${stSum.summary.max_storage_gb} GB`,color:'var(--color-success)'},
                  {l:'Remaining',v:`${stSum.summary.remaining_gb} GB`,color:stSum.summary.usage_percent>95?'var(--color-danger)':'var(--color-warning)'},
                ].map(x=>
                  <div key={x.l} className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                    <p className="text-xs" style={{color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{x.l}</p>
                    <p className="text-lg font-bold mt-1" style={{color:x.color}}>{x.v}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
              {[{k:'overview',l:'Overview',i:Info},{k:'files',l:'Files',i:FileText},{k:'cleanup',l:'Cleanup',i:Trash2},{k:'notifications',l:'Notifications',i:Bell,badge:stNotif.filter(n=>!n.is_read).length},{k:'preferences',l:'Preferences',i:Settings}].map(t=>
                <button key={t.k} onClick={()=>setStTab(t.k)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all" style={{background:stTab===t.k?'var(--color-primary)':'transparent',color:stTab===t.k?'#fff':'var(--text-secondary)'}}>
                  <t.i className="w-3.5 h-3.5"/> {t.l}
                  {t.badge>0&&<span style={{background:'var(--color-danger)',color:'#fff',fontSize:'9px',fontWeight:700,padding:'1px 5px',borderRadius:'8px',marginLeft:'2px'}}>{t.badge}</span>}
                </button>
              )}
            </div>

            {stTab==='overview'&&stSum.summary.old_files&&(
              <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={sc.th}>
                  <Clock className="w-4 h-4" style={{color:'var(--color-primary)'}}/> File Age Distribution
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {l:'Older than 3 months',count:stSum.summary.old_files['3_months']?.count||0,size:stSum.summary.old_files['3_months']?.size_mb||0,color:'#f59e0b'},
                    {l:'Older than 6 months',count:stSum.summary.old_files['6_months']?.count||0,size:stSum.summary.old_files['6_months']?.size_mb||0,color:'#f97316'},
                    {l:'Older than 1 year',count:stSum.summary.old_files['12_months']?.count||0,size:stSum.summary.old_files['12_months']?.size_mb||0,color:'#ef4444'},
                  ].map(x=>
                    <div key={x.l} className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)',borderLeft:`3px solid ${x.color}`}}>
                      <p className="text-xs" style={{color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{x.l}</p>
                      <p className="text-lg font-bold mt-1" style={sc.th}>{x.count} files</p>
                      <p className="text-xs" style={sc.ts}>{x.size} MB</p>
                    </div>
                  )}
                </div>
                {stSum.summary.large_files&&(
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    {[
                      {l:'Files > 1 GB',count:stSum.summary.large_files['over_1gb']?.count||0,size:stSum.summary.large_files['over_1gb']?.size_mb||0,color:'#ef4444'},
                      {l:'Files > 2 GB',count:stSum.summary.large_files['over_2gb']?.count||0,size:stSum.summary.large_files['over_2gb']?.size_mb||0,color:'#dc2626'},
                    ].map(x=>
                      <div key={x.l} className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)',borderLeft:`3px solid ${x.color}`}}>
                        <p className="text-xs" style={{color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{x.l}</p>
                        <p className="text-lg font-bold mt-1" style={sc.th}>{x.count} files</p>
                        <p className="text-xs" style={sc.ts}>{x.size} MB</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {stTab==='files'&&stData?.recent_files?.length>0&&(
              <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
                <h3 className="text-sm font-semibold mb-3" style={sc.th}>Recent Files</h3>
                <div className="flex flex-col gap-2">
                  {stData.recent_files.map(f=>
                    <div key={f.id} className="flex items-center justify-between p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FileText className="w-4 h-4 flex-shrink-0" style={{color:'var(--text-muted)'}}/>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={sc.text}>{f.file_name}</p>
                          <p className="text-xs" style={sc.tm}>{f.category}{f.uploaded_by?` · ${f.uploaded_by}`:''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs" style={sc.ts}>{f.file_size_mb} MB</span>
                        <span className="text-xs" style={sc.tm}>{new Date(f.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
                        <button onClick={async()=>{try{await api.delete(`/organization/storage/${f.id}`);loadStData();}catch{}}} className="p-1 rounded-md hover:opacity-80 transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" style={{color:'var(--color-danger)'}}/>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {stTab==='cleanup'&&(
              <>
                <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={sc.th}>
                    <Clock className="w-4 h-4" style={{color:'var(--color-warning)'}}/> Delete Old Files
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {months:3,l:'3+ Months',count:stSum.summary.old_files?.['3_months']?.count||0,size:stSum.summary.old_files?.['3_months']?.size_mb||0,color:'#f59e0b'},
                      {months:6,l:'6+ Months',count:stSum.summary.old_files?.['6_months']?.count||0,size:stSum.summary.old_files?.['6_months']?.size_mb||0,color:'#f97316'},
                      {months:12,l:'1+ Year',count:stSum.summary.old_files?.['12_months']?.count||0,size:stSum.summary.old_files?.['12_months']?.size_mb||0,color:'#ef4444'},
                    ].map(x=>
                      <div key={x.months} className="p-4 rounded-lg flex flex-col gap-3" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                        <div>
                          <p className="text-xs font-semibold" style={{color:x.color}}>{x.l}</p>
                          <p className="text-lg font-bold" style={sc.th}>{x.count} files</p>
                          <p className="text-xs" style={sc.ts}>{x.size} MB</p>
                        </div>
                        <button onClick={()=>setDelModal({type:'old',months:x.months,l:x.l,count:x.count})} disabled={x.count===0} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5" style={{background:x.count>0?'var(--color-danger)':'var(--bg-hover)',color:x.count>0?'#fff':'var(--text-muted)',cursor:x.count>0?'pointer':'not-allowed'}}>
                          <Trash2 className="w-3 h-3"/> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={sc.th}>
                    <AlertTriangle className="w-4 h-4" style={{color:'var(--color-danger)'}}/> Delete Large Files
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {minGb:1,l:'> 1 GB Files',count:stSum.summary.large_files?.['over_1gb']?.count||0,size:stSum.summary.large_files?.['over_1gb']?.size_mb||0,color:'#ef4444'},
                      {minGb:2,l:'> 2 GB Files',count:stSum.summary.large_files?.['over_2gb']?.count||0,size:stSum.summary.large_files?.['over_2gb']?.size_mb||0,color:'#dc2626'},
                    ].map(x=>
                      <div key={x.minGb} className="p-4 rounded-lg flex flex-col gap-3" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                        <div>
                          <p className="text-xs font-semibold" style={{color:x.color}}>{x.l}</p>
                          <p className="text-lg font-bold" style={sc.th}>{x.count} files</p>
                          <p className="text-xs" style={sc.ts}>{x.size} MB</p>
                        </div>
                        <button onClick={()=>setDelModal({type:'large',minGb:x.minGb,l:x.l,count:x.count})} disabled={x.count===0} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5" style={{background:x.count>0?'var(--color-danger)':'var(--bg-hover)',color:x.count>0?'#fff':'var(--text-muted)',cursor:x.count>0?'pointer':'not-allowed'}}>
                          <Trash2 className="w-3 h-3"/> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {stTab==='notifications'&&(
              <div className="flex flex-col gap-3">
                {stNotif.length===0?(
                  <div className="rounded-xl p-8 shadow-sm text-center" style={sc.card}>
                    <Bell className="w-10 h-10 mx-auto mb-3" style={{color:'var(--text-muted)'}}/>
                    <p style={{color:'var(--text-secondary)',fontSize:'14px'}}>No storage notifications</p>
                  </div>
                ):(
                  <>
                    {stPinned.length>0&&(
                      <div className="rounded-xl p-4 shadow-sm" style={{...sc.card,borderLeft:'3px solid var(--color-warning)'}}>
                        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{color:'var(--color-warning)'}}>
                          <AlertTriangle className="w-3.5 h-3.5"/> Pinned Alerts ({stPinned.length})
                        </p>
                        <div className="flex flex-col gap-2">
                          {stPinned.map(n=>
                            <div key={n.id} className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                              <p className="text-sm font-semibold" style={sc.th}>{n.title}</p>
                              <p className="text-xs mt-1" style={sc.ts}>{n.message}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {stNotif.filter(n=>!n.is_pinned).map(n=>
                      <div key={n.id} className="rounded-xl p-4 shadow-sm flex items-start gap-3" style={{...sc.card,opacity:n.is_read?0.6:1,borderLeft:`3px solid ${n.severity==='critical'?'var(--color-danger)':n.severity==='warning'?'var(--color-warning)':'var(--color-primary)'}`}}>
                        <div className="p-2 rounded-lg" style={{background:n.severity==='critical'?'var(--color-danger-bg)':n.severity==='warning'?'var(--color-warning-bg)':'var(--color-primary-bg)'}}>
                          {n.severity==='critical'?<AlertTriangle className="w-4 h-4" style={{color:'var(--color-danger)'}}/>:n.severity==='warning'?<AlertTriangle className="w-4 h-4" style={{color:'var(--color-warning)'}}/>:<Info className="w-4 h-4" style={{color:'var(--color-primary)'}}/>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={sc.th}>{n.title}</p>
                          <p className="text-xs mt-1" style={sc.ts}>{n.message}</p>
                          <p className="text-[10px] mt-1" style={sc.tm}>{n.created_at?new Date(n.created_at).toLocaleDateString():''}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {stTab==='preferences'&&(
              <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={sc.th}>
                  <Settings className="w-4 h-4" style={{color:'var(--color-primary)'}}/> Storage Preferences
                </h3>
                {stPrefLd?(
                  <div className="flex items-center gap-2 py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" style={{color:'var(--color-primary)'}}/>
                    <span className="text-xs" style={sc.ts}>Loading preferences...</span>
                  </div>
                ):stPref?(
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                      <p className="text-xs font-semibold mb-2" style={{color:'var(--color-primary)'}}>Cleanup Policy</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs" style={sc.ts}>Delete files older than (months)</label>
                          <input type="number" min="1" max="60" defaultValue={stPref.cleanup_months||6} className="w-full mt-1 p-2 rounded-lg text-sm" style={{background:'var(--bg-primary)',border:'1px solid var(--border)',color:'var(--text-heading)'}}/>
                        </div>
                        <div>
                          <label className="text-xs" style={sc.ts}>Large file threshold (MB)</label>
                          <input type="number" min="100" max="10000" step="100" defaultValue={stPref.large_file_threshold_mb||500} className="w-full mt-1 p-2 rounded-lg text-sm" style={{background:'var(--bg-primary)',border:'1px solid var(--border)',color:'var(--text-heading)'}}/>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                      <p className="text-xs font-semibold mb-2" style={{color:'var(--color-warning)'}}>Alert Thresholds</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs" style={sc.ts}>Warning threshold (%)</label>
                          <input type="number" min="50" max="95" defaultValue={stPref.warn_threshold||80} className="w-full mt-1 p-2 rounded-lg text-sm" style={{background:'var(--bg-primary)',border:'1px solid var(--border)',color:'var(--text-heading)'}}/>
                        </div>
                        <div>
                          <label className="text-xs" style={sc.ts}>Critical threshold (%)</label>
                          <input type="number" min="80" max="100" defaultValue={stPref.critical_threshold||95} className="w-full mt-1 p-2 rounded-lg text-sm" style={{background:'var(--bg-primary)',border:'1px solid var(--border)',color:'var(--text-heading)'}}/>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button disabled={stPrefSav} className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5" style={{background:'var(--color-primary)',color:'#fff'}}>
                        {stPrefSav?<Loader2 className="w-3 h-3 animate-spin"/>:<Check className="w-3 h-3"/>}
                        {stPrefSav?'Saving...':'Save Preferences'}
                      </button>
                    </div>
                  </div>
                ):<p className="text-xs text-center py-6" style={sc.tm}>No preferences data</p>}
              </div>
            )}
          </>
        ):(
          <div className="rounded-xl p-10 shadow-sm text-center" style={sc.card}>
            <HardDrive className="w-10 h-10 mx-auto mb-3" style={{color:'var(--text-muted)'}}/>
            <p style={{color:'var(--text-secondary)',fontSize:'14px'}}>No storage data available</p>
          </div>
        )}
      </div>}

      {tab==='bill'&&<div className="flex flex-col gap-6">
        {bill?<>
          <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2" style={sc.th}>
                <CreditCard className="w-5 h-5" style={{color:'var(--color-primary)'}}/> Billing Summary
              </h3>
            </div>
            {bill.summary&&(
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {l:'Total Paid',v:fmt$(bill.summary.total_paid),color:'var(--color-success)',bg:'rgba(16,185,129,0.08)'},
                  {l:'Total Pending',v:fmt$(bill.summary.total_pending),color:'var(--color-warning)',bg:'rgba(245,158,11,0.08)'},
                  {l:'Total Invoices',v:bill.summary.total_invoices||0,color:'var(--color-primary)',bg:'var(--color-primary-bg)'},
                  {l:'Current Plan',v:bill.summary.current_plan?.name||plan?.name||'None',color:'var(--text-heading)',bg:'var(--bg-hover)'},
                ].map(x=>
                  <div key={x.l} className="p-3 rounded-lg" style={{background:x.bg,border:'1px solid var(--border-light)'}}>
                    <p className="text-[10px] font-medium uppercase tracking-wider" style={{color:'var(--text-muted)'}}>{x.l}</p>
                    <p className="text-lg font-bold mt-1" style={{color:x.color}}>{x.v}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={sc.th}>
              <Receipt className="w-4 h-4" style={{color:'var(--color-primary)'}}/> Invoice History
            </h3>
            {bill.invoices?.length>0?(
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{borderBottom:'1px solid var(--border-light)'}}>
                      {['Invoice','Status','Plan','Total','Period','Date','Actions'].map(h=>
                        <th key={h} className={`py-2.5 px-3 text-xs font-semibold uppercase tracking-wider ${h==='Total'?'text-right':h==='Status'||h==='Actions'?'text-center':'text-left'}`} style={{color:'var(--text-muted)'}}>{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {bill.invoices.map(inv=>{
                      const si=INV_STATUS[inv.status]||INV_STATUS.paid;
                      const SI=si.icon;
                      let displayDate=fmtDT(inv.approved_at||inv.paid_at||inv.created_at);
                      let datePrefix='';
                      if(inv.approved_at){datePrefix='Approved ';}
                      else if(inv.due_at){datePrefix='Due ';}
                      return(
                        <tr key={inv.id} style={{borderBottom:'1px solid var(--border-light)'}} className="hover:opacity-80 transition-opacity">
                          <td className="py-3 px-3"><div className="flex items-center gap-2"><FileText className="w-4 h-4" style={{color:'var(--text-muted)'}}/><span className="font-medium" style={sc.text}>{inv.invoice_number}</span></div></td>
                          <td className="py-3 px-3 text-center"><span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full" style={{background:si.bg,color:si.color}}><SI className="w-3.5 h-3.5"/>{inv.status}</span></td>
                          <td className="py-3 px-3 text-sm" style={sc.ts}>{inv.plan?.name||'N/A'}</td>
                          <td className="py-3 px-3 text-right text-sm font-semibold" style={sc.text}>{fmt$(inv.total_amount,inv.currency)}</td>
                          <td className="py-3 px-3 text-sm" style={sc.tm}>{inv.billing_period_start&&inv.billing_period_end?<>{new Date(inv.billing_period_start).toLocaleDateString('en-US',{month:'short',day:'numeric'})} - {new Date(inv.billing_period_end).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</>:inv.billing_period||'—'}</td>
                          <td className="py-3 px-3 text-sm" style={sc.tm}>{displayDate?<div><div>{datePrefix}{displayDate.date}</div><div className="text-xs opacity-70">{displayDate.time}</div></div>:'—'}</td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={()=>setViewInv(inv)} className="p-1.5 rounded-md transition-colors hover:opacity-80" style={{background:'var(--color-primary-bg)',color:'var(--color-primary)'}} title="View Invoice Details">
                                <Eye className="w-4 h-4"/>
                              </button>
                              <button onClick={async()=>{try{await api.downloadInvoice(inv.id);}catch{setToast({t:'e',m:'Download failed.'});}}} className="p-1.5 rounded-md transition-colors hover:opacity-80" style={{background:'var(--color-primary-bg)',color:'var(--color-primary)'}} title="Download Invoice">
                                <Download className="w-4 h-4"/>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ):(
              <div className="text-center py-8">
                <Receipt className="w-10 h-10 mx-auto mb-3" style={{color:'var(--text-muted)'}}/>
                <p className="text-sm" style={sc.ts}>No invoices yet</p>
              </div>
            )}
          </div>
        </>:<div className="rounded-xl p-10 shadow-sm flex items-center justify-center gap-3" style={sc.card}><Loader2 className="w-5 h-5 animate-spin" style={{color:'var(--color-primary)'}}/><span style={{color:'var(--text-secondary)',fontSize:'14px'}}>Loading billing...</span></div>}
      </div>}

      {tab==='hist'&&<div className="flex flex-col gap-6">
        {hist?<>
          <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2" style={sc.th}>
                <Clock className="w-5 h-5" style={{color:'var(--color-primary)'}}/> Subscription History
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {l:'Subscriptions',v:hist.summary?.total_subscriptions||0,color:'var(--color-primary)',bg:'var(--color-primary-bg)'},
                {l:'Plan Changes',v:hist.summary?.total_plan_changes||0,color:'#d97706',bg:'rgba(245,158,11,0.08)'},
                {l:'Renewals',v:hist.summary?.total_renewals||0,color:'var(--color-success)',bg:'rgba(16,185,129,0.08)'},
                {l:'Trial Periods',v:hist.summary?.total_trial_periods||0,color:'#6366f1',bg:'rgba(99,102,241,0.08)'},
              ].map(x=>
                <div key={x.l} className="p-3 rounded-lg" style={{background:x.bg,border:'1px solid var(--border-light)'}}>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{color:'var(--text-muted)'}}>{x.l}</p>
                  <p className="text-xl font-bold mt-1" style={{color:x.color}}>{x.v}</p>
                </div>
              )}
            </div>
          </div>

          {hist.plan_usage?.length>0&&<div className="rounded-xl p-5 shadow-sm" style={sc.card}>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={sc.th}><Shield className="w-4 h-4" style={{color:'var(--color-primary)'}}/>Plan Usage</h3>
            <div className="flex flex-wrap gap-2">{hist.plan_usage.map(p=><span key={p.plan_id} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>{p.plan_name} <span className="font-bold" style={{color:'var(--color-primary)'}}>x{p.times_used}</span></span>)}</div>
          </div>}

          {hist.history?.length>0&&<div className="rounded-xl p-5 shadow-sm" style={sc.card}>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={sc.th}><Clock className="w-4 h-4" style={{color:'var(--color-primary)'}}/>Subscription History</h3>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{borderBottom:'1px solid var(--border-light)'}}>
              {['Event','Plan','Date'].map(h=><th key={h} className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wider" style={{color:'var(--text-muted)'}}>{h}</th>)}
            </tr></thead><tbody>{hist.history.map(h=>(
              <tr key={h.id} style={{borderBottom:'1px solid var(--border-light)'}} className="hover:opacity-80 transition-opacity">
                <td className="py-3 px-3"><span className="text-sm font-medium px-2.5 py-1 rounded-full" style={{background:'var(--color-primary-bg)',color:'var(--color-primary)'}}>{h.event_type?.replace(/_/g,' ')}</span></td>
                <td className="py-3 px-3 text-sm" style={sc.ts}>{h.plan?.name||'—'}</td>
                <td className="py-3 px-3 text-sm" style={sc.tm}>{fmtD(h.created_at)}</td>
              </tr>))}</tbody></table></div>
          </div>}
        </>:<div className="rounded-xl p-10 shadow-sm flex items-center justify-center gap-3" style={sc.card}><Loader2 className="w-5 h-5 animate-spin" style={{color:'var(--color-primary)'}}/><span style={{color:'var(--text-secondary)',fontSize:'14px'}}>Loading history...</span></div>}
      </div>}

      {delModal&&(
        <div style={{position:'fixed',inset:0,zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)'}}>
          <div className="rounded-2xl p-6 w-full max-w-md" style={{background:'var(--bg-card)',boxShadow:'var(--shadow-lg)'}}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:'var(--color-danger-bg)'}}>
                <AlertTriangle className="w-5 h-5" style={{color:'var(--color-danger)'}}/>
              </div>
              <div>
                <h3 className="text-base font-bold" style={sc.th}>Confirm Delete</h3>
                <p className="text-xs" style={sc.ts}>This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm mb-5" style={sc.ts}>Delete <strong style={sc.th}>{delModal.count} files</strong> ({delModal.l})?</p>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setDelModal(null)} className="px-4 py-2 rounded-lg text-sm font-medium transition-colors" style={{background:'var(--bg-hover)',color:'var(--text-secondary)',border:'1px solid var(--border-light)'}}>Cancel</button>
              <button onClick={async()=>{setDelLd(true);try{if(delModal.type==='old')await api.delete('/organization/storage/old-files',{data:{months:delModal.months}});else await api.delete('/organization/storage/large-files',{data:{min_size_gb:delModal.minGb}});setDelModal(null);loadStData();}catch{}setDelLd(false);}} disabled={delLd} className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2" style={{background:'var(--color-danger)'}}>
                {delLd?<Loader2 className="w-4 h-4 animate-spin"/>:<Trash2 className="w-4 h-4"/>}
                {delLd?'Deleting...':'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewInv&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)'}}>
          <div className="rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden" style={{background:'var(--bg-card)',boxShadow:'var(--shadow-lg)'}}>
            <div className="flex items-center justify-between p-5" style={{borderBottom:'1px solid var(--border-light)'}}>
              <div>
                <h3 className="text-lg font-bold" style={sc.th}>Invoice Details</h3>
                <p className="text-xs" style={sc.ts}>{viewInv.invoice_number}</p>
              </div>
              <button onClick={()=>setViewInv(null)} className="p-2 rounded-lg transition-colors" style={{background:'var(--bg-hover)',color:'var(--text-secondary)'}}><X className="w-5 h-5"/></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto" style={{maxHeight:'calc(90vh - 140px)'}}>
              <div className="text-center pb-4" style={{borderBottom:'1px solid var(--border-light)'}}>
                <h4 className="text-xl font-bold" style={{color:'var(--color-primary)'}}>TechXaro Technologies</h4>
                <p className="text-xs mt-1" style={{color:'var(--text-muted)'}}>SaaS Platform &amp; Development Services</p>
                <p className="text-xs" style={{color:'var(--text-muted)'}}>www.techxaro.com</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>Organization</p>
                  <p className="text-sm font-semibold" style={sc.text}>{viewInv.organization?.name||org?.name||'N/A'}</p>
                </div>
                <div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>Status</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full" style={{background:INV_STATUS[viewInv.status]?.bg,color:INV_STATUS[viewInv.status]?.color}}>
                    {(() => {const I=INV_STATUS[viewInv.status]?.icon;return I?<I className="w-3 h-3"/>:null;})()}
                    {viewInv.status}
                  </span>
                </div>
                <div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>Plan</p>
                  <p className="text-sm font-semibold" style={sc.text}>{viewInv.plan?.name||'N/A'}</p>
                </div>
                <div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>Total Amount</p>
                  <p className="text-sm font-bold" style={{color:'var(--color-success)'}}>{fmt$(viewInv.total_amount,viewInv.currency)}</p>
                </div>
              </div>
              <div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>Billing Period</p>
                <p className="text-sm" style={sc.text}>
                  {viewInv.billing_period_start&&viewInv.billing_period_end?<>{new Date(viewInv.billing_period_start).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} - {new Date(viewInv.billing_period_end).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</>:viewInv.billing_period||'N/A'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {viewInv.due_at&&<div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>Due Date</p>
                  <p className="text-sm" style={sc.text}>{new Date(viewInv.due_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
                </div>}
                {viewInv.paid_at&&<div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>Paid Date</p>
                  <p className="text-sm" style={sc.text}>{new Date(viewInv.paid_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
                </div>}
                {viewInv.approved_at&&<div className="p-3 rounded-lg" style={{background:'rgba(16,185,129,0.05)',border:'1px solid rgba(16,185,129,0.2)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--color-success)'}}>Approved Date</p>
                  <p className="text-sm font-medium" style={{color:'var(--color-success)'}}>{new Date(viewInv.approved_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
                </div>}
              </div>
              {viewInv.notes&&<div className="p-3 rounded-lg" style={{background:'var(--color-primary-bg)',border:'1px solid var(--color-primary)'}}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--color-primary)'}}>Notes</p>
                <p className="text-sm" style={sc.text}>{viewInv.notes}</p>
              </div>}
            </div>
            <div className="flex justify-end gap-2 p-5" style={{borderTop:'1px solid var(--border-light)'}}>
              <button onClick={async()=>{try{await api.downloadInvoice(viewInv.id);}catch{setToast({t:'e',m:'Download failed.'});}}} className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 transition-colors" style={{background:'var(--color-primary)'}}>
                <Download className="w-4 h-4"/> Download Invoice
              </button>
              <button onClick={()=>setViewInv(null)} className="px-4 py-2 rounded-lg text-sm font-medium transition-colors" style={{background:'var(--bg-hover)',color:'var(--text-secondary)',border:'1px solid var(--border-light)'}}>Close</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}


import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/layout/DashboardLayout';
import Breadcrumb from '../components/Breadcrumb';
import ConfirmModal from '../components/ConfirmModal';
import api from '../lib/api';
import {
  Building2, CreditCard, HardDrive, Users, FolderKanban, Calendar, Clock,
  Globe, Mail, Phone, Shield, Check, X, Database, FileText, Loader2,
  Info, CheckCircle, AlertTriangle, Settings, User, MailCheck, Trash2, Bell, Eye, Download, Receipt, RotateCcw, Save,
} from 'lucide-react';
import {
  DEFAULT_WORKING_HOURS,
  normalizeWorkingHoursSchedule,
  getTimezoneOffsetDisplay,
} from '../utils/timezoneUtils';
import WorkingHoursScheduleEditor from '../components/WorkingHoursScheduleEditor';

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
const fmtBytesToUnit = (bytes, unit = 'GB') => {
  if (!bytes) return `0 ${unit}`;
  const divisors = { KB: 1024, MB: 1024**2, GB: 1024**3 };
  const divisor = divisors[unit] || divisors.GB;
  return `${(bytes / divisor).toFixed(2)} ${unit}`;
};

function Badge({status}){
  const { t } = useTranslation();
  const s=STATUS_MAP[status]||STATUS_MAP.active;
  return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full" style={{background:s.bg,color:s.color}}><span className="w-1.5 h-1.5 rounded-full" style={{background:s.color}}/>{t(s.label, { defaultValue: s.label })}</span>;
}

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
const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data,setData]=useState(null);
  const [stSum,setStSum]=useState(null);
  const [bill,setBill]=useState(null);
  const [hist,setHist]=useState(null);
  const [ld,setLd]=useState(true);
  const [tab,setTab]=useState(() => {
    const t = searchParams.get('tab');
    return (t && ['details','storage','bill','hist'].includes(t)) ? t : 'details';
  });
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
  const [fileDelConfirm,setFileDelConfirm]=useState({open:false,file:null});
  const [viewInv,setViewInv]=useState(null);
  const [now,setNow]=useState(new Date());
  const [tz,setTz]=useState('');
  const [savTz,setSavTz]=useState(false);
  const [toast,setToast]=useState(null);

  // Regional & Working Hours state
  const [orgTz, setOrgTz] = useState('UTC');
  const [enforceHours, setEnforceHours] = useState(false);
  const [orgWorkingHours, setOrgWorkingHours] = useState(DEFAULT_WORKING_HOURS);
  const [timezonesList, setTimezonesList] = useState([]);
  const [savingRegional, setSavingRegional] = useState(false);

  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t);},[]);

  const load=useCallback(async()=>{
    setLd(true);
    try{
      const[dR,sR]=await Promise.all([api.get('/organization-settings/details'),api.get('/organization/storage/summary')]);
      if(dR.success) {
        setData(dR);
        if (dR.organization) {
          if (dR.organization.default_timezone || dR.organization.timezone) {
            setOrgTz(dR.organization.default_timezone || dR.organization.timezone);
          }
          if (dR.organization.enforce_working_hours !== undefined) {
            setEnforceHours(Boolean(dR.organization.enforce_working_hours));
          }
          if (dR.organization.working_hours) {
            setOrgWorkingHours(normalizeWorkingHoursSchedule(dR.organization.working_hours));
          }
        }
      }
      if(sR.success)setStSum(sR);
    }catch{}
    setLd(false);
  },[]);

  useEffect(()=>{load();},[load]);

  const loadRegional=useCallback(async()=>{
    try {
      const [tzRes, regRes] = await Promise.all([
        api.get('/regional-settings/timezones'),
        api.get('/organization-settings/regional')
      ]);
      if (tzRes?.data && Array.isArray(tzRes.data)) {
        setTimezonesList(tzRes.data);
      }
      if (regRes?.success && (regRes?.data || regRes?.regional_settings)) {
        const d = regRes.data || regRes.regional_settings;
        if (d.default_timezone || d.timezone) setOrgTz(d.default_timezone || d.timezone);
        if (d.enforce_working_hours !== undefined) setEnforceHours(Boolean(d.enforce_working_hours));
        if (d.working_hours) setOrgWorkingHours(normalizeWorkingHoursSchedule(d.working_hours));
      }
    } catch {}
  },[]);

  useEffect(()=>{if(tab==='regional')loadRegional();},[tab,loadRegional]);

  const saveOrgRegional = async (e) => {
    if (e) e.preventDefault();
    setSavingRegional(true);
    try {
      const payload = {
        default_timezone: orgTz,
        timezone: orgTz,
        enforce_working_hours: enforceHours,
        working_hours: orgWorkingHours,
      };
      const res = await api.put('/organization-settings/regional', payload);
      if (res?.success) {
        setToast({ t: 's', m: t('Organization regional settings updated successfully.', { defaultValue: 'Organization regional settings updated successfully.' }) });
        load();
      } else {
        setToast({ t: 'e', m: res?.message || t('Failed to update regional settings.', { defaultValue: 'Failed to update regional settings.' }) });
      }
    } catch (err) {
      setToast({ t: 'e', m: t('Error saving organization regional settings.', { defaultValue: 'Error saving organization regional settings.' }) });
    } finally {
      setSavingRegional(false);
    }
  };

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
  if(sub?.ends_at){const d=new Date(sub.ends_at)-now;if(d>0){if(isTrial&&tc?.trial_duration_unit==='minutes')tl=t('{{count}} min left', { count: Math.floor(d/60000), defaultValue: `${Math.floor(d/60000)} min left` });else if(isTrial&&tc?.trial_duration_unit==='hours')tl=t('{{count}} hr left', { count: Math.floor(d/3600000), defaultValue: `${Math.floor(d/3600000)} hr left` });else{const dy=Math.ceil(d/864e5);tl=t('{{count}} days left', { count: dy, defaultValue: `${dy} day${dy!==1?'s':''} left` });}}}

  if(ld)return <DashboardLayout hideRightSidebar><div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" style={{color:'var(--color-primary)'}}/><span className="ml-2 text-sm" style={{color:'var(--text-secondary)'}}>{t('Loading...', { defaultValue: 'Loading...' })}</span></div></DashboardLayout>;

  return (
    <DashboardLayout hideRightSidebar>
      <Breadcrumb items={[{label:t('Settings', { defaultValue: 'Settings' })},{label:t('Organization Details', { defaultValue: 'Organization Details' })}]}/>
      {toast&&<div style={{position:'fixed',top:20,right:20,zIndex:9999,padding:'12px 20px',borderRadius:12,background:toast.t==='s'?'var(--color-success-bg)':'var(--color-danger-bg)',border:`1px solid ${toast.t==='s'?'var(--color-success)':'var(--color-danger)'}`,display:'flex',alignItems:'center',gap:8,boxShadow:'var(--shadow-md)'}}>
        {toast.t==='s'?<CheckCircle className="w-4 h-4" style={{color:'var(--color-success)'}}/>:<AlertTriangle className="w-4 h-4" style={{color:'var(--color-danger)'}}/>}
        <span style={{fontSize:13,fontWeight:600,color:toast.t==='s'?'var(--color-success)':'var(--color-danger)'}}>{toast.m}</span>
      </div>}

      <div className="flex items-center gap-4 mb-5">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {o?.id&&<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold" style={{background:'var(--color-primary-bg)',color:'var(--color-primary)',fontFamily:'monospace'}}>#{o.id}</span>}
            <h1 className="text-2xl font-bold" style={sc.th}>{o?.name||t('Organization', { defaultValue: 'Organization' })}</h1>
            <Badge status={o?.status}/>
          </div>
          <p className="text-sm mt-0.5" style={sc.ts}>{o?.domain}</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
{[{k:'details',l:t('Details', { defaultValue: 'Details' })},{k:'regional',l:t('Regional & Hours', { defaultValue: 'Regional & Hours' }),i:Globe},{k:'storage',l:t('Storage', { defaultValue: 'Storage' }),i:HardDrive},{k:'bill',l:t('Billing', { defaultValue: 'Billing' }),i:CreditCard},{k:'hist',l:t('History', { defaultValue: 'History' }),i:Clock}].map(t=>
                <button key={t.k} onClick={()=>{setTab(t.k); setSearchParams({tab: t.k}, {replace: true});}} className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-all${tab===t.k?' flex items-center gap-1.5':''}`}>
          )}
        </div>
      </div>

      {tab==='details'&&<div className="flex flex-col gap-6">
        <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
          <h3 className="text-lg font-semibold mb-4" style={sc.th}>{t('Admin Details', { defaultValue: 'Admin Details' })}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {icon:User,l:t('Admin Name', { defaultValue: 'Admin Name' }),v:o?.admin_name||'N/A'},
              {icon:MailCheck,l:t('Admin Email', { defaultValue: 'Admin Email' }),v:o?.admin_email||'N/A'},
              {icon:Phone,l:t('Phone', { defaultValue: 'Phone' }),v:o?.admin_phone||'N/A'},
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
            {icon:Globe,l:t('Domain', { defaultValue: 'Domain' }),v:o?.domain},
            {icon:Database,l:t('Database', { defaultValue: 'Database' }),v:o?.database_name},
            {icon:Shield,l:t('Plan', { defaultValue: 'Plan' }),v:plan?.name||t('None', { defaultValue: 'None' })},
            {icon:Users,l:t('Users', { defaultValue: 'Users' }),v:usage?.users??0},
            {icon:FolderKanban,l:t('Projects', { defaultValue: 'Projects' }),v:usage?.projects??0},
            {icon:Calendar,l:t('Created', { defaultValue: 'Created' }),v:o?.created_at?new Date(o.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'},
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
            <CreditCard className="w-5 h-5" style={{color:'var(--color-primary)'}}/> {t('Subscription Plan', { defaultValue: 'Subscription Plan' })}
            <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-md" style={{background:'var(--color-primary-bg)',color:'var(--color-primary)',fontFamily:'monospace'}}>
              {t('Org #{{id}}', { id: o?.id, defaultValue: `Org #${o?.id}` })}
            </span>
          </h3>
          {plan?<div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xl font-bold" style={sc.th}>{plan.name}</h4>
                  <Badge status={sub?.status}/>
                  {plan.is_custom&&<span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{background:'rgba(245,158,11,0.12)',color:'#d97706'}}>{t('Custom', { defaultValue: 'Custom' })}</span>}
                </div>
                <p className="text-sm mt-0.5" style={sc.ts}>
                  {isTrial&&tc?`${tc.trial_duration} ${t(tc.trial_duration_unit, { defaultValue: tc.trial_duration_unit })} ${t('trial', { defaultValue: 'trial' })}`:`${isYr?t('Yearly', { defaultValue: 'Yearly' }):t('Monthly', { defaultValue: 'Monthly' })} ${t('billing', { defaultValue: 'billing' })}`}
                  {sub?.starts_at&&<> — {t('Started {{date}}', { date: fmtD(sub.starts_at), defaultValue: `Started ${fmtD(sub.starts_at)}` })}</>}
                  {tl&&<> — {isTrial?t('Expires', { defaultValue: 'Expires' }):t('Renews', { defaultValue: 'Renews' })} {fmtD(sub?.ends_at)} ({tl})</>}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold" style={sc.th}>${cPrice}</p>
                <p className="text-sm" style={sc.ts}>/{isYr?t('year', { defaultValue: 'year' }):t('month', { defaultValue: 'month' })}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-3" style={{borderTop:'1px solid var(--border-light)'}}>
{[{icon:Users,l:t('Users', { defaultValue: 'Users' }),v:plan.max_users===9999?t('Unlimited', { defaultValue: 'Unlimited' }):plan.max_users},{icon:FolderKanban,l:t('Projects', { defaultValue: 'Projects' }),v:plan.max_projects===9999?t('Unlimited', { defaultValue: 'Unlimited' }):plan.max_projects},{icon:HardDrive,l:t('Storage', { defaultValue: 'Storage' }),v:plan.max_storage===9999?t('Unlimited', { defaultValue: 'Unlimited' }):`${plan.max_storage} ${plan.storage_unit || 'GB'}`}]
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
                <p className="text-xs font-medium uppercase tracking-wider mb-2" style={sc.tm}>{t('Included Modules', { defaultValue: 'Included Modules' })}</p>
                <div className="flex flex-wrap gap-2">
                  {[...(modules?.enabled||[]),...(modules?.disabled||[])].map(m=>{
                    const on=modules?.enabled?.some(e=>e.id===m.id);
                    return <span key={m.id||m.slug} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md" style={{background:on?'var(--color-success-bg)':'var(--bg-hover)',color:on?'var(--color-success)':'var(--text-muted)',border:`1px solid ${on?'var(--color-success)':'var(--border-light)'}`}}>{on?<Check className="w-3 h-3"/>:<X className="w-3 h-3"/>}{t(m.name, { defaultValue: m.name })}</span>;
                  })}
                </div>
              </div>
            }
          </div>:<p className="text-sm" style={sc.ts}>{t('No subscription plan assigned', { defaultValue: 'No subscription plan assigned' })}</p>}
        </div>
      </div>}

      {tab==='regional'&&<div className="flex flex-col gap-6">
        <div className="rounded-xl p-6 shadow-sm" style={sc.card}>
          <div className="flex items-center justify-between pb-4 mb-5" style={{borderBottom:'1px solid var(--border-light)'}}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={sc.infoBox}>
                <Globe className="w-5 h-5" style={{color:'var(--color-primary)'}}/>
              </div>
              <div>
                <h3 className="text-lg font-bold" style={sc.th}>{t('Organization Timezone & Working Hours', { defaultValue: 'Organization Timezone & Working Hours' })}</h3>
                <p className="text-xs" style={sc.ts}>{t('Configure default timezone and working availability policy for all organization members', { defaultValue: 'Configure default timezone and working availability policy for all organization members' })}</p>
              </div>
            </div>
          </div>

          <form onSubmit={saveOrgRegional} className="space-y-6">
            {/* Default Timezone */}
            <div className="p-4 rounded-xl" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
              <label className="block text-sm font-semibold mb-1" style={sc.th}>{t('Organization Default Timezone (IANA)', { defaultValue: 'Organization Default Timezone (IANA)' })}</label>
              <p className="text-xs mb-3" style={sc.ts}>{t('Applied as the fallback default for all teams, new accounts, and organization reports.', { defaultValue: 'Applied as the fallback default for all teams, new accounts, and organization reports.' })}</p>
              <select
                value={orgTz}
                onChange={(e)=>setOrgTz(e.target.value)}
                className="w-full sm:w-80 h-11 px-3 rounded-lg text-sm border outline-none"
                style={{background:'var(--bg-card)',borderColor:'var(--border-color)',color:'var(--text-primary)'}}
              >
                {timezonesList.length > 0 ? (
                  timezonesList.map(tTz=>(
                    <option key={tTz} value={tTz}>{tTz} {getTimezoneOffsetDisplay(tTz)}</option>
                  ))
                ) : (
                  ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Tokyo'].map(tTz=>(
                    <option key={tTz} value={tTz}>{tTz} {getTimezoneOffsetDisplay(tTz)}</option>
                  ))
                )}
              </select>
            </div>

            {/* Enforce Working Hours Toggle */}
            <div className="p-4 rounded-xl flex items-start justify-between gap-4" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
              <div>
                <h4 className="text-sm font-semibold mb-0.5" style={sc.th}>{t('Enforce Working Hours Policy', { defaultValue: 'Enforce Working Hours Policy' })}</h4>
                <p className="text-xs" style={sc.ts}>
                  {t('When enabled, deadlines, assignment calendars, and task alerts across the organization will strictly align with configured working hours.', { defaultValue: 'When enabled, deadlines, assignment calendars, and task alerts across the organization will strictly align with configured working hours.' })}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={enforceHours}
                  onChange={(e)=>setEnforceHours(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Organization Default Schedule */}
            <div className="p-5 rounded-xl" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
              <WorkingHoursScheduleEditor
                schedule={orgWorkingHours}
                onChange={setOrgWorkingHours}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3" style={{borderTop:'1px solid var(--border-light)'}}>
              <button
                type="button"
                onClick={loadRegional}
                disabled={savingRegional}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{background:'var(--bg-hover)',color:'var(--text-secondary)',border:'1px solid var(--border-light)'}}
              >
                {t('Discard Changes', { defaultValue: 'Discard Changes' })}
              </button>
              <button
                type="submit"
                disabled={savingRegional}
                className="px-5 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 transition-opacity"
                style={{background:'var(--color-primary)',opacity:savingRegional?0.7:1}}
              >
                {savingRegional ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                {savingRegional ? t('Saving...', { defaultValue: 'Saving...' }) : t('Save Organization Regional Settings', { defaultValue: 'Save Organization Regional Settings' })}
              </button>
            </div>
          </form>
        </div>
      </div>}

      {tab==='storage'&&<div className="flex flex-col gap-6">
        {stLd?(
          <div className="rounded-xl p-10 shadow-sm flex items-center justify-center gap-3" style={sc.card}>
            <Loader2 className="w-5 h-5 animate-spin" style={{color:'var(--color-primary)'}}/>
            <span style={{color:'var(--text-secondary)',fontSize:'14px'}}>{t('Loading storage data...', { defaultValue: 'Loading storage data...' })}</span>
          </div>
        ):stSum?.summary?(
          <>
            <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2" style={sc.th}>
                  <HardDrive className="w-5 h-5" style={{color:'var(--color-primary)'}}/> {t('Storage Usage', { defaultValue: 'Storage Usage' })}
                </h3>
                <span className="px-3 py-1 rounded-full text-xs font-bold" style={{
                  background:stSum.summary.usage_percent>95?'var(--color-danger-bg)':stSum.summary.usage_percent>80?'var(--color-warning-bg)':'var(--color-success-bg)',
                  color:stSum.summary.usage_percent>95?'var(--color-danger)':stSum.summary.usage_percent>80?'var(--color-warning)':'var(--color-success)',
                }}>{t('{{percent}}% Used', { percent: stSum.summary.usage_percent, defaultValue: `${stSum.summary.usage_percent}% Used` })}</span>
              </div>
              <div className="mb-3">
                <div className="flex justify-between mb-1">

                </div>
                <div className="w-full h-3 rounded-full" style={{background:'var(--bg-hover)'}}>
                  <div className="h-3 rounded-full transition-all" style={{width:`${Math.min(stSum.summary.usage_percent,100)}%`,background:stSum.summary.usage_percent>95?'var(--color-danger)':stSum.summary.usage_percent>80?'var(--color-warning)':'var(--color-primary)'}}/>
                </div>
                <div className="flex justify-between mt-1">
<span className="text-xs" style={sc.tm}>{t('{{percent}}% used', { percent: stSum.summary.usage_percent, defaultValue: `${stSum.summary.usage_percent}% used` })}</span>
                  <span className="text-xs" style={sc.tm}>{t('{{remaining}} GB remaining', { remaining: `${fmtBytesToUnit(stSum.summary.remaining_bytes, stSum.summary.storage_unit || 'GB')} ${stSum.summary.storage_unit || 'GB'}`, defaultValue: `${fmtBytesToUnit(stSum.summary.remaining_bytes, stSum.summary.storage_unit || 'GB')} ${stSum.summary.storage_unit || 'GB'} remaining` })}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
{l:t('Total Files', { defaultValue: 'Total Files' }),v:stSum.summary.total_files,color:'var(--color-primary)'},
                  {l:t('Used Space', { defaultValue: 'Used Space' }),v:`${fmtBytesToUnit(stSum.summary.total_bytes, stSum.summary.storage_unit || 'GB')} ${stSum.summary.storage_unit || 'GB'}`,color:'var(--color-primary)'},
                  {l:t('Storage Limit', { defaultValue: 'Storage Limit' }),v:`${stSum.summary.max_storage_gb} ${stSum.summary.storage_unit || 'GB'}`,color:'var(--color-success)'},
                  {l:t('Remaining', { defaultValue: 'Remaining' }),v:`${fmtBytesToUnit(stSum.summary.remaining_bytes, stSum.summary.storage_unit || 'GB')} ${stSum.summary.storage_unit || 'GB'}`,color:stSum.summary.usage_percent>95?'var(--color-danger)':'var(--color-warning)'},
                ].map(x=>
                  <div key={x.l} className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                    <p className="text-xs" style={{color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{x.l}</p>
                    <p className="text-lg font-bold mt-1" style={{color:x.color}}>{x.v}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
              {[{k:'overview',l:t('Overview', { defaultValue: 'Overview' }),i:Info},{k:'files',l:t('Files', { defaultValue: 'Files' }),i:FileText},{k:'cleanup',l:t('Cleanup', { defaultValue: 'Cleanup' }),i:Trash2},{k:'notifications',l:t('Notifications', { defaultValue: 'Notifications' }),i:Bell,badge:stNotif.filter(n=>!n.is_read).length},{k:'preferences',l:t('Preferences', { defaultValue: 'Preferences' }),i:Settings}].map(tTab=>
                <button key={tTab.k} onClick={()=>setStTab(tTab.k)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all" style={{background:stTab===tTab.k?'var(--color-primary)':'transparent',color:stTab===tTab.k?'#fff':'var(--text-secondary)'}}>
                  <tTab.i className="w-3.5 h-3.5"/> {tTab.l}
                  {tTab.badge>0&&<span style={{background:'var(--color-danger)',color:'#fff',fontSize:'9px',fontWeight:700,padding:'1px 5px',borderRadius:'8px',marginLeft:'2px'}}>{tTab.badge}</span>}
                </button>
              )}
            </div>

            {stTab==='overview'&&stSum.summary.old_files&&(
              <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={sc.th}>
                  <Clock className="w-4 h-4" style={{color:'var(--color-primary)'}}/> {t('File Age Distribution', { defaultValue: 'File Age Distribution' })}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {l:t('Older than 3 months', { defaultValue: 'Older than 3 months' }),count:stSum.summary.old_files['3_months']?.count||0,size:stSum.summary.old_files['3_months']?.size_mb||0,color:'#f59e0b'},
                    {l:t('Older than 6 months', { defaultValue: 'Older than 6 months' }),count:stSum.summary.old_files['6_months']?.count||0,size:stSum.summary.old_files['6_months']?.size_mb||0,color:'#f97316'},
                    {l:t('Older than 1 year', { defaultValue: 'Older than 1 year' }),count:stSum.summary.old_files['12_months']?.count||0,size:stSum.summary.old_files['12_months']?.size_mb||0,color:'#ef4444'},
                  ].map(x=>
                    <div key={x.l} className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)',borderLeft:`3px solid ${x.color}`}}>
                      <p className="text-xs" style={{color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{x.l}</p>
                      <p className="text-lg font-bold mt-1" style={sc.th}>{t('{{count}} files', { count: x.count, defaultValue: `${x.count} files` })}</p>
                      <p className="text-xs" style={sc.ts}>{x.size} MB</p>
                    </div>
                  )}
                </div>
                {stSum.summary.large_files&&(
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    {[
                      {l:t('Files > 1 GB', { defaultValue: 'Files > 1 GB' }),count:stSum.summary.large_files['over_1gb']?.count||0,size:stSum.summary.large_files['over_1gb']?.size_mb||0,color:'#ef4444'},
                      {l:t('Files > 2 GB', { defaultValue: 'Files > 2 GB' }),count:stSum.summary.large_files['over_2gb']?.count||0,size:stSum.summary.large_files['over_2gb']?.size_mb||0,color:'#dc2626'},
                    ].map(x=>
                      <div key={x.l} className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)',borderLeft:`3px solid ${x.color}`}}>
                        <p className="text-xs" style={{color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{x.l}</p>
                        <p className="text-lg font-bold mt-1" style={sc.th}>{t('{{count}} files', { count: x.count, defaultValue: `${x.count} files` })}</p>
                        <p className="text-xs" style={sc.ts}>{x.size} MB</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {stTab==='files'&&stData?.recent_files?.length>0&&(
              <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
                <h3 className="text-sm font-semibold mb-3" style={sc.th}>{t('Recent Files', { defaultValue: 'Recent Files' })}</h3>
                <div className="flex flex-col gap-2">
                  {stData.recent_files.map(f=>
                    <div key={f.id} className="flex items-center justify-between p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FileText className="w-4 h-4 flex-shrink-0" style={{color:'var(--text-muted)'}}/>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={sc.text}>{f.file_name}</p>
                          <p className="text-xs" style={sc.tm}>{t(f.category, { defaultValue: f.category })}{f.uploaded_by?` · ${f.uploaded_by}`:''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs" style={sc.ts}>{f.file_size_mb} MB</span>
                        <span className="text-xs" style={sc.tm}>{new Date(f.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
<button onClick={() => setFileDelConfirm({open:true, file:f})} className="p-1 rounded-md hover:opacity-80 transition-colors" title="Delete">
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
                    <Clock className="w-4 h-4" style={{color:'var(--color-warning)'}}/> {t('Delete Old Files', { defaultValue: 'Delete Old Files' })}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {months:3,l:t('3+ Months', { defaultValue: '3+ Months' }),count:stSum.summary.old_files?.['3_months']?.count||0,size:stSum.summary.old_files?.['3_months']?.size_mb||0,color:'#f59e0b'},
                      {months:6,l:t('6+ Months', { defaultValue: '6+ Months' }),count:stSum.summary.old_files?.['6_months']?.count||0,size:stSum.summary.old_files?.['6_months']?.size_mb||0,color:'#f97316'},
                      {months:12,l:t('1+ Year', { defaultValue: '1+ Year' }),count:stSum.summary.old_files?.['12_months']?.count||0,size:stSum.summary.old_files?.['12_months']?.size_mb||0,color:'#ef4444'},
                    ].map(x=>
                      <div key={x.months} className="p-4 rounded-lg flex flex-col gap-3" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                        <div>
                          <p className="text-xs font-semibold" style={{color:x.color}}>{x.l}</p>
                          <p className="text-lg font-bold" style={sc.th}>{t('{{count}} files', { count: x.count, defaultValue: `${x.count} files` })}</p>
                          <p className="text-xs" style={sc.ts}>{x.size} MB</p>
                        </div>
                        <button onClick={()=>setDelModal({type:'old',months:x.months,l:x.l,count:x.count})} disabled={x.count===0} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5" style={{background:x.count>0?'var(--color-danger)':'var(--bg-hover)',color:x.count>0?'#fff':'var(--text-muted)',cursor:x.count>0?'pointer':'not-allowed'}}>
                          <Trash2 className="w-3 h-3"/> {t('Delete', { defaultValue: 'Delete' })}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={sc.th}>
                    <AlertTriangle className="w-4 h-4" style={{color:'var(--color-danger)'}}/> {t('Delete Large Files', { defaultValue: 'Delete Large Files' })}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {minGb:1,l:t('> 1 GB Files', { defaultValue: '> 1 GB Files' }),count:stSum.summary.large_files?.['over_1gb']?.count||0,size:stSum.summary.large_files?.['over_1gb']?.size_mb||0,color:'#ef4444'},
                      {minGb:2,l:t('> 2 GB Files', { defaultValue: '> 2 GB Files' }),count:stSum.summary.large_files?.['over_2gb']?.count||0,size:stSum.summary.large_files?.['over_2gb']?.size_mb||0,color:'#dc2626'},
                    ].map(x=>
                      <div key={x.minGb} className="p-4 rounded-lg flex flex-col gap-3" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                        <div>
                          <p className="text-xs font-semibold" style={{color:x.color}}>{x.l}</p>
                          <p className="text-lg font-bold" style={sc.th}>{t('{{count}} files', { count: x.count, defaultValue: `${x.count} files` })}</p>
                          <p className="text-xs" style={sc.ts}>{x.size} MB</p>
                        </div>
                        <button onClick={()=>setDelModal({type:'large',minGb:x.minGb,l:x.l,count:x.count})} disabled={x.count===0} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5" style={{background:x.count>0?'var(--color-danger)':'var(--bg-hover)',color:x.count>0?'#fff':'var(--text-muted)',cursor:x.count>0?'pointer':'not-allowed'}}>
                          <Trash2 className="w-3 h-3"/> {t('Delete', { defaultValue: 'Delete' })}
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
                    <p style={{color:'var(--text-secondary)',fontSize:'14px'}}>{t('No storage notifications', { defaultValue: 'No storage notifications' })}</p>
                  </div>
                ):(
                  <>
                    {stPinned.length>0&&(
                      <div className="rounded-xl p-4 shadow-sm" style={{...sc.card,borderLeft:'3px solid var(--color-warning)'}}>
                        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{color:'var(--color-warning)'}}>
                          <AlertTriangle className="w-3.5 h-3.5"/> {t('Pinned Alerts ({{count}})', { count: stPinned.length, defaultValue: `Pinned Alerts (${stPinned.length})` })}
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
                  <Settings className="w-4 h-4" style={{color:'var(--color-primary)'}}/> {t('Storage Preferences', { defaultValue: 'Storage Preferences' })}
                </h3>
                {stPrefLd?(
                  <div className="flex items-center gap-2 py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" style={{color:'var(--color-primary)'}}/>
                    <span className="text-xs" style={sc.ts}>{t('Loading preferences...', { defaultValue: 'Loading preferences...' })}</span>
                  </div>
                ):stPref?(
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                      <p className="text-xs font-semibold mb-2" style={{color:'var(--color-primary)'}}>{t('Cleanup Policy', { defaultValue: 'Cleanup Policy' })}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs" style={sc.ts}>{t('Delete files older than (months)', { defaultValue: 'Delete files older than (months)' })}</label>
                          <input type="number" min="1" max="60" defaultValue={stPref.cleanup_months||6} className="w-full mt-1 p-2 rounded-lg text-sm" style={{background:'var(--bg-primary)',border:'1px solid var(--border)',color:'var(--text-heading)'}}/>
                        </div>
                        <div>
                          <label className="text-xs" style={sc.ts}>{t('Large file threshold (MB)', { defaultValue: 'Large file threshold (MB)' })}</label>
                          <input type="number" min="100" max="10000" step="100" defaultValue={stPref.large_file_threshold_mb||500} className="w-full mt-1 p-2 rounded-lg text-sm" style={{background:'var(--bg-primary)',border:'1px solid var(--border)',color:'var(--text-heading)'}}/>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                      <p className="text-xs font-semibold mb-2" style={{color:'var(--color-warning)'}}>{t('Alert Thresholds', { defaultValue: 'Alert Thresholds' })}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs" style={sc.ts}>{t('Warning threshold (%)', { defaultValue: 'Warning threshold (%)' })}</label>
                          <input type="number" min="50" max="95" defaultValue={stPref.warn_threshold||80} className="w-full mt-1 p-2 rounded-lg text-sm" style={{background:'var(--bg-primary)',border:'1px solid var(--border)',color:'var(--text-heading)'}}/>
                        </div>
                        <div>
                          <label className="text-xs" style={sc.ts}>{t('Critical threshold (%)', { defaultValue: 'Critical threshold (%)' })}</label>
                          <input type="number" min="80" max="100" defaultValue={stPref.critical_threshold||95} className="w-full mt-1 p-2 rounded-lg text-sm" style={{background:'var(--bg-primary)',border:'1px solid var(--border)',color:'var(--text-heading)'}}/>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button disabled={stPrefSav} className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5" style={{background:'var(--color-primary)',color:'#fff'}}>
                        {stPrefSav?<Loader2 className="w-3 h-3 animate-spin"/>:<Check className="w-3 h-3"/>}
                        {stPrefSav?t('Saving...', { defaultValue: 'Saving...' }):t('Save Preferences', { defaultValue: 'Save Preferences' })}
                      </button>
                    </div>
                  </div>
                ):<p className="text-xs text-center py-6" style={sc.tm}>{t('No preferences data', { defaultValue: 'No preferences data' })}</p>}
              </div>
            )}
          </>
        ):(
          <div className="rounded-xl p-10 shadow-sm text-center" style={sc.card}>
            <HardDrive className="w-10 h-10 mx-auto mb-3" style={{color:'var(--text-muted)'}}/>
            <p style={{color:'var(--text-secondary)',fontSize:'14px'}}>{t('No storage data available', { defaultValue: 'No storage data available' })}</p>
          </div>
        )}
      </div>}

      {tab==='bill'&&<div className="flex flex-col gap-6">
        {bill?<>
          <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2" style={sc.th}>
                <CreditCard className="w-5 h-5" style={{color:'var(--color-primary)'}}/> {t('Billing Summary', { defaultValue: 'Billing Summary' })}
              </h3>
            </div>
            {bill.summary&&(
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {l:t('Total Paid', { defaultValue: 'Total Paid' }),v:fmt$(bill.summary.total_paid),color:'var(--color-success)',bg:'rgba(16,185,129,0.08)'},
                  {l:t('Total Pending', { defaultValue: 'Total Pending' }),v:fmt$(bill.summary.total_pending),color:'var(--color-warning)',bg:'rgba(245,158,11,0.08)'},
                  {l:t('Total Invoices', { defaultValue: 'Total Invoices' }),v:bill.summary.total_invoices||0,color:'var(--color-primary)',bg:'var(--color-primary-bg)'},
                  {l:t('Current Plan', { defaultValue: 'Current Plan' }),v:bill.summary.current_plan?.name||plan?.name||t('None', { defaultValue: 'None' }),color:'var(--text-heading)',bg:'var(--bg-hover)'},
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
              <Receipt className="w-4 h-4" style={{color:'var(--color-primary)'}}/> {t('Invoice History', { defaultValue: 'Invoice History' })}
            </h3>
            {bill.invoices?.length>0?(
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{borderBottom:'1px solid var(--border-light)'}}>
                      {[t('Invoice', { defaultValue: 'Invoice' }),t('Status', { defaultValue: 'Status' }),t('Plan', { defaultValue: 'Plan' }),t('Total', { defaultValue: 'Total' }),t('Period', { defaultValue: 'Period' }),t('Date', { defaultValue: 'Date' }),t('Actions', { defaultValue: 'Actions' })].map(h=>
                        <th key={h} className={`py-2.5 px-3 text-xs font-semibold uppercase tracking-wider ${h===t('Total', { defaultValue: 'Total' })?'text-right':h===t('Status', { defaultValue: 'Status' })||h===t('Actions', { defaultValue: 'Actions' })?'text-center':'text-left'}`} style={{color:'var(--text-muted)'}}>{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {bill.invoices.map(inv=>{
                      const si=INV_STATUS[inv.status]||INV_STATUS.paid;
                      const SI=si.icon;
                      let displayDate=fmtDT(inv.approved_at||inv.paid_at||inv.created_at);
                      let datePrefix='';
                      if(inv.approved_at){datePrefix=`${t('Approved', { defaultValue: 'Approved' })} `;}
                      else if(inv.due_at){datePrefix=`${t('Due', { defaultValue: 'Due' })} `;}
                      return(
                        <tr key={inv.id} style={{borderBottom:'1px solid var(--border-light)'}} className="hover:opacity-80 transition-opacity">
                          <td className="py-3 px-3"><div className="flex items-center gap-2"><FileText className="w-4 h-4" style={{color:'var(--text-muted)'}}/><span className="font-medium" style={sc.text}>{inv.invoice_number}</span></div></td>
                          <td className="py-3 px-3 text-center"><span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full" style={{background:si.bg,color:si.color}}><SI className="w-3.5 h-3.5"/>{t(inv.status, { defaultValue: inv.status })}</span></td>
                          <td className="py-3 px-3 text-sm" style={sc.ts}>{inv.plan?.name||'N/A'}</td>
                          <td className="py-3 px-3 text-right text-sm font-semibold" style={sc.text}>{fmt$(inv.total_amount,inv.currency)}</td>
                          <td className="py-3 px-3 text-sm" style={sc.tm}>{inv.billing_period_start&&inv.billing_period_end?<>{new Date(inv.billing_period_start).toLocaleDateString('en-US',{month:'short',day:'numeric'})} - {new Date(inv.billing_period_end).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</>:inv.billing_period||'—'}</td>
                          <td className="py-3 px-3 text-sm" style={sc.tm}>{displayDate?<div><div>{datePrefix}{displayDate.date}</div><div className="text-xs opacity-70">{displayDate.time}</div></div>:'—'}</td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={()=>setViewInv(inv)} className="p-1.5 rounded-md transition-colors hover:opacity-80" style={{background:'var(--color-primary-bg)',color:'var(--color-primary)'}} title={t('View Invoice Details', { defaultValue: 'View Invoice Details' })}>
                                <Eye className="w-4 h-4"/>
                              </button>
                              <button onClick={async()=>{try{await api.downloadInvoice(inv.id);}catch{setToast({t:'e',m:t('Download failed.', { defaultValue: 'Download failed.' })});}}} className="p-1.5 rounded-md transition-colors hover:opacity-80" style={{background:'var(--color-primary-bg)',color:'var(--color-primary)'}} title={t('Download Invoice', { defaultValue: 'Download Invoice' })}>
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
                <p className="text-sm" style={sc.ts}>{t('No invoices yet', { defaultValue: 'No invoices yet' })}</p>
              </div>
            )}
          </div>
        </>:<div className="rounded-xl p-10 shadow-sm flex items-center justify-center gap-3" style={sc.card}><Loader2 className="w-5 h-5 animate-spin" style={{color:'var(--color-primary)'}}/><span style={{color:'var(--text-secondary)',fontSize:'14px'}}>{t('Loading billing...', { defaultValue: 'Loading billing...' })}</span></div>}
      </div>}

      {tab==='hist'&&<div className="flex flex-col gap-6">
        {hist?<>
          <div className="rounded-xl p-5 shadow-sm" style={sc.card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2" style={sc.th}>
                <Clock className="w-5 h-5" style={{color:'var(--color-primary)'}}/> {t('Subscription History', { defaultValue: 'Subscription History' })}
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {l:t('Subscriptions', { defaultValue: 'Subscriptions' }),v:hist.summary?.total_subscriptions||0,color:'var(--color-primary)',bg:'var(--color-primary-bg)'},
                {l:t('Plan Changes', { defaultValue: 'Plan Changes' }),v:hist.summary?.total_plan_changes||0,color:'#d97706',bg:'rgba(245,158,11,0.08)'},
                {l:t('Renewals', { defaultValue: 'Renewals' }),v:hist.summary?.total_renewals||0,color:'var(--color-success)',bg:'rgba(16,185,129,0.08)'},
                {l:t('Trial Periods', { defaultValue: 'Trial Periods' }),v:hist.summary?.total_trial_periods||0,color:'#6366f1',bg:'rgba(99,102,241,0.08)'},
              ].map(x=>
                <div key={x.l} className="p-3 rounded-lg" style={{background:x.bg,border:'1px solid var(--border-light)'}}>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{color:'var(--text-muted)'}}>{x.l}</p>
                  <p className="text-xl font-bold mt-1" style={{color:x.color}}>{x.v}</p>
                </div>
              )}
            </div>
          </div>

          {hist.plan_usage?.length>0&&<div className="rounded-xl p-5 shadow-sm" style={sc.card}>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={sc.th}><Shield className="w-4 h-4" style={{color:'var(--color-primary)'}}/>{t('Plan Usage', { defaultValue: 'Plan Usage' })}</h3>
            <div className="flex flex-wrap gap-2">{hist.plan_usage.map(p=><span key={p.plan_id} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>{p.plan_name} <span className="font-bold" style={{color:'var(--color-primary)'}}>x{p.times_used}</span></span>)}</div>
          </div>}

          {hist.history?.length>0&&<div className="rounded-xl p-5 shadow-sm" style={sc.card}>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={sc.th}><Clock className="w-4 h-4" style={{color:'var(--color-primary)'}}/>{t('Subscription History', { defaultValue: 'Subscription History' })}</h3>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{borderBottom:'1px solid var(--border-light)'}}>
              {[t('Event', { defaultValue: 'Event' }),t('Plan', { defaultValue: 'Plan' }),t('Date', { defaultValue: 'Date' })].map(h=><th key={h} className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wider" style={{color:'var(--text-muted)'}}>{h}</th>)}
            </tr></thead><tbody>{hist.history.map(h=>(
              <tr key={h.id} style={{borderBottom:'1px solid var(--border-light)'}} className="hover:opacity-80 transition-opacity">
                <td className="py-3 px-3"><span className="text-sm font-medium px-2.5 py-1 rounded-full" style={{background:'var(--color-primary-bg)',color:'var(--color-primary)'}}>{t(h.event_type?.replace(/_/g,' '), { defaultValue: h.event_type?.replace(/_/g,' ') })}</span></td>
                <td className="py-3 px-3 text-sm" style={sc.ts}>{h.plan?.name||'—'}</td>
                <td className="py-3 px-3 text-sm" style={sc.tm}>{fmtD(h.created_at)}</td>
              </tr>))}</tbody></table></div>
          </div>}
        </>:<div className="rounded-xl p-10 shadow-sm flex items-center justify-center gap-3" style={sc.card}><Loader2 className="w-5 h-5 animate-spin" style={{color:'var(--color-primary)'}}/><span style={{color:'var(--text-secondary)',fontSize:'14px'}}>{t('Loading history...', { defaultValue: 'Loading history...' })}</span></div>}
      </div>}

      {delModal&&(
        <div style={{position:'fixed',inset:0,zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)'}}>
          <div className="rounded-2xl p-6 w-full max-w-md" style={{background:'var(--bg-card)',boxShadow:'var(--shadow-lg)'}}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:'var(--color-danger-bg)'}}>
                <AlertTriangle className="w-5 h-5" style={{color:'var(--color-danger)'}}/>
              </div>
              <div>
                <h3 className="text-base font-bold" style={sc.th}>{t('Confirm Delete', { defaultValue: 'Confirm Delete' })}</h3>
                <p className="text-xs" style={sc.ts}>{t('This action cannot be undone', { defaultValue: 'This action cannot be undone' })}</p>
              </div>
            </div>
            <p className="text-sm mb-5" style={sc.ts}>{t('Delete {{count}} files ({{label}})?', { count: delModal.count, label: delModal.l, defaultValue: `Delete ${delModal.count} files (${delModal.l})?` })}</p>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setDelModal(null)} className="px-4 py-2 rounded-lg text-sm font-medium transition-colors" style={{background:'var(--bg-hover)',color:'var(--text-secondary)',border:'1px solid var(--border-light)'}}>{t('Cancel', { defaultValue: 'Cancel' })}</button>
              <button onClick={async()=>{setDelLd(true);try{if(delModal.type==='old')await api.delete('/organization/storage/old-files',{data:{months:delModal.months}});else await api.delete('/organization/storage/large-files',{data:{min_size_gb:delModal.minGb}});setDelModal(null);loadStData();}catch{}setDelLd(false);}} disabled={delLd} className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2" style={{background:'var(--color-danger)'}}>
                {delLd?<Loader2 className="w-4 h-4 animate-spin"/>:<Trash2 className="w-4 h-4"/>}
                {delLd?t('Deleting...', { defaultValue: 'Deleting...' }):t('Delete', { defaultValue: 'Delete' })}
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
                <h3 className="text-lg font-bold" style={sc.th}>{t('Invoice Details', { defaultValue: 'Invoice Details' })}</h3>
                <p className="text-xs" style={sc.ts}>{viewInv.invoice_number}</p>
              </div>
              <button onClick={()=>setViewInv(null)} className="p-2 rounded-lg transition-colors" style={{background:'var(--bg-hover)',color:'var(--text-secondary)'}}><X className="w-5 h-5"/></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto" style={{maxHeight:'calc(90vh - 140px)'}}>
              <div className="text-center pb-4" style={{borderBottom:'1px solid var(--border-light)'}}>
                <h4 className="text-xl font-bold" style={{color:'var(--color-primary)'}}>{t("TechXaro Technologies", { defaultValue: "TechXaro Technologies" })}</h4>
                <p className="text-xs mt-1" style={{color:'var(--text-muted)'}}>{t('SaaS Platform & Development Services', { defaultValue: 'SaaS Platform & Development Services' })}</p>
                <p className="text-xs" style={{color:'var(--text-muted)'}}>www.techxaro.com</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>{t('Organization', { defaultValue: 'Organization' })}</p>
                  <p className="text-sm font-semibold" style={sc.text}>{viewInv.organization?.name||'N/A'}</p>
                </div>
                <div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>{t('Status', { defaultValue: 'Status' })}</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full" style={{background:INV_STATUS[viewInv.status]?.bg,color:INV_STATUS[viewInv.status]?.color}}>
                    {(() => {const I=INV_STATUS[viewInv.status]?.icon;return I?<I className="w-3 h-3"/>:null;})()}
                    {t(viewInv.status, { defaultValue: viewInv.status })}
                  </span>
                </div>
                <div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>{t('Plan', { defaultValue: 'Plan' })}</p>
                  <p className="text-sm font-semibold" style={sc.text}>{viewInv.plan?.name||'N/A'}</p>
                </div>
                <div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>{t('Total Amount', { defaultValue: 'Total Amount' })}</p>
                  <p className="text-sm font-bold" style={{color:'var(--color-success)'}}>{fmt$(viewInv.total_amount,viewInv.currency)}</p>
                </div>
              </div>
              <div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>{t('Billing Period', { defaultValue: 'Billing Period' })}</p>
                <p className="text-sm" style={sc.text}>
                  {viewInv.billing_period_start&&viewInv.billing_period_end?<>{new Date(viewInv.billing_period_start).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} - {new Date(viewInv.billing_period_end).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</>:viewInv.billing_period||'N/A'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {viewInv.due_at&&<div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>{t('Due Date', { defaultValue: 'Due Date' })}</p>
                  <p className="text-sm" style={sc.text}>{new Date(viewInv.due_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
                </div>}
                {viewInv.paid_at&&<div className="p-3 rounded-lg" style={{background:'var(--bg-hover)',border:'1px solid var(--border-light)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--text-muted)'}}>{t('Paid Date', { defaultValue: 'Paid Date' })}</p>
                  <p className="text-sm" style={sc.text}>{new Date(viewInv.paid_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
                </div>}
                {viewInv.approved_at&&<div className="p-3 rounded-lg" style={{background:'rgba(16,185,129,0.05)',border:'1px solid rgba(16,185,129,0.2)'}}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--color-success)'}}>{t('Approved Date', { defaultValue: 'Approved Date' })}</p>
                  <p className="text-sm font-medium" style={{color:'var(--color-success)'}}>{new Date(viewInv.approved_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
                </div>}
              </div>
              {viewInv.notes&&<div className="p-3 rounded-lg" style={{background:'var(--color-primary-bg)',border:'1px solid var(--color-primary)'}}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:'var(--color-primary)'}}>{t('Notes', { defaultValue: 'Notes' })}</p>
                <p className="text-sm" style={sc.text}>{viewInv.notes}</p>
              </div>}
            </div>
            <div className="flex justify-end gap-2 p-5" style={{borderTop:'1px solid var(--border-light)'}}>
              <button onClick={async()=>{try{await api.downloadInvoice(viewInv.id);}catch{setToast({t:'e',m:t('Download failed.', { defaultValue: 'Download failed.' })});}}} className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 transition-colors" style={{background:'var(--color-primary)'}}>
                <Download className="w-4 h-4"/> {t('Download Invoice', { defaultValue: 'Download Invoice' })}
              </button>
              <button onClick={()=>setViewInv(null)} className="px-4 py-2 rounded-lg text-sm font-medium transition-colors" style={{background:'var(--bg-hover)',color:'var(--text-secondary)',border:'1px solid var(--border-light)'}}>{t('Close', { defaultValue: 'Close' })}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={fileDelConfirm.open}
        onClose={()=>setFileDelConfirm({open:false,file:null})}
        onConfirm={async()=>{
          try{
            await api.delete(`/organization/storage/${fileDelConfirm.file.id}`);
            setToast({t:'s',m:'File deleted successfully from all references.'});
            setFileDelConfirm({open:false,file:null});
            loadStData();
          }catch{
            setToast({t:'e',m:'Failed to delete file.'});
            setFileDelConfirm({open:false,file:null});
          }
        }}
        title="Delete File"
        message={`Are you sure you want to delete "${fileDelConfirm.file?.file_name}"? This file will be removed from storage and all linked projects, tasks, deliverables, and submissions. This action cannot be undone.`}
        confirmText="Delete"
        danger
      />
    </DashboardLayout>
  );
}

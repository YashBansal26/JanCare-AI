import React, { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Stethoscope, LogIn, LogOut, Coffee, PlayCircle, CheckCircle2, UserX, Sparkles, AlertTriangle, Clock, Users, History, RefreshCw, DoorOpen, GraduationCap, Languages, Pill, FlaskConical, Upload, Trash2, Plus, X, Eye, FileText, ShieldAlert, ShieldCheck, Star } from 'lucide-react';
import { doctorLogin, fetchDoctorMe, fetchDoctorQueue, doctorUpdateStatus, doctorSaveNotes, doctorSetBreak, doctorFetchReports, doctorUploadReport, doctorDeleteReport, openReportFile, fileToBase64, doctorRxCheck, doctorFetchRatings } from '../api';
import LabAnalysis from './LabAnalysis';
import { DOSES, TIMINGS, COMMON_TESTS } from '../prescription';

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const urgencyStyle = { Emergency: 'bg-red-100 text-red-700 border-red-200', Urgent: 'bg-amber-100 text-amber-800 border-amber-200', Routine: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
const statusStyle = { 'In Progress': 'bg-indigo-100 text-indigo-700', 'Checked In': 'bg-blue-100 text-blue-700', Scheduled: 'bg-gray-100 text-gray-600', Completed: 'bg-green-100 text-green-700', 'No-Show': 'bg-red-100 text-red-700', Cancelled: 'bg-gray-100 text-gray-400' };

function DoctorLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => {
    if (sessionStorage.getItem('jancare_session_expired')) { sessionStorage.removeItem('jancare_session_expired'); return 'Your session expired. Please sign in again.'; }
    return '';
  });
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const data = await doctorLogin(email, password);
      localStorage.setItem('doctor_token', data.token);
      onLogin();
    } catch (err) { setError(err.response?.data?.error || 'Unable to sign in.'); }
    finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-900 to-slate-900 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-4">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center"><Stethoscope className="w-7 h-7" /></div>
          <h1 className="mt-4 text-2xl font-black text-gray-800">Doctor Portal</h1>
          <p className="text-sm text-gray-500">Sign in with the account created by hospital staff.</p>
        </div>
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
        <label className="block text-sm font-semibold text-gray-600">Email
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-teal-500" /></label>
        <label className="block text-sm font-semibold text-gray-600">Password
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-teal-500" /></label>
        <button disabled={loading} className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 font-bold text-white hover:bg-teal-700 disabled:opacity-60"><LogIn className="w-5 h-5" />{loading ? 'Signing in…' : 'Sign In'}</button>
        <p className="text-xs text-gray-400 text-center">Demo accounts: run <code>npm run seed-doctors</code> in backend (password Doctor@123).</p>
        <button type="button" onClick={() => { window.location.href = '/'; }} className="w-full text-xs text-gray-400 hover:text-gray-700">← Patient portal</button>
      </form>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone = 'text-gray-800' }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-400"><Icon className="w-4 h-4" />{label}</div>
      <div className={`mt-1 text-2xl font-black ${tone}`}>{value ?? '—'}</div>
    </div>
  );
}

const EMPTY_RX = { diagnosis: '', medicines: [], labTests: [], followUpDays: '' };
const NEW_MED = { name: '', dose: '1-0-1', timing: 'After food', days: 5, notes: '' };
const inputCls = 'rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-teal-500';

const SEV = { contraindicated: 'bg-red-600 text-white', major: 'bg-red-100 text-red-800 border border-red-200', moderate: 'bg-amber-100 text-amber-800 border border-amber-200', info: 'bg-gray-100 text-gray-600 border border-gray-200' };

// Live safety check of the medicines being written (allergies, interactions, duplicates, age, conditions)
function RxSafety({ apptId, medicines }) {
  const [res, setRes] = useState(null);
  const key = medicines.map(m => m.name.trim()).filter(Boolean).join('|');
  useEffect(() => {
    if (!key) { setRes(null); return undefined; }
    const t = setTimeout(() => doctorRxCheck(apptId, medicines.filter(m => m.name.trim())).then(setRes).catch(() => setRes(null)), 500);
    return () => clearTimeout(t);
  }, [apptId, key]);
  if (!res) return null;
  return (
    <div className="space-y-1">
      {res.warnings.length === 0
        ? <p className="flex items-center gap-1 text-xs font-semibold text-green-700"><ShieldCheck className="w-4 h-4" /> No allergy or interaction warnings for the {res.checked} recognised medicine(s){res.currentMedicines.length ? `, including ${res.currentMedicines.length} still running from earlier visits` : ''}.</p>
        : res.warnings.map((w, i) => (
          <p key={i} className={`flex items-start gap-1 rounded-lg px-2 py-1 text-xs ${SEV[w.severity]}`}><ShieldAlert className="w-4 h-4 shrink-0" /><span><b className="uppercase">{w.severity}</b> · {w.message}</span></p>
        ))}
      {res.unknown.length > 0 && <p className="text-[11px] text-gray-400">Not in the checker's list (not checked): {res.unknown.join(', ')}</p>}
    </div>
  );
}

function PrescriptionEditor({ rx, setRx, apptId }) {
  const [testInput, setTestInput] = useState('');
  const setMed = (i, k, v) => setRx({ ...rx, medicines: rx.medicines.map((m, j) => (j === i ? { ...m, [k]: v } : m)) });
  const addTest = (name) => { const t = name.trim(); if (t && !rx.labTests.includes(t)) setRx({ ...rx, labTests: [...rx.labTests, t] }); setTestInput(''); };
  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4 space-y-3">
      <p className="flex items-center gap-1 text-xs font-bold text-teal-700"><Pill className="w-4 h-4" /> Prescription (patient will see this)</p>
      <input value={rx.diagnosis} onChange={e => setRx({ ...rx, diagnosis: e.target.value })} maxLength={300} placeholder="Diagnosis / impression" className={`${inputCls} w-full`} />
      <div className="space-y-2">
        {rx.medicines.map((m, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input value={m.name} onChange={e => setMed(i, 'name', e.target.value)} placeholder="Medicine + strength, e.g. Paracetamol 650 mg" className={`${inputCls} col-span-12 md:col-span-4`} />
            <select value={m.dose} onChange={e => setMed(i, 'dose', e.target.value)} className={`${inputCls} col-span-4 md:col-span-2`} title="Morning-Afternoon-Night">{DOSES.map(d => <option key={d}>{d}</option>)}</select>
            <select value={m.timing} onChange={e => setMed(i, 'timing', e.target.value)} className={`${inputCls} col-span-5 md:col-span-2`}>{TIMINGS.map(d => <option key={d}>{d}</option>)}</select>
            <input type="number" min={0} max={365} value={m.days} onChange={e => setMed(i, 'days', e.target.value)} className={`${inputCls} col-span-3 md:col-span-1`} title="Days" />
            <input value={m.notes} onChange={e => setMed(i, 'notes', e.target.value)} placeholder="Note" className={`${inputCls} col-span-10 md:col-span-2`} />
            <button type="button" onClick={() => setRx({ ...rx, medicines: rx.medicines.filter((_, j) => j !== i) })} className="col-span-2 md:col-span-1 text-gray-400 hover:text-red-600 justify-self-center" title="Remove"><X className="w-4 h-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setRx({ ...rx, medicines: [...rx.medicines, { ...NEW_MED }] })} className="flex items-center gap-1 text-xs font-bold text-teal-700 hover:underline"><Plus className="w-3.5 h-3.5" /> Add medicine</button>
        <p className="text-[11px] text-gray-400">Dose = Morning-Afternoon-Night (1-0-1 = morning and night). SOS = only if needed.</p>
        {apptId && <RxSafety apptId={apptId} medicines={rx.medicines} />}
      </div>
      <div>
        <p className="text-xs font-bold text-gray-600 mb-1 flex items-center gap-1"><FlaskConical className="w-3.5 h-3.5" /> Lab tests</p>
        <div className="flex flex-wrap gap-1 mb-2">
          {rx.labTests.map(t => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-white border border-teal-200 px-2 py-0.5 text-xs text-teal-800">{t}
              <button type="button" onClick={() => setRx({ ...rx, labTests: rx.labTests.filter(x => x !== t) })}><X className="w-3 h-3" /></button></span>
          ))}
        </div>
        <div className="flex gap-2">
          <input list="jc-tests" value={testInput} onChange={e => setTestInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTest(testInput); } }} placeholder="Type or pick a test" className={`${inputCls} flex-1`} />
          <datalist id="jc-tests">{COMMON_TESTS.map(t => <option key={t} value={t} />)}</datalist>
          <button type="button" onClick={() => addTest(testInput)} className="rounded-lg border border-teal-200 px-3 text-xs font-bold text-teal-700 hover:bg-teal-50">Add</button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs font-bold text-gray-600">Follow-up after
        <input type="number" min={0} max={365} value={rx.followUpDays ?? ''} onChange={e => setRx({ ...rx, followUpDays: e.target.value })} className={`${inputCls} w-20`} /> days (leave empty if none)</label>
    </div>
  );
}

function ReportsSection({ appt, rx }) {
  const [reports, setReports] = useState([]);
  const [testName, setTestName] = useState('');
  const [summary, setSummary] = useState('');
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const load = useCallback(() => doctorFetchReports(appt._id).then(setReports).catch(() => {}), [appt._id]);
  useEffect(() => { load(); }, [load]);
  const options = [...new Set([...(rx.labTests || []), ...COMMON_TESTS])];

  const upload = async (e) => {
    e.preventDefault(); setMsg('');
    if (!file) return setMsg('Choose a file');
    if (file.size > 5 * 1024 * 1024) return setMsg('File must be under 5 MB');
    setUploading(true);
    try {
      await doctorUploadReport(appt._id, { testName, resultSummary: summary, fileName: file.name, mimeType: file.type, dataBase64: await fileToBase64(file) });
      setFile(null); setSummary(''); setTestName(''); e.target.reset(); setMsg('Uploaded — patient notified'); load();
    } catch (err) { setMsg(err.response?.data?.error || 'Upload failed'); }
    setUploading(false);
  };

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
      <p className="flex items-center gap-1 text-xs font-bold text-blue-700"><FileText className="w-4 h-4" /> Lab reports</p>
      {reports.length === 0 && <p className="text-xs text-gray-500">No reports uploaded yet.</p>}
      {reports.map(r => (
        <div key={r._id} className="flex items-center justify-between gap-2 rounded-lg bg-white border border-blue-100 px-3 py-2 text-sm">
          <div className="min-w-0"><b>{r.testName}</b> <span className="text-xs text-gray-400">{r.fileName}</span>{r.resultSummary && <p className="text-xs text-gray-500 truncate">{r.resultSummary}</p>}
            {r.analysis && <div className="mt-1"><LabAnalysis analysis={r.analysis} compact /></div>}</div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => openReportFile(r._id, 'doctor')} className="text-blue-600" title="View"><Eye className="w-4 h-4" /></button>
            <button type="button" onClick={async () => { if (window.confirm('Delete this report?')) { await doctorDeleteReport(r._id); load(); } }} className="text-gray-400 hover:text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      ))}
      <form onSubmit={upload} className="grid gap-2 md:grid-cols-12 items-center">
        <input list="jc-report-tests" required value={testName} onChange={e => setTestName(e.target.value)} placeholder="Test name" className={`${inputCls} md:col-span-3`} />
        <datalist id="jc-report-tests">{options.map(t => <option key={t} value={t} />)}</datalist>
        <input type="file" required accept="application/pdf,image/png,image/jpeg,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs md:col-span-4" />
        <input value={summary} onChange={e => setSummary(e.target.value)} maxLength={500} placeholder="Result summary (optional), e.g. Hb 11.2 - mildly low" className={`${inputCls} md:col-span-3`} />
        <button disabled={uploading} className="md:col-span-2 flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Upload className="w-3.5 h-3.5" />{uploading ? 'Uploading…' : 'Upload'}</button>
      </form>
      {msg && <p className="text-xs text-blue-700">{msg}</p>}
    </div>
  );
}

function PatientCard({ appt, onAction, busy, mode = 'active', onClose }) {
  const [notes, setNotes] = useState(appt.doctorNotes || '');
  const [advice, setAdvice] = useState(appt.advice || '');
  const [saved, setSaved] = useState('');
  const [rx, setRx] = useState(appt.prescription ? { ...EMPTY_RX, ...appt.prescription } : { ...EMPTY_RX });
  useEffect(() => {
    setNotes(appt.doctorNotes || ''); setAdvice(appt.advice || '');
    setRx(appt.prescription ? { ...EMPTY_RX, ...appt.prescription } : { ...EMPTY_RX });
  }, [appt._id]);
  const t = appt.aiTriage;
  return (
    <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-md p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">{mode === 'completed' ? 'Visit record (completed)' : 'Now consulting'}</p>
          <h2 className="text-2xl font-black text-gray-800">{appt.patientName}</h2>
          <p className="text-sm text-gray-500">{appt.patientAge ? `${appt.patientAge} yrs` : ''}{appt.patientGender ? ` · ${appt.patientGender}` : ''} · Slot {appt.timeSlot}{appt.tokenNumber ? ` · Token ${appt.tokenNumber}` : ''} · Ticket {String(appt.ticketId).slice(0, 8).toUpperCase()}{appt.source === 'walk-in' ? ' · Walk-in' : ''}</p>
          {appt.health && (
            <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
              {appt.health.allergies.length > 0
                ? <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-700">Allergic: {appt.health.allergies.join(', ')}</span>
                : <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-500">No known allergies</span>}
              {appt.health.conditions.length > 0 && <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{appt.health.conditions.join(', ')}</span>}
              {appt.health.relation && <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">Family member ({appt.health.relation})</span>}
              {appt.health.abhaId && <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">ABHA {appt.health.abhaId}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {t?.urgency && <span className={`px-3 py-1 rounded-full border text-xs font-bold ${urgencyStyle[t.urgency]}`}>{t.urgency}</span>}
          {onClose && <button onClick={onClose} className="text-gray-400 hover:text-gray-700" title="Close"><X className="w-5 h-5" /></button>}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-purple-50 border border-purple-100 p-4">
          <p className="flex items-center gap-1 text-xs font-bold text-purple-700"><Sparkles className="w-4 h-4" /> AI pre-visit summary</p>
          {appt.symptoms ? (
            <>
              <p className="mt-2 text-sm text-gray-700">“{appt.symptoms}”</p>
              {t && <p className="mt-2 text-xs text-gray-500">AI suggested <b>{t.department}</b> ({Math.round((t.confidence || 0) * 100)}% confidence){t.department !== appt.department ? ' — differs from booked department, consider transfer' : ''}.</p>}
            </>
          ) : <p className="mt-2 text-sm text-gray-500">Patient did not describe symptoms while booking.</p>}
        </div>
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
          <p className="flex items-center gap-1 text-xs font-bold text-gray-600"><History className="w-4 h-4" /> Visit history</p>
          <p className="mt-2 text-sm text-gray-700">{appt.history.visits} previous visit(s){appt.history.noShows ? `, ${appt.history.noShows} missed` : ''}</p>
          {appt.history.recent.map((h, i) => (
            <p key={i} className="mt-1 text-xs text-gray-500"><b>{h.date}</b> · {h.department} · {h.status}{h.doctorNotes ? ` — ${h.doctorNotes.slice(0, 80)}` : ''}</p>
          ))}
          {appt.patientPhone && <p className="mt-2 text-xs text-gray-400">Phone: {appt.patientPhone}</p>}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-bold text-gray-600">Consultation notes (private)
          <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-sm font-normal outline-none focus:border-indigo-400" placeholder="Findings, diagnosis, tests ordered…" /></label>
        <label className="text-xs font-bold text-gray-600">Advice for patient
          <textarea rows={4} value={advice} onChange={e => setAdvice(e.target.value)} maxLength={1000} className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-sm font-normal outline-none focus:border-indigo-400" placeholder="Medicines, rest, follow-up after 7 days…" /></label>
      </div>
      <div className="mt-4 space-y-4">
        <PrescriptionEditor rx={rx} setRx={setRx} apptId={appt._id} />
        <ReportsSection appt={appt} rx={rx} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {mode !== 'completed' && <button disabled={busy} onClick={() => onAction(appt._id, 'Completed', { notes, advice, prescription: rx })} className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"><CheckCircle2 className="w-4 h-4" /> Complete consultation</button>}
        <button disabled={busy} onClick={async () => { try { await doctorSaveNotes(appt._id, notes, advice, rx); setSaved('Saved'); } catch (err) { setSaved(err.response?.data?.error || 'Save failed'); } setTimeout(() => setSaved(''), 2000); }} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50">{mode === 'completed' ? 'Save changes' : 'Save draft'}</button>
        {saved && <span className="text-xs text-green-600">{saved}</span>}
      </div>
    </div>
  );
}

function Dashboard({ onLogout }) {
  const [me, setMe] = useState(null);
  const [ratings, setRatings] = useState(null);
  useEffect(() => { doctorFetchRatings().then(setRatings).catch(() => {}); }, []);
  const [data, setData] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null); // a completed visit opened for prescription / reports

  const load = useCallback(async () => {
    try {
      const [m, q] = await Promise.all([fetchDoctorMe(), fetchDoctorQueue(date)]);
      setMe(m); setData(q); setError('');
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) onLogout();
      else setError(err.response?.data?.error || 'Could not load the queue.');
    }
  }, [date, onLogout]);

  useEffect(() => { load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, [load]);

  const act = async (id, status, extra) => {
    setBusy(true);
    try { await doctorUpdateStatus(id, status, extra); await load(); }
    catch (err) { setError(err.response?.data?.error || 'Action failed'); }
    setBusy(false);
  };
  const toggleBreak = async () => { await doctorSetBreak(Boolean(me?.onBreak)); load(); };

  if (!me || !data) return <div className="min-h-screen flex items-center justify-center text-gray-500">{error || 'Loading…'}</div>;
  const current = data.queue.find(a => a.status === 'In Progress');
  const selected = !current && selectedId ? data.queue.find(a => a._id === selectedId && a.status === 'Completed') : null;
  const waiting = data.queue.filter(a => a.status === 'Checked In');
  const next = waiting[0];
  const isToday = date === todayStr();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center text-lg font-black">{me.name.replace('Dr. ', '').split(' ').map(w => w[0]).join('').slice(0, 2)}</div>
            <div>
              <h1 className="text-xl font-black text-gray-800">{me.name}</h1>
              <p className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                <span>{me.department}</span>
                <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3" />{me.qualification}</span>
                {me.room && <span className="flex items-center gap-1"><DoorOpen className="w-3 h-3" />{me.room}</span>}
                <span>{me.experienceYears} yrs experience</span>
                {ratings?.average && <span className="flex items-center gap-1 text-amber-600 font-semibold"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{ratings.average} ({ratings.count} ratings)</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <button onClick={toggleBreak} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${me.onBreak ? 'bg-orange-500 text-white' : 'border border-orange-200 text-orange-600 hover:bg-orange-50'}`}>
              <Coffee className="w-4 h-4" /> {me.onBreak ? 'On break — resume' : 'Take a break'}
            </button>
            <button onClick={load} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={onLogout} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50"><LogOut className="w-4 h-4" /> Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
        {me.onBreak && <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-700">You are on break. Patients see that the {me.department} queue is paused.</div>}

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Stat icon={Users} label="Today" value={data.stats.total} />
          <Stat icon={Clock} label="Waiting" value={data.stats.waiting} tone="text-blue-600" />
          <Stat icon={Users} label="Not arrived" value={data.stats.notArrived} />
          <Stat icon={CheckCircle2} label="Seen" value={data.stats.seen} tone="text-green-600" />
          <Stat icon={AlertTriangle} label="Urgent (AI)" value={data.stats.urgent} tone="text-amber-600" />
          <Stat icon={Clock} label="Avg consult" value={data.stats.avgConsultMinutes != null ? `${data.stats.avgConsultMinutes} min` : null} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {current ? <PatientCard appt={current} onAction={act} busy={busy} /> : selected ? <PatientCard appt={selected} onAction={act} busy={busy} mode="completed" onClose={() => setSelectedId(null)} /> : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">No patient in room</p>
                  <p className="text-lg font-bold text-gray-700">{next ? `Next: ${next.patientName} (${next.timeSlot})` : isToday ? 'No checked-in patients waiting.' : 'Viewing another day.'}</p>
                  {next?.aiTriage?.urgency && next.aiTriage.urgency !== 'Routine' && <p className="text-xs text-amber-600 font-semibold">AI flagged as {next.aiTriage.urgency} — moved up within the slot</p>}
                </div>
                {next && isToday && <button disabled={busy || me.onBreak} onClick={() => act(next._id, 'In Progress')} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><PlayCircle className="w-5 h-5" /> Call next patient</button>}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-700">Queue · {data.department} · {date}</h3>
                <span className="text-xs text-gray-400">Sorted by status, slot, then AI urgency</span>
              </div>
              <div className="divide-y divide-gray-50">
                {data.queue.length === 0 && <p className="p-5 text-sm text-gray-400">No appointments for this day.</p>}
                {data.queue.map(a => (
                  <div key={a._id} className={`px-5 py-3 flex flex-wrap items-center justify-between gap-2 ${['Cancelled', 'No-Show'].includes(a.status) ? 'opacity-50' : a.status === 'Completed' ? 'opacity-75' : ''}`}>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800">{a.patientName} <span className="font-normal text-xs text-gray-400">{a.patientAge ? `${a.patientAge}y` : ''} {a.patientGender || ''}</span></p>
                      <p className="text-xs text-gray-500 truncate max-w-md">{a.timeSlot}{a.symptoms ? ` · “${a.symptoms}”` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.aiTriage?.urgency && a.aiTriage.urgency !== 'Routine' && <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${urgencyStyle[a.aiTriage.urgency]}`}>{a.aiTriage.urgency}</span>}
                      {a.noShowRisk && a.noShowRisk.risk !== 'Low' && <span title={a.noShowRisk.reasons.join(', ')} className="px-2 py-0.5 rounded bg-red-50 text-red-600 text-[10px] font-bold">{a.noShowRisk.risk} no-show risk</span>}
                      {a.history.visits > 0 && <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-bold">Returning</span>}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusStyle[a.status]}`}>{a.status}</span>
                      {a.status === 'Completed' && <button onClick={() => { setSelectedId(a._id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-xs font-bold text-teal-700 hover:underline">Rx / Reports</button>}
                      {isToday && a.status === 'Scheduled' && <button disabled={busy} onClick={() => act(a._id, 'Checked In')} className="text-xs font-bold text-blue-600 hover:underline">Check in</button>}
                      {isToday && a.status === 'Checked In' && !current && <button disabled={busy || me.onBreak} onClick={() => act(a._id, 'In Progress')} className="text-xs font-bold text-indigo-600 hover:underline">Call in</button>}
                      {isToday && ['Scheduled', 'Checked In'].includes(a.status) && <button disabled={busy} onClick={() => { if (window.confirm(`Mark ${a.patientName} as no-show?`)) act(a._id, 'No-Show'); }} className="text-gray-400 hover:text-red-600" title="Mark no-show"><UserX className="w-4 h-4" /></button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-bold text-gray-700 flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500" /> AI crowd forecast</h3>
              <p className="text-xs text-gray-400 mb-3">Expected patients per hour in {data.department}</p>
              {data.forecast.length ? (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.forecast.map(f => ({ slot: f.time_slot.slice(0, 5), patients: f.predicted_patients }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="slot" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} width={28} />
                      <Tooltip />
                      <Bar dataKey="patients" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="text-sm text-gray-400">Forecast unavailable.</p>}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-sm text-gray-600 space-y-2">
              <h3 className="font-bold text-gray-700">My profile</h3>
              {me.specialization && <p><b>Specialization:</b> {me.specialization}</p>}
              <p><b>OPD days:</b> {me.opdDays.join(', ')} · {me.opdTimings}</p>
              <p className="flex items-center gap-1"><Languages className="w-4 h-4" /> {me.languages.join(', ')}</p>
              {me.about && <p className="text-gray-500">{me.about}</p>}
              <p className="text-xs text-gray-400">Profile is managed by hospital staff.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DoctorPortal() {
  const [authed, setAuthed] = useState(() => Boolean(localStorage.getItem('doctor_token')));
  const logout = useCallback(() => { localStorage.removeItem('doctor_token'); setAuthed(false); }, []);
  return authed ? <Dashboard onLogout={logout} /> : <DoctorLogin onLogin={() => setAuthed(true)} />;
}

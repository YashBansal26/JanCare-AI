import React, { useCallback, useEffect, useState } from 'react';
import { FlaskConical, LogIn, LogOut, TestTube, Upload, RefreshCw, Eye, Search, CheckCircle2 } from 'lucide-react';
import { labLogin, fetchLabMe, fetchLabOrders, labCollectSample, labUploadReport, openReportFile, fileToBase64 } from '../api';
import LabAnalysis from './LabAnalysis';

function LabLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => {
    if (sessionStorage.getItem('jancare_session_expired')) { sessionStorage.removeItem('jancare_session_expired'); return 'Your session expired. Please sign in again.'; }
    return '';
  });
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { const d = await labLogin(email, password); localStorage.setItem('lab_token', d.token); onLogin(); }
    catch (err) { setError(err.response?.data?.error || 'Unable to sign in.'); }
    setLoading(false);
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-900 to-slate-900 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-4">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center"><FlaskConical className="w-7 h-7" /></div>
          <h1 className="mt-4 text-2xl font-black text-gray-800">Lab Portal</h1>
          <p className="text-sm text-gray-500">For laboratory staff. Accounts are created by hospital staff.</p>
        </div>
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
        <label className="block text-sm font-semibold text-gray-600">Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-sky-500" /></label>
        <label className="block text-sm font-semibold text-gray-600">Password<input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-sky-500" /></label>
        <button disabled={loading} className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 font-bold text-white hover:bg-sky-700 disabled:opacity-60"><LogIn className="w-5 h-5" />{loading ? 'Signing in…' : 'Sign In'}</button>
        <p className="text-xs text-gray-400 text-center">Demo: load demo data in the staff dashboard, then use lab@jancare.demo / Lab@12345.</p>
        <button type="button" onClick={() => { window.location.href = '/'; }} className="w-full text-xs text-gray-400 hover:text-gray-700">← Patient portal</button>
      </form>
    </div>
  );
}

function UploadForm({ order, onDone }) {
  const [file, setFile] = useState(null);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setMsg('');
    if (!file) return setMsg('Choose a PDF or photo of the report.');
    if (file.size > 5 * 1024 * 1024) return setMsg('File must be under 5 MB.');
    setBusy(true);
    try {
      await labUploadReport(order._id, { fileName: file.name, mimeType: file.type, dataBase64: await fileToBase64(file), resultSummary: summary });
      onDone();
    } catch (err) { setMsg(err.response?.data?.error || 'Upload failed'); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs" />
      <input value={summary} onChange={e => setSummary(e.target.value)} maxLength={500} placeholder="Values (optional), e.g. Hb 10.2, platelets 1.1 lakh" className="flex-1 min-w-[220px] rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
      <button disabled={busy} className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Upload className="w-3.5 h-3.5" />{busy ? 'Reading report…' : 'Upload report'}</button>
      {msg && <span className="text-xs text-red-600">{msg}</span>}
    </form>
  );
}

function Dashboard({ onLogout }) {
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState({ orders: [], counts: {} });
  const [openId, setOpenId] = useState(null);
  const [lastReport, setLastReport] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { const [m, d] = await Promise.all([fetchLabMe(), fetchLabOrders(tab || undefined, q || undefined)]); setMe(m); setData(d); setError(''); }
    catch (err) { if ([401, 403].includes(err.response?.status)) onLogout(); else setError('Could not load lab orders.'); }
  }, [tab, q, onLogout]);
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);

  const tabs = [['', 'To do'], ['Ordered', 'Ordered'], ['Sample collected', 'Sample collected'], ['Completed', 'Completed']];
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center"><FlaskConical className="w-6 h-6" /></div>
            <div><h1 className="text-xl font-black text-gray-800">Laboratory</h1><p className="text-xs text-gray-500">{me?.name}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={onLogout} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50"><LogOut className="w-4 h-4" /> Sign out</button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
        <div className="grid grid-cols-3 gap-3">
          {['Ordered', 'Sample collected', 'Completed'].map(s => (
            <div key={s} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{s}</p>
              <p className="text-2xl font-black text-gray-800">{data.counts[s] ?? 0}</p>
            </div>
          ))}
        </div>
        {lastReport && (
          <div className="bg-white rounded-2xl border border-green-200 p-4 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-bold text-green-700"><CheckCircle2 className="w-4 h-4" /> Report uploaded for {lastReport.patientName} — patient notified</p>
            <div className="mt-2"><LabAnalysis analysis={lastReport.analysis} /></div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map(([k, label]) => <button key={label} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${tab === k ? 'bg-sky-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{label}</button>)}
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2"><Search className="w-4 h-4 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Patient or test" className="py-1.5 text-sm outline-none" /></div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {data.orders.length === 0 && <p className="p-5 text-sm text-gray-400">No lab orders here.</p>}
          {data.orders.map(o => (
            <div key={o._id} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-gray-800">{o.testName} <span className="font-normal text-gray-500">· {o.patientName}{o.patientAge ? `, ${o.patientAge}y` : ''} {o.patientGender || ''}</span></p>
                  <p className="text-xs text-gray-400">{o.department} · {o.doctorName || 'Doctor'} · ordered {new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${o.status === 'Completed' ? 'bg-green-100 text-green-700' : o.status === 'Sample collected' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{o.status}</span>
                  {o.status === 'Ordered' && <button onClick={async () => { await labCollectSample(o._id); load(); }} className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white"><TestTube className="w-3.5 h-3.5" /> Sample collected</button>}
                  {o.status === 'Sample collected' && <button onClick={() => setOpenId(openId === o._id ? null : o._id)} className="flex items-center gap-1 rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-bold text-sky-700"><Upload className="w-3.5 h-3.5" /> Upload report</button>}
                  {o.report && <button onClick={() => openReportFile(o.report._id, 'lab')} className="flex items-center gap-1 text-xs font-bold text-sky-700"><Eye className="w-3.5 h-3.5" /> View</button>}
                </div>
              </div>
              {openId === o._id && <UploadForm order={o} onDone={async () => { setOpenId(null); const d = await fetchLabOrders('Completed', o.patientName); setLastReport(d.orders.find(x => x._id === o._id)?.report ? { ...d.orders.find(x => x._id === o._id).report, patientName: o.patientName } : null); load(); }} />}
              {o.report?.analysis && <div className="mt-2"><LabAnalysis analysis={o.report.analysis} compact /></div>}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function LabPortal() {
  const [authed, setAuthed] = useState(() => Boolean(localStorage.getItem('lab_token')));
  const logout = useCallback(() => { localStorage.removeItem('lab_token'); setAuthed(false); }, []);
  return authed ? <Dashboard onLogout={logout} /> : <LabLogin onLogin={() => setAuthed(true)} />;
}

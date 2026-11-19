import React, { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Database, UserPlus, Stethoscope, BarChart3, FlaskConical, Monitor, Star, AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { fetchCapacity, registerWalkIn, fetchAnalytics, fetchDemoStatus, loadDemoData, clearDemoData, fetchLabStaff, createLabStaff } from '../api';

const DEPARTMENTS = ['General Medicine', 'Pediatrics', 'Orthopedics', 'Cardiology', 'Dermatology', 'Neurology'];
const card = 'bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8';
const input = 'mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal';
const tomorrow = () => { const d = new Date(Date.now() + 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ---------- Demo data + quick links ----------
export function DemoDataPanel({ onChanged }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const refresh = () => fetchDemoStatus().then(setStatus).catch(() => {});
  useEffect(() => { refresh(); }, []);
  const run = async (fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setMsg('');
    try { const r = await fn(); setMsg(r.logins ? `${r.message}: ${r.patients} patients, ${r.appointments} visits, ${r.labReports} lab reports in ${r.seconds}s. Patient login ${r.logins.patient} · Doctor ${r.logins.doctor} · Lab ${r.logins.lab}` : `${r.message}: ${r.appointments} visits and ${r.patients} patients removed.`); onChanged?.(); }
    catch (err) { setMsg(err.response?.data?.error || 'Failed'); }
    setBusy(false); refresh();
  };
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-gray-700 flex items-center gap-2"><Database className="w-5 h-5 text-indigo-500" /> Demo data
          <span className="font-normal text-sm text-gray-400">{status?.loaded ? `${status.patients} demo patients, ${status.appointments} visits loaded` : 'not loaded'}</span></h3>
        <div className="flex flex-wrap gap-2">
          <a href="/display" target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"><Monitor className="w-4 h-4" /> Waiting-hall screen</a>
          <a href="/lab" target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"><FlaskConical className="w-4 h-4" /> Lab portal</a>
          {status?.loaded
            ? <button disabled={busy} onClick={() => run(clearDemoData, 'Remove all demo patients, visits and reports? Real data is not touched.')} className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 className="w-4 h-4" /> Clear demo data</button>
            : <button disabled={busy} onClick={() => run(loadDemoData)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} {busy ? 'Loading (about a minute)…' : 'Load demo data'}</button>}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">Adds 50 patients with families, 30 days of visits with prescriptions, ratings and lab reports, today's queue and a fever surge — so every screen has something to show. Everything is marked as demo and removable.</p>
      {msg && <p className="mt-2 text-sm text-indigo-700">{msg}</p>}
    </div>
  );
}

// ---------- Walk-in desk ----------
export function WalkInDesk({ onRegistered }) {
  const empty = { name: '', phone: '', age: '', gender: 'Male', department: '', symptoms: '', language: 'en' };
  const [f, setF] = useState(empty);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { const r = await registerWalkIn({ ...f, age: Number(f.age) }); setResult({ ...r, name: f.name }); setF(empty); onRegistered?.(); }
    catch (err) { setError(err.response?.data?.error || 'Registration failed'); }
    setBusy(false);
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className={card}>
      <h3 className="font-bold text-gray-700 flex items-center gap-2 mb-3"><UserPlus className="w-5 h-5 text-teal-600" /> Walk-in registration</h3>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-6">
        <label className="text-xs font-semibold text-gray-600 md:col-span-2">Patient name<input required value={f.name} onChange={set('name')} className={input} /></label>
        <label className="text-xs font-semibold text-gray-600">Phone<input required pattern="\d{10}" title="10 digits" value={f.phone} onChange={set('phone')} className={input} /></label>
        <label className="text-xs font-semibold text-gray-600">Age<input required type="number" min="0" max="120" value={f.age} onChange={set('age')} className={input} /></label>
        <label className="text-xs font-semibold text-gray-600">Gender<select value={f.gender} onChange={set('gender')} className={input}><option>Male</option><option>Female</option><option>Other</option></select></label>
        <label className="text-xs font-semibold text-gray-600">SMS language<select value={f.language} onChange={set('language')} className={input}><option value="en">English</option><option value="hi">हिंदी</option></select></label>
        <label className="text-xs font-semibold text-gray-600 md:col-span-4">Complaint (AI suggests the department)<input value={f.symptoms} onChange={set('symptoms')} maxLength={500} placeholder="e.g. bukhar aur khansi 3 din se" className={input} /></label>
        <label className="text-xs font-semibold text-gray-600 md:col-span-2">Department<select value={f.department} onChange={set('department')} className={input}><option value="">Let AI choose</option>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></label>
        <div className="md:col-span-6 flex flex-wrap items-center gap-3">
          <button disabled={busy} className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">{busy ? 'Registering…' : 'Register & give token'}</button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </form>
      {result && (
        <div className={`mt-4 rounded-xl border p-4 ${result.emergency ? 'border-red-300 bg-red-50' : 'border-teal-200 bg-teal-50'}`}>
          {result.emergency && <p className="flex items-center gap-2 font-bold text-red-700"><AlertTriangle className="w-5 h-5" /> AI flagged emergency symptoms — send to the Emergency Ward now.</p>}
          <p className="text-sm text-gray-700"><b>{result.name}</b> → {result.department} · slot {result.timeSlot}</p>
          <p className="text-4xl font-black text-teal-700">Token {result.token}</p>
          {result.triage && <p className="text-xs text-gray-500">AI suggestion: {result.triage.department} ({Math.round(result.triage.confidence * 100)}%), urgency {result.triage.urgency}</p>}
        </div>
      )}
    </div>
  );
}

// ---------- Doctor capacity planning ----------
export function CapacityPanel() {
  const [date, setDate] = useState(tomorrow());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setData(null); fetchCapacity(date).then(setData).catch(err => setError(err.response?.data?.error || 'Capacity plan unavailable')); }, [date]);
  const tone = { Short: 'bg-red-100 text-red-700', OK: 'bg-green-100 text-green-700', Surplus: 'bg-gray-100 text-gray-600' };
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="font-bold text-gray-700 flex items-center gap-2"><Stethoscope className="w-5 h-5 text-purple-500" /> AI doctor capacity plan</h3>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data ? !error && <p className="text-sm text-gray-400">Calculating…</p> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="py-2">Department</th><th>Expected patients</th><th>Min / patient</th><th>Per doctor / day</th><th>Doctors needed</th><th>On duty ({data.weekday})</th><th></th></tr></thead>
              <tbody>
                {data.rows.map(r => (
                  <tr key={r.department} className="border-t border-gray-50">
                    <td className="py-2 font-semibold text-gray-700">{r.department}</td>
                    <td>{r.expectedPatients}{r.forecastPatients !== null && r.bookedPatients > r.forecastPatients ? ' (bookings)' : ''}</td>
                    <td>{r.consultMinutes}</td><td>{r.patientsPerDoctor}</td>
                    <td className="font-bold">{r.doctorsNeeded}</td><td>{r.doctorsAvailable}</td>
                    <td><span className={`px-2 py-0.5 rounded text-xs font-bold ${tone[r.status]}`}>{r.status === 'Short' ? `Short by ${r.gap}` : r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">{data.assumptions.note} Usable time: {data.assumptions.opdHours} OPD hours × {Math.round(data.assumptions.utilisation * 100)}%.</p>
        </>
      )}
    </div>
  );
}

// ---------- Analytics ----------
export function AnalyticsPanel() {
  const [days, setDays] = useState(30);
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { fetchAnalytics(days).then(setA).catch(err => setError(err.response?.data?.error || 'Analytics unavailable')); }, [days]);
  const Stat = ({ label, value, sub }) => (
    <div className="rounded-xl bg-gray-50 border border-gray-100 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-xl font-black text-gray-800">{value ?? '—'}</div>{sub && <div className="text-[11px] text-gray-500">{sub}</div>}</div>
  );
  const short = (d) => d.slice(5);
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="font-bold text-gray-700 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-500" /> Hospital analytics</h3>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {a && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Patients seen" value={a.totals.visits} sub={`${a.totals.walkIns} walk-ins`} />
            <Stat label="Avg wait" value={a.totals.avgWaitMin !== null ? `${a.totals.avgWaitMin} min` : null} sub="check-in → doctor" />
            <Stat label="No-show rate" value={a.totals.noShowRate !== null ? `${a.totals.noShowRate}%` : null} />
            <Stat label="Avg rating" value={a.totals.avgRating !== null ? `${a.totals.avgRating} ★` : null} sub={`${a.totals.ratings} ratings`} />
            <Stat label="Period" value={`${a.days} days`} sub={`${a.from} → ${a.to}`} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Daily footfall</p>
              <div className="h-56"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.daily}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="date" tickFormatter={short} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} width={28} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="online" stackId="a" name="Online booking" fill="#3b82f6" /><Bar dataKey="walkIn" stackId="a" name="Walk-in" fill="#93c5fd" radius={[3, 3, 0, 0]} /></BarChart>
              </ResponsiveContainer></div>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Average wait (minutes)</p>
              <div className="h-56"><ResponsiveContainer width="100%" height="100%">
                <LineChart data={a.daily}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="date" tickFormatter={short} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} width={28} /><Tooltip />
                  <Line type="monotone" dataKey="avgWaitMin" name="Avg wait" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls /></LineChart>
              </ResponsiveContainer></div>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">No-show rate by department (%)</p>
              <div className="h-56"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.byDept} layout="vertical" margin={{ left: 30 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" /><XAxis type="number" tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="department" tick={{ fontSize: 10 }} width={110} /><Tooltip />
                  <Bar dataKey="noShowRate" name="No-show %" fill="#ef4444" radius={[0, 3, 3, 0]} /></BarChart>
              </ResponsiveContainer></div>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">When patients come: actual vs AI forecast (% of the day)</p>
              <div className="h-56"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.hourly}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="slot" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} width={28} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="actualPct" name="Actual" fill="#6366f1" /><Bar dataKey="forecastPct" name="AI forecast" fill="#c7d2fe" /></BarChart>
              </ResponsiveContainer></div>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1"><Star className="w-4 h-4 text-amber-500" /> Ratings by department</p>
              <table className="w-full text-sm"><tbody>{a.byDept.map(d => <tr key={d.department} className="border-t border-gray-50"><td className="py-1 text-gray-600">{d.department}</td><td className="font-bold">{d.avgRating ?? '—'} ★</td><td className="text-xs text-gray-400">{d.ratings}</td></tr>)}</tbody></table>
              {a.doctors.length > 0 && <table className="mt-3 w-full text-sm"><tbody>{a.doctors.map(d => <tr key={d.doctor} className="border-t border-gray-50"><td className="py-1 text-gray-600">{d.doctor}</td><td className="font-bold">{d.avgRating} ★</td><td className="text-xs text-gray-400">{d.ratings}</td></tr>)}</tbody></table>}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Recent patient comments</p>
              {a.comments.length === 0 ? <p className="text-sm text-gray-400">No comments yet.</p> : a.comments.map((c, i) => (
                <p key={i} className="text-sm text-gray-600 border-t border-gray-50 py-1.5"><span className="text-amber-500">{'★'.repeat(c.rating)}</span> {c.comment} <span className="text-xs text-gray-400">· {c.department}, {c.date}</span></p>
              ))}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Complaints by symptom group (AI triage)</p>
              {a.symptomGroups.length === 0 ? <p className="text-sm text-gray-400">No triage data yet.</p> : a.symptomGroups.map(g => (
                <div key={g.group} className="flex items-center gap-2 text-sm py-1"><span className="w-36 text-gray-600">{g.group}</span>
                  <div className="h-2 rounded bg-blue-500" style={{ width: `${Math.max(4, 100 * g.count / a.symptomGroups[0].count)}%`, maxWidth: '50%' }} /><span className="text-xs text-gray-400">{g.count}</span></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Lab staff accounts ----------
export function LabStaffManager() {
  const [staff, setStaff] = useState([]);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [msg, setMsg] = useState('');
  const load = () => fetchLabStaff().then(setStaff).catch(() => {});
  useEffect(() => { load(); }, []);
  const submit = async (e) => {
    e.preventDefault(); setMsg('');
    try { await createLabStaff(f); setF({ name: '', email: '', password: '' }); setMsg('Lab account created'); load(); }
    catch (err) { setMsg(err.response?.data?.error || 'Failed'); }
  };
  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-700 flex items-center gap-2"><FlaskConical className="w-5 h-5 text-sky-600" /> Lab staff ({staff.length})</h3>
        <a href="/lab" target="_blank" rel="noreferrer" className="text-xs font-bold text-sky-700 hover:underline">Open lab portal →</a>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">{staff.map(s => <span key={s._id} className="rounded-lg bg-sky-50 border border-sky-100 px-3 py-1 text-xs text-sky-800">{s.name} · {s.email}</span>)}</div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-gray-600">Name<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={input} /></label>
        <label className="text-xs font-semibold text-gray-600">Email<input required type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className={input} /></label>
        <label className="text-xs font-semibold text-gray-600">Password (min 8)<input required type="password" minLength={8} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} className={input} /></label>
        <button className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">Add lab staff</button>
        {msg && <span className="text-xs text-sky-700">{msg}</span>}
      </form>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { Stethoscope, Plus, Pencil, X } from 'lucide-react';
import { adminFetchDoctors, adminCreateDoctor, adminUpdateDoctor } from '../api';

const DEPARTMENTS = ['Orthopedics', 'Pediatrics', 'Cardiology', 'Dermatology', 'Neurology', 'General Medicine'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EMPTY = { name: '', email: '', password: '', department: DEPARTMENTS[0], qualification: 'MBBS', specialization: '', experienceYears: 0, room: '', opdDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], opdTimings: '08:00 - 17:00', languages: 'Hindi, English', about: '', active: true };

// Staff: add / edit doctors (shown to patients and used for the doctor login)
export default function DoctorManager() {
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState(null); // null = closed; {...} = editing / creating
  const [error, setError] = useState('');
  const load = () => adminFetchDoctors().then(setDoctors).catch(() => setError('Could not load doctors'));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault(); setError('');
    const payload = { ...form, experienceYears: Number(form.experienceYears) || 0, languages: String(form.languages).split(',').map(s => s.trim()).filter(Boolean) };
    if (form._id && !payload.password) delete payload.password;
    try {
      if (form._id) await adminUpdateDoctor(form._id, payload); else await adminCreateDoctor(payload);
      setForm(null); load();
    } catch (err) { setError(err.response?.data?.error || 'Save failed'); }
  };
  const field = (k, label, props = {}) => (
    <label className="text-xs font-semibold text-gray-600">{label}
      <input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal" {...props} /></label>
  );

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-700 flex items-center gap-2"><Stethoscope className="w-5 h-5 text-teal-600" /> Doctors ({doctors.length})</h3>
        <div className="flex items-center gap-3">
          <a href="/doctor" className="text-xs font-bold text-teal-700 hover:underline">Open doctor portal →</a>
          <button onClick={() => setForm({ ...EMPTY })} className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700"><Plus className="w-4 h-4" /> Add doctor</button>
        </div>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {doctors.length === 0 && !form && <p className="text-sm text-gray-400">No doctors yet. Add one, or run <code>npm run seed-doctors</code> in the backend for demo doctors.</p>}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {doctors.map(d => (
          <div key={d._id} className={`rounded-xl border p-4 ${d.active ? 'border-gray-100' : 'border-dashed border-gray-200 opacity-60'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-gray-800">{d.name}</p>
                <p className="text-xs text-teal-700 font-semibold">{d.department}{d.room ? ` · ${d.room}` : ''}</p>
              </div>
              <button onClick={() => setForm({ ...d, password: '', languages: (d.languages || []).join(', ') })} className="text-gray-400 hover:text-teal-700" title="Edit"><Pencil className="w-4 h-4" /></button>
            </div>
            <p className="mt-1 text-xs text-gray-500">{d.qualification} · {d.experienceYears} yrs{d.specialization ? ` · ${d.specialization}` : ''}</p>
            <p className="text-xs text-gray-400">{d.opdDays.join(', ')} · {d.opdTimings} · {d.email}</p>
            {!d.active && <p className="text-xs font-bold text-gray-500 mt-1">Inactive</p>}
          </div>
        ))}
      </div>

      {form && (
        <form onSubmit={save} className="mt-5 rounded-xl border border-teal-100 bg-teal-50/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-bold text-gray-700">{form._id ? `Edit ${form.name}` : 'New doctor'}</p>
            <button type="button" onClick={() => setForm(null)} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {field('name', 'Full name', { required: true, placeholder: 'Dr. …' })}
            {field('email', 'Login email', { type: 'email', required: !form._id, disabled: Boolean(form._id) })}
            {field('password', form._id ? 'New password (optional)' : 'Password (min 8)', { type: 'password', required: !form._id, minLength: 8 })}
            <label className="text-xs font-semibold text-gray-600">Department
              <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal">
                {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
              </select></label>
            {field('qualification', 'Qualification')}
            {field('specialization', 'Specialization')}
            {field('experienceYears', 'Experience (years)', { type: 'number', min: 0, max: 60 })}
            {field('room', 'Room')}
            {field('opdTimings', 'OPD timings')}
            {field('languages', 'Languages (comma separated)')}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-gray-600">OPD days:</span>
            {DAYS.map(day => (
              <label key={day} className="flex items-center gap-1 text-xs text-gray-600">
                <input type="checkbox" checked={form.opdDays.includes(day)} onChange={e => setForm({ ...form, opdDays: e.target.checked ? [...form.opdDays, day] : form.opdDays.filter(x => x !== day) })} />{day}
              </label>
            ))}
            <label className="ml-4 flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active</label>
          </div>
          <label className="block text-xs font-semibold text-gray-600">About
            <textarea rows={2} maxLength={500} value={form.about} onChange={e => setForm({ ...form, about: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal" /></label>
          <button className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700">{form._id ? 'Save changes' : 'Create doctor'}</button>
        </form>
      )}
    </div>
  );
}

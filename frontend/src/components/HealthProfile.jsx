import React, { useEffect, useState } from 'react';
import { HeartPulse, Users, Plus, Pencil, Trash2, X, MessageSquare } from 'lucide-react';
import { fetchMyProfile, updateMyProfile, addFamilyMember, updateFamilyMember, removeFamilyMember } from '../api';

const box = 'w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-teal-500/50';
const joinList = (xs) => (xs || []).join(', ');
const EMPTY_MEMBER = { name: '', relation: '', age: '', gender: 'Female', allergies: '', conditions: '', abhaId: '' };

// Patient: allergies / conditions / ABHA, message language & channel, and family members
export default function HealthProfile({ language }) {
  const hi = language === 'hi';
  const L = (en, h) => (hi ? h : en);
  const [p, setP] = useState(null);
  const [form, setForm] = useState(null);
  const [member, setMember] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const apply = (profile) => {
    setP(profile);
    setForm({ allergies: joinList(profile.healthProfile.allergies), conditions: joinList(profile.healthProfile.conditions),
              bloodGroup: profile.healthProfile.bloodGroup || '', abhaId: profile.healthProfile.abhaId || '',
              notifyChannel: profile.notifyChannel, preferredLanguage: profile.preferredLanguage });
  };
  useEffect(() => { fetchMyProfile().then(apply).catch(() => setError(L('Could not load your profile.', 'प्रोफ़ाइल लोड नहीं हो सकी।'))); }, []);

  const save = async (e) => {
    e.preventDefault(); setMsg(''); setError('');
    try {
      apply(await updateMyProfile({ healthProfile: { allergies: form.allergies, conditions: form.conditions, bloodGroup: form.bloodGroup, abhaId: form.abhaId },
                                    notifyChannel: form.notifyChannel, preferredLanguage: form.preferredLanguage }));
      setMsg(L('Saved', 'सेव हो गया'));
    } catch (err) { setError(err.response?.data?.error || L('Save failed', 'सेव नहीं हो सका')); }
  };
  const saveMember = async (e) => {
    e.preventDefault(); setError('');
    const body = { ...member, age: Number(member.age) };
    try { apply(member._id ? await updateFamilyMember(member._id, body) : await addFamilyMember(body)); setMember(null); }
    catch (err) { setError(err.response?.data?.error || L('Save failed', 'सेव नहीं हो सका')); }
  };

  if (!p || !form) return error ? <p className="text-rose-300 text-sm">{error}</p> : null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={save} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-3">
        <h3 className="font-bold text-white flex items-center gap-2"><HeartPulse className="w-4 h-4 text-rose-400" /> {L('My health profile', 'मेरी स्वास्थ्य जानकारी')}</h3>
        <p className="text-xs text-gray-500">{L('Your doctor sees this. Allergies are checked automatically against every prescription.', 'यह डॉक्टर को दिखता है। हर पर्चे में एलर्जी की जांच अपने आप होती है।')}</p>
        <label className="block text-xs font-semibold text-gray-400">{L('Allergies (comma separated)', 'एलर्जी (कॉमा से अलग करें)')}<input value={form.allergies} onChange={e => setForm({ ...form, allergies: e.target.value })} placeholder="Penicillin, Sulfa" className={box} /></label>
        <label className="block text-xs font-semibold text-gray-400">{L('Long-term conditions', 'पुरानी बीमारियां')}<input value={form.conditions} onChange={e => setForm({ ...form, conditions: e.target.value })} placeholder={L('Diabetes, Asthma', 'डायबिटीज़, अस्थमा')} className={box} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-gray-400">{L('Blood group', 'ब्लड ग्रुप')}<select value={form.bloodGroup} onChange={e => setForm({ ...form, bloodGroup: e.target.value })} className={box}>
            <option value="" className="bg-gray-900">—</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b} className="bg-gray-900">{b}</option>)}</select></label>
          <label className="block text-xs font-semibold text-gray-400">{L('ABHA health ID', 'ABHA हेल्थ आईडी')}<input value={form.abhaId} onChange={e => setForm({ ...form, abhaId: e.target.value })} placeholder="12-3456-7890-1234" className={box} /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-gray-400 flex-1"><span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {L('Messages on', 'संदेश')}</span><select value={form.notifyChannel} onChange={e => setForm({ ...form, notifyChannel: e.target.value })} className={box}>
            <option value="SMS" className="bg-gray-900">SMS</option><option value="WhatsApp" className="bg-gray-900">WhatsApp</option></select></label>
          <label className="block text-xs font-semibold text-gray-400">{L('Message language', 'संदेश की भाषा')}<select value={form.preferredLanguage} onChange={e => setForm({ ...form, preferredLanguage: e.target.value })} className={box}>
            <option value="en" className="bg-gray-900">English</option><option value="hi" className="bg-gray-900">हिंदी</option></select></label>
        </div>
        <p className="text-[11px] text-gray-500">{L('ABHA is stored for your records only; it is not linked to the government system in this demo. Messages are simulated.', 'ABHA सिर्फ रिकॉर्ड के लिए है; इस डेमो में सरकारी सिस्टम से जुड़ा नहीं है। संदेश सिम्युलेटेड हैं।')}</p>
        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700">{L('Save', 'सेव करें')}</button>
          {msg && <span className="text-xs text-emerald-300">{msg}</span>}{error && <span className="text-xs text-rose-300">{error}</span>}
        </div>
      </form>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-blue-400" /> {L('Family members', 'परिवार के सदस्य')}</h3>
          {!member && <button onClick={() => setMember({ ...EMPTY_MEMBER })} className="flex items-center gap-1 rounded-lg border border-blue-500/30 px-3 py-1 text-xs font-bold text-blue-300 hover:bg-blue-500/10"><Plus className="w-3.5 h-3.5" /> {L('Add', 'जोड़ें')}</button>}
        </div>
        <p className="text-xs text-gray-500">{L('Book appointments for your parents and children from this account.', 'इसी खाते से माता-पिता और बच्चों की बुकिंग करें।')}</p>
        {p.familyMembers.length === 0 && !member && <p className="text-sm text-gray-500">{L('No family members added yet.', 'अभी कोई सदस्य नहीं जोड़ा गया।')}</p>}
        {p.familyMembers.map(m => (
          <div key={m._id} className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2">
            <div>
              <p className="text-sm font-bold text-white">{m.name} <span className="font-normal text-gray-400">· {m.relation}, {m.age} {L('yrs', 'वर्ष')}, {m.gender}</span></p>
              {(m.allergies.length > 0 || m.abhaId) && <p className="text-xs text-gray-500">{m.allergies.length ? `${L('Allergies', 'एलर्जी')}: ${m.allergies.join(', ')}` : ''}{m.abhaId ? ` · ABHA ${m.abhaId}` : ''}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setMember({ ...m, allergies: joinList(m.allergies), conditions: joinList(m.conditions) })} className="text-gray-400 hover:text-white" title="Edit"><Pencil className="w-4 h-4" /></button>
              <button onClick={async () => { if (window.confirm(L(`Remove ${m.name}?`, `${m.name} को हटाएं?`))) apply(await removeFamilyMember(m._id)); }} className="text-gray-400 hover:text-rose-400" title="Remove"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        {member && (
          <form onSubmit={saveMember} className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
            <div className="flex justify-between"><p className="text-sm font-bold text-white">{member._id ? L('Edit member', 'सदस्य बदलें') : L('New member', 'नया सदस्य')}</p><button type="button" onClick={() => setMember(null)} className="text-gray-400"><X className="w-4 h-4" /></button></div>
            <div className="grid grid-cols-2 gap-2">
              <input required value={member.name} onChange={e => setMember({ ...member, name: e.target.value })} placeholder={L('Name', 'नाम')} className={box} />
              <input value={member.relation} onChange={e => setMember({ ...member, relation: e.target.value })} placeholder={L('Relation (Mother, Son…)', 'रिश्ता (माँ, बेटा…)')} className={box} />
              <input required type="number" min="0" max="120" value={member.age} onChange={e => setMember({ ...member, age: e.target.value })} placeholder={L('Age', 'आयु')} className={box} />
              <select value={member.gender} onChange={e => setMember({ ...member, gender: e.target.value })} className={box}>
                {['Female', 'Male', 'Other'].map(g => <option key={g} value={g} className="bg-gray-900">{g}</option>)}</select>
              <input value={member.allergies} onChange={e => setMember({ ...member, allergies: e.target.value })} placeholder={L('Allergies', 'एलर्जी')} className={box} />
              <input value={member.abhaId} onChange={e => setMember({ ...member, abhaId: e.target.value })} placeholder="ABHA (optional)" className={box} />
            </div>
            <button className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold text-white">{L('Save member', 'सेव करें')}</button>
          </form>
        )}
      </div>
    </div>
  );
}

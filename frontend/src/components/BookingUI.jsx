import React, { useState, useEffect } from 'react';
import { fetchPredictions, bookAppointment, fetchDoctorStatus, triageSymptoms, fetchDoctors, fetchMyProfile } from '../api';
import { Calendar, Users, Clock, ArrowRight, CheckCircle, AlertTriangle, Coffee, TrendingDown, Sparkles, Mic, MicOff, Stethoscope } from 'lucide-react';
import { translations } from '../translations';
import { tr } from '../i18n';

const getLocalDateString = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const DEPARTMENTS = [
  'Orthopedics', 'Pediatrics', 'Cardiology', 
  'Dermatology', 'Neurology', 'General Medicine'
];

export default function BookingUI({ language, initialDepartment }) {
  const t = translations[language];

  const [date, setDate] = useState(getLocalDateString);
  const [department, setDepartment] = useState(DEPARTMENTS.includes(initialDepartment) ? initialDepartment : DEPARTMENTS[0]);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [error, setError] = useState('');
  const [doctorStatus, setDoctorStatus] = useState({});
  const [symptoms, setSymptoms] = useState('');
  const [family, setFamily] = useState([]);
  const [forMember, setForMember] = useState('');
  useEffect(() => { fetchMyProfile().then(p => setFamily(p.familyMembers || [])).catch(() => {}); }, []);
  const [pain, setPain] = useState(0);
  const [triage, setTriage] = useState(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [doctors, setDoctors] = useState([]);
  useEffect(() => { fetchDoctors(department).then(setDoctors).catch(() => setDoctors([])); }, [department]);

  // Voice input (browser Web Speech API): English or Hindi, following the app language
  const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const [listening, setListening] = useState(false);
  const startVoice = () => {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    rec.interimResults = false;
    rec.onresult = (e) => setSymptoms(prev => `${prev} ${e.results[0][0].transcript}`.trim().slice(0, 500));
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const runTriage = async () => {
    setTriageLoading(true);
    try { setTriage(await triageSymptoms(symptoms, pain)); }
    catch (e) { setTriage(null); setError(tr(e.response?.data?.error || 'AI helper unavailable', language)); }
    setTriageLoading(false);
  };

  useEffect(() => {
    const getSlots = async () => {
      setLoading(true);
      try {
        const data = await fetchPredictions(date, department);
        setPredictions(data.slots || []);
        setSelectedSlot(null);
        setBookingSuccess(false);
        setError('');
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    getSlots();
  }, [date, department]);

  // Load doctor availability
  useEffect(() => {
    const loadDoctorStatus = async () => {
      try {
        const data = await fetchDoctorStatus();
        setDoctorStatus(data);
      } catch (e) { /* silent */ }
    };
    loadDoctorStatus();
    const interval = setInterval(loadDoctorStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  // Find the least crowded slot for peak hour recommendation
  const getBestAlternative = () => {
    if (!selectedSlot || !predictions.length) return null;
    const greenSlots = predictions.filter(s => s.severity_color === 'Green' && s.time_slot !== selectedSlot.time_slot);
    if (greenSlots.length === 0) return null;
    return greenSlots.sort((a, b) => b.remainingSeats - a.remainingSeats)[0];
  };

  const handleBook = async () => {
    if (!selectedSlot) return;
    setError('');
    try {
      await bookAppointment(date, department, selectedSlot.time_slot, symptoms, forMember || null);
      setBookingSuccess(true);
    } catch (err) {
      console.error(err);
      setError(tr(err.response?.data?.error || 'Failed to book appointment', language));
    }
  };

  const getSeverityStyle = (color) => {
    switch (color) {
      case 'Green': return 'bg-emerald-500/10 border-emerald-500 text-emerald-400 hover:bg-emerald-500/20';
      case 'Yellow': return 'bg-amber-500/10 border-amber-500 text-amber-400 hover:bg-amber-500/20';
      case 'Red': return 'bg-rose-500/10 border-rose-500 text-rose-400 opacity-60 cursor-not-allowed';
      default: return 'bg-white/5 border-gray-600 text-gray-400';
    }
  };

  const isSlotInPast = (slotDateStr, timeSlot) => {
    const now = new Date();
    const [yyyy, mm, dd] = slotDateStr.split('-').map(Number);
    const slotD = new Date(yyyy, mm - 1, dd);
    const todayD = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (slotD < todayD) return true;
    if (slotD > todayD) return false;

    const startStr = timeSlot.split(' - ')[0]; // e.g. "08:00"
    const [startHour, startMin] = startStr.split(':').map(Number);
    
    if (startHour < now.getHours()) return true;
    if (startHour === now.getHours() && startMin < now.getMinutes()) return true;
    
    return false;
  };

  const getTranslatedDeptName = (dept) => {
    const key = `dept_${dept.replace(' ', '_')}`;
    return t[key] || dept;
  };

  // AI slot recommendation: urgent patients get the EARLIEST open slot (if not full);
  // routine patients get the LEAST crowded slot.
  const isUrgent = triage?.urgency === 'Urgent' && !triage?.emergency;
  const openSlots = predictions.filter(slot => Number(slot.remainingSeats) > 0 && !isSlotInPast(date, slot.time_slot));
  const recommendedSlot = (isUrgent
    ? openSlots.slice().sort((a, b) => a.time_slot.localeCompare(b.time_slot))[0]
    : openSlots.slice().sort((a, b) => (Number(a.predicted_patients) - Number(b.predicted_patients)) || (Number(b.remainingSeats) - Number(a.remainingSeats)))[0]) || null;

  return (
    <div className="p-8 flex flex-col md:flex-row gap-8">
      {/* Sidebar Controls */}
      <div className="w-full md:w-1/3 space-y-6">
        {family.length > 0 && (
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-400 mb-2">
              <Users className="w-4 h-4" /> {language === 'en' ? 'Booking for' : 'किसके लिए बुकिंग'}
            </label>
            <select value={forMember} onChange={(e) => setForMember(e.target.value)}
              className="w-full p-3.5 rounded-xl border border-white/[0.1] bg-white/[0.04] font-medium text-white outline-none">
              <option value="" className="bg-gray-900">{language === 'en' ? 'Myself' : 'स्वयं'}</option>
              {family.map(m => <option key={m._id} value={m._id} className="bg-gray-900">{m.name} ({m.relation}, {m.age})</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-400 mb-2">
            <Users className="w-4 h-4" /> {t.book_dept}
          </label>
          <select 
            value={department} 
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full p-3.5 rounded-xl border border-white/[0.1] bg-white/[0.04] shadow-sm focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-white outline-none hover:border-white/20"
          >
            {DEPARTMENTS.map(dept => (
              <option key={dept} value={dept} className="bg-gray-900 text-white">{getTranslatedDeptName(dept)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-400 mb-2">
            <Calendar className="w-4 h-4" /> {t.book_date}
          </label>
          <input 
            type="date" 
            value={date} 
            onChange={(e) => setDate(e.target.value)}
            className="w-full p-3.5 rounded-xl border border-white/[0.1] bg-white/[0.04] shadow-sm focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-white outline-none hover:border-white/20 [color-scheme:dark]"
          />
        </div>

        <div className="p-5 bg-gradient-to-br from-purple-500/10 to-pink-500/5 rounded-2xl border border-purple-500/20 space-y-3">
          <h3 className="font-bold text-purple-300 flex items-center gap-2"><Sparkles className="w-4 h-4" /> {t.book_ai_title}</h3>
          <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} maxLength={500} rows={2}
            placeholder={t.book_ai_placeholder}
            className="w-full p-3 rounded-xl border border-white/[0.1] bg-white/[0.04] text-white text-sm outline-none focus:border-purple-500/50" />
          {SpeechRecognition && (
            <button type="button" onClick={startVoice} disabled={listening}
              className="flex items-center gap-2 rounded-lg border border-purple-500/30 px-3 py-1.5 text-xs font-semibold text-purple-200 hover:bg-purple-500/10 disabled:opacity-60">
              {listening ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
              {listening ? (language === 'en' ? 'Listening… speak now' : 'सुन रहे हैं… बोलिए') : (language === 'en' ? 'Speak your symptoms' : 'लक्षण बोलकर बताएं')}
            </button>
          )}
          <label className="block text-xs font-semibold text-gray-400">{t.book_ai_pain}: <span className="text-white">{pain}</span>
            <input type="range" min="0" max="10" value={pain} onChange={(e) => setPain(Number(e.target.value))} className="w-full mt-1" />
          </label>
          <button type="button" onClick={runTriage} disabled={triageLoading || (!symptoms.trim() && pain < 8)}
            className="w-full rounded-lg bg-purple-600 px-3 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-40">
            {triageLoading ? '...' : t.book_ai_btn}
          </button>
          {triage?.emergency && (
            <div className="rounded-xl border border-rose-500 bg-rose-500/20 p-3 text-sm font-bold text-rose-200">
              <AlertTriangle className="inline w-4 h-4 mr-1" /> {t.book_ai_emergency}
            </div>
          )}
          {triage && !triage.emergency && (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-gray-200 space-y-2">
              {triage.urgency === 'Urgent' && <p className="text-amber-300 font-semibold">{t.book_ai_urgent}</p>}
              <p>{t.book_ai_suggest}: <b>{getTranslatedDeptName(triage.department)}</b> ({Math.round(triage.confidence * 100)}% {t.book_ai_confidence})</p>
              {triage.low_confidence && <p className="text-xs text-gray-400">{t.book_ai_lowconf}</p>}
              {triage.alternatives?.length > 0 && (
                <p className="text-xs text-gray-400">{language === 'en' ? 'Other possibilities:' : 'अन्य संभावनाएं:'}{' '}
                  {triage.alternatives.map(a => (
                    <button key={a.department} type="button" onClick={() => setDepartment(a.department)} className="ml-1 underline hover:text-white">
                      {getTranslatedDeptName(a.department)} ({Math.round(a.confidence * 100)}%)
                    </button>
                  ))}
                </p>
              )}
              <button type="button" onClick={() => setDepartment(triage.department)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500">{t.book_ai_use}</button>
            </div>
          )}
          <p className="text-[11px] text-gray-500">{t.book_ai_disclaimer}</p>
        </div>

        {doctors.length > 0 && (
          <div className="p-5 rounded-2xl border border-teal-500/20 bg-teal-500/5 space-y-3">
            <h3 className="font-bold text-teal-300 flex items-center gap-2"><Stethoscope className="w-4 h-4" /> {language === 'en' ? 'Your doctor' : 'आपके डॉक्टर'}</h3>
            {doctors.map(d => {
              const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${date}T00:00:00`).getDay()];
              const available = d.opdDays.includes(dayName);
              return (
                <div key={d._id} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm">
                  <p className="font-bold text-white">{d.name}</p>
                  <p className="text-xs text-gray-400">{d.qualification} · {d.experienceYears} {language === 'en' ? 'yrs experience' : 'वर्ष अनुभव'}{d.room ? ` · ${language === 'en' ? 'Room' : 'कमरा'} ${d.room}` : ''}</p>
                  {d.specialization && <p className="text-xs text-gray-400">{d.specialization}</p>}
                  <p className="text-xs text-gray-500 mt-1">{d.opdDays.join(', ')} · {d.opdTimings} · {d.languages.join(', ')}</p>
                  {!available && <p className="text-xs font-semibold text-amber-300 mt-1">{language === 'en' ? `Not in OPD on ${dayName} — choose another date` : `${dayName} को ओपीडी में नहीं — दूसरी तारीख चुनें`}</p>}
                  {d.onBreak && <p className="text-xs font-semibold text-orange-300 mt-1">{language === 'en' ? 'On a short break right now' : 'अभी छोटे ब्रेक पर हैं'}</p>}
                </div>
              );
            })}
          </div>
        )}

        <div className="p-5 bg-gradient-to-br from-blue-500/10 to-indigo-500/5 rounded-2xl border border-blue-500/10">
          <h3 className="font-bold text-blue-400 flex items-center gap-2 mb-2.5">
            <Clock className="w-4 h-4" /> {t.book_predictor_title}
          </h3>
          <p className="text-sm text-gray-400 leading-relaxed font-medium">
            {t.book_predictor_desc}
          </p>
        </div>
      </div>

      {/* Main Content - Time Slots */}
      <div className="w-full md:w-2/3">
        <h2 className="text-2xl font-black text-white mb-6 pb-4 border-b border-white/[0.06] flex justify-between items-center tracking-tight">
          {t.book_slots_title}
          <span className="text-xs font-bold text-gray-400 px-3 py-1.5 bg-white/[0.04] rounded-full border border-white/[0.08]">
            {date} • {getTranslatedDeptName(department)}
          </span>
        </h2>

        {recommendedSlot && !loading && (
          <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-emerald-300">{isUrgent
                ? (language === 'en' ? 'AI: earliest slot (your symptoms look urgent)' : 'AI: सबसे पहला स्लॉट (आपके लक्षण ज़रूरी लगते हैं)')
                : (language === 'en' ? 'AI-recommended least crowded slot' : 'AI द्वारा सुझाया गया कम भीड़ वाला स्लॉट')}</p>
              <p className="mt-1 text-xs text-gray-400">{recommendedSlot.time_slot} · {recommendedSlot.predicted_patients} {language === 'en' ? 'predicted patients' : 'अनुमानित मरीज़'} · {recommendedSlot.remainingSeats} {language === 'en' ? 'places remaining' : 'जगह बाकी'}</p>
            </div>
            <button type="button" onClick={() => setSelectedSlot(recommendedSlot)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500">{language === 'en' ? 'Choose recommended slot' : 'सुझाया गया स्लॉट चुनें'}</button>
          </div>
        )}

        {/* Doctor On Break Warning */}
        {doctorStatus[department]?.available === false && (
          <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center gap-3 text-[12px]">
            <Coffee className="w-5 h-5 text-orange-400 shrink-0" />
            <div>
              <p className="font-bold text-orange-400">{language === 'en' ? `${department} doctor is currently on break` : `${department} के डॉक्टर अभी ब्रेक पर हैं`}</p>
              <p className="text-gray-500 mt-0.5">{language === 'en' ? 'You can still book, but the queue is paused until the doctor returns.' : 'आप अभी भी बुक कर सकते हैं, लेकिन कतार रुकी हुई है।'}</p>
            </div>
          </div>
        )}

        {/* Peak Hour Warning (Feature 6) */}
        {selectedSlot && selectedSlot.severity_color === 'Yellow' && (() => {
          const alt = getBestAlternative();
          return alt ? (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 text-[12px]">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-amber-400">
                  {language === 'en' ? '⚠️ This slot is historically busy' : '⚠️ यह स्लॉट ऐतिहासिक रूप से व्यस्त है'}
                </p>
                <p className="text-gray-400 mt-0.5">
                  {language === 'en' 
                    ? `Consider ${alt.time_slot} instead — ${alt.remainingSeats} seats available, much less crowded.`
                    : `${alt.time_slot} पर विचार करें — ${alt.remainingSeats} सीटें उपलब्ध, बहुत कम भीड़।`}
                </p>
                <button
                  onClick={() => setSelectedSlot(alt)}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[11px] font-bold hover:bg-emerald-500/20 transition-all"
                >
                  <TrendingDown className="w-3 h-3" />
                  {language === 'en' ? `Switch to ${alt.time_slot}` : `${alt.time_slot} पर बदलें`}
                </button>
              </div>
            </div>
          ) : null;
        })()}
        
        {loading ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {predictions.map((slot, idx) => {
              const inPast = isSlotInPast(date, slot.time_slot);
              const isDisabled = slot.severity_color === 'Red' || inPast;
              
              return (
              <button
                key={idx}
                disabled={isDisabled}
                onClick={() => setSelectedSlot(slot)}
                className={`p-4 rounded-2xl border-l-[6px] text-left transition-all duration-300 ${inPast ? 'bg-white/[0.02] border-gray-700 text-gray-600 opacity-50 cursor-not-allowed hidden md:block' : getSeverityStyle(slot.severity_color)} ${
                  selectedSlot?.time_slot === slot.time_slot && !isDisabled ? 'ring-[3px] ring-offset-2 ring-offset-gray-900 ring-blue-500 shadow-xl shadow-blue-500/10 transform scale-[1.03] z-10 block' : 'hover:-translate-y-1 hover:shadow-lg hover:shadow-black/20'
                }`}
              >
                <div className="font-bold text-lg">{slot.time_slot}</div>
                <div className="text-sm font-medium flex justify-between items-center mt-1">
                  <span className="flex items-center gap-2">
                    {inPast ? (language === 'en' ? 'Expired Slot' : 'समय निकल गया') : tr(slot.severity_label, language)}
                    {selectedSlot?.time_slot === slot.time_slot && <CheckCircle className="w-4 h-4" />}
                  </span>
                  {!inPast && slot.remainingSeats !== undefined && (
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.1]">
                      {slot.remainingSeats} {language === 'en' ? 'Seats' : 'सीटें'}
                    </span>
                  )}
                </div>
                {!inPast && slot.why?.length > 0 && (
                  <div className="mt-1 text-[11px] opacity-70">AI: {slot.why.slice(0, 2).map(w => tr(w, language)).join(' · ')}</div>
                )}
              </button>
            )})}
          </div>
        )}

        {/* Action Area */}
        <div className="mt-8 pt-6 border-t border-white/[0.06]">
          {error && (
            <div className="mb-4 p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-medium">
              {error}
            </div>
          )}
          {bookingSuccess ? (
            <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
              <div>
                <p className="font-bold">{t.book_success_title}</p>
                <p className="text-sm text-emerald-400/70">{t.book_success_desc}</p>
              </div>
            </div>
          ) : (
            <button
              onClick={handleBook}
              disabled={!selectedSlot}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-lg transition-all duration-300 ${
                selectedSlot 
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 transform hover:-translate-y-1 active:scale-[0.98] border border-blue-400/30' 
                  : 'bg-white/[0.03] text-gray-600 cursor-not-allowed border border-white/[0.06]'
              }`}
            >
              {selectedSlot ? `${t.book_btn_confirm} ${selectedSlot.time_slot}` : t.book_btn_select}
              {selectedSlot && <ArrowRight className="w-5 h-5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

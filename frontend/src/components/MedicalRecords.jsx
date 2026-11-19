import React, { useEffect, useState } from 'react';
import { FileText, Pill, FlaskConical, Printer, Download, Eye, CalendarClock, Sun, Sunrise, Moon, AlertCircle, Stethoscope, Star, TestTube } from 'lucide-react';
import { fetchRecords, openReportFile, sendFeedback } from '../api';
import HealthProfile from './HealthProfile';
import LabAnalysis from './LabAnalysis';
import { buildSchedule, isCourseActive, printPrescription, trRx } from '../prescription';
import { translations } from '../translations';

const fmtSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

// Rate a completed visit (1-5 stars + comment); staff see the results in analytics
function FeedbackBox({ rec, L }) {
  const [rating, setRating] = useState(rec.feedback?.rating || 0);
  const [comment, setComment] = useState(rec.feedback?.comment || '');
  const [saved, setSaved] = useState(Boolean(rec.feedback));
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    try { await sendFeedback(rec._id, rating, comment); setSaved(true); } catch (e) { setErr(e.response?.data?.error || 'Failed'); }
  };
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
      <p className="text-xs font-bold text-amber-300">{saved ? L('Thank you for your feedback', 'आपकी प्रतिक्रिया के लिए धन्यवाद') : L('How was your visit?', 'आपकी विज़िट कैसी रही?')}</p>
      <div className="mt-1 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" disabled={saved} onClick={() => setRating(n)} aria-label={`${n} stars`}>
            <Star className={`w-6 h-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-600'}`} />
          </button>
        ))}
      </div>
      {!saved && rating > 0 && (
        <div className="mt-2 flex gap-2">
          <input value={comment} onChange={e => setComment(e.target.value)} maxLength={500} placeholder={L('Comment (optional)', 'टिप्पणी (वैकल्पिक)')}
            className="flex-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-sm text-white outline-none" />
          <button type="button" onClick={submit} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-bold text-black">{L('Send', 'भेजें')}</button>
        </div>
      )}
      {saved && comment && <p className="mt-1 text-xs text-gray-400">“{comment}”</p>}
      {err && <p className="text-xs text-rose-300">{err}</p>}
    </div>
  );
}

export default function MedicalRecords({ language, onBookFollowUp }) {
  const hi = language === 'hi';
  const t = translations[language];
  const L = (en, h) => (hi ? h : en);
  const dept = (d) => t[`dept_${d.replace(' ', '_')}`] || d;
  const slotName = { morning: L('Morning', 'सुबह'), afternoon: L('Afternoon', 'दोपहर'), night: L('Night', 'रात'), sos: L('Only if needed', 'ज़रूरत पड़ने पर') };
  const [records, setRecords] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    fetchRecords().then(r => { setRecords(r); setOpenId(r[0]?._id || null); })
      .catch(() => setError(L('Could not load your records.', 'आपके रिकॉर्ड लोड नहीं हो सके।')));
  }, []);

  const viewReport = (r, download) => openReportFile(r._id, 'patient', download, r.fileName)
    .catch(() => setError(L('Could not open the report.', 'रिपोर्ट नहीं खुल सकी।')));

  if (error) return <div className="p-8 text-rose-300">{error}</div>;
  if (!records) return <div className="p-8 text-gray-400">{L('Loading…', 'लोड हो रहा है…')}</div>;

  // Medicines still running today, across all visits
  const active = records.flatMap(r => (r.prescription?.medicines || []).filter(m => isCourseActive(m, r.date)).map(m => ({ ...m, visit: r })));
  const today = buildSchedule({ medicines: active }, new Date().toISOString().slice(0, 10));

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-300"><FileText className="w-6 h-6" /></div>
        <div>
          <h2 className="text-2xl font-black text-white">{L('Medical Records', 'मेडिकल रिकॉर्ड')}</h2>
          <p className="text-sm text-gray-500">{L('Prescriptions, medicine schedule and lab reports from your completed visits', 'पूरी हुई विज़िट के पर्चे, दवा का समय और लैब रिपोर्ट')}</p>
        </div>
      </div>

      <HealthProfile language={language} />

      {records.length === 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-center text-gray-400">
          {L('No completed visits yet. After your consultation, your prescription and reports will appear here.', 'अभी कोई पूरी विज़िट नहीं। डॉक्टर से मिलने के बाद आपका पर्चा और रिपोर्ट यहाँ दिखेंगी।')}
        </div>
      )}

      {active.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <h3 className="font-bold text-emerald-300 flex items-center gap-2"><Pill className="w-4 h-4" /> {L("Today's medicine schedule", 'आज की दवाइयां')}</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            {[['morning', Sunrise], ['afternoon', Sun], ['night', Moon], ['sos', AlertCircle]].map(([slot, Icon]) => today[slot].length > 0 && (
              <div key={slot} className="rounded-xl bg-black/20 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1"><Icon className="w-3.5 h-3.5" /> {slotName[slot]}</p>
                {today[slot].map((m, i) => (
                  <p key={i} className="mt-1 text-sm text-gray-200">{m.qty && m.qty !== 1 ? `${m.qty} × ` : ''}{m.name} <span className="text-xs text-gray-500">· {trRx(m.timing, language)}</span></p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {records.map(rec => {
        const rx = rec.prescription;
        const open = openId === rec._id;
        const orders = rec.labOrders || [];
        const pendingTests = (rx?.labTests || []).filter(test => !rec.reports.some(r => r.testName === test))
          .map(test => ({ test, status: orders.find(o => o.testName === test)?.status || 'Ordered' }))
          .filter(p => p.status !== 'Cancelled');
        return (
          <div key={rec._id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
            <button onClick={() => setOpenId(open ? null : rec._id)} className="w-full flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-left hover:bg-white/[0.03]">
              <div>
                <p className="font-bold text-white">{dept(rec.department)} · {new Date(`${rec.date}T00:00:00`).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1"><Stethoscope className="w-3 h-3" /> {rec.doctor?.name || L('Doctor', 'डॉक्टर')}{rx?.diagnosis ? ` · ${rx.diagnosis}` : ''}</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {rx?.medicines?.length > 0 && <span className="px-2 py-1 rounded-md bg-teal-500/10 text-teal-300 border border-teal-500/20">{rx.medicines.length} {L('medicines', 'दवाइयां')}</span>}
                {rec.reports.length > 0 && <span className="px-2 py-1 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/20">{rec.reports.length} {L('reports', 'रिपोर्ट')}</span>}
                {pendingTests.length > 0 && <span className="px-2 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">{pendingTests.length} {L('pending', 'बाकी')}</span>}
              </div>
            </button>

            {open && (
              <div className="px-5 pb-5 space-y-4 border-t border-white/[0.06] pt-4">
                {rx?.medicines?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                        <th className="py-2">{L('Medicine', 'दवा')}</th><th>{L('Dose (M-A-N)', 'खुराक (सु-दो-रा)')}</th><th>{L('When', 'कब')}</th><th>{L('Days', 'दिन')}</th>
                      </tr></thead>
                      <tbody className="text-gray-200">
                        {rx.medicines.map((m, i) => (
                          <tr key={i} className="border-t border-white/[0.05]">
                            <td className="py-2"><b>{m.name}</b>{m.notes && <div className="text-xs text-gray-500">{m.notes}</div>}</td>
                            <td className="font-mono">{m.dose}</td><td>{trRx(m.timing, language)}</td><td>{m.days || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-sm text-gray-500">{L('No medicines were prescribed in this visit.', 'इस विज़िट में कोई दवा नहीं लिखी गई।')}</p>}

                {rec.advice && (
                  <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3 text-sm text-emerald-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">{L("Doctor's advice", 'डॉक्टर की सलाह')}</p>
                    <p className="whitespace-pre-line">{rec.advice}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1 mb-2"><FlaskConical className="w-3.5 h-3.5" /> {L('Lab reports', 'लैब रिपोर्ट')}</p>
                  {rec.reports.length === 0 && pendingTests.length === 0 && <p className="text-sm text-gray-500">{L('No tests for this visit.', 'इस विज़िट में कोई जांच नहीं।')}</p>}
                  <div className="space-y-2">
                    {rec.reports.map(r => (
                      <div key={r._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2">
                        <div>
                          <p className="text-sm font-bold text-white">{r.testName}</p>
                          <p className="text-xs text-gray-500">{r.fileName} · {fmtSize(r.size)} · {new Date(r.createdAt).toLocaleDateString(hi ? 'hi-IN' : 'en-IN')}</p>
                          {r.resultSummary && <p className="text-xs text-gray-300 mt-1">{r.resultSummary}</p>}
                          {r.analysis && <div className="mt-2"><LabAnalysis analysis={r.analysis} language={language} theme="dark" /></div>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => viewReport(r, false)} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-gray-200 hover:bg-white/5"><Eye className="w-3.5 h-3.5" /> {L('View', 'देखें')}</button>
                          <button onClick={() => viewReport(r, true)} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-gray-200 hover:bg-white/5"><Download className="w-3.5 h-3.5" /> {L('Download', 'डाउनलोड')}</button>
                        </div>
                      </div>
                    ))}
                    {pendingTests.map(({ test, status }) => (
                      <div key={test} className="flex items-center gap-2 rounded-xl border border-dashed border-amber-500/30 px-3 py-2 text-sm text-amber-200">
                        <TestTube className="w-4 h-4" /> {test} — {status === 'Sample collected'
                          ? L('sample collected, report coming soon', 'सैंपल ले लिया गया, रिपोर्ट जल्द आएगी')
                          : L('please give your sample at the lab', 'कृपया लैब में सैंपल दें')}
                      </div>
                    ))}
                  </div>
                </div>

                <FeedbackBox rec={rec} L={L} />

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button onClick={() => printPrescription(rec, language)} className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700"><Printer className="w-4 h-4" /> {L('Print / save prescription', 'पर्चा प्रिंट / सेव करें')}</button>
                  {rec.followUpDate && (
                    <button onClick={() => onBookFollowUp?.(rec.department)} className="flex items-center gap-2 rounded-xl border border-blue-500/30 px-4 py-2 text-sm font-bold text-blue-300 hover:bg-blue-500/10">
                      <CalendarClock className="w-4 h-4" /> {L(`Follow-up due ${rec.followUpDate} — book`, `${rec.followUpDate} को दोबारा दिखाएं — बुक करें`)}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

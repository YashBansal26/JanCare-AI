import React, { useEffect, useState } from 'react';
import { Sparkles, Download, Siren } from 'lucide-react';
import { fetchAiMetrics, downloadAiExport, fetchAiAlerts } from '../api';

const Stat = ({ label, value, sub }) => (
  <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
    <div className="text-lg font-black text-gray-800">{value ?? '—'}</div>
    {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
  </div>
);
const pct = (v) => (v == null ? null : `${Math.round(v * 100)}%`);

// Staff view of how well each AI model performs (from the ML service evaluation files)
export default function AiPanel() {
  const [m, setM] = useState(null);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState(null);
  useEffect(() => {
    fetchAiMetrics().then(setM).catch(() => setError('AI service unavailable'));
    const load = () => fetchAiAlerts().then(setAlerts).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);
  const c = m?.crowd, t = m?.triage, n = m?.noshow, w = m?.waittime, a = m?.assistant;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="font-bold text-gray-700 flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-500" /> AI Model Performance</h3>
        <div className="flex gap-2">
          {['opd', 'noshow', 'consults'].map(k => (
            <button key={k} onClick={() => downloadAiExport(k).catch(() => setError('Export failed'))}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">
              <Download className="w-3.5 h-3.5" /> Export {{ opd: 'crowd', noshow: 'no-show', consults: 'consult' }[k]} data
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {alerts && (
        <div className={`mb-4 rounded-xl border p-3 ${alerts.alerts.length ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
          <p className="flex items-center gap-2 text-sm font-bold text-gray-700"><Siren className="w-4 h-4 text-red-500" /> AI surge / outbreak watch
            <span className="font-normal text-gray-500">({alerts.seriesChecked} signals checked · {alerts.emergenciesToday} emergency triages today)</span></p>
          {alerts.alerts.length === 0
            ? <p className="text-xs text-green-700 mt-1">No unusual rise in bookings or symptom complaints.</p>
            : alerts.alerts.map((al, i) => (
              <p key={i} className={`text-xs mt-1 ${al.severity === 'High' ? 'text-red-700 font-bold' : 'text-amber-700'}`}>{al.severity}: {al.message}</p>
            ))}
        </div>
      )}
      {m && (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-700">Crowd forecast <span className="font-normal text-gray-400">({c?.model_type})</span></p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Error (MAE)" value={c?.mae} sub={`baseline ${c?.baseline_mae}`} />
              <Stat label="Better than baseline" value={c?.improvement_over_baseline_pct != null ? `${c.improvement_over_baseline_pct}%` : null} sub={`R² ${c?.r2}`} />
            </div>
            <p className="text-[11px] text-gray-500">Top drivers: {c?.feature_importance?.slice(0, 3).map(f => f.feature).join(', ')}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-700">Symptom triage</p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Blind test accuracy" value={pct(t?.accuracy)} sub={`top-3: ${pct(t?.top3_accuracy)}`} />
              <Stat label="Emergency recall" value={pct(t?.safety_layer?.emergency_recall)} sub={`${t?.safety_layer?.cases} safety cases`} />
            </div>
            <p className="text-[11px] text-gray-500">Previous model: {pct(t?.previous_model_accuracy)} on the same test</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-700">No-show risk <span className="font-normal text-gray-400">({n?.model_type})</span></p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="ROC-AUC" value={n?.roc_auc} sub={`baseline ${n?.baseline?.roc_auc}`} />
              <Stat label="High-risk precision" value={pct(n?.high_risk_precision)} sub={`base rate ${pct(n?.no_show_rate)}`} />
            </div>
            <p className="text-[11px] text-gray-500">{n?.fairness_note}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-700">Wait-time</p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Queue error" value={w ? `${w.queue_wait_mae_min} min` : null} sub={`fixed 8-min rule: ${w?.queue_wait_mae_fixed_8min}`} />
              <Stat label="Better" value={w ? `${w.improvement_over_fixed_pct}%` : null} />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-700">Chat assistant</p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Intent accuracy" value={pct(a?.cross_validation_accuracy)} sub="cross-validation" />
              <Stat label="Intents" value={a?.intents?.length} sub="EN / HI / Hinglish" />
            </div>
          </div>
        </div>
      )}
      {m?.live && (
        <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50/50 p-3 text-xs text-gray-600 space-y-1">
          <p><b>Triage model running now:</b> {m.live.triage_model}</p>
          <p><b>Chat model running now:</b> {m.live.assistant_model}</p>
          <p><b>Pretrained deep-learning model:</b> {m.live.deep_learning.startsWith('loaded') ? <span className="text-green-700 font-bold">{m.live.deep_learning}</span> : <span className="text-amber-700">{m.live.deep_learning}</span>}</p>
          {t?.model_comparison && (
            <table className="mt-2 w-full text-left">
              <thead><tr className="text-gray-400"><th className="py-1">Triage model (blind test, {t.test_examples} cases)</th><th>Accuracy</th></tr></thead>
              <tbody>
                {Object.entries(t.model_comparison).map(([k, v]) => (
                  <tr key={k} className={k === 'chosen' ? 'font-bold text-purple-700' : ''}><td className="py-0.5">{k === 'chosen' ? `Chosen: ${v.label}` : v.label}</td><td>{pct(v.test_accuracy)}</td></tr>
                ))}
                <tr className="text-gray-400"><td className="py-0.5">Original JanCare model</td><td>{pct(t.previous_model_accuracy)}</td></tr>
              </tbody>
            </table>
          )}
        </div>
      )}
      <p className="mt-4 text-[11px] text-gray-400">Models are trained on synthetic demo data. Export real JanCare data to ml_service/data/live_*.csv and retrain to improve them.</p>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Maximize } from 'lucide-react';
import { fetchDisplayQueue } from '../api';

const DEPT_HI = { Orthopedics: 'हड्डी रोग', Pediatrics: 'बाल रोग', Cardiology: 'हृदय रोग', Dermatology: 'त्वचा रोग', Neurology: 'न्यूरोलॉजी', 'General Medicine': 'जनरल मेडिसिन' };

// Full-screen waiting-hall board: open /display on a TV. Shows tokens only, never names.
export default function DisplayBoard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sound, setSound] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [flash, setFlash] = useState({});
  const seen = useRef(null);

  const announce = (dept, token, room) => {
    if (!('speechSynthesis' in window)) return;
    const en = new SpeechSynthesisUtterance(`Token number ${token}, ${dept}, please go to room ${room || 'the doctor'}.`);
    en.lang = 'en-IN';
    const hi = new SpeechSynthesisUtterance(`टोकन नंबर ${token}, कृपया कमरा ${room || ''} में जाएं।`);
    hi.lang = 'hi-IN';
    window.speechSynthesis.speak(en);
    window.speechSynthesis.speak(hi);
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await fetchDisplayQueue();
        if (!alive) return;
        // announce tokens that were not in a room at the last refresh
        const now = new Set(d.departments.flatMap(x => x.nowServing.map(s => `${x.department}#${s.token}`)));
        if (seen.current) {
          const fresh = {};
          d.departments.forEach(x => x.nowServing.forEach(s => {
            const key = `${x.department}#${s.token}`;
            if (!seen.current.has(key)) { fresh[x.department] = true; if (sound) announce(x.department, s.token, s.room); }
          }));
          if (Object.keys(fresh).length) { setFlash(fresh); setTimeout(() => setFlash({}), 6000); }
        }
        seen.current = now;
        setData(d); setError('');
      } catch { if (alive) setError('Reconnecting…'); }
    };
    load();
    const a = setInterval(load, 5000), b = setInterval(() => setClock(new Date()), 1000);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, [sound]);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="JanCare" className="h-14 w-auto rounded-xl" />
          <div>
            <h1 className="text-3xl font-black tracking-tight">OPD Queue · ओपीडी कतार</h1>
            <p className="text-slate-400">Please wait for your token · कृपया अपने टोकन की प्रतीक्षा करें</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {error && <span className="text-amber-400 text-sm">{error}</span>}
          <button onClick={() => setSound(s => !s)} className={`flex items-center gap-2 rounded-xl px-4 py-2 font-bold ${sound ? 'bg-emerald-600' : 'bg-slate-800 text-slate-300'}`}>
            {sound ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />} {sound ? 'Announcements on' : 'Turn on announcements'}
          </button>
          <button onClick={() => document.documentElement.requestFullscreen?.()} className="rounded-xl bg-slate-800 p-2 text-slate-300" title="Full screen"><Maximize className="w-5 h-5" /></button>
          <div className="text-right">
            <div className="text-4xl font-black tabular-nums">{clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="text-slate-400 text-sm">{clock.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          </div>
        </div>
      </header>

      {!data ? <div className="flex-1 flex items-center justify-center text-2xl text-slate-500">Loading…</div> : (
        <div className="grid flex-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.departments.map(d => (
            <div key={d.department} className={`rounded-3xl border p-6 flex flex-col transition-colors duration-700 ${flash[d.department] ? 'bg-emerald-900/60 border-emerald-400' : 'bg-slate-900 border-slate-800'}`}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-2xl font-black">{d.department}</h2>
                <span className="text-lg text-slate-400">{DEPT_HI[d.department]}</span>
              </div>
              {d.onBreak && <p className="mt-2 rounded-lg bg-orange-500/20 px-3 py-1 text-orange-300 font-bold">Doctor on a short break · डॉक्टर छोटे ब्रेक पर हैं</p>}
              <div className="mt-4 flex-1">
                <p className="text-sm uppercase tracking-widest text-slate-400">Now serving · अभी</p>
                {d.nowServing.length ? d.nowServing.map(s => (
                  <div key={s.token} className="flex items-end justify-between">
                    <span className="text-7xl font-black text-emerald-400 tabular-nums">{s.token ?? '—'}</span>
                    <span className="text-right">
                      <span className="block text-3xl font-black">{s.room ? `Room ${s.room}` : ''}</span>
                      <span className="block text-slate-400">{s.doctor}</span>
                    </span>
                  </div>
                )) : <p className="text-4xl font-black text-slate-600 mt-2">—</p>}
              </div>
              <div className="mt-4 border-t border-slate-800 pt-3">
                <p className="text-sm uppercase tracking-widest text-slate-400">Next · अगला ({d.waitingCount} waiting)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {d.next.length ? d.next.map(t => <span key={t} className="rounded-xl bg-slate-800 px-4 py-2 text-2xl font-black tabular-nums">{t}</span>) : <span className="text-slate-600 text-xl">No one waiting</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-center text-slate-500 text-sm">Emergency? Go to the Emergency Ward or call 112 / 108 · इमरजेंसी में 112 / 108 पर कॉल करें</p>
    </div>
  );
}

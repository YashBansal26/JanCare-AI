import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Mic } from 'lucide-react';
import { askAssistant } from '../api';

const SUGGESTIONS = {
  en: ['When is my appointment?', 'How long will I wait?', 'Best time to visit?', 'I have fever and cough'],
  hi: ['मेरी अपॉइंटमेंट कब है?', 'कितना इंतजार करना होगा?', 'कब कम भीड़ होती है?', 'मुझे बुखार है'],
};

// Floating AI assistant for patients: understands English, Hindi and Hinglish (typed or spoken)
export default function ChatAssistant({ language }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [messages, setMessages] = useState([]);
  const endRef = useRef(null);
  const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const hi = language === 'hi';

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    setMessages(m => [...m, { from: 'me', text: q }]);
    setBusy(true);
    try {
      const r = await askAssistant(q, language);
      setMessages(m => [...m, { from: 'bot', text: r.reply, emergency: r.intent === 'emergency' || r.reply.startsWith('⚠️') }]);
    } catch {
      setMessages(m => [...m, { from: 'bot', text: hi ? 'सहायक अभी उपलब्ध नहीं है।' : 'Assistant is unavailable right now.' }]);
    }
    setBusy(false);
  };

  const voice = () => {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.lang = hi ? 'hi-IN' : 'en-IN';
    rec.onresult = (e) => send(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Open AI assistant"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 font-bold text-white shadow-2xl hover:scale-105 transition">
        <MessageCircle className="w-5 h-5" /> {hi ? 'AI सहायक' : 'Ask JanCare AI'}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[480px] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-gray-900 shadow-2xl">
      <div className="flex items-center justify-between bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 text-white">
        <span className="font-bold">{hi ? 'JanCare AI सहायक' : 'JanCare AI Assistant'}</span>
        <button onClick={() => setOpen(false)} aria-label="Close"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-gray-400">{hi ? 'नमस्ते! हिंदी, English या Hinglish में पूछें:' : 'Hi! Ask in English, Hindi or Hinglish:'}</p>
            {SUGGESTIONS[hi ? 'hi' : 'en'].map(s => (
              <button key={s} onClick={() => send(s)} className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left text-gray-200 hover:bg-white/5">{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 ${m.from === 'me' ? 'ml-auto bg-blue-600 text-white' : m.emergency ? 'bg-rose-600/30 border border-rose-500 text-rose-100 font-semibold' : 'bg-white/[0.06] text-gray-100'}`}>{m.text}</div>
        ))}
        {busy && <div className="text-xs text-gray-500">{hi ? 'सोच रहा हूँ…' : 'Thinking…'}</div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2 border-t border-white/10 p-2">
        {SpeechRecognition && (
          <button type="button" onClick={voice} disabled={listening} aria-label="Speak" className={`rounded-lg p-2 ${listening ? 'text-rose-400 animate-pulse' : 'text-gray-300 hover:bg-white/5'}`}><Mic className="w-4 h-4" /></button>
        )}
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={500}
          placeholder={hi ? 'अपना सवाल लिखें…' : 'Type your question…'}
          className="flex-1 rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-white outline-none" />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="rounded-lg bg-purple-600 p-2 text-white disabled:opacity-40"><Send className="w-4 h-4" /></button>
      </form>
      <p className="px-3 pb-2 text-[10px] text-gray-500">{hi ? 'AI सहायक निदान नहीं करता। इमरजेंसी में 112 / 108 पर कॉल करें।' : 'The assistant does not diagnose. In an emergency call 112 / 108.'}</p>
    </div>
  );
}

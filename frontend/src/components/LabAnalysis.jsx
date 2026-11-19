import React from 'react';
import { Sparkles } from 'lucide-react';

// AI reading of a lab report: which values were found and which are outside the usual range.
// theme: 'dark' (patient app) | 'light' (doctor / lab / staff)
export default function LabAnalysis({ analysis, language = 'en', theme = 'light', compact = false }) {
  if (!analysis) return null;
  const hi = language === 'hi';
  const dark = theme === 'dark';
  const values = analysis.values || [];
  const shown = compact ? values.filter(v => v.status !== 'normal') : values;
  const methodLabel = { 'pdf-text': 'read from PDF', ocr: 'read with OCR', 'typed-text': 'from typed results', 'ocr-not-installed': 'OCR not installed', 'pdf-no-text': 'scanned PDF - no text' }[analysis.method] || analysis.method;
  const tone = (s) => (s === 'normal'
    ? (dark ? 'text-emerald-300' : 'text-green-700')
    : (dark ? 'text-rose-300' : 'text-red-700'));
  return (
    <div className={`rounded-xl border p-3 text-xs ${dark ? 'border-purple-500/20 bg-purple-500/5 text-gray-200' : 'border-purple-100 bg-purple-50/60 text-gray-700'}`}>
      <p className={`flex items-center gap-1 font-bold ${dark ? 'text-purple-300' : 'text-purple-700'}`}>
        <Sparkles className="w-3.5 h-3.5" /> {hi ? 'AI रिपोर्ट विश्लेषण' : 'AI report reading'}
        <span className={`font-normal ${dark ? 'text-gray-500' : 'text-gray-400'}`}>· {methodLabel}</span>
      </p>
      <p className="mt-1">{hi ? analysis.summary_hi : analysis.summary_en}</p>
      {shown.length > 0 && (
        <table className="mt-2 w-full">
          <tbody>
            {shown.map(v => (
              <tr key={v.key} className={dark ? 'border-t border-white/5' : 'border-t border-purple-100'}>
                <td className="py-1 pr-2 font-semibold">{hi ? v.test_hi || v.test : v.test}</td>
                <td className={`pr-2 font-bold ${tone(v.status)}`}>{v.value.toLocaleString('en-IN')} <span className="font-normal">{v.unit}</span>
                  {v.status !== 'normal' && <span className="ml-1">{v.status === 'low' ? (hi ? '↓ कम' : '↓ low') : (hi ? '↑ ज़्यादा' : '↑ high')}</span>}</td>
                <td className={`pr-2 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{v.low}–{v.high}</td>
                {!compact && <td className={dark ? 'text-gray-400' : 'text-gray-500'}>{v.status === 'normal' ? '' : (hi ? v.explain_hi : v.explain_en)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className={`mt-2 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{hi ? 'केवल पढ़ने में मदद। सीमाएं लैब के अनुसार अलग हो सकती हैं; आपके डॉक्टर रिपोर्ट समझाएंगे।' : analysis.disclaimer}</p>
    </div>
  );
}

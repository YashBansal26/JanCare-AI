import React, { useState } from 'react';
import { adminLogin } from '../api';
import { LogIn, ShieldAlert } from 'lucide-react';

export default function AdminAuthPage({ onAuthSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => {
    if (sessionStorage.getItem('jancare_session_expired')) { sessionStorage.removeItem('jancare_session_expired'); return 'Your session expired. Please sign in again.'; }
    return '';
  });
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (event) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const data = await adminLogin(email, password);
      localStorage.setItem('admin_token', data.token);
      onAuthSuccess();
    } catch (err) { setError(err.response?.data?.error || 'Unable to sign in. Check the backend and credentials.'); }
    finally { setLoading(false); }
  };
  return <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
      <img src="/logo.png" alt="JanCare" className="h-16 w-auto mx-auto rounded-2xl" />
      <h1 className="mt-6 text-3xl font-extrabold text-white flex items-center justify-center gap-2"><ShieldAlert /> Hospital Staff Portal</h1>
      <p className="mt-2 text-sm text-slate-400">Sign in using an account created by the system administrator.</p>
    </div>
    <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md w-full px-4"><div className="bg-slate-800 py-8 px-5 shadow-2xl sm:rounded-2xl border border-slate-700">
      <form className="space-y-5" onSubmit={handleSubmit}>
        {error && <div role="alert" className="p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm">{error}</div>}
        <label className="block text-sm font-medium text-slate-300">Official email<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 block w-full px-3 py-3 border border-slate-600 rounded-xl bg-slate-700 text-white" /></label>
        <label className="block text-sm font-medium text-slate-300">Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 block w-full px-3 py-3 border border-slate-600 rounded-xl bg-slate-700 text-white" /></label>
        <button disabled={loading} type="submit" className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60"><LogIn className="w-5 h-5 mr-2" />{loading ? 'Signing in…' : 'Sign In'}</button>
      </form>
      <p className="mt-6 text-xs text-slate-400">For the demo, create a staff account from the backend terminal. Public staff registration is disabled for security.</p>
      <button onClick={() => { window.location.href = '/'; }} className="mt-5 w-full text-xs text-slate-400 hover:text-white">← Return to Patient Portal</button>
    </div></div>
  </div>;
}

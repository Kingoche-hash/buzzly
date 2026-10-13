import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { forgotRequest, resetRequest } from '../services/auth.service';
import { maskIdentifier } from '../utils/contact';
import { getErrorMessage } from '../utils/getErrorMessage';

const inputClass =
  'w-full rounded-lg bg-slate-700 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500';

// Step 1: ask for a code. Step 2: enter the code and choose a new password.
export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState('ask'); // 'ask' | 'reset'
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAsk = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      await forgotRequest(identifier.trim());
      setNotice('If that account exists, we sent it a code.');
      setStep('reset');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      await resetRequest({ identifier: identifier.trim(), code, newPassword });
      navigate('/login', { replace: true, state: { notice: 'Your password was changed. Log in with the new one.' } });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle={
        step === 'ask'
          ? 'Enter your email or phone number and we will send you a code.'
          : `Enter the code we sent to ${maskIdentifier(identifier.trim())}`
      }
    >
      {step === 'ask' ? (
        <form onSubmit={handleAsk} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="block text-sm mb-1">Email or phone number</label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className={inputClass}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-60"
          >
            {busy ? 'Sending...' : 'Send me a code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          {notice && (
            <p role="status" className="text-sm text-emerald-300">
              {notice} Check your spam folder too.
            </p>
          )}

          <div>
            <label htmlFor="code" className="block text-sm mb-1">Code</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={`${inputClass} text-center text-xl tracking-[0.4em]`}
            />
          </div>

          <div>
            <label htmlFor="new-password" className="block text-sm mb-1">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">At least 8 characters, with a letter and a number.</p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-60"
          >
            {busy ? 'Saving...' : 'Change my password'}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep('ask');
              setCode('');
              setError('');
            }}
            className="w-full text-sm text-slate-300 hover:underline"
          >
            Use a different email or number
          </button>
        </form>
      )}

      <p className="text-sm text-slate-400 mt-6 text-center">
        <Link to="/login" className="text-emerald-400 hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  );
}

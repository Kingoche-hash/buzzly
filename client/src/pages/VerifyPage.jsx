import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../hooks/useAuth';
import { changeContactRequest, resendRequest } from '../services/auth.service';
import { maskIdentifier } from '../utils/contact';
import { getErrorMessage } from '../utils/getErrorMessage';
import { clearPending, getPending, setPending } from '../utils/pendingVerification';

const RESEND_SECONDS = 60;

const inputClass =
  'w-full rounded-lg bg-slate-700 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500';

// The "enter your code" screen shown after signing up (or after logging in to an unconfirmed account).
export default function VerifyPage() {
  const { verify } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [pending, setPendingState] = useState(() => {
    const fromRoute = location.state;
    return fromRoute?.identifier ? { identifier: fromRoute.identifier, channel: fromRoute.channel } : getPending();
  });

  // The 60-second wait before another code can be sent.
  const [seconds, setSeconds] = useState(() =>
    location.state?.autoSend ? 0 : (location.state?.waitSeconds ?? RESEND_SECONDS)
  );

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [changing, setChanging] = useState(false);
  const [newContact, setNewContact] = useState('');
  const [changePassword, setChangePassword] = useState('');

  useEffect(() => {
    if (seconds <= 0) return;

    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  // Arriving from the login page: send a fresh code straight away.
  useEffect(() => {
    if (!location.state?.autoSend || !pending) return;

    resendRequest(pending.identifier)
      .then(() => {
        setSeconds(RESEND_SECONDS);
        setNotice('We sent you a new code.');
      })
      .catch((err) => setError(getErrorMessage(err)));
    // Only once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nobody is waiting for a code (for example the page was opened directly).
  if (!pending) return <Navigate to="/register" replace />;

  const where = pending.channel === 'sms' ? 'phone' : 'email';

  const submit = async (value) => {
    setError('');
    setNotice('');
    setBusy(true);

    try {
      await verify({ identifier: pending.identifier, code: value });
      clearPending();
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const handleCodeChange = (event) => {
    const value = event.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);

    if (value.length === 6 && !busy) submit(value);
  };

  const handleResend = async () => {
    setError('');
    setNotice('');

    try {
      await resendRequest(pending.identifier);
      setSeconds(RESEND_SECONDS);
      setNotice(`A new code is on its way to your ${where}.`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleChange = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);

    try {
      const value = newContact.trim();
      const body = value.includes('@') ? { email: value } : { phone: value };
      const result = await changeContactRequest({ identifier: pending.identifier, password: changePassword, ...body });

      const next = { identifier: result.identifier, channel: result.channel };
      setPending(next);
      setPendingState(next);
      setChanging(false);
      setNewContact('');
      setChangePassword('');
      setCode('');
      setSeconds(RESEND_SECONDS);
      setNotice('Done. We sent a new code to the new address.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Enter your code"
      subtitle={`We sent a 6-digit code to ${maskIdentifier(pending.identifier)}`}
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="code" className="block text-sm mb-1">Confirmation code</label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            placeholder="123456"
            value={code}
            disabled={busy}
            onChange={handleCodeChange}
            className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
          />
        </div>

        {pending.channel === 'email' && (
          <p className="text-xs text-slate-400">Cannot find it? Check your spam or junk folder.</p>
        )}

        {import.meta.env.DEV && (
          <p className="text-xs text-amber-300">
            Testing on your computer? If no email or text provider is set up, the code is printed in the server terminal.
          </p>
        )}

        {notice && (
          <p role="status" className="text-sm text-emerald-300">
            {notice}
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={busy || code.length !== 6}
          onClick={() => submit(code)}
          className="w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? 'Checking...' : 'Confirm'}
        </button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={seconds > 0}
            onClick={handleResend}
            className="text-emerald-400 hover:underline disabled:cursor-not-allowed disabled:text-slate-500 disabled:no-underline"
          >
            {seconds > 0 ? `Send a new code in ${seconds}s` : 'Send me a new code'}
          </button>

          <button type="button" onClick={() => setChanging((open) => !open)} className="text-slate-300 hover:underline">
            {pending.channel === 'sms' ? 'Wrong number?' : 'Wrong email?'}
          </button>
        </div>

        {changing && (
          <form onSubmit={handleChange} className="space-y-3 rounded-lg border border-slate-600 p-3">
            <div>
              <label htmlFor="new-contact" className="block text-sm mb-1">New email or phone number</label>
              <input
                id="new-contact"
                type="text"
                required
                placeholder="you@example.com or +370 600 12345"
                value={newContact}
                onChange={(e) => setNewContact(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="change-password" className="block text-sm mb-1">Your password</label>
              <input
                id="change-password"
                type="password"
                autoComplete="current-password"
                required
                value={changePassword}
                onChange={(e) => setChangePassword(e.target.value)}
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-slate-600 py-2 text-sm font-semibold hover:bg-slate-500 disabled:opacity-60"
            >
              Change and send a new code
            </button>
          </form>
        )}
      </div>

      <p className="text-sm text-slate-400 mt-6 text-center">
        <Link to="/login" onClick={clearPending} className="text-emerald-400 hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  );
}

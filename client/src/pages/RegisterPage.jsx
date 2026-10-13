import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../hooks/useAuth';
import { getAuthConfigRequest } from '../services/auth.service';
import { getErrorMessage } from '../utils/getErrorMessage';
import { setPending } from '../utils/pendingVerification';

const inputClass =
  'w-full rounded-lg bg-slate-700 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500';

const tabClass = (selected) =>
  `flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
    selected ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
  }`;

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [phoneAllowed, setPhoneAllowed] = useState(false);
  const [mode, setMode] = useState('email'); // 'email' | 'phone'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Ask the server whether signing up with a phone number is switched on.
  useEffect(() => {
    let cancelled = false;

    getAuthConfigRequest()
      .then((config) => {
        if (!cancelled) setPhoneAllowed(Boolean(config.phoneSignup));
      })
      .catch(() => {
        // Without an answer, only email sign-up is offered.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const contact = mode === 'email' ? { email: email.trim() } : { phone: phone.trim() };
      const result = await register({ username: username.trim(), password, ...contact });

      setPending({ identifier: result.identifier, channel: result.channel });
      navigate('/verify', {
        state: { identifier: result.identifier, channel: result.channel, waitSeconds: result.waitSeconds },
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Join Buzzly in a few seconds">
      <form onSubmit={handleSubmit} className="space-y-4">
        {phoneAllowed && (
          <div className="flex gap-2" role="tablist" aria-label="How do you want to sign up?">
            <button type="button" role="tab" aria-selected={mode === 'email'} onClick={() => setMode('email')} className={tabClass(mode === 'email')}>
              Email
            </button>
            <button type="button" role="tab" aria-selected={mode === 'phone'} onClick={() => setMode('phone')} className={tabClass(mode === 'phone')}>
              Phone number
            </button>
          </div>
        )}

        <div>
          <label htmlFor="username" className="block text-sm mb-1">Username</label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            required
            minLength={3}
            maxLength={30}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
        </div>

        {mode === 'email' ? (
          <div>
            <label htmlFor="email" className="block text-sm mb-1">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">We will send you a code to confirm it.</p>
          </div>
        ) : (
          <div>
            <label htmlFor="phone" className="block text-sm mb-1">Phone number</label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              required
              placeholder="+370 600 12345"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">Include the country code, starting with +. We will text you a code.</p>
          </div>
        )}

        <div>
          <label htmlFor="password" className="block text-sm mb-1">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          disabled={submitting}
          className="w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-slate-400 mt-6 text-center">
        Already have an account?{' '}
        <Link to="/login" className="text-emerald-400 hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

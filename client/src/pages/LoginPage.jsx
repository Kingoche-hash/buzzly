import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../utils/getErrorMessage';
import { setPending } from '../utils/pendingVerification';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login({ identifier: identifier.trim(), password });
      navigate('/', { replace: true });
    } catch (err) {
      const data = err.response?.data;

      // The password was right, but the account was never confirmed: go to the code screen.
      if (data?.needsVerification) {
        setPending({ identifier: data.identifier, channel: data.channel });
        navigate('/verify', {
          state: { identifier: data.identifier, channel: data.channel, autoSend: true },
        });
        return;
      }

      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to continue to Buzzly">
      {state?.notice && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-200">
          {state.notice}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="identifier" className="block text-sm mb-1">Email or phone number</label>
          <input
            id="identifier"
            type="text"
            autoComplete="username"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full rounded-lg bg-slate-700 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm mb-1">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-slate-700 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="mt-1 text-right text-xs">
            <Link to="/forgot" className="text-emerald-400 hover:underline">
              Forgot password?
            </Link>
          </p>
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
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <p className="text-sm text-slate-400 mt-6 text-center">
        No account yet?{' '}
        <Link to="/register" className="text-emerald-400 hover:underline">
          Register
        </Link>
      </p>
    </AuthLayout>
  );
}

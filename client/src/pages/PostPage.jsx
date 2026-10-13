import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PostCard from '../components/PostCard';
import { fetchPostRequest } from '../services/post.service';

function PostView({ postId }) {
  const navigate = useNavigate();

  const [post, setPost] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | missing | error

  useEffect(() => {
    let cancelled = false;

    fetchPostRequest(postId)
      .then((found) => {
        if (cancelled) return;
        setPost(found);
        setState('ready');
      })
      .catch((err) => {
        if (!cancelled) setState(err.response?.status === 404 ? 'missing' : 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [postId]);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/feed');
  };

  return (
    <div className="h-dvh overflow-y-auto bg-slate-900 text-slate-100">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-700 bg-slate-900/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className="rounded-lg px-2 py-1 hover:bg-slate-700"
        >
          ←
        </button>
        <h1 className="font-semibold">Post</h1>
      </header>

      <main className="mx-auto w-full max-w-xl px-3 py-4">
        {state === 'loading' && <p className="py-16 text-center text-sm text-slate-400">Loading...</p>}

        {state !== 'loading' && state !== 'ready' && (
          <div className="py-16 text-center text-sm text-slate-400">
            <p className="text-4xl" aria-hidden="true">
              📸
            </p>
            <p className="mt-2 font-medium text-slate-200">
              {state === 'missing' ? 'This post is not available any more.' : 'Could not load this post.'}
            </p>
            <button
              type="button"
              onClick={goBack}
              className="mt-4 rounded-lg bg-slate-700 px-4 py-1.5 text-sm font-semibold hover:bg-slate-600"
            >
              Go back
            </button>
          </div>
        )}

        {state === 'ready' && post && (
          <PostCard
            post={post}
            startOpen
            onChange={(id, patch) => setPost((prev) => ({ ...prev, ...patch }))}
            onRemove={goBack}
          />
        )}
      </main>
    </div>
  );
}

// `key` makes the page start fresh whenever it is opened for a different post.
export default function PostPage() {
  const { postId } = useParams();

  return <PostView key={postId} postId={postId} />;
}

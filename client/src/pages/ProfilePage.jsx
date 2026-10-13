import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Avatar from '../components/Avatar';
import PostComposer from '../components/PostComposer';
import { useAuth } from '../hooks/useAuth';
import { usePosts } from '../hooks/usePosts';
import { usePresence } from '../hooks/usePresence';
import { useToast } from '../hooks/useToast';
import { startDirectConversation } from '../services/chat.service';
import { fetchPostSummaryRequest } from '../services/post.service';
import { fetchUserProfile } from '../services/profile.service';
import { getDisplayName } from '../utils/conversation';
import { formatLastSeen } from '../utils/formatLastSeen';
import { getErrorMessage } from '../utils/getErrorMessage';
import { squareThumb } from '../utils/imageUrl';

// These windows download only when someone opens them.
const ProfileDialog = lazy(() => import('../components/ProfileDialog'));
const ThemePicker = lazy(() => import('../components/ThemePicker'));

const buttonClass = 'rounded-lg bg-slate-700 px-4 py-1.5 text-sm font-semibold hover:bg-slate-600';

// One square in the grid. Tapping it opens the post.
function Tile({ post }) {
  const photos = post.images.length;

  return (
    <Link
      to={`/p/${post._id}`}
      aria-label={post.caption ? `Open post: ${post.caption.slice(0, 60)}` : 'Open post'}
      className="relative block aspect-square overflow-hidden bg-slate-800"
    >
      <img
        src={squareThumb(post.imageUrl, 400)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition hover:scale-105"
      />

      {photos > 1 && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white"
        >
          📷 {photos}
        </span>
      )}

      {post.repostedBy && (
        <span aria-hidden="true" className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs">
          🔁
        </span>
      )}
    </Link>
  );
}

// The grid of one person's posts, or of their reposts.
function ProfileGrid({ userId, type, isMe }) {
  const { posts, loading, error, hasMore, loadingMore, moreError, loadMore, reload } = usePosts({
    userId,
    type,
    limit: 12,
  });

  const sentinelRef = useRef(null);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasMore || moreError) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '400px' }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, moreError, loadMore, posts.length]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 6 }, (unused, index) => (
          <div key={index} className="aspect-square animate-pulse bg-slate-800" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="py-10 text-center text-sm text-red-400">
        <p>{error}</p>
        <button type="button" onClick={reload} className={`${buttonClass} mt-3`}>
          Try again
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    const text =
      type === 'reposts'
        ? isMe
          ? 'Posts you repost show up here.'
          : 'No reposts yet.'
        : isMe
          ? 'Share your first photo with ＋ New post.'
          : 'No posts yet.';

    return (
      <div className="py-12 text-center text-sm text-slate-500">
        <p className="text-4xl" aria-hidden="true">
          {type === 'reposts' ? '🔁' : '📸'}
        </p>
        <p className="mt-2">{text}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        {posts.map((post) => (
          <Tile key={post.itemId} post={post} />
        ))}
      </div>

      {hasMore && !moreError && (
        <div ref={sentinelRef} className="py-4 text-center text-sm text-slate-500">
          {loadingMore ? 'Loading...' : ''}
        </div>
      )}

      {moreError && (
        <div className="py-4 text-center text-sm text-red-400">
          <button type="button" onClick={loadMore} className={buttonClass}>
            Could not load more. Try again
          </button>
        </div>
      )}
    </>
  );
}

function ProfileView({ userId }) {
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const { isOnline } = usePresence();
  const { showToast } = useToast();

  const isMe = userId === me._id;

  const [profile, setProfile] = useState(null);
  const [state, setState] = useState(isMe ? 'ready' : 'loading'); // loading | ready | missing | error
  const [summary, setSummary] = useState({ posts: 0, reposts: 0 });
  const [summaryKey, setSummaryKey] = useState(0);
  const [tab, setTab] = useState('posts');
  const [gridKey, setGridKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [composing, setComposing] = useState(false);
  const [messaging, setMessaging] = useState(false);

  // Someone else: load their public profile. (My own comes from my login.)
  useEffect(() => {
    if (isMe) return;

    let cancelled = false;

    fetchUserProfile(userId)
      .then((user) => {
        if (cancelled) return;
        setProfile(user);
        setState('ready');
      })
      .catch((err) => {
        if (!cancelled) setState(err.response?.status === 404 ? 'missing' : 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [userId, isMe]);

  // The numbers: posts and reposts.
  useEffect(() => {
    let cancelled = false;

    fetchPostSummaryRequest(userId)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        // The numbers are a bonus. If they fail to load, the page still works.
      });

    return () => {
      cancelled = true;
    };
  }, [userId, summaryKey]);

  const person = isMe ? me : profile;

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  const handleMessage = async () => {
    setMessaging(true);

    try {
      const conversation = await startDirectConversation(userId);
      navigate('/', { state: { openConversationId: conversation._id } });
    } catch (err) {
      showToast({ title: 'Could not open the chat', text: getErrorMessage(err) });
      setMessaging(false);
    }
  };

  const handlePosted = () => {
    setSummaryKey((key) => key + 1);
    setGridKey((key) => key + 1);
    setTab('posts');
  };

  const header = (title) => (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-700 bg-slate-900/95 px-4 py-3 backdrop-blur">
      <button
        type="button"
        onClick={goBack}
        aria-label="Go back"
        className="rounded-lg px-2 py-1 hover:bg-slate-700"
      >
        ←
      </button>
      <h1 className="truncate font-semibold">{title}</h1>
    </header>
  );

  if (state === 'loading') {
    return (
      <div className="h-dvh bg-slate-900 text-slate-100">
        {header('Profile')}
        <p className="py-16 text-center text-sm text-slate-400">Loading...</p>
      </div>
    );
  }

  if (state !== 'ready' || !person) {
    return (
      <div className="h-dvh bg-slate-900 text-slate-100">
        {header('Profile')}
        <div className="py-16 text-center text-sm text-slate-400">
          <p className="text-4xl" aria-hidden="true">
            👤
          </p>
          <p className="mt-2 font-medium text-slate-200">
            {state === 'missing' ? 'This account does not exist.' : 'Could not load this profile.'}
          </p>
          <button type="button" onClick={goBack} className={`${buttonClass} mt-4`}>
            Go back
          </button>
        </div>
      </div>
    );
  }

  const name = getDisplayName(person);
  const online = isOnline(userId);
  const shownPresence = !isMe && person.showsPresence !== false;

  return (
    <div className="h-dvh overflow-y-auto bg-slate-900 text-slate-100">
      {header(`@${person.username}`)}

      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <section className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-10">
          <Avatar name={name} src={person.avatar} size="xl" online={shownPresence ? online : null} />

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="break-words text-2xl font-semibold">{name}</h2>
            <p className="text-slate-400">@{person.username}</p>

            {person.status && <p className="mt-1 text-sm text-emerald-300">{person.status}</p>}

            {shownPresence && (
              <p className={`mt-1 text-xs ${online ? 'text-green-400' : 'text-slate-400'}`}>
                {online ? 'Online' : formatLastSeen(person.lastSeen)}
              </p>
            )}

            <div className="mt-4 flex justify-center gap-8 sm:justify-start">
              <button type="button" onClick={() => setTab('posts')} className="text-center">
                <span className="block text-lg font-semibold">{summary.posts}</span>
                <span className="text-xs text-slate-400">posts</span>
              </button>
              <button type="button" onClick={() => setTab('reposts')} className="text-center">
                <span className="block text-lg font-semibold">{summary.reposts}</span>
                <span className="text-xs text-slate-400">reposts</span>
              </button>
            </div>

            {person.bio && <p className="mt-4 whitespace-pre-wrap break-words text-sm">{person.bio}</p>}

            {person.createdAt && (
              <p className="mt-2 text-xs text-slate-500">
                Joined{' '}
                {new Date(person.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </p>
            )}

            <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
              {isMe ? (
                <>
                  <button type="button" onClick={() => setEditing(true)} className={buttonClass}>
                    Edit profile
                  </button>
                  <button type="button" onClick={() => setShowTheme(true)} className={buttonClass}>
                    🎨 Appearance
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposing(true)}
                    className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold hover:bg-emerald-500"
                  >
                    ＋ New post
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleMessage}
                  disabled={messaging}
                  className="rounded-lg bg-emerald-600 px-6 py-1.5 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
                >
                  {messaging ? 'Opening...' : '💬 Message'}
                </button>
              )}
            </div>
          </div>
        </section>

        <div role="tablist" className="mt-8 flex border-t border-slate-700">
          {[
            ['posts', '📸 Posts'],
            ['reposts', '🔁 Reposts'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex-1 py-3 text-sm font-medium ${
                tab === key
                  ? 'border-t-2 border-emerald-400 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="pt-1">
          <ProfileGrid key={`${tab}:${gridKey}`} userId={userId} type={tab} isMe={isMe} />
        </div>
      </main>

      <Suspense fallback={null}>
        {editing && <ProfileDialog onClose={() => setEditing(false)} />}
        {showTheme && <ThemePicker onClose={() => setShowTheme(false)} />}
      </Suspense>

      {composing && <PostComposer onClose={() => setComposing(false)} onPosted={handlePosted} />}
    </div>
  );
}

// `key` makes the page start fresh whenever it is opened for a different person.
export default function ProfilePage() {
  const { userId } = useParams();

  return <ProfileView key={userId} userId={userId} />;
}

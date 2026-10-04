import { Fragment, useEffect, useRef, useState, type FormEvent, type CSSProperties } from 'react';
import { Avatar, Modal, Empty, Cover } from './components/primitives';
import { IdeaEditor, ProfileEditor } from './components/Editors';
import { Toaster, toast } from 'sonner';
import {
  Activity,
  AudioLines,
  Bell,
  Bookmark,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Compass,
  Download,
  Eye,
  FileText,
  Filter,
  Headphones,
  Heart,
  HelpCircle,
  LayoutGrid,
  Lock,
  LogOut,
  Menu,
  MessageCircle,
  Mic2,
  Music2,
  NotebookPen,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat2,
  Search,
  ShieldCheck,
  ShoppingBag,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { api, DEMO, ApiError } from './api';
import {
  GENRES,
  MOODS,
  money,
  duration,
  type Analytics,
  type Comment,
  type Idea,
  type Notification,
  type Order,
  type User,
  type View,
} from './types';

const NAV: { view: View; label: string; icon: typeof Compass; section?: string }[] = [
  { view: 'discover', label: 'Discover', icon: Compass },
  { view: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
  { view: 'studio', label: 'My studio', icon: NotebookPen, section: 'YOUR WORKSPACE' },
  { view: 'saved', label: 'Saved ideas', icon: Bookmark },
  { view: 'analytics', label: 'Insights', icon: Activity },
  { view: 'orders', label: 'My licenses', icon: FileText },
];
const VIEWS = new Set([...NAV.map((x) => x.view), 'profile']);
const ago = (date: string) => {
  const days = Math.floor((Date.now() - Date.parse(date)) / 86400000);
  return days < 1 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
};
const number = (n: number) =>
  Intl.NumberFormat('en-US', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n);
export default function App() {
  const [view, setView] = useState<View>(() => {
    const hash = location.hash.slice(1);
    return VIEWS.has(hash) ? (hash as View) : 'discover';
  });
  const [user, setUser] = useState<User | null>(null),
    [ideas, setIdeas] = useState<Idea[]>([]),
    [creators, setCreators] = useState<User[]>([]),
    [notifications, setNotifications] = useState<Notification[]>([]),
    [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [genre, setGenre] = useState('All genres'),
    [mood, setMood] = useState('Any mood'),
    [ideaType, setIdeaType] = useState('All ideas'),
    [sort, setSort] = useState('For you'),
    [filtersOpen, setFiltersOpen] = useState(false),
    [licenseFilter, setLicenseFilter] = useState('all');
  const [mobileNav, setMobileNav] = useState(false),
    [selected, setSelected] = useState<Idea | null>(null),
    [comments, setComments] = useState<Comment[]>([]),
    [commentText, setCommentText] = useState(''),
    [commentLoading, setCommentLoading] = useState(false);
  const [editor, setEditor] = useState<{ idea?: Idea; prompt?: string } | null>(null),
    [checkout, setCheckout] = useState<Idea | null>(null),
    [purchased, setPurchased] = useState<Order | null>(null),
    [agreed, setAgreed] = useState(false),
    [checkoutBusy, setCheckoutBusy] = useState(false),
    [demoPayments, setDemoPayments] = useState(DEMO);
  const [notificationsOpen, setNotificationsOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [profileEdit, setProfileEdit] = useState(false),
    [authOpen, setAuthOpen] = useState(false),
    [authRegister, setAuthRegister] = useState(false),
    [profileTarget, setProfileTarget] = useState<User | null>(null),
    [archiveTarget, setArchiveTarget] = useState<Idea | null>(null),
    [resetOpen, setResetOpen] = useState(false);
  const [studioTab, setStudioTab] = useState('All ideas'),
    [ordersTab, setOrdersTab] = useState('Purchased'),
    [days, setDays] = useState(30),
    [analytics, setAnalytics] = useState<Analytics | null>(null),
    [insightLoading, setInsightLoading] = useState(false);
  const [current, setCurrent] = useState<Idea | null>(null),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [length, setLength] = useState(0),
    [volume, setVolume] = useState(0.7),
    [repeat, setRepeat] = useState(false),
    [shuffle, setShuffle] = useState(false);
  const audio = useRef<HTMLAudioElement>(null),
    searchInput = useRef<HTMLInputElement>(null),
    checkoutKey = useRef(crypto.randomUUID()),
    mounted = useRef(true);
  const webState = useRef({ ideas, user });
  webState.current = { ideas, user };
  const navigate = (next: View) => {
    setView(next);
    location.hash = next;
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const requireUser = () => {
    if (user) return true;
    setAuthOpen(true);
    return false;
  };
  async function reload() {
    const me = await api.me().catch((e) => {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    });
    const [catalog, mine, saved, people, notes, transactions, health] = await Promise.all([
      api.ideas(),
      me ? api.ideas('mine') : [],
      me ? api.ideas('saved') : [],
      api.creators(),
      me ? api.notifications() : [],
      me ? api.orders() : [],
      api.health(),
    ]);
    if (!mounted.current) return;
    setUser(me);
    setIdeas(Array.from(new Map([...catalog, ...mine, ...saved].map((x) => [x.id, x])).values()));
    setCreators(people);
    setNotifications(notes);
    setOrders(transactions);
    setDemoPayments(health.demo_payments);
    setError('');
  }
  useEffect(() => {
    mounted.current = true;
    void reload()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const hash = () => {
      const next = location.hash.slice(1);
      if (VIEWS.has(next)) setView(next as View);
    };
    const keyboard = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener('hashchange', hash);
    window.addEventListener('keydown', keyboard);
    return () => {
      window.removeEventListener('hashchange', hash);
      window.removeEventListener('keydown', keyboard);
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setComments([]);
    setCommentLoading(true);
    void api
      .comments(selected.id)
      .then((result) => {
        if (active) setComments(result);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => {
        if (active) setCommentLoading(false);
      });
    void api.event(selected.id, 'view').catch(() => {});
    return () => {
      active = false;
    };
  }, [selected?.id]);
  useEffect(() => {
    if (view !== 'analytics' || !user) return;
    let active = true;
    setInsightLoading(true);
    void api
      .analytics(days)
      .then((result) => {
        if (active) setAnalytics(result);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => {
        if (active) setInsightLoading(false);
      });
    return () => {
      active = false;
    };
  }, [view, days, user?.id, ideas]);
  useEffect(() => {
    if (!current || !audio.current) return;
    const element = audio.current;
    let active = true;
    let objectUrl = '';
    setTime(0);
    void api
      .preview(current)
      .then((url) => {
        objectUrl = url;
        if (!active) {
          if (url.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        element.src = url;
        return element.play();
      })
      .then(() => {
        if (active) setPlaying(true);
      })
      .catch(() => {
        if (active) {
          setPlaying(false);
          toast.error('The audio could not play. Try again.');
        }
      });
    return () => {
      active = false;
      if (objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
    };
  }, [current?.id, current?.preview_url]);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    if (audio.current) audio.current.loop = repeat;
  }, [repeat]);
  useEffect(() => {
    checkoutKey.current = crypto.randomUUID();
    setAgreed(false);
  }, [checkout?.id]);
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: unknown, options: { signal: AbortSignal }) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    const tools = [
      {
        name: 'search_music_ideas',
        title: 'Search music ideas',
        description: 'Search published ideas in Celaine by title, genre, creator, or mood.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', maxLength: 100 } },
          required: ['query'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: (input: unknown) => {
          if (
            !input ||
            typeof input !== 'object' ||
            typeof (input as { query?: unknown }).query !== 'string'
          )
            throw new Error('query must be a string');
          const q = (input as { query: string }).query;
          if (q.length > 100) throw new Error('query is too long');
          return webState.current.ideas
            .filter(
              (i) =>
                i.status === 'published' &&
                `${i.title} ${i.genre} ${i.mood} ${i.creator.display_name}`
                  .toLowerCase()
                  .includes(q.toLowerCase()),
            )
            .map((i) => ({
              id: i.id,
              title: i.title,
              creator: i.creator.display_name,
              price_cents: i.price_cents,
              currency: i.currency,
            }));
        },
      },
      {
        name: 'start_idea_creation',
        title: 'Start an idea',
        description:
          'Open the new music idea editor. Stages a draft form; it does not save or publish anything.',
        inputSchema: {
          type: 'object',
          properties: { prompt: { type: 'string', maxLength: 500 } },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input: unknown) => {
          if (!input || typeof input !== 'object') throw new Error('Expected an object');
          const prompt = (input as { prompt?: unknown }).prompt;
          if (prompt !== undefined && (typeof prompt !== 'string' || prompt.length > 500))
            throw new Error('prompt must be a string of at most 500 characters');
          if (!webState.current.user) throw new Error('Sign in to start an idea');
          setEditor({ prompt: prompt as string | undefined });
          return { status: 'editor_open', saved: false };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch(
          () => {},
        );
      } catch {}
    }
    return () => controller.abort();
  }, []);
  function startCreate(prompt?: string) {
    if (requireUser()) setEditor({ prompt });
  }
  async function toggleReaction(idea: Idea, kind: 'like' | 'save') {
    if (!requireUser()) return;
    try {
      const updated = await api.react(idea.id, kind, kind === 'like' ? !idea.liked : !idea.saved);
      setIdeas((old) => old.map((x) => (x.id === updated.id ? updated : x)));
      if (selected?.id === updated.id) setSelected(updated);
      toast.success(
        kind === 'save'
          ? updated.saved
            ? 'Added to your saved ideas'
            : 'Removed from saved ideas'
          : updated.liked
            ? 'A little love, delivered'
            : 'Like removed',
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function play(idea: Idea) {
    if (!idea.preview_url) {
      toast('There’s no audio preview yet. Explore the lyrics instead.');
      return;
    }
    if (current?.id === idea.id) {
      if (playing) {
        audio.current?.pause();
        setPlaying(false);
      } else
        void audio.current
          ?.play()
          .then(() => setPlaying(true))
          .catch(() => toast.error('Unable to play this preview.'));
    } else {
      setCurrent(idea);
      void api.event(idea.id, 'play').catch(() => {});
    }
  }
  function step(direction: number) {
    const playable = ideas.filter((x) => x.preview_url && x.status === 'published');
    if (!playable.length) return;
    const index = playable.findIndex((x) => x.id === current?.id);
    const next = shuffle
      ? Math.floor(Math.random() * playable.length)
      : (index + direction + playable.length) % playable.length;
    play(playable[next]);
  }
  async function follow(person: User) {
    if (!requireUser()) return;
    try {
      const following = await api.follow(person.id);
      setCreators((old) =>
        old.map((x) =>
          x.id === person.id
            ? { ...x, following, followers: x.followers + (following ? 1 : -1) }
            : x,
        ),
      );
      if (profileTarget?.id === person.id)
        setProfileTarget({
          ...person,
          following,
          followers: person.followers + (following ? 1 : -1),
        });
      toast.success(following ? `Following ${person.display_name}` : 'Unfollowed creator');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function openProfile(person: User) {
    setProfileTarget(person);
    navigate('profile');
  }
  async function openDetail(idea: Idea) {
    setSelected(idea);
    try {
      const fresh = await api.idea(idea.id);
      setSelected((old) => (old?.id === idea.id ? fresh : old));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function submitComment(e: FormEvent) {
    e.preventDefault();
    if (!selected || !requireUser() || !commentText.trim()) return;
    setCommentLoading(true);
    try {
      const result = await api.comment(selected.id, commentText.trim());
      setComments((old) => [...old, result]);
      setCommentText('');
      toast.success('Feedback posted');
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCommentLoading(false);
    }
  }
  async function purchase() {
    if (!checkout || !requireUser() || !agreed) return;
    setCheckoutBusy(true);
    try {
      let order = await api.checkout(checkout.id, checkoutKey.current);
      if (demoPayments && order.status === 'pending') order = await api.demoPay(order.id);
      await reload();
      setCheckout(null);
      setPurchased(order);
      toast.success(
        order.status === 'paid'
          ? 'License added to your library'
          : 'Order created — payment pending',
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCheckoutBusy(false);
    }
  }
  async function download(order: Order) {
    try {
      const blob = await api.download(order);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `celaine-${order.idea_title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Your license download is ready');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const publicIdeas = ideas.filter((x) => x.status === 'published' || x.status === 'sold');
  const mine = ideas.filter((x) => x.creator.id === user?.id),
    unread = notifications.filter((x) => !x.read).length;
  const filtered = publicIdeas
    .filter(
      (i) =>
        (view !== 'saved' || i.saved) &&
        (view !== 'marketplace' || i.available) &&
        (genre === 'All genres' || i.genre === genre) &&
        (mood === 'Any mood' || i.mood === mood) &&
        (ideaType === 'All ideas' ||
          i.idea_type ===
            (ideaType === 'Song sketches'
              ? 'Song sketch'
              : ideaType === 'Hooks'
                ? 'Hook'
                : 'Lyrics')) &&
        (licenseFilter === 'all' || i.license_type === licenseFilter) &&
        `${i.title} ${i.description} ${i.creator.display_name} ${i.tags.join(' ')} ${i.genre} ${i.mood}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'New releases'
        ? Date.parse(b.created_at) - Date.parse(a.created_at)
        : sort === 'Trending'
          ? b.plays + b.likes * 5 - (a.plays + a.likes * 5)
          : b.saves - a.saves,
    );
  const activeLabel =
    view === 'profile' ? 'Creator profile' : NAV.find((x) => x.view === view)?.label || 'Discover';

  function renderIdeaCard({ idea }: { idea: Idea }) {
    return (
      <article className="idea-card">
        <div className="card-cover-wrapper">
          <button
            className="cover-link"
            onClick={() => void openDetail(idea)}
            aria-label={`View ${idea.title}`}
          >
            <Cover idea={idea} />
          </button>
          <div className="cover-actions">
            <span className="type-badge">{idea.idea_type}</span>
            <button
              className={`icon-button glass ${idea.saved ? 'is-saved' : ''}`}
              aria-label={`${idea.saved ? 'Unsave' : 'Save'} ${idea.title}`}
              aria-pressed={idea.saved}
              onClick={() => void toggleReaction(idea, 'save')}
            >
              <Bookmark size={17} fill={idea.saved ? 'currentColor' : 'none'} />
            </button>
          </div>
          <button
            className={`cover-play ${current?.id === idea.id && playing ? 'playing' : ''}`}
            aria-label={`${current?.id === idea.id && playing ? 'Pause' : 'Play'} ${idea.title}`}
            onClick={() => play(idea)}
          >
            {current?.id === idea.id && playing ? (
              <Pause size={21} fill="currentColor" />
            ) : (
              <Play size={21} fill="currentColor" />
            )}
          </button>
        </div>
        <div className="card-body">
          <div className="card-title-line">
            <button className="text-button card-title" onClick={() => void openDetail(idea)}>
              {idea.title}
            </button>
            <button
              className={`icon-button small ${idea.liked ? 'liked' : ''}`}
              aria-pressed={idea.liked}
              aria-label={`${idea.liked ? 'Unlike' : 'Like'} ${idea.title}`}
              onClick={() => void toggleReaction(idea, 'like')}
            >
              <Heart size={17} fill={idea.liked ? 'currentColor' : 'none'} />
            </button>
          </div>
          <button className="creator-link" onClick={() => openProfile(idea.creator)}>
            <Avatar user={idea.creator} size={22} />
            {idea.creator.display_name}
          </button>
          <div className="card-tags">
            <span>{idea.genre}</span>
            <span>{idea.mood}</span>
          </div>
          <div className="card-footer">
            <span className="audio-meta">
              <AudioLines size={14} />
              {idea.bpm ? `${idea.bpm} BPM` : 'Lyrics only'}
              <span className="meta-dot">·</span>
              {duration(idea.duration_seconds)}
            </span>
            <button
              className="price-button"
              onClick={() => {
                if (requireUser()) setCheckout(idea);
              }}
              disabled={!idea.available}
            >
              {idea.available ? money(idea.price_cents, idea.currency) : 'Licensed'}
            </button>
          </div>
        </div>
      </article>
    );
  }
  function renderCreatorList() {
    return (
      <section className="side-section">
        <div className="section-heading">
          <h2>Writers to know</h2>
          <Users size={17} />
        </div>
        {creators.slice(0, 3).map((person) => (
          <div className="writer-row" key={person.id}>
            <button className="creator-link" onClick={() => openProfile(person)}>
              <Avatar user={person} size={39} />
              <span>
                <strong>{person.display_name}</strong>
                <small>{number(person.followers)} followers</small>
              </span>
            </button>
            <button
              className={`follow-small ${person.following ? 'following' : ''}`}
              aria-label={`${person.following ? 'Unfollow' : 'Follow'} ${person.display_name}`}
              onClick={() => void follow(person)}
            >
              {person.following ? <Check size={15} /> : <Plus size={15} />}
            </button>
          </div>
        ))}
      </section>
    );
  }
  function renderExplore() {
    return (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">
              {view === 'saved'
                ? 'YOUR PERSONAL COLLECTION'
                : view === 'marketplace'
                  ? 'ORIGINAL IDEAS. NEW POSSIBILITIES.'
                  : 'WHERE YOUR NEXT SONG BEGINS'}
            </div>
            <h1>
              {view === 'saved'
                ? 'Keep the inspiration close.'
                : view === 'marketplace'
                  ? 'Find an idea. Make it yours.'
                  : 'Good songs start here'}
              <span className="mint">{view === 'discover' ? '.' : ''}</span>
            </h1>
            <p>
              {view === 'saved'
                ? 'The hooks, words, and melodies you want to come back to.'
                : view === 'marketplace'
                  ? 'Explore music ideas available to license from independent writers.'
                  : 'A hook that stays with you. A lyric that says it better. Find your spark.'}
            </p>
          </div>
          <button className="button secondary desktop-only" onClick={() => startCreate()}>
            <Plus size={17} />
            Create an idea
          </button>
        </div>
        <div className="explore-layout">
          <div className="explore-main">
            <div className="discovery-tabs" role="tablist" aria-label="Sort ideas">
              {['For you', 'Trending', 'New releases'].map((tab) => (
                <button
                  role="tab"
                  aria-selected={sort === tab}
                  className={sort === tab ? 'active' : ''}
                  key={tab}
                  onClick={() => setSort(tab)}
                >
                  {tab === 'Trending' && <Activity size={15} />} {tab}
                </button>
              ))}
              <button
                className={`filter-toggle ${filtersOpen ? 'selected' : ''}`}
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <Filter size={15} />
                <span>Filters</span>
                {(mood !== 'Any mood' || genre !== 'All genres' || licenseFilter !== 'all') && (
                  <span className="filter-dot" />
                )}
              </button>
            </div>
            <div className="type-filters">
              {['All ideas', 'Hooks', 'Lyrics', 'Song sketches'].map((type) => (
                <button
                  key={type}
                  className={ideaType === type ? 'active' : ''}
                  onClick={() => setIdeaType(type)}
                >
                  {type === 'All ideas' ? (
                    <LayoutGrid size={14} />
                  ) : type === 'Lyrics' ? (
                    <FileText size={14} />
                  ) : type === 'Hooks' ? (
                    <Mic2 size={14} />
                  ) : (
                    <Music2 size={14} />
                  )}{' '}
                  {type}
                </button>
              ))}
              <label className="genre-select">
                <span className="sr-only">Genre</span>
                <select value={genre} onChange={(e) => setGenre(e.target.value)}>
                  {GENRES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </label>
            </div>
            {filtersOpen && (
              <div className="expanded-filters">
                <label>
                  Mood
                  <select value={mood} onChange={(e) => setMood(e.target.value)}>
                    {MOODS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  License
                  <select value={licenseFilter} onChange={(e) => setLicenseFilter(e.target.value)}>
                    <option value="all">All licenses</option>
                    <option value="nonexclusive">Nonexclusive</option>
                    <option value="exclusive">Exclusive</option>
                  </select>
                </label>
                <button
                  className="text-button"
                  onClick={() => {
                    setGenre('All genres');
                    setMood('Any mood');
                    setLicenseFilter('all');
                    setIdeaType('All ideas');
                    setQuery('');
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
            <div className="results-heading">
              <h2>
                {query
                  ? `Results for “${query}”`
                  : view === 'saved'
                    ? 'Saved for later'
                    : sort === 'Trending'
                      ? 'Finding their audience'
                      : sort === 'New releases'
                        ? 'Fresh from the notebook'
                        : 'Ideas worth a listen'}
              </h2>
              <span>{filtered.length} ideas</span>
            </div>
            {filtered.length ? (
              <div className="ideas-grid">
                {filtered.map((idea) => (
                  <Fragment key={idea.id}>{renderIdeaCard({ idea })}</Fragment>
                ))}
              </div>
            ) : (
              <Empty
                icon={view === 'saved' ? Bookmark : Search}
                title={view === 'saved' ? 'Your inspiration lives here' : 'No ideas found'}
                description={
                  view === 'saved'
                    ? 'Save an idea with the bookmark icon to build your personal collection.'
                    : 'Try another search or clear a filter to find something new.'
                }
                action={
                  <button
                    className="button secondary"
                    onClick={() => {
                      if (view === 'saved') navigate('discover');
                      else {
                        setGenre('All genres');
                        setMood('Any mood');
                        setIdeaType('All ideas');
                        setLicenseFilter('all');
                        setQuery('');
                      }
                    }}
                  >
                    {view === 'saved' ? 'Explore ideas' : 'Clear filters'}
                  </button>
                }
              />
            )}
            <div className="catalog-note">
              <ShieldCheck size={15} />
              <span>
                Original work, shared by its creators. License terms are shown before checkout.
              </span>
            </div>
          </div>
          <aside className="discovery-sidebar">
            <div className="studio-callout">
              <div className="callout-icon">
                <NotebookPen size={24} />
              </div>
              <span className="eyebrow">YOUR NEXT CHAPTER</span>
              <h2>
                That idea in your head?
                <br />
                <em>Give it a home.</em>
              </h2>
              <p>A line, a voice note, a half-written chorus. It all starts somewhere.</p>
              <button className="button primary" onClick={() => startCreate()}>
                <Plus size={16} />
                Start a new idea
              </button>
              <span className="private-note">
                <Lock size={12} />
                Private until you’re ready
              </span>
            </div>
            {renderCreatorList()}
            <div className="writing-prompt">
              <span className="eyebrow">
                <Sparkles size={15} />A THOUGHT TO START WITH
              </span>
              <p>Write a chorus about a place you haven’t been to, but somehow miss.</p>
              <button
                className="text-button"
                onClick={() =>
                  startCreate('Write a chorus about a place you haven’t been to, but somehow miss.')
                }
              >
                Use this prompt <NotebookPen size={15} />
              </button>
            </div>
            <div className="side-footnote">
              A little inspiration goes a long way.
              <br />
              Keep creating.
            </div>
          </aside>
        </div>
      </>
    );
  }
  function renderStudio() {
    const list = mine.filter(
      (i) =>
        studioTab === 'All ideas' ||
        (studioTab === 'Drafts' && i.status === 'draft') ||
        (studioTab === 'Published' && (i.status === 'published' || i.status === 'sold')) ||
        (studioTab === 'Archived' && i.status === 'archived'),
    );
    return (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">A LITTLE ROOM TO CREATE</div>
            <h1>
              My studio<span className="mint">.</span>
            </h1>
            <p>Your ideas, from the first scribble to the final hook.</p>
          </div>
          <button className="button primary" onClick={() => startCreate()}>
            <Plus size={17} />
            New idea
          </button>
        </div>
        <div className="studio-summary">
          <div>
            <NotebookPen size={20} />
            <strong>{mine.length}</strong>
            <span>Total ideas</span>
          </div>
          <div>
            <Lock size={20} />
            <strong>{mine.filter((x) => x.status === 'draft').length}</strong>
            <span>Private drafts</span>
          </div>
          <div>
            <Compass size={20} />
            <strong>{mine.filter((x) => x.status === 'published').length}</strong>
            <span>Published ideas</span>
          </div>
          <div>
            <Bookmark size={20} />
            <strong>{mine.reduce((s, x) => s + x.saves, 0)}</strong>
            <span>Saves from listeners</span>
          </div>
        </div>
        <div className="discovery-tabs studio-tabs" role="tablist" aria-label="Studio idea status">
          {['All ideas', 'Drafts', 'Published', 'Archived'].map((tab) => (
            <button
              role="tab"
              aria-selected={studioTab === tab}
              key={tab}
              className={studioTab === tab ? 'active' : ''}
              onClick={() => setStudioTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        {list.length ? (
          <div className="studio-list">
            {list.map((idea) => (
              <article className="studio-row" key={idea.id}>
                <button
                  className="studio-idea"
                  onClick={() =>
                    idea.status === 'sold' ? void openDetail(idea) : setEditor({ idea })
                  }
                >
                  <Cover idea={idea} small />
                  <span>
                    <strong>{idea.title}</strong>
                    <small>
                      {idea.idea_type} <span>·</span> {idea.genre} <span>·</span> Edited{' '}
                      {ago(idea.updated_at).toLowerCase()}
                    </small>
                  </span>
                </button>
                <span className={`status-badge status-${idea.status}`}>
                  {idea.status === 'draft' && <Lock size={11} />} {idea.status}
                </span>
                <div className="studio-metrics">
                  <span>
                    <Headphones size={14} />
                    {number(idea.plays)}
                  </span>
                  <span>
                    <Bookmark size={14} />
                    {number(idea.saves)}
                  </span>
                </div>
                <div className="row-actions">
                  <button
                    className="icon-button"
                    aria-label={`View ${idea.title}`}
                    onClick={() => void openDetail(idea)}
                  >
                    <Eye size={17} />
                  </button>
                  {idea.status !== 'sold' && (
                    <button
                      className="icon-button"
                      aria-label={`Edit ${idea.title}`}
                      onClick={() => setEditor({ idea })}
                    >
                      <Pencil size={17} />
                    </button>
                  )}
                  {idea.status !== 'archived' && (
                    <button
                      className="icon-button"
                      aria-label={`Archive ${idea.title}`}
                      onClick={() => setArchiveTarget(idea)}
                    >
                      <X size={17} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={NotebookPen}
            title={
              studioTab === 'All ideas' ? 'Every song starts somewhere' : 'No ideas in this section'
            }
            description="Capture a lyric, a melody, or a voice note. You can keep it private as long as you like."
            action={
              <button className="button primary" onClick={() => startCreate()}>
                <Plus size={16} />
                Create an idea
              </button>
            }
          />
        )}
        <div className="studio-tip">
          <Sparkles size={20} />
          <p>
            <strong>Finished is a direction, not a requirement.</strong>
            <br />
            Your drafts belong to you. Publish when you’re ready to invite the world in.
          </p>
        </div>
      </>
    );
  }
  function renderInsights() {
    const data = analytics;
    const totals = data
      ? [
          { label: 'Idea views', value: number(data.views), icon: Eye },
          { label: 'Audio plays', value: number(data.plays), icon: Headphones },
          { label: 'Current saves', value: number(data.saves), icon: Bookmark },
          { label: 'License revenue', value: money(data.revenue_cents), icon: ShoppingBag },
        ]
      : [];
    const daily = data?.daily || [];
    const max = Math.max(1, ...daily.map((x) => x.views));
    const points = daily
      .map(
        (x, i) =>
          `${40 + (i / Math.max(1, daily.length - 1)) * 700},${190 - (x.views / max) * 150}`,
      )
      .join(' ');
    return (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">THE PEOPLE BEHIND THE PLAYS</div>
            <h1>
              Your ideas, in the world<span className="mint">.</span>
            </h1>
            <p>See what people are listening to, loving, and coming back for.</p>
          </div>
          <label className="period-select">
            <span className="sr-only">Reporting period</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <ChevronDown size={16} />
          </label>
        </div>
        {insightLoading && !data ? (
          <div className="loading-state">Gathering your insights…</div>
        ) : (
          <>
            <div className="insight-cards">
              {totals.map(({ label, value, icon: Icon }) => (
                <div className="insight-card" key={label}>
                  <div>
                    <span>{label}</span>
                    <Icon size={18} />
                  </div>
                  <strong>{value}</strong>
                  <small>
                    {label === 'Current saves'
                      ? 'Current total across your ideas'
                      : `In the last ${days} days`}
                  </small>
                </div>
              ))}
            </div>
            <section className="analytics-chart panel">
              <div className="section-heading">
                <div>
                  <h2>Audience activity</h2>
                  <p className="muted">Views across your music ideas</p>
                </div>
                <span className="chart-legend">
                  <span />
                  Idea views
                </span>
              </div>
              <div className="chart-wrap">
                <svg
                  viewBox="0 0 780 225"
                  role="img"
                  aria-label={`Daily idea views for the last ${days} days`}
                >
                  <defs>
                    <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ade9cc" stopOpacity=".24" />
                      <stop offset="100%" stopColor="#ade9cc" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[40, 90, 140, 190].map((y, i) => (
                    <g key={y}>
                      <line x1="40" y1={y} x2="740" y2={y} stroke="#2c3b32" strokeDasharray="4 6" />
                      <text x="8" y={y + 4} fill="#83968b" fontSize="12">
                        {Math.round(max * (1 - i / 3))}
                      </text>
                    </g>
                  ))}
                  {data?.views ? (
                    <>
                      <polygon points={`40,190 ${points} 740,190`} fill="url(#chart-fill)" />
                      <polyline points={points} fill="none" stroke="#ade9cc" strokeWidth="2.5" />
                    </>
                  ) : null}
                  <text x="40" y="218" fill="#83968b" fontSize="12">
                    {daily[0]?.date}
                  </text>
                  <text x="666" y="218" fill="#83968b" fontSize="12">
                    {daily.at(-1)?.date}
                  </text>
                </svg>
                {!data?.views && (
                  <div className="chart-empty">
                    <Headphones size={25} />
                    <strong>Your story is just getting started.</strong>
                    <span>Publish an idea and invite someone to listen.</span>
                    <button className="button secondary" onClick={() => navigate('studio')}>
                      Open my studio
                    </button>
                  </div>
                )}
              </div>
            </section>
            <section className="panel ideas-performance">
              <div className="section-heading">
                <h2>Your ideas at a glance</h2>
                <span>{data?.ideas.length || 0} ideas</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Idea</th>
                      <th>Views</th>
                      <th>Plays</th>
                      <th>Likes</th>
                      <th>Saves</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.ideas.map((i) => (
                      <tr key={i.id}>
                        <td>{i.title}</td>
                        <td>{i.views}</td>
                        <td>{i.plays}</td>
                        <td>{i.likes}</td>
                        <td>{i.saves}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <p className="analytics-note">
              Views and plays count one interaction per listener, per idea, each day. Saves and
              likes show current totals.
            </p>
          </>
        )}
      </>
    );
  }
  function renderLicenses() {
    const list = orders.filter((o) =>
      ordersTab === 'Purchased' ? o.buyer_id === user?.id : o.seller_id === user?.id,
    );
    return (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">YOUR MUSIC, YOUR AGREEMENTS</div>
            <h1>
              My licenses<span className="mint">.</span>
            </h1>
            <p>Keep your purchased ideas and sales together.</p>
          </div>
        </div>
        <div className="discovery-tabs" role="tablist" aria-label="License direction">
          {['Purchased', 'Sold'].map((tab) => (
            <button
              role="tab"
              aria-selected={ordersTab === tab}
              key={tab}
              className={ordersTab === tab ? 'active' : ''}
              onClick={() => setOrdersTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        {list.length ? (
          <div className="license-list">
            {list.map((order) => (
              <article className="license-row panel" key={order.id}>
                <div className="license-icon">
                  <FileText size={25} />
                </div>
                <div className="license-main">
                  <h3>{order.idea_title}</h3>
                  <p>
                    {order.license_type === 'exclusive'
                      ? 'Exclusive license'
                      : 'Nonexclusive license'}{' '}
                    · {new Date(order.created_at).toLocaleDateString()}
                  </p>
                  <small>Order {order.id.slice(0, 8).toUpperCase()}</small>
                </div>
                <div className="license-price">
                  <strong>{money(order.amount_cents, order.currency)}</strong>
                  <span
                    className={`status-badge ${order.status === 'paid' ? 'status-published' : 'status-draft'}`}
                  >
                    {order.status}
                  </span>
                </div>
                {order.status === 'paid' && ordersTab === 'Purchased' ? (
                  <button className="button secondary" onClick={() => void download(order)}>
                    <Download size={16} />
                    Download
                  </button>
                ) : order.status === 'pending' && ordersTab === 'Purchased' ? (
                  <button
                    className="button secondary"
                    onClick={() => {
                      void api
                        .cancelOrder(order.id)
                        .then(reload)
                        .then(() => toast('Order cancelled'))
                        .catch((e) => toast.error(e.message));
                    }}
                  >
                    Cancel order
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={FileText}
            title={
              ordersTab === 'Purchased'
                ? 'Your next song is waiting'
                : 'Your first license starts with an idea'
            }
            description={
              ordersTab === 'Purchased'
                ? 'Find an idea you connect with, review its license, and add it to your creative library.'
                : 'Publish an idea with a price and license. Your completed sales will appear here.'
            }
            action={
              <button
                className="button primary"
                onClick={() => navigate(ordersTab === 'Purchased' ? 'marketplace' : 'studio')}
              >
                {ordersTab === 'Purchased' ? 'Explore the marketplace' : 'Open my studio'}
              </button>
            }
          />
        )}
      </>
    );
  }
  function renderProfile() {
    const person = profileTarget || user;
    if (!person)
      return (
        <Empty
          icon={Users}
          title="Your creative identity"
          description="Sign in to build your songwriter profile."
          action={
            <button className="button primary" onClick={() => setAuthOpen(true)}>
              Sign in
            </button>
          }
        />
      );
    const self = person.id === user?.id;
    const published = publicIdeas.filter((x) => x.creator.id === person.id);
    return (
      <>
        <div className="profile-header panel">
          <Avatar user={self ? user! : person} size={90} />
          <div className="profile-copy">
            <div className="eyebrow">SONGWRITER</div>
            <h1>{self ? user!.display_name : person.display_name}</h1>
            <p>
              @{person.username} <span>·</span> {self ? user!.location : person.location}
            </p>
            <p className="profile-bio">{self ? user!.bio : person.bio}</p>
            <div className="profile-counts">
              <span>
                <strong>{number(person.followers)}</strong> followers
              </span>
              <span>
                <strong>{published.length}</strong> published ideas
              </span>
            </div>
          </div>
          <button
            className={`button ${self ? 'secondary' : 'primary'}`}
            onClick={() => (self ? setProfileEdit(true) : void follow(person))}
          >
            {self ? (
              <>
                <Pencil size={16} />
                Edit profile
              </>
            ) : person.following ? (
              <>
                <Check size={16} />
                Following
              </>
            ) : (
              <>
                <Plus size={16} />
                Follow writer
              </>
            )}
          </button>
        </div>
        <div className="results-heading">
          <h2>{self ? 'Your published ideas' : `Ideas by ${person.display_name.split(' ')[0]}`}</h2>
          <span>{published.length} ideas</span>
        </div>
        {published.length ? (
          <div className="ideas-grid profile-grid">
            {published.map((idea) => (
              <Fragment key={idea.id}>{renderIdeaCard({ idea })}</Fragment>
            ))}
          </div>
        ) : (
          <Empty
            title="A new voice, just getting started"
            description={
              self
                ? 'Your published ideas will appear here. Keep writing, and share when you’re ready.'
                : 'This writer hasn’t published any ideas yet.'
            }
            action={
              self ? (
                <button className="button primary" onClick={() => startCreate()}>
                  <Plus size={16} />
                  Create an idea
                </button>
              ) : undefined
            }
          />
        )}
      </>
    );
  }

  return (
    <div className="app-shell">
      <Toaster richColors theme="dark" position="top-center" />
      <audio
        ref={audio}
        onTimeUpdate={() => setTime(audio.current?.currentTime || 0)}
        onLoadedMetadata={() => setLength(audio.current?.duration || 0)}
        onEnded={() => setPlaying(false)}
        preload="metadata"
      />
      {mobileNav && <div className="sidebar-scrim" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
        <button className="brand" aria-label="Celaine home" onClick={() => navigate('discover')}>
          <AudioLines size={28} />
          celaine<span>.</span>
        </button>
        <div className="workspace-label">THE SONGWRITER’S WORKSPACE</div>
        <nav aria-label="Main navigation">
          {NAV.map(({ view: next, label, icon: Icon, section }) => (
            <div key={next}>
              {section && <div className="nav-section-label">{section}</div>}
              <button
                className={`nav-item ${view === next ? 'active' : ''}`}
                aria-current={view === next ? 'page' : undefined}
                onClick={() => {
                  if (['studio', 'analytics', 'orders', 'saved'].includes(next) && !requireUser())
                    return;
                  navigate(next);
                }}
              >
                <Icon size={19} />
                <span>{label}</span>
                {next === 'studio' && mine.length > 0 && (
                  <span className="nav-count">{mine.length}</span>
                )}
              </button>
            </div>
          ))}
        </nav>
        <button className="button primary sidebar-create" onClick={() => startCreate()}>
          <Plus size={17} />
          Create an idea
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={18} />
            <p>
              A small idea can become
              <br />
              <strong>someone’s favorite song.</strong>
            </p>
          </div>
          <button className="help-button" onClick={() => setHelpOpen(true)}>
            <HelpCircle size={17} />
            Help & getting started
          </button>
          {user ? (
            <button
              className="sidebar-user"
              onClick={() => {
                setProfileTarget(null);
                navigate('profile');
              }}
            >
              <Avatar user={user} size={36} />
              <span>
                <strong>{user.display_name}</strong>
                <small>{DEMO ? 'Demo workspace' : 'Songwriter'}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ) : (
            <button className="button secondary" onClick={() => setAuthOpen(true)}>
              Sign in to your workspace
            </button>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={21} />
          </button>
          <span className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>{activeLabel}</strong>
          </span>
          <div className="global-search">
            <Search size={17} />
            <input
              ref={searchInput}
              type="search"
              aria-label="Search ideas, moods, or creators"
              placeholder="Search ideas, moods, creators…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!['discover', 'marketplace', 'saved'].includes(view)) navigate('discover');
              }}
            />
            <kbd>/</kbd>
          </div>
          {DEMO && (
            <button className="demo-badge" onClick={() => setHelpOpen(true)}>
              Demo
            </button>
          )}
          <button
            className="icon-button notification-button"
            aria-label={`Notifications, ${unread} unread`}
            onClick={() => {
              if (requireUser()) setNotificationsOpen(true);
            }}
          >
            <Bell size={20} />
            {unread > 0 && <span className="unread-dot" />}
          </button>
          <button
            className="topbar-avatar"
            aria-label={user ? 'Open your profile' : 'Sign in'}
            onClick={() => {
              if (user) {
                setProfileTarget(null);
                navigate('profile');
              } else setAuthOpen(true);
            }}
          >
            {user ? <Avatar user={user} size={34} /> : <Users size={20} />}
          </button>
        </header>
        <main className="page">
          {loading ? (
            <div className="loading-state">
              <AudioLines size={30} />
              <p>Finding a little inspiration…</p>
            </div>
          ) : error ? (
            <Empty
              icon={Activity}
              title="We couldn’t load your workspace"
              description={error}
              action={
                <button
                  className="button primary"
                  onClick={() => {
                    setLoading(true);
                    void reload()
                      .catch((e) => setError(e.message))
                      .finally(() => setLoading(false));
                  }}
                >
                  Try again
                </button>
              }
            />
          ) : view === 'studio' ? (
            renderStudio()
          ) : view === 'analytics' ? (
            renderInsights()
          ) : view === 'orders' ? (
            renderLicenses()
          ) : view === 'profile' ? (
            renderProfile()
          ) : (
            renderExplore()
          )}
        </main>
        <footer className="page-footer">
          <span>© {new Date().getFullYear()} Celaine</span>
          <span>
            {DEMO
              ? 'Demo workspace · changes saved on this device'
              : 'A little room for the next big idea.'}
          </span>
        </footer>
      </div>
      <div className="audio-player">
        <div className="now-playing">
          {current ? (
            <>
              <Cover idea={current} small />
              <div>
                <button className="text-button" onClick={() => void openDetail(current)}>
                  {current.title}
                </button>
                <span>
                  {current.creator.display_name} <span className="preview-label">· Preview</span>
                </span>
              </div>
              <button
                className={`icon-button small player-like ${ideas.find((x) => x.id === current.id)?.liked ? 'liked' : ''}`}
                aria-label="Like current idea"
                onClick={() =>
                  void toggleReaction(ideas.find((x) => x.id === current.id) || current, 'like')
                }
              >
                <Heart size={17} />
              </button>
            </>
          ) : (
            <>
              <div className="idle-audio">
                <AudioLines size={25} />
              </div>
              <div>
                <strong>Find something that stays.</strong>
                <span>Pick an idea and press play.</span>
              </div>
            </>
          )}
        </div>
        <div className="player-center">
          <div className="player-controls">
            <button
              className={`icon-button small ${shuffle ? 'mint' : ''}`}
              aria-label="Shuffle previews"
              aria-pressed={shuffle}
              onClick={() => setShuffle(!shuffle)}
            >
              <Shuffle size={16} />
            </button>
            <button
              className="icon-button small"
              aria-label="Previous preview"
              onClick={() => {
                if (audio.current && time > 3) audio.current.currentTime = 0;
                else step(-1);
              }}
            >
              <SkipBack size={17} fill="currentColor" />
            </button>
            <button
              className="main-play"
              aria-label={playing ? 'Pause playback' : 'Start playback'}
              onClick={() => {
                if (current) play(current);
                else step(1);
              }}
            >
              {playing ? (
                <Pause size={17} fill="currentColor" />
              ) : (
                <Play size={17} fill="currentColor" />
              )}
            </button>
            <button className="icon-button small" aria-label="Next preview" onClick={() => step(1)}>
              <SkipForward size={17} fill="currentColor" />
            </button>
            <button
              className={`icon-button small ${repeat ? 'mint' : ''}`}
              aria-label="Repeat preview"
              aria-pressed={repeat}
              onClick={() => setRepeat(!repeat)}
            >
              <Repeat2 size={16} />
            </button>
          </div>
          <div className="player-progress">
            <span>{duration(time)}</span>
            <input
              aria-label="Audio playback position"
              type="range"
              min={0}
              max={length || 1}
              step=".1"
              value={Math.min(time, length || 1)}
              disabled={!current}
              style={{ '--progress': `${length ? (time / length) * 100 : 0}%` } as CSSProperties}
              onChange={(e) => {
                if (audio.current) {
                  audio.current.currentTime = Number(e.target.value);
                  setTime(Number(e.target.value));
                }
              }}
            />
            <span>{duration(length || current?.duration_seconds || 0)}</span>
          </div>
        </div>
        <div className="player-volume">
          <Headphones size={16} />
          <span className="player-preview-text">Original idea preview</span>
          <button
            className="icon-button small"
            aria-label={volume ? 'Mute audio' : 'Unmute audio'}
            onClick={() => setVolume(volume ? 0 : 0.7)}
          >
            {volume ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <input
            aria-label="Audio volume"
            type="range"
            min="0"
            max="1"
            step=".01"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </div>
      </div>
      <Modal
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setCommentText('');
        }}
        title={selected?.title || 'Music idea'}
        wide
      >
        {selected && (
          <div className="detail-layout">
            <aside className="detail-aside">
              <div className="detail-cover">
                <Cover idea={selected}>
                  <button
                    className="cover-play-inline"
                    onClick={() => play(selected)}
                    aria-label={`Play ${selected.title}`}
                  >
                    {current?.id === selected.id && playing ? (
                      <Pause size={22} />
                    ) : (
                      <Play size={22} fill="currentColor" />
                    )}
                  </button>
                </Cover>
              </div>
              <button
                className="creator-link detail-creator"
                onClick={() => {
                  openProfile(selected.creator);
                  setSelected(null);
                }}
              >
                <Avatar user={selected.creator} size={38} />
                <span>
                  <strong>{selected.creator.display_name}</strong>
                  <small>View songwriter profile</small>
                </span>
              </button>
              <div className="detail-metadata">
                <div>
                  <span>Genre</span>
                  <strong>{selected.genre}</strong>
                </div>
                <div>
                  <span>Tempo</span>
                  <strong>{selected.bpm ? `${selected.bpm} BPM` : 'Not set'}</strong>
                </div>
                <div>
                  <span>Key</span>
                  <strong>{selected.musical_key || 'Not set'}</strong>
                </div>
                <div>
                  <span>Mood</span>
                  <strong>{selected.mood}</strong>
                </div>
              </div>
              <div className="detail-interactions">
                <button
                  className={`button secondary ${selected.liked ? 'liked' : ''}`}
                  onClick={() => void toggleReaction(selected, 'like')}
                >
                  <Heart size={16} fill={selected.liked ? 'currentColor' : 'none'} />
                  {number(selected.likes)}
                </button>
                <button
                  className={`button secondary ${selected.saved ? 'mint' : ''}`}
                  onClick={() => void toggleReaction(selected, 'save')}
                >
                  <Bookmark size={16} fill={selected.saved ? 'currentColor' : 'none'} />
                  {selected.saved ? 'Saved' : 'Save idea'}
                </button>
              </div>
              {selected.creator.id === user?.id ? (
                <button
                  className="button primary full-width"
                  onClick={() => {
                    setEditor({ idea: selected });
                    setSelected(null);
                  }}
                >
                  <Pencil size={16} />
                  Edit in my studio
                </button>
              ) : (
                <div className="detail-license">
                  <span className="eyebrow">
                    {selected.license_type === 'exclusive'
                      ? 'EXCLUSIVE LICENSE'
                      : 'NONEXCLUSIVE LICENSE'}
                  </span>
                  <strong>{money(selected.price_cents, selected.currency)}</strong>
                  <button
                    className="button primary full-width"
                    disabled={!selected.available}
                    onClick={() => {
                      if (requireUser()) {
                        setCheckout(selected);
                        setSelected(null);
                      }
                    }}
                  >
                    {selected.available ? (
                      <>
                        <ShoppingBag size={16} />
                        License this idea
                      </>
                    ) : (
                      'Exclusively licensed'
                    )}
                  </button>
                  <small>Review the terms before you decide.</small>
                </div>
              )}
            </aside>
            <div className="detail-main">
              <span className="idea-label">
                <Mic2 size={14} />
                {selected.idea_type}
              </span>
              <h3>The idea</h3>
              <p className="detail-description">{selected.description}</p>
              <div className="card-tags">
                {selected.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
              <div className="lyrics-box">
                <div className="section-heading">
                  <h3>{selected.lyrics ? 'Lyrics' : 'A little of the lyric'}</h3>
                  {!selected.lyrics && <Lock size={15} />}
                </div>
                <pre>
                  {selected.lyrics || selected.lyrics_excerpt || 'This idea has no lyrics yet.'}
                </pre>
                {!selected.lyrics && (
                  <p className="lyrics-locked">
                    <Lock size={12} />
                    Full lyrics and available original audio unlock with a paid license.
                  </p>
                )}
              </div>
              <section className="comments-section">
                <div className="section-heading">
                  <h3>Creative conversation</h3>
                  <span>{comments.length}</span>
                </div>
                {commentLoading && !comments.length ? (
                  <p className="muted">Loading feedback…</p>
                ) : (
                  comments.map((comment) => (
                    <div className="comment" key={comment.id}>
                      <Avatar user={comment.author} size={30} />
                      <div>
                        <strong>
                          {comment.author.display_name}
                          <small>{ago(comment.created_at)}</small>
                        </strong>
                        <p>{comment.body}</p>
                      </div>
                    </div>
                  ))
                )}
                {!commentLoading && !comments.length && (
                  <p className="muted">Be the first to share a thought.</p>
                )}
                <form className="comment-form" onSubmit={submitComment}>
                  <label className="sr-only" htmlFor="comment">
                    Your feedback
                  </label>
                  <textarea
                    id="comment"
                    placeholder="Share a thought, a feeling, a little feedback…"
                    maxLength={1000}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    required
                  />
                  <button
                    className="button secondary"
                    disabled={commentLoading || !commentText.trim()}
                  >
                    <MessageCircle size={15} />
                    Post feedback
                  </button>
                </form>
              </section>
            </div>
          </div>
        )}
      </Modal>
      {editor && (
        <IdeaEditor
          initial={editor.idea}
          prompt={editor.prompt}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await reload();
            setEditor(null);
            navigate('studio');
          }}
        />
      )}
      <Modal
        open={!!checkout}
        onClose={() => {
          if (!checkoutBusy) setCheckout(null);
        }}
        title="Make room for your next song"
      >
        {checkout && (
          <div className="checkout-body">
            <div className="checkout-idea">
              <Cover idea={checkout} small />
              <div>
                <h3>{checkout.title}</h3>
                <p>by {checkout.creator.display_name}</p>
              </div>
              <strong>{money(checkout.price_cents, checkout.currency)}</strong>
            </div>
            <div className="license-explainer">
              <ShieldCheck size={24} />
              <div>
                <h3>
                  {checkout.license_type === 'exclusive'
                    ? 'Exclusive license'
                    : 'Nonexclusive license'}
                </h3>
                <p>
                  {checkout.license_type === 'exclusive'
                    ? 'This idea will be licensed to you alone. It will no longer be available for others to buy.'
                    : 'You may develop and release a song using this idea. Other writers may also license the same material.'}
                </p>
              </div>
            </div>
            <div className="license-terms">
              <h4>What’s included</h4>
              <p>
                <Check size={15} />
                The full lyrics and license record
              </p>
              <p>
                <Check size={15} />
                Original audio, when supplied by the writer
              </p>
              <p>
                <Check size={15} />A record of the agreed price and terms
              </p>
              <p className="muted">
                The writer retains authorship. This license does not transfer copyright. Song
                credits and publishing splits require a separate agreement.
              </p>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>I have reviewed and accept these license terms.</span>
            </label>
            <div className="checkout-total">
              <span>Total</span>
              <strong>{money(checkout.price_cents, checkout.currency)}</strong>
            </div>
            <button
              className="button primary full-width"
              disabled={!agreed || checkoutBusy}
              onClick={() => void purchase()}
            >
              <ShoppingBag size={17} />
              {checkoutBusy
                ? 'Preparing your license…'
                : demoPayments
                  ? 'Complete demo purchase'
                  : 'Create purchase order'}
            </button>
            <p className="checkout-note">
              {demoPayments
                ? 'Demo checkout. No payment is collected.'
                : 'Your order remains pending until payment is confirmed. No payment is collected here.'}
            </p>
          </div>
        )}
      </Modal>
      <Modal
        open={!!purchased}
        onClose={() => setPurchased(null)}
        title={
          purchased?.status === 'paid' ? 'A new possibility, all yours.' : 'Your order is in place.'
        }
      >
        {purchased && (
          <div className="purchase-success">
            <div className="success-icon">
              {purchased.status === 'paid' ? <Check size={32} /> : <ShoppingBag size={32} />}
            </div>
            <h3>{purchased.idea_title}</h3>
            <p>
              {purchased.status === 'paid'
                ? 'Your license is ready. Take the idea back to your studio and see where it leads.'
                : 'Payment confirmation is still required. You can track this order in My licenses.'}
            </p>
            {purchased.status === 'paid' && (
              <button
                className="button primary full-width"
                onClick={() => void download(purchased)}
              >
                <Download size={17} />
                Download lyrics & license
              </button>
            )}
            <button
              className="button secondary full-width"
              onClick={() => {
                navigate('orders');
                setPurchased(null);
              }}
            >
              View my licenses
            </button>
          </div>
        )}
      </Modal>
      <Modal
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        title="A little activity around your ideas"
      >
        <div className="notification-list">
          <button
            className="text-button"
            onClick={() =>
              void api
                .markRead()
                .then(reload)
                .catch((e) => toast.error(e.message))
            }
          >
            <CheckCheck size={16} />
            Mark all as read
          </button>
          {notifications.length ? (
            notifications.map((note) => (
              <button
                key={note.id}
                className={`notification-row ${note.read ? 'read' : ''}`}
                onClick={() => {
                  const idea = ideas.find((x) => x.id === note.idea_id);
                  if (idea) void openDetail(idea);
                  setNotificationsOpen(false);
                }}
              >
                <div className="notification-icon">
                  {note.kind === 'comment' ? (
                    <MessageCircle size={18} />
                  ) : note.kind === 'purchase' ? (
                    <ShoppingBag size={18} />
                  ) : (
                    <Bookmark size={18} />
                  )}
                </div>
                <span>
                  <strong>{note.body}</strong>
                  <small>{ago(note.created_at)}</small>
                </span>
                {!note.read && <span className="unread-dot" />}
              </button>
            ))
          ) : (
            <Empty
              icon={Bell}
              title="A quiet moment"
              description="Saves, feedback, and license activity will appear here."
            />
          )}
        </div>
      </Modal>
      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="A little room for your next big idea"
      >
        <div className="help-content">
          <p>
            Capture lyrics and audio in <strong>My studio</strong>. Drafts stay private. Publish an
            idea when you’re ready to share it.
          </p>
          <p>
            Use <strong>Discover</strong> to listen, save ideas, and leave thoughtful feedback. The{' '}
            <strong>Marketplace</strong> brings together ideas available to license.
          </p>
          <p>
            Choose an exclusive or nonexclusive license before publishing. Buyers review the terms
            before an order is created.
          </p>
          {DEMO && (
            <div className="demo-explanation">
              <span className="demo-badge">Demo workspace</span>
              <p>
                This is a sample workspace with fictional writers and synthesized audio previews.
                Changes stay on this device. Purchases are simulated and no money changes hands.
              </p>
              <p>Your real songwriting material should go in your own connected workspace.</p>
              <button
                className="button secondary"
                onClick={() => {
                  setHelpOpen(false);
                  setResetOpen(true);
                }}
              >
                Reset demo workspace
              </button>
            </div>
          )}
          <button
            className="button primary full-width"
            onClick={() => {
              setHelpOpen(false);
              startCreate();
            }}
          >
            <NotebookPen size={16} />
            Start writing
          </button>
        </div>
      </Modal>
      <Modal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title="Archive this idea?"
      >
        {archiveTarget && (
          <div className="confirm-body">
            <p>
              “{archiveTarget.title}” will leave discovery and your active studio. You can restore
              it from Archived.
            </p>
            <div className="dialog-actions">
              <button className="button secondary" onClick={() => setArchiveTarget(null)}>
                Keep idea
              </button>
              <button
                className="button primary"
                onClick={() =>
                  void api
                    .archive(archiveTarget.id)
                    .then(reload)
                    .then(() => {
                      setArchiveTarget(null);
                      toast.success('Idea archived');
                    })
                    .catch((e) => toast.error(e.message))
                }
              >
                Archive idea
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset your demo workspace?"
      >
        <div className="confirm-body">
          <p>
            Your local demo drafts, saved ideas, and simulated purchases will be removed. The
            original sample workspace will be restored.
          </p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setResetOpen(false)}>
              Keep my changes
            </button>
            <button
              className="button primary"
              onClick={() => {
                api.resetDemo();
                setResetOpen(false);
                void reload();
                toast.success('Demo restored');
              }}
            >
              Reset demo
            </button>
          </div>
        </div>
      </Modal>
      {profileEdit && user && (
        <ProfileEditor
          user={user}
          onClose={() => setProfileEdit(false)}
          onSaved={async () => {
            await reload();
            setProfileEdit(false);
            setProfileTarget(null);
          }}
        />
      )}
      <Modal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        title={authRegister ? 'Make a little room for your ideas' : 'Welcome back to your studio'}
      >
        <form
          className="auth-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            try {
              if (authRegister)
                await api.register(
                  String(data.get('name')),
                  String(data.get('email')),
                  String(data.get('password')),
                );
              else await api.login(String(data.get('email')), String(data.get('password')));
              await reload();
              setAuthOpen(false);
              toast.success('Your workspace is ready');
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          {authRegister && (
            <label>
              Your name
              <input name="name" required minLength={2} maxLength={80} autoComplete="name" />
            </label>
          )}
          <label>
            Email address
            <input type="email" name="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete={authRegister ? 'new-password' : 'current-password'}
            />
          </label>
          <button className="button primary full-width">
            {authRegister ? 'Create your account' : 'Sign in'}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setAuthRegister(!authRegister)}
          >
            {authRegister ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
        </form>
      </Modal>
      {!DEMO && user && view === 'profile' && !profileTarget && (
        <button
          className="signout-button"
          onClick={() =>
            void api
              .logout()
              .then(reload)
              .then(() => navigate('discover'))
              .catch((e) => toast.error(e.message))
          }
        >
          <LogOut size={15} />
          Sign out
        </button>
      )}
    </div>
  );
}

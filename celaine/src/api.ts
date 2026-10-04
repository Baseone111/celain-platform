import type {
  Idea,
  IdeaInput,
  User,
  Comment,
  Notification,
  Order,
  Analytics,
  Health,
} from './types';
import { DEMO_USER, SEED_IDEAS, SEED_COMMENTS, SEED_NOTIFICATIONS, CREATORS } from './seed';
import { zipSync, strToU8 } from 'fflate';
const env = (import.meta as unknown as { env: Record<string, string> }).env;
export const API_URL = (env.VITE_API_URL || '').replace(/\/$/, '');
export const DEMO = env.VITE_DEMO_MODE === 'true' || (!API_URL && env.VITE_DEMO_MODE !== 'false');
const KEY = 'celaine-demo-v1';
type DemoState = {
  ideas: Idea[];
  user: User;
  comments: Record<string, Comment[]>;
  notifications: Notification[];
  orders: Order[];
  follows: string[];
  events: { idea_id: string; kind: 'view' | 'play'; date: string }[];
};
function initial(): DemoState {
  return structuredClone({
    ideas: SEED_IDEAS,
    user: DEMO_USER,
    comments: SEED_COMMENTS,
    notifications: SEED_NOTIFICATIONS,
    orders: [],
    follows: [],
    events: [],
  });
}
function readDemo(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* Storage may be unavailable or a previous value corrupt. */
  }
  return initial();
}
let demo = readDemo();
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(demo));
  } catch {
    throw new Error('Device storage is full. Try a smaller audio file or remove an unused draft.');
  }
}
let token: string | null = null; // Access tokens stay in memory; refresh cookies are httpOnly.
let refreshPromise: Promise<{ access_token: string }> | null = null;
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (
    response.status === 401 &&
    retry &&
    path != '/auth/refresh' &&
    !path.startsWith('/auth/login')
  ) {
    try {
      if (!refreshPromise)
        refreshPromise = request<{ access_token: string }>(
          '/auth/refresh',
          { method: 'POST' },
          false,
        ).finally(() => {
          refreshPromise = null;
        });
      const refreshed = await refreshPromise;
      token = refreshed.access_token;
      return request<T>(path, options, false);
    } catch {
      token = null;
    }
  }
  if (!response.ok) {
    let message = 'Something went wrong. Please try again.';
    try {
      const error = await response.json();
      message =
        typeof error.detail === 'string'
          ? error.detail
          : 'Please check the information you entered.';
    } catch {}
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
const j = (value: unknown) => JSON.stringify(value);
function publicIdea(idea: Idea): Idea {
  return {
    ...idea,
    creator: { ...idea.creator, following: demo.follows.includes(idea.creator.id) },
    lyrics:
      idea.creator.id === demo.user.id ||
      demo.orders.some((o) => o.idea_id === idea.id && o.status === 'paid')
        ? idea.lyrics
        : undefined,
  };
}
function localIdea(id: string) {
  const idea = demo.ideas.find((x) => x.id === id);
  if (!idea) throw new ApiError('Idea not found.', 404);
  return idea;
}
export const api = {
  async health(): Promise<Health> {
    return DEMO ? { demo_payments: true } : request('/health');
  },
  async me(): Promise<User> {
    return DEMO ? demo.user : request('/auth/me');
  },
  async login(email: string, password: string): Promise<User> {
    const result = await request<{ access_token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: j({ email, password }),
    });
    token = result.access_token;
    return result.user;
  },
  async register(display_name: string, email: string, password: string): Promise<User> {
    const result = await request<{ access_token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: j({ display_name, email, password }),
    });
    token = result.access_token;
    return result.user;
  },
  async logout() {
    if (!DEMO) await request('/auth/logout', { method: 'POST' });
    token = null;
  },
  async profile(patch: Partial<User>): Promise<User> {
    if (!DEMO) return request('/users/me', { method: 'PATCH', body: j(patch) });
    demo.user = { ...demo.user, ...patch };
    demo.ideas = demo.ideas.map((x) =>
      x.creator.id === demo.user.id ? { ...x, creator: demo.user } : x,
    );
    persist();
    return demo.user;
  },
  async ideas(scope = 'discover'): Promise<Idea[]> {
    if (!DEMO) return request(`/ideas?scope=${scope}&limit=100`);
    return demo.ideas
      .filter((x) =>
        scope === 'mine'
          ? x.creator.id === demo.user.id
          : scope === 'saved'
            ? x.saved
            : x.status === 'published' || x.status === 'sold',
      )
      .map(publicIdea);
  },
  async idea(id: string): Promise<Idea> {
    return DEMO ? publicIdea(localIdea(id)) : request(`/ideas/${id}`);
  },
  async create(input: IdeaInput): Promise<Idea> {
    if (!DEMO) return request('/ideas', { method: 'POST', body: j(input) });
    const idea: Idea = {
      ...input,
      id: crypto.randomUUID(),
      creator: demo.user,
      lyrics_excerpt: input.lyrics.split('\n').slice(0, 4).join('\n'),
      duration_seconds: 0,
      has_original: false,
      preview_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      views: 0,
      plays: 0,
      likes: 0,
      saves: 0,
      comments_count: 0,
      liked: false,
      saved: false,
      available: true,
    };
    demo.ideas.unshift(idea);
    persist();
    return idea;
  },
  async update(id: string, input: IdeaInput): Promise<Idea> {
    if (!DEMO) return request(`/ideas/${id}`, { method: 'PATCH', body: j(input) });
    if (demo.orders.some((o) => o.idea_id === id && o.status !== 'cancelled'))
      throw new ApiError('Licensed ideas cannot be changed. Create a new version instead.');
    const idea = localIdea(id);
    Object.assign(idea, input, {
      lyrics_excerpt: input.lyrics.split('\n').slice(0, 4).join('\n'),
      updated_at: new Date().toISOString(),
    });
    persist();
    return idea;
  },
  async archive(id: string) {
    if (!DEMO) return request(`/ideas/${id}`, { method: 'DELETE' });
    const idea = localIdea(id);
    idea.status = 'archived';
    persist();
  },
  async react(id: string, kind: 'like' | 'save', active: boolean): Promise<Idea> {
    if (!DEMO)
      return request(`/ideas/${id}/reactions/${kind}`, { method: 'PUT', body: j({ active }) });
    const idea = localIdea(id);
    if (kind === 'like' && idea.liked !== active) {
      idea.liked = active;
      idea.likes += active ? 1 : -1;
    } else if (kind === 'save' && idea.saved !== active) {
      idea.saved = active;
      idea.saves += active ? 1 : -1;
    }
    persist();
    return publicIdea(idea);
  },
  async event(id: string, kind: 'view' | 'play') {
    if (!DEMO) return request(`/ideas/${id}/events`, { method: 'POST', body: j({ kind }) });
    if (localIdea(id).creator.id === demo.user.id) return;
    const date = new Date().toISOString().slice(0, 10);
    if (!demo.events.some((e) => e.idea_id === id && e.kind === kind && e.date === date)) {
      demo.events.push({ idea_id: id, kind, date });
      localIdea(id)[kind === 'view' ? 'views' : 'plays']++;
      persist();
    }
  },
  async comments(id: string): Promise<Comment[]> {
    return DEMO ? demo.comments[id] || [] : request(`/ideas/${id}/comments`);
  },
  async comment(id: string, body: string): Promise<Comment> {
    if (!DEMO) return request(`/ideas/${id}/comments`, { method: 'POST', body: j({ body }) });
    const comment = {
      id: crypto.randomUUID(),
      body,
      author: demo.user,
      created_at: new Date().toISOString(),
    };
    demo.comments[id] = [...(demo.comments[id] || []), comment];
    localIdea(id).comments_count++;
    persist();
    return comment;
  },
  async notifications(): Promise<Notification[]> {
    return DEMO ? demo.notifications : request('/notifications');
  },
  async markRead() {
    if (!DEMO) return request('/notifications/read', { method: 'POST' });
    demo.notifications.forEach((x) => (x.read = true));
    persist();
  },
  async orders(): Promise<Order[]> {
    return DEMO ? demo.orders : request('/orders');
  },
  async checkout(id: string, key: string): Promise<Order> {
    if (!DEMO)
      return request('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: j({ idea_id: id }),
      });
    const idea = localIdea(id);
    if (idea.creator.id === demo.user.id) throw new ApiError('You already own this idea.');
    if (!idea.available || idea.status !== 'published')
      throw new ApiError('This idea is no longer available.');
    const previous = demo.orders.find((o) => o.idea_id === id && o.status !== 'cancelled');
    if (previous) return previous;
    const order: Order = {
      id: crypto.randomUUID(),
      idea_id: id,
      idea_title: idea.title,
      buyer_id: demo.user.id,
      seller_id: idea.creator.id,
      amount_cents: idea.price_cents,
      currency: idea.currency,
      license_type: idea.license_type,
      license_terms:
        idea.license_type === 'exclusive'
          ? 'Exclusive license for this idea. Original creator retains authorship; no copyright assignment is implied. Credit and publishing splits require a separate agreement.'
          : 'Nonexclusive license to develop and release a song using this idea. Other creators can license the same material. Credit and publishing splits require a separate agreement.',
      status: 'pending',
      created_at: new Date().toISOString(),
      paid_at: null,
    };
    demo.orders.unshift(order);
    persist();
    return order;
  },
  async demoPay(id: string): Promise<Order> {
    if (!DEMO) return request(`/orders/${id}/demo-pay`, { method: 'POST' });
    const order = demo.orders.find((x) => x.id === id)!;
    order.status = 'paid';
    order.paid_at = new Date().toISOString();
    if (order.license_type === 'exclusive') {
      localIdea(order.idea_id).available = false;
      localIdea(order.idea_id).status = 'sold';
    }
    persist();
    return order;
  },
  async cancelOrder(id: string) {
    if (!DEMO) return request(`/orders/${id}/cancel`, { method: 'POST' });
    const order = demo.orders.find((x) => x.id === id);
    if (order?.status === 'pending') order.status = 'cancelled';
    persist();
  },
  async follow(id: string): Promise<boolean> {
    if (!DEMO) {
      const result = await request<{ following: boolean }>(`/users/${id}/follow`, {
        method: 'POST',
      });
      return result.following;
    }
    const index = demo.follows.indexOf(id);
    if (index >= 0) demo.follows.splice(index, 1);
    else demo.follows.push(id);
    persist();
    return index < 0;
  },
  async creators(): Promise<User[]> {
    if (!DEMO) return request('/users/creators');
    return CREATORS.filter((x) => x.id !== demo.user.id).map((x) => ({
      ...x,
      following: demo.follows.includes(x.id),
      followers: x.followers + (demo.follows.includes(x.id) ? 1 : 0),
    }));
  },
  async upload(id: string, file: File, kind: 'preview' | 'original'): Promise<Idea> {
    if (!DEMO) {
      const form = new FormData();
      form.append('file', file);
      return request(`/ideas/${id}/audio?kind=${kind}`, { method: 'POST', body: form });
    }
    if (file.size > 2 * 1024 * 1024)
      throw new ApiError('Demo files must be under 2 MB. The API supports 20 MB.');
    const value = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const idea = localIdea(id);
    if (kind === 'preview') idea.preview_url = value;
    else {
      idea.has_original = true;
      (idea as Idea & { original_data?: string }).original_data = value;
    }
    persist();
    return publicIdea(idea);
  },
  async download(order: Order): Promise<Blob> {
    if (DEMO) {
      if (!demo.orders.some((x) => x.id === order.id && x.status === 'paid'))
        throw new ApiError('A paid demo license is required.');
      const idea = localIdea(order.idea_id);
      const files: Record<string, Uint8Array> = {
        'license.txt': strToU8(
          `CELAINE DEMO LICENSE\n${order.idea_title}\nOrder: ${order.id}\n${order.license_terms}\n\nThis is a simulated purchase.`,
        ),
        'lyrics.txt': strToU8(idea.lyrics || ''),
        'license.json': strToU8(JSON.stringify(order, null, 2)),
      };
      const original =
        (idea as Idea & { original_data?: string }).original_data || idea.preview_url;
      if (idea.has_original && original) {
        const response = await fetch(original);
        if (!response.ok) throw new ApiError('The demo audio could not be downloaded.');
        const mime = response.headers.get('Content-Type') || '';
        const extension = mime.includes('mpeg') ? 'mp3' : mime.includes('ogg') ? 'ogg' : 'wav';
        files[`original.${extension}`] = new Uint8Array(await response.arrayBuffer());
      }
      return new Blob([new Uint8Array(zipSync(files)).buffer], { type: 'application/zip' });
    }
    const fetchPackage = () =>
      fetch(`${API_URL}/api/v1/orders/${order.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
    let response = await fetchPackage();
    if (response.status === 401) {
      await api.me();
      response = await fetchPackage();
    }
    if (!response.ok) throw new ApiError('Sign in again to download your license.');
    return response.blob();
  },
  async analytics(days = 30): Promise<Analytics> {
    if (!DEMO) return request(`/analytics?days=${days}`);
    const mine = demo.ideas.filter((x) => x.creator.id === demo.user.id);
    const paid = demo.orders.filter((x) => x.seller_id === demo.user.id && x.status === 'paid');
    const events = demo.events.filter((x) => mine.some((i) => i.id === x.idea_id));
    return {
      views: mine.reduce((s, x) => s + x.views, 0),
      plays: mine.reduce((s, x) => s + x.plays, 0),
      likes: mine.reduce((s, x) => s + x.likes, 0),
      saves: mine.reduce((s, x) => s + x.saves, 0),
      comments: mine.reduce((s, x) => s + x.comments_count, 0),
      licenses: paid.length,
      revenue_cents: paid.reduce((s, x) => s + x.amount_cents, 0),
      daily: Array.from({ length: days }, (_, i) => {
        const date = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
        return {
          date,
          views: events.filter((x) => x.date === date && x.kind === 'view').length,
          plays: events.filter((x) => x.date === date && x.kind === 'play').length,
        };
      }),
      ideas: mine.map((x) => ({
        id: x.id,
        title: x.title,
        views: x.views,
        plays: x.plays,
        likes: x.likes,
        saves: x.saves,
      })),
    };
  },
  async preview(idea: Idea): Promise<string> {
    if (DEMO) return idea.preview_url || '';
    const path = audioUrl(idea.preview_url);
    if (!path) throw new ApiError('No audio is attached.');
    let response = await fetch(path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (response.status === 401) {
      await api.me();
      response = await fetch(path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
    }
    if (!response.ok) throw new ApiError('Audio preview is unavailable.', response.status);
    return URL.createObjectURL(await response.blob());
  },
  resetDemo() {
    localStorage.removeItem(KEY);
    demo = initial();
  },
};
export function audioUrl(value: string | null) {
  return value && value.startsWith('/api/') ? `${API_URL}${value}` : value;
}

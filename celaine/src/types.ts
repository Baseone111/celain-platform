export type View =
  'discover' | 'studio' | 'marketplace' | 'analytics' | 'saved' | 'orders' | 'profile';
export interface User {
  id: string;
  display_name: string;
  username: string;
  email?: string | null;
  bio: string;
  location: string;
  avatar_color: string;
  followers: number;
  following: boolean;
}
export type LicenseType = 'nonexclusive' | 'exclusive';
export interface Idea {
  id: string;
  creator: User;
  title: string;
  description: string;
  lyrics?: string | null;
  lyrics_excerpt: string;
  genre: string;
  mood: string;
  idea_type: string;
  tags: string[];
  bpm: number | null;
  musical_key: string;
  duration_seconds: number;
  price_cents: number;
  currency: string;
  license_type: LicenseType;
  status: 'draft' | 'published' | 'sold' | 'archived';
  cover_color: number;
  preview_url: string | null;
  has_original: boolean;
  created_at: string;
  updated_at: string;
  views: number;
  plays: number;
  likes: number;
  saves: number;
  comments_count: number;
  liked: boolean;
  saved: boolean;
  available: boolean;
}
export interface Comment {
  id: string;
  body: string;
  author: User;
  created_at: string;
}
export interface Notification {
  id: string;
  kind: string;
  body: string;
  idea_id: string | null;
  created_at: string;
  read: boolean;
}
export interface Order {
  id: string;
  idea_id: string;
  idea_title: string;
  buyer_id: string;
  seller_id: string;
  amount_cents: number;
  currency: string;
  license_type: LicenseType;
  license_terms: string;
  status: 'pending' | 'paid' | 'cancelled';
  created_at: string;
  paid_at: string | null;
}
export interface Analytics {
  views: number;
  plays: number;
  likes: number;
  saves: number;
  comments: number;
  revenue_cents: number;
  licenses: number;
  daily: { date: string; views: number; plays: number }[];
  ideas: {
    id: string;
    title: string;
    views: number;
    plays: number;
    saves: number;
    likes: number;
  }[];
}
export interface IdeaInput {
  title: string;
  description: string;
  lyrics: string;
  genre: string;
  mood: string;
  idea_type: string;
  tags: string[];
  bpm: number | null;
  musical_key: string;
  price_cents: number;
  currency: string;
  license_type: LicenseType;
  status: 'draft' | 'published';
  cover_color: number;
}
export interface Health {
  demo_payments: boolean;
}
export const GENRES = [
  'All genres',
  'Afropop',
  'R&B / Soul',
  'Indie pop',
  'Acoustic',
  'Hip-hop',
  'Electronic',
];
export const MOODS = [
  'Any mood',
  'Dreamy',
  'Uplifting',
  'Introspective',
  'Romantic',
  'Melancholic',
  'Energetic',
];
export const money = (cents: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
export const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

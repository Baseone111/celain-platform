import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AudioLines, Check, Compass, Lock, NotebookPen, ShieldCheck } from 'lucide-react';
import { api, DEMO } from '../api';
import { GENRES, MOODS, type Idea, type IdeaInput, type User } from '../types';
import { Modal } from './primitives';

const emptyIdea: IdeaInput = {
  title: '',
  description: '',
  lyrics: '',
  genre: 'Afropop',
  mood: 'Dreamy',
  idea_type: 'Hook',
  tags: [],
  bpm: null,
  musical_key: '',
  price_cents: 3500,
  currency: 'USD',
  license_type: 'nonexclusive',
  status: 'draft',
  cover_color: 0,
};
export function IdeaEditor({
  initial,
  prompt,
  onClose,
  onSaved,
}: {
  initial?: Idea;
  prompt?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<IdeaInput>(
    initial
      ? {
          title: initial.title,
          description: initial.description,
          lyrics: initial.lyrics || '',
          genre: initial.genre,
          mood: initial.mood,
          idea_type: initial.idea_type,
          tags: initial.tags,
          bpm: initial.bpm,
          musical_key: initial.musical_key,
          price_cents: initial.price_cents,
          currency: initial.currency,
          license_type: initial.license_type,
          status: initial.status === 'published' ? 'published' : 'draft',
          cover_color: initial.cover_color,
        }
      : { ...emptyIdea, description: prompt || '' },
  );
  const [tagText, setTagText] = useState(form.tags.join(', ')),
    [preview, setPreview] = useState<File | null>(null),
    [original, setOriginal] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [closeConfirm, setCloseConfirm] = useState(false),
    [savedId, setSavedId] = useState<string | null>(null);
  const set = <K extends keyof IdeaInput>(key: K, value: IdeaInput[K]) => {
    setForm((old) => ({ ...old, [key]: value }));
    setDirty(true);
  };
  const canEdit = initial?.status !== 'sold';
  async function save(status: 'draft' | 'published') {
    if (!form.title.trim()) {
      toast.error('Give this idea a title first.');
      return;
    }
    if (
      status === 'published' &&
      (!form.description.trim() || (!form.lyrics.trim() && !preview && !initial?.preview_url))
    ) {
      toast.error('Add a description and lyrics or an audio preview before publishing.');
      return;
    }
    if (status === 'published' && form.price_cents < 100) {
      toast.error('Set a license price of at least $1.');
      return;
    }
    setBusy(true);
    try {
      const data = {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        status,
        tags: tagText
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 8),
      };
      const id = initial?.id || savedId;
      const staged =
        (preview || original) && status === 'published'
          ? { ...data, status: 'draft' as const }
          : data;
      const idea = id ? await api.update(id, staged) : await api.create(staged);
      setSavedId(idea.id);
      if (preview) {
        await api.upload(idea.id, preview, 'preview');
        setPreview(null);
      }
      if (original) {
        await api.upload(idea.id, original, 'original');
        setOriginal(null);
      }
      if (staged.status !== status) await api.update(idea.id, data);
      setDirty(false);
      await onSaved();
      toast.success(
        status === 'published' ? 'Your idea is out in the world' : 'Draft saved to your studio',
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);
  return (
    <>
      <Modal
        open
        onClose={() => {
          if (busy) return;
          if (dirty) setCloseConfirm(true);
          else onClose();
        }}
        title={initial ? 'Back to the notebook' : 'Start with a little spark'}
        wide
      >
        <div className="editor-layout">
          <div className="editor-main">
            <div className="editor-caption">
              <span className="status-badge status-draft">
                <Lock size={11} />
                {initial?.status === 'published' ? 'Published idea' : 'Private draft'}
              </span>
              <span>Make space for an unfinished idea.</span>
            </div>
            <label className="title-input-label">
              <span>Idea title</span>
              <input
                className="idea-title-input"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Give your idea a name…"
                maxLength={120}
                disabled={!canEdit}
              />
            </label>
            <label>
              What’s the idea?
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="A feeling, a story, a direction. Tell us what’s behind it."
                rows={3}
                maxLength={2000}
                disabled={!canEdit}
              />
            </label>
            <label className="lyrics-editor-label">
              <span>
                <NotebookPen size={16} />
                Your lyrics & notes
                <small>
                  {form.lyrics.trim() ? form.lyrics.trim().split(/\s+/).length : 0} words
                </small>
              </span>
              <textarea
                className="lyrics-editor"
                value={form.lyrics}
                onChange={(e) => set('lyrics', e.target.value)}
                placeholder={'[Verse 1]\nLet the first line find you…\n\n[Chorus]\n'}
                rows={12}
                maxLength={20000}
                disabled={!canEdit}
              />
            </label>
            <div className="upload-fields">
              <label className="audio-upload">
                <AudioLines size={22} />
                <strong>{preview?.name || 'Add an audio preview'}</strong>
                <small>A short clip listeners can hear</small>
                <input
                  type="file"
                  accept="audio/mpeg,audio/wav,audio/x-wav,audio/ogg"
                  onChange={(e) => {
                    setPreview(e.target.files?.[0] || null);
                    setDirty(true);
                  }}
                  disabled={!canEdit}
                />
                <span>
                  {initial?.preview_url && !preview
                    ? 'Preview already attached'
                    : 'MP3, WAV, or OGG'}
                </span>
              </label>
              <label className="audio-upload">
                <Lock size={22} />
                <strong>{original?.name || 'Add original audio'}</strong>
                <small>Available to licensed buyers only</small>
                <input
                  type="file"
                  accept="audio/mpeg,audio/wav,audio/x-wav,audio/ogg"
                  onChange={(e) => {
                    setOriginal(e.target.files?.[0] || null);
                    setDirty(true);
                  }}
                  disabled={!canEdit}
                />
                <span>
                  {initial?.has_original && !original
                    ? 'Original already attached'
                    : DEMO
                      ? 'Under 2 MB in this demo'
                      : 'Under 20 MB'}
                </span>
              </label>
            </div>
          </div>
          <aside className="editor-settings">
            <h3>The little details</h3>
            <div className="form-grid">
              <label>
                Idea type
                <select value={form.idea_type} onChange={(e) => set('idea_type', e.target.value)}>
                  <option>Hook</option>
                  <option>Lyrics</option>
                  <option>Song sketch</option>
                </select>
              </label>
              <label>
                Genre
                <select value={form.genre} onChange={(e) => set('genre', e.target.value)}>
                  {GENRES.slice(1).map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              <label>
                Mood
                <select value={form.mood} onChange={(e) => set('mood', e.target.value)}>
                  {MOODS.slice(1).map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              <div className="form-pair">
                <label>
                  Tempo (BPM)
                  <input
                    type="number"
                    value={form.bpm ?? ''}
                    placeholder="e.g. 92"
                    min={30}
                    max={300}
                    onChange={(e) => set('bpm', e.target.value ? Number(e.target.value) : null)}
                  />
                </label>
                <label>
                  Musical key
                  <input
                    value={form.musical_key}
                    placeholder="e.g. C major"
                    maxLength={30}
                    onChange={(e) => set('musical_key', e.target.value)}
                  />
                </label>
              </div>
              <label>
                Tags
                <input
                  value={tagText}
                  placeholder="soulful, warm, hopeful"
                  maxLength={200}
                  onChange={(e) => {
                    setTagText(e.target.value);
                    setDirty(true);
                  }}
                />
                <small>Comma-separated, up to 8 tags</small>
              </label>
            </div>
            <div className="editor-divider" />
            <h3>Make it available</h3>
            <label>
              License type
              <select
                value={form.license_type}
                onChange={(e) => set('license_type', e.target.value as IdeaInput['license_type'])}
              >
                <option value="nonexclusive">Nonexclusive</option>
                <option value="exclusive">Exclusive</option>
              </select>
              <small>
                {form.license_type === 'exclusive'
                  ? 'Available to one buyer only.'
                  : 'More than one writer can license this idea.'}
              </small>
            </label>
            <label>
              License price (USD)
              <div className="price-input">
                <span>$</span>
                <input
                  type="number"
                  value={form.price_cents / 100}
                  step=".01"
                  min="0"
                  max="10000"
                  onChange={(e) => set('price_cents', Math.round(Number(e.target.value) * 100))}
                />
              </div>
            </label>
            <label className="cover-picker-label">
              Cover color
              <div className="cover-picker">
                {[0, 1, 2, 3, 4, 5].map((color) => (
                  <button
                    key={color}
                    className={`color-option cover-${color} ${form.cover_color === color ? 'selected' : ''}`}
                    aria-label={`Cover color ${color + 1}`}
                    aria-pressed={form.cover_color === color}
                    onClick={() => set('cover_color', color)}
                  >
                    {form.cover_color === color && <Check size={16} />}
                  </button>
                ))}
              </div>
            </label>
            <p className="editor-license-note">
              <ShieldCheck size={15} />
              You must own the material you publish. Licensing an idea does not assign its
              copyright.
            </p>
          </aside>
        </div>
        <div className="editor-footer">
          <span>
            <Lock size={14} />
            Changes are saved only when you choose to save.
          </span>
          <div>
            <button
              className="button secondary"
              disabled={busy || !canEdit}
              onClick={() => void save('draft')}
            >
              {busy ? 'Saving…' : 'Save draft'}
            </button>
            <button
              className="button primary"
              disabled={busy || !canEdit}
              onClick={() => void save('published')}
            >
              <Compass size={16} />
              {busy ? 'Saving…' : 'Publish idea'}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={closeConfirm}
        onClose={() => setCloseConfirm(false)}
        title="Keep working on this idea?"
      >
        <div className="confirm-body">
          <p>
            You have unsaved changes. Save your draft or continue writing before you close the
            notebook.
          </p>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => {
                setCloseConfirm(false);
                onClose();
              }}
            >
              Discard changes
            </button>
            <button className="button primary" onClick={() => setCloseConfirm(false)}>
              Keep writing
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
export function ProfileEditor({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="A little about the writer">
      <form
        className="profile-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const data = new FormData(e.currentTarget);
          try {
            await api.profile({
              display_name: String(data.get('display_name')),
              bio: String(data.get('bio')),
              location: String(data.get('location')),
            });
            await onSaved();
            toast.success('Profile updated');
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Your name
          <input
            name="display_name"
            defaultValue={user.display_name}
            minLength={2}
            maxLength={80}
            required
          />
        </label>
        <label>
          Based in
          <input name="location" defaultValue={user.location} maxLength={120} />
        </label>
        <label>
          Your story
          <textarea
            name="bio"
            rows={5}
            defaultValue={user.bio}
            maxLength={500}
            placeholder="What you write. What inspires you. A little of your story."
          />
        </label>
        <button className="button primary full-width" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </Modal>
  );
}

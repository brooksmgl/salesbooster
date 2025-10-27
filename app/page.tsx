'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageBubble } from '@/components/MessageBubble';
import { markdownToHtml } from '@/lib/markup';

type Listing = {
  id: string;
  title?: string | null;
  tags?: string | null;
  description?: string | null;
  faqs?: string | null;
  vision_summary?: string | null;
  image_url?: string | null;
  chat_history: { role: 'user' | 'assistant'; content: string }[];
};

type SessionUser = {
  id: string;
  email: string | null;
};

const API = (path: string) => `/api${path}`;

const PANEL_CLASS = 'bg-panel border border-border rounded-xl p-5 flex flex-col min-h-0';
const SECTION_CLASS = 'bg-panel border border-border rounded-xl p-5 min-h-0';
const CARD_CLASS = 'bg-panel border border-border rounded-xl p-4 min-h-0';
const BUTTON_PRIMARY =
  'inline-flex items-center justify-center rounded-lg border border-transparent bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60';
const BUTTON_SMALL =
  'inline-flex items-center justify-center rounded-lg border border-transparent bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60';
const BUTTON_TERTIARY =
  'inline-flex items-center justify-center rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-accentMuted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60';
const BUTTON_TERTIARY_SMALL =
  'inline-flex items-center justify-center rounded-lg border border-border bg-white px-2 py-1 text-xs font-semibold text-slate-900 transition hover:bg-accentMuted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60';
const INPUT_CLASS =
  'w-full rounded-lg border border-border bg-white px-4 py-3 text-sm text-slate-900 placeholder-muted transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60';
const NOTICE_CLASS =
  'fixed bottom-6 left-1/2 z-30 -translate-x-1/2 transform rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-slate-900';

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function AppPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [listings, setListings] = useState<Listing[]>([]);
  const [current, setCurrent] = useState<Listing | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('l');
    if (id) {
      (window as any).__restoreListingId = id;
    }
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-ellipsis-menu]')) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(API('/auth/session'), { credentials: 'include' });
        if (r.ok) {
          const j = await r.json();
          setUser(j.user);
          setAuthError(null);
        } else if (r.status === 401) {
          setUser(null);
        } else {
          const err = await safeJson(r);
          console.error('Session check failed', err?.error || r.status);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      setListings([]);
      setCurrent(null);
      return;
    }
    void (async () => {
      await refreshList();
      const restore = (window as any).__restoreListingId as string | undefined;
      if (restore) {
        await fetchOne(restore);
        delete (window as any).__restoreListingId;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, user]);

  async function loginWithEmail() {
    const email = emailInput.trim();
    if (!email) {
      setAuthError('Email is required.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const r = await fetch(API('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });
      const payload = await safeJson(r);
      if (!r.ok) {
        throw new Error(payload?.error || 'Sign in failed');
      }
      setUser(payload?.user ?? null);
      setEmailInput('');
    } catch (err) {
      console.error(err);
      setAuthError((err as Error).message || 'Sign in failed');
    } finally {
      setAuthLoading(false);
      setAuthChecked(true);
    }
  }

  async function logout() {
    setAuthLoading(true);
    try {
      await fetch(API('/auth/login'), { method: 'DELETE', credentials: 'include' });
    } catch (err) {
      console.error(err);
    } finally {
      setUser(null);
      setListings([]);
      setCurrent(null);
      setAuthError(null);
      setEmailInput('');
      setAuthLoading(false);
    }
  }

  function handleUnauthorized(message?: string) {
    setAuthError(message || 'Session expired. Please sign in again.');
    setUser(null);
  }

  async function refreshList() {
    if (!user) return;
    try {
      const r = await fetch(API('/listings'), { credentials: 'include' });
      if (r.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!r.ok) {
        const err = await safeJson(r);
        throw new Error(err?.error || `Error ${r.status}`);
      }
      const j = await r.json();
      setListings(j.listings || []);
    } catch (err) {
      console.error(err);
      setNotice((err as Error).message || 'Failed to load listings');
    }
  }

  async function fetchOne(id: string) {
    if (!user) return;
    try {
      const r = await fetch(API(`/listings/${id}`), { credentials: 'include' });
      if (r.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!r.ok) {
        const err = await safeJson(r);
        throw new Error(err?.error || `Error ${r.status}`);
      }
      const j = await r.json();
      setCurrent(j.listing);
      setListings((prev) => {
        if (!Array.isArray(prev)) return [j.listing];
        const exists = prev.some((item) => item.id === j.listing.id);
        if (!exists) return [j.listing, ...prev];
        return prev.map((item) => (item.id === j.listing.id ? { ...item, ...j.listing } : item));
      });
      const url = new URL(window.location.href);
      url.searchParams.set('l', id);
      history.replaceState({}, '', url.toString());
    } catch (err) {
      console.error(err);
      setNotice((err as Error).message || 'Failed to load listing');
    }
  }

  async function newListing() {
    if (!user) {
      handleUnauthorized('Please sign in to create a listing.');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(API('/listings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        credentials: 'include',
      });
      if (r.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!r.ok) {
        const err = await safeJson(r);
        throw new Error(err?.error || `Error ${r.status}`);
      }
      const j = await r.json();
      await refreshList();
      await fetchOne(j.listing.id);
    } catch (err) {
      console.error(err);
      setNotice((err as Error).message || 'Error creating listing');
    } finally {
      setLoading(false);
    }
  }

  async function manualRefresh() {
    if (!user) {
      handleUnauthorized();
      return;
    }
    setLoading(true);
    try {
      await refreshList();
      setCurrent(null);
      setInput('');
      setNotice(null);
      setMenuOpenId(null);
      const url = new URL(window.location.href);
      url.searchParams.delete('l');
      history.replaceState({}, '', url.toString());
    } finally {
      setLoading(false);
    }
  }

  async function deleteListing(id: string) {
    if (!user) {
      handleUnauthorized();
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(API(`/listings/${id}`), { method: 'DELETE', credentials: 'include' });
      if (r.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!r.ok) {
        const err = await safeJson(r);
        throw new Error(err?.error || `Error ${r.status}`);
      }
      setMenuOpenId(null);
      if (current?.id === id) {
        setCurrent(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('l');
        history.replaceState({}, '', url.toString());
      }
      await refreshList();
    } catch (err) {
      console.error(err);
      setNotice((err as Error).message || 'Delete failed');
    } finally {
      setLoading(false);
    }
  }

  async function ensureListing(): Promise<Listing | null> {
    if (current || !user) return current;
    try {
      const r = await fetch(API('/listings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        credentials: 'include',
      });
      if (r.status === 401) {
        handleUnauthorized();
        return null;
      }
      if (!r.ok) {
        const err = await safeJson(r);
        throw new Error(err?.error || `Error ${r.status}`);
      }
      const j = await r.json();
      setCurrent(j.listing);
      await refreshList();
      return j.listing;
    } catch (err) {
      console.error(err);
      setNotice((err as Error).message || 'Error creating listing');
      return null;
    }
  }

  async function send(mode: 'chat' | 'read' | 'title' | 'tags' | 'description' | 'faqs', msg?: string, imageUrl?: string) {
    if (!user) {
      handleUnauthorized();
      return;
    }
    const active = current ?? (await ensureListing());
    if (!active) return;
    setLoading(true);
    try {
      const r = await fetch(API(`/listings/${active.id}/generate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, message: msg, imageUrl }),
        credentials: 'include',
      });
      if (r.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!r.ok) {
        const err = await safeJson(r);
        throw new Error(err?.error || `Error ${r.status}`);
      }
      const j = await r.json();
      setCurrent(j.listing);
      setListings((prev) => {
        if (!Array.isArray(prev)) return [j.listing];
        const exists = prev.some((item) => item.id === j.listing.id);
        if (!exists) return [j.listing, ...prev];
        return prev.map((item) => (item.id === j.listing.id ? { ...item, ...j.listing } : item));
      });
    } catch (err) {
      console.error(err);
      setNotice((err as Error).message || 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  async function onUploadFile(f: File) {
    if (!user) return;
    const active = current ?? (await ensureListing());
    if (!active) return;
    try {
      const r = await fetch(API(`/listings/${active.id}/upload-url`), { method: 'POST', credentials: 'include' });
      if (r.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!r.ok) {
        const err = await safeJson(r);
        throw new Error(err?.error || `Error ${r.status}`);
      }
      const j = await r.json();
      const { uploadUrl, path } = j;

      const up = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f });
      if (!up.ok) throw new Error('Upload failed');

      const signedResponse = await fetch(API(`/listings/${active.id}/image-url`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ path }),
      });
      if (signedResponse.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!signedResponse.ok) {
        const err = await safeJson(signedResponse);
        throw new Error(err?.error || `Image sign error ${signedResponse.status}`);
      }
      const { signedUrl } = await signedResponse.json();
      if (!signedUrl) throw new Error('Missing signed image URL');
      await send('read', undefined, signedUrl);
    } catch (err) {
      console.error(err);
      setNotice((err as Error).message || 'Upload failed');
    }
  }

  function copy(text?: string | null) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setNotice('Copied');
    setTimeout(() => setNotice(null), 1200);
  }

  return (
    <div className="min-h-screen bg-background px-6 py-6 text-foreground">
      {!authChecked ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div
            className="h-12 w-12 animate-spin rounded-full border-4 border-accent/30 border-t-accent"
            role="status"
            aria-live="polite"
            aria-label="Checking session"
          />
        </div>
      ) : !user ? (
        <div className="flex min-h-[80vh] items-center justify-center">
          <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-panel p-8">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
              <p className="mt-2 text-sm text-muted">Enter the email you use for Sales Booster listings.</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loginWithEmail();
              }}
              className="space-y-3"
            >
              <input
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                className={INPUT_CLASS}
                disabled={authLoading}
                type="email"
              />
              <button type="submit" className={BUTTON_PRIMARY} disabled={authLoading}>
                {authLoading ? 'Signing in...' : 'Continue'}
              </button>
            </form>
            {authError && <div className="text-sm font-semibold text-danger">{authError}</div>}
          </div>
        </div>
      ) : (
        <>
          <div className="grid h-[calc(100vh-48px)] grid-cols-[320px_minmax(0,1fr)_320px] gap-6">
            <aside className={PANEL_CLASS}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">My Listings</h2>
                <button onClick={newListing} disabled={loading || authLoading} className={BUTTON_SMALL}>
                  + New Listing
                </button>
              </div>
              <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                {listings.length === 0 ? (
                  <p className="text-sm text-muted">No listings yet. Create one to get started.</p>
                ) : (
                  listings.map((l) => {
                    const isActive = current?.id === l.id;
                    return (
                      <div
                        key={l.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setMenuOpenId(null);
                          void fetchOne(l.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setMenuOpenId(null);
                            void fetchOne(l.id);
                          }
                        }}
                        className={`relative flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-accent/40 ${
                          isActive ? 'border-accent ring-2 ring-accent/20' : 'border-border hover:border-accent/60'
                        }`}
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold text-slate-900">{l.title || 'Untitled draft'}</span>
                          <span className="text-xs text-muted">{l.id.slice(0, 8)}</span>
                        </div>
                        <div className="relative" data-ellipsis-menu>
                          <button
                            type="button"
                            aria-label="Listing options"
                            className="rounded-md p-1 text-slate-400 transition hover:bg-accentMuted/60 hover:text-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId((prev) => (prev === l.id ? null : l.id));
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            ⋮
                          </button>
                          {menuOpenId === l.id && (
                            <div className="absolute right-0 top-full z-20 mt-2 flex min-w-[130px] flex-col rounded-md border border-border bg-white">
                              <button
                                type="button"
                                className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-danger transition hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void deleteListing(l.id);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>
            <div className="relative grid grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden">
              <section className={`${SECTION_CLASS} flex items-center justify-between`}>
                <div>
                  <p className="text-xl font-semibold text-slate-900">Sales Booster</p>
                  <p className="text-xs text-muted">Etsy Listing Generator</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span>Signed in as {user.email || `${user.id.slice(0, 8)}...`}</span>
                  <button onClick={() => void manualRefresh()} disabled={loading || authLoading} className={BUTTON_SMALL}>
                    Refresh
                  </button>
                  <button onClick={() => void logout()} disabled={authLoading || loading} className={BUTTON_TERTIARY}>
                    Sign out
                  </button>
                </div>
              </section>
              <section className={`${SECTION_CLASS} flex flex-col overflow-hidden`}>
                {!current ? (
                  <p className="text-sm text-muted">Create or select a listing to start.</p>
                ) : (
                  <div className="flex flex-col gap-3 overflow-y-auto pr-2">
                    {current.chat_history?.map((m, i) => (
                      <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <MessageBubble message={m} />
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section className={SECTION_CLASS}>
                <div className="flex items-stretch gap-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUploadFile(f);
                      if (fileRef.current) fileRef.current.value = '';
                    }}
                  />
                  <button disabled={!current || loading || authLoading} className={BUTTON_PRIMARY} onClick={() => fileRef.current?.click()}>
                    Upload Image
                  </button>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Describe your product..."
                    className={`${INPUT_CLASS} flex-1`}
                    disabled={authLoading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!current || loading || authLoading || !input) return;
                        const msg = input;
                        setInput('');
                        void send('chat', msg);
                      }
                    }}
                  />
                  <button
                    disabled={!current || loading || authLoading || !input}
                    className={BUTTON_PRIMARY}
                    onClick={() => {
                      const msg = input;
                      setInput('');
                      void send('chat', msg);
                    }}
                  >
                    Send
                  </button>
                </div>
              </section>
              {loading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-white/75">
                  <div
                    className="h-11 w-11 animate-spin rounded-full border-4 border-accent/30 border-t-accent"
                    role="status"
                    aria-live="polite"
                    aria-label="Loading"
                  />
                </div>
              )}
            </div>
            <aside className={`${PANEL_CLASS} overflow-y-auto`}>
              <h2 className="mb-3 text-base font-semibold text-slate-900">Listing Assets</h2>
              <div className="flex flex-col gap-3 pr-1">
                <Card title="Title" text={current?.title} onCopy={() => copy(current?.title)} />
                <Card title="Tags" text={current?.tags} onCopy={() => copy(current?.tags)} />
                <Card title="Description" text={current?.description} onCopy={() => copy(current?.description)} />
                <Card title="FAQs" text={current?.faqs} onCopy={() => copy(current?.faqs)} />
              </div>
            </aside>
          </div>
          {notice && <div className={NOTICE_CLASS}>{notice}</div>}
        </>
      )}
    </div>
  );
}

function Card({ title, text, onCopy }: { title: string; text?: string | null; onCopy: () => void }) {
  return (
    <div className={CARD_CLASS}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <button onClick={onCopy} className={BUTTON_TERTIARY_SMALL}>
          Copy
        </button>
      </div>
      {renderRichText(text)}
    </div>
  );
}

function renderRichText(text?: string | null) {
  if (!text) {
    return <span className="text-sm text-muted">—</span>;
  }
  const normalized = text
    .replace(/\[b\]/gi, '**')
    .replace(/\[\/b\]/gi, '**')
    .replace(/\[i\]/gi, '*')
    .replace(/\[\/i\]/gi, '*')
    .replace(/\[u\]|\[center\]|\[size=\d+\]/gi, '')
    .replace(/\[\/u\]|\[\/center\]|\[\/size\]/gi, '');
  return <div className="rich-text" dangerouslySetInnerHTML={{ __html: markdownToHtml(normalized) }} />;
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle2 } from 'lucide-react';

type Choice = 'happy' | 'needs_revisions';

function getMetadataId(): string | null {
  if (typeof window === 'undefined') return null;
  const sp = new URLSearchParams(window.location.search);
  const id = sp.get('metadata_id');
  if (!id || !/^[a-zA-Z0-9_.-]+$/.test(id)) return null;
  return id;
}

function getMenuFileFromReferrer(): string | null {
  if (typeof document === 'undefined') return null;
  const ref = document.referrer;
  if (!ref) return null;
  try {
    const u = new URL(ref);
    const base = u.pathname.split('/').filter(Boolean).pop() ?? null;
    if (!base || !/\.html$/i.test(base)) return null;
    return base;
  } catch {
    return null;
  }
}

async function apiGet(metadataId: string, menuFile: string) {
  const url = new URL('../menu_signoff.php', window.location.href);
  url.searchParams.set('metadata_id', metadataId);
  url.searchParams.set('menu_file', menuFile);
  const r = await fetch(url.toString(), { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as { ok: boolean; data?: { choice: Choice; updatedAt: string } | null };
}

async function apiSet(metadataId: string, menuFile: string, choice: Choice) {
  const url = new URL('../menu_signoff.php', window.location.href);
  const body = new URLSearchParams();
  body.set('metadata_id', metadataId);
  body.set('menu_file', menuFile);
  body.set('choice', choice);
  const r = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    credentials: 'same-origin',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as { ok: boolean; data?: { choice: Choice; updatedAt: string } };
}

export function SignOffPrompt() {
  const metadataId = useMemo(getMetadataId, []);
  const menuFile = useMemo(getMenuFileFromReferrer, []);
  const ready = Boolean(metadataId && menuFile);

  const [choice, setChoice] = useState<Choice | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'saving' | 'error'>('idle');

  const openStructure = () => {
    if (typeof window === 'undefined') return;
    window.parent?.postMessage({ type: 'mjr:openStructure' }, window.location.origin);
  };

  useEffect(() => {
    if (!ready || !metadataId || !menuFile) return;
    setState('loading');
    apiGet(metadataId, menuFile)
      .then((res) => {
        if (res?.ok && res.data?.choice) {
          setChoice(res.data.choice);
          setUpdatedAt(res.data.updatedAt ?? null);
        }
        setState('idle');
      })
      .catch(() => setState('error'));
  }, [ready, metadataId, menuFile]);

  const onSelect = (next: Choice) => {
    if (!ready || !metadataId || !menuFile) return;
    setChoice(next);
    setState('saving');
    apiSet(metadataId, menuFile, next)
      .then((res) => {
        if (res?.ok && res.data?.choice) {
          setChoice(res.data.choice);
          setUpdatedAt(res.data.updatedAt ?? null);
        }
        setState('idle');
      })
      .catch(() => setState('error'));
  };

  if (!ready) return null;

  const isHappy = choice === 'happy';
  const isNeeds = choice === 'needs_revisions';

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-r from-flipdish-muted via-white to-amber-50 shadow-sm">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Quick sign-off</p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">
              Are you happy with your menu?
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">
              If you need changes, add item-level comments in{' '}
              <button
                type="button"
                onClick={openStructure}
                className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 font-semibold text-neutral-900 ring-1 ring-neutral-200 transition hover:bg-neutral-50"
                title="Open Check Menu Structure"
              >
                Check Menu Structure <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
              </button>
              .
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect('happy')}
              disabled={state === 'saving'}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                isHappy
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-neutral-900 ring-1 ring-neutral-200 hover:bg-neutral-50'
              } disabled:opacity-60`}
            >
              Yes, I’m happy
            </button>
            <button
              type="button"
              onClick={() => onSelect('needs_revisions')}
              disabled={state === 'saving'}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                isNeeds
                  ? 'bg-neutral-900 text-white shadow-sm'
                  : 'bg-white text-neutral-900 ring-1 ring-neutral-200 hover:bg-neutral-50'
              } disabled:opacity-60`}
            >
              No, I need revisions
            </button>

            {choice && state !== 'saving' ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600">
                <CheckCircle2 size={14} className={isHappy ? 'text-emerald-600' : 'text-neutral-700'} aria-hidden />
                Saved{updatedAt ? ` · ${new Date(updatedAt).toLocaleString()}` : ''}
              </span>
            ) : state === 'saving' ? (
              <span className="text-xs font-medium text-neutral-500">Saving…</span>
            ) : state === 'error' ? (
              <span className="text-xs font-medium text-red-700">Could not save. Refresh and try again.</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}


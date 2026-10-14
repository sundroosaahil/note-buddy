import { useEffect, useMemo, useRef, useState } from 'react';
import {
  listNotebooks,
  subscribe,
  createNotebook,
  renameNotebook,
  deleteNotebook,
  requestPersistence,
  saveBoard,
} from '../lib/notebooks';
import { loadBoard as loadLegacyBoard } from '../store/db';

/**
 * Front page. Props:
 *   onOpen(id)  - called with a notebook id (new or existing). Wire this to your board view.
 */
export default function HomePage({ onOpen }) {
  const [notebooks, setNotebooks] = useState(() => listNotebooks());
  const [query, setQuery] = useState('');
  const [persisted, setPersisted] = useState(null);
  const [migrating, setMigrating] = useState(true);

  useEffect(() => subscribe(() => setNotebooks(listNotebooks())), []);
  useEffect(() => {
    requestPersistence().then(setPersisted);
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (listNotebooks().length === 0) {
          const legacy = await loadLegacyBoard();
          if (legacy && !cancelled) {
            const restored = createNotebook('My whiteboard');
            await saveBoard(restored.id, legacy, { pageCount: legacy.pages?.length || 1 });
          }
        }
      } catch (error) {
        console.warn('Could not migrate the previous whiteboard', error);
      } finally {
        if (!cancelled) setMigrating(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? notebooks.filter((n) => n.title.toLowerCase().includes(q)) : notebooks;
  }, [notebooks, query]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  const start = () => { if (!migrating) onOpen(createNotebook().id); };

  return (
    <div className="h-full min-h-screen overflow-y-auto bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 h-[28rem] w-[56rem] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl dark:bg-indigo-500/25" />
        <div className="absolute top-60 -right-32 h-80 w-80 rounded-full bg-fuchsia-400/10 blur-3xl dark:bg-fuchsia-500/10" />
      </div>

      <main className="relative z-10 mx-auto max-w-5xl px-5 pb-16 pt-8 sm:px-8">
        <header className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30">
            <PenIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight tracking-tight">Notes Buddy</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Your classroom whiteboard</p>
          </div>
        </header>

        {/* Start new notebook */}
        <button
          onClick={start}
          disabled={migrating}
          className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-fuchsia-600 p-6 text-left text-white shadow-xl shadow-indigo-600/25 ring-1 ring-white/10 transition active:scale-[0.99] hover:shadow-2xl hover:shadow-indigo-600/35 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/60 sm:p-8"
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,.55) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
              maskImage: 'linear-gradient(to left, black, transparent 70%)',
              WebkitMaskImage: 'linear-gradient(to left, black, transparent 70%)',
            }}
          />
          <div className="relative flex items-center gap-5">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur transition group-hover:rotate-90 group-hover:bg-white/25 sm:h-16 sm:w-16">
              <PlusIcon className="h-8 w-8" />
            </span>
            <span className="min-w-0">
              <span className="block text-2xl font-semibold tracking-tight sm:text-3xl">
                Start new notebook
              </span>
              <span className="mt-1 block text-sm text-indigo-100 sm:text-base">
                Opens a blank board. Saves automatically on this device.
              </span>
            </span>
            <ArrowIcon className="ml-auto hidden h-6 w-6 shrink-0 opacity-70 transition group-hover:translate-x-1 sm:block" />
          </div>
        </button>

        {/* Previous classes */}
        <section className="mt-12">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Previous classes</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {notebooks.length === 0
                  ? 'Nothing here yet'
                  : `${notebooks.length} notebook${notebooks.length === 1 ? '' : 's'}`}
              </p>
            </div>
            {notebooks.length > 4 && (
              <label className="relative block w-full sm:w-64">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search classes"
                  className="w-full rounded-xl border border-slate-200 bg-white/80 py-2.5 pl-9 pr-3 text-sm outline-none backdrop-blur placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/15 dark:border-slate-800 dark:bg-slate-900/70"
                />
              </label>
            )}
          </div>

          {notebooks.length === 0 ? (
            <EmptyState />
          ) : filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
              No class matches “{query}”.
            </p>
          ) : (
            <div className="space-y-9">
              {groups.map((g) => (
                <div key={g.label}>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    {g.label}
                  </h3>
                  <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {g.items.map((n) => (
                      <NotebookCard key={n.id} nb={n} onOpen={() => onOpen(n.id)} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-14 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <LockIcon className="h-3.5 w-3.5" />
          <span>
            Stored only in this browser on this device. Nothing is uploaded.
            {persisted === false && ' Tip: install the app to the home screen so the browser never clears it.'}
          </span>
        </footer>
      </main>
    </div>
  );
}

function NotebookCard({ nb, onOpen }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(nb.title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    if (draft.trim() && draft.trim() !== nb.title) renameNotebook(nb.id, draft);
    setEditing(false);
  };

  return (
    <li className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-black/40">
      <button
        onClick={onOpen}
        className="relative block aspect-[16/10] w-full overflow-hidden bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/60 dark:bg-slate-800"
        aria-label={`Open ${nb.title}`}
      >
        {nb.thumbnail ? (
          <img src={nb.thumbnail} alt="" className="h-full w-full bg-white object-cover" draggable="false" />
        ) : (
          <div
            className="grid h-full w-full place-items-center text-slate-300 dark:text-slate-600"
            style={{
              backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          >
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
              Blank board
            </span>
          </div>
        )}
        <span className="absolute inset-0 grid place-items-center bg-indigo-600/0 text-sm font-semibold text-white opacity-0 transition group-hover:bg-indigo-600/55 group-hover:opacity-100">
          Open
        </span>
      </button>

      <div className="flex items-start gap-2 p-4">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  setDraft(nb.title);
                  setEditing(false);
                }
              }}
              className="w-full rounded-lg border border-indigo-400 bg-transparent px-2 py-1 text-sm font-semibold outline-none ring-4 ring-indigo-500/15"
            />
          ) : (
            <h4 className="truncate text-sm font-semibold" title={nb.title}>
              {nb.title}
            </h4>
          )}
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {timeAgo(nb.updatedAt)} · {nb.pageCount} page{nb.pageCount === 1 ? '' : 's'}
          </p>
        </div>

        {confirming ? (
          <div className="flex shrink-0 items-center gap-1 text-xs">
            <button
              onClick={() => deleteNotebook(nb.id)}
              className="rounded-lg bg-rose-600 px-2.5 py-1.5 font-semibold text-white hover:bg-rose-500"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Keep
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 gap-0.5">
            <IconBtn label="Rename" onClick={() => { setDraft(nb.title); setEditing(true); }}>
              <EditIcon className="h-4 w-4" />
            </IconBtn>
            <IconBtn label="Delete" danger onClick={() => setConfirming(true)}>
              <TrashIcon className="h-4 w-4" />
            </IconBtn>
          </div>
        )}
      </div>
    </li>
  );
}

function IconBtn({ label, danger, children, ...rest }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      className={`grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition ${
        danger
          ? 'hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50'
          : 'hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white/50 p-12 text-center backdrop-blur dark:border-slate-700 dark:bg-slate-900/40">
      <svg viewBox="0 0 120 80" className="mx-auto h-24 w-36 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="10" y="8" width="100" height="58" rx="8" />
        <path d="M28 44c10-18 18 10 28-6s16 4 34-8" className="text-indigo-400" stroke="#818cf8" />
        <path d="M40 74h40" />
      </svg>
      <p className="mt-4 font-medium">Your classes will appear here</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Start a notebook above. It is saved as you write.
      </p>
    </div>
  );
}

// --- helpers ------------------------------------------------------------------------

function groupByDay(items) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date());
  const DAY = 86400000;
  const buckets = new Map();
  for (const n of items) {
    const diff = Math.round((today - startOfDay(new Date(n.updatedAt))) / DAY);
    const label =
      diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? 'This week' : diff < 30 ? 'This month'
      : new Date(n.updatedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(n);
  }
  return [...buckets].map(([label, items]) => ({ label, items }));
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function timeAgo(ts) {
  const s = Math.round((ts - Date.now()) / 1000);
  const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.345, 'week'], [12, 'month']];
  let v = s;
  for (const [size, unit] of steps) {
    if (Math.abs(v) < size) return rtf.format(Math.round(v), unit);
    v /= size;
  }
  return rtf.format(Math.round(v), 'year');
}

// --- icons ----------------------------------------------------------------------------

const svg = (path) =>
  function Icon({ className }) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
      </svg>
    );
  };
const PlusIcon = svg(<path d="M12 5v14M5 12h14" />);
const ArrowIcon = svg(<path d="M5 12h14M13 6l6 6-6 6" />);
const SearchIcon = svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
const EditIcon = svg(<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />);
const TrashIcon = svg(<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />);
const LockIcon = svg(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
const PenIcon = svg(<path d="m12 19 7-7 3 3-7 7-3-3ZM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5ZM2 2l7.6 7.6" />);

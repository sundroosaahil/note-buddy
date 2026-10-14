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
import './HomePage.css';

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
    <div className="home-shell">
      <main className="home-main">
        <header className="home-masthead">
          <div className="home-brand">
            <div className="home-brand-mark"><PenIcon className="h-5 w-5" /></div>
            <div><h1>Notes Buddy</h1></div>
          </div>
        </header>

        <section className="home-hero">
          <button onClick={start} disabled={migrating} className="new-notebook-button">
            <span className="new-book-icon"><PlusIcon className="h-5 w-5" /></span>
            <span className="new-book-label"><strong>Start a new notebook</strong><small>Open a blank classroom board</small></span>
            <ArrowIcon className="new-book-arrow h-5 w-5" />
          </button>
        </section>

        <section className="bookshelf-section">
          <div className="bookshelf-heading">
            <h2>Previous classes</h2>
            <span className="bookshelf-count">{notebooks.length ? `${notebooks.length} notebook${notebooks.length === 1 ? '' : 's'}` : ''}</span>
            {notebooks.length > 4 && (
              <label className="home-search">
                <SearchIcon className="h-4 w-4" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search classes"
                  className="home-search-input"
                />
              </label>
            )}
          </div>

          {notebooks.length === 0 ? (
            <EmptyState />
          ) : filtered.length === 0 ? (
            <p className="no-search-results">
              No class matches “{query}”.
            </p>
          ) : (
            <div className="bookshelf-groups">
              {groups.map((g) => (
                <div className="bookshelf-group" key={g.label}>
                  <h3 className="shelf-label">
                    {g.label}
                  </h3>
                  <ul className="notebook-grid">
                    {g.items.map((n, index) => (
                      <NotebookCard key={n.id} nb={n} tone={index % 6} onOpen={() => onOpen(n.id)} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="home-footer">
          <LockIcon className="h-3.5 w-3.5" />
          <span>
            Saved only in this browser on this device.
            {persisted === false && ' Tip: install the app to the home screen so the browser never clears it.'}
          </span>
        </footer>
      </main>
    </div>
  );
}

function NotebookCard({ nb, tone, onOpen }) {
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
    <li className={`notebook-card tone-${tone}`}>
      <button
        onClick={onOpen}
        className="notebook-cover-button"
        aria-label={`Open ${nb.title}`}
      >
        {nb.thumbnail ? (
          <img src={nb.thumbnail} alt="" className="notebook-thumbnail" draggable="false" />
        ) : (
          <div className="notebook-cover-art">
            <span className="cover-spine" />
            <span className="cover-kicker">NOTES BUDDY · CLASS BOOK</span>
            <span className="cover-rule" />
            <span className="cover-title">{nb.title}</span>
            <span className="cover-mark"><PenIcon className="h-5 w-5" /></span>
            <span className="cover-number">{String(nb.pageCount).padStart(2, '0')} PAGES</span>
          </div>
        )}
        <span className="cover-open">Open notebook <ArrowIcon className="h-4 w-4" /></span>
      </button>

      <div className="notebook-card-details">
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
              className="rename-input"
            />
          ) : (
            <h4 className="notebook-title" title={nb.title}>
              {nb.title}
            </h4>
          )}
          <p className="notebook-meta">
            {timeAgo(nb.updatedAt)} · {nb.pageCount} page{nb.pageCount === 1 ? '' : 's'}
          </p>
        </div>

        {confirming ? (
          <div className="notebook-confirm">
            <button
              onClick={() => deleteNotebook(nb.id)}
              className="delete-confirm"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="keep-notebook"
            >
              Keep
            </button>
          </div>
        ) : (
          <div className="notebook-actions">
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
      className={`notebook-icon-button ${danger ? 'is-danger' : ''}`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="empty-bookshelf">
      <div className="empty-book-illustration"><span /><i /><i /><i /></div>
      <p className="empty-title">A shelf with room to grow</p>
      <p className="empty-copy">Your class notebooks will live here. Start one above, and it will be waiting when you return.</p>
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

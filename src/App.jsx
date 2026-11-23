import { useEffect, useMemo, useState, useRef } from 'react';
import {
  ArrowDownToLine, Check, CheckCircle2, ChevronDown,
  CircleAlert, CircleHelp, FileClock,
  LoaderCircle, Play, RefreshCw, RotateCcw, X,
  LayoutDashboard, GraduationCap, Database, Copy, Download,
  Maximize2, Sparkles, Filter, CheckCheck, Eye
} from 'lucide-react';
import { CHECKS, CONCEPTS } from './concepts';
import { api } from './lib/api';
import { checksPassed, completedChecks } from './lib/contracts';
import { cacheRealResults, loadSavedResults } from './lib/savedResults';
import { svgFrameDocument } from './lib/svgPreview';

const CONCEPT_MAP = new Map(CONCEPTS.map((item) => [item.id, item]));

function usd(value) { return value == null ? '—' : `$${value.toFixed(4)}`; }
function tokenCount(value) { return value == null ? '—' : value.toLocaleString('en-GB'); }
function dateLabel(value) {
  if (!value) return 'Not recorded';
  const n = Date.parse(value);
  return Number.isNaN(n) ? 'Not recorded' : new Date(n).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function AtomIcon({ className = "w-10 h-10 text-blue-600" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
      <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(0 12 12)"/>
      <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(60 12 12)"/>
      <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(120 12 12)"/>
    </svg>
  );
}

function SvgThumbnail({ diagram, concept, onOpen }) {
  if (!diagram?.svg) {
    return (
      <div className="relative flex h-[82px] w-[132px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-2 text-center transition-all">
        <span className="text-[10px] font-medium text-slate-400">Not generated</span>
      </div>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(); }}
      className="group relative block h-[82px] w-[132px] cursor-pointer overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-500 hover:shadow-md hover:shadow-blue-500/10 active:translate-y-0"
      aria-label={`View animated diagram of ${concept.name}`}
    >
      <iframe
        title={`${concept.name} preview`}
        tabIndex={-1}
        aria-hidden="true"
        loading="lazy"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={svgFrameDocument(diagram.svg)}
        className="pointer-events-none h-full w-full border-0 rounded-xl"
      />
      <div className="absolute inset-0 bg-blue-900/0 transition-colors duration-200 group-hover:bg-blue-900/5"/>
      <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-slate-900/50 text-white backdrop-blur-xs shadow-xs transition-all duration-200 group-hover:scale-110 group-hover:bg-blue-600">
        <Play size={8} fill="currentColor" className="ml-0.5"/>
      </span>
    </div>
  );
}


function ChecksList({ diagram }) {
  const checkLabels = {
    svg_parse: 'Valid SVG',
    bounds: 'Within ViewBox',
    labels: 'Title & Labels',
    animation: 'Has Animation',
    safety: 'Custom Check'
  };

  if (!diagram) {
    return (
      <div className="space-y-1.5">
        {CHECKS.map(({ id }) => (
          <div key={id} className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-slate-300 text-[10px]">○</span>
            <span>{checkLabels[id] || id}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {CHECKS.map(({ id }) => {
        const entry = diagram.checks[id];
        const passed = entry?.passed;
        return (
          <div
            key={id}
            title={entry?.reason || (passed ? 'Passed' : 'Failed')}
            className={`group/chk flex items-center gap-2 text-[11px] leading-tight transition-colors ${passed ? 'text-slate-700' : 'text-rose-600 font-medium'}`}
          >
            <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] transition-transform duration-150 group-hover/chk:scale-110 ${passed ? 'bg-emerald-500 text-white shadow-xs' : 'bg-rose-500 text-white shadow-xs'}`}>
              {passed ? <Check size={10} strokeWidth={3}/> : <X size={10} strokeWidth={3}/>}
            </span>
            <span className="font-normal">{checkLabels[id] || id}</span>
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('review');
  const [diagrams, setDiagrams] = useState(loadSavedResults);
  const [reviews, setReviews] = useState({});
  const [draftNotes, setDraftNotes] = useState({});
  const [saveStates, setSaveStates] = useState({});
  const [selectedId, setSelectedId] = useState(CONCEPTS[0].id);
  const [busyId, setBusyId] = useState(null);
  const [reviewBusyId, setReviewBusyId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState('unchecked');
  const [toast, setToast] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalTab, setModalTab] = useState('preview');
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef(null);

  const byId = useMemo(() => new Map(diagrams.map((item) => [item.id, item])), [diagrams]);
  const withCost = diagrams.filter((d) => d.usage.estimatedCostUsd != null);
  const totalCost = withCost.reduce((sum, item) => sum + item.usage.estimatedCostUsd, 0);

  // Review progress calculation
  const approvedCount = Object.values(reviews).filter((r) => r.status === 'approved').length;
  const rejectedCount = Object.values(reviews).filter((r) => r.status === 'rejected').length;
  const totalReviewed = approvedCount + rejectedCount;
  const progressPercent = Math.round((totalReviewed / CONCEPTS.length) * 100);

  const visibleConcepts = CONCEPTS.filter((concept) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!concept.name.toLowerCase().includes(q) && !concept.subject.toLowerCase().includes(q)) return false;
    }
    const review = reviews[concept.id];
    if (filter === 'approved') return review?.status === 'approved';
    if (filter === 'rejected') return review?.status === 'rejected';
    if (filter === 'pending') return !review || review.status === 'pending';
    if (filter === 'failed') return !!byId.get(concept.id) && !checksPassed(byId.get(concept.id));
    return true;
  });

  useEffect(() => {
    let active = true;
    api.reviews()
      .then((list) => {
        if (!active) return;
        const mapped = Object.fromEntries(list.map((item) => [item.conceptId, item]));
        setReviews(mapped);
        setDraftNotes(Object.fromEntries(list.map((item) => [item.conceptId, item.note])));
      })
      .catch((error) => {
        if (!active) return;
        showToast('error', `Could not load saved reviews: ${error.message}`);
      });
    return () => { active = false; };
  }, []);

  function showToast(kind, text) {
    setToast({ kind, text });
    setTimeout(() => {
      setToast((current) => (current?.text === text ? null : current));
    }, 4500);
  }

  function updateResults(next) {
    setDiagrams(next);
    cacheRealResults(next);
  }

  async function syncResults() {
    setSyncing(true);
    try {
      const results = await api.results();
      updateResults(results);
      showToast('success', 'Saved results synchronized from database.');
    } catch (error) {
      showToast('error', `Could not synchronize: ${error.message}`);
    } finally { setSyncing(false); }
  }

  async function checkConnection() {
    setChecking(true);
    try {
      const response = await api.health();
      if (response.status !== 'ok') throw new Error('Health check failed');
      setConnection('connected');
      showToast('success', 'Backend API is connected and healthy.');
    } catch (error) {
      setConnection('offline');
      showToast('error', `Connection failed: ${error.message}`);
    } finally { setChecking(false); }
  }

  async function generate(conceptId = selectedId) {
    setBusyId(conceptId);
    try {
      const { diagram, review } = await api.generate(conceptId);
      if (diagram.id !== conceptId) throw new Error('Backend returned wrong concept');
      const next = CONCEPTS.map((c) => c.id === conceptId ? diagram : byId.get(c.id)).filter(Boolean);
      updateResults(next);
      if (review) {
        setReviews((current) => ({ ...current, [conceptId]: review }));
        setDraftNotes((current) => ({ ...current, [conceptId]: review.note }));
      }
      setSaveStates((current) => ({ ...current, [conceptId]: 'idle' }));
      showToast(
        checksPassed(diagram) ? 'success' : 'error',
        checksPassed(diagram)
          ? `${CONCEPT_MAP.get(conceptId).name} generated & passed 5/5 checks!`
          : `${CONCEPT_MAP.get(conceptId).name} generated with validation issues.`
      );
    } catch (error) {
      showToast('error', `Generation failed: ${error.message}`);
    } finally { setBusyId(null); }
  }

  function onNote(id, value) {
    setDraftNotes((current) => ({ ...current, [id]: value }));
    setSaveStates((current) => ({ ...current, [id]: 'idle' }));
  }

  async function saveReview(id, status) {
    if (!byId.get(id)) return;
    setReviewBusyId(id);
    setSaveStates((current) => ({ ...current, [id]: 'saving' }));
    try {
      const saved = await api.saveReview(id, { status, note: draftNotes[id] || '' });
      setReviews((current) => ({ ...current, [id]: saved }));
      setDraftNotes((current) => ({ ...current, [id]: saved.note }));
      setSaveStates((current) => ({ ...current, [id]: 'saved' }));
      showToast('success', `Saved review for ${CONCEPT_MAP.get(id).name}`);
    } catch (error) {
      setSaveStates((current) => ({ ...current, [id]: 'error' }));
      showToast('error', `Review not saved: ${error.message}`);
    } finally { setReviewBusyId(null); }
  }

  function downloadJson() {
    const snapshot = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      results: CONCEPTS.map((c) => byId.get(c.id)).filter(Boolean)
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a');
    element.href = url; element.download = 'results.json';
    document.body.appendChild(element); element.click(); element.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('success', 'Exported results.json');
  }

  function copySvgCode(svgString) {
    if (!svgString) return;
    navigator.clipboard.writeText(svgString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function reloadPreviewIframe() {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = iframeRef.current.srcdoc;
    }
  }

  useEffect(() => {
    if (!previewId) return;
    const closeOnEscape = (e) => { if (e.key === 'Escape') setPreviewId(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [previewId]);

  const previewDiagram = previewId ? byId.get(previewId) : null;
  const previewConcept = previewId ? CONCEPT_MAP.get(previewId) : null;

  return (
    <div className="flex min-h-screen bg-[#f3f5f9] text-slate-800 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* 1. Left Sidebar with fluid hover states */}
      <aside className="hidden w-64 flex-col justify-between border-r border-slate-200/90 bg-[#f8fafc] p-6 lg:flex">
        <div>
          {/* Brand Logo & Name */}
          <div className="flex flex-col items-center text-center pb-8 border-b border-slate-200/80">
            <div className="transition-transform duration-300 hover:rotate-12 cursor-pointer">
              <AtomIcon className="w-12 h-12 text-blue-600"/>
            </div>
            <h2 className="mt-2 text-[15px] font-bold text-slate-800 leading-tight">Science<br/>Diagram Maker</h2>
          </div>

          {/* Navigation Links with smooth pill indicator */}
          <nav className="mt-6 space-y-1.5" aria-label="Sidebar Navigation">
            <button
              type="button"
              onClick={() => setTab('review')}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-[13px] font-semibold transition-all duration-200 ${
                tab === 'review'
                  ? 'bg-blue-50 text-blue-600 shadow-sm translate-x-1'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard size={18} className={tab === 'review' ? 'text-blue-600' : 'text-slate-400'}/>
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('logs')}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-[13px] font-semibold transition-all duration-200 ${
                tab === 'logs'
                  ? 'bg-blue-50 text-blue-600 shadow-sm translate-x-1'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
              }`}
            >
              <FileClock size={18} className={tab === 'logs' ? 'text-blue-600' : 'text-slate-400'}/>
              <span>Logs</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('about')}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-[13px] font-semibold transition-all duration-200 ${
                tab === 'about'
                  ? 'bg-blue-50 text-blue-600 shadow-sm translate-x-1'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
              }`}
            >
              <CircleHelp size={18} className={tab === 'about' ? 'text-blue-600' : 'text-slate-400'}/>
              <span>About</span>
            </button>
          </nav>
        </div>

        {/* Bottom Banner matching reference */}
        <div className="rounded-2xl border border-blue-100/80 bg-gradient-to-b from-blue-50/70 to-blue-50/40 p-4 text-center shadow-xs transition hover:shadow-sm">
          <div className="mx-auto grid h-8 w-8 place-items-center rounded-xl bg-blue-600 text-white shadow-xs">
            <GraduationCap size={16}/>
          </div>
          <p className="mt-2 text-[12px] font-bold text-slate-800">AI-Powered<br/>Science Learning</p>
          <p className="mt-0.5 text-[10px] font-medium text-slate-500">For GCSE Students</p>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header matching reference */}
        <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 px-6 py-4 backdrop-blur-md sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="lg:hidden">
                <AtomIcon className="w-10 h-10 text-blue-600"/>
              </div>
              <div className="hidden lg:block transition-transform hover:rotate-6 duration-300">
                <AtomIcon className="w-11 h-11 text-blue-600"/>
              </div>
              <div>
                <h1 className="text-[20px] font-extrabold tracking-tight text-slate-900 sm:text-[23px]">Science Diagram Maker</h1>
                <p className="text-[12px] text-slate-500">Review AI-generated animated diagrams for key scientific concepts</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Live Status Badge with pulsing emerald dot */}
              <button
                type="button"
                onClick={checkConnection}
                disabled={checking}
                className="group flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200/70 hover:bg-emerald-100 transition active:scale-95"
                title="Click to verify API connection"
              >
                {checking ? (
                  <LoaderCircle size={10} className="animate-spin text-emerald-600"/>
                ) : (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"/>
                  </span>
                )}
                <span>Live</span>
              </button>

              {/* User Avatar Circle */}
              <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-700 border border-slate-200 shadow-xs cursor-default">
                AU
              </div>

              {/* Concept selector for Generate */}
              <div className="relative">
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-[12px] font-semibold text-slate-700 shadow-xs hover:border-slate-300 focus:border-blue-500 focus:outline-none transition"
                  aria-label="Select concept to generate"
                >
                  {CONCEPTS.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-3 text-slate-400"/>
              </div>

              {/* Generate New Diagram Button with smooth hover and active scale */}
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => generate(selectedId)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-[12px] font-bold text-white shadow-sm transition-all duration-150 hover:bg-blue-700 hover:shadow-md hover:shadow-blue-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busyId ? <LoaderCircle size={14} className="animate-spin"/> : <Play size={12} fill="currentColor"/>}
                <span>{busyId ? 'Generating…' : 'Generate New Diagram'}</span>
              </button>

              {/* Sync & Export icon buttons */}
              <button
                type="button"
                onClick={syncResults}
                disabled={syncing}
                title="Sync saved results from database"
                className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition active:scale-90 disabled:opacity-40 shadow-xs"
              >
                <RefreshCw size={13} className={syncing ? 'animate-spin text-blue-600' : ''}/>
              </button>
              <button
                type="button"
                onClick={downloadJson}
                disabled={!diagrams.length}
                title="Export results.json"
                className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition active:scale-90 disabled:opacity-40 shadow-xs"
              >
                <ArrowDownToLine size={13}/>
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Navigation bar */}
        <div className="flex border-b border-slate-200 bg-white px-6 py-2.5 gap-4 lg:hidden">
          <button type="button" onClick={() => setTab('review')} className={`text-[12px] font-bold ${tab === 'review' ? 'text-blue-600' : 'text-slate-500'}`}>Dashboard</button>
          <button type="button" onClick={() => setTab('logs')} className={`text-[12px] font-bold ${tab === 'logs' ? 'text-blue-600' : 'text-slate-500'}`}>Logs</button>
          <button type="button" onClick={() => setTab('about')} className={`text-[12px] font-bold ${tab === 'about' ? 'text-blue-600' : 'text-slate-500'}`}>About</button>
        </div>

        {/* Content Body */}
        <main className="flex-1 p-6 sm:p-10">
          {/* Interactive Review Progress & Filter Bar */}
          {tab === 'review' && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              {/* Interactive Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: `All (${CONCEPTS.length})` },
                  { id: 'pending', label: 'Pending' },
                  { id: 'approved', label: `Approved (${approvedCount})` },
                  { id: 'rejected', label: `Rejected (${rejectedCount})` }
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-all duration-150 ${
                      filter === id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Progress Summary */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
                  <CheckCheck size={14} className="text-emerald-600"/>
                  <span>Reviewed: <strong className="text-slate-800">{totalReviewed} of {CONCEPTS.length}</strong> ({progressPercent}%)</span>
                </div>
                <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: Dashboard Review Table */}
          {tab === 'review' && (
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition-shadow hover:shadow-md">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 bg-white text-[12px] font-semibold text-slate-500">
                      <th className="py-3.5 pl-5 pr-3 w-[18%]">Concept</th>
                      <th className="py-3.5 px-3 w-[18%]">Diagram Preview</th>
                      <th className="py-3.5 px-3 w-[18%]">Validation Checks</th>
                      <th className="py-3.5 px-2 w-[10%]">Cost</th>
                      <th className="py-3.5 px-2 w-[8%]">Retries</th>
                      <th className="py-3.5 px-3 w-[14%] text-center">Your Review</th>
                      <th className="py-3.5 pl-3 pr-5 w-[14%]">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleConcepts.map((concept, index) => {
                      const item = byId.get(concept.id);
                      const review = reviews[concept.id];
                      const status = review?.status || 'pending';
                      const draftNote = draftNotes[concept.id] || '';
                      const dirty = draftNote !== (review?.note || '');
                      const isApproved = status === 'approved';
                      const isRejected = status === 'rejected';

                      return (
                        <tr key={concept.id} className="transition-colors duration-150 hover:bg-blue-50/20">
                          {/* Concept Name */}
                          <td className="py-4 pl-5 pr-3 align-top">
                            <p className="text-[13px] font-bold text-slate-800 leading-tight">
                              {index + 1}. {concept.name}
                            </p>
                            <p className="mt-0.5 text-[10px] font-medium text-slate-400">{concept.subject}</p>
                            <button
                              type="button"
                              onClick={() => generate(concept.id)}
                              disabled={Boolean(busyId)}
                              className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition active:scale-95 disabled:opacity-40"
                            >
                              {busyId === concept.id ? <LoaderCircle size={10} className="animate-spin"/> : <RotateCcw size={10}/>}
                              <span>{busyId === concept.id ? 'Generating…' : 'Regenerate'}</span>
                            </button>
                          </td>

                          {/* Diagram Preview */}
                          <td className="py-4 px-3 align-top">
                            <SvgThumbnail diagram={item} concept={concept} onOpen={() => setPreviewId(concept.id)}/>
                          </td>

                          {/* Validation Checks */}
                          <td className="py-4 px-3 align-top">
                            <ChecksList diagram={item}/>
                          </td>

                          {/* Cost */}
                          <td className="py-4 px-2 align-top">
                            <span className="mono text-[12px] font-semibold text-slate-800">
                              {usd(item?.usage.estimatedCostUsd)}
                            </span>
                          </td>

                          {/* Retries */}
                          <td className="py-4 px-2 align-top">
                            <span className="mono text-[12px] font-semibold text-slate-700">
                              {item?.retryCount ?? 0}
                            </span>
                          </td>

                          {/* Your Review Buttons */}
                          <td className="py-4 px-3 align-top">
                            <div className="flex flex-col gap-1 w-[98px] mx-auto">
                              <button
                                type="button"
                                disabled={!item || reviewBusyId === concept.id || !checksPassed(item)}
                                onClick={() => saveReview(concept.id, 'approved')}
                                className={`flex items-center justify-center gap-1 rounded-xl py-1.5 px-2.5 text-[11px] font-semibold transition-all duration-150 border shadow-xs active:scale-95 ${
                                  isApproved
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-1 ring-emerald-300'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                              >
                                <Check size={11} strokeWidth={2.5}/>
                                <span>Approved</span>
                              </button>

                              <button
                                type="button"
                                disabled={!item || reviewBusyId === concept.id}
                                onClick={() => saveReview(concept.id, 'rejected')}
                                className={`flex items-center justify-center rounded-xl py-1.5 px-2.5 text-[11px] font-semibold transition-all duration-150 border shadow-xs active:scale-95 ${
                                  isRejected
                                    ? 'bg-rose-50 text-rose-700 border-rose-300 ring-1 ring-rose-300'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-rose-300 hover:bg-rose-50/40'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                              >
                                <span>Reject</span>
                              </button>
                            </div>
                          </td>

                          {/* Note input with auto-save */}
                          <td className="py-4 pl-3 pr-5 align-top">
                            <div className="w-full min-w-[130px]">
                              <input
                                type="text"
                                maxLength={1000}
                                disabled={!item || reviewBusyId === concept.id}
                                value={draftNote}
                                onChange={(e) => onNote(concept.id, e.target.value)}
                                onBlur={() => { if (dirty) saveReview(concept.id, status); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' && dirty) saveReview(concept.id, status); }}
                                placeholder="Add note (optional)..."
                                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 placeholder:text-slate-400 shadow-xs transition-all duration-150 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                              />
                              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                                <span>
                                  {saveStates[concept.id] === 'saving' ? (
                                    <span className="text-blue-600 font-medium">Saving…</span>
                                  ) : dirty ? (
                                    <span className="text-amber-600 font-medium">● Enter to save</span>
                                  ) : saveStates[concept.id] === 'saved' ? (
                                    <span className="text-emerald-600 font-medium">✓ Saved</span>
                                  ) : ''}
                                </span>
                                {dirty && (
                                  <button
                                    type="button"
                                    onClick={() => saveReview(concept.id, status)}
                                    className="font-bold text-blue-600 hover:text-blue-800 transition"
                                  >
                                    Save
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>


              {/* Bottom Info Bar matching design reference */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/60 px-6 py-4 text-[12px]">
                <div className="flex items-center gap-2 text-slate-600">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-blue-600 text-white text-[10px] font-bold">i</span>
                  <span>Results are saved automatically. You can refresh the page without losing your reviews.</span>
                </div>
                <div className="flex items-center gap-2 font-semibold text-slate-700">
                  <Database size={14} className="text-blue-600"/>
                  <span className="mono">Total Cost: ${totalCost.toFixed(4)}</span>
                  <span className="text-slate-300">|</span>
                  <span>{diagrams.length} Diagrams</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Generation Logs */}
          {tab === 'logs' && (
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[16px] font-bold text-slate-800">Generation Audit Logs</h2>
                  <p className="mt-1 text-[12px] text-slate-500">Real Gemini generation metrics, token counts, and cost breakdown.</p>
                </div>
                <span className="rounded-xl bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-700 border border-blue-200/60">
                  gemini-2.5-flash
                </span>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                      <th className="py-3 px-4">Concept</th>
                      <th className="py-3 px-4">Model</th>
                      <th className="py-3 px-4">Input Tokens</th>
                      <th className="py-3 px-4">Output Tokens</th>
                      <th className="py-3 px-4">Cost (USD)</th>
                      <th className="py-3 px-4">Retries</th>
                      <th className="py-3 px-4">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {CONCEPTS.map((concept) => {
                      const d = byId.get(concept.id);
                      return (
                        <tr key={concept.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-800">{concept.name}</td>
                          <td className="mono py-3.5 px-4 text-slate-600">{d?.usage.model || '—'}</td>
                          <td className="mono py-3.5 px-4 text-slate-600">{tokenCount(d?.usage.inputTokens)}</td>
                          <td className="mono py-3.5 px-4 text-slate-600">{tokenCount(d?.usage.outputTokens)}</td>
                          <td className="mono py-3.5 px-4 font-semibold text-slate-900">{usd(d?.usage.estimatedCostUsd)}</td>
                          <td className="mono py-3.5 px-4 text-slate-600">
                            {d?.retryCount ?? 0}
                            <span className="text-[10px] text-slate-400 ml-1.5">({d?.validationRetryCount ?? 0} val / {d?.apiRetryCount ?? 0} api)</span>
                          </td>
                          <td className="mono py-3.5 px-4 text-slate-400">{dateLabel(d?.generatedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: About System Architecture */}
          {tab === 'about' && (
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm p-8">
              <h2 className="text-[18px] font-bold text-slate-800">About Science Diagram Maker</h2>
              <p className="mt-2 text-[13px] text-slate-600 leading-relaxed max-w-2xl">
                Built for Udhi Technologies to generate, validate, and review animated science diagrams for UK GCSE students. Diagrams are rendered using SVG and CSS/SMIL animations, checked against five independent code validators, and persisted in a durable database.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 transition hover:shadow-xs">
                  <span className="mono text-[11px] font-bold text-blue-600">01</span>
                  <h3 className="mt-1.5 font-bold text-[14px] text-slate-800">Gemini Generation</h3>
                  <p className="mt-1.5 text-[12px] text-slate-500 leading-relaxed">Autonomous SVG generation with exponential backoff and jitter on 429/503.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 transition hover:shadow-xs">
                  <span className="mono text-[11px] font-bold text-blue-600">02</span>
                  <h3 className="mt-1.5 font-bold text-[14px] text-slate-800">Code Validation</h3>
                  <p className="mt-1.5 text-[12px] text-slate-500 leading-relaxed">5-point validation: XML parsing, bounds, title & labels, animation, and safety.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 transition hover:shadow-xs">
                  <span className="mono text-[11px] font-bold text-blue-600">03</span>
                  <h3 className="mt-1.5 font-bold text-[14px] text-slate-800">Durable Review</h3>
                  <p className="mt-1.5 text-[12px] text-slate-500 leading-relaxed">Human approvals and notes persisted across browser and server restarts.</p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Floating Interactive Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[12px] font-semibold shadow-xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 ${
            toast.kind === 'error'
              ? 'bg-rose-900/90 text-white border border-rose-700/50'
              : 'bg-slate-900/90 text-white border border-slate-700/50'
          }`}
        >
          {toast.kind === 'error' ? <CircleAlert size={16} className="text-rose-400"/> : <CheckCircle2 size={16} className="text-emerald-400"/>}
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-2 rounded p-0.5 hover:bg-white/10"><X size={14}/></button>
        </div>
      )}

      {/* Enhanced Interactive Inspection Modal */}
      {previewId && previewConcept && (
        <div
          role="presentation"
          onMouseDown={(e) => { if (e.currentTarget === e.target) setPreviewId(null); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-title"
            className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl transition-all"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                  {previewConcept.subject}
                </span>
                <h2 id="preview-title" className="mt-1 text-[20px] font-bold text-slate-900">{previewConcept.name}</h2>
                <p className="text-[12px] text-slate-500 mt-0.5 max-w-xl">{previewConcept.prompt}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={reloadPreviewIframe}
                  title="Replay animation"
                  className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 transition active:scale-90"
                >
                  <RotateCcw size={16}/>
                </button>
                <button
                  type="button"
                  onClick={() => copySvgCode(previewDiagram?.svg)}
                  title="Copy SVG code"
                  className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 transition active:scale-90"
                >
                  {copied ? <Check size={16} className="text-emerald-600"/> : <Copy size={16}/>}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setPreviewId(null)}
                  aria-label="Close dialog"
                  className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition active:scale-90"
                >
                  <X size={16}/>
                </button>
              </div>
            </div>

            {/* Modal View Selector */}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setModalTab('preview')}
                className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ${
                  modalTab === 'preview' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Animation View
              </button>
              <button
                type="button"
                onClick={() => setModalTab('checks')}
                className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ${
                  modalTab === 'checks' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Validation Breakdown (5/5)
              </button>
              <button
                type="button"
                onClick={() => setModalTab('code')}
                className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ${
                  modalTab === 'code' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                SVG Source
              </button>
            </div>

            {/* Modal Body */}
            <div className="mt-4">
              {modalTab === 'preview' && (
                <div className="frame-canvas flex h-[380px] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-inner">
                  <iframe
                    ref={iframeRef}
                    title={`${previewConcept.name} full view`}
                    sandbox=""
                    referrerPolicy="no-referrer"
                    srcDoc={svgFrameDocument(previewDiagram?.svg)}
                    className="h-full w-full border-0 rounded-xl"
                  />
                </div>
              )}

              {modalTab === 'checks' && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 space-y-3 max-h-[380px] overflow-y-auto">
                  {CHECKS.map((check) => {
                    const entry = previewDiagram?.checks[check.id];
                    const passed = entry?.passed;
                    return (
                      <div key={check.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[13px] text-slate-800">{check.label}</span>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {passed ? <Check size={12}/> : <X size={12}/>}
                            {passed ? 'Passed' : 'Failed'}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-slate-500">{entry?.reason || 'Validation completed successfully.'}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {modalTab === 'code' && (
                <div className="relative max-h-[380px] overflow-auto rounded-2xl border border-slate-800 bg-slate-900 p-4 text-[11px] font-mono text-slate-200">
                  <pre>{previewDiagram?.svg || 'No SVG available'}</pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-100">
              <span className="font-medium text-emerald-700">✓ Sandboxed iframe rendering with CSP isolation</span>
              <span className="mono">Generated: {dateLabel(previewDiagram?.generatedAt)}</span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;

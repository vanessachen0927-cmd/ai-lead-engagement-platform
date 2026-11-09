import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Lead = { id: number; name: string; email: string; source: string; message: string; score: number; reason: string; status: string; createdAt: string };
type Conversation = { id: number; leadId: number; direction: string; body: string; deliveryStatus: string; createdAt: string };
type Suggestion = { suggestion: string; reason: string; mode: string };
type Preview = { scheduledAt: string; body: string; mode: string; sendsExternally: boolean };
type Followup = { id: number; leadId: number; body: string; scheduledAt: string; status: string };
type Status = 'all' | 'new' | 'qualified' | 'contacted' | 'converted' | 'lost';
const statuses: Exclude<Status, 'all'>[] = ['new', 'qualified', 'contacted', 'converted', 'lost'];

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: 'same-origin' });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`${response.status} ${response.statusText}${details ? `: ${details}` : ''}`);
  }
  return await response.json() as T;
}
function readableDate(iso: string) { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
function percent(a: number, b: number) { return b ? `${Math.round(a / b * 100)}%` : '0%'; }

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [conversation, setConversation] = useState<Conversation[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [delayHours, setDelayHours] = useState(24);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Status>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('website');
  const [message, setMessage] = useState('');
  const [followupBody, setFollowupBody] = useState('Thanks for your interest. Would you like to schedule a consultation?');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    try {
      const data = await jsonRequest<Lead[]>('/api/leads');
      setLeads(data);
      setError('');
    } catch (e) { setError(`Could not load leads: ${String(e)}`); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    jsonRequest<{ authenticated: boolean }>('/auth/me')
      .then(() => setAuthenticated(true))
      .catch(() => setAuthenticated(false))
      .finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => { if (authenticated) void refresh(); }, [authenticated]);
  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setAuthError('');
    try {
      await jsonRequest('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      setPassword(''); setAuthenticated(true);
    } catch (e) { setAuthError(`Login failed: ${String(e)}`); }
  }
  async function signOut() {
    try { await jsonRequest('/auth/logout', { method: 'POST' }); }
    finally { setAuthenticated(false); setLeads([]); setSelectedId(null); setLoading(true); }
  }
  useEffect(() => {
    if (selectedId === null) { setFollowups([]); setConversation([]); setSuggestion(null); setPreview(null); return; }
    let active = true;
    jsonRequest<Followup[]>(`/api/leads/${selectedId}/followups`)
      .then(data => { if (active) setFollowups(data); })
      .catch(e => { if (active) setError(`Could not load follow-ups: ${String(e)}`); });
    jsonRequest<Conversation[]>(`/api/leads/${selectedId}/messages`)
      .then(data => { if (active) setConversation(data); })
      .catch(e => { if (active) setError(`Could not load conversation: ${String(e)}`); });
    setSuggestion(null); setPreview(null);
    return () => { active = false; };
  }, [selectedId]);

  const selected = leads.find(lead => lead.id === selectedId) ?? null;
  const sources = useMemo(() => Array.from(new Set(leads.map(l => l.source))).sort(), [leads]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = leads.filter(l => (filter === 'all' || l.status === filter)
      && (sourceFilter === 'all' || l.source === sourceFilter)
      && (!needle || [l.name, l.email, l.source, l.message].some(v => v.toLowerCase().includes(needle))));
    return [...matches].sort((a, b) => sort === 'highest' ? b.score - a.score
      : sort === 'lowest' ? a.score - b.score
      : sort === 'oldest' ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [leads, filter, sourceFilter, query, sort]);
  const counts = useMemo(() => Object.fromEntries(statuses.map(s => [s, leads.filter(l => l.status === s).length])) as Record<Exclude<Status, 'all'>, number>, [leads]);
  const qualified = counts.qualified + counts.contacted + counts.converted;
  const upcoming = followups.filter(f => new Date(f.scheduledAt).getTime() > Date.now()).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const lead = await jsonRequest<Lead>('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, source, message }) });
      setName(''); setEmail(''); setMessage(''); setSelectedId(lead.id);
      setNotice(`${lead.name} added and scored ${lead.score}/100`);
      await refresh();
    } catch (e) { setError(`Could not create lead: ${String(e)}`); }
    finally { setBusy(false); }
  }
  async function updateStatus(value: string) {
    if (!selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await jsonRequest<Lead>(`/api/leads/${selected.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: value }) });
      await refresh(); setNotice('Lead status updated');
    } catch (e) { setError(`Could not update status: ${String(e)}`); }
    finally { setBusy(false); }
  }
  async function schedule(e: React.FormEvent) {
    e.preventDefault(); if (!selected || !date) return;
    const time = new Date(date);
    if (Number.isNaN(time.getTime()) || time.getTime() <= Date.now()) { setError('Choose a future date and time.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await jsonRequest<Followup>(`/api/leads/${selected.id}/followups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduledAt: time.toISOString(), body: followupBody }) });
      const data = await jsonRequest<Followup[]>(`/api/leads/${selected.id}/followups`);
      setFollowups(data); setDate(''); setNotice('Follow-up saved. Demo mode: no message was sent.');
    } catch (e) { setError(`Could not schedule follow-up: ${String(e)}`); }
    finally { setBusy(false); }
  }

  async function saveMessage(e: React.FormEvent) {
    e.preventDefault(); if (!selected || !messageBody.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await jsonRequest<Conversation>(`/api/leads/${selected.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, body: messageBody })
      });
      setConversation(await jsonRequest<Conversation[]>(`/api/leads/${selected.id}/messages`));
      setMessageBody(''); setSuggestion(null);
      setNotice(direction === 'outbound' ? 'Outbound draft saved. No message sent.' : 'Inbound message recorded.');
    } catch (e) { setError(`Could not save conversation: ${String(e)}`); }
    finally { setBusy(false); }
  }
  async function generateSuggestion() {
    if (!selected) return;
    setBusy(true); setError(''); setNotice('');
    try { setSuggestion(await jsonRequest<Suggestion>(`/api/leads/${selected.id}/suggest`, { method: 'POST' })); }
    catch (e) { setError(`Could not generate suggestion: ${String(e)}`); }
    finally { setBusy(false); }
  }
  async function previewRule() {
    if (!selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      setPreview(await jsonRequest<Preview>(`/api/leads/${selected.id}/automation/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delayHours })
      }));
    } catch (e) { setError(`Could not preview rule: ${String(e)}`); }
    finally { setBusy(false); }
  }
  async function applyRule() {
    if (!selected || !preview) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await jsonRequest<Followup>(`/api/leads/${selected.id}/automation/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delayHours })
      });
      setFollowups(await jsonRequest<Followup[]>(`/api/leads/${selected.id}/followups`));
      setPreview(null); setNotice('Follow-up created in demo mode. Nothing was sent.');
    } catch (e) { setError(`Could not apply automation: ${String(e)}`); }
    finally { setBusy(false); }
  }

  if (authLoading) return <div className="auth-screen"><p>Checking session…</p></div>;
  if (!authenticated) return <div className="auth-screen"><form className="auth-card" onSubmit={signIn}>
    <div className="eyebrow">LEADFLOW · SECURE WORKSPACE</div><h1>Sign in</h1>
    <p>Portfolio demo authentication</p>
    <label>Admin password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={1}/></label>
    <button className="primary" type="submit">Sign in</button>
    {authError && <div role="alert" className="alert error">{authError}</div>}
  </form></div>;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon">✦</span><span>LEAD<span className="accent">FLOW</span><small>ENGAGEMENT STUDIO</small></span></div>
      <div className="sidebar-label">WORKSPACE</div>
      <div className="nav-active">▦ <span>Overview</span></div>
      <div className="nav-sub">◎ Lead pipeline</div>
      <div className="nav-sub">◷ Follow-ups</div>
      <div className="sidebar-bottom"><span className="online-dot"/> Local demo environment <small>ASP.NET Core · React · Python</small></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> Overview</div><div className="top-actions"><span className="demo-tag">DEMO MODE</span><button className="ghost" onClick={() => void refresh()}>↻ Refresh</button><button className="ghost" onClick={() => void signOut()}>Sign out</button></div></header>
      <main className="content">
        <div className="page-heading"><div><div className="eyebrow">CUSTOMER INTELLIGENCE</div><h1>Lead engagement <span>overview</span></h1><p>Manage inbound leads, qualification, and follow-up workflows in one place.</p></div><div className="date-label">LOCAL PORTFOLIO DEMO</div></div>
        <section className="metric-grid">
          <article className="metric"><div className="metric-top">Total leads <span>▤</span></div><strong>{leads.length}</strong><small>Across all sources</small></article>
          <article className="metric"><div className="metric-top">Qualified & beyond <span>✧</span></div><strong>{qualified}</strong><small>{percent(qualified, leads.length)} of all leads</small></article>
          <article className="metric"><div className="metric-top">Converted <span>↗</span></div><strong>{counts.converted}</strong><small>{percent(counts.converted, leads.length)} conversion rate</small></article>
          <article className="metric"><div className="metric-top">Average lead score <span>◈</span></div><strong>{leads.length ? Math.round(leads.reduce((sum, l) => sum + l.score, 0) / leads.length) : 0}<span className="metric-unit">/100</span></strong><small>Rule-based qualification</small></article>
        </section>
        <section className="main-grid">
          <article className="panel pipeline-panel"><div className="panel-heading"><div><h2>Conversion pipeline</h2><p>Live breakdown by lead status</p></div><span className="small-chip">{leads.length} total</span></div>
            <div className="pipeline-bars">{statuses.map(s => <div key={s} className="pipeline-row"><div className="pipeline-row-header"><span className="capitalize">{s}</span><b>{counts[s]}</b></div><div className="track"><div className={`fill fill-${s}`} style={{ width: `${leads.length ? 100 * counts[s] / leads.length : 0}%` }}/></div></div>)}</div>
          </article>
          <article className="panel capture-panel"><div className="panel-heading"><div><h2>Capture a lead</h2><p>Automatically evaluate lead intent</p></div><span className="small-chip">+ NEW</span></div>
            <form onSubmit={submit} className="capture-form"><div className="two-fields"><label>Full name<input required value={name} onChange={e => setName(e.target.value)} placeholder="Alex Johnson" /></label><label>Email address<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="alex@example.com" /></label></div><label>Lead source<select value={source} onChange={e => setSource(e.target.value)}><option value="website">Website</option><option value="google">Google</option><option value="meta">Meta</option><option value="bing">Bing</option></select></label><label>Message<textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="Tell us what you're looking for..." /></label><button disabled={busy} className="primary">{busy ? 'Working…' : 'Create & qualify lead'} <span>→</span></button></form>
          </article>
        </section>
        <section className="panel leads-panel"><div className="panel-heading"><div><h2>Lead management</h2><p>Find, prioritize and update your leads</p></div><span className="small-chip">{filtered.length} shown</span></div>
          <div className="filters"><input aria-label="Search leads" value={query} onChange={e => setQuery(e.target.value)} placeholder="⌕  Search name, email, or message"/><select aria-label="Filter status" value={filter} onChange={e => setFilter(e.target.value as Status)}><option value="all">All statuses</option>{statuses.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select><select aria-label="Filter source" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}><option value="all">All sources</option>{sources.map(s => <option key={s}>{s}</option>)}</select><select aria-label="Sort leads" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="highest">Highest score</option><option value="lowest">Lowest score</option></select></div>
          <div className="table-scroller"><table><thead><tr><th>Customer</th><th>Source</th><th>Score</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>{filtered.map(lead => <tr key={lead.id} className={selectedId === lead.id ? 'selected-row' : ''}><td><div className="person"><span className="avatar">{lead.name.slice(0, 1).toUpperCase()}</span><span><b>{lead.name}</b><small>{lead.email}</small></span></div></td><td className="capitalize">{lead.source}</td><td><span className="score"><span className={lead.score >= 60 ? 'score-dot high' : 'score-dot'}/>{lead.score}/100</span></td><td><span className={`status status-${lead.status}`}>{lead.status}</span></td><td>{readableDate(lead.createdAt)}</td><td><button className="row-action" onClick={() => setSelectedId(lead.id)}>Details →</button></td></tr>)}</tbody></table></div>
          {loading && <p className="empty">Loading leads…</p>}{!loading && filtered.length === 0 && <p className="empty">No leads match your filters. Try changing your search or adding a lead.</p>}
        </section>
        {selected && <section className="panel detail-panel"><div className="panel-heading"><div><div className="eyebrow">LEAD DETAILS · #{selected.id}</div><h2>{selected.name}</h2><p>{selected.email} · {selected.source}</p></div><button className="ghost" onClick={() => setSelectedId(null)}>✕ Close</button></div>
          <div className="detail-grid"><div className="detail-left"><div className="detail-info"><div><small>Qualification score</small><strong>{selected.score}/100</strong></div><div><small>Qualification reason</small><p>{selected.reason}</p></div></div><label>Pipeline status<select value={selected.status} disabled={busy} onChange={e => void updateStatus(e.target.value)}>{statuses.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></label><div className="message-box"><small>Customer message</small><p>{selected.message || 'No message provided.'}</p></div></div>
            <div className="detail-right"><h3>Follow-up timeline <span className="small-chip">{followups.length} recorded · {upcoming} upcoming</span></h3>{followups.length ? <div className="timeline">{followups.map(f => <div className="timeline-item" key={f.id}><b>{readableDate(f.scheduledAt)}</b><p>{f.body}</p><small>{f.status} · not sent</small></div>)}</div> : <p className="muted">No follow-ups scheduled yet.</p>}
              <form onSubmit={schedule} className="schedule-form"><label>Follow-up date & time<input required type="datetime-local" value={date} onChange={e => setDate(e.target.value)}/></label><label>Message<textarea required rows={2} value={followupBody} onChange={e => setFollowupBody(e.target.value)}/></label><button disabled={busy} className="primary">Save follow-up</button><small className="muted">Demo only — no emails or texts are sent.</small></form></div></div>
          <div className="phase3-grid">
            <div className="phase3-card"><h3>Conversation history <span className="small-chip">{conversation.length} messages</span></h3>
              <p className="muted">Inbound records and unsent outbound drafts. No real communication is sent.</p>
              <div className="chat-history" aria-live="polite">{conversation.map(item => <div key={item.id} className={`chat-bubble ${item.direction}`}>
                <div className="chat-meta">{item.direction === 'inbound' ? 'Customer' : 'Outbound draft'} · {readableDate(item.createdAt)}</div>
                <div>{item.body}</div><small>{item.deliveryStatus}</small>
              </div>)}{!conversation.length && <p className="muted">No conversation messages yet.</p>}</div>
              <form onSubmit={saveMessage} className="conversation-form">
                <label>Message type<select value={direction} onChange={e => setDirection(e.target.value as 'inbound' | 'outbound')}><option value="inbound">Record inbound message</option><option value="outbound">Save outbound draft</option></select></label>
                <label>Message<textarea required maxLength={5000} rows={3} value={messageBody} onChange={e => setMessageBody(e.target.value)} placeholder="Enter a sample customer message or draft" /></label>
                <button className="primary" disabled={busy || !messageBody.trim()}>{direction === 'inbound' ? 'Record customer message' : 'Save unsent draft'}</button>
              </form>
            </div>
            <div className="phase3-card"><h3>Response suggestions</h3><p className="muted">Context-aware template suggestions using the latest inbound message. This is not an LLM.</p>
              <button type="button" className="primary" disabled={busy} onClick={() => void generateSuggestion()}>Generate suggested reply</button>
              {suggestion && <div className="suggestion"><b>{suggestion.reason}</b><p>{suggestion.suggestion}</p><button className="ghost" onClick={() => { setDirection('outbound'); setMessageBody(suggestion.suggestion); setNotice('Suggestion copied into the draft form.'); }}>Use in draft form</button></div>}
              <h3 className="automation-title">Follow-up automation rule</h3>
              <p className="muted">Preview a deterministic scheduling rule and explicitly approve the record. This does not send messages.</p>
              <label>Delay (hours)<input type="number" min={1} max={720} value={delayHours} onChange={e => {setDelayHours(Number(e.target.value)); setPreview(null);}} /></label>
              <button className="ghost preview-button" disabled={busy || delayHours < 1 || delayHours > 720} onClick={() => void previewRule()}>Preview follow-up rule</button>
              {preview && <div className="suggestion"><b>Scheduled for {readableDate(preview.scheduledAt)}</b><p>{preview.body}</p><small>Preview only · no email or SMS will be sent</small><button className="primary" disabled={busy} onClick={() => void applyRule()}>Approve & save follow-up</button></div>}
            </div>
          </div>
        </section>}
        {error && <div className="alert error" role="alert">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}
        <footer>LEADFLOW · Portfolio project · C# ASP.NET Core, React, TypeScript, SQLite, Python, Docker</footer>
      </main>
    </div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

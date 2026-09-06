import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowUpRight, BarChart3, Bell, Building2, Check,
  ChevronRight, CircleDot, Clock3, Crosshair, Database, FileCheck2, FileText,
  Fingerprint, Globe2, LayoutDashboard, LockKeyhole, Menu, Network, PanelLeftClose,
  PanelLeftOpen, Pause, Plus, Radar, RefreshCw, Search, Send, Settings2, Shield,
  Sparkles, Target, Upload, WalletCards, X, Zap, MapPinned, Cpu
} from 'lucide-react';
import {
  useAddComplaint, useAnalyzeCase, useApproveIntervention, useCreateCase,
  useCreateIntervention, useGetCase, useGetDashboard, useGetFundFlow,
  useGetIntervention, useGetPredictions, useGetReport, useHealthCheck,
  useListCases, useListWallets
} from '@workspace/api-client-react';
import type {
  Account, Case, CaseDetail, Dashboard, FundFlow,
  Intervention, PredictionResult, Report, Transaction, Wallet
} from '@workspace/api-client-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import HistoricalActivityPage from '@/components/historical-activity-page';
import PredictiveEnginePage from '@/components/predictive-engine-page';
import AlertsPage from '@/components/alerts-page';
import LandingPage from '@/pages/landing/LandingPage';

import { setBaseUrl } from '@workspace/api-client-react';

// Wire the API client to the backend URL at startup.
// VITE_API_BASE_URL is set in Vercel environment variables.
// Falls back to relative paths (same-origin) for local dev.
if (import.meta.env.VITE_API_BASE_URL) {
  setBaseUrl(import.meta.env.VITE_API_BASE_URL);
}

const queryClient = new QueryClient();

const money = (value?: number) => typeof value === 'number'
  ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
  : '—';
const compactMoney = (value?: number) => typeof value === 'number'
  ? new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  : '—';
const dateTime = (value?: string) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const dateOnly = (value?: string) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
const titleCase = (value?: string) => (value || 'unknown').replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

const getCasesArray = (data: any): Case[] => {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.cases)) return data.cases;
    if (Array.isArray(data.data)) return data.data;
  }
  return [];
};

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200/70 ${className}`} />;
}

function LoadingState({ rows = 5 }: { rows?: number }) {
  return <div className="space-y-3 p-5" data-testid="status-loading">
    {Array.from({ length: rows }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
  </div>;
}

function ErrorState({ message = 'The intelligence service did not respond.' }: { message?: string }) {
  return <div className="m-5 flex items-center gap-3 border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-testid="status-error">
    <AlertTriangle size={17} /><span>{message}</span><button onClick={() => window.location.reload()} className="ml-auto flex items-center gap-1 font-semibold underline" data-testid="button-retry"><RefreshCw size={14} /> Retry</button>
  </div>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex min-h-[240px] flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-50/60 p-7 text-center" data-testid="status-empty">
    <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-700"><Database size={18} /></div>
    <h3 className="text-sm font-bold text-slate-800">{title}</h3><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>{action}
  </div>;
}

function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'amber' | 'red' | 'cyan' | 'green' }) {
  const tones = { slate: 'bg-slate-100 text-slate-600', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-800', cyan: 'bg-cyan-100 text-cyan-800', green: 'bg-emerald-100 text-emerald-800' };
  return <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[.08em] ${tones[tone]}`}>{children}</span>;
}

function Panel({ title, eyebrow, action, children, className = '' }: { title: string; eyebrow?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`border border-slate-200 bg-white shadow-[0_1px_2px_rgba(25,42,67,.04)] ${className}`}>
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
      <div><div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">{eyebrow || 'Intelligence layer'}</div><h2 className="mt-0.5 text-sm font-extrabold text-slate-800">{title}</h2></div>
      {action}
    </div>{children}
  </section>;
}

const navGroups = [
  { label: 'I4C Problem Deliverables', items: [
    { href: '/predictive-engine', label: 'a. Predictive Engine (Model 184)', icon: Cpu },
    { href: '/historical-activity', label: 'b. Risk Heatmap Dashboard (GIS)', icon: MapPinned },
    { href: '/cases', label: 'c. Law Enforcement Interface', icon: Fingerprint },
    { href: '/alerts', label: 'd. Alert & Notification System', icon: Bell },
  ] },
  { label: 'Investigator Workbench', items: [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/fund-flow', label: 'Fund flow graph', icon: Network },
    { href: '/crypto', label: 'Crypto wallets', icon: WalletCards },
    { href: '/vasp', label: 'VASP attribution', icon: Building2 },
    { href: '/geo', label: 'Geo & prediction', icon: Globe2 },
  ] },
  { label: 'Actions & Audit', items: [
    { href: '/interventions', label: 'Interventions', icon: Shield },
    { href: '/reports', label: 'Reports', icon: FileText },
    { href: '/audit', label: 'Audit trail', icon: FileCheck2 },
  ] },
];

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const [location] = useLocation();
  return <aside className={`${collapsed ? 'w-[72px]' : 'w-[238px]'} fixed inset-y-0 left-0 z-30 hidden shrink-0 flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-all duration-200 lg:flex`}>
    <div className="flex h-[68px] items-center border-b border-[hsl(var(--sidebar-border))] px-4">
      <Link href="/" className="flex min-w-0 items-center gap-3" data-testid="link-brand">
        <div className="relative flex size-9 shrink-0 items-center justify-center border border-amber-300/50 bg-amber-300 text-[hsl(var(--sidebar))]"><Crosshair size={21} strokeWidth={2.6} /><span className="absolute right-0 top-0 size-1.5 bg-cyan-300" /></div>
        {!collapsed && <div><div className="text-[17px] font-extrabold tracking-[.14em] text-slate-100">CASHNET</div><div className="font-mono-data text-[9px] uppercase tracking-[.18em] text-cyan-300">Financial intelligence</div></div>}
      </Link>
    </div>
    <div className="flex-1 overflow-y-auto px-3 py-5">
      {!collapsed && <div className="mb-5 flex items-center gap-2 rounded border border-cyan-300/20 bg-cyan-300/5 px-3 py-2 text-[10px] text-cyan-200"><span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,.7)]" />AUTHORIZED NETWORK <span className="ml-auto font-mono-data text-cyan-300">L3</span></div>}
      {navGroups.map((group) => <div key={group.label} className="mb-6">
        {!collapsed && <div className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[.18em] text-slate-500">{group.label}</div>}
        <div className="space-y-1">{group.items.map((item) => {
          const Icon = item.icon; const active = item.href === '/' ? location === '/' : location.startsWith(item.href);
          return <Link href={item.href} key={item.href} className={`group flex items-center gap-3 border-l-2 px-3 py-2.5 text-xs font-semibold ${active ? 'border-amber-300 bg-white/10 text-amber-200' : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-100'}`} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}>
            <Icon size={16} className={active ? 'text-amber-300' : 'text-slate-500 group-hover:text-cyan-300'} />{!collapsed && <span>{item.label}</span>}{!collapsed && active && <ChevronRight className="ml-auto" size={13} />}
          </Link>;
        })}</div>
      </div>)}
    </div>
    <div className="border-t border-[hsl(var(--sidebar-border))] p-3">
      <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 text-xs font-semibold text-slate-400 hover:text-slate-100" data-testid="link-nav-settings"><Settings2 size={16} />{!collapsed && 'Provider settings'}</Link>
      <button onClick={onToggle} className="mt-1 flex w-full items-center gap-3 px-3 py-2 text-xs text-slate-500 hover:text-slate-200" data-testid="button-toggle-sidebar">{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}{!collapsed && 'Collapse rail'}</button>
    </div>
  </aside>;
}

function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={onClose}>
    <div className="h-full w-[270px] bg-[hsl(var(--sidebar))] p-4" onClick={(event) => event.stopPropagation()}>
      <div className="mb-5 flex items-center justify-between text-slate-100"><div className="font-extrabold tracking-[.14em]">CASHNET</div><button onClick={onClose} data-testid="button-close-mobile-nav"><X size={18} /></button></div>
      {navGroups.flatMap((group) => group.items).map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={onClose} className="flex items-center gap-3 border-b border-white/5 px-2 py-3 text-xs font-semibold text-slate-300" data-testid={`link-mobile-${item.label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={16} />{item.label}</Link>; })}
      <Link href="/settings" onClick={onClose} className="flex items-center gap-3 px-2 py-3 text-xs font-semibold text-slate-300" data-testid="link-mobile-settings"><Settings2 size={16} />Provider settings</Link>
    </div>
  </div>;
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const section = location === '/' ? 'Overview' : titleCase(location.split('/')[1]);
  return <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-3 border-b border-slate-200 bg-[hsl(var(--background))]/95 px-4 backdrop-blur md:px-7">
    <div className="flex items-center gap-3"><button className="text-slate-500 lg:hidden" onClick={onMenu} data-testid="button-open-mobile-nav"><Menu size={20} /></button><div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex"><span>Workspace</span><ChevronRight size={13} /><span className="font-bold text-slate-700">{section}</span></div><div className="flex items-center gap-2 sm:hidden"><CircleDot size={14} className="text-cyan-600" /><span className="font-extrabold tracking-[.12em] text-slate-800">CASHNET</span></div></div>
    <div className="flex items-center gap-2 md:gap-4"><div className="hidden h-9 w-56 items-center gap-2 border border-slate-200 bg-white px-3 text-slate-400 md:flex"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && search) setLocation(`/cases?search=${encodeURIComponent(search)}`); }} placeholder="Search cases, accounts..." className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400" data-testid="input-global-search" /><kbd className="font-mono-data text-[9px]">⌘K</kbd></div><button className="relative p-2 text-slate-500 hover:text-slate-800" data-testid="button-notifications"><Bell size={17} /><span className="absolute right-1 top-1 size-1.5 rounded-full bg-amber-500" /></button><div className="hidden h-8 w-px bg-slate-200 sm:block" /><div className="flex items-center gap-2"><div className="flex size-8 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-amber-300">AR</div><div className="hidden text-right sm:block"><div className="text-[11px] font-bold text-slate-700">A. Rao</div><div className="font-mono-data text-[9px] text-slate-400">Analyst / L3</div></div></div></div>
  </header>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false); const [mobileOpen, setMobileOpen] = useState(false);
  return <div className="noise-overlay min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"><Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} /><MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} /><div className={`${collapsed ? 'lg:pl-[72px]' : 'lg:pl-[238px]'} min-h-[100dvh] transition-all duration-200`}><Topbar onMenu={() => setMobileOpen(true)} /><main className="cashnet-grid min-h-[calc(100dvh-68px)] p-4 md:p-7">{children}</main></div></div>;
}

function PageHead({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 font-mono-data text-[10px] font-bold uppercase tracking-[.18em] text-cyan-700"><span className="size-1.5 bg-amber-400" />{kicker}</div><h1 className="text-2xl font-extrabold tracking-[-.03em] text-slate-900 md:text-[30px]">{title}</h1><p className="mt-1.5 max-w-2xl text-xs leading-5 text-slate-500">{description}</p></div>{action}</div>;
}

function Metric({ label, value, detail, tone = 'cyan', icon: Icon = Activity }: { label: string; value: string; detail?: string; tone?: 'cyan' | 'amber' | 'red' | 'slate'; icon?: typeof Activity }) {
  const accents = { cyan: 'border-l-cyan-500 text-cyan-700', amber: 'border-l-amber-400 text-amber-700', red: 'border-l-red-500 text-red-700', slate: 'border-l-slate-600 text-slate-700' };
  return <div className={`border border-slate-200 border-l-[3px] bg-white p-4 ${accents[tone]}`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[.1em] text-slate-400"><span>{label}</span><Icon size={15} className="opacity-70" /></div><div className="mt-2 font-mono-data text-2xl font-medium tracking-[-.06em] text-slate-800">{value}</div>{detail && <div className="mt-1 text-[10px] text-slate-500">{detail}</div>}</div>;
}

function DataTable({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`overflow-x-auto ${className}`}><table className="w-full min-w-[620px] text-left">{children}</table></div>;
}
function TableHead({ children }: { children: React.ReactNode }) { return <thead className="bg-slate-50 text-[10px] uppercase tracking-[.1em] text-slate-400"><tr>{children}</tr></thead>; }
function Th({ children }: { children?: React.ReactNode }) { return <th className="whitespace-nowrap px-4 py-3 font-bold">{children}</th>; }
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <td className={`border-t border-slate-100 px-4 py-3 text-xs ${className}`}>{children}</td>; }

function CaseSelect({ cases, selected, onChange }: { cases: Case[]; selected?: string; onChange: (value: string) => void }) {
  return <div className="flex items-center gap-2 border border-slate-200 bg-white px-3 py-2"><Target size={14} className="text-cyan-600" /><select value={selected || ''} onChange={(event) => onChange(event.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none" data-testid="select-active-case"><option value="">Select active case</option>{cases.map((item) => <option value={item.id} key={item.id}>{item.reference} · {item.title}</option>)}</select></div>;
}

function DashboardPage() {
  const dashboard = useGetDashboard(); const cases = useListCases();
  if (dashboard.isLoading || cases.isLoading) return <LoadingState />;
  if (dashboard.isError) return <ErrorState />;
  const data = dashboard.data as Dashboard | undefined; const caseList = getCasesArray(cases.data);
  const metric = (key: string) => String(data?.metrics?.[key] ?? '—');
  return <div className="enter"><PageHead kicker="Signal desk / live" title="Overview" description="A compact operating picture of active fraud, conversion windows and intervention-ready intelligence." action={<Link href="/cases" className="flex items-center justify-center gap-2 bg-slate-800 px-4 py-2.5 text-xs font-bold text-amber-300 hover:bg-slate-700" data-testid="link-open-cases"><Fingerprint size={15} /> Open case desk</Link>} />
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Active cases" value={metric('activeCases')} detail="Across current queue" tone="slate" icon={Fingerprint} /><Metric label="Exposure tracked" value={metric('totalExposure') === '—' ? compactMoney(caseList.reduce((a, c) => a + c.amount, 0)) : metric('totalExposure')} detail="Fiat equivalent" tone="amber" icon={BarChart3} /><Metric label="High risk" value={metric('highRiskCases')} detail="Requires triage" tone="red" icon={AlertTriangle} /><Metric label="Conversion window" value={data?.conversionWindow || '—'} detail="Observed model window" tone="cyan" icon={Clock3} /></div>
    <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><Panel title="Case pressure" eyebrow="Queue / recent activity" action={<Link href="/cases" className="text-[10px] font-bold uppercase tracking-wider text-cyan-700" data-testid="link-view-all-cases">View all <ChevronRight size={12} className="inline" /></Link>}><DataTable><TableHead><Th>Reference</Th><Th>Classification</Th><Th>Exposure</Th><Th>Priority</Th><Th>Updated</Th></TableHead><tbody>{caseList.slice(0, 6).map((item) => <tr key={item.id} className="group hover:bg-cyan-50/40"><Td><Link href={`/cases/${item.id}`} className="font-mono-data font-bold text-cyan-700 hover:underline" data-testid={`link-case-${item.id}`}>{item.reference}</Link><div className="mt-0.5 max-w-[180px] truncate text-[11px] text-slate-500">{item.title}</div></Td><Td><Pill tone="slate">{item.fraudType}</Pill></Td><Td className="font-mono-data font-medium text-slate-700">{money(item.amount)}</Td><Td><Pill tone={item.priority?.toLowerCase().includes('high') ? 'red' : 'amber'}>{item.priority}</Pill></Td><Td className="font-mono-data text-[11px] text-slate-500">{dateOnly(item.updatedAt || item.conversionAt)}</Td></tr>)}</tbody></DataTable>{caseList.length === 0 && <EmptyState title="No cases in the desk" description="Ingest a complaint to start an authorized investigation." />}</Panel>
      <div className="space-y-5"><Panel title="Transaction volume" eyebrow="Network telemetry"><div className="p-4">{(data?.transactionVolume || []).length ? <div className="flex h-44 items-end gap-2 border-b border-l border-slate-200 px-3 pb-0 pt-5">{(data?.transactionVolume || []).map((item, index) => { const value = Number(item.value ?? item.amount ?? Object.values(item)[1] ?? 0); const max = Math.max(...(data?.transactionVolume || []).map((i) => Number(i.value ?? i.amount ?? Object.values(i)[1] ?? 0)), 1); return <div className="group flex flex-1 flex-col items-center gap-2" key={index}><div className="w-full bg-cyan-500/80 transition-all group-hover:bg-amber-400" style={{ height: `${Math.max(5, value / max * 125)}px` }} title={String(value)} /><span className="font-mono-data text-[8px] text-slate-400">{String(item.label ?? item.date ?? index + 1).slice(-5)}</span></div>; })}</div> : <EmptyState title="Volume feed pending" description="The network series will appear when the provider returns observations." />}</div></Panel><Panel title="Alerts" eyebrow="Action queue"><div className="divide-y divide-slate-100">{(data?.alerts || []).slice(0, 4).map((alert, index) => <div className="flex gap-3 p-3" key={index}><div className="mt-0.5 size-2 shrink-0 rounded-full bg-amber-400" /><div className="min-w-0 text-xs text-slate-600"><div className="font-semibold text-slate-800">{String(alert.title ?? alert.message ?? Object.values(alert)[0] ?? 'Provider alert')}</div><div className="mt-1 text-[10px] text-slate-400">{String(alert.timestamp ?? alert.time ?? '')}</div></div></div>)}</div>{!(data?.alerts || []).length && <div className="p-5 text-xs text-slate-500">No unresolved alerts.</div>}</Panel></div>
    </div>
  </div>;
}

function CasesPage() {
  const cases = useListCases(); const createCase = useCreateCase(); const addComplaint = useAddComplaint();
  const [showForm, setShowForm] = useState(false); const [query, setQuery] = useState(''); const [form, setForm] = useState({ title: '', fraudType: 'UPI scam', amount: '', description: '', victimCity: '', victimState: '', account: '', wallet: '' });
  const list = getCasesArray(cases.data).filter((item) => `${item.reference} ${item.title} ${item.city}`.toLowerCase().includes(query.toLowerCase()));
  const submit = (event: React.FormEvent) => { event.preventDefault(); createCase.mutate({ data: { ...form, amount: Number(form.amount) } }, { onSuccess: () => { setShowForm(false); setForm({ title: '', fraudType: 'UPI scam', amount: '', description: '', victimCity: '', victimState: '', account: '', wallet: '' }); queryClient.invalidateQueries({ queryKey: cases.queryKey }); } }); };
  if (cases.isLoading) return <LoadingState />;
  if (cases.isError) return <ErrorState />;
  return <div className="enter"><PageHead kicker="Intake / triage queue" title="Cases" description="Ingest reports, assign attention and open the complete evidence chain." action={<button onClick={() => setShowForm(!showForm)} className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-2.5 text-xs font-extrabold text-slate-900 hover:bg-amber-300" data-testid="button-new-case"><Plus size={15} /> New scam report</button>} />
    {showForm && <Panel title="Ingest scam report" eyebrow="Source / complaint input" className="mb-5 border-amber-300"><form onSubmit={submit} className="grid gap-3 p-4 md:grid-cols-2" data-testid="form-create-case"><input required minLength={3} placeholder="Case title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="field" data-testid="input-case-title" /><select value={form.fraudType} onChange={(e) => setForm({ ...form, fraudType: e.target.value })} className="field" data-testid="select-fraud-type"><option>UPI scam</option><option>Investment fraud</option><option>Account takeover</option><option>Crypto mule</option></select><input required type="number" min="1" placeholder="Amount (INR)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="field" data-testid="input-case-amount" /><input placeholder="Victim city" value={form.victimCity} onChange={(e) => setForm({ ...form, victimCity: e.target.value })} className="field" data-testid="input-victim-city" /><input placeholder="Bank account (optional)" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} className="field" data-testid="input-case-account" /><input placeholder="Wallet (optional)" value={form.wallet} onChange={(e) => setForm({ ...form, wallet: e.target.value })} className="field" data-testid="input-case-wallet" /><textarea required minLength={10} placeholder="Describe what happened, when, and the known indicators..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="field min-h-24 md:col-span-2" data-testid="input-case-description" /><div className="flex items-center justify-end gap-2 md:col-span-2"><button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs font-bold text-slate-500" data-testid="button-cancel-case">Cancel</button><button disabled={createCase.isPending} className="flex items-center gap-2 bg-slate-800 px-4 py-2 text-xs font-bold text-amber-300 disabled:opacity-50" data-testid="button-submit-case">{createCase.isPending ? 'Submitting...' : <><Send size={14} /> Create case</>}</button></div></form></Panel>}
    <Panel title="Investigation queue" eyebrow={`${list.length} visible / API synchronized`} action={<div className="flex items-center gap-2 border border-slate-200 bg-white px-2.5 py-1.5"><Search size={13} className="text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter queue" className="w-28 bg-transparent text-xs outline-none" data-testid="input-filter-cases" /></div>}><DataTable><TableHead><Th>Case</Th><Th>Type</Th><Th>Amount</Th><Th>Location</Th><Th>State</Th><Th>Conversion</Th><Th /></TableHead><tbody>{list.map((item) => <tr key={item.id} className="hover:bg-cyan-50/40"><Td><Link href={`/cases/${item.id}`} className="font-mono-data font-bold text-cyan-700 hover:underline" data-testid={`link-case-row-${item.id}`}>{item.reference}</Link><div className="max-w-[220px] truncate text-[11px] text-slate-500">{item.title}</div></Td><Td><Pill>{item.fraudType}</Pill></Td><Td className="font-mono-data font-semibold">{money(item.amount)}</Td><Td>{item.city || '—'}</Td><Td><Pill tone={item.status?.toLowerCase().includes('open') ? 'amber' : 'cyan'}>{item.status}</Pill></Td><Td className="font-mono-data text-[11px] text-slate-500">{dateTime(item.conversionAt)}</Td><Td><Link href={`/cases/${item.id}`} className="text-slate-400 hover:text-cyan-700" data-testid={`link-open-case-${item.id}`}><ChevronRight size={16} /></Link></Td></tr>)}</tbody></DataTable>{!list.length && <EmptyState title="No matching cases" description="Try another filter or ingest a new complaint." />}</Panel>
    {addComplaint.isError && <div className="mt-3 text-xs text-red-700">Complaint ingestion failed. Check the provider response.</div>}
  </div>;
}

function CaseWorkspacePage() {
  const { id } = useParams<{ id: string }>(); const caseQuery = useGetCase(id || ''); const analyze = useAnalyzeCase(); const addComplaint = useAddComplaint();
  const [complaintOpen, setComplaintOpen] = useState(false); const [description, setDescription] = useState('');
  if (caseQuery.isLoading) return <LoadingState rows={8} />; if (caseQuery.isError || !caseQuery.data) return <ErrorState message="This case could not be loaded." />;
  const item = caseQuery.data as CaseDetail; const refresh = () => queryClient.invalidateQueries({ queryKey: caseQuery.queryKey });
  const submitComplaint = (event: React.FormEvent) => { event.preventDefault(); addComplaint.mutate({ caseId: item.id, data: { description } }, { onSuccess: () => { setDescription(''); setComplaintOpen(false); refresh(); } }); };
  const steps = [
    ['01', 'Report in', 'complaint', true], ['02', 'Account analysis', 'accounts', item.accounts?.length > 0], ['03', 'Transactions', 'transactions', item.transactions?.length > 0], ['04', 'Fund flow', 'fund-flow', item.fundFlow?.nodes?.length > 0], ['05', 'Crypto', 'wallets', item.wallets?.length > 0], ['06', 'VASP', 'vasp', item.vasp?.length > 0], ['07', 'Risk', 'risk', !!item.risk], ['08', 'Geospatial', 'geo', item.predictions?.hotspots?.length > 0], ['09', 'Predicted cash-out', 'predictions', item.predictions?.hotspots?.length > 0], ['10', 'Actionable intel', 'recommendations', item.recommendations?.length > 0], ['11', 'Last credited', 'lastCredited', !!item.lastCredited], ['12', 'Bank / branch', 'bank', !!item.lastCredited?.bank], ['13', 'Intervention', 'intervention', !!item.intervention], ['14', 'Audit / report', 'audit', item.audit?.length > 0],
  ] as const;
  return <div className="enter"><div className="mb-5 flex flex-wrap items-center gap-2 text-[10px] font-mono-data uppercase tracking-[.12em] text-slate-500"><Link href="/cases" className="text-cyan-700 hover:underline" data-testid="link-back-cases">Case desk</Link><ChevronRight size={12} /><span className="text-slate-800">{item.reference}</span><Pill tone="amber">{item.state || item.status}</Pill></div><PageHead kicker={`Unified case workspace / ${item.reference}`} title={item.title} description={`${titleCase(item.fraudType)} · ${item.city || 'Location unknown'} · opened ${dateOnly(item.updatedAt || item.conversionAt)}`} action={<div className="flex flex-wrap gap-2"><button onClick={() => analyze.mutate({ caseId: item.id }, { onSuccess: refresh })} disabled={analyze.isPending} className="flex items-center gap-2 border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-cyan-400 disabled:opacity-50" data-testid="button-run-analysis">{analyze.isPending ? <Activity size={14} className="animate-pulse" /> : <Zap size={14} className="text-amber-500" />}{analyze.isPending ? 'Running pipeline' : 'Run analysis'}</button><button onClick={() => setComplaintOpen(!complaintOpen)} className="flex items-center gap-2 bg-amber-400 px-3 py-2 text-xs font-bold text-slate-900" data-testid="button-add-complaint"><Upload size={14} /> Add report</button></div>} />
    {complaintOpen && <Panel title="Add linked complaint" eyebrow="Ingestion / source evidence" className="mb-5 border-cyan-300"><form onSubmit={submitComplaint} className="flex flex-col gap-3 p-4 md:flex-row" data-testid="form-add-complaint"><textarea required minLength={10} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Paste the authorized complaint narrative or source report..." className="field min-h-20 flex-1" data-testid="input-complaint-description" /><button className="flex h-fit items-center justify-center gap-2 bg-slate-800 px-4 py-3 text-xs font-bold text-cyan-300" data-testid="button-submit-complaint">{addComplaint.isPending ? 'Ingesting...' : <><Check size={14} /> Ingest evidence</>}</button></form></Panel>}
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Exposure" value={money(item.amount)} detail="Reported principal" tone="amber" icon={BarChart3} /><Metric label="Risk score" value={`${item.risk?.score ?? '—'}`} detail={`${item.risk?.category || 'Awaiting model'}`} tone={item.risk?.score >= 70 ? 'red' : 'cyan'} icon={Radar} /><Metric label="Accounts" value={String(item.accounts?.length ?? 0)} detail="Linked entities" tone="slate" icon={Building2} /><Metric label="Wallets" value={String(item.wallets?.length ?? 0)} detail="On-chain entities" tone="cyan" icon={WalletCards} /></div>
    <div className="grid gap-5 xl:grid-cols-[.72fr_1.28fr]"><Panel title="Investigation chain" eyebrow="Workflow / evidence coverage"><div className="grid grid-cols-1 gap-1 p-3 sm:grid-cols-2">{steps.map(([number, label, anchor, ready]) => <a href={`#${anchor}`} key={number} className={`group flex items-center gap-3 border px-3 py-2.5 ${ready ? 'border-cyan-200 bg-cyan-50/50' : 'border-slate-100 bg-slate-50/40'}`} data-testid={`link-workflow-${anchor}`}><span className={`font-mono-data text-[10px] ${ready ? 'text-cyan-700' : 'text-slate-400'}`}>{number}</span><span className={`text-xs font-semibold ${ready ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>{ready ? <Check size={13} className="ml-auto text-cyan-600" /> : <span className="ml-auto size-1.5 rounded-full bg-slate-300" />}</a>)}</div></Panel><div className="space-y-5"><Panel title="Source complaint" eyebrow="Report in" action={<Pill tone="cyan">{item.complaint?.sourceType || 'API source'}</Pill>}><div id="complaint" className="p-4 text-xs leading-6 text-slate-600">{item.complaint?.description || 'No complaint narrative returned.'}<div className="mt-3 flex flex-wrap gap-2">{(item.complaint?.indicators || []).map((indicator) => <Pill key={indicator} tone="amber">{indicator}</Pill>)}</div></div></Panel><Panel title="Exact conversion event" eyebrow="Fiat → crypto / evidence timestamp"><div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-mono-data text-lg font-medium text-slate-800">{dateTime(item.conversionAt)}</div><div className="mt-1 text-[10px] text-slate-500">Exact timestamp from case API · conversion window {item.predictions?.generatedAt ? dateTime(item.predictions.generatedAt) : 'linked model pending'}</div></div><Pill tone="amber"><Zap size={11} /> Conversion anchor</Pill></div></Panel></div></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2"><AccountsPanel accounts={item.accounts} /><TransactionsPanel transactions={item.transactions} /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-3"><Panel title="Risk assessment" eyebrow="Model inference / labeled"><div id="risk" className="p-4"><div className="flex items-end justify-between"><div className="font-mono-data text-4xl font-medium text-red-700">{item.risk?.score ?? '—'}</div><Pill tone="red">{item.risk?.category || 'Not scored'}</Pill></div><div className="mt-4 h-2 bg-slate-100"><div className="h-2 bg-red-500" style={{ width: `${Math.min(100, item.risk?.score || 0)}%` }} /></div><div className="mt-4 flex flex-wrap gap-1.5">{(item.risk?.features || []).map((feature) => <Pill key={feature}>{feature}</Pill>)}</div><div className="mt-4 font-mono-data text-[10px] text-slate-400">MODEL {item.risk?.modelVersion || '—'} · CONFIDENCE {item.risk?.confidence ?? '—'}</div></div></Panel><Panel title="Actionable intelligence" eyebrow="Recommendation layer"><div id="recommendations" className="divide-y divide-slate-100">{(item.recommendations || []).map((recommendation, index) => <div className="p-4" key={index}><div className="flex items-center justify-between"><div className="text-xs font-bold text-slate-800">{recommendation.title}</div><Pill tone={recommendation.priority?.toLowerCase().includes('high') ? 'red' : 'amber'}>{recommendation.priority}</Pill></div><p className="mt-2 text-[11px] leading-5 text-slate-500">{recommendation.reason}</p><div className="mt-2 text-[10px] font-bold text-cyan-700">Confidence {recommendation.confidence}</div></div>)}{!item.recommendations?.length && <div className="p-5 text-xs text-slate-500">No recommendations returned.</div>}</div></Panel><Panel title="Last credited account" eyebrow="Destination / intervention anchor"><div id="lastCredited" className="p-4"><div className="font-mono-data text-base font-medium text-slate-800">{item.lastCredited?.account || '—'}</div><div className="mt-3 grid grid-cols-2 gap-3 text-[11px]"><div><div className="text-slate-400">Bank / branch</div><div className="mt-1 font-semibold">{item.lastCredited?.bank || '—'}</div><div className="text-slate-500">{item.lastCredited?.branch || '—'}</div></div><div><div className="text-slate-400">IFSC</div><div className="mt-1 font-mono-data">{item.lastCredited?.ifsc || '—'}</div></div><div><div className="text-slate-400">Amount</div><div className="mt-1 font-mono-data font-semibold">{money(item.lastCredited?.amount)}</div></div><div><div className="text-slate-400">Credited</div><div className="mt-1 font-mono-data">{dateTime(item.lastCredited?.timestamp)}</div></div></div></div></Panel></div>
  </div>;
}

function AccountsPanel({ accounts }: { accounts: Account[] }) {
  return <Panel title="Account analysis" eyebrow={`${accounts?.length || 0} linked accounts`}><DataTable><TableHead><Th>Account</Th><Th>Institution</Th><Th>Inflow</Th><Th>Outflow</Th><Th>Risk</Th></TableHead><tbody>{(accounts || []).map((account) => <tr key={account.id} id="accounts" className="hover:bg-cyan-50/40"><Td><div className="font-mono-data font-bold text-slate-700">{account.masked}</div><div className="text-[10px] text-slate-400">{account.id}</div></Td><Td><div className="font-semibold">{account.bank}</div><div className="text-[10px] text-slate-500">{account.branch} · {account.ifsc}</div></Td><Td className="font-mono-data">{money(account.inflow)}</Td><Td className="font-mono-data">{money(account.outflow)}</Td><Td><Pill tone={account.risk >= 70 ? 'red' : 'amber'}>{account.risk}</Pill></Td></tr>)}</tbody></DataTable>{!accounts?.length && <EmptyState title="No accounts linked" description="Run the analysis pipeline after ingesting a report." />}</Panel>;
}
function TransactionsPanel({ transactions }: { transactions: Transaction[] }) {
  return <Panel title="Transactions" eyebrow={`${transactions?.length || 0} observed movements`}><DataTable><TableHead><Th>Timestamp</Th><Th>Route</Th><Th>Amount</Th><Th>Type</Th><Th>Risk</Th></TableHead><tbody>{(transactions || []).slice(0, 8).map((transaction) => <tr key={transaction.id} id="transactions" className="hover:bg-cyan-50/40"><Td className="font-mono-data text-[10px] text-slate-500">{dateTime(transaction.timestamp)}</Td><Td><div className="font-mono-data text-[10px]">{transaction.source} <ArrowUpRight size={11} className="inline text-cyan-600" /> {transaction.destination}</div><div className="text-[10px] text-slate-400">{transaction.id}</div></Td><Td className="font-mono-data font-semibold">{money(transaction.amount)} <span className="text-[10px] text-slate-400">{transaction.currency}</span></Td><Td><Pill tone={transaction.isConversion ? 'amber' : 'slate'}>{transaction.type}</Pill></Td><Td><Pill tone={transaction.risk >= 70 ? 'red' : 'cyan'}>{transaction.risk}</Pill></Td></tr>)}</tbody></DataTable>{!transactions?.length && <EmptyState title="No transactions returned" description="Transaction evidence will populate from the linked provider." />}</Panel>;
}

function FundFlowPage() {
  const { caseId } = useParams<{ caseId: string }>(); const flow = useGetFundFlow(caseId || '');
  if (flow.isLoading) return <LoadingState rows={7} />; if (flow.isError || !flow.data) return <ErrorState message="Fund-flow telemetry is unavailable for this case." />;
  const data = flow.data as FundFlow; const maxAmount = Math.max(...(data.nodes || []).map((n) => n.risk), 1);
  return <div className="enter"><PageHead kicker={`Graph / ${caseId}`} title="Fund flow" description="Unified graph and synchronized event timeline. Select a node or timestamp to inspect the evidence chain." action={<Pill tone="cyan"><Activity size={12} /> Live graph feed</Pill>} /><div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Nodes" value={String(data.nodes?.length || 0)} detail="Known entities" icon={Network} tone="slate" /><Metric label="Edges" value={String(data.edges?.length || 0)} detail="Observed transfers" icon={ArrowUpRight} tone="cyan" /><Metric label="Graph risk" value={String(data.metrics?.risk ?? '—')} detail="Provider metric" icon={Radar} tone="red" /><Metric label="Tracked value" value={compactMoney(data.edges?.reduce((a, e) => a + e.amount, 0))} detail="Across graph edges" icon={BarChart3} tone="amber" /></div><div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><Panel title="Entity graph" eyebrow="Synchronized / click node to isolate" className="scanline"><div className="relative min-h-[430px] overflow-hidden bg-[hsl(var(--sidebar))] p-5" data-testid="fund-flow-graph"><div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #84a3b8 1px, transparent 0)', backgroundSize: '22px 22px' }} />{(data.edges || []).map((edge) => { const source = data.nodes.find((node) => node.id === edge.source); const target = data.nodes.find((node) => node.id === edge.target); if (!source || !target) return null; return <svg key={edge.id} className="pointer-events-none absolute inset-0 size-full"><line x1={`${source.x}%`} y1={`${source.y}%`} x2={`${target.x}%`} y2={`${target.y}%`} stroke={edge.conversion ? '#f6c453' : '#4f8190'} strokeWidth={edge.conversion ? 2 : 1} strokeDasharray={edge.conversion ? '5 4' : undefined} /><text x={`${(source.x + target.x) / 2}%`} y={`${(source.y + target.y) / 2}%`} fill="#b7c9d2" fontSize="9">{compactMoney(edge.amount)}</text></svg>; })}{(data.nodes || []).map((node) => <button key={node.id} className="absolute -translate-x-1/2 -translate-y-1/2 text-left" style={{ left: `${node.x}%`, top: `${node.y}%` }} data-testid={`button-graph-node-${node.id}`}><div className={`flex size-14 items-center justify-center rounded-full border-2 ${node.risk >= 70 ? 'border-red-400 bg-red-500/20' : 'border-cyan-300 bg-cyan-400/15'} text-center text-[9px] font-bold text-slate-100 shadow-lg`}><span>{titleCase(node.kind)}</span></div><div className="mt-1 max-w-24 truncate text-center font-mono-data text-[9px] text-cyan-200">{node.label}</div></button>)}</div></Panel><Panel title="Synchronized timeline" eyebrow={`${data.timeline?.length || 0} events / chronological`}><div className="max-h-[480px] overflow-y-auto divide-y divide-slate-100">{(data.timeline || []).map((event) => <div className="flex gap-3 p-4 hover:bg-cyan-50/30" key={event.id} data-testid={`timeline-event-${event.id}`}><div className="relative flex w-16 shrink-0 flex-col items-end"><span className="font-mono-data text-[10px] text-cyan-700">{dateTime(event.time)}</span><span className="mt-1 text-[9px] text-slate-400">{event.category}</span></div><div className="relative border-l border-cyan-300 pl-4"><span className="absolute -left-[5px] top-1 size-2 rounded-full border border-white bg-cyan-500" /><div className="text-xs font-bold text-slate-800">{event.title}</div><div className="mt-1 text-[11px] leading-5 text-slate-500">{event.detail}</div><div className="mt-2 font-mono-data text-[10px] font-medium text-slate-700">{money(event.amount)}</div></div></div>)}</div>{!data.timeline?.length && <EmptyState title="Timeline empty" description="No event chronology was returned for this case." />}</Panel></div></div>;
}

function WalletsPage() {
  const wallets = useListWallets(); if (wallets.isLoading) return <LoadingState />; if (wallets.isError) return <ErrorState />;
  const list = wallets.data || [];
  return <div className="enter"><PageHead kicker="On-chain intelligence" title="Crypto wallets" description="Wallet exposure, chain activity and VASP signals from the provider's intelligence feed." action={<Pill tone="cyan"><LockKeyhole size={12} /> Authorized view</Pill>} /><Panel title="Wallet registry" eyebrow={`${list.length} wallets / provider feed`} action={<div className="font-mono-data text-[10px] text-slate-400">LAST SYNC {dateTime(list[0]?.lastActive)}</div>}><DataTable><TableHead><Th>Wallet</Th><Th>Chain</Th><Th>Inflow</Th><Th>Outflow</Th><Th>Activity</Th><Th>VASP</Th><Th>Risk</Th></TableHead><tbody>{list.map((wallet) => <tr key={wallet.id} className="hover:bg-cyan-50/40" data-testid={`row-wallet-${wallet.id}`}><Td><div className="flex items-center gap-2"><div className="flex size-7 items-center justify-center bg-slate-800 text-cyan-300"><WalletCards size={13} /></div><div><div className="max-w-[170px] truncate font-mono-data text-[10px] font-medium">{wallet.address}</div><div className="text-[10px] text-slate-400">{wallet.id}</div></div></div></Td><Td><Pill tone="cyan">{wallet.chain}</Pill></Td><Td className="font-mono-data">{money(wallet.inflow)}</Td><Td className="font-mono-data">{money(wallet.outflow)}</Td><Td><div className="font-mono-data text-[11px]">{wallet.transactions}</div><div className="text-[10px] text-slate-400">{dateOnly(wallet.firstSeen)} → {dateOnly(wallet.lastActive)}</div></Td><Td className="text-xs font-semibold">{wallet.vasp || 'Unattributed'}</Td><Td><Pill tone={wallet.risk >= 70 ? 'red' : 'amber'}>{wallet.risk} · {wallet.confidence}</Pill></Td></tr>)}</tbody></DataTable>{!list.length && <EmptyState title="No wallet intelligence" description="Wallet records will appear when the provider links on-chain entities." />}</Panel></div>;
}

function CaseScopedPage({ kind }: { kind: 'vasp' | 'geo' }) {
  const cases = useListCases(); const selected = getCasesArray(cases.data)[0]?.id || ''; const detail = useGetCase(selected);
  if (cases.isLoading || detail.isLoading) return <LoadingState />; if (detail.isError || !detail.data) return <EmptyState title="Select a case for attribution" description="This view is case-scoped. Open a case from the desk to load linked intelligence." action={<Link href="/cases" className="mt-4 bg-slate-800 px-3 py-2 text-xs font-bold text-amber-300" data-testid="link-select-case">Open case desk</Link>} />;
  const item = detail.data as CaseDetail;
  if (kind === 'vasp') return <div className="enter"><PageHead kicker={`Attribution / ${item.reference}`} title="VASP attribution" description="Service-provider classifications and evidence supporting the wallet attribution." action={<Pill tone="amber"><Sparkles size={12} /> Model-assisted</Pill>} /><div className="grid gap-5 md:grid-cols-2">{(item.vasp || []).map((vasp, index) => <Panel key={index} title={vasp.name} eyebrow="Attribution candidate" action={<Pill tone={vasp.confidence >= .7 ? 'green' : 'amber'}>{vasp.classification}</Pill>}><div className="p-5"><div className="mb-4 flex items-center justify-between"><span className="text-[10px] uppercase tracking-widest text-slate-400">Confidence</span><span className="font-mono-data text-2xl text-cyan-700">{vasp.confidence}</span></div><div className="mb-5 h-1.5 bg-slate-100"><div className="h-1.5 bg-cyan-500" style={{ width: `${Math.min(100, vasp.confidence * 100)}%` }} /></div><div className="space-y-2">{vasp.evidence.map((evidence) => <div className="flex gap-2 text-xs text-slate-600" key={evidence}><Check size={14} className="mt-0.5 shrink-0 text-cyan-600" />{evidence}</div>)}</div><div className="mt-5 border-t border-slate-100 pt-3 font-mono-data text-[9px] text-slate-400">CASE {item.reference} · INFERENCE LABEL REQUIRED</div></div></Panel>)}{!item.vasp?.length && <div className="md:col-span-2"><EmptyState title="No VASP candidates" description="Run analysis to populate attribution candidates." /></div>}</div></div>;
  return <GeoPage item={item} />;
}

function GeoPage({ item }: { item: CaseDetail }) {
  const predictionQuery = useGetPredictions(item.id);
  const prediction = (predictionQuery.data || item.predictions) as PredictionResult | undefined; const hotspots = prediction?.hotspots || [];
  return <div className="enter"><PageHead kicker={`Geospatial / ${item.reference}`} title="Geo & prediction" description="Observed geography and model-predicted cash-out hotspots. Inference is explicitly labeled; validate before action." action={<Pill tone="amber"><Sparkles size={12} /> Synthetic / model inference</Pill>} /><div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Hotspots" value={String(hotspots.length)} detail="Predicted locations" tone="amber" icon={Globe2} /><Metric label="Peak probability" value={hotspots.length ? `${Math.round(Math.max(...hotspots.map((h) => h.probability)) * 100)}%` : '—'} detail="Model output" tone="red" icon={Target} /><Metric label="Model" value={prediction?.modelVersion || '—'} detail="Prediction version" tone="slate" icon={Sparkles} /><Metric label="Generated" value={prediction?.generatedAt ? dateOnly(prediction.generatedAt) : '—'} detail="Inference timestamp" tone="cyan" icon={Clock3} /></div><div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]"><Panel title="Cash-out heatmap" eyebrow="Synthetic / predicted surface"><div className="relative min-h-[420px] overflow-hidden bg-[#e8eff0]" data-testid="geo-heatmap"><div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'linear-gradient(32deg, transparent 48%, #b3cccf 49%, transparent 51%), linear-gradient(112deg, transparent 48%, #b3cccf 49%, transparent 51%)', backgroundSize: '88px 88px' }} /><div className="absolute left-[12%] top-[22%] h-32 w-48 rounded-full bg-cyan-400/20 blur-2xl" /><div className="absolute left-[48%] top-[42%] h-48 w-56 rounded-full bg-amber-400/40 blur-2xl" /><div className="absolute left-[67%] top-[24%] h-28 w-32 rounded-full bg-red-400/30 blur-2xl" />{hotspots.map((spot, index) => <button key={spot.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${18 + (index * 23) % 66}%`, top: `${24 + (index * 29) % 58}%` }} data-testid={`button-hotspot-${spot.id}`}><span className="flex size-9 items-center justify-center rounded-full border-2 border-red-500 bg-red-500/20 text-[9px] font-bold text-red-800 shadow-[0_0_0_7px_rgba(239,68,68,.12)]">{Math.round(spot.probability * 100)}%</span></button>)}<div className="absolute bottom-4 left-4 flex items-center gap-3 bg-white/90 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-500"><span className="size-2 rounded-full bg-cyan-400" />Low <span className="size-2 rounded-full bg-amber-400" />Elevated <span className="size-2 rounded-full bg-red-500" />High</div></div></Panel><Panel title="Predicted cash-out locations" eyebrow="Hotspot register / validate before action"><div className="divide-y divide-slate-100">{hotspots.map((spot) => <div className="p-4" key={spot.id} data-testid={`row-hotspot-${spot.id}`}><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-slate-800">{spot.city}</div><div className="mt-1 text-[11px] text-slate-500">{spot.atm} · {spot.branch}</div></div><Pill tone="red">{Math.round(spot.probability * 100)}% probability</Pill></div><div className="mt-3 grid grid-cols-2 gap-3 text-[10px]"><div><div className="text-slate-400">Window</div><div className="mt-1 font-mono-data">{spot.timeWindow}</div></div><div><div className="text-slate-400">Exposure</div><div className="mt-1 font-mono-data">{money(spot.amount)}</div></div></div><div className="mt-3 flex flex-wrap gap-1">{spot.factors.map((factor) => <Pill key={factor}>{factor}</Pill>)}</div></div>)}{!hotspots.length && <EmptyState title="No hotspots returned" description="The provider has not produced a predictive cash-out surface for this case." />}</div></Panel></div></div>;
}

function InterventionsPage() {
  const cases = useListCases(); const selected = getCasesArray(cases.data)[0]?.id || ''; const intervention = useGetIntervention(selected); const approve = useApproveIntervention(); const create = useCreateIntervention();
  if (cases.isLoading || intervention.isLoading) return <LoadingState />; if (intervention.isError || !intervention.data) return <EmptyState title="No intervention request" description="Select an analyzed case to prepare an evidence-backed request." action={<Link href="/cases" className="mt-4 bg-slate-800 px-3 py-2 text-xs font-bold text-amber-300" data-testid="link-intervention-case">Open case desk</Link>} />;
  const item = intervention.data as Intervention;
  return <div className="enter"><PageHead kicker={`Action review / ${item.caseId}`} title="Interventions" description="Review the authorized request, then explicitly approve. Approval is recorded against the case audit trail." action={<Pill tone={item.status?.toLowerCase().includes('approved') ? 'green' : 'amber'}>{item.status}</Pill>} /><div className="grid gap-5 xl:grid-cols-[1fr_.7fr]"><Panel title="Intervention request" eyebrow="Evidence-backed / human approval required"><div className="p-5"><div className="grid gap-4 sm:grid-cols-2"><div><div className="label">Request type</div><div className="value">{titleCase(item.requestType)}</div></div><div><div className="label">Approval gate</div><div className="value">{item.approvalRequired ? 'Required' : 'Not required'}</div></div><div><div className="label">Account</div><div className="value font-mono-data">{item.account}</div></div><div><div className="label">Institution</div><div className="value">{item.bank} · {item.branch}</div><div className="text-[10px] text-slate-400">{item.ifsc}</div></div></div><div className="mt-5 border-l-2 border-amber-400 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><div className="mb-1 font-bold uppercase tracking-widest text-[10px]">Analyst rationale</div>{item.reason}</div><div className="mt-5 flex flex-wrap items-center gap-3"><button disabled={approve.isPending || item.status?.toLowerCase().includes('approved')} onClick={() => approve.mutate({ caseId: selected }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: intervention.queryKey }) })} className="flex items-center gap-2 bg-slate-800 px-4 py-2.5 text-xs font-bold text-amber-300 disabled:opacity-50" data-testid="button-approve-intervention"><Check size={15} />{item.status?.toLowerCase().includes('approved') ? 'Approved' : approve.isPending ? 'Approving...' : 'Approve intervention'}</button><button onClick={() => create.mutate({ caseId: selected, data: { requestType: item.requestType } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: intervention.queryKey }) })} className="flex items-center gap-2 border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700" data-testid="button-refresh-intervention"><RefreshCw size={14} /> Prepare latest request</button></div></div></Panel><Panel title="Control notes" eyebrow="Governance / audit"><div className="space-y-4 p-5 text-xs text-slate-600"><div className="flex gap-3"><LockKeyhole size={16} className="shrink-0 text-cyan-600" /><span>Only authorized investigators may approve an intervention.</span></div><div className="flex gap-3"><FileCheck2 size={16} className="shrink-0 text-cyan-600" /><span>Approval status and actor are retained in the audit feed.</span></div><div className="flex gap-3"><Pause size={16} className="shrink-0 text-amber-600" /><span>Provider state: {item.submittedAt ? `submitted ${dateTime(item.submittedAt)}` : 'not submitted'}.</span></div></div></Panel></div></div>;
}

function ReportsPage() {
  const cases = useListCases(); const selected = getCasesArray(cases.data)[0]?.id || ''; const report = useGetReport(selected);
  if (cases.isLoading || report.isLoading) return <LoadingState rows={7} />; if (report.isError || !report.data) return <EmptyState title="Report not available" description="Select a case with report data to generate a reviewable investigation brief." action={<Link href="/cases" className="mt-4 bg-slate-800 px-3 py-2 text-xs font-bold text-amber-300" data-testid="link-report-case">Open case desk</Link>} />;
  const data = report.data as Report;
  return <div className="enter"><PageHead kicker={`Report / ${data.case.reference}`} title="Reports" description="Generated investigation brief assembled from the case intelligence graph." action={<button onClick={() => window.print()} className="flex items-center gap-2 border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700" data-testid="button-print-report"><FileText size={15} /> Print / export</button>} /><div className="mx-auto max-w-5xl border border-slate-200 bg-white shadow-sm"><div className="border-b-4 border-amber-400 bg-slate-800 p-7 text-slate-100"><div className="flex items-start justify-between"><div><div className="font-mono-data text-[10px] uppercase tracking-[.2em] text-cyan-300">CASHNET / intelligence brief</div><h2 className="mt-4 text-2xl font-extrabold">{data.case.title}</h2><div className="mt-2 font-mono-data text-xs text-slate-400">{data.case.reference} · generated {dateTime(new Date().toISOString())}</div></div><Fingerprint size={34} className="text-amber-300" /></div></div><div className="p-7"><div className="mb-7 grid grid-cols-2 gap-4 border-b border-slate-200 pb-6 sm:grid-cols-4"><div><div className="label">Classification</div><div className="value">{data.case.fraudType}</div></div><div><div className="label">Exposure</div><div className="value font-mono-data">{money(data.case.amount)}</div></div><div><div className="label">Priority</div><div className="value">{data.case.priority}</div></div><div><div className="label">Conversion</div><div className="value font-mono-data text-[11px]">{dateTime(data.case.conversionAt)}</div></div></div><div className="space-y-6">{(data.sections || []).map((section, index) => <div key={index} className="border-l-2 border-cyan-400 pl-4"><h3 className="text-sm font-extrabold text-slate-800">{String(section.title ?? section.heading ?? `Section ${index + 1}`)}</h3><p className="mt-2 text-xs leading-6 text-slate-600">{String(section.content ?? section.summary ?? Object.values(section).join(' · '))}</p></div>)}</div><div className="mt-8 border-t border-slate-200 pt-4 text-[10px] leading-5 text-slate-400"><span className="font-bold uppercase tracking-widest text-slate-500">Handling note · </span>{data.disclaimer}</div></div></div></div>;
}

function AuditPage() {
  const cases = useListCases(); const selected = getCasesArray(cases.data)[0]?.id || ''; const detail = useGetCase(selected);
  if (cases.isLoading || detail.isLoading) return <LoadingState />;
  const audit = detail.data?.audit || [];
  return <div className="enter"><PageHead kicker={`Chain of custody / ${detail.data?.reference || 'case selection'}`} title="Audit trail" description="Immutable-looking activity view sourced from the selected case record. Use it to validate analyst actions and provider events." action={<Pill tone="cyan"><FileCheck2 size={12} /> Evidence log</Pill>} /><Panel title="Recorded actions" eyebrow={`${audit.length} events / chronological`}><div className="divide-y divide-slate-100">{audit.map((event, index) => <div className="grid gap-3 p-4 sm:grid-cols-[150px_1fr_150px_110px] sm:items-center" key={index} data-testid={`row-audit-${index}`}><div className="font-mono-data text-[10px] text-slate-500">{dateTime(event.timestamp)}</div><div className="flex items-center gap-2 text-xs font-bold text-slate-800"><span className="flex size-6 items-center justify-center rounded-full bg-cyan-100 text-cyan-700"><Activity size={12} /></span>{event.action}</div><div className="text-xs text-slate-500">{event.actor}</div><Pill>{event.source}</Pill></div>)}{!audit.length && <EmptyState title="Audit trail is empty" description="Actions will appear once an authorized workflow has been initiated." />}</div></Panel></div>;
}

function SettingsPage() {
  const health = useHealthCheck(); const [synthetic, setSynthetic] = useState(true); const [provider, setProvider] = useState('Primary intelligence mesh');
  return <div className="enter"><PageHead kicker="Control plane / local preferences" title="Settings" description="Configure how synthetic labels and provider health are presented in this workspace." action={<Pill tone={health.isError ? 'red' : 'green'}><span className="size-1.5 rounded-full bg-current" />{health.isLoading ? 'Checking' : health.data?.status || 'Connected'}</Pill>} /><div className="grid gap-5 lg:grid-cols-2"><Panel title="Synthetic data policy" eyebrow="Display / inference labeling"><div className="space-y-5 p-5"><div className="flex items-center justify-between gap-5"><div><div className="text-sm font-bold text-slate-800">Always label model inference</div><div className="mt-1 text-xs leading-5 text-slate-500">Keep synthetic, predicted and model-assisted content visibly marked throughout the workspace.</div></div><button onClick={() => setSynthetic(!synthetic)} className={`relative h-6 w-11 rounded-full ${synthetic ? 'bg-cyan-600' : 'bg-slate-300'}`} data-testid="button-toggle-synthetic"><span className={`absolute top-1 size-4 rounded-full bg-white transition-transform ${synthetic ? 'left-6' : 'left-1'}`} /></button></div><div className="border border-cyan-200 bg-cyan-50 p-3 text-[11px] leading-5 text-cyan-900"><Sparkles size={14} className="mr-2 inline" />{synthetic ? 'Labels are active: synthetic / model inference content is marked.' : 'Labels are hidden in the presentation layer. Source data remains unchanged.'}</div></div></Panel><Panel title="Provider routing" eyebrow="Connection / health"><div className="space-y-4 p-5"><label className="label">Active provider<select value={provider} onChange={(e) => setProvider(e.target.value)} className="field mt-2" data-testid="select-provider"><option>Primary intelligence mesh</option><option>Evidence vault mirror</option><option>Restricted training sandbox</option></select></label><div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs"><span className="text-slate-500">API health status</span><span className="font-mono-data font-bold text-cyan-700">{health.data?.status || (health.isError ? 'Unavailable' : 'Checking...')}</span></div><button onClick={() => health.refetch()} className="flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700" data-testid="button-refresh-health"><RefreshCw size={13} /> Refresh health</button></div></Panel></div><div className="mt-5 border border-slate-200 bg-slate-800 p-5 text-slate-200"><div className="flex items-center gap-2 text-xs font-bold"><Shield size={15} className="text-amber-300" /> Access boundary</div><p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">CASHNET is an authorized investigation workspace. Provider responses are presented for analyst review; model predictions do not replace human approval or institutional procedure.</p></div></div>;
}

function FundFlowRoute() {
  const cases = useListCases(); const selected = getCasesArray(cases.data)[0]?.id || '';
  const [, navigate] = useLocation();
  if (cases.isLoading) return <LoadingState />;
  if (selected) { navigate(`/fund-flow/${selected}`); return null; }
  return <EmptyState title="Select a case to open fund flow" description="Fund flow is synchronized to a case. Ingest or select a case from the desk first." action={<Link href="/cases" className="mt-4 bg-slate-800 px-3 py-2 text-xs font-bold text-amber-300" data-testid="link-fund-flow-cases">Open case desk</Link>} />;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/" component={LandingPage} />
    <Route>
      <Shell><Switch>
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/predictive-engine" component={PredictiveEnginePage} />
        <Route path="/alerts" component={AlertsPage} />
        <Route path="/cases" component={CasesPage} />
        <Route path="/cases/:id" component={CaseWorkspacePage} />
        <Route path="/fund-flow" component={FundFlowRoute} />
        <Route path="/fund-flow/:caseId" component={FundFlowPage} />
        <Route path="/crypto" component={WalletsPage} />
        <Route path="/vasp" component={() => <CaseScopedPage kind="vasp" />} />
        <Route path="/geo" component={() => <CaseScopedPage kind="geo" />} />
        <Route path="/historical-activity" component={HistoricalActivityPage} />
        <Route path="/interventions" component={InterventionsPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/audit" component={AuditPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch></Shell>
    </Route>
  </Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></QueryClientProvider>;
}

export default App;

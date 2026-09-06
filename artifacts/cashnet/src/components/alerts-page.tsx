import { useState } from "react";
import {
  Bell, AlertTriangle, Building2, Check, CheckCircle2, Clock, ExternalLink,
  Mail, MessageSquare, PhoneCall, Radio, Send, ShieldAlert, Smartphone, Zap
} from "lucide-react";

interface TriggeredAlert {
  id: string;
  caseId: string;
  title: string;
  targetLocation: string;
  riskScore: number;
  timestamp: string;
  channels: Array<"SMS" | "EMAIL" | "BANK_API" | "I4C_DASHBOARD">;
  status: "DISPATCHED" | "ACKNOWLEDGED" | "ACTIONED";
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<TriggeredAlert[]>([
    {
      id: "ALT-2026-001",
      caseId: "CASE-CASHNET-001",
      title: "Predicted High-Value ATM Cash-Out Cluster",
      targetLocation: "Bengaluru · Indiranagar Branch ATM (82% Prob)",
      riskScore: 92,
      timestamp: new Date().toISOString(),
      channels: ["SMS", "EMAIL", "BANK_API", "I4C_DASHBOARD"],
      status: "DISPATCHED"
    },
    {
      id: "ALT-2026-002",
      caseId: "CASE-CASHNET-002",
      title: "FIAT → CRYPTO Rapid Conversion Detected",
      targetLocation: "VASP Alpha · Mumbai Exchange Terminal",
      riskScore: 88,
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      channels: ["SMS", "EMAIL", "I4C_DASHBOARD"],
      status: "ACKNOWLEDGED"
    },
    {
      id: "ALT-2026-003",
      caseId: "CASE-CASHNET-003",
      title: "Multi-Hop Mule Account Layering Alert",
      targetLocation: "Hyderabad · Cooperative Bank Mule Account",
      riskScore: 84,
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      channels: ["BANK_API", "I4C_DASHBOARD"],
      status: "ACTIONED"
    }
  ]);

  const [selectedCase, setSelectedCase] = useState<string>("CASE-CASHNET-001");
  const [smsTarget, setSmsTarget] = useState<string>("+91 98765 43210 (Karnataka Police LEA)");
  const [emailTarget, setEmailTarget] = useState<string>("nodal.officer@snb-bank.in");
  const [smsActive, setSmsActive] = useState<boolean>(true);
  const [emailActive, setEmailActive] = useState<boolean>(true);
  const [bankApiActive, setBankApiActive] = useState<boolean>(true);
  const [i4cActive, setI4cActive] = useState<boolean>(true);
  const [dispatching, setDispatching] = useState<boolean>(false);
  const [dispatchSuccess, setDispatchSuccess] = useState<boolean>(false);

  const handleDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    setDispatching(true);
    setDispatchSuccess(false);

    setTimeout(() => {
      const activeChannels: Array<"SMS" | "EMAIL" | "BANK_API" | "I4C_DASHBOARD"> = [];
      if (smsActive) activeChannels.push("SMS");
      if (emailActive) activeChannels.push("EMAIL");
      if (bankApiActive) activeChannels.push("BANK_API");
      if (i4cActive) activeChannels.push("I4C_DASHBOARD");

      const newAlert: TriggeredAlert = {
        id: `ALT-2026-${String(alerts.length + 1).padStart(3, "0")}`,
        caseId: selectedCase,
        title: "Proactive Field Team & Bank Freeze Dispatch",
        targetLocation: "Bengaluru · Indiranagar 100ft Rd ATM",
        riskScore: 94,
        timestamp: new Date().toISOString(),
        channels: activeChannels,
        status: "DISPATCHED"
      };

      setAlerts([newAlert, ...alerts]);
      setDispatching(false);
      setDispatchSuccess(true);
      setTimeout(() => setDispatchSuccess(false), 5000);
    }, 500);
  };

  return (
    <div className="enter space-y-6">
      {/* Header */}
      <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono-data text-[10px] font-bold uppercase tracking-[.18em] text-cyan-700">
            <span className="size-2 bg-amber-400" /> Deliverable D · Ministry of Home Affairs (I4C)
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
            Real-Time Alert & Notification System
          </h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            Multi-channel automated notification dispatch transmitting actionable intelligence triggers to state law enforcement, bank nodal officers, and the I4C central portal via SMS, Email, API, and Dashboard alerts.
          </p>
        </div>
      </header>

      {/* 4 Dispatch Channel Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="font-mono-data text-[10px] font-bold uppercase text-cyan-700">Channel 1</span>
            <Smartphone size={18} className="text-cyan-600" />
          </div>
          <h3 className="mt-2 text-sm font-extrabold text-slate-800">SMS LEA Field Alert</h3>
          <p className="mt-1 text-[11px] text-slate-500">Instant SMS dispatch to special police teams and local patrol units.</p>
          <div className="mt-3 flex items-center gap-1.5 font-mono-data text-[10px] font-bold text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Active · Gateway Ready
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="font-mono-data text-[10px] font-bold uppercase text-amber-700">Channel 2</span>
            <Mail size={18} className="text-amber-600" />
          </div>
          <h3 className="mt-2 text-sm font-extrabold text-slate-800">Email Nodal Dispatch</h3>
          <p className="mt-1 text-[11px] text-slate-500">Structured intelligence reports sent to bank fraud prevention officers.</p>
          <div className="mt-3 flex items-center gap-1.5 font-mono-data text-[10px] font-bold text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Active · SMTP Ready
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="font-mono-data text-[10px] font-bold uppercase text-red-700">Channel 3</span>
            <Building2 size={18} className="text-red-600" />
          </div>
          <h3 className="mt-2 text-sm font-extrabold text-slate-800">Bank API Hold Trigger</h3>
          <p className="mt-1 text-[11px] text-slate-500">Automated fund blocking & debit freeze signal sent to financial institutions.</p>
          <div className="mt-3 flex items-center gap-1.5 font-mono-data text-[10px] font-bold text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Active · REST API 2.0
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="font-mono-data text-[10px] font-bold uppercase text-purple-700">Channel 4</span>
            <Radio size={18} className="text-purple-600" />
          </div>
          <h3 className="mt-2 text-sm font-extrabold text-slate-800">I4C Dashboard Trigger</h3>
          <p className="mt-1 text-[11px] text-slate-500">Centralized alert badge and incident trigger for national I4C officers.</p>
          <div className="mt-3 flex items-center gap-1.5 font-mono-data text-[10px] font-bold text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Active · WebSockets Live
          </div>
        </div>
      </div>

      {/* Main Grid: Alert Dispatch Console & Notification Feed */}
      <div className="grid gap-6 xl:grid-cols-[450px_1fr]">
        {/* Dispatch Console */}
        <section className="border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 border-b border-slate-100 pb-3">
            <div className="font-mono-data text-[10px] font-bold uppercase tracking-wider text-cyan-700">
              Proactive Alert Dispatch Center
            </div>
            <h2 className="mt-1 text-base font-extrabold text-slate-800">Simulate Real-Time Notification</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Select target incident and channels to trigger proactive intelligence alerts.</p>
          </div>

          {dispatchSuccess && (
            <div className="mb-4 flex items-center gap-2 border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              Notifications successfully dispatched across selected channels!
            </div>
          )}

          <form onSubmit={handleDispatch} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600">Active Cybercrime Case</label>
              <select
                value={selectedCase}
                onChange={(e) => setSelectedCase(e.target.value)}
                className="mt-1 w-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:bg-white"
              >
                <option value="CASE-CASHNET-001">CASE-CASHNET-001 · Bengaluru Investment Impersonation</option>
                <option value="CASE-CASHNET-002">CASE-CASHNET-002 · Mumbai Crypto Scam</option>
                <option value="CASE-CASHNET-003">CASE-CASHNET-003 · Hyderabad Layering Scam</option>
              </select>
            </div>

            <div className="space-y-2.5 border border-slate-100 bg-slate-50 p-3">
              <span className="block text-[10px] font-extrabold uppercase text-slate-500">Target Dispatch Channels</span>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsActive}
                  onChange={(e) => setSmsActive(e.target.checked)}
                  className="rounded border-slate-300 text-cyan-600"
                />
                <Smartphone size={14} className="text-cyan-600" />
                SMS LEA Alert (+91 Police Field Officers)
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailActive}
                  onChange={(e) => setEmailActive(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600"
                />
                <Mail size={14} className="text-amber-600" />
                Email Nodal Officer Dispatch
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bankApiActive}
                  onChange={(e) => setBankApiActive(e.target.checked)}
                  className="rounded border-slate-300 text-red-600"
                />
                <Building2 size={14} className="text-red-600" />
                Bank API Automated Account Freeze Signal
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={i4cActive}
                  onChange={(e) => setI4cActive(e.target.checked)}
                  className="rounded border-slate-300 text-purple-600"
                />
                <Radio size={14} className="text-purple-600" />
                National I4C Dashboard Trigger
              </label>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600">Police LEA Recipient</label>
              <input
                type="text"
                value={smsTarget}
                onChange={(e) => setSmsTarget(e.target.value)}
                className="mt-1 w-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600">Bank Nodal Officer Recipient</label>
              <input
                type="text"
                value={emailTarget}
                onChange={(e) => setEmailTarget(e.target.value)}
                className="mt-1 w-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={dispatching}
              className="flex w-full items-center justify-center gap-2 bg-slate-900 py-3 text-xs font-extrabold text-amber-300 hover:bg-slate-800 disabled:opacity-50"
            >
              <Send size={14} />
              {dispatching ? "Transmitting Alerts..." : "Dispatch Real-Time Proactive Alerts"}
            </button>
          </form>
        </section>

        {/* Real-Time Notification History Feed */}
        <section className="border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <div className="font-mono-data text-[10px] font-bold uppercase tracking-wider text-cyan-700">
                Audit Log & Telemetry
              </div>
              <h2 className="text-base font-extrabold text-slate-800">Notification History & Dispatch Feed</h2>
            </div>
            <span className="font-mono-data text-xs text-slate-400">{alerts.length} Records</span>
          </div>

          <div className="divide-y divide-slate-100">
            {alerts.map((alt) => (
              <div key={alt.id} className="py-4 hover:bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-data text-xs font-bold text-cyan-800">{alt.id}</span>
                    <span className="font-mono-data text-[10px] text-slate-400">· {alt.caseId}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                    alt.status === "DISPATCHED" ? "bg-amber-100 text-amber-800" :
                    alt.status === "ACKNOWLEDGED" ? "bg-cyan-100 text-cyan-800" : "bg-emerald-100 text-emerald-800"
                  }`}>
                    {alt.status}
                  </span>
                </div>

                <h3 className="mt-1.5 text-xs font-extrabold text-slate-800">{alt.title}</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">{alt.targetLocation}</p>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {alt.channels.map((ch) => (
                      <span key={ch} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono-data text-[9px] font-bold text-slate-600">
                        {ch}
                      </span>
                    ))}
                  </div>
                  <span className="font-mono-data text-[10px] text-slate-400">
                    {new Date(alt.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

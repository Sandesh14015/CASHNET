import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Crosshair, Fingerprint, Shield, Globe2, Network,
  Building2, Cpu, MapPinned, Bell, Activity, Menu, X, ArrowRight, Target, LockKeyhole,
  Check, WalletCards, ShieldAlert, ChevronRight, FileText, Database
} from "lucide-react";
import "./landing.css";

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const features = [
    { title: "Predictive Engine", subtitle: "Model 184", desc: "Ranked ATM cash-out hotspots with probability windows based on synthetic models.", icon: Cpu, color: "cyan" },
    { title: "Risk Heatmap", subtitle: "GIS Dashboard", desc: "Geospatial historical activity surface identifying high-risk geographic corridors.", icon: MapPinned, color: "amber" },
    { title: "Law Enforcement", subtitle: "Investigator Desk", desc: "Full case workspace to manage complaints, trace evidence, and review intel.", icon: Fingerprint, color: "slate" },
    { title: "Notification System", subtitle: "Real-time Alerts", desc: "Live intelligence feed for immediate intervention routing and approval.", icon: Bell, color: "red" }
  ];

  const modules = [
    { title: "Fund Flow Graph", icon: Network, desc: "SVG relationship graph mapping multi-hop transactions with chronological event timelines." },
    { title: "Crypto & VASP Intel", icon: WalletCards, desc: "Wallet registry with chain tracking, inflow/outflow analysis, and VASP attribution scoring." },
    { title: "Risk Assessment", icon: Activity, desc: "Transparent analytical baseline with scores, categories, confidence levels, and contributing features." },
    { title: "Intervention Review", icon: ShieldAlert, desc: "Actionable intel workflow enabling investigators to draft, review, and explicitly approve interventions." }
  ];

  const workflowSteps = [
    "Report In", "Account Analysis", "Transactions", "Fund Flow", 
    "Crypto", "VASP", "Risk", "Geospatial", "Predicted Cash-out", 
    "Actionable Intel", "Last Credited", "Bank/Branch", "Intervention", "Audit/Report"
  ];

  return (
    <div className="cashnet-landing bg-slate-50 text-slate-900 font-sans min-h-screen overflow-x-hidden selection:bg-amber-300 selection:text-slate-900">
      
      {/* Navbar */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-200 ${scrolled ? "bg-[hsl(214,39%,17%)]/95 backdrop-blur-md shadow-md border-b border-white/5" : "bg-[hsl(214,39%,17%)] border-b border-transparent"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 md:h-20">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative flex h-8 w-8 md:h-10 md:w-10 shrink-0 items-center justify-center border border-amber-300/50 bg-amber-400 text-slate-900 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                <Crosshair size={20} strokeWidth={2.6} className="md:w-6 md:h-6" />
                <span className="absolute -right-1 -top-1 h-2 w-2 md:h-2.5 md:w-2.5 rounded-full bg-cyan-400 border border-slate-900 animate-pulse" />
              </div>
              <div className="flex flex-col justify-center">
                <div className="text-lg md:text-xl font-extrabold tracking-[.14em] text-slate-100 leading-none">CASHNET</div>
                <div className="font-mono text-[8px] md:text-[10px] uppercase tracking-[.18em] text-cyan-400 mt-1">Financial Intelligence</div>
              </div>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-colors">Platform</a>
              <a href="#workflow" className="text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-colors">Workflow</a>
              <a href="#security" className="text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-colors">Security</a>
              <Link href="/dashboard" className="flex items-center gap-2 bg-amber-400 px-5 py-2 text-xs font-extrabold text-slate-900 hover:bg-amber-300 transition-transform active:scale-95 shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:shadow-[0_0_20px_rgba(245,158,11,0.4)] rounded-sm">
                Open Desk <ArrowRight size={14} strokeWidth={3} />
              </Link>
            </nav>

            {/* Mobile Menu Button */}
            <button className="md:hidden text-slate-300 hover:text-white p-2" onClick={() => setMobileMenuOpen(true)}>
              <Menu size={24} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-[hsl(214,39%,17%)] flex flex-col pt-16 px-6 animate-fade-in-up">
          <button className="absolute top-4 right-4 text-slate-300 hover:text-white p-2" onClick={() => setMobileMenuOpen(false)}>
            <X size={28} />
          </button>
          <div className="flex flex-col gap-6 mt-8">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-xl font-bold text-white tracking-wide border-b border-slate-700 pb-4">Platform Modules</a>
            <a href="#workflow" onClick={() => setMobileMenuOpen(false)} className="text-xl font-bold text-white tracking-wide border-b border-slate-700 pb-4">Analysis Pipeline</a>
            <a href="#security" onClick={() => setMobileMenuOpen(false)} className="text-xl font-bold text-white tracking-wide border-b border-slate-700 pb-4">Data Security</a>
            <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="mt-4 flex items-center justify-center gap-2 bg-amber-400 px-6 py-4 text-sm font-extrabold text-slate-900 rounded-sm">
              Open Investigator Desk <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative pt-28 pb-16 md:pt-40 md:pb-24 bg-[hsl(214,39%,17%)] overflow-hidden border-b border-slate-800">
        <div className="absolute inset-0 dark-pattern opacity-30 mix-blend-overlay"></div>
        <div className="glow-orb-cyan w-[400px] h-[400px] md:w-[600px] md:h-[600px] -top-[100px] -left-[100px] opacity-60"></div>
        <div className="glow-orb-amber w-[300px] h-[300px] md:w-[500px] md:h-[500px] top-[10%] -right-[100px] opacity-40"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-cyan-500/30 bg-cyan-900/30 mb-6 md:mb-8 animate-fade-in-up backdrop-blur-sm shadow-sm shadow-cyan-900/20">
            <span className="flex h-1.5 w-1.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400"></span>
            </span>
            <span className="text-[9px] md:text-[10px] font-mono font-bold uppercase tracking-[.2em] text-cyan-300">
              L3 Investigator Network
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-7xl font-extrabold text-white tracking-tight max-w-5xl leading-[1.1] animate-fade-in-up delay-100 drop-shadow-lg">
            Financial Intelligence for <br className="hidden md:block" />
            <span className="text-amber-400 relative inline-block mt-2">
              Authorized Investigators
              <div className="absolute -bottom-1 left-0 w-full h-[3px] md:h-[4px] bg-amber-400/80"></div>
            </span>
          </h1>
          
          <p className="mt-6 md:mt-8 text-sm md:text-base text-slate-300 max-w-2xl leading-relaxed animate-fade-in-up delay-200 font-medium">
            CASHNET connects complaint indicators, account analysis, multi-hop fund flow, crypto tracing, and geospatial prediction into one secure workspace.
          </p>

          <div className="mt-8 md:mt-10 flex flex-col sm:flex-row gap-4 animate-fade-in-up delay-300 w-full sm:w-auto">
            <Link href="/dashboard" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-amber-400 px-8 py-3.5 text-sm font-extrabold text-slate-900 hover:bg-amber-300 transition-transform active:scale-95 rounded-sm shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <Target size={16} strokeWidth={2.5} /> Open Platform
            </Link>
            <a href="#features">
              <button className="w-full sm:w-auto flex items-center justify-center gap-2 border border-slate-600 bg-slate-800/80 px-8 py-3.5 text-sm font-bold text-white hover:bg-slate-700 hover:border-slate-500 transition-colors rounded-sm backdrop-blur-sm">
                View Capabilities <ArrowRight size={16} />
              </button>
            </a>
          </div>

          {/* Enhanced Product Preview Mockup */}
          <div className="mt-16 md:mt-20 w-full max-w-5xl mx-auto rounded-t-lg border border-slate-700/80 bg-slate-900 shadow-2xl overflow-hidden animate-fade-in-up delay-300">
            {/* Mock Browser/App Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950/80">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
              </div>
              <div className="mx-auto flex items-center gap-2 bg-slate-900 px-3 py-1 rounded text-[9px] text-slate-500 font-mono border border-slate-800">
                <LockKeyhole size={10} className="text-cyan-500" /> cashnet.workspace.local / case-investigation
              </div>
            </div>
            
            {/* Mock App Body */}
            <div className="flex flex-col md:flex-row h-[350px] md:h-[450px] bg-slate-950 relative">
              {/* Mock App Sidebar */}
              <div className="w-16 hidden md:flex flex-col items-center py-4 bg-[hsl(214,39%,17%)] border-r border-slate-800 shrink-0 gap-4">
                <div className="w-8 h-8 rounded-sm bg-amber-400 flex items-center justify-center mb-4">
                  <Crosshair size={18} className="text-slate-900" />
                </div>
                <div className="w-8 h-8 rounded-sm bg-slate-800/80 border-l-2 border-amber-400"></div>
                <div className="w-8 h-8 rounded-sm bg-slate-800/40"></div>
                <div className="w-8 h-8 rounded-sm bg-slate-800/40"></div>
                <div className="w-8 h-8 rounded-sm bg-slate-800/40 mt-auto"></div>
              </div>

              {/* Mock App Content */}
              <div className="flex-1 flex flex-col relative z-0 overflow-hidden">
                {/* Top Content Bar */}
                <div className="h-12 border-b border-slate-800/60 flex items-center justify-between px-4 bg-slate-900/40 shrink-0">
                   <div className="flex items-center gap-3">
                     <div className="font-mono text-[10px] md:text-xs text-slate-300 font-bold tracking-widest">
                       CASE-CASHNET-001
                     </div>
                     <div className="px-1.5 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-sm text-[8px] uppercase tracking-wider font-bold">
                       High Risk
                     </div>
                   </div>
                   <div className="flex items-center gap-3">
                     <div className="h-6 w-32 bg-slate-800/60 rounded-sm border border-slate-700/50 hidden md:block"></div>
                     <div className="h-6 w-6 bg-[hsl(214,39%,17%)] rounded-sm border border-slate-700"></div>
                   </div>
                </div>

                <div className="flex-1 flex flex-col md:flex-row">
                  {/* Left Side: Case Details */}
                  <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-800/60 p-4 bg-slate-900/20 flex flex-col gap-4">
                    <div className="space-y-1">
                      <div className="text-[9px] font-mono uppercase text-slate-500 tracking-wider">Complaint Ref</div>
                      <div className="text-xs font-mono text-cyan-400">NCRP-SYN-260818</div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="text-[9px] font-mono uppercase text-slate-500 tracking-wider">Risk Indicators</div>
                      <div className="flex items-center justify-between bg-slate-800/40 border border-slate-700/50 p-2 rounded-sm border-l-[3px] border-l-red-500">
                        <span className="text-[10px] text-slate-300">Velocity Spike</span>
                        <span className="text-[10px] text-red-400 font-mono">98%</span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-800/40 border border-slate-700/50 p-2 rounded-sm border-l-[3px] border-l-amber-500">
                        <span className="text-[10px] text-slate-300">Crypto Fan-Out</span>
                        <span className="text-[10px] text-amber-400 font-mono">85%</span>
                      </div>
                    </div>

                    <div className="mt-auto hidden md:block">
                      <div className="bg-amber-400/10 border border-amber-400/20 p-3 rounded-sm">
                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1.5">
                          <Database size={10} /> Synthetic Data
                        </div>
                        <div className="text-[9px] text-amber-500/80 leading-tight">
                          Intelligence model inference. Awaiting human verification.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Fund Flow SVG */}
                  <div className="flex-1 relative bg-slate-950 overflow-hidden flex items-center justify-center p-4">
                    {/* Scanline Grid */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:100%_1.5rem] pointer-events-none"></div>
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:1.5rem_100%] pointer-events-none"></div>
                    
                    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid meet" className="w-full h-full opacity-90 max-h-[300px]">
                      {/* Edges */}
                      <path d="M 50,125 L 150,75" fill="none" stroke="#334155" strokeWidth="1.5" strokeDasharray="4 4" className="animate-[dash_20s_linear_infinite]" />
                      <path d="M 50,125 L 150,175" fill="none" stroke="#334155" strokeWidth="1.5" />
                      <path d="M 150,75 L 250,125" fill="none" stroke="#06b6d4" strokeWidth="2" opacity="0.6" />
                      <path d="M 150,175 L 250,125" fill="none" stroke="#06b6d4" strokeWidth="2" opacity="0.6" />
                      <path d="M 250,125 L 350,125" fill="none" stroke="#ef4444" strokeWidth="2" opacity="0.5" />

                      {/* Nodes */}
                      <circle cx="50" cy="125" r="8" fill="#1e293b" stroke="#f59e0b" strokeWidth="2.5" />
                      <text x="50" y="145" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">Source</text>
                      
                      <circle cx="150" cy="75" r="12" fill="#1e293b" stroke="#06b6d4" strokeWidth="2.5" />
                      <text x="150" y="55" fill="#94a3b8" fontSize="8" fontFamily="monospace" textAnchor="middle">Mule A</text>

                      <circle cx="150" cy="175" r="10" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
                      <text x="150" y="195" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">Mule B</text>

                      <circle cx="250" cy="125" r="16" fill="#1e293b" stroke="#ef4444" strokeWidth="2.5" />
                      <text x="250" y="152" fill="#f87171" fontSize="8" fontFamily="monospace" textAnchor="middle">Consolidation</text>

                      <circle cx="350" cy="125" r="24" fill="#1e293b" stroke="#f59e0b" strokeWidth="3" />
                      <circle cx="350" cy="125" r="4" fill="#f59e0b" className="animate-pulse" />
                      <text x="350" y="162" fill="#fbbf24" fontSize="8" fontFamily="monospace" textAnchor="middle">VASP Cash-out</text>
                    </svg>

                    {/* Graph Overlay Label */}
                    <div className="absolute top-4 right-4 px-2.5 py-1.5 bg-slate-950/80 border border-slate-800 text-[9px] text-slate-300 font-mono flex items-center gap-2 rounded-sm shadow-md">
                      <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse"></div>
                      LIVE TRACING MODEL
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* I4C Deliverables */}
      <section id="features" className="py-20 md:py-28 bg-slate-50 relative">
        <div className="absolute inset-0 hero-pattern opacity-40 mix-blend-multiply pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-12 md:mb-16">
            <div className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-700 mb-3 md:mb-4 flex justify-center items-center gap-2">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-none"></span> Foundational Architecture
            </div>
            <h2 className="text-2xl md:text-4xl font-extrabold text-slate-900 tracking-tight">I4C Problem Deliverables</h2>
            <p className="mt-3 md:mt-4 max-w-2xl mx-auto text-slate-600 text-sm leading-relaxed font-medium">
              CASHNET is built around four primary pillars of intelligence to accelerate investigations and accurately model financial crime risks.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {features.map((f, i) => (
              <div key={i} className="group relative bg-white border border-slate-200 p-5 md:p-6 hover:border-slate-300 hover:shadow-md transition-all duration-300 rounded-sm">
                {/* Top Accent Line */}
                <div className={`absolute top-0 left-0 w-full h-[3px] transition-colors duration-300 ${
                  f.color === "cyan" ? "bg-slate-200 group-hover:bg-cyan-500" :
                  f.color === "amber" ? "bg-slate-200 group-hover:bg-amber-500" :
                  f.color === "red" ? "bg-slate-200 group-hover:bg-red-500" :
                  "bg-slate-200 group-hover:bg-slate-700"
                }`}></div>
                
                <div className={`w-10 h-10 flex items-center justify-center mb-5 rounded-sm transition-colors duration-300 ${
                  f.color === "cyan" ? "bg-cyan-50 text-cyan-700 group-hover:bg-cyan-100" :
                  f.color === "amber" ? "bg-amber-50 text-amber-700 group-hover:bg-amber-100" :
                  f.color === "red" ? "bg-red-50 text-red-700 group-hover:bg-red-100" :
                  "bg-slate-100 text-slate-700 group-hover:bg-slate-200"
                }`}>
                  <f.icon size={20} strokeWidth={2} />
                </div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-1.5">{f.subtitle}</div>
                <h3 className="text-sm font-extrabold text-slate-800 mb-2 leading-tight">{f.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow Pipeline */}
      <section id="workflow" className="py-20 md:py-28 bg-[hsl(214,39%,17%)] text-white relative overflow-hidden border-t border-slate-800">
        <div className="absolute inset-0 dark-pattern opacity-20 mix-blend-overlay pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-12 md:mb-16">
            <div className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-400 mb-3 flex justify-center items-center gap-2">
              <span className="w-1.5 h-1.5 bg-cyan-400 animate-pulse"></span> Standardized Execution
            </div>
            <h2 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight">Intelligence Pipeline</h2>
            <p className="mt-3 md:mt-4 text-slate-400 text-sm max-w-2xl mx-auto font-medium">
              A rigid, sequential 14-step workflow connecting initial reports to final actionable interventions.
            </p>
          </div>

          {/* Connected Pipeline Visualization */}
          <div className="flex flex-wrap items-center justify-center gap-y-3 gap-x-2 max-w-5xl mx-auto">
            {workflowSteps.map((step, idx) => (
              <React.Fragment key={idx}>
                <div className="flex items-center gap-2.5 bg-slate-800/60 border border-slate-700/80 px-3 md:px-4 py-2 hover:bg-slate-700 hover:border-cyan-500/50 transition-colors cursor-default rounded-sm shadow-sm">
                  <span className="font-mono text-[9px] md:text-[10px] text-cyan-400 font-bold">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="text-[11px] md:text-xs font-bold text-slate-200 whitespace-nowrap">{step}</span>
                </div>
                {idx < workflowSteps.length - 1 && (
                  <ChevronRight size={14} className="text-slate-600 hidden md:block" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* Core Modules (Reorganized) */}
      <section className="py-20 md:py-28 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-start">
            <div className="lg:w-1/3 lg:sticky lg:top-28">
              <div className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-400 mb-3 flex items-center gap-2">
                <FileText size={12} /> Deep Analysis
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-4 leading-tight tracking-tight">Advanced Platform Modules</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-8 font-medium">
                The investigator workspace provides an end-to-end toolkit, translating raw synthetic tables into connected, actionable insights.
              </p>
              <Link href="/dashboard" className="inline-flex items-center gap-2 text-xs font-bold text-slate-900 bg-amber-400 px-6 py-3 hover:bg-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)] rounded-sm transition-transform active:scale-95">
                Enter Workspace <ArrowRight size={14} strokeWidth={2.5} />
              </Link>
            </div>
            
            <div className="lg:w-2/3 grid sm:grid-cols-2 gap-4 w-full">
              {modules.map((m, i) => (
                <div key={i} className="bg-slate-50 border border-slate-200 p-5 md:p-6 border-l-[3px] border-l-slate-300 hover:border-l-cyan-500 transition-colors rounded-r-sm group">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="bg-white p-1.5 rounded shadow-sm border border-slate-100 text-slate-500 group-hover:text-cyan-600 transition-colors">
                      <m.icon size={18} strokeWidth={2} />
                    </div>
                    <h3 className="text-sm font-extrabold text-slate-800">{m.title}</h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Security / Data Policy */}
      <section id="security" className="py-20 md:py-28 bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[length:100%_4px] pointer-events-none"></div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="border border-amber-500/30 bg-amber-500/5 rounded-sm overflow-hidden shadow-2xl">
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 md:px-6 py-3 flex items-center gap-3">
              <ShieldAlert size={18} className="text-amber-500" />
              <span className="text-xs font-mono font-bold text-amber-500 uppercase tracking-widest">Synthetic Data & Security Policy</span>
            </div>
            <div className="p-4 md:p-8">
              <p className="text-sm text-amber-100/90 leading-relaxed mb-6 font-medium">
                CASHNET is currently operating in <strong className="text-amber-400 font-extrabold">SYNTHETIC MODE</strong>. All seeded intelligence is explicitly marked. The application <em>does not</em> access NCRP, SAHYOG, live banking systems, UPI networks, or real government endpoints.
              </p>
              <ul className="space-y-3">
                {[
                  "Model inference is explicitly labeled and requires human validation.",
                  "Interventions cannot be executed without authorized human approval.",
                  "Full immutable audit trail is retained for all analyst actions."
                ].map((text, idx) => (
                  <li key={idx} className="flex items-start gap-3 bg-black/20 p-3 rounded-sm border border-amber-500/10">
                    <Check size={14} className="mt-0.5 shrink-0 text-cyan-400" /> 
                    <span className="text-xs text-amber-100/80 font-mono leading-relaxed">{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 md:py-28 bg-white text-center relative border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-6 tracking-tight">Ready to explore the intelligence graph?</h2>
          <p className="text-slate-500 text-sm mb-10 max-w-xl mx-auto font-medium">
            Enter the fully-functional synthetic workspace to trace fund flows and review model predictions.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/dashboard" className="w-full sm:w-auto flex justify-center items-center gap-2 bg-[hsl(214,39%,17%)] text-amber-400 px-8 py-3.5 text-sm font-extrabold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10 rounded-sm">
              <Target size={16} strokeWidth={2.5} /> Open Investigator Desk
            </Link>
            <a href="https://github.com/Sandesh14015/CASHNET" target="_blank" rel="noopener noreferrer">
              <button aria-label="View on GitHub" className="w-full sm:w-auto flex justify-center items-center gap-2 bg-white border-2 border-slate-200 text-slate-700 px-8 py-3.5 text-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm rounded-sm">
                View on GitHub
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[hsl(214,39%,17%)] py-10 md:py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <Crosshair size={18} className="text-amber-400" />
              <div className="text-base font-extrabold tracking-[.14em] text-slate-100">CASHNET</div>
            </div>
            
            <div className="text-[10px] text-slate-400/80 font-mono text-center md:text-left max-w-lg leading-relaxed">
              All data presented is synthetic. Analytical prediction requires investigator validation. 
              <br className="hidden sm:block" />Built for authorized financial intelligence operators.
            </div>

            <div className="text-[11px] font-bold text-slate-300">
              <a href="https://github.com/Sandesh14015/CASHNET" className="hover:text-cyan-400 transition-colors underline decoration-slate-600 underline-offset-4">GitHub Repository</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

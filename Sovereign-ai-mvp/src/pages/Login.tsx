import React, { useState } from "react";
import { ArrowRight, BrainCircuit, Shield, Zap, Sparkles, UserCheck } from "lucide-react";
import { Role, personas } from "../data/roles";

export default function Login({ onLogin }: { onLogin: (role: Role) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      onLogin(role);
    }, 1500);
  };

  return (
    <div className="min-h-screen w-full flex bg-slate-50 relative overflow-hidden font-sans">
      {/* Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-teal-100 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-100 blur-[120px]"></div>
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full bg-purple-100 blur-[100px]"></div>
      </div>

      {/* Left Column: Branding / Landing */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 z-10 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <span className="text-2xl font-bold text-slate-900 tracking-wide">Sovereign<span className="text-teal-600">AI</span></span>
        </div>

        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-teal-700 text-sm font-medium mb-6 shadow-sm">
            <Sparkles className="w-4 h-4 text-teal-600" /> The future of enterprise intelligence
          </div>
          <h1 className="text-5xl font-extrabold text-slate-900 leading-[1.1] mb-6 tracking-tight">
            Advanced agentic coding & engineering platform.
          </h1>
          <p className="text-lg text-slate-900 leading-relaxed mb-10 font-medium">
            Deploy secure, autonomous multi-agent systems designed specifically for complex industrial environments and scalable software architecture.
          </p>
          
          <div className="grid grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600 border border-teal-100">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-slate-900 font-bold">100% On-Premise</h3>
              <p className="text-sm text-slate-800 font-medium">Military-grade security with no data leaving your network.</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-slate-900 font-bold">Lightning Fast</h3>
              <p className="text-sm text-slate-800 font-medium">Powered by optimized models under 12B parameters.</p>
            </div>
          </div>
        </div>

        <div className="text-sm text-slate-900 font-medium">
          © 2026 Sovereign AI Technologies
        </div>
      </div>

      {/* Right Column: Login Box */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 z-10">
        <div className="w-full max-w-md bg-white border border-slate-200 p-8 sm:p-10 rounded-3xl shadow-xl relative">
          
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome back</h2>
            <p className="text-slate-800 text-sm font-medium">Enter your credentials to access the workspace</p>
          </div>

          {/* Demo role selector */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2.5">
              <UserCheck className="w-4 h-4 text-slate-800" />
              <label className="block text-sm font-bold text-slate-700">Demo Role</label>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-800 uppercase tracking-wide">demo</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {personas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setRole(p.id); setEmail(p.name.toLowerCase().replace(" ", ".") + "@mrpl.local"); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${role === p.id ? "shadow-md" : "hover:bg-slate-50"}`}
                  style={{
                    borderColor: role === p.id ? p.color : "var(--color-border)",
                    background: role === p.id ? p.colorBg : "white",
                  }}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: p.color }}>
                    {p.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{p.name}</span>
                      {role === p.id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: p.color, color: "white" }}>SELECTED</span>
                      )}
                    </div>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      <span className="font-semibold" style={{ color: p.color }}>{p.label}</span> · {p.title}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>{p.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Email Address</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all font-medium shadow-sm"
                placeholder="anita.rao@mrpl.local"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-sm font-bold text-slate-700">Password</label>
                <a href="#" className="text-xs font-bold text-teal-600 hover:text-teal-700 transition-colors">Forgot password?</a>
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all font-medium shadow-sm"
                placeholder="••••••••"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-teal-500/20 mt-4 disabled:opacity-70"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-teal-200 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>Sign In to Workspace <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-slate-100 pt-6">
            <p className="text-xs font-medium text-slate-900">
              By signing in, you agree to the <a href="#" className="text-slate-900 hover:text-slate-900 transition-colors underline decoration-slate-300 underline-offset-2">Terms of Service</a> and <a href="#" className="text-slate-900 hover:text-slate-900 transition-colors underline decoration-slate-300 underline-offset-2">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

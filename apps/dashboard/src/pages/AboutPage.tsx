// ============================================================
// BODHI — Public Landing Page
// Shareable page explaining what BODHI is
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

// --- Fade-in on scroll ---
function FadeIn({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"} ${className}`}>
      {children}
    </div>
  );
}

// --- Animated counter ---
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let i = 0;
        const step = Math.max(1, Math.floor(target / 30));
        const timer = setInterval(() => { i = Math.min(i + step, target); setCount(i); if (i >= target) clearInterval(timer); }, 30);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);

  return <span ref={ref}>{count}{suffix}</span>;
}

// --- Feature card ---
function FeatureCard({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-800/60 bg-stone-900/40 p-6 hover:border-amber-500/30 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-stone-100 mb-2">{title}</h3>
      <p className="text-sm text-stone-400 leading-relaxed">{description}</p>
    </div>
  );
}

// --- SVG Icons ---
const icons = {
  memory: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>,
  context: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
  briefing: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  graph: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>,
  channel: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
  build: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
};

export default function AboutPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-300">
      {/* Floating nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-stone-950/90 backdrop-blur-md border-b border-stone-800/60" : ""}`}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6" viewBox="0 0 100 100" fill="none" stroke="#d97706" strokeWidth="4">
              <path d="M50 10 C25 30, 15 50, 50 80 C85 50, 75 30, 50 10Z" strokeLinejoin="round" />
              <path d="M50 25 L50 70" strokeLinecap="round" />
            </svg>
            <span className="font-bold text-stone-100">BODHI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sm text-stone-400 hover:text-stone-200 transition-colors">Dashboard</Link>
            <a href="https://github.com/Sukhbat-S/bodhi" target="_blank" rel="noreferrer" className="text-sm text-stone-400 hover:text-stone-200 transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(217,119,6,0.08)_0%,_transparent_70%)]" />
        <div className="max-w-3xl mx-auto text-center relative">
          <div className="flex justify-center mb-8">
            <svg className="w-16 h-16" viewBox="0 0 100 100" fill="none" stroke="#d97706" strokeWidth="3">
              <path d="M50 10 C25 30, 15 50, 50 80 C85 50, 75 30, 50 10Z" strokeLinejoin="round" />
              <path d="M50 25 L50 70" strokeLinecap="round" />
              <path d="M50 40 C38 35, 30 42, 35 52" strokeLinecap="round" opacity="0.6" />
              <path d="M50 40 C62 35, 70 42, 65 52" strokeLinecap="round" opacity="0.6" />
            </svg>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight">BODHI</h1>
          <p className="text-xl md:text-2xl text-stone-400 mb-3">Personal AI companion with long-term memory</p>
          <p className="text-sm text-stone-500 mb-10">Built by Sukhbat Sosorbaram / 21 / Ulaanbaatar, Mongolia</p>
          <div className="flex items-center justify-center gap-4">
            <a
              href="https://github.com/Sukhbat-S/bodhi"
              target="_blank"
              rel="noreferrer"
              className="px-6 py-3 rounded-lg bg-stone-800 text-stone-200 font-medium hover:bg-stone-700 transition-colors text-sm"
            >
              View on GitHub
            </a>
            <a
              href="https://x.com/SukhbatSosorba3"
              target="_blank"
              rel="noreferrer"
              className="px-6 py-3 rounded-lg bg-amber-500/10 text-amber-400 font-medium hover:bg-amber-500/20 transition-colors text-sm border border-amber-500/20"
            >
              Follow the build
            </a>
          </div>
        </div>
      </section>

      {/* What is BODHI */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xs uppercase tracking-wider text-amber-500 mb-4">What is BODHI</h2>
            <p className="text-lg text-stone-300 leading-relaxed mb-4">
              BODHI is a personal AI that remembers everything — conversations, decisions, patterns, and context — across every session. It connects to your Gmail, Calendar, GitHub, Vercel, Supabase, and Notion to build a complete picture of your world.
            </p>
            <p className="text-lg text-stone-300 leading-relaxed">
              Unlike stateless AI assistants, BODHI accumulates knowledge over time. Morning briefings pull from memory. Conversations reference past decisions. The entity graph tracks relationships between people, projects, and ideas. It gets smarter the more you use it.
            </p>
          </div>
        </section>
      </FadeIn>

      {/* Features */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xs uppercase tracking-wider text-amber-500 mb-8 text-center">Capabilities</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FeatureCard icon={icons.memory} title="Persistent Memory" description="Voyage AI embeddings + pgvector semantic search. Memories are extracted from every conversation — facts, decisions, patterns — and recalled by relevance." />
              <FeatureCard icon={icons.context} title="Context Engine" description="9 context providers aggregate data from Gmail, Calendar, GitHub, Vercel, Supabase, and Notion. Every response is informed by your full digital context." />
              <FeatureCard icon={icons.briefing} title="Proactive Briefings" description="Morning, evening, and weekly briefings delivered via Telegram. Scheduled insights synthesized from memory, calendar, and inbox — not just reactive chat." />
              <FeatureCard icon={icons.graph} title="Entity Graph" description="Tracks people, projects, organizations, and topics linked across memories. Interactive visualization reveals hidden connections in your knowledge." />
              <FeatureCard icon={icons.channel} title="Multi-Channel" description="Telegram bot, web dashboard with 17 pages, CLI integration via MCP server. Same brain, every interface. Conversations persist across channels." />
              <FeatureCard icon={icons.build} title="Build in Public" description="Auto-generates content from git activity and session memories. The /post command adapts content to English (X) and Mongolian (Facebook) markets." />
            </div>
          </div>
        </section>
      </FadeIn>

      {/* Architecture */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xs uppercase tracking-wider text-amber-500 mb-8 text-center">Architecture</h2>
            <div className="rounded-xl border border-stone-800/60 bg-stone-900/30 p-8 font-mono text-sm space-y-6">
              <div className="text-center">
                <span className="text-amber-400">Channels</span>
                <div className="flex justify-center gap-3 mt-2">
                  {["Telegram", "Web Dashboard", "CLI / MCP"].map(c => (
                    <span key={c} className="px-3 py-1.5 rounded-md bg-stone-800 text-stone-300 text-xs">{c}</span>
                  ))}
                </div>
              </div>
              <div className="flex justify-center text-stone-600">|</div>
              <div className="text-center">
                <span className="text-emerald-400">Application</span>
                <div className="flex justify-center gap-3 mt-2">
                  {["Hono API", "Agent", "Scheduler"].map(c => (
                    <span key={c} className="px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-400 text-xs">{c}</span>
                  ))}
                </div>
              </div>
              <div className="flex justify-center text-stone-600">|</div>
              <div className="text-center">
                <span className="text-violet-400">Intelligence</span>
                <div className="flex justify-center gap-3 mt-2">
                  {["Bridge (Claude)", "Memory Extractor", "Context Engine"].map(c => (
                    <span key={c} className="px-3 py-1.5 rounded-md bg-violet-500/10 text-violet-400 text-xs">{c}</span>
                  ))}
                </div>
              </div>
              <div className="flex justify-center text-stone-600">|</div>
              <div className="text-center">
                <span className="text-blue-400">Data</span>
                <div className="flex justify-center gap-3 mt-2">
                  {["Supabase (pgvector)", "Voyage AI Embeddings", "Drizzle ORM"].map(c => (
                    <span key={c} className="px-3 py-1.5 rounded-md bg-blue-500/10 text-blue-400 text-xs">{c}</span>
                  ))}
                </div>
              </div>
              <div className="flex justify-center text-stone-600">|</div>
              <div className="text-center">
                <span className="text-rose-400">Integrations</span>
                <div className="flex justify-center gap-3 mt-2 flex-wrap">
                  {["Gmail", "Calendar", "GitHub", "Vercel", "Supabase", "Notion"].map(c => (
                    <span key={c} className="px-3 py-1.5 rounded-md bg-rose-500/10 text-rose-400 text-xs">{c}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* Tech stack */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xs uppercase tracking-wider text-amber-500 mb-8 text-center">Tech Stack</h2>
            <div className="flex flex-wrap justify-center gap-3">
              {["TypeScript", "React 19", "Tailwind CSS", "Vite 6", "Hono", "Drizzle ORM", "Supabase", "pgvector", "Voyage AI", "Claude Code", "Telegraf", "node-cron"].map(tech => (
                <span key={tech} className="px-4 py-2 rounded-full border border-stone-700 text-stone-300 text-sm hover:border-stone-600 transition-colors">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </section>
      </FadeIn>

      {/* Stats */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              {[
                { value: 14, suffix: "+", label: "Packages" },
                { value: 1600, suffix: "+", label: "Memories" },
                { value: 9, suffix: "", label: "Integrations" },
                { value: 16, suffix: "", label: "Phases Shipped" },
              ].map(s => (
                <div key={s.label}>
                  <div className="text-3xl md:text-4xl font-bold text-white"><Counter target={s.value} suffix={s.suffix} /></div>
                  <div className="text-sm text-stone-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeIn>

      {/* Footer */}
      <footer className="py-16 px-6 border-t border-stone-800/60">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex justify-center mb-4">
            <svg className="w-8 h-8" viewBox="0 0 100 100" fill="none" stroke="#d97706" strokeWidth="3" opacity="0.5">
              <path d="M50 10 C25 30, 15 50, 50 80 C85 50, 75 30, 50 10Z" strokeLinejoin="round" />
              <path d="M50 25 L50 70" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm text-stone-500 mb-4">Built with obsession in Ulaanbaatar</p>
          <div className="flex justify-center gap-6">
            <a href="https://github.com/Sukhbat-S/bodhi" target="_blank" rel="noreferrer" className="text-sm text-stone-500 hover:text-stone-300 transition-colors">GitHub</a>
            <a href="https://x.com/SukhbatSosorba3" target="_blank" rel="noreferrer" className="text-sm text-stone-500 hover:text-stone-300 transition-colors">X / Twitter</a>
            <Link to="/" className="text-sm text-stone-500 hover:text-stone-300 transition-colors">Dashboard</Link>
            <Link to="/chat" className="text-sm text-stone-500 hover:text-stone-300 transition-colors">Chat</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

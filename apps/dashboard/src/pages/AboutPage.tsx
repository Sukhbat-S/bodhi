// ============================================================
// BODHI — Public Landing Page
// Shareable page explaining what BODHI is
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from "react";
import { getStatus, type StatusResponse, type Memory } from "../api";
import { BodhiLogo } from "../components/BodhiLogo";

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

// --- Live search demo for the landing page ---
const DEMO_QUERIES = ["architecture decisions", "deployment patterns", "memory system", "content engine", "entity graph"];

const TYPE_COLORS: Record<string, string> = {
  fact: "text-blue-400",
  decision: "text-emerald-400",
  pattern: "text-violet-400",
  preference: "text-amber-400",
  event: "text-rose-400",
};

// Sample results — no real data exposed on public landing page
const SAMPLE_RESULTS: Record<string, Memory[]> = {
  "architecture decisions": [
    { id: "s1", content: "Chose Bridge pattern to route all AI reasoning through Claude Code CLI — keeps costs at $0 with Max subscription", type: "decision", importance: 0.9, confidence: 0.95, similarity: 0.94, createdAt: "2026-03-15", tags: ["architecture", "bridge"] },
    { id: "s2", content: "Context providers use priority-based ordering: memory=10, goals=9.5, projects=9, integrations=6-8", type: "fact", importance: 0.8, confidence: 0.9, similarity: 0.87, createdAt: "2026-03-20", tags: ["architecture", "context"] },
    { id: "s3", content: "All packages use ESM + TypeScript strict mode — no CommonJS anywhere in the monorepo", type: "decision", importance: 0.7, confidence: 0.85, similarity: 0.82, createdAt: "2026-02-28", tags: ["architecture", "typescript"] },
  ],
  "deployment patterns": [
    { id: "s4", content: "Docker build uses multi-stage: deps → build → runtime. Final image ~180MB", type: "fact", importance: 0.7, confidence: 0.9, similarity: 0.91, createdAt: "2026-03-25", tags: ["deployment", "docker"] },
    { id: "s5", content: "Vercel SPA routing requires vercel.json with catch-all rewrite to index.html", type: "pattern", importance: 0.6, confidence: 0.95, similarity: 0.85, createdAt: "2026-04-04", tags: ["deployment", "vercel"] },
  ],
  "memory system": [
    { id: "s6", content: "Memory synthesis runs daily at 03:00 — dedup, cluster, decay, promote cycle", type: "fact", importance: 0.8, confidence: 0.9, similarity: 0.93, createdAt: "2026-03-10", tags: ["memory", "synthesis"] },
    { id: "s7", content: "Voyage AI voyage-4-lite embeddings + pgvector cosine similarity for semantic search", type: "fact", importance: 0.8, confidence: 0.95, similarity: 0.89, createdAt: "2026-02-20", tags: ["memory", "embeddings"] },
    { id: "s8", content: "Cross-session reasoning detects recurring themes automatically and creates pattern memories", type: "pattern", importance: 0.85, confidence: 0.9, similarity: 0.86, createdAt: "2026-03-18", tags: ["memory", "cross-session"] },
  ],
};

function LiveSearchDemo() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [autoPlayed, setAutoPlayed] = useState(false);
  const [userTookOver, setUserTookOver] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doSearch = async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    // Use sample data — never expose real memories on public landing page
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
    const key = Object.keys(SAMPLE_RESULTS).find(k => q.toLowerCase().includes(k) || k.includes(q.toLowerCase()));
    setResults(key ? SAMPLE_RESULTS[key] : SAMPLE_RESULTS["architecture decisions"]);
    setLoading(false);
  };

  const handleChange = (val: string) => {
    setUserTookOver(true);
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  };

  // Auto-type when scrolled into view
  useEffect(() => {
    if (autoPlayed || userTookOver) return;
    const el = containerRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !autoPlayed && !userTookOver) {
        setAutoPlayed(true);
        const text = DEMO_QUERIES[Math.floor(Math.random() * DEMO_QUERIES.length)];
        let i = 0;
        const type = () => {
          if (userTookOver) return;
          i++;
          setQuery(text.slice(0, i));
          if (i < text.length) {
            setTimeout(type, 50 + Math.random() * 30);
          } else {
            doSearch(text);
          }
        };
        setTimeout(type, 600);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [autoPlayed, userTookOver]);

  return (
    <div ref={containerRef}>
      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setUserTookOver(true)}
          placeholder="Search BODHI's memory..."
          className="w-full bg-stone-900 text-stone-100 px-5 py-4 rounded-xl border border-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40 placeholder-stone-500 text-sm"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-stone-600 border-t-amber-400 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Example queries */}
      {!searched && (
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {DEMO_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => { setQuery(q); doSearch(q); }}
              className="text-xs px-3 py-1.5 rounded-full bg-stone-800/60 text-stone-400 hover:text-stone-200 hover:bg-stone-700 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {searched && (
        <div className="mt-4 space-y-2">
          {results.length === 0 && !loading ? (
            <p className="text-sm text-stone-500 text-center py-4">No results found</p>
          ) : (
            results.map((m) => {
              const pct = m.similarity ? Math.round(m.similarity * 100) : 0;
              return (
                <div key={m.id} className="bg-stone-900/80 border border-stone-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[11px] font-medium ${TYPE_COLORS[m.type] || "text-stone-400"}`}>
                      {m.type}
                    </span>
                    {pct > 0 && (
                      <span className="text-[10px] text-stone-600">{pct}% match</span>
                    )}
                  </div>
                  <p className="text-sm text-stone-300 leading-relaxed line-clamp-2">{m.content}</p>
                </div>
              );
            })
          )}
          {results.length > 0 && (
            <p className="text-[11px] text-stone-600 text-center mt-2">
              Showing {results.length} of 1,600+ memories — semantic similarity via Voyage AI + pgvector
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AboutPage() {
  const [scrolled, setScrolled] = useState(false);
  const [live, setLive] = useState<StatusResponse | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Fetch live status
  useEffect(() => {
    getStatus().then(setLive).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-300">
      {/* Floating nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-stone-950/90 backdrop-blur-md border-b border-stone-800/60" : ""}`}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BodhiLogo className="w-6 h-6 text-amber-600" />
            <span className="font-bold text-stone-100">BODHI</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/Sukhbat-S/bodhi" target="_blank" rel="noreferrer" className="text-sm text-stone-400 hover:text-stone-200 transition-colors">GitHub</a>
            <a href="https://x.com/SukhbatSosorba3" target="_blank" rel="noreferrer" className="text-sm text-stone-400 hover:text-stone-200 transition-colors">X / Twitter</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(217,119,6,0.08)_0%,_transparent_70%)]" />
        <div className="max-w-3xl mx-auto text-center relative">
          <div className="flex justify-center mb-8">
            <BodhiLogo className="w-16 h-16 text-amber-600" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">Every AI conversation<br />starts from zero.<br /><span className="text-amber-400">BODHI doesn't.</span></h1>
          <p className="text-lg md:text-xl text-stone-400 mb-3 max-w-xl mx-auto">A personal AI that remembers your decisions, tracks your projects, and gets smarter every day. Self-hosted and open source.</p>
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

      {/* Who is BODHI for */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xs uppercase tracking-wider text-amber-500 mb-8 text-center">Who is BODHI for</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-stone-800/60 bg-stone-900/40 p-6">
                <h3 className="text-lg font-semibold text-stone-100 mb-2">Builders</h3>
                <p className="text-sm text-stone-400 leading-relaxed">Track architecture decisions across sessions. Never re-explain your stack. BODHI knows what you built last week and why.</p>
              </div>
              <div className="rounded-xl border border-stone-800/60 bg-stone-900/40 p-6">
                <h3 className="text-lg font-semibold text-stone-100 mb-2">Creators</h3>
                <p className="text-sm text-stone-400 leading-relaxed">Remember every content idea, research note, and feedback. Auto-generate build logs for your audience from real work data.</p>
              </div>
              <div className="rounded-xl border border-stone-800/60 bg-stone-900/40 p-6">
                <h3 className="text-lg font-semibold text-stone-100 mb-2">Students</h3>
                <p className="text-sm text-stone-400 leading-relaxed">An AI study partner that remembers what you've learned and surfaces it when relevant. Connections you missed become visible.</p>
              </div>
              <div className="rounded-xl border border-stone-800/60 bg-stone-900/40 p-6">
                <h3 className="text-lg font-semibold text-stone-100 mb-2">Entrepreneurs</h3>
                <p className="text-sm text-stone-400 leading-relaxed">Track meetings, decisions, contacts, and project status across tools. Morning briefings synthesize what matters today.</p>
              </div>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* How it works */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xs uppercase tracking-wider text-amber-500 mb-8 text-center">How it works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4 text-amber-400 text-lg font-bold">1</div>
                <h3 className="text-stone-100 font-medium mb-2">Connect your tools</h3>
                <p className="text-sm text-stone-500">Gmail, Calendar, GitHub, Notion, and more. BODHI reads your world, not just your chat.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4 text-amber-400 text-lg font-bold">2</div>
                <h3 className="text-stone-100 font-medium mb-2">Have conversations</h3>
                <p className="text-sm text-stone-500">Chat via Telegram, web, or CLI. BODHI extracts facts, decisions, and patterns from every conversation automatically.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4 text-amber-400 text-lg font-bold">3</div>
                <h3 className="text-stone-100 font-medium mb-2">BODHI remembers</h3>
                <p className="text-sm text-stone-500">Every session builds on the last. Morning briefings, proactive insights, and answers that reference your actual history.</p>
              </div>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* Live Demo — Interactive Memory Search */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xs uppercase tracking-wider text-amber-500 mb-4 text-center">Try It — Live Memory Search</h2>
            <p className="text-sm text-stone-500 text-center mb-6">
              This searches BODHI's actual memory — {live ? `${Math.floor(live.uptime || 0) > 0 ? "live right now" : ""}` : ""} with 1,600+ stored memories.
            </p>
            <LiveSearchDemo />
          </div>
        </section>
      </FadeIn>

      {/* Features */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xs uppercase tracking-wider text-amber-500 mb-8 text-center">Capabilities</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FeatureCard icon={icons.memory} title="Persistent Memory" description="Every conversation is mined for facts, decisions, and patterns. Stored with semantic search so relevant memories surface automatically — not keyword matching, meaning matching." />
              <FeatureCard icon={icons.context} title="Context Engine" description="Connects to your Gmail, Calendar, GitHub, Notion, and more. Every response is informed by your real world — not just what you typed in this chat." />
              <FeatureCard icon={icons.briefing} title="Proactive Briefings" description="Morning briefings with your calendar, inbox highlights, and patterns BODHI noticed. Delivered to Telegram on a schedule — insights that come to you." />
              <FeatureCard icon={icons.graph} title="Entity Graph" description="Tracks people, projects, and topics across all your memories. See how ideas connect, which projects overlap, and what relationships matter most." />
              <FeatureCard icon={icons.channel} title="Multi-Channel" description="Telegram, web dashboard, command line. Same brain everywhere. Start a conversation on your phone, continue it on your laptop." />
              <FeatureCard icon={icons.build} title="Content Engine" description="Auto-generates build logs and social posts from your actual work. What you built this week, distilled into shareable content — no manual writing." />
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

      {/* Live Status + Stats */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            {/* Live pulse */}
            {live && (
              <div className="flex items-center justify-center gap-2 mb-8">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="text-xs text-emerald-400 font-medium">
                  BODHI is online — uptime {Math.floor((live.uptime || 0) / 3600)}h {Math.floor(((live.uptime || 0) % 3600) / 60)}m
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              {(() => {
                const integrationCount = live
                  ? [live.gmail, live.calendar, live.github, live.vercel, live.supabase, live.notion]
                      .filter(v => v && v !== "not configured").length
                  : 9;
                return [
                  { value: 14, suffix: "+", label: "Packages" },
                  { value: 1600, suffix: "+", label: "Memories" },
                  { value: integrationCount, suffix: "", label: "Integrations Live" },
                  { value: 16, suffix: "", label: "Phases Shipped" },
                ];
              })().map(s => (
                <div key={s.label}>
                  <div className="text-3xl md:text-4xl font-bold text-white"><Counter target={s.value} suffix={s.suffix} /></div>
                  <div className="text-sm text-stone-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Service status grid */}
            {live && (
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {Object.entries(live)
                  .filter(([k, v]) => typeof v === "string" && k !== "ownerName" && k !== "bridge")
                  .map(([key, value]) => {
                    const isUp = value === "online" || value === "active" || value === "connected" || value === "running" || value === "available";
                    return (
                      <span key={key} className={`text-[11px] px-3 py-1 rounded-full border ${isUp ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" : "border-stone-700 text-stone-500"}`}>
                        {key}
                      </span>
                    );
                  })}
              </div>
            )}
          </div>
        </section>
      </FadeIn>

      {/* Footer */}
      <footer className="py-16 px-6 border-t border-stone-800/60">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex justify-center mb-4">
            <BodhiLogo className="w-8 h-8 text-amber-600" opacity={0.5} />
          </div>
          <p className="text-sm text-stone-500 mb-4">Built with obsession in Ulaanbaatar</p>
          <div className="flex justify-center gap-6">
            <a href="https://github.com/Sukhbat-S/bodhi" target="_blank" rel="noreferrer" className="text-sm text-stone-500 hover:text-stone-300 transition-colors">GitHub</a>
            <a href="https://x.com/SukhbatSosorba3" target="_blank" rel="noreferrer" className="text-sm text-stone-500 hover:text-stone-300 transition-colors">X / Twitter</a>
            <a href="https://x.com/SukhbatSosorba3" target="_blank" rel="noreferrer" className="text-sm text-stone-500 hover:text-stone-300 transition-colors">X / Twitter</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

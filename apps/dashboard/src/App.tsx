import { useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import CommandPalette from "./components/CommandPalette";
import AboutPage from "./pages/AboutPage";
import ReflectionPage from "./pages/ReflectionPage";
import StatusPage from "./pages/StatusPage";
import MemoriesPage from "./pages/MemoriesPage";
import QualityPage from "./pages/QualityPage";
import InboxPage from "./pages/InboxPage";
import CalendarPage from "./pages/CalendarPage";
import ChatPage from "./pages/ChatPage";
import NotionPage from "./pages/NotionPage";
import GitHubPage from "./pages/GitHubPage";
import VercelPage from "./pages/VercelPage";
import SupabasePage from "./pages/SupabasePage";
import EcosystemPage from "./pages/EcosystemPage";
import BriefingsPage from "./pages/BriefingsPage";
import SearchPage from "./pages/SearchPage";
import TimelinePage from "./pages/TimelinePage";
import EntityGraphPage from "./pages/EntityGraphPage";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isPublicPage = location.pathname === "/about";

  // Public pages render without sidebar or mobile header
  if (isPublicPage) {
    return <Routes><Route path="/about" element={<AboutPage />} /></Routes>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <CommandPalette />
      {/* Mobile header */}
      <header className="fixed top-0 left-0 right-0 z-40 flex items-center h-14 px-4 bg-stone-950 border-b border-stone-800/60 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 text-stone-400 hover:text-stone-200"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="ml-3 text-lg font-bold text-stone-100 flex items-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 100 100" fill="none" stroke="#d97706" strokeWidth="4">
            <path d="M50 10 C25 30, 15 50, 50 80 C85 50, 75 30, 50 10Z" strokeLinejoin="round" />
            <path d="M50 25 L50 70" strokeLinecap="round" />
          </svg>
          BODHI
        </h1>
      </header>

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0 bg-stone-950">
        <Routes>
          <Route path="/" element={<ReflectionPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/briefings" element={<BriefingsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/ecosystem" element={<EcosystemPage />} />
          <Route path="/memories" element={<MemoriesPage />} />
          <Route path="/quality" element={<QualityPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/notion" element={<NotionPage />} />
          <Route path="/github" element={<GitHubPage />} />
          <Route path="/vercel" element={<VercelPage />} />
          <Route path="/supabase" element={<SupabasePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/entities" element={<EntityGraphPage />} />
        </Routes>
      </main>
    </div>
  );
}

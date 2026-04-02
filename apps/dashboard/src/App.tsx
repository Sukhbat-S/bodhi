import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
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

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile header */}
      <header className="fixed top-0 left-0 right-0 z-40 flex items-center h-14 px-4 bg-stone-900 border-b border-stone-800 md:hidden">
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
          <span>🌳</span> BODHI
        </h1>
      </header>

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <Routes>
          <Route path="/" element={<StatusPage />} />
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
        </Routes>
      </main>
    </div>
  );
}

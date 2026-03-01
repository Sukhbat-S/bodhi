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

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<StatusPage />} />
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

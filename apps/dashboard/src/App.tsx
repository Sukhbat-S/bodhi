import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import StatusPage from "./pages/StatusPage";
import MemoriesPage from "./pages/MemoriesPage";
import QualityPage from "./pages/QualityPage";
import ChatPage from "./pages/ChatPage";

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<StatusPage />} />
          <Route path="/memories" element={<MemoriesPage />} />
          <Route path="/quality" element={<QualityPage />} />
          <Route path="/chat" element={<ChatPage />} />
        </Routes>
      </main>
    </div>
  );
}

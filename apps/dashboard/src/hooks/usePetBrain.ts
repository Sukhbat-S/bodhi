import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { getStatus, getPendingMemoryCount, subscribeSessionStream } from "../api";

export type PetMood = "neutral" | "happy" | "alert" | "sleepy" | "snarky";

interface PetMessage {
  text: string;
  priority: number;
  mood?: PetMood;
}

const PAGE_COMMENTS: Record<string, string[]> = {
  "/": ["Home base.", "The reflection page. What's on your mind?"],
  "/chat": ["Chat mode. I'll be quiet.", "Talk to BODHI. I'll watch."],
  "/memories": ["Your memory bank.", "Knowledge grows here."],
  "/workflows": ["Workflow control room.", "Multi-step pipelines. Powerful stuff."],
  "/quality": ["Quality check.", "Memory health matters."],
  "/calendar": ["Calendar view.", "What's the day look like?"],
  "/inbox": ["Inbox time.", "Any fires to put out?"],
  "/github": ["GitHub activity.", "Code never sleeps."],
  "/entities": ["The knowledge graph.", "People, projects, connections."],
  "/briefings": ["Past briefings.", "Patterns live here."],
  "/search": ["Search mode.", "What are you looking for?"],
  "/missions": ["Mission control.", "The agents are watching.", "Command center active."],
  "/timeline": ["Timeline.", "Memory across time."],
  "/status": ["System status.", "Let's see what's humming."],
  "/ecosystem": ["The big picture.", "Everything connected."],
  "/vercel": ["Deployments.", "Ship it."],
  "/supabase": ["Database health.", "The foundation."],
  "/notion": ["Notion workspace.", "Tasks and sessions."],
};

const IDLE_MESSAGES = [
  "Still here.",
  "Quiet moment.",
  "Need anything?",
  "I'm watching.",
  "Just observing.",
  "*yawns*",
  "Scales settling.",
];

const COOLDOWN_MS = 30_000; // 30 seconds between messages

export function usePetBrain() {
  const [message, setMessage] = useState<string | null>(null);
  const [mood, setMood] = useState<PetMood>("neutral");
  const lastMessageTime = useRef(0);
  const lastRoute = useRef("");
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();

  const showMessage = useCallback((msg: string, msgMood: PetMood = "neutral") => {
    const now = Date.now();
    if (now - lastMessageTime.current < COOLDOWN_MS) return;
    lastMessageTime.current = now;
    setMessage(msg);
    setMood(msgMood);
    setTimeout(() => { setMessage(null); setMood("neutral"); }, 5000);
  }, []);

  const dismiss = useCallback(() => { setMessage(null); setMood("neutral"); }, []);

  // Watch page navigation
  useEffect(() => {
    const path = location.pathname;
    if (path === lastRoute.current) return;
    lastRoute.current = path;

    const comments = PAGE_COMMENTS[path];
    if (comments) {
      const pick = comments[Math.floor(Math.random() * comments.length)];
      showMessage(pick, "happy");
    }
  }, [location.pathname, showMessage]);

  // Poll pending memories every 60s
  useEffect(() => {
    const check = async () => {
      try {
        const { count } = await getPendingMemoryCount();
        if (count > 0) {
          showMessage(`${count} memor${count === 1 ? "y" : "ies"} pending review.`, "snarky");
        }
      } catch { /* silent */ }
    };
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [showMessage]);

  // Poll status every 2 minutes for disconnections
  useEffect(() => {
    const check = async () => {
      try {
        const status = await getStatus();
        const down: string[] = [];
        if (status.memory !== "active") down.push("memory");
        if (status.gmail && status.gmail !== "connected") down.push("gmail");
        if (status.calendar && status.calendar !== "connected") down.push("calendar");
        if (status.github && status.github !== "connected") down.push("github");
        if (down.length > 0) {
          showMessage(`${down.join(", ")} disconnected.`, "alert");
        }
      } catch {
        showMessage("Can't reach BODHI server.", "alert");
      }
    };
    const interval = setInterval(check, 120_000);
    return () => clearInterval(interval);
  }, [showMessage]);

  // Idle message after 3 minutes of no navigation
  useEffect(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      const pick = IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)];
      showMessage(pick, "sleepy");
    }, 180_000);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [location.pathname, showMessage]);

  // Mission observer — ACC: fires on anomalies, silent on success
  useEffect(() => {
    const unsub = subscribeSessionStream({
      onInit() {},
      onSessionChange() {},
      onMessageSent() {},
      onDisconnect() {},
      onMissionUpdate(data) {
        const t = data.type as string;
        if (t === "task:prediction-error") {
          showMessage("Prediction missed. Check the output.", "alert");
        }
        if (t === "task:repair") {
          showMessage("Repairing. Watch.", "snarky");
        }
        if (t === "task:needs-review") {
          showMessage("Can't fix this one. Your turn.", "alert");
        }
        if (t === "task:duration-warning") {
          showMessage("Something's slow. Investigate.", "snarky");
        }
        if (t === "mission:failed") {
          showMessage("Mission failed.", "alert");
        }
        // Silent on success — biology: no signal when predictions match
      },
    });
    return unsub;
  }, [showMessage]);

  return { message, mood, dismiss };
}

import { describe, it, expect, afterAll } from "vitest";

const BASE = process.env.BODHI_TEST_URL || "http://localhost:4000";

// Parse SSE text into events
function parseSSE(text: string): Array<{ event?: string; data: string }> {
  const events: Array<{ event?: string; data: string }> = [];
  const blocks = text.split("\n\n").filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n");
    let event: string | undefined;
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) event = line.slice(7);
      if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (data !== undefined) events.push({ event, data });
  }
  return events;
}

// Read SSE chunks until we find an event matching the predicate (or timeout)
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (event: { event?: string; data: string }) => boolean,
  timeoutMs = 5000,
): Promise<{ event?: string; data: string }> {
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  let buffer = "";

  while (Date.now() < deadline) {
    const { value, done } = await Promise.race([
      reader.read(),
      new Promise<{ value: undefined; done: true }>((resolve) =>
        setTimeout(() => resolve({ value: undefined, done: true }), deadline - Date.now()),
      ),
    ]);
    if (done && !value) break;
    if (value) buffer += decoder.decode(value, { stream: true });

    const events = parseSSE(buffer);
    const match = events.find(predicate);
    if (match) return match;
  }
  throw new Error(`Timed out waiting for SSE event (buffer: ${buffer.slice(0, 200)})`);
}

// Cleanup: delete test sessions after all tests
const testSessionIds: string[] = [];
afterAll(async () => {
  for (const id of testSessionIds) {
    await fetch(`${BASE}/api/sessions/active/${id}`, { method: "DELETE" }).catch(() => {});
  }
});

describe("Sessions SSE stream", () => {
  it("sends init event with current state on connect", async () => {
    const res = await fetch(`${BASE}/api/sessions/stream`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const init = await readUntil(reader, (e) => e.event === "init");
    const data = JSON.parse(init.data);

    expect(data).toHaveProperty("sessions");
    expect(data).toHaveProperty("messages");
    expect(data).toHaveProperty("files");
    expect(Array.isArray(data.sessions)).toBe(true);

    reader.cancel();
  });

  it("pushes session:registered when a session is created", async () => {
    const res = await fetch(`${BASE}/api/sessions/stream`);
    const reader = res.body!.getReader();

    // Skip init
    await readUntil(reader, (e) => e.event === "init");

    // Register a session
    const id = `test-sse-reg-${Date.now()}`;
    testSessionIds.push(id);
    await fetch(`${BASE}/api/sessions/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, project: "test", description: "SSE test register" }),
    });

    // Should arrive via SSE
    const event = await readUntil(reader, (e) => e.event === "session:registered");
    const data = JSON.parse(event.data);
    expect(data.session.id).toBe(id);
    expect(data.session.project).toBe("test");

    reader.cancel();
  });

  it("pushes message:sent when a message is sent", async () => {
    const res = await fetch(`${BASE}/api/sessions/stream`);
    const reader = res.body!.getReader();
    await readUntil(reader, (e) => e.event === "init");

    await fetch(`${BASE}/api/sessions/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "test-sender", message: "SSE test message" }),
    });

    const event = await readUntil(reader, (e) => e.event === "message:sent");
    const data = JSON.parse(event.data);
    expect(data.message.from).toBe("test-sender");
    expect(data.message.message).toBe("SSE test message");

    reader.cancel();
  });

  it("pushes session:deregistered when a session is deleted", async () => {
    // Create a session to delete
    const id = `test-sse-del-${Date.now()}`;
    await fetch(`${BASE}/api/sessions/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, project: "test", description: "SSE test delete" }),
    });

    const res = await fetch(`${BASE}/api/sessions/stream`);
    const reader = res.body!.getReader();
    await readUntil(reader, (e) => e.event === "init");

    await fetch(`${BASE}/api/sessions/active/${id}`, { method: "DELETE" });

    const event = await readUntil(reader, (e) => e.event === "session:deregistered");
    const data = JSON.parse(event.data);
    expect(data.sessionId).toBe(id);

    reader.cancel();
  });

  it("handles client disconnect without server errors", async () => {
    const res = await fetch(`${BASE}/api/sessions/stream`);
    const reader = res.body!.getReader();
    await readUntil(reader, (e) => e.event === "init");
    reader.cancel(); // disconnect

    // Server should still work — register a session after disconnect
    const id = `test-sse-disc-${Date.now()}`;
    testSessionIds.push(id);
    const regRes = await fetch(`${BASE}/api/sessions/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, project: "test", description: "post-disconnect" }),
    });
    expect(regRes.ok).toBe(true);
  });
});

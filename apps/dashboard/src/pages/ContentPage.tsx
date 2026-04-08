import { useEffect, useState, useCallback } from "react";
import {
  getContentQueue,
  approveContent,
  rejectContent,
  postContent,
  generateContent,
  type ContentItem,
} from "../api";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-stone-700 text-stone-300",
  ready: "bg-blue-900/60 text-blue-300",
  approved: "bg-emerald-900/60 text-emerald-300",
  posted: "bg-amber-900/60 text-amber-300",
  rejected: "bg-red-900/60 text-red-300",
};

export default function ContentPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  const fetchQueue = useCallback(async () => {
    try {
      const status = filter === "all" ? undefined : filter;
      const data = await getContentQueue(status);
      setItems(data.items);
      if (!selected && data.items.length > 0) setSelected(data.items[0]);
    } catch (err) {
      console.error("Failed to fetch content queue:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const handleApprove = async () => {
    if (!selected) return;
    await approveContent(selected.id);
    await fetchQueue();
    setSelected((prev) => prev ? { ...prev, status: "approved" } : null);
  };

  const handleReject = async () => {
    if (!selected) return;
    const note = prompt("Rejection reason (optional):");
    await rejectContent(selected.id, note || undefined);
    await fetchQueue();
    setSelected((prev) => prev ? { ...prev, status: "rejected" } : null);
  };

  const handlePost = async () => {
    if (!selected) return;
    setPosting(true);
    try {
      await postContent(selected.id);
      await fetchQueue();
      setSelected((prev) => prev ? { ...prev, status: "posted" } : null);
    } finally {
      setPosting(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateContent();
      await fetchQueue();
    } finally {
      setGenerating(false);
    }
  };

  const filters = ["all", "draft", "approved", "posted", "rejected"];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">Content Pipeline</h1>
          <p className="text-sm text-stone-500 mt-1">AI Buteeqch — Mongolian Claude Code Education</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 text-sm font-medium bg-amber-600 text-stone-950 rounded-lg hover:bg-amber-500 disabled:opacity-50 transition-colors"
        >
          {generating ? "Generating..." : "Generate Next Lesson"}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === f
                ? "bg-amber-500/20 text-amber-400"
                : "bg-stone-800/60 text-stone-500 hover:text-stone-300"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-xs text-stone-600 self-center">{items.length} items</span>
      </div>

      {loading ? (
        <div className="text-stone-600 text-sm">Loading content queue...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-stone-500 mb-4">No content generated yet.</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 text-sm bg-amber-600 text-stone-950 rounded-lg hover:bg-amber-500 disabled:opacity-50"
          >
            Generate Lesson #1
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Queue list */}
          <div className="lg:col-span-1 space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => { setSelected(item); setSlideIndex(0); }}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${
                  selected?.id === item.id
                    ? "border-amber-500/40 bg-stone-900/80"
                    : "border-stone-800/40 bg-stone-900/40 hover:border-stone-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-stone-600">#{item.lessonNumber}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] || ""}`}>
                    {item.status}
                  </span>
                </div>
                <p className="text-sm text-stone-200 font-medium">{item.topic}</p>
                <p className="text-xs text-stone-500 mt-1">{item.slides.length} slides</p>
              </button>
            ))}
          </div>

          {/* Preview panel */}
          {selected && (
            <div className="lg:col-span-2 space-y-4">
              {/* Slide preview */}
              <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-stone-100">
                    #{selected.lessonNumber} — {selected.topic}
                  </h2>
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[selected.status] || ""}`}>
                    {selected.status}
                  </span>
                </div>

                {/* Image carousel */}
                {selected.slides[slideIndex]?.imageUrl && (
                  <div className="mb-4">
                    <img
                      src={`/content/images/carousel-${selected.lessonNumber}-${slideIndex + 1}.png`}
                      alt={selected.slides[slideIndex].title}
                      className="w-full max-w-lg mx-auto rounded-lg shadow-lg"
                    />
                  </div>
                )}

                {/* Slide navigation */}
                <div className="flex items-center justify-center gap-2 mb-4">
                  {selected.slides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSlideIndex(i)}
                      className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                        i === slideIndex
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          : "bg-stone-800/60 text-stone-500 hover:text-stone-300"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>

                {/* Slide content */}
                <div className="bg-stone-800/30 rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-bold text-stone-200 mb-1">
                    {selected.slides[slideIndex]?.title}
                  </h3>
                  <p className="text-sm text-stone-400 leading-relaxed">
                    {selected.slides[slideIndex]?.body}
                  </p>
                  {selected.slides[slideIndex]?.code && (
                    <pre className="mt-3 bg-stone-900/80 rounded-lg p-3 text-xs text-stone-300 font-mono overflow-x-auto">
                      {selected.slides[slideIndex].code}
                    </pre>
                  )}
                </div>

                {/* Caption — ready to copy */}
                <div className="bg-stone-800/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-stone-600 uppercase tracking-wider">Caption</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selected.caption);
                      }}
                      className="text-[10px] text-amber-500 hover:text-amber-400 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-sm text-stone-300 whitespace-pre-wrap select-all cursor-text">{selected.caption}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                {selected.status === "draft" && (
                  <>
                    <button
                      onClick={handleApprove}
                      className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={handleReject}
                      className="px-4 py-2 text-sm font-medium bg-stone-700 text-stone-300 rounded-lg hover:bg-stone-600 transition-colors"
                    >
                      Reject
                    </button>
                  </>
                )}
                {selected.status === "approved" && (
                  <button
                    onClick={handlePost}
                    disabled={posting}
                    className="px-4 py-2 text-sm font-medium bg-amber-600 text-stone-950 rounded-lg hover:bg-amber-500 disabled:opacity-50 transition-colors"
                  >
                    {posting ? "Posting..." : "Post to Facebook"}
                  </button>
                )}
                {selected.status === "posted" && selected.postResults?.facebook && (
                  <a
                    href={`https://facebook.com/${selected.postResults.facebook}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 text-sm font-medium bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition-colors"
                  >
                    View on Facebook
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

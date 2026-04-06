import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TurnFeedback } from "../api";

interface Props {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  turnId?: string;
  threadId?: string;
  feedback?: TurnFeedback | null;
  onFeedback?: (
    turnId: string,
    rating: "helpful" | "unhelpful",
    text?: string
  ) => void;
}

export default function ChatMessage({
  role,
  content,
  isStreaming,
  turnId,
  threadId,
  feedback,
  onFeedback,
}: Props) {
  const isUser = role === "user";
  const [showCorrectionInput, setShowCorrectionInput] = useState(false);
  const [correctionText, setCorrectionText] = useState("");

  const handleFeedback = (rating: "helpful" | "unhelpful") => {
    if (!turnId || !onFeedback) return;
    if (rating === "unhelpful") {
      setShowCorrectionInput(true);
    } else {
      onFeedback(turnId, rating);
      setShowCorrectionInput(false);
    }
  };

  const submitCorrection = () => {
    if (!turnId || !onFeedback) return;
    onFeedback(turnId, "unhelpful", correctionText || undefined);
    setShowCorrectionInput(false);
    setCorrectionText("");
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-stone-700 text-stone-100 rounded-br-md"
            : "bg-stone-900 border border-stone-800 text-stone-300 rounded-bl-md"
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs font-medium text-stone-500">BODHI</span>
            {isStreaming && (
              <span className="flex gap-0.5">
                <span className="w-1 h-1 bg-stone-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 bg-stone-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1 h-1 bg-stone-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            )}
          </div>
        )}
        {isUser ? (
          <div className="whitespace-pre-wrap">{content || "\u00A0"}</div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-headings:mt-3 prose-headings:mb-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-pre:bg-stone-950 prose-pre:border prose-pre:border-stone-700 prose-code:text-amber-300 prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || "\u00A0"}
            </ReactMarkdown>
          </div>
        )}

        {/* Feedback buttons — assistant messages only, not while streaming */}
        {!isUser && !isStreaming && turnId && onFeedback && (
          <div className="mt-2 pt-2 border-t border-stone-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleFeedback("helpful")}
                className={`p-1 rounded transition-colors ${
                  feedback?.rating === "helpful"
                    ? "text-amber-400"
                    : "text-stone-600 hover:text-stone-400"
                }`}
                title="Helpful"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M1 8.25a1.25 1.25 0 1 1 2.5 0v7.5a1.25 1.25 0 1 1-2.5 0v-7.5ZM11 3V1.7c0-.268.14-.526.395-.607A2 2 0 0 1 14 3c0 .995-.182 1.948-.514 2.826-.204.54.166 1.174.744 1.174h2.52c1.243 0 2.261 1.01 2.146 2.247a23.864 23.864 0 0 1-1.341 5.974C17.153 16.323 16.072 17 14.9 17H3.75A.75.75 0 0 1 3 16.25V8.285a.75.75 0 0 1 .238-.569l4.7-4.275A1.5 1.5 0 0 0 8.5 2.25V.5A.5.5 0 0 1 9 0h.5a2 2 0 0 1 1.5.68V3Z" />
                </svg>
              </button>
              <button
                onClick={() => handleFeedback("unhelpful")}
                className={`p-1 rounded transition-colors ${
                  feedback?.rating === "unhelpful"
                    ? "text-red-400"
                    : "text-stone-600 hover:text-stone-400"
                }`}
                title="Not helpful"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 rotate-180">
                  <path d="M1 8.25a1.25 1.25 0 1 1 2.5 0v7.5a1.25 1.25 0 1 1-2.5 0v-7.5ZM11 3V1.7c0-.268.14-.526.395-.607A2 2 0 0 1 14 3c0 .995-.182 1.948-.514 2.826-.204.54.166 1.174.744 1.174h2.52c1.243 0 2.261 1.01 2.146 2.247a23.864 23.864 0 0 1-1.341 5.974C17.153 16.323 16.072 17 14.9 17H3.75A.75.75 0 0 1 3 16.25V8.285a.75.75 0 0 1 .238-.569l4.7-4.275A1.5 1.5 0 0 0 8.5 2.25V.5A.5.5 0 0 1 9 0h.5a2 2 0 0 1 1.5.68V3Z" />
                </svg>
              </button>
              {feedback && (
                <span className="text-xs text-stone-600 ml-1">
                  {feedback.rating === "helpful" ? "Marked helpful" : "Marked unhelpful"}
                </span>
              )}
            </div>

            {/* Correction text input */}
            {showCorrectionInput && !feedback && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={correctionText}
                  onChange={(e) => setCorrectionText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitCorrection()}
                  placeholder="What was wrong? (optional)"
                  className="flex-1 bg-stone-950 border border-stone-700 rounded px-2 py-1 text-xs text-stone-300 placeholder:text-stone-600 focus:outline-none focus:border-stone-500"
                  autoFocus
                />
                <button
                  onClick={submitCorrection}
                  className="text-xs text-stone-400 hover:text-stone-200 px-2"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

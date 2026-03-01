import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export default function ChatMessage({ role, content, isStreaming }: Props) {
  const isUser = role === "user";

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
      </div>
    </div>
  );
}

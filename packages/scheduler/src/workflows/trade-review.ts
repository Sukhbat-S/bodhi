import type { WorkflowDefinition } from "@seneca/core";

export const tradeReview: WorkflowDefinition = {
  id: "trade-review",
  name: "Post-Trade Review",
  description:
    "Fires after a trade is closed. Extracts lessons from the trade outcome, " +
    "compares thesis vs result, identifies patterns, and stores learnings " +
    "into BODHI memory for future trade decisions.",
  steps: [
    {
      name: "gather-trade-context",
      prompt:
        "Fetch the most recently closed trade from the BODHI trading journal:\n" +
        "1. Call GET http://localhost:4000/api/trading/trades?limit=5\n" +
        "2. Find the most recent trade with status='closed'\n" +
        "3. Report: symbol, side, entry price, exit price, P&L (USD), R-multiple, " +
        "thesis (why entered), postmortem (what happened), catalyst, confidence level\n" +
        "4. Also fetch the current BTC and ETH prices for market context\n\n" +
        "Format everything clearly — the next step will analyze this.",
    },
    {
      name: "analyze-and-extract",
      prompt: (prev) =>
        "Analyze this closed trade and extract lessons:\n\n" +
        prev[0].output +
        "\n\n" +
        "Answer these questions:\n" +
        "1. **Thesis accuracy**: Did the stated thesis play out? If not, why?\n" +
        "2. **Entry quality**: Was the entry price good relative to the stop loss? " +
        "Was the R:R ratio favorable?\n" +
        "3. **Exit quality**: Was the exit too early, too late, or at the right moment?\n" +
        "4. **Pattern match**: Does this trade match any prior trades in BODHI memory? " +
        "Search for memories tagged 'trading' or 'trade-outcome'.\n" +
        "5. **Lesson**: One specific, actionable lesson to store. Not generic advice — " +
        "a concrete observation like 'CPI soft prints under 3% moved ETH +2.1% within " +
        "15 minutes in this instance' or 'funding rate above 0.05% inverted within 4 hours'.\n" +
        "6. **Confidence calibration**: The trader rated confidence 1-5 before entry. " +
        "Was that rating accurate given the outcome? Over-confident or under-confident?\n\n" +
        "Be specific. Reference real numbers from the trade.",
    },
    {
      name: "store-lesson",
      prompt: (prev) =>
        "Store the extracted lesson from this trade review into BODHI memory.\n\n" +
        "Analysis:\n" + prev[1].output + "\n\n" +
        "Create a memory with:\n" +
        "- type: 'pattern'\n" +
        "- tags: ['trading', 'trade-outcome', the trade's symbol, the catalyst type]\n" +
        "- importance: 0.7 (trade lessons are mid-high importance)\n" +
        "- content: The ONE specific lesson from the analysis above, written as a " +
        "standalone statement that makes sense without context. Include the actual " +
        "numbers (entry, exit, P&L, R) so future retrieval is concrete.\n\n" +
        "Use the BODHI MCP store_memory tool or POST to /api/memories.\n" +
        "Then confirm what was stored.",
    },
  ],
};

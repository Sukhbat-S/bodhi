// ============================================================
// BODHI — Voyage AI Embedding Client
// ============================================================

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3";
const DIMENSIONS = 1024;

export async function embed(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: texts,
      model: MODEL,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage AI embedding error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data.map((d) => d.embedding);
}

export async function embedSingle(
  text: string,
  apiKey: string
): Promise<number[]> {
  const [embedding] = await embed([text], apiKey);
  return embedding;
}

export { DIMENSIONS };

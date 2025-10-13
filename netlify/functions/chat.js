// CORS headers for Softr -> Netlify calls
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // or set to your Softr domain for stricter security
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

import OpenAI from "openai";

const SYSTEM_BASE = "You help users craft Etsy listings. Be concise and follow instructions exactly.";

const PROMPTS = {
  chat: "Hello! Tell me about your listing or upload an image to get started.",
  read: "Thank the user for the image, describe it briefly, then ask if it's accurate. No formatting.",
  title: "Generate a single Etsy-optimized title (~15 words). Output only the title.",
  tags: "Generate 13 Etsy tags (<=20 chars), comma-separated, nothing else.",
  description:
    "Return BB-code:\n\n➠ [b]TITLE OF ITEM[/b]\n- One paragraph with ~5 concrete features, only from provided info.",
  faqs: "Create 2–4 short FAQs with brief answers (Q:/A:)."
};

const pickTask = (m) => PROMPTS[m] || PROMPTS.chat;

export async function handler(event) {
  // Preflight from Softr
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: "Method Not Allowed" };
  }

  try {
    const { userId, listingId, mode, message, imageBase64, imageUrl } = JSON.parse(event.body || "{}");
    if (!userId || !listingId) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "userId and listingId required" }) };
    }

    // Fetch current listing from Softr
    const current = await softrGetRecord(listingId);
    const history = safeJSON(current?.chat_history);

    const contentBlocks = [{ type: "input_text", text: message || "" }];
    if (imageBase64 || imageUrl) {
      const url = imageUrl || imageBase64;
      contentBlocks.push({
        type: "input_image",
        image_url: { url }
      });
    }

    const messages = [
      { role: "system", content: SYSTEM_BASE },
      { role: "system", content: pickTask(mode) },
      ...history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user", content: contentBlocks }
    ];

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages
    });

    const reply = r.choices?.[0]?.message?.content?.trim() || "";

    const updatedHistory = [
      ...history,
      { role: "user", content: message || "", ts: Date.now() },
      { role: "assistant", content: reply, ts: Date.now(), mode }
    ];

    const patch = { chat_history: JSON.stringify(updatedHistory) };
    if (mode === "read") { patch.vision_summary = reply; if (imageUrl) patch.image = imageUrl; }
    if (mode === "title") patch.title = reply;
    if (mode === "tags") patch.tags = reply;
    if (mode === "description") patch.description = reply;
    if (mode === "faqs") patch.faqs = reply;

    await softrUpdateRecord(listingId, patch);

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ reply })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "server_error", detail: String(err) })
    };
  }
}

// --- Softr helpers (REST) ---
async function softrGetRecord(id) {
  const url = `https://api.softr.io/v1/databases/${process.env.SOFTR_DB_ID}/tables/${process.env.SOFTR_LISTINGS_TABLE_ID}/records/${id}`;
  const r = await fetch(url, { headers: { "Softr-Api-Key": process.env.SOFTR_API_KEY } });
  if (!r.ok) return null;
  return await r.json();
}

async function softrUpdateRecord(id, fields) {
  const url = `https://api.softr.io/v1/databases/${process.env.SOFTR_DB_ID}/tables/${process.env.SOFTR_LISTINGS_TABLE_ID}/records/${id}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Softr-Api-Key": process.env.SOFTR_API_KEY },
    body: JSON.stringify(fields)
  });
  if (!r.ok) throw new Error("softr update failed");
}

function safeJSON(s) {
  try {
    const parsed = JSON.parse(s || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

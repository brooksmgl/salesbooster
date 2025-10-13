import OpenAI from "openai";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const { userId, listingId, mode, message, imageBase64, imageUrl } = JSON.parse(event.body || "{}");
  if (!userId || !listingId) return { statusCode: 400, body: "userId and listingId required" };

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const SYSTEM_BASE = "You help users craft Etsy listings. Be concise and follow instructions exactly.";
  const PROMPTS = {
    chat: "Hello! Tell me about your listing or upload an image to get started.",
    read: "Thank the user for the image, describe it briefly, ask if accurate. No formatting.",
    title: "Generate a single Etsy-optimized title (~15 words). Output only the title.",
    tags: "Generate 13 Etsy tags (<=20 chars), comma-separated, nothing else.",
    description:
      "Return BB-code:\n\n➠ [b]TITLE OF ITEM[/b]\n- One paragraph with ~5 concrete features, only from provided info.",
    faqs: "Create 2–4 short FAQs with brief answers (Q:/A:)."
  };
  const task = PROMPTS[mode] || PROMPTS.chat;

  // 1) fetch existing record from Softr
  const rec = await softrGet(listingId);
  const history = safeJSON(rec?.chat_history);

  // 2) build messages
  const content = [{ type: "text", text: message || "" }];
  if (imageBase64 || imageUrl) content.push({ type: "image_url", image_url: imageUrl || imageBase64 });

  const messages = [
    { role: "system", content: SYSTEM_BASE },
    { role: "system", content: task },
    ...history.map(t => ({ role: t.role, content: t.content })),
    { role: "user", content }
  ];

  // 3) OpenAI call
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", temperature: 0.4, messages });
  const reply = r.choices?.[0]?.message?.content?.trim() || "";

  // 4) save back to Softr
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

  await softrPatch(listingId, patch);

  return { statusCode: 200, body: JSON.stringify({ reply }) };
}

// ---- Softr helpers ----
async function softrGet(id) {
  const url = `https://api.softr.io/v1/databases/${process.env.SOFTR_DB_ID}/tables/${process.env.SOFTR_LISTINGS_TABLE_ID}/records/${id}`;
  const r = await fetch(url, { headers: { "Softr-Api-Key": process.env.SOFTR_API_KEY } });
  if (!r.ok) return null;
  return await r.json();
}
async function softrPatch(id, fields) {
  const url = `https://api.softr.io/v1/databases/${process.env.SOFTR_DB_ID}/tables/${process.env.SOFTR_LISTINGS_TABLE_ID}/records/${id}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Softr-Api-Key": process.env.SOFTR_API_KEY },
    body: JSON.stringify(fields)
  });
  if (!r.ok) throw new Error("softr update failed");
}
function safeJSON(s) { try { return JSON.parse(s || "[]"); } catch { return []; } }
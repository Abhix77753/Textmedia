// server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// serve static files (index.html, style.css, script.js)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(__dirname));

// AI proxy endpoint
app.post("/api/ai", async (req, res) => {
  try {
    const key = process.env.OPENROUTER_API_KEY;
    if(!key) return res.status(500).send("OpenRouter API key not configured");
    const prompt = req.body?.prompt;
    if(!prompt) return res.status(400).send("prompt required");

    const url = process.env.OPENROUTER_URL || "https://api.openrouter.ai/v1/chat/completions";
    const model = process.env.OPENROUTER_MODEL || "openrouter-gpt-small";

    // forward to provider (adjust body shape per provider docs)
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model, input: prompt })
    });
    const data = await r.json();
    // try to normalize reply
    const reply = data.output || data.choices?.[0]?.message?.content || data.choices?.[0]?.text || JSON.stringify(data);
    console.log("[server] AI reply length:", String(reply).slice(0,200));
    res.json({ reply });
  } catch(e) {
    console.error("[server] AI error", e);
    res.status(500).send(e.message || String(e));
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, ()=>console.log(`Server running at http://localhost:${PORT}`));
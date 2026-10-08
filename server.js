import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// 🔥 Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🔥 Helper: clamp values between -1 and 1
const clamp = (num) => Math.max(-1, Math.min(1, num));

// 🔥 MAIN ROUTE
app.post("/analyze", async (req, res) => {
  try {
    const { content } = req.body;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a strict JSON API.

Rules:
- ONLY return valid JSON
- NO explanations or extra text
- All scores must be between -1 and 1
- If unsure, use 0

Format:
{
  "rejected": boolean,
  "meaning": number,
  "agency": number,
  "rationalism": number,
  "individualism": number
}
          `,
        },
        {
          role: "user",
          content: `
Analyze this journal entry:

"${content}"
          `,
        },
      ],
    });

    const result = response.choices[0].message.content.trim();

    // 🔥 Clean markdown formatting if present
    const cleaned = result.replace(/```json|```/g, "");

    let parsed;

    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error("RAW AI OUTPUT:", result);
      return res.status(500).json({ error: "Invalid AI response" });
    }

    // 🔥 Clamp values (safety)
    parsed.meaning = clamp(parsed.meaning);
    parsed.agency = clamp(parsed.agency);
    parsed.rationalism = clamp(parsed.rationalism);
    parsed.individualism = clamp(parsed.individualism);

    // 🔥 Insert entry
    const { data: entryData, error: entryError } = await supabase
      .from("entries")
      .insert([{ content }])
      .select();

    if (entryError) {
      console.error(entryError);
      return res.status(500).json({ error: "Entry insert failed" });
    }

    const entryId = entryData[0].id;

    // 🔥 Insert analysis
    const { error: analysisError } = await supabase
      .from("analysis")
      .insert([
        {
          entry_id: entryId,
          meaning: parsed.meaning,
          agency: parsed.agency,
          rationalism: parsed.rationalism,
          individualism: parsed.individualism,
        },
      ]);

    if (analysisError) {
      console.error(analysisError);
      return res.status(500).json({ error: "Analysis insert failed" });
    }

    res.json(parsed);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// 🔥 GET history
app.get("/entries", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("analysis")
      .select(`
        id,
        meaning,
        agency,
        rationalism,
        individualism,
        entries (content, created_at)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Fetch failed" });
    }

    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// 🔥 Start server
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
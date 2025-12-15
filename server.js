require('dotenv').config();
const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Readable } = require('stream');

// OpenAI
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

/* =========================
   BUFFER: Multer in memory
========================= */
const upload = multer({
  storage: multer.memoryStorage()
});

/* =========================
   STREAM helper
========================= */
function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

/* =========================
   Extract text using Buffer + Stream
========================= */
async function extractText(buffer, mimetype) {

  // STREAM created from BUFFER
  const stream = bufferToStream(buffer);

  if (mimetype === 'application/pdf') {
    const parsed = await pdf(stream);
    return parsed.text;
  }

  else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  else {
    return buffer.toString('utf8');
  }
}

/* =========================
   AI Prompt
========================= */
function makePrompt(text) {
  return `
You are a resume parsing assistant.
Extract candidate details and return ONLY valid JSON.

Resume:
"""
${text}
"""
`.trim();
}

/* =========================
   API Endpoint
========================= */
app.post('/parse', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // BUFFER comes from multer
    const { buffer, mimetype } = req.file;

    const text = await extractText(buffer, mimetype);

    const prompt = makePrompt(text);

    const aiResp = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You output only JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0,
      max_tokens: 10000
    });

    let raw = aiResp.choices[0].message.content.trim();
    raw = raw.replace(/```json/g, "").replace(/```/g, "");

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return res.status(500).json({
        error: "Invalid JSON returned by AI",
        raw
      });
    }

    parsed.worker_pid = process.pid; // 👈 proves cluster
    parsed.raw_text_snippet = text.slice(0, 300);

    res.json(parsed);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   Server start
========================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Worker ${process.pid} running on port ${PORT}`);
});

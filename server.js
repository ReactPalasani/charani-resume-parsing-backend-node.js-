require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const cors = require('cors');
const bodyParser = require('body-parser');

// NEW OpenAI SDK — THIS IS CORRECT
const OpenAI = require("openai");
const { log } = require('console');
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

const upload = multer({ dest: 'uploads/' });

// Extract text from PDF/DOCX
async function extractText(filePath, mimetype) {
  if (mimetype === 'application/pdf') {
    console.log("step1");
    const data = fs.readFileSync(filePath);
    console.log("data:", data);

    const parsed = await pdf(data);
    console.log("pdf data:", parsed.text);

    return parsed.text;
  }

  else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword'
  ) {
    console.log("step2");

    const result = await mammoth.extractRawText({ path: filePath });
    console.log("mammoth result:", result);

    return result.value;
  }

  else {
    console.log("step3");
    return fs.readFileSync(filePath, "utf8");
  }
}

// Prompt for AI
function makePrompt(text) {
  return `
You are a resume parsing assistant. Extract the candidate information from the resume text that follows.
Return ONLY valid JSON. No comments or explanation.

Resume:
"""
${text}
"""
`.trim();
}

// API endpoint
app.post('/parse', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const { path: filePath, mimetype } = req.file;
    console.log("Uploaded file path:", filePath);
    const text = await extractText(filePath, mimetype);

    fs.unlinkSync(filePath);

    const prompt = makePrompt(text);

    // NEW OpenAI call — THIS IS CORRECT
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
      return res.status(500).json({ error: "Invalid JSON returned", raw });
    }

    parsed.raw_text_snippet = parsed.raw_text_snippet || text.slice(0, 400);

    return res.json(parsed);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

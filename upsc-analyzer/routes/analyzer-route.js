const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Load Syllabus Reference JSON
const syllabusPath = path.join(__dirname, '../data/syllabus.json');
let syllabusData = { papers: [] };
try {
  syllabusData = JSON.parse(fs.readFileSync(syllabusPath, 'utf8'));
} catch (err) {
  console.error("Error reading syllabus.json:", err);
}

// Extract API Key from Environment or .env file
function getGeminiApiKey() {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '') {
    return process.env.GEMINI_API_KEY.trim();
  }
  try {
    const envPath = path.join(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/GEMINI_API_KEY\s*=\s*(.*)/);
      if (match && match[1]) {
        const extracted = match[1].trim().replace(/^['"]|['"]$/g, '');
        if (extracted) return extracted;
      }
    }
  } catch (e) {}
  return process.env.DEFAULT_GEMINI_KEY || null;
}

// Helper: Extract YouTube Transcript from public YouTube caption tracks
async function fetchYouTubeTranscript(youtubeUrl) {
  if (!youtubeUrl) return null;
  try {
    const videoIdMatch = youtubeUrl.match(/(?:v=|\/embed\/|\/v\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (!videoIdMatch) return null;
    const videoId = videoIdMatch[1];

    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await res.text();

    const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
    if (!playerResponseMatch) return null;

    const playerResponse = JSON.parse(playerResponseMatch[1]);
    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || !captionTracks.length) return null;

    // Prefer English or Hindi or first available track
    const track = captionTracks.find(t => t.languageCode === 'en' || t.languageCode === 'hi') || captionTracks[0];
    if (!track || !track.baseUrl) return null;

    const trackRes = await fetch(track.baseUrl + '&fmt=json3');
    if (!trackRes.ok) return null;

    const trackData = await trackRes.json();
    const events = trackData.events || [];
    let transcriptLines = [];

    for (const ev of events) {
      if (ev.segs) {
        const line = ev.segs.map(s => s.utf8).join('').trim();
        if (line && line !== '\n') {
          const startSec = Math.floor((ev.tStartMs || 0) / 1000);
          const mins = Math.floor(startSec / 60);
          const secs = String(startSec % 60).padStart(2, '0');
          transcriptLines.push(`[${mins}:${secs}] ${line}`);
        }
      }
    }
    
    const fullTranscript = transcriptLines.join(' ');
    // Limit transcript text length to prevent overflowing API limits (~15,000 words max)
    return fullTranscript.length > 50000 ? fullTranscript.slice(0, 50000) + '...' : fullTranscript;
  } catch (err) {
    console.warn("[UPSC Analyzer] Auto transcript fetch notice:", err.message);
    return null;
  }
}

// Build Prompt with Syllabus context
function buildPrompt(mode, extraText) {
  const syllabusListStr = syllabusData.papers.map(p => {
    return `[${p.paper}]: ` + p.topics.map(t => `${t.id}: ${t.text}`).join(' | ');
  }).join('\n');

  return `
You are a senior UPSC Civil Services Examination mentor, subject matter expert, and chief newspaper analyst for IAS toppers.
Your objective is to perform an EXHAUSTIVE, HIGH-YIELD, DEEP-DIVE EXAMINATION ANALYSIS of newspaper content / video transcripts / images.

=====================================================
TOP-TIER UPSC ANALYSIS MANDATES
=====================================================
1. ZERO TRUNCATION / NO OMISSIONS: Read every single word, headline, news article, and transcript paragraph in full detail. DO NOT omit, drop, skip, or casually truncate any topic or detail mentioned in the input text/transcript.
2. GEOGRAPHY & BIODIVERSITY EXTRACTION: You MUST explicitly detect and list all Places in News (cities, countries, rivers, straits, seas, borders, map pointers) AND all Species/Flora/Fauna, IUCN status, National Parks, Wildlife Sanctuaries, Tiger Reserves, Ramsar sites, and Biosphere Reserves mentioned or relevant.
3. HIGH-DENSITY STRUCTURED JSON: Produce rich, high-density structured JSON for EVERY article detected. Include specific constitutional articles, numbers/units, landmark legal precedents, committee recommendations, and prelims facts.
4. Syllabus Mapping: You MUST map each article to valid Syllabus Topic IDs ONLY from this reference list:
${syllabusListStr}
Reject/do not invent any ID not present in the list above.

=====================================================
DETAILED EXTRACTION SECTIONS PER ARTICLE
=====================================================
For every article, extract exhaustively (where applicable):
- title: Complete Headline / Detailed Topic Title
- timestamp: Start-end timestamp if video source (e.g. "04:12 - 08:30") or "N/A"
- context: Detailed background, root causes, and why this topic is currently in the news.
- data: Key facts, statistics, percentages, index scores, financial allocations, and budget figures (always include exact units).
- places: [Places in news, Cities, Countries, Rivers, Straits, Seas, Mountain ranges, Border areas, Map pointers]
- species_national_parks: [Flora & Fauna, Endangered/Vulnerable Species, IUCN Red List status, National Parks, Wildlife Sanctuaries, Tiger Reserves, Biosphere Reserves, Ramsar Sites]
- personalities: [{ name, role, relevance }]
- quotes: [{ text, by }] (Notable quotes by Judges, Ministers, Economists, Experts)
- judgements: [{ case, year, principle }] (Landmark SC/HC judgments, legal tests like Proportionality, Basic Structure, etc.)
- acts: [Constitutional Articles, Amendments, Statutory Acts, Bills, Rules, International Treaties]
- commissions_committees: [{ name, detail }] (Srikrishna, Sarkaria, Punchhi, NITI Aayog, Law Commission, international panels)
- schemes: [Government Schemes, Missions, Policies, Infrastructure Projects]
- international: [Bilateral/Multilateral treaties, Forums, Global groupings, Geopolitical implications]
- reports_indices: [Publisher, Rank, Score, Key Findings]
- glossary: [{ term, meaning }] (Technical/Economic/Legal terms simplified with exact definitions)
- pros: [Multi-dimensional Advantages: Social, Economic, Governance, Environmental, Tech, Geopolitical]
- cons: [Multi-dimensional Challenges/Drawbacks: Implementation bottlenecks, Legal, Structural, Financial]
- way_forward: [Actionable, practical solutions, committee recommendations, best global practices]
- other_important: [High-value exam notes, GS-IV ethical dilemmas, case study angles]
- prelims_pointers: [3-5 High-yield MCQ facts with technical nuances]
- summary: Concise 2-3 line revision takeaway
- syllabus_links: [{ topic_id: "GS2-02", how_to_use: "Specific answer-writing integration hint", usage_type: "Intro" | "Body example" | "Data point" | "Conclusion/Way forward" | "Case study (GS-IV)" }]

=====================================================
STRICT JSON OUTPUT SCHEMA
=====================================================
Respond ONLY with a valid JSON object matching this schema:
{
  "inventory_count": 3,
  "articles": [
    {
      "title": "...",
      "timestamp": "...",
      "context": "...",
      "data": ["..."],
      "places": ["..."],
      "species_national_parks": ["..."],
      "personalities": [{"name": "...", "role": "...", "relevance": "..."}],
      "quotes": [{"text": "...", "by": "..."}],
      "judgements": [{"case": "...", "year": "...", "principle": "..."}],
      "acts": ["..."],
      "commissions_committees": [{"name": "...", "detail": "..."}],
      "schemes": ["..."],
      "international": ["..."],
      "reports_indices": ["..."],
      "glossary": [{"term": "...", "meaning": "..."}],
      "pros": ["..."],
      "cons": ["..."],
      "way_forward": ["..."],
      "other_important": ["..."],
      "prelims_pointers": ["..."],
      "summary": "...",
      "syllabus_links": [{"topic_id": "GS2-01", "how_to_use": "...", "usage_type": "Body example"}]
    }
  ]
}

${extraText ? `Additional input details:\n${extraText}` : ''}
`;
}

// Helper function to repair truncated or incomplete JSON strings from Gemini LLM
function repairTruncatedJson(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') throw new Error("Empty response from AI model.");
  let str = jsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();

  // Try direct parse first
  try {
    return JSON.parse(str);
  } catch (e) {}

  // Remove trailing content after the last closing brace if any extra text exists
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(str.slice(firstBrace, lastBrace + 1));
    } catch (e) {}
  }

  // Bracket balance repair algorithm
  let escaped = false;
  let inString = false;
  let stack = [];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (char === '"' && !escaped) {
      inString = !inString;
    } else if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}' || char === ']') {
        stack.pop();
      }
    }
    escaped = false;
  }

  if (inString) {
    if (str.endsWith('\\')) str = str.slice(0, -1);
    str += '"';
  }

  str = str.replace(/,\s*$/, '');

  while (stack.length > 0) {
    const last = stack.pop();
    str += (last === '{' ? '}' : ']');
  }

  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn("Attempting last valid object regex slice repair...", e.message);
    const match = str.match(/[\s\S]*\}\s*\]\s*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw e;
  }
}

// POST /api/upsc-analyzer/analyze
router.post('/analyze', async (req, res) => {
  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return res.status(400).json({
        error: "Gemini API key is not configured. Please set GEMINI_API_KEY in your environment or .env file."
      });
    }

    const { type, youtubeUrl, images, manualTranscript } = req.body;

    if (type === 'youtube' && !youtubeUrl && !manualTranscript) {
      return res.status(400).json({ error: "Please provide a valid YouTube URL or paste the transcript text." });
    }
    if (type === 'image' && (!images || !images.length)) {
      return res.status(400).json({ error: "Please upload or capture at least one newspaper article image." });
    }

    const contents = [];

    if (type === 'youtube') {
      let extraInfo = `YouTube Source URL: ${youtubeUrl || 'Manual Transcript Provided'}`;
      
      let fetchedTranscript = null;
      if (youtubeUrl && !manualTranscript) {
        fetchedTranscript = await fetchYouTubeTranscript(youtubeUrl);
      }

      if (manualTranscript) {
        extraInfo += `\n\nUser Provided Transcript Content:\n${manualTranscript}`;
      } else if (fetchedTranscript) {
        extraInfo += `\n\nAuto-Extracted Video Transcript Content:\n${fetchedTranscript}`;
      } else if (youtubeUrl) {
        extraInfo += `\n\nNote: Could not auto-fetch video captions. Analyze based on available newspaper context in the video description/title.`;
      }
      
      const promptText = buildPrompt('youtube', extraInfo);
      contents.push({
        parts: [{ text: promptText }]
      });
    } else if (type === 'image') {
      const promptText = buildPrompt('image', "Perform OCR and exam analysis for the attached newspaper article image(s).");
      const parts = [{ text: promptText }];

      // Attach Base64 Images
      for (const imgBase64 of images) {
        const matches = imgBase64.match(/^data:(image\/\w+);base64,(.*)$/);
        if (matches) {
          parts.push({
            inline_data: {
              mime_type: matches[1],
              data: matches[2]
            }
          });
        }
      }

      contents.push({ parts });
    }

    // Call Gemini REST API with Verified Official Active Models (Fast Fallback Order)
    const modelsToTry = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-2.0-flash-lite'
    ];
    
    let response = null;
    let errorText = '';

    const requestPayload = {
      contents,
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    };

    // Render 25-Second Abort Controller Guard to prevent HTTP 502 Proxy Timeouts
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 25000);

    try {
      for (const model of modelsToTry) {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        try {
          const resAttempt = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestPayload),
            signal: abortController.signal
          });

          if (resAttempt.ok) {
            response = resAttempt;
            break;
          }

          errorText = await resAttempt.text();
          console.warn(`[UPSC Analyzer] Model ${model} returned status (${resAttempt.status}):`, errorText.slice(0, 150));

          // If model doesn't exist (404/400), don't retry same model, immediately jump to next model
          if (resAttempt.status === 404 || resAttempt.status === 400) {
            continue;
          }

          // If temporary 503 High Demand or 429 Rate Limit error, wait briefly once and retry next model
          if (resAttempt.status === 503 || resAttempt.status === 429) {
            await new Promise(resolve => setTimeout(resolve, 800));
            continue;
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            console.warn("[UPSC Analyzer] Request aborted due to 25s timeout limit.");
            break;
          }
          console.warn(`[UPSC Analyzer] Fetch error for ${model}:`, err.message);
        }

        if (response) break;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response) {
      return res.status(503).json({
        error: "AI service is currently busy or model unavailable. Please try again in a few seconds.",
        details: errorText || "Request timeout or API response issue"
      });
    }

    const data = await response.json();
    const candidate = data.candidates && data.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
      return res.status(500).json({ error: "Gemini API returned an empty or invalid response format." });
    }

    const rawJsonText = candidate.content.parts[0].text;
    let parsedResult = null;

    try {
      parsedResult = repairTruncatedJson(rawJsonText);
    } catch (parseErr) {
      console.warn("[UPSC Analyzer] JSON repair fallback failed:", parseErr.message);
      return res.status(500).json({
        error: "Failed to parse analysis JSON. The response was too large or malformed.",
        details: parseErr.message
      });
    }

    // Return final analysis result
    res.json({
      success: true,
      analysis: parsedResult
    });

  } catch (err) {
    console.error("UPSC Analyzer Error:", err);
    res.status(500).json({
      error: err.message || "An unexpected error occurred during UPSC Newspaper Analysis."
    });
  }
});

// GET /api/upsc-analyzer/syllabus
router.get('/syllabus', (req, res) => {
  res.json(syllabusData);
});

module.exports = router;


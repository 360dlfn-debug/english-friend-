const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
let API_KEY = process.env.GEMINI_API_KEY || '';
let CURRENT_MODEL = process.env.DEFAULT_MODEL || 'gemini-3.8-flash';
let CURRENT_VOICE = 'Puck'; // Puck (Male), Aoede (Female)

// Support Vercel serverless /tmp writable directory
const STUDY_LOGS_DIR = process.env.VERCEL 
  ? path.join('/tmp', 'study_logs') 
  : path.join(__dirname, 'study_logs');

try {
  if (!fs.existsSync(STUDY_LOGS_DIR)) {
    fs.mkdirSync(STUDY_LOGS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('mkdir warning:', e.message);
}

// Master Cumulative Expression Storage
const MASTER_JSON_PATH = path.join(STUDY_LOGS_DIR, 'MASTER_REVIEW_NOTES.json');
const MASTER_MD_PATH = path.join(STUDY_LOGS_DIR, '누적_복습_표현노트.md');

function loadMasterNotes() {
  if (fs.existsSync(MASTER_JSON_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(MASTER_JSON_PATH, 'utf-8'));
    } catch (e) {
      console.warn('Failed to parse MASTER_REVIEW_NOTES.json:', e);
    }
  }
  return [];
}

function saveMasterNotes(notes) {
  try {
    fs.writeFileSync(MASTER_JSON_PATH, JSON.stringify(notes, null, 2), 'utf-8');

    let md = `# 📚 누적 복습 마스터 표현 노트\n\n`;
    md += `> 이 파일은 지난 모든 대화에서 틀려서 교정한 표현과 배운 단어들이 누적 저장되는 단 하나의 마스터 파일입니다.\n`;
    md += `> AI 친구는 다음 대화 때 여기에 있는 표현을 자연스럽게 내 입에서 나오도록 집요하게 스텔스 유도합니다.\n\n`;
    md += `| 등록일 | 원래 한 말 (오류) | 원어민 추천 표현 (목표) | 뉘앙스 / 설명 | 마스터 상태 |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    notes.forEach(item => {
      const statusIcon = item.status === 'mastered' ? '✅ 마스터 완료' : '🎯 훈련 중 (스텔스 유도 대상)';
      md += `| ${item.dateAdded || '-'} | ${item.original || '-'} | **${item.corrected}** | ${item.explanation || '-'} | ${statusIcon} |\n`;
    });

    fs.writeFileSync(MASTER_MD_PATH, md, 'utf-8');
  } catch (e) {
    console.warn('saveMasterNotes warning:', e.message);
  }
}

// Helper to get recent topics to prevent repetition
function getRecentTopics() {
  try {
    if (!fs.existsSync(STUDY_LOGS_DIR)) return [];
    const files = fs.readdirSync(STUDY_LOGS_DIR).filter(f => f.endsWith('.md') && f.includes('['));
    const recentTopics = [];
    files.forEach(f => {
      const match = f.match(/\[(.*?)\]/);
      if (match) recentTopics.push(match[1]);
    });
    return recentTopics.slice(-5);
  } catch (e) {
    return [];
  }
}

// Read raw SKILL.md with robust built-in fallback
let skillContent = `You are a real-life native English conversation partner for adults (20s-40s).
Keep conversations engaging, casual, witty, and pre-intermediate spoken level.
Lead 10-repetition turn-taking drills whenever correcting awkward phrasing.
Rotate topics across 20 everyday adult themes and avoid repeating recent topics.`;

try {
  const skillPath = path.join(__dirname, 'SKILL.md');
  if (fs.existsSync(skillPath)) {
    skillContent = fs.readFileSync(skillPath, 'utf-8');
  }
} catch (e) {
  console.warn('SKILL.md read warning:', e.message);
}

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Convert PCM 24kHz Mono 16-bit to standard WAV Buffer
function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(buffer, 44);

  return buffer;
}

// Generate Real Gemini Live Native Audio (24kHz Human Voice)
async function generateLiveAudio(text, voiceName = 'Puck') {
  try {
    const key = API_KEY || process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${key}`;
    const payload = {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName
            }
          }
        }
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.warn('Audio generation failed status:', res.status);
      return null;
    }

    const data = await res.json();
    const part = data.candidates?.[0]?.content?.parts?.[0];
    if (part && part.inlineData && part.inlineData.data) {
      const pcmBuffer = Buffer.from(part.inlineData.data, 'base64');
      const wavBuffer = pcmToWav(pcmBuffer);
      return `data:audio/wav;base64,${wavBuffer.toString('base64')}`;
    }
  } catch (err) {
    console.warn('Audio generation exception:', err.message);
  }
  return null;
}

// Network helper for IP
function getLocalIpAddresses() {
  try {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const k in interfaces) {
      for (const k2 in interfaces[k]) {
        const address = interfaces[k][k2];
        if (address.family === 'IPv4' && !address.internal) {
          addresses.push(address.address);
        }
      }
    }
    return addresses;
  } catch (e) {
    return [];
  }
}

// Config Endpoint
app.get('/api/config', (req, res) => {
  const currentKey = API_KEY || process.env.GEMINI_API_KEY;
  res.json({
    hasKey: !!currentKey,
    currentModel: CURRENT_MODEL,
    currentVoice: CURRENT_VOICE,
    availableModels: ['gemini-3.8-flash', 'gemini-3.1-pro-preview'],
    availableVoices: [
      { id: 'Puck', name: '👦 Puck (30대 원어민 남자 친구 - 기본)' },
      { id: 'Aoede', name: '👧 Aoede (30대 원어민 여자 친구)' }
    ],
    localIps: getLocalIpAddresses(),
    port: PORT
  });
});

app.post('/api/config', (req, res) => {
  const { apiKey, model, voice } = req.body;
  if (apiKey) API_KEY = apiKey;
  if (model) CURRENT_MODEL = model;
  if (voice) CURRENT_VOICE = voice;
  res.json({ success: true, currentModel: CURRENT_MODEL, currentVoice: CURRENT_VOICE });
});

// Topic Rotation & Stealth Review Target Initializer Endpoint
app.get('/api/session-init', (req, res) => {
  try {
    const recentTopics = getRecentTopics();
    const masterNotes = loadMasterNotes();
    const pendingTargets = masterNotes.filter(n => n.status !== 'mastered');

    res.json({
      recentTopics,
      pendingTargets: pendingTargets.slice(0, 5)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logs Endpoint
app.get('/api/logs', (req, res) => {
  try {
    const masterNotes = loadMasterNotes();
    let sessionFiles = [];
    if (fs.existsSync(STUDY_LOGS_DIR)) {
      sessionFiles = fs.readdirSync(STUDY_LOGS_DIR)
        .filter(f => f.endsWith('.md') && f.includes('['))
        .sort()
        .reverse();
    }
    res.json({ masterNotes, sessionFiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save Log & Accumulate into Master Cumulative File
app.post('/api/save-log', (req, res) => {
  try {
    const { topic, corrections, fullTranscript, masteredTargets } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const safeTopic = (topic || 'Daily Conversation').replace(/[\\/:*?"<>|]/g, '_');

    const sessionFilename = `${today} [${safeTopic}] English Study.md`;
    const sessionFilePath = path.join(STUDY_LOGS_DIR, sessionFilename);

    const logContent = `# ${today} [${topic || 'General'}] English Study Log

## 1. Session Information
- **Date**: ${today}
- **Main Topic**: ${topic || 'General Practice'}
- **Model Used**: ${CURRENT_MODEL}
- **Voice**: Gemini Live (${CURRENT_VOICE})

## 2. Key Corrections & Targeted Expressions
${corrections && corrections.length > 0 ? corrections.map((c, i) => `
### Correction ${i + 1}
- **Original**: "${c.original}"
- **Native Expression**: "${c.corrected}"
- **Explanation**: ${c.explanation || 'Natural native nuance'}
`).join('\n') : '*No major corrections were needed today! Fantastic work!*'}

## 3. Full Conversation Transcript
\`\`\`text
${fullTranscript || '(No transcript recorded)'}
\`\`\`
`;
    try {
      fs.writeFileSync(sessionFilePath, logContent, 'utf-8');
    } catch (e) {
      console.warn('session file write warning:', e.message);
    }

    const masterNotes = loadMasterNotes();

    if (masteredTargets && Array.isArray(masteredTargets)) {
      masteredTargets.forEach(target => {
        const found = masterNotes.find(m => m.corrected.toLowerCase() === target.toLowerCase());
        if (found) found.status = 'mastered';
      });
    }

    if (corrections && Array.isArray(corrections)) {
      corrections.forEach(c => {
        const exists = masterNotes.some(m => m.corrected.toLowerCase() === c.corrected.toLowerCase());
        if (!exists && c.corrected) {
          masterNotes.push({
            dateAdded: today,
            original: c.original,
            corrected: c.corrected,
            explanation: c.explanation,
            status: 'pending'
          });
        }
      });
    }

    saveMasterNotes(masterNotes);

    res.json({
      success: true,
      sessionFilename,
      masterCount: masterNotes.length,
      pendingCount: masterNotes.filter(m => m.status === 'pending').length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Core Chat Endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const key = req.body.apiKey || API_KEY || process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(400).json({ error: 'API Key is missing.' });
    }

    const { messages, stealthTargets, currentTopic } = req.body;
    const modelToUse = req.body.model || CURRENT_MODEL;
    const voiceToUse = req.body.voice || CURRENT_VOICE;

    let stealthContext = '';
    if (stealthTargets && stealthTargets.length > 0) {
      stealthContext = `
[MANDATORY STEALTH REVIEW & ELICITATION TARGETS]
The user previously struggled with these expressions (from the cumulative master study file):
${stealthTargets.map((t, idx) => `${idx + 1}. Target Native Expression: "${t.corrected}" (Original mistake: "${t.original}")`).join('\n')}

STRICT STEALTH REVIEW RULES:
1. NEVER tell the user directly to use these words (DO NOT say "Try using X from yesterday" or "Remember word Y?").
2. Instead, craft your conversational stories, situational prompts, and questions so naturally that the user HAS TO naturally use these expressions to answer!
3. If the user misses the chance or says it awkwardly, DO NOT move on. Gently re-angle your question or prompt again until they either say it correctly or it gets corrected and drilled!
`;
    }

    const systemPrompt = `
${skillContent}

${stealthContext}

[DIFFICULTY: PRE-INTERMEDIATE]
Keep your sentences accessible, clear, and spoken-friendly (A2~B1). Avoid overly academic or dense vocabulary.

[APP PARSING FORMAT]
1. When correcting an awkward/incorrect sentence:
<<<CORRECTION
Original: [User's phrase]
Corrected: [Natural Native Expression]
Explanation: [Korean 1-sentence explanation of nuance]
CORRECTION>>>
<<<DRILL_COUNT: 1 | TARGET: [Natural Native Expression]>>>
Spoken line: "Instead of that, we usually say: '[Target]'. Let's practice this 10 times! Repeat after me. Number 1: [Target]"

2. In turn-taking drill (Count 2 to 10):
<<<DRILL_COUNT: [Count] | TARGET: [Target]>>>
Spoken line: "Number [Count]: [Target]"

3. Count 10 finished:
Spoken line: "Awesome! 10 times completed. Now back to our chat: [Ask next follow-up question]"
`;

    const geminiContents = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${key}`;
    
    const payload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: geminiContents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800
      }
    };

    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let correction = null;
    const correctionMatch = rawText.match(/<<<CORRECTION\s*([\s\S]*?)\s*CORRECTION>>>/);
    if (correctionMatch) {
      const block = correctionMatch[1];
      const origMatch = block.match(/Original:\s*(.*)/i);
      const corrMatch = block.match(/Corrected:\s*(.*)/i);
      const expMatch = block.match(/Explanation:\s*(.*)/i);
      correction = {
        original: origMatch ? origMatch[1].trim() : '',
        corrected: corrMatch ? corrMatch[1].trim() : '',
        explanation: expMatch ? expMatch[1].trim() : ''
      };
    }

    let drill = null;
    const drillMatch = rawText.match(/<<<DRILL_COUNT:\s*(\d+)\s*\|\s*TARGET:\s*([^>]+)>>>/);
    if (drillMatch) {
      drill = {
        count: parseInt(drillMatch[1], 10),
        target: drillMatch[2].trim()
      };
    }

    let cleanSpokenText = rawText
      .replace(/<<<CORRECTION[\s\S]*?CORRECTION>>>/g, '')
      .replace(/<<<DRILL_COUNT:[^>]+>>>/g, '')
      .trim();

    if (!cleanSpokenText) {
      cleanSpokenText = rawText || "Hey! I'm here. Could you say that again?";
    }

    const audioDataUrl = await generateLiveAudio(cleanSpokenText, voiceToUse);

    console.log(`[Turn in ${Date.now() - startTime}ms] Live Voice generated: ${!!audioDataUrl}`);

    res.json({
      rawText,
      cleanSpokenText,
      correction,
      drill,
      audioDataUrl
    });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Fallback route for SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Local dev listening
if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    const localIps = getLocalIpAddresses();
    console.log(`\n======================================================`);
    console.log(`🚀 English Friend Pure SKILL.md Engine running!`);
    console.log(`📱 Local PC:    http://localhost:${PORT}`);
    localIps.forEach(ip => {
      console.log(`📱 Mobile (WiFi): http://${ip}:${PORT}`);
    });
    console.log(`🎙️  Voice: ${CURRENT_VOICE}`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;

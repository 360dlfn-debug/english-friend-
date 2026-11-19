const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
let API_KEY = process.env.GEMINI_API_KEY || '';
let CURRENT_LIVE_MODEL = process.env.LIVE_MODEL || 'models/gemini-3.8-live';
let CURRENT_VOICE = process.env.DEFAULT_VOICE || 'Puck';

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

const MASTER_JSON_PATH = path.join(STUDY_LOGS_DIR, 'MASTER_REVIEW_NOTES.json');
const MASTER_MD_PATH = path.join(STUDY_LOGS_DIR, '누적_복습_표현노트.md');
const USER_PROFILE_PATH = path.join(STUDY_LOGS_DIR, 'USER_PROFILE.json');

const DEFAULT_USER_PROFILE = {
  name: "My Friend",
  interests: [
    "강남 아파트/부동산 매수 및 집 구하기 (Real estate in Gangnam)",
    "여행 및 홈투어 영상 시청 (Travel & home tour videos)",
    "자동차 운전 및 출퇴근 (Driving & car commuting)",
    "실전 생활 영어 및 자연스러운 일상 대화"
  ],
  personalFacts: [
    "서울 강남 쪽에 집을 매수하거나 이사하는 것에 큰 관심을 두고 있음",
    "주로 차 안에서 운전하거나 이동 중에 영어로 대화함",
    "주변 이웃(neighbors)과 동네 분위기(neighborhood)에 관심이 많음"
  ],
  learningPreferences: [
    "어색하거나 틀린 표현이 나오면 100% 즉시 짚어주고 10회 턴테이킹 반복 훈련(Count 1~10)으로 교정해주길 원함",
    "교과서식 딱딱한 문법보다 30대 원어민 미국인 친구(Puck)와의 위트 있는 진짜 대화를 원함"
  ],
  recentMemories: [
    "강남 집 매수 계획과 아파트 가격 상승에 대해 이야기 나눔 (2026-11-19)",
    "여행 영상 시청 및 동네 분위기에 대한 표현을 연습함 (2026-11-19)"
  ],
  lastLearned: new Date().toISOString()
};

function loadUserProfile() {
  if (fs.existsSync(USER_PROFILE_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(USER_PROFILE_PATH, 'utf-8'));
      return { ...DEFAULT_USER_PROFILE, ...data };
    } catch (e) {
      console.warn('Failed to parse USER_PROFILE.json:', e.message);
    }
  }
  return { ...DEFAULT_USER_PROFILE };
}

function saveUserProfile(profile) {
  try {
    fs.writeFileSync(USER_PROFILE_PATH, JSON.stringify(profile, null, 2), 'utf-8');
  } catch (e) {
    console.warn('saveUserProfile warning:', e.message);
  }
}

function deduplicateWords(str) {
  if (!str || typeof str !== 'string') return '';
  let text = str.trim();
  const words = text.split(/\s+/);
  const dedupWords = [];
  for (let i = 0; i < words.length; i++) {
    const curr = words[i];
    const cleanCurr = curr.toLowerCase().replace(/[^a-z0-9]/gi, '');
    const prev = dedupWords[dedupWords.length - 1];
    const cleanPrev = prev ? prev.toLowerCase().replace(/[^a-z0-9]/gi, '') : '';
    if (cleanCurr && cleanPrev && cleanCurr === cleanPrev) {
      continue;
    }
    dedupWords.push(curr);
  }
  text = dedupWords.join(' ');
  text = text.replace(/\b(\w+\s+\w+)(\s+\1)+\b/gi, '$1');
  return text.trim();
}

function loadMasterNotes() {
  if (fs.existsSync(MASTER_JSON_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(MASTER_JSON_PATH, 'utf-8'));
    } catch (e) {
      console.warn('Failed to parse MASTER_REVIEW_NOTES.json:', e.message);
    }
  }
  return [];
}

function saveMasterNotes(notes) {
  try {
    fs.writeFileSync(MASTER_JSON_PATH, JSON.stringify(notes, null, 2), 'utf-8');

    let md = `# 📚 누적 복습 마스터 표현 노트\n\n`;
    md += `> 지난 대화에서 교정받은 표현과 배운 원어민 표현이 자동 누적됩니다.\n`;
    md += `> AI 친구는 다음 대화 때 이 표현들을 스텔스 유도하여 자연스럽게 입에 붙게 도와줍니다.\n\n`;
    md += `| 등록일 | 원래 한 말 | 원어민 추천 표현 | 뉘앙스 / 설명 | 상태 |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    notes.forEach(item => {
      const statusIcon = item.status === 'mastered' ? '✅ 마스터' : '🎯 복습 대상';
      md += `| ${item.dateAdded || '-'} | ${item.original || '-'} | **${item.corrected}** | ${item.explanation || '-'} | ${statusIcon} |\n`;
    });

    fs.writeFileSync(MASTER_MD_PATH, md, 'utf-8');
  } catch (e) {
    console.warn('saveMasterNotes warning:', e.message);
  }
}

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

function readSkillPrompt() {
  try {
    const skillPath = path.join(__dirname, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      return fs.readFileSync(skillPath, 'utf-8').replace(/^---[\s\S]*?---\s*/, '').trim();
    }
  } catch (e) {
    console.warn('SKILL.md read warning:', e.message);
  }
  return `You are Puck, a warm, witty 30s American English friend.
1. 100% PURE NATIVE AMERICAN ENGLISH ONLY (Zero Korean).
2. STRICT ERROR CORRECTION & 10-REPETITION TURN-TAKING DRILL:
   Whenever the user says ANY awkward phrasing, grammatical mistake, or Konglish (e.g. "A want to buy", "houses price is getting increasing", "I eat medicine", "yesterday I sleep early", "neighborhood means people who live next to me"):
   DO NOT ignore it and DO NOT just keep chatting!
   Immediately lead a 10-repetition drill:
   - "You said '[User's phrase]', but native speakers usually say: '[Target]'. [1 brief sentence explanation of the nuance]. Let's practice this 10 times so it rolls off your tongue! Repeat after me. Number 1: [Target]"
   - Wait for user repetition, then: "Number 2: [Target]" -> wait -> "Number 3: [Target]" -> all the way to "Number 10: [Target]".
   - After count 10: "Awesome! 10 times completed! Great job. Now back to our talk: [Follow-up question]"
3. NOISE REJECTION: Ignore clothing rustle, car noise, breathing, or unintelligible noise completely. Stay silent until clear English speech is heard.`;
}

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

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Config Endpoint
app.get('/api/config', (req, res) => {
  const currentKey = API_KEY || process.env.GEMINI_API_KEY || '';
  res.json({
    hasKey: !!currentKey,
    currentLiveModel: CURRENT_LIVE_MODEL,
    currentVoice: CURRENT_VOICE,
    availableLiveModels: [
      { id: 'models/gemini-3.8-live', name: '⚡ Gemini 3.8 Live (초고속 0.5초 원어민 라이브 - 기본)' },
      { id: 'models/gemini-3.1-flash-live-preview', name: '🎙️ Gemini 3.1 Flash Live' },
      { id: 'models/gemini-2.5-flash-native-audio-latest', name: '🎧 Gemini 2.5 Native Audio' }
    ],
    availableVoices: [
      { id: 'Puck', name: '👦 Puck (친근한 30대 미국 남사친 - 기본)' },
      { id: 'Aoede', name: '👧 Aoede (자연스러운 30대 미국 여사친)' },
      { id: 'Charon', name: '🧔 Charon (차분하고 낮은 미국 남자 친구)' },
      { id: 'Fenrir', name: '😎 Fenrir (에너지 넘치는 미국 남자 친구)' },
      { id: 'Kore', name: '👩 Kore (또렷하고 밝은 미국 여자 친구)' },
      { id: 'Zephyr', name: '✨ Zephyr (부드럽고 편한 미국 친구)' }
    ],
    localIps: getLocalIpAddresses(),
    port: PORT
  });
});

app.post('/api/config', (req, res) => {
  const { apiKey, liveModel, voice } = req.body;
  if (apiKey) API_KEY = apiKey;
  if (liveModel) CURRENT_LIVE_MODEL = liveModel;
  if (voice) CURRENT_VOICE = voice;
  res.json({
    success: true,
    currentLiveModel: CURRENT_LIVE_MODEL,
    currentVoice: CURRENT_VOICE
  });
});

// Session Initializer (Topics + Stealth Review Targets + SKILL.md + User Profile Memory)
app.get('/api/session-init', (req, res) => {
  try {
    const recentTopics = getRecentTopics();
    const masterNotes = loadMasterNotes();
    const pendingTargets = masterNotes.filter(n => n.status !== 'mastered');
    const userProfile = loadUserProfile();

    res.json({
      recentTopics,
      pendingTargets: pendingTargets.slice(0, 5),
      skillPrompt: readSkillPrompt(),
      userProfile
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User Profile & Long-Term Memory Endpoints
app.get('/api/user-profile', (req, res) => {
  res.json(loadUserProfile());
});

app.post('/api/user-profile', (req, res) => {
  try {
    const current = loadUserProfile();
    const updated = {
      ...current,
      ...req.body,
      lastLearned: new Date().toISOString()
    };
    saveUserProfile(updated);
    res.json({ success: true, profile: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Background Continuous Learner: Extracts new personal facts from conversations
app.post('/api/learn-user-memory', async (req, res) => {
  try {
    const key = req.body.apiKey || API_KEY || process.env.GEMINI_API_KEY;
    const { transcript } = req.body;

    if (!key || !transcript || transcript.length < 25) {
      return res.json({ success: false, message: 'Transcript too short or key missing' });
    }

    const currentProfile = loadUserProfile();

    const prompt = `You are the personal long-term memory engine for Puck, an American native friend talking in English to a Korean adult learner.
Your job is to learn about the user so you genuinely know their life, habits, interests, and preferences across past and future conversations.

CURRENT USER MEMORY:
${JSON.stringify(currentProfile, null, 2)}

LATEST CONVERSATION TRANSCRIPT:
"""
${transcript}
"""

TASK:
Identify any NEW personal facts, life situation (job, where they live/plan to buy a house, car driving), hobbies, opinions, or conversation highlights the user shared in this session.
Merge them intelligently with the current memory (keep past facts, add new ones, avoid duplicate wording).

Respond with STRICT JSON ONLY matching this format:
{
  "interests": ["list of updated/combined interest strings"],
  "personalFacts": ["list of updated/combined factual statements about user's life"],
  "learningPreferences": ["list of updated/combined learning preferences"],
  "recentMemories": ["latest 5 concise bullet points of things we talked about"]
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 }
        }
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) {
      return res.json({ success: false, error: 'Gemini memory extraction failed' });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const learned = JSON.parse(raw);

    const updated = {
      ...currentProfile,
      interests: (learned.interests && learned.interests.length > 0) ? learned.interests : currentProfile.interests,
      personalFacts: (learned.personalFacts && learned.personalFacts.length > 0) ? learned.personalFacts : currentProfile.personalFacts,
      learningPreferences: (learned.learningPreferences && learned.learningPreferences.length > 0) ? learned.learningPreferences : currentProfile.learningPreferences,
      recentMemories: (learned.recentMemories && learned.recentMemories.length > 0) ? learned.recentMemories : currentProfile.recentMemories,
      lastLearned: new Date().toISOString()
    };

    saveUserProfile(updated);
    res.json({ success: true, profile: updated });
  } catch (err) {
    console.warn('[Learn User Memory Error]:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// Silent Out-of-Band Background Correction Extractor (0ms voice latency!)
app.post('/api/analyze-turn', async (req, res) => {
  try {
    const key = req.body.apiKey || API_KEY || process.env.GEMINI_API_KEY;
    const { userText, aiText } = req.body;

    if (!key || !userText || !aiText) {
      return res.json({ hasTip: false });
    }

    const prompt = `You analyze one exchange between a Korean English learner and their native American friend.
User said: "${userText}"
Friend replied: "${aiText}"

Did the friend correct an unnatural/grammatically awkward phrase from the user OR explain a useful native English expression/word?
Respond with STRICT JSON ONLY (no markdown):
{
  "hasTip": true or false,
  "original": "the exact awkward phrase the user said (or the unknown word asked about)",
  "corrected": "the natural native English expression recommended by the friend",
  "explanation": "1 concise Korean sentence explaining the nuance or why native speakers say it this way"
}
If it was just normal casual chatting with NO correction or vocabulary teaching, return {"hasTip": false}.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 400,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 }
        }
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) {
      return res.json({ hasTip: false });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(raw);

    if (parsed && parsed.hasTip && parsed.corrected) {
      return res.json({
        hasTip: true,
        original: deduplicateWords(String(parsed.original || userText).trim()),
        corrected: deduplicateWords(String(parsed.corrected).trim()),
        explanation: String(parsed.explanation || '').trim()
      });
    }
    return res.json({ hasTip: false });
  } catch (err) {
    return res.json({ hasTip: false });
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
    const { topic, corrections, fullTranscript, masteredTargets, voice } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const safeTopic = (topic || 'Daily Conversation').replace(/[\\/:*?"<>|]/g, '_');

    const sessionFilename = `${today} [${safeTopic}] English Study.md`;
    const sessionFilePath = path.join(STUDY_LOGS_DIR, sessionFilename);

    const logContent = `# ${today} [${topic || 'General'}] English Study Log

## 1. Session Information
- **Date**: ${today}
- **Main Topic**: ${topic || 'General Practice'}
- **Live Model**: ${CURRENT_LIVE_MODEL}
- **Voice**: Gemini Live (${voice || CURRENT_VOICE})

## 2. Key Corrections & Targeted Expressions
${corrections && corrections.length > 0 ? corrections.map((c, i) => `
### Expression ${i + 1}
- **Original**: "${c.original}"
- **Native Expression**: "${c.corrected}"
- **Explanation**: ${c.explanation || 'Natural native nuance'}
`).join('\n') : '*Great natural conversation today!*'}

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
        const cleanOrig = deduplicateWords(c.original || '');
        const cleanCorr = deduplicateWords(c.corrected || '');
        const exists = masterNotes.some(m => deduplicateWords(m.corrected).toLowerCase() === cleanCorr.toLowerCase());
        if (!exists && cleanCorr) {
          masterNotes.push({
            dateAdded: today,
            original: cleanOrig,
            corrected: cleanCorr,
            explanation: c.explanation || '',
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

// Google Drive Sync Endpoint
app.post('/api/sync-gdrive', async (req, res) => {
  try {
    const { topic, corrections, fullTranscript, webhookUrl, date } = req.body;
    const targetUrl = webhookUrl || process.env.GDRIVE_WEBHOOK_URL;
    if (!targetUrl) {
      return res.status(400).json({ error: 'Google Drive Webhook URL is missing.' });
    }

    const payload = {
      topic: topic || 'Daily Conversation',
      corrections: corrections || [],
      fullTranscript: fullTranscript || '',
      date: date || new Date().toISOString().split('T')[0]
    };

    const gRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const result = await gRes.json().catch(() => ({ success: true, message: 'Google Drive sync requested.' }));
    res.json(result);
  } catch (err) {
    console.error('Google Drive sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Fallback route for SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    const localIps = getLocalIpAddresses();
    console.log(`\n======================================================`);
    console.log(`🚀 English Friend — Gemini 3.8 Live Native Audio Server`);
    console.log(`📱 Local PC:    http://localhost:${PORT}`);
    localIps.forEach(ip => {
      console.log(`📱 Mobile (WiFi): http://${ip}:${PORT}`);
    });
    console.log(`🎙️  Live Model: ${CURRENT_LIVE_MODEL} | Voice: ${CURRENT_VOICE}`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;

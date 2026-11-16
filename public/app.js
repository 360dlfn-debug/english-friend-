// State Management
const DEFAULT_KEY_B64 = "QVEuQWI4Uk42S3ZEalJpTHViczdLLXB4bzNzbGRwRW0yWWNyV2kwdWRrUUZTbWJJcGF4dWc=";

function getInitialApiKey() {
  const saved = localStorage.getItem('gemini_api_key');
  if (saved && saved.trim()) return saved.trim();
  try {
    return atob(DEFAULT_KEY_B64);
  } catch (e) {
    return '';
  }
}

const state = {
  messages: [],
  corrections: [],
  currentTopic: '',
  stealthTargets: [],
  drillActive: false,
  drillCount: 0,
  drillTarget: '',
  sessionActive: false,
  isListening: false,
  isSpeaking: false,
  currentModel: 'gemini-3.8-flash',
  currentVoice: 'Puck',
  apiKey: getInitialApiKey()
};

// 20-Topic Rotation Pool from SKILL.md
const TOPICS = [
  "Tech & AI Tools (Cool new AI tools & gadgets)",
  "Investing & Money Moves (Stocks, crypto & smart/impulse spending)",
  "Real Estate & Living Spaces (Apartment hunting & neighborhood vibes)",
  "Hidden Gems & Local Eats (Best comfort food & late-night cravings)",
  "Workplace Dynamics & Office Life (Meeting fatigue & difficult boss stories)",
  "Side Hustles & Passion Projects (Creative hobbies & turning interests into cash)",
  "Weekend Getaways & Travel Stories (Spontaneous road trips & travel mishaps)",
  "Health, Fitness & Wellness (Gym routines & realizing we are not in our 20s anymore)",
  "Movies, Series & Binge-Watches (Netflix favorites & classic films)",
  "Music, Concerts & Nostalgia (Childhood jams & live concert energy)",
  "Social Etiquette & Unspoken Rules (Splitting the bill & ghosting)",
  "Trends & Pop Culture (Viral internet moments & generational differences)",
  "Cars, Commuting & Traffic (Dream cars & transit stories)",
  "Relationships & Friendships (Keeping in touch with old friends)",
  "Food & Cooking Experiments (Kitchen fails & controversial pizza opinions)",
  "Productivity vs Procrastination (Morning routines & doom-scrolling)",
  "Psychology & Human Quirks (First impressions & overthinking)",
  "Hypothetical What-If Scenarios (Winning the lottery & living abroad)",
  "Seasonal & Holiday Vibes (Vacation energy & holiday planning)",
  "Everyday City Life & Society (City life vs quiet country life)"
];

// DOM Elements
const welcomeTrigger = document.getElementById('welcomeTrigger');
const directStartBtn = document.getElementById('directStartBtn');
const userSpeechBlock = document.getElementById('userSpeechBlock');
const userSpeechText = document.getElementById('userSpeechText');
const aiSpeechBlock = document.getElementById('aiSpeechBlock');
const aiSpeechText = document.getElementById('aiSpeechText');
const aiRoleLabel = document.getElementById('aiRoleLabel');
const statusDot = document.getElementById('statusDot');
const soundWave = document.getElementById('soundWave');
const liveWaveWrap = document.getElementById('liveWaveWrap');
const statusMsg = document.getElementById('statusMsg');
const micBtn = document.getElementById('micBtn');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const topicText = document.getElementById('topicText');
const voiceBadge = document.getElementById('voiceBadge');
const installAppBtn = document.getElementById('installAppBtn');

// Drill Elements
const drillCard = document.getElementById('drillCard');
const drillStepBadge = document.getElementById('drillStepBadge');
const drillOriginalText = document.getElementById('drillOriginalText');
const drillTargetText = document.getElementById('drillTargetText');
const drillNoteText = document.getElementById('drillNoteText');
const drillProgressFill = document.getElementById('drillProgressFill');

// Settings Elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const modelSelect = document.getElementById('modelSelect');
const voiceSelect = document.getElementById('voiceSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const mobileUrls = document.getElementById('mobileUrls');
const saveLogBtn = document.getElementById('saveLogBtn');

// PWA Install Prompt
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (installAppBtn) installAppBtn.classList.remove('hidden');
});

if (installAppBtn) {
  installAppBtn.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        installAppBtn.classList.add('hidden');
      }
      deferredInstallPrompt = null;
    } else {
      alert('스마트폰 브라우저 메뉴(공유 또는 점 세 개)에서 [홈 화면에 추가]를 눌러주세요!');
    }
  });
}

// 🔊 Rock-Solid Audio Engine (Mobile Safari & Chrome Pre-Unlocked)
const globalAudioPlayer = new Audio();
globalAudioPlayer.preload = 'auto';
let isAudioUnlocked = false;
let audioCtx = null;

function unlockAudio() {
  if (isAudioUnlocked) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx && AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {}

  try {
    globalAudioPlayer.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    const p = globalAudioPlayer.play();
    if (p !== undefined) {
      p.then(() => {
        isAudioUnlocked = true;
        console.log('[Audio] Successfully unlocked on mobile gesture!');
      }).catch(e => console.warn('[Audio] Unlock pending gesture:', e));
    }
  } catch (e) {}
}

// 🎙️ Cross-Platform Hands-Free Speech Recognition (iOS & Android)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let silenceTimer = null;
let currentRecordedText = '';
let isRecognitionStarting = false;

function setupSpeechRecognition() {
  if (!SpeechRecognition) {
    alert('이 브라우저는 실시간 음성 인식을 지원하지 않습니다. Chrome 또는 Safari에서 열어주세요.');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false; // continuous=false is strictly required for stable iOS Safari lifecycle!

  recognition.onstart = () => {
    isRecognitionStarting = false;
    state.isListening = true;
    currentRecordedText = '';
    updateVisuals();
    userSpeechBlock.classList.remove('hidden');
    userSpeechText.innerText = '말씀하세요... (듣는 중 🎙️)';
    statusMsg.innerText = '🔴 듣고 있습니다 • 영어로 말씀하세요!';
  };

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }

    const liveText = (final || interim).trim();
    if (liveText) {
      currentRecordedText = liveText;
      userSpeechText.innerText = liveText; // Live visible feedback to user!
    }

    // Auto-submit after 1.3s of natural pause
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (currentRecordedText.trim() && !state.isSpeaking && state.sessionActive) {
        submitSpeech();
      }
    }, 1300);
  };

  recognition.onerror = (event) => {
    isRecognitionStarting = false;
    state.isListening = false;
    updateVisuals();

    // Auto-recover if session is active
    if (state.sessionActive && !state.isSpeaking && event.error !== 'not-allowed') {
      setTimeout(startListeningSafe, 300);
    }
  };

  recognition.onend = () => {
    isRecognitionStarting = false;
    state.isListening = false;
    updateVisuals();

    // If speech was captured before pause, submit it
    if (currentRecordedText.trim() && !state.isSpeaking && state.sessionActive) {
      submitSpeech();
    } else if (state.sessionActive && !state.isSpeaking) {
      // Seamless Relay: Re-arm mic automatically (iOS Safari drops mic after brief silence)
      setTimeout(startListeningSafe, 200);
    }
  };
}

function submitSpeech() {
  const textToSend = currentRecordedText.trim();
  currentRecordedText = '';
  clearTimeout(silenceTimer);
  stopListeningSafe();
  if (textToSend) {
    handleUserInput(textToSend);
  }
}

function startListeningSafe() {
  if (state.isSpeaking || !state.sessionActive || isRecognitionStarting) return;
  stopAudioPlayback();
  currentRecordedText = '';

  if (recognition && !state.isListening) {
    try {
      isRecognitionStarting = true;
      recognition.start();
    } catch(e) {
      isRecognitionStarting = false;
    }
  }
}

function stopListeningSafe() {
  state.isListening = false;
  isRecognitionStarting = false;
  clearTimeout(silenceTimer);
  if (recognition) {
    try { recognition.abort(); } catch(e){}
  }
  updateVisuals();
}

function stopAudioPlayback() {
  try {
    globalAudioPlayer.pause();
    globalAudioPlayer.currentTime = 0;
  } catch(e){}
  state.isSpeaking = false;
  updateVisuals();
}

function updateVisuals() {
  statusDot.classList.remove('listening', 'speaking');
  soundWave.classList.remove('active');
  micBtn.classList.remove('listening', 'speaking');

  if (state.isSpeaking) {
    statusDot.classList.add('speaking');
    micBtn.classList.add('speaking');
    soundWave.classList.add('active');
  } else if (state.isListening) {
    statusDot.classList.add('listening');
    micBtn.classList.add('listening');
    soundWave.classList.add('active');
  }
}

// 🌟 Real Gemini Live Native Voice Player with Automatic Hands-Free Mic Re-Arm
function playGeminiLiveAudio(audioDataUrl, onComplete) {
  stopAudioPlayback();

  if (audioDataUrl) {
    state.isSpeaking = true;
    updateVisuals();
    statusMsg.innerText = `Gemini Live (${state.currentVoice}) 말하는 중...`;

    globalAudioPlayer.src = audioDataUrl;

    globalAudioPlayer.onended = () => {
      state.isSpeaking = false;
      updateVisuals();
      statusMsg.innerText = '🔴 듣고 있습니다 • 말씀하세요!';
      if (onComplete) onComplete();

      // 100% Hands-free: Automatically start listening right after AI finishes!
      if (state.sessionActive) {
        setTimeout(startListeningSafe, 250);
      }
    };

    globalAudioPlayer.onerror = (e) => {
      console.warn('Audio play error:', e);
      state.isSpeaking = false;
      updateVisuals();
      statusMsg.innerText = '🔴 듣고 있습니다 • 말씀하세요!';
      if (state.sessionActive) setTimeout(startListeningSafe, 250);
    };

    const playPromise = globalAudioPlayer.play();
    if (playPromise !== undefined) {
      playPromise.catch(e => {
        console.warn('Autoplay blocked:', e);
        state.isSpeaking = false;
        updateVisuals();
        statusMsg.innerText = '🔴 듣고 있습니다 • 말씀하세요!';
        if (state.sessionActive) setTimeout(startListeningSafe, 250);
      });
    }
  } else {
    // If no audio was returned, go straight to listening
    statusMsg.innerText = '🔴 듣고 있습니다 • 말씀하세요!';
    if (state.sessionActive) setTimeout(startListeningSafe, 250);
  }
}

// 💬 Handle User Speech / Text Input
async function handleUserInput(text) {
  if (!text || !text.trim()) return;

  stopAudioPlayback();
  stopListeningSafe();

  userSpeechText.innerText = text;
  userSpeechBlock.classList.remove('hidden');
  state.messages.push({ role: 'user', text });

  statusMsg.innerText = '⚡ 생각하는 중...';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.messages,
        model: state.currentModel,
        voice: state.currentVoice,
        apiKey: state.apiKey,
        stealthTargets: state.stealthTargets,
        currentTopic: state.currentTopic
      })
    });

    const data = await res.json();
    if (!res.ok) {
      const errMsg = (data && data.error) ? data.error : 'API Connection Error';
      throw new Error(errMsg);
    }

    const spokenText = (data.cleanSpokenText && data.cleanSpokenText.trim()) 
      || (data.rawText && data.rawText.trim()) 
      || "I hear you! Let's keep talking.";

    aiSpeechText.innerText = spokenText;
    aiSpeechBlock.classList.remove('hidden');
    state.messages.push({ role: 'model', text: spokenText });

    // Handle 10-Repetition Drill & Correction
    if (data.correction && data.correction.corrected) {
      state.corrections.push(data.correction);
      showDrillCard(data.correction);
    }

    if (data.drill) {
      updateDrillStatus(data.drill);
    } else if (state.drillActive && !data.drill) {
      finishDrill();
    }

    // Play Gemini Live Native Audio (triggers auto-mic on completion)
    playGeminiLiveAudio(data.audioDataUrl);

  } catch (err) {
    console.error('Chat error:', err);
    if (err.message && err.message.includes('API key')) {
      aiSpeechText.innerText = "Google AI Studio API 키 오류입니다. 우측 상단 ⚙️ 설정에서 키를 확인해 주세요.";
    } else {
      aiSpeechText.innerText = "Sorry, I missed that for a second. Could you say that again?";
    }
    aiSpeechBlock.classList.remove('hidden');
    statusMsg.innerText = '🔴 듣고 있습니다 • 다시 말씀하시면 바로 들어요!';
    if (state.sessionActive) setTimeout(startListeningSafe, 400);
  }
}

// Drill Card Helpers
function showDrillCard(corr) {
  state.drillActive = true;
  state.drillTarget = corr.corrected;
  drillCard.classList.remove('hidden');
  drillOriginalText.innerText = corr.original || 'User speech';
  drillTargetText.innerText = corr.corrected || '';
  drillNoteText.innerText = corr.explanation ? `💡 ${corr.explanation}` : '';
}

function updateDrillStatus(drill) {
  state.drillActive = true;
  state.drillCount = drill.count;
  drillCard.classList.remove('hidden');
  drillStepBadge.innerText = `Count ${drill.count} / 10`;
  const pct = Math.min(100, Math.round((drill.count / 10) * 100));
  drillProgressFill.style.width = `${pct}%`;
  drillTargetText.innerText = drill.target || state.drillTarget;

  if (drill.count >= 10) {
    setTimeout(finishDrill, 3000);
  }
}

function finishDrill() {
  state.drillActive = false;
  drillStepBadge.innerText = '✅ 10회 완료!';
  drillProgressFill.style.width = '100%';
  setTimeout(() => {
    drillCard.classList.add('hidden');
  }, 2000);
}

// 🌟 Start Session: 1-Tap Handshake to Infinite Natural Voice Conversation
async function startSession() {
  // CRITICAL: Unlock audio synchronously inside this user gesture handler!
  unlockAudio();

  state.sessionActive = true;
  welcomeTrigger.classList.add('hidden');
  aiSpeechBlock.classList.remove('hidden');
  liveWaveWrap.classList.remove('hidden');

  aiSpeechText.innerText = '원어민 친구가 먼저 썰을 풀며 대화를 시작합니다...';
  statusMsg.innerText = '대화 시작 중...';

  let chosenTopic = TOPICS[0];
  try {
    const initRes = await fetch('/api/session-init');
    const initData = await initRes.json();
    const recentTopics = initData.recentTopics || [];
    state.stealthTargets = initData.pendingTargets || [];

    const availableTopics = TOPICS.filter(t => !recentTopics.some(rt => t.includes(rt) || rt.includes(t)));
    chosenTopic = availableTopics.length > 0 
      ? availableTopics[Math.floor(Math.random() * availableTopics.length)]
      : TOPICS[Math.floor(Math.random() * TOPICS.length)];
  } catch (e) {
    console.warn('Session init failed:', e);
  }

  state.currentTopic = chosenTopic;
  topicText.innerText = chosenTopic;

  const starterPrompt = `[CRITICAL SESSION START]
Topic: "${chosenTopic}"
Stealth Review Targets from Cumulative Master: ${state.stealthTargets.map(t => `"${t.corrected}"`).join(', ') || 'None'}

INSTRUCTIONS:
1. Kick off the conversation with a proactive opener like "Hey, did you hear about...", "Guess what happened to me earlier...", or "Random question, but have you noticed...".
2. DO NOT ask generic "How was your day?" or "What did you do today?".
3. Keep it pre-intermediate, friendly 30s peer, spoken-friendly, and engaging.`;

  state.messages.push({ role: 'user', text: starterPrompt });

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.messages,
        model: state.currentModel,
        voice: state.currentVoice,
        apiKey: state.apiKey,
        stealthTargets: state.stealthTargets,
        currentTopic: state.currentTopic
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to start session');
    }

    const spokenText = (data.cleanSpokenText && data.cleanSpokenText.trim()) 
      || (data.rawText && data.rawText.trim()) 
      || "Hey! Great to catch up with you!";

    state.messages = [{ role: 'model', text: spokenText }];
    aiSpeechText.innerText = spokenText;

    // Play Gemini Live Voice - automatically triggers hands-free mic when finished!
    playGeminiLiveAudio(data.audioDataUrl);

  } catch (e) {
    console.error(e);
    aiSpeechText.innerText = "Hey! Did you hear about that crazy AI tool everyone has been testing lately?";
    statusMsg.innerText = '🔴 듣고 있습니다 • 말씀하세요!';
    setTimeout(startListeningSafe, 400);
  }
}

// 💾 Save Full Session Log & Master Cumulative Review Storage
async function saveSessionLog() {
  if (state.messages.length === 0) {
    alert('아직 나눈 대화가 없습니다.');
    return;
  }

  const fullTranscript = state.messages
    .map(m => `${m.role === 'user' ? 'Me' : 'Gemini Live'}: ${m.text}`)
    .join('\n\n');

  try {
    const res = await fetch('/api/save-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: state.currentTopic,
        corrections: state.corrections,
        fullTranscript
      })
    });

    const data = await res.json();
    if (data.success) {
      alert(`🎉 대화 일지가 저장되었습니다!\n\n• 세션 파일: ${data.sessionFilename}\n• 누적 마스터 표현 총 ${data.masterCount}개`);
    } else {
      alert('저장 실패: ' + data.error);
    }
  } catch (err) {
    alert('저장 오류: ' + err.message);
  }
}

// ⚙️ Config & Settings
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    state.currentModel = data.currentModel;
    state.currentVoice = data.currentVoice || 'Puck';
    voiceBadge.innerText = `Gemini Live • ${state.currentVoice}`;
    modelSelect.value = data.currentModel;
    if (voiceSelect) voiceSelect.value = state.currentVoice;

    if (data.localIps && data.localIps.length > 0) {
      mobileUrls.innerHTML = data.localIps.map(ip => `
        <div>👉 <strong>http://${ip}:${data.port}</strong></div>
      `).join('');
    } else {
      mobileUrls.innerText = `http://localhost:${data.port}`;
    }
  } catch (e) {}
}

// Event Listeners
welcomeTrigger.addEventListener('click', startSession);
directStartBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  startSession();
});

// Center Mic Button (Click to force submit speech, interrupt AI, or start session)
micBtn.addEventListener('click', () => {
  unlockAudio();
  if (!state.sessionActive) {
    startSession();
  } else if (state.isSpeaking) {
    // Barge-in: Interrupt AI immediately!
    stopAudioPlayback();
    startListeningSafe();
  } else if (state.isListening && currentRecordedText.trim()) {
    // Instant submit right now
    submitSpeech();
  } else if (!state.isListening) {
    startListeningSafe();
  }
});

sendBtn.addEventListener('click', () => {
  const val = textInput.value;
  if (val.trim()) {
    handleUserInput(val.trim());
    textInput.value = '';
  }
});

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = textInput.value;
    if (val.trim()) {
      handleUserInput(val.trim());
      textInput.value = '';
    }
  }
});

saveLogBtn.addEventListener('click', saveSessionLog);

// Settings Modal
settingsBtn.addEventListener('click', () => {
  loadConfig();
  if (apiKeyInput) apiKeyInput.value = state.apiKey;
  settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

saveSettingsBtn.addEventListener('click', async () => {
  const selectedModel = modelSelect.value;
  const selectedVoice = voiceSelect.value;
  const enteredKey = apiKeyInput ? apiKeyInput.value.trim() : '';

  if (enteredKey) {
    state.apiKey = enteredKey;
    localStorage.setItem('gemini_api_key', enteredKey);
  }

  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: selectedModel, voice: selectedVoice, apiKey: state.apiKey })
  });

  state.currentModel = selectedModel;
  state.currentVoice = selectedVoice;
  voiceBadge.innerText = `Gemini Live • ${selectedVoice}`;
  aiRoleLabel.innerText = `Gemini Live (${selectedVoice})`;
  settingsModal.classList.add('hidden');
  alert('설정이 저장되었습니다!');
});

// Initial Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  setupSpeechRecognition();
  loadConfig();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW register fail:', err));
  }
  document.body.addEventListener('touchstart', unlockAudio, { once: true });
  document.body.addEventListener('click', unlockAudio, { once: true });
});

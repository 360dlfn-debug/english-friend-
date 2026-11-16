// State Management
const state = {
  messages: [],
  corrections: [],
  currentTopic: '',
  stealthTargets: [], // Expressions to elicit secretly from the master notebook
  drillActive: false,
  drillCount: 0,
  drillTarget: '',
  handsFree: true,
  isListening: false,
  isSpeaking: false,
  currentModel: 'gemini-3.8-flash',
  currentVoice: 'Puck',
  apiKey: localStorage.getItem('gemini_api_key') || ''
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
      alert('스마트폰 브라우저 메뉴에서 [홈 화면에 추가] 또는 [앱 설치]를 눌러주세요!');
    }
  });
}

// Speech Recognition & Gemini Live Audio
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let currentAudio = null;
let silenceTimer = null;
let isAudioUnlocked = false;

function unlockAudio() {
  if (isAudioUnlocked) return;
  const silent = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
  silent.play().then(() => { isAudioUnlocked = true; }).catch(() => {});
}

function initSpeech() {
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      stopAudioPlayback();
      state.isListening = true;
      updateVisuals();
      userSpeechBlock.classList.remove('hidden');
      userSpeechText.innerText = 'Listening to you...';
      statusMsg.innerText = '듣고 있습니다...';
    };

    recognition.onspeechstart = () => {
      stopAudioPlayback();
    };

    recognition.onresult = (event) => {
      stopAudioPlayback();

      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const display = final || interim;
      if (display) {
        userSpeechText.innerText = display;
      }

      clearTimeout(silenceTimer);
      if (interim.trim() && !final.trim()) {
        silenceTimer = setTimeout(() => {
          if (recognition && state.isListening) {
            try { recognition.stop(); } catch(e){}
            handleUserInput(interim.trim());
          }
        }, 1100);
      }

      if (final.trim()) {
        clearTimeout(silenceTimer);
        handleUserInput(final.trim());
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech error:', event.error);
      stopListening();
    };

    recognition.onend = () => {
      stopListening();
    };
  }
}

function startListening() {
  unlockAudio();
  stopAudioPlayback();
  if (recognition && !state.isListening) {
    try {
      recognition.start();
    } catch(e) {
      console.warn('Recognition start error:', e);
    }
  }
}

function stopListening() {
  state.isListening = false;
  clearTimeout(silenceTimer);
  updateVisuals();
  statusMsg.innerText = state.isSpeaking ? '원어민 친구 말하는 중...' : '대기 중 • 마이크 탭';
}

function stopAudioPlayback() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch(e){}
    currentAudio = null;
  }
  state.isSpeaking = false;
  updateVisuals();
}

function updateVisuals() {
  statusDot.classList.remove('listening', 'speaking');
  soundWave.classList.remove('active');
  micBtn.classList.remove('listening', 'speaking');

  if (state.isListening) {
    statusDot.classList.add('listening');
    micBtn.classList.add('listening');
    soundWave.classList.add('active');
  } else if (state.isSpeaking) {
    statusDot.classList.add('speaking');
    micBtn.classList.add('speaking');
    soundWave.classList.add('active');
  }
}

// Play Pure Gemini Live Native Voice
function playGeminiLiveAudio(audioDataUrl, onComplete) {
  stopAudioPlayback();

  if (audioDataUrl) {
    state.isSpeaking = true;
    updateVisuals();
    statusMsg.innerText = `Gemini Live (${state.currentVoice}) 말하는 중...`;

    currentAudio = new Audio(audioDataUrl);

    currentAudio.onended = () => {
      state.isSpeaking = false;
      currentAudio = null;
      updateVisuals();
      statusMsg.innerText = '준비 완료 • 편하게 말씀하세요';
      if (onComplete) onComplete();

      if (state.handsFree) {
        setTimeout(startListening, 300);
      }
    };

    currentAudio.onerror = (e) => {
      console.warn('Audio playback error:', e);
      state.isSpeaking = false;
      updateVisuals();
    };

    currentAudio.play().catch(e => {
      console.warn('Audio play blocked:', e);
      state.isSpeaking = false;
      updateVisuals();
    });
  } else {
    if (state.handsFree) {
      setTimeout(startListening, 1000);
    }
  }
}

// Handle User Input
async function handleUserInput(text) {
  if (!text.trim()) return;

  unlockAudio();
  stopAudioPlayback();

  userSpeechText.innerText = text;
  userSpeechBlock.classList.remove('hidden');
  state.messages.push({ role: 'user', text });

  statusMsg.innerText = '답변 생성 중...';

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

    if (!res.ok) throw new Error('API Error');

    const data = await res.json();
    if (!res.ok) {
      const errMsg = (data && data.error) ? data.error : 'API Error';
      throw new Error(errMsg);
    }
    const spokenText = data.cleanSpokenText || data.rawText || "Hey! How can I help you today?";

    aiSpeechText.innerText = spokenText;
    state.messages.push({ role: 'model', text: spokenText });

    // Handle 10-Repetition Drill
    if (data.correction) {
      state.corrections.push(data.correction);
      showDrillCard(data.correction);
    }

    if (data.drill) {
      updateDrillStatus(data.drill);
    } else if (state.drillActive && !data.drill) {
      finishDrill();
    }

    playGeminiLiveAudio(data.audioDataUrl);

  } catch (err) {
    console.error(err);
    if (err.message && err.message.includes('API key')) {
      aiSpeechText.innerText = "설정(⚙️)에서 올바른 Google AI Studio API 키(AIzaSy...)를 입력해 주세요.";
    } else {
      aiSpeechText.innerText = "죄송해요, 일시적인 연결 오류입니다. 다시 시도해 주세요.";
    }
    statusMsg.innerText = '오류 발생';
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
    setTimeout(finishDrill, 3500);
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

// 🌟 Start Session with Non-Repeating Topics & Cumulative Stealth Review!
async function startSession() {
  unlockAudio();
  welcomeTrigger.classList.add('hidden');
  aiSpeechBlock.classList.remove('hidden');
  liveWaveWrap.classList.remove('hidden');

  aiSpeechText.innerText = '원어민 친구가 이전 노트를 복습하며 새 주제를 고르는 중...';
  statusMsg.innerText = '세션 준비 중...';

  // 1. Fetch recent topics & master cumulative review expressions
  let chosenTopic = TOPICS[0];
  try {
    const initRes = await fetch('/api/session-init');
    const initData = await initRes.json();
    const recentTopics = initData.recentTopics || [];
    state.stealthTargets = initData.pendingTargets || [];

    // Filter out recently used topics to avoid repetition!
    const availableTopics = TOPICS.filter(t => !recentTopics.some(rt => t.includes(rt) || rt.includes(t)));
    chosenTopic = availableTopics.length > 0 
      ? availableTopics[Math.floor(Math.random() * availableTopics.length)]
      : TOPICS[Math.floor(Math.random() * TOPICS.length)];

    console.log(`[Topic Chosen]: ${chosenTopic} (Excluded recent: ${recentTopics.length})`);
    console.log(`[Stealth Review Targets]: ${state.stealthTargets.length} expressions loaded from master notebook`);
  } catch (e) {
    console.warn('Session init failed:', e);
  }

  state.currentTopic = chosenTopic;
  topicText.innerText = chosenTopic;

  // 2. Strict SKILL.md rule: Proactive 'Did you hear / Guess what I did' Opener + Stealth Elicitation
  const starterPrompt = `[CRITICAL SESSION START]
Topic: "${chosenTopic}"
Stealth Review Targets from Master Notebook: ${state.stealthTargets.map(t => `"${t.corrected}"`).join(', ') || 'None yet'}

INSTRUCTIONS:
1. Kick off the conversation with a punchy, engaging opener ("Hey, did you hear about...", "Guess what happened to me earlier...", "I just tried X for the first time...", or "Random question, but...").
2. DO NOT ask generic "How was your day?" or "What did you do today?".
3. If stealth review targets are provided, subtly steer your opening story so the user naturally has a prime opportunity to use one of those expressions in their reply!
4. Level: Pre-intermediate, friendly 30s peer, spoken-friendly.`;

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
      const errMsg = (data && data.error) ? data.error : 'API Error';
      throw new Error(errMsg);
    }
    const spokenText = data.cleanSpokenText || data.rawText || "Hey! How can I help you today?";

    state.messages = [{ role: 'model', text: spokenText }];
    aiSpeechText.innerText = spokenText;

    playGeminiLiveAudio(data.audioDataUrl);

  } catch (e) {
    aiSpeechText.innerText = "Hey! Did you hear about that crazy AI tool everyone has been testing lately?";
  }
}

// Save Full Session Log & Update Master Notebook
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
      alert(`🎉 대화 일지와 누적 복습 노트가 업데이트되었습니다!\n\n• 세션 파일: ${data.sessionFilename}\n• 누적 마스터 표현 총 ${data.masterCount}개 (복습 유도 대상 ${data.pendingCount}개)`);
    } else {
      alert('저장 실패: ' + data.error);
    }
  } catch (err) {
    alert('저장 오류: ' + err.message);
  }
}

// Config Loader
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

micBtn.addEventListener('click', () => {
  if (state.isSpeaking) {
    stopAudioPlayback();
    startListening();
  } else if (state.isListening) {
    if (recognition) recognition.stop();
  } else if (state.messages.length === 0) {
    startSession();
  } else {
    startListening();
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

// Settings
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

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  initSpeech();
  loadConfig();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW register fail:', err));
  }
  document.body.addEventListener('touchstart', unlockAudio, { once: true });
  document.body.addEventListener('click', unlockAudio, { once: true });
});

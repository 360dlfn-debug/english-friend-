// ==============================================================================
// 🌟 English Friend PWA - Rock-Solid Mobile & PC Voice Engine
// ==============================================================================

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

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  isProcessing: false, // Critical state lock to prevent race conditions during network requests
  voiceMode: localStorage.getItem('english_voice_mode') || 'instant', // 'instant' | 'gemini'
  silenceThresholdMs: parseInt(localStorage.getItem('silence_wait_ms') || '2800', 10), // default 2.8s
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
const voiceModeToggle = document.getElementById('voiceModeToggle');
const insecureBanner = document.getElementById('insecureBanner');

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
const voiceModeSelect = document.getElementById('voiceModeSelect');
const silenceSelect = document.getElementById('silenceSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const mobileUrls = document.getElementById('mobileUrls');
const saveLogBtn = document.getElementById('saveLogBtn');

// ==============================================================================
// 💡 Screen Wake Lock: Keeps the smartphone screen ON during conversation
// ==============================================================================
let wakeLock = null;
let wakeLockVideo = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('[WakeLock] Screen Wake Lock acquired - screen will not turn off');
    } else {
      fallbackWakeLock();
    }
  } catch (err) {
    console.warn('[WakeLock] Native request failed, using video fallback:', err.message);
    fallbackWakeLock();
  }
}

function fallbackWakeLock() {
  if (!wakeLockVideo) {
    wakeLockVideo = document.createElement('video');
    wakeLockVideo.setAttribute('playsinline', '');
    wakeLockVideo.setAttribute('loop', '');
    wakeLockVideo.muted = true;
    wakeLockVideo.src = 'data:video/mp4;base64,AAAAHGZ0eXBpc29tAAAAAGlzb21tcDQxAAAACHZpZGVvAAAA';
    wakeLockVideo.style.position = 'fixed';
    wakeLockVideo.style.opacity = '0.001';
    wakeLockVideo.style.pointerEvents = 'none';
    wakeLockVideo.style.zIndex = '-1';
    document.body.appendChild(wakeLockVideo);
  }
  wakeLockVideo.play().catch(() => {});
}

function releaseWakeLock() {
  if (wakeLock) {
    try { wakeLock.release(); } catch (e) {}
    wakeLock = null;
  }
  if (wakeLockVideo) {
    try { wakeLockVideo.pause(); } catch (e) {}
  }
}

// Re-acquire wake lock if user switches away and returns to app
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.sessionActive) {
    requestWakeLock();
  }
});

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

// ==============================================================================
// 🔊 Dual Audio Engine (Web Audio API & Native SpeechSynthesis)
// ==============================================================================
let audioCtx = null;
let currentAudioSource = null;
let isAudioUnlocked = false;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Unlock both Web Audio API & Native TTS synchronously on first touch
function unlockAudio() {
  requestWakeLock();

  if (isAudioUnlocked) return;
  try {
    const ctx = getAudioContext();
    if (ctx) {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    }
  } catch (e) {}

  try {
    if (window.speechSynthesis) {
      const silent = new SpeechSynthesisUtterance(' ');
      silent.volume = 0.01;
      silent.rate = 2.0;
      window.speechSynthesis.speak(silent);
    }
  } catch (e) {}

  isAudioUnlocked = true;
  console.log('[Audio] Successfully unlocked audio subsystem on mobile gesture!');
}

function stopAudioPlayback() {
  if (currentAudioSource) {
    try {
      currentAudioSource.stop();
      currentAudioSource.disconnect();
    } catch (e) {}
    currentAudioSource = null;
  }
  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
  state.isSpeaking = false;
  updateVisuals();
}

// 1. Play 24kHz Gemini Cloud Audio via Web Audio API (immune to mobile autoplay blocks)
async function playLiveAudioBuffer(dataUrl) {
  const ctx = getAudioContext();
  if (!ctx) throw new Error('Web Audio API not supported');

  const base64 = dataUrl.split(',')[1];
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));

  return new Promise((resolve, reject) => {
    try {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      currentAudioSource = source;

      source.onended = () => {
        currentAudioSource = null;
        resolve();
      };

      source.start(0);
    } catch (err) {
      reject(err);
    }
  });
}

// 2. Play Ultra-Fast Native Browser TTS (Zero lag, 100% works offline on any smartphone)
function speakNativeText(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) return resolve();

    window.speechSynthesis.cancel();

    const clean = text
      .replace(/<<<[^>]*>>>/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\*/g, '')
      .trim();

    if (!clean) return resolve();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(v => v.lang.startsWith('en') && (
      v.name.includes('Samantha') || 
      v.name.includes('Daniel') || 
      v.name.includes('Ava') || 
      v.name.includes('Google US') || 
      v.name.includes('Natural') || 
      v.name.includes('en-US')
    )) || voices.find(v => v.lang.startsWith('en')) || null;

    if (naturalVoice) utterance.voice = naturalVoice;

    let hasEnded = false;
    const endHandler = () => {
      if (!hasEnded) {
        hasEnded = true;
        resolve();
      }
    };

    utterance.onend = endHandler;
    utterance.onerror = (e) => {
      console.warn('Native speech error:', e);
      endHandler();
    };

    const wordCount = clean.split(/\s+/).length;
    const estimatedMs = Math.max(1800, (wordCount / 2.5) * 1000 + 1000);
    setTimeout(endHandler, estimatedMs);

    window.speechSynthesis.speak(utterance);

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  });
}

// 🌟 Unified Speech Output: Guarantees speech output and never stays silent!
async function playAiSpeech(spokenText, audioDataUrl) {
  stopAudioPlayback();
  state.isSpeaking = true;
  state.isProcessing = false;
  updateVisuals();

  try {
    if (state.voiceMode === 'gemini' && audioDataUrl) {
      statusMsg.innerText = `🎙️ Gemini Live (${state.currentVoice}) 말하는 중...`;
      try {
        await playLiveAudioBuffer(audioDataUrl);
      } catch (err) {
        console.warn('[Audio] Gemini Live audio buffer failed, instant fallback to native voice:', err);
        statusMsg.innerText = `⚡ 네이티브 음성으로 재생 중...`;
        await speakNativeText(spokenText);
      }
    } else {
      statusMsg.innerText = `⚡ 친구가 말하는 중...`;
      await speakNativeText(spokenText);
    }
  } catch (err) {
    console.warn('[Audio] Playback exception:', err);
  } finally {
    state.isSpeaking = false;
    updateVisuals();
    if (state.drillActive) {
      statusMsg.innerText = `🎯 10회 반복 중 (${state.drillCount}/10) • 따라 말씀하세요!`;
    } else {
      statusMsg.innerText = '🔴 듣고 있습니다 • 영어로 말씀하세요!';
    }
    if (state.sessionActive && !state.isProcessing) {
      // 250ms buffer to prevent phone speaker sound feedback
      setTimeout(startListeningSafe, 250);
    }
  }
}

// ==============================================================================
// 🎙️ Real-time Speech Recognition Engine (Continuous Real-time Streaming)
// ==============================================================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let silenceTimer = null;
let currentRecordedText = '';
let accumulatedTranscript = '';
let isRecognitionStarting = false;

function setupSpeechRecognition() {
  if (!SpeechRecognition) {
    alert('이 브라우저는 실시간 음성 인식을 지원하지 않습니다. Chrome 또는 Safari에서 열어주세요.');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true; // continuous streaming for instant live-typing!

  recognition.onstart = () => {
    isRecognitionStarting = false;
    state.isListening = true;
    updateVisuals();
    userSpeechBlock.classList.remove('hidden');

    if (!currentRecordedText.trim() && !accumulatedTranscript.trim()) {
      userSpeechText.innerHTML = `<span style="color:#6b7280;">듣고 있습니다... 말씀해 보세요</span> <span class="typing-cursor"></span>`;
    }
    if (state.drillActive) {
      statusMsg.innerText = `🎯 10회 반복 중 (${state.drillCount}/10) • AI 말을 듣고 따라 하세요!`;
    } else {
      const waitSeconds = state.silenceThresholdMs > 0 ? (state.silenceThresholdMs / 1000).toFixed(1) : '수동';
      statusMsg.innerText = state.silenceThresholdMs > 0 
        ? `🔴 듣고 있습니다 • 말씀 후 ${waitSeconds}초 멈추시면 답변합니다`
        : `🔴 듣고 있습니다 • 말씀 완료 후 마이크를 터치해 주세요`;
    }
  };

  recognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = 0; i < event.results.length; ++i) {
      const res = event.results[i];
      if (res.isFinal) {
        finalTranscript += res[0].transcript + ' ';
      } else {
        interimTranscript += res[0].transcript;
      }
    }

    const activeChunk = (finalTranscript + interimTranscript).trim();
    if (activeChunk) {
      const fullConfirmed = accumulatedTranscript ? `${accumulatedTranscript} ${finalTranscript}`.trim() : finalTranscript.trim();
      const fullDisplay = (accumulatedTranscript ? `${accumulatedTranscript} ${activeChunk}` : activeChunk).trim();
      currentRecordedText = fullDisplay;

      // 🌟 Live Real-time Typing Stream: Confirmed words in clean blue, interim words highlighted with glowing cursor!
      let displayHtml = '';
      if (fullConfirmed) {
        displayHtml += escapeHtml(fullConfirmed) + ' ';
      }
      if (interimTranscript.trim()) {
        displayHtml += `<span class="live-interim">${escapeHtml(interimTranscript.trim())}</span> `;
      }
      displayHtml += `<span class="typing-cursor"></span>`;
      userSpeechText.innerHTML = displayHtml;

      micBtn.classList.add('has-speech');

      if (state.drillActive) {
        statusMsg.innerText = `🎯 10회 반복 중 (${state.drillCount}/10) • 따라하시면 즉시 카운트됩니다!`;
      } else if (state.silenceThresholdMs > 0) {
        statusMsg.innerText = `🎙️ 듣는 중... (말씀을 멈추시면 ${(state.silenceThresholdMs / 1000).toFixed(1)}초 후 자동 전송)`;
      } else {
        statusMsg.innerText = `🎙️ 듣는 중... (말씀 후 중앙 마이크를 누르시면 전송됩니다)`;
      }
    }

    // ⚡ Drill mode uses ultra-responsive 0.65s wait time; Regular mode uses user setting
    const waitTime = state.drillActive ? 650 : state.silenceThresholdMs;
    clearTimeout(silenceTimer);
    if (waitTime > 0) {
      silenceTimer = setTimeout(() => {
        if ((currentRecordedText.trim() || accumulatedTranscript.trim()) && !state.isSpeaking && !state.isProcessing && state.sessionActive) {
          submitSpeech();
        }
      }, waitTime);
    }
  };

  recognition.onerror = (event) => {
    isRecognitionStarting = false;
    state.isListening = false;
    updateVisuals();

    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      statusMsg.innerText = '⚠️ 마이크 권한이 차단되었습니다. 브라우저 설정에서 마이크를 허용해 주세요.';
      return;
    }

    if (state.sessionActive && !state.isSpeaking && !state.isProcessing) {
      setTimeout(startListeningSafe, 250);
    }
  };

  recognition.onend = () => {
    isRecognitionStarting = false;
    state.isListening = false;
    updateVisuals();

    if (!state.sessionActive || state.isSpeaking || state.isProcessing) {
      return;
    }

    // Preserve words and seamlessly keep listening across mobile disconnects
    if (currentRecordedText.trim()) {
      accumulatedTranscript = currentRecordedText.trim();
      setTimeout(startListeningSafe, 100);
    } else {
      setTimeout(startListeningSafe, 150);
    }
  };
}

// ⚡ Central Speech Submission
function submitSpeech() {
  if (state.isProcessing || state.isSpeaking) return;

  const textToSend = (currentRecordedText || accumulatedTranscript).trim();
  currentRecordedText = '';
  accumulatedTranscript = '';
  clearTimeout(silenceTimer);
  stopListeningSafe();

  if (textToSend) {
    // If in 10-repetition drill, handle locally in 0.1s without 5-second network API delay!
    if (state.drillActive) {
      handleDrillRepetition(textToSend);
    } else {
      handleUserInput(textToSend);
    }
  } else if (state.sessionActive && !state.isSpeaking && !state.isProcessing) {
    startListeningSafe();
  }
}

// ==============================================================================
// 🎯 10-Repetition Drill Engine (Instant 0.2s Response - No 5s lag!)
// ==============================================================================
async function handleDrillRepetition(userText) {
  state.isProcessing = true;
  userSpeechText.innerHTML = `${escapeHtml(userText)}`;
  userSpeechBlock.classList.remove('hidden');

  state.drillCount = (state.drillCount || 1) + 1;
  updateDrillCardProgress(state.drillCount);

  if (state.drillCount <= 10) {
    const drillPrompt = `Number ${state.drillCount}: ${state.drillTarget}`;
    aiSpeechText.innerText = drillPrompt;
    aiSpeechBlock.classList.remove('hidden');

    // ⚡ Instant 0.1s response!
    await playAiSpeech(drillPrompt, null);
  } else {
    // 10 times fully completed!
    const finishPrompt = `Awesome! 10 times completed! Great job.`;
    aiSpeechText.innerText = finishPrompt;
    aiSpeechBlock.classList.remove('hidden');
    finishDrill();

    await playAiSpeech(finishPrompt, null);

    // Naturally resume conversation with Gemini
    setTimeout(() => {
      handleUserInput(`[I completed the 10-repetition drill for "${state.drillTarget}"]. Let's continue our talk!`);
    }, 500);
  }
}

function showDrillCard(corr) {
  state.drillActive = true;
  state.drillCount = 1;
  state.drillTarget = corr.corrected;
  drillCard.classList.remove('hidden');
  drillOriginalText.innerText = corr.original || 'User speech';
  drillTargetText.innerText = corr.corrected || '';
  drillNoteText.innerText = corr.explanation ? `💡 ${corr.explanation}` : '';
  updateDrillCardProgress(1);
}

function updateDrillCardProgress(count) {
  state.drillCount = count;
  drillStepBadge.innerText = `Count ${count} / 10`;
  const pct = Math.min(100, Math.round((count / 10) * 100));
  drillProgressFill.style.width = `${pct}%`;
}

function finishDrill() {
  state.drillActive = false;
  drillStepBadge.innerText = '✅ 10회 완료!';
  drillProgressFill.style.width = '100%';
  setTimeout(() => {
    drillCard.classList.add('hidden');
  }, 2500);
}

function startListeningSafe() {
  if (state.isSpeaking || state.isProcessing || !state.sessionActive || isRecognitionStarting) {
    return;
  }
  stopAudioPlayback();

  if (recognition && !state.isListening) {
    try {
      isRecognitionStarting = true;
      recognition.start();
    } catch (e) {
      isRecognitionStarting = false;
    }
  }
}

function stopListeningSafe() {
  state.isListening = false;
  isRecognitionStarting = false;
  clearTimeout(silenceTimer);
  if (recognition) {
    try { recognition.abort(); } catch (e) {}
  }
  updateVisuals();
}

function updateVisuals() {
  statusDot.classList.remove('listening', 'speaking');
  soundWave.classList.remove('active');
  micBtn.classList.remove('listening', 'speaking', 'has-speech', 'processing');

  if (state.isProcessing) {
    micBtn.classList.add('processing');
    soundWave.classList.add('active');
  } else if (state.isSpeaking) {
    statusDot.classList.add('speaking');
    micBtn.classList.add('speaking');
    soundWave.classList.add('active');
  } else if (state.isListening) {
    statusDot.classList.add('listening');
    micBtn.classList.add('listening');
    if (currentRecordedText.trim() || accumulatedTranscript.trim()) {
      micBtn.classList.add('has-speech');
    }
    soundWave.classList.add('active');
  }

  // Update Voice Mode Toggle UI
  if (voiceModeToggle) {
    if (state.voiceMode === 'instant') {
      voiceModeToggle.innerText = '⚡ 초고속 모드';
      voiceModeToggle.classList.remove('gemini');
    } else {
      voiceModeToggle.innerText = '🎙️ AI 음성 모드';
      voiceModeToggle.classList.add('gemini');
    }
  }
}

// ==============================================================================
// 💬 Handle User Speech / Text Input Turn
// ==============================================================================
async function handleUserInput(text) {
  if (!text || !text.trim() || state.isProcessing) return;

  state.isProcessing = true;
  stopAudioPlayback();
  stopListeningSafe();

  userSpeechText.innerHTML = `${escapeHtml(text)}`;
  userSpeechBlock.classList.remove('hidden');
  state.messages.push({ role: 'user', text });

  statusMsg.innerText = '⚡ 생각하는 중...';
  updateVisuals();

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
        currentTopic: state.currentTopic,
        skipAudio: state.voiceMode === 'instant'
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

    // 🌟 Play Audio with 100% Failover guarantee!
    await playAiSpeech(spokenText, data.audioDataUrl);

  } catch (err) {
    console.error('Chat error:', err);
    state.isProcessing = false;
    state.isSpeaking = false;

    if (err.message && err.message.includes('API key')) {
      aiSpeechText.innerText = "Google AI Studio API 키 오류입니다. 우측 상단 ⚙️ 설정에서 키를 확인해 주세요.";
    } else {
      aiSpeechText.innerText = "Sorry, I missed that for a second. Could you say that again?";
    }
    aiSpeechBlock.classList.remove('hidden');
    statusMsg.innerText = '🔴 듣고 있습니다 • 다시 말씀하시면 바로 들어요!';
    updateVisuals();

    if (state.sessionActive) {
      setTimeout(startListeningSafe, 400);
    }
  }
}

// 🌟 Start Session: 1-Tap Handshake to Infinite Natural Voice Conversation
async function startSession() {
  unlockAudio();
  requestWakeLock();

  state.sessionActive = true;
  welcomeTrigger.classList.add('hidden');
  aiSpeechBlock.classList.remove('hidden');
  liveWaveWrap.classList.remove('hidden');

  aiSpeechText.innerText = '원어민 친구가 먼저 썰을 풀며 대화를 시작합니다...';
  statusMsg.innerText = '대화 시작 중...';
  state.isProcessing = true;
  updateVisuals();

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
        currentTopic: state.currentTopic,
        skipAudio: state.voiceMode === 'instant'
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

    // Play Voice with 100% guarantee!
    await playAiSpeech(spokenText, data.audioDataUrl);

  } catch (e) {
    console.error(e);
    state.isProcessing = false;
    const fallbackText = "Hey! Did you hear about that crazy AI tool everyone has been testing lately?";
    aiSpeechText.innerText = fallbackText;
    await playAiSpeech(fallbackText, null);
  }
}

// 💾 Save Full Session Log & Master Cumulative Review Storage
async function saveSessionLog() {
  if (state.messages.length === 0) {
    alert('아직 나눈 대화가 없습니다.');
    return;
  }

  const fullTranscript = state.messages
    .map(m => `${m.role === 'user' ? 'Me' : 'English Friend'}: ${m.text}`)
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
    voiceBadge.innerText = state.voiceMode === 'instant' ? '⚡ 초고속 모드' : `Gemini Live • ${state.currentVoice}`;
    modelSelect.value = data.currentModel;
    if (voiceSelect) voiceSelect.value = state.currentVoice;
    if (voiceModeSelect) voiceModeSelect.value = state.voiceMode;
    if (silenceSelect) silenceSelect.value = state.silenceThresholdMs.toString();

    if (data.localIps && data.localIps.length > 0) {
      mobileUrls.innerHTML = data.localIps.map(ip => `
        <div class="ip-row">
          <span>http://${ip}:${data.port || 3000}</span>
        </div>
      `).join('');
    }
  } catch (e) {
    console.warn('Failed to load server config:', e);
  }
}

function toggleVoiceMode() {
  state.voiceMode = state.voiceMode === 'instant' ? 'gemini' : 'instant';
  localStorage.setItem('english_voice_mode', state.voiceMode);
  voiceBadge.innerText = state.voiceMode === 'instant' ? '⚡ 초고속 모드' : `Gemini Live • ${state.currentVoice}`;
  if (voiceModeSelect) voiceModeSelect.value = state.voiceMode;
  updateVisuals();
  const modeName = state.voiceMode === 'instant' ? '⚡ 초고속 모드 (0초 딜레이, 100% 무음 방지)' : '🎙️ Gemini Live 클라우드 AI 음성 모드';
  statusMsg.innerText = `${modeName}로 전환되었습니다.`;
}

// ==============================================================================
// 🎯 Event Listeners & Bootstrapping
// ==============================================================================
welcomeTrigger.addEventListener('click', startSession);
directStartBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  startSession();
});

if (voiceModeToggle) {
  voiceModeToggle.addEventListener('click', toggleVoiceMode);
}

// Center Mic Button: Smart Action
micBtn.addEventListener('click', () => {
  unlockAudio();
  requestWakeLock();

  if (!state.sessionActive) {
    startSession();
  } else if (state.isSpeaking) {
    // Barge-in: Interrupt AI immediately!
    stopAudioPlayback();
    startListeningSafe();
  } else if (state.isListening && (currentRecordedText.trim() || accumulatedTranscript.trim())) {
    // User finished talking: Instant submit right now!
    submitSpeech();
  } else if (!state.isListening && !state.isProcessing) {
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
  if (voiceModeSelect) voiceModeSelect.value = state.voiceMode;
  if (silenceSelect) silenceSelect.value = state.silenceThresholdMs.toString();
  settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

saveSettingsBtn.addEventListener('click', async () => {
  const selectedModel = modelSelect.value;
  const selectedVoice = voiceSelect.value;
  const selectedVoiceMode = voiceModeSelect ? voiceModeSelect.value : state.voiceMode;
  const selectedSilence = silenceSelect ? parseInt(silenceSelect.value, 10) : state.silenceThresholdMs;
  const enteredKey = apiKeyInput ? apiKeyInput.value.trim() : '';

  if (enteredKey) {
    state.apiKey = enteredKey;
    localStorage.setItem('gemini_api_key', enteredKey);
  }

  state.voiceMode = selectedVoiceMode;
  localStorage.setItem('english_voice_mode', selectedVoiceMode);

  state.silenceThresholdMs = selectedSilence;
  localStorage.setItem('silence_wait_ms', selectedSilence.toString());

  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: selectedModel, voice: selectedVoice, apiKey: state.apiKey })
  });

  state.currentModel = selectedModel;
  state.currentVoice = selectedVoice;
  voiceBadge.innerText = state.voiceMode === 'instant' ? '⚡ 초고속 모드' : `Gemini Live • ${selectedVoice}`;
  aiRoleLabel.innerText = state.voiceMode === 'instant' ? 'English Friend' : `Gemini Live (${selectedVoice})`;
  settingsModal.classList.add('hidden');
  updateVisuals();
  alert('설정이 저장되었습니다!');
});

// Check Secure Context on Mobile
function checkSecureContext() {
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!window.isSecureContext && !isLocal && insecureBanner) {
    insecureBanner.classList.remove('hidden');
  }
}

// Initial Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  setupSpeechRecognition();
  loadConfig();
  checkSecureContext();
  updateVisuals();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW register fail:', err));
  }

  // Pre-unlock audio & request wake lock on any touch gesture
  document.body.addEventListener('touchstart', unlockAudio, { once: true });
  document.body.addEventListener('click', unlockAudio, { once: true });
});

// ==============================================================================
// 🎙️ English Friend — True Real-Time Gemini 3.8 Live Native Audio Engine
// 100% Native Voice (Puck/Aoede) • Connected Speech (연음) • Full-Duplex Barge-in
// ==============================================================================

const DEFAULT_KEY_B64 = "QUl6YVN5Q2k1ZFNjcDR2Zl9TelJKREZyMkd2WG55Wm5RbmY3NmJB";
const DEFAULT_GDRIVE_WEBHOOK = "https://script.google.com/macros/s/AKfycbw3LEyYSfVxUEMX1_fv9D0Cm77E22XDUdVQPSzmPlqowsTGjpRAD-s53sX6D-hhGuJt/exec";

function getInitialApiKey() {
  const saved = localStorage.getItem('gemini_api_key');
  if (saved && (saved.startsWith('AQ.Ab8RN6') || !saved.trim())) {
    localStorage.removeItem('gemini_api_key');
    try { return atob(DEFAULT_KEY_B64); } catch (e) { return ''; }
  }
  if (saved && saved.trim()) return saved.trim();
  try {
    return atob(DEFAULT_KEY_B64);
  } catch (e) {
    return '';
  }
}

function getInitialLiveModel() {
  const saved = localStorage.getItem('live_model');
  const defaultModel = 'models/gemini-2.5-flash-native-audio-latest';
  if (!saved || saved.includes('gemini-3.8-live') || saved.includes('gemini-2.0-flash') || saved === 'models/gemini-2.5-flash') {
    localStorage.setItem('live_model', defaultModel);
    return defaultModel;
  }
  return saved;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 20-Topic Rotation Pool
const TOPICS = [
  "Tech & AI Tools (Cool new AI tools & gadgets)",
  "Investing & Money Moves (Stocks, crypto & smart spending)",
  "Real Estate & Living Spaces (Apartment hunting & neighborhood vibes)",
  "Hidden Gems & Local Eats (Comfort food & late-night cravings)",
  "Workplace Dynamics & Office Life (Meetings & office stories)",
  "Side Hustles & Passion Projects (Creative hobbies & side projects)",
  "Weekend Getaways & Travel Stories (Spontaneous trips & travel stories)",
  "Health, Fitness & Wellness (Gym routines & energy habits)",
  "Movies, Series & Binge-Watches (Netflix favorites & classic films)",
  "Music, Concerts & Nostalgia (Throwback jams & live shows)",
  "Social Etiquette & Unspoken Rules (Splitting the bill & small talk)",
  "Trends & Pop Culture (Viral moments & generational differences)",
  "Cars, Commuting & Traffic (Dream cars & commute stories)",
  "Relationships & Friendships (Catching up with old friends)",
  "Food & Cooking Experiments (Kitchen fails & food debates)",
  "Productivity vs Procrastination (Morning routines & doom-scrolling)",
  "Psychology & Human Quirks (First impressions & overthinking)",
  "Hypothetical What-If Scenarios (Winning the lottery & living abroad)",
  "Seasonal & Holiday Vibes (Vacation energy & holiday plans)",
  "Everyday City Life & Society (City life vs quiet country life)"
];

// ==============================================================================
// 📦 Application State
// ==============================================================================
const state = {
  apiKey: getInitialApiKey(),
  liveModel: getInitialLiveModel(),
  voice: localStorage.getItem('live_voice') || 'Puck',
  silenceDurationMs: parseInt(localStorage.getItem('live_silence_ms') || '900', 10),
  bargeInSensitivity: localStorage.getItem('live_bargein') || 'START_SENSITIVITY_LOW',
  gdriveWebhookUrl: localStorage.getItem('gdrive_webhook_url') || DEFAULT_GDRIVE_WEBHOOK,

  sessionActive: false,
  isConnecting: false,
  isConnected: false,
  isMuted: false,
  isAiSpeaking: false,
  isPausedInBackground: false,
  isExplicitlyEnded: true,

  currentTopic: '',
  skillPrompt: '',
  userProfile: null,
  stealthTargets: [],
  messages: [],      // Finalized chronological turns: [{ role: 'model'|'user', text }]
  corrections: [],   // Extracted tips for notes & Drive sync
  reconnectAttempts: 0
};

// ==============================================================================
// 🎯 DOM References
// ==============================================================================
const statusDot = document.getElementById('statusDot');
const voiceBadge = document.getElementById('voiceBadge');
const liveChip = document.getElementById('liveChip');
const insecureBanner = document.getElementById('insecureBanner');
const topicText = document.getElementById('topicText');

const chatFeed = document.getElementById('chatFeed');
const welcomeHero = document.getElementById('welcomeHero');
const directStartBtn = document.getElementById('directStartBtn');
const chatMessages = document.getElementById('chatMessages');

const voiceBars = document.getElementById('voiceBars');
const voiceBarSpans = voiceBars ? Array.from(voiceBars.querySelectorAll('span')) : [];
const statusMsg = document.getElementById('statusMsg');

const callOrbBtn = document.getElementById('callOrbBtn');
const orbPulse = document.getElementById('orbPulse');
const muteBtn = document.getElementById('muteBtn');
const muteIconOn = document.getElementById('muteIconOn');
const muteIconOff = document.getElementById('muteIconOff');
const endCallBtn = document.getElementById('endCallBtn');

const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');

// Header & Modals
const installAppBtn = document.getElementById('installAppBtn');
const saveLogBtn = document.getElementById('saveLogBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

const voiceSelect = document.getElementById('voiceSelect');
const liveModelSelect = document.getElementById('liveModelSelect');
const silenceSelect = document.getElementById('silenceSelect');
const bargeInSelect = document.getElementById('bargeInSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const gdriveWebhookInput = document.getElementById('gdriveWebhookInput');
const testGdriveBtn = document.getElementById('testGdriveBtn');
const gdriveStatusText = document.getElementById('gdriveStatusText');
const mobileUrls = document.getElementById('mobileUrls');

const notesBtn = document.getElementById('notesBtn');
const notesModal = document.getElementById('notesModal');
const closeNotesBtn = document.getElementById('closeNotesBtn');
const closeNotesBtn2 = document.getElementById('closeNotesBtn2');
const copyNotesBtn = document.getElementById('copyNotesBtn');
const notesListContainer = document.getElementById('notesListContainer');

// 🎯 10-Repetition Live Drill Banner DOM Elements
const drillBanner = document.getElementById('drillBanner');
const drillCountBadge = document.getElementById('drillCountBadge');
const drillOrigText = document.getElementById('drillOrigText');
const drillTargetText = document.getElementById('drillTargetText');
const drillExplText = document.getElementById('drillExplText');
const drillProgressFill = document.getElementById('drillProgressFill');
const skipDrillBtn = document.getElementById('skipDrillBtn');

// 🧠 AI Memory Modal DOM Elements
const memoryBtn = document.getElementById('memoryBtn');
const memoryModal = document.getElementById('memoryModal');
const closeMemoryBtn = document.getElementById('closeMemoryBtn');
const closeMemoryBtn2 = document.getElementById('closeMemoryBtn2');
const addMemoryFactBtn = document.getElementById('addMemoryFactBtn');
const memInterestsContainer = document.getElementById('memInterestsContainer');
const memFactsContainer = document.getElementById('memFactsContainer');
const memPrefsContainer = document.getElementById('memPrefsContainer');
const memRecentContainer = document.getElementById('memRecentContainer');

// 💬 Session Resume Banner DOM Elements
const resumeBanner = document.getElementById('resumeBanner');
const resumeTopicText = document.getElementById('resumeTopicText');
const resumeCallBtn = document.getElementById('resumeCallBtn');
const discardResumeBtn = document.getElementById('discardResumeBtn');

// ==============================================================================
// 🧹 Speech Transcript & Master Note Deduplicator
// Cleans repetitive tokens (e.g. "about about about", "and and", "means means")
// ==============================================================================
function deduplicateAll(str) {
  if (!str || typeof str !== 'string') return '';
  let text = str.trim();
  if (!text) return '';

  // 1. Single word deduplication (case-insensitive adjacent duplicate words)
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

  // 2. Multi-word phrase deduplication (e.g. "in the house in the house")
  text = text.replace(/\b(\w+\s+\w+)(\s+\1)+\b/gi, '$1');
  text = text.replace(/\b(\w+\s+\w+\s+\w+)(\s+\1)+\b/gi, '$1');

  return text.trim();
}

// ==============================================================================
// 💡 Screen Wake Lock (Keep mobile screen awake during voice calls)
// ==============================================================================
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) {}
}

function releaseWakeLock() {
  if (wakeLock) {
    try { wakeLock.release(); } catch (e) {}
    wakeLock = null;
  }
}

// ==============================================================================
// 📱 App Backgrounding & Seamless Continuity Engine
// Preserves conversation across home screen switches, lock screens, and apps
// ==============================================================================
function saveActiveSessionToStorage() {
  if (!state.sessionActive || state.messages.length === 0) return;
  try {
    sessionStorage.setItem('english_friend_active_session', JSON.stringify({
      topic: state.currentTopic,
      messages: state.messages,
      corrections: state.corrections,
      voice: state.voice,
      liveModel: state.liveModel,
      timestamp: Date.now()
    }));
  } catch (e) {}
}

function showResumeBanner() {
  if (resumeBanner && state.messages.length > 0) {
    if (resumeTopicText) resumeTopicText.textContent = `주제: ${state.currentTopic.split('(')[0].trim()}`;
    resumeBanner.classList.remove('hidden');
    statusMsg.textContent = '⏸️ 연결이 잠시 일시 중단되었습니다. [이어서 대화]를 눌러 바로 계속하세요.';
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (state.sessionActive && !state.isExplicitlyEnded) {
      state.isPausedInBackground = true;
      saveActiveSessionToStorage();
      if (state.gdriveWebhookUrl && state.messages.length > 0) {
        syncToGoogleDrive().catch(() => {});
      }
      triggerContinuousMemoryLearning().catch(() => {});
    }
  } else if (document.visibilityState === 'visible') {
    if (state.sessionActive && !state.isExplicitlyEnded) {
      requestWakeLock();
      if (playbackCtx && playbackCtx.state === 'suspended') playbackCtx.resume().catch(() => {});
      if (captureCtx && captureCtx.state === 'suspended') captureCtx.resume().catch(() => {});

      // If WebSocket closed while in background, auto-reconnect immediately!
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        state.isPausedInBackground = false;
        statusMsg.textContent = `🔄 대화 복구 중... ${state.voice} 연결을 다시 잇고 있습니다`;
        addSystemPill('🔄 대화 복구 중... 연결을 다시 잇고 있습니다.');
        connectLiveWebSocket(true).catch(() => {
          showResumeBanner();
        });
      } else {
        state.isPausedInBackground = false;
      }
    }
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
      const res = await deferredInstallPrompt.userChoice;
      if (res.outcome === 'accepted') installAppBtn.classList.add('hidden');
      deferredInstallPrompt = null;
    } else {
      alert('브라우저 메뉴에서 [홈 화면에 추가] 또는 [앱 설치]를 눌러주세요!');
    }
  });
}

// ==============================================================================
// 🔊 Real-Time Audio Pipeline (16kHz Mic Capture + 24kHz Gapless PCM Playback)
// ==============================================================================
let ws = null;
let mediaStream = null;
let captureCtx = null;
let captureSource = null;
let captureWorkletNode = null;
let captureScriptNode = null;

let playbackCtx = null;
let playbackAnalyser = null;
let nextPlayTime = 0;
const activeAudioSources = new Set();

let currentMicRms = 0;
let visualizerRafId = null;

// Inline AudioWorklet Processor for zero-jank 16kHz downsampling & PCM16 encoding
const WORKLET_CODE = `
class Pcm16CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.chunkSamples = 1600; // 100ms at 16kHz
    this.outBuf = new Int16Array(this.chunkSamples);
    this.outIdx = 0;
    this.resamplePos = 0;
    this.lastSample = 0;
    this.noiseThreshold = 0.016; // Noise gate threshold (clothing rustle & ambient filter)
    this.hangoverFrames = 0;     // Hangover frames to prevent clipping word endings
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const channel = input[0];
    const ratio = sampleRate / this.targetRate;

    let sumSq = 0;
    for (let i = 0; i < channel.length; i++) {
      sumSq += channel[i] * channel[i];
    }
    const rms = Math.sqrt(sumSq / channel.length);

    // Noise Gate: Sub-threshold noise (clothing rustles, breath) is gated to zero
    if (rms >= this.noiseThreshold) {
      this.hangoverFrames = 10; // ~250ms hangover
    } else if (this.hangoverFrames > 0) {
      this.hangoverFrames--;
    }
    const isGated = (this.hangoverFrames === 0);

    while (this.resamplePos < channel.length) {
      const idx = Math.floor(this.resamplePos);
      const frac = this.resamplePos - idx;
      const s0 = idx === 0 && this.resamplePos < 1 ? this.lastSample : channel[idx];
      const s1 = idx + 1 < channel.length ? channel[idx + 1] : channel[idx];
      let sample = s0 + (s1 - s0) * frac;
      sample = Math.max(-1, Math.min(1, sample));
      if (isGated) {
        sample = 0; // Pure silence during clothing rustle
      }
      this.outBuf[this.outIdx++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;

      if (this.outIdx >= this.chunkSamples) {
        const copy = new Int16Array(this.outBuf);
        this.port.postMessage({ pcm: copy.buffer, rms: isGated ? 0 : rms }, [copy.buffer]);
        this.outIdx = 0;
      }
      this.resamplePos += ratio;
    }

    this.lastSample = channel[channel.length - 1];
    this.resamplePos -= channel.length;
    return true;
  }
}
registerProcessor('pcm16-capture-processor', Pcm16CaptureProcessor);
`;

function initAudioContextsSync() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('이 브라우저는 Web Audio API를 지원하지 않습니다.');

  if (!playbackCtx || playbackCtx.state === 'closed') {
    try {
      playbackCtx = new AudioCtx({ sampleRate: 24000 });
    } catch (e) {
      playbackCtx = new AudioCtx();
    }
    playbackAnalyser = playbackCtx.createAnalyser();
    playbackAnalyser.fftSize = 64;
    playbackAnalyser.connect(playbackCtx.destination);
  }
  if (playbackCtx.state === 'suspended') {
    playbackCtx.resume().catch(() => {});
  }

  if (!captureCtx || captureCtx.state === 'closed') {
    try {
      captureCtx = new AudioCtx({ sampleRate: 16000 });
    } catch (e) {
      captureCtx = new AudioCtx();
    }
  }
  if (captureCtx.state === 'suspended') {
    captureCtx.resume().catch(() => {});
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function sendPcmChunkToLive(pcmArrayBuffer) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !state.isConnected || state.isMuted) {
    return;
  }
  const base64Data = arrayBufferToBase64(pcmArrayBuffer);
  ws.send(JSON.stringify({
    realtimeInput: {
      audio: {
        mimeType: 'audio/pcm;rate=16000',
        data: base64Data
      }
    }
  }));
}

async function startMicCapture() {
  if (mediaStream) return;

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1
    },
    video: false
  });

  if (captureCtx.state === 'suspended') {
    await captureCtx.resume();
  }

  captureSource = captureCtx.createMediaStreamSource(mediaStream);

  // Prefer AudioWorklet (off-main-thread, silky smooth on mobile)
  if (captureCtx.audioWorklet && window.AudioWorkletNode) {
    try {
      const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      await captureCtx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      captureWorkletNode = new AudioWorkletNode(captureCtx, 'pcm16-capture-processor');
      captureWorkletNode.port.onmessage = (ev) => {
        const { pcm, rms } = ev.data;
        currentMicRms = state.isMuted ? 0 : rms;
        sendPcmChunkToLive(pcm);
      };

      // Connect through a zero-gain sink so browser keeps processing the audio graph without echoing mic
      const silentGain = captureCtx.createGain();
      silentGain.gain.value = 0;
      captureSource.connect(captureWorkletNode);
      captureWorkletNode.connect(silentGain);
      silentGain.connect(captureCtx.destination);
      return;
    } catch (err) {
      console.warn('[Mic] AudioWorklet fallback to ScriptProcessor:', err.message);
    }
  }

  // Fallback for older browsers
  const bufferSize = 2048;
  captureScriptNode = captureCtx.createScriptProcessor(bufferSize, 1, 1);
  const inputRate = captureCtx.sampleRate;
  const ratio = inputRate / 16000;
  let scriptGateHangover = 0;

  captureScriptNode.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    let sumSq = 0;
    for (let i = 0; i < input.length; i++) sumSq += input[i] * input[i];
    const rawRms = Math.sqrt(sumSq / input.length);

    if (rawRms >= 0.016) {
      scriptGateHangover = 8;
    } else if (scriptGateHangover > 0) {
      scriptGateHangover--;
    }
    const isGated = (scriptGateHangover === 0);
    currentMicRms = (state.isMuted || isGated) ? 0 : rawRms;

    const outLen = Math.floor(input.length / ratio);
    const pcm16 = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      if (isGated) {
        pcm16[i] = 0;
      } else {
        const pos = i * ratio;
        const idx = Math.floor(pos);
        const frac = pos - idx;
        const s0 = input[idx] || 0;
        const s1 = input[idx + 1] !== undefined ? input[idx + 1] : s0;
        const s = Math.max(-1, Math.min(1, s0 + (s1 - s0) * frac));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
    }
    sendPcmChunkToLive(pcm16.buffer);
  };

  const silentGain = captureCtx.createGain();
  silentGain.gain.value = 0;
  captureSource.connect(captureScriptNode);
  captureScriptNode.connect(silentGain);
  silentGain.connect(captureCtx.destination);
}

function stopMicCapture() {
  currentMicRms = 0;
  if (captureWorkletNode) {
    try { captureWorkletNode.disconnect(); } catch (e) {}
    captureWorkletNode = null;
  }
  if (captureScriptNode) {
    try { captureScriptNode.disconnect(); } catch (e) {}
    captureScriptNode = null;
  }
  if (captureSource) {
    try { captureSource.disconnect(); } catch (e) {}
    captureSource = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => {
      try { t.stop(); } catch (e) {}
    });
    mediaStream = null;
  }
}

// Schedule incoming 24kHz PCM16 chunk gaplessly onto Web Audio timeline
function enqueuePcm24kAudio(base64Pcm) {
  if (!playbackCtx || !base64Pcm) return;
  if (playbackCtx.state === 'suspended') {
    playbackCtx.resume().catch(() => {});
  }

  const binary = atob(base64Pcm);
  const byteLen = binary.length;
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const numSamples = Math.floor(byteLen / 2);
  if (numSamples === 0) return;

  const view = new DataView(bytes.buffer);
  const float32 = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }

  const audioBuffer = playbackCtx.createBuffer(1, numSamples, 24000);
  audioBuffer.getChannelData(0).set(float32);

  const source = playbackCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(playbackAnalyser || playbackCtx.destination);

  const now = playbackCtx.currentTime;
  if (nextPlayTime < now + 0.015) {
    nextPlayTime = now + 0.02;
  }

  source.start(nextPlayTime);
  nextPlayTime += audioBuffer.duration;

  activeAudioSources.add(source);
  if (!state.isAiSpeaking) {
    state.isAiSpeaking = true;
    updateVisuals();
  }

  source.onended = () => {
    activeAudioSources.delete(source);
    if (activeAudioSources.size === 0) {
      state.isAiSpeaking = false;
      updateVisuals();
    }
  };
}

// Immediately kill all playing & queued AI audio (Instant Barge-in!)
function stopAllAiAudio() {
  for (const src of activeAudioSources) {
    try {
      src.onended = null;
      src.stop();
      src.disconnect();
    } catch (e) {}
  }
  activeAudioSources.clear();
  nextPlayTime = 0;
  state.isAiSpeaking = false;
  updateVisuals();
}

// Live Visualizer Animation Loop (drives 7 bars & orb pulse from real audio!)
function startVisualizerLoop() {
  if (visualizerRafId) return;
  const freqData = new Uint8Array(32);

  function frame() {
    visualizerRafId = requestAnimationFrame(frame);

    let level = 0;
    if (state.isAiSpeaking && playbackAnalyser) {
      playbackAnalyser.getByteFrequencyData(freqData);
      let sum = 0;
      for (let i = 0; i < 16; i++) sum += freqData[i];
      level = Math.min(1, (sum / 16) / 140);
    } else if (state.isConnected && !state.isMuted) {
      level = Math.min(1, currentMicRms * 7.5);
    }

    const weights = [0.45, 0.75, 1.0, 0.85, 1.0, 0.72, 0.45];
    voiceBarSpans.forEach((span, idx) => {
      const jitter = state.sessionActive ? (0.85 + Math.random() * 0.3) : 1;
      const h = state.sessionActive ? Math.max(4, Math.round(4 + level * 16 * weights[idx] * jitter)) : 4;
      span.style.height = `${h}px`;
    });

    if (orbPulse) {
      const scale = state.sessionActive ? (1 + level * 0.24) : 1;
      orbPulse.style.transform = `scale(${scale.toFixed(3)})`;
    }
  }
  frame();
}

// ==============================================================================
// 💬 Chronological Real-Time Scrolling Chat Feed (AI -> User -> AI -> User)
// ==============================================================================
let activeUserBubble = null; // { row, bubble, text }
let activeAiBubble = null;   // { row, bubble, text }
let lastFinalizedUserText = '';

function scrollChatToBottom(force = false) {
  if (!chatFeed) return;
  const distFromBottom = chatFeed.scrollHeight - chatFeed.scrollTop - chatFeed.clientHeight;
  if (force || distFromBottom < 180) {
    requestAnimationFrame(() => {
      chatFeed.scrollTop = chatFeed.scrollHeight;
    });
  }
}

function addSystemPill(text) {
  const pill = document.createElement('div');
  pill.className = 'system-pill';
  pill.textContent = text;
  chatMessages.appendChild(pill);
  scrollChatToBottom(true);
}

function normalizeStreamingText(text) {
  return text.replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
}

function ensureUserBubble() {
  // Always finalize any open AI bubble first so User appears cleanly BELOW AI
  if (activeAiBubble) {
    finalizeAiBubble(false);
  }
  if (activeUserBubble) return activeUserBubble;

  const row = document.createElement('div');
  row.className = 'msg-row user streaming';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = `<span class="msg-sender">Me</span>`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = '';

  row.appendChild(meta);
  row.appendChild(bubble);
  chatMessages.appendChild(row);

  activeUserBubble = { row, bubble, text: '' };
  scrollChatToBottom(true);
  return activeUserBubble;
}

function appendUserTranscript(delta) {
  if (!delta) return;
  const b = ensureUserBubble();
  b.text = normalizeStreamingText(b.text + delta);
  b.bubble.textContent = deduplicateAll(b.text);
  scrollChatToBottom(false);
}

function finalizeUserBubble() {
  if (!activeUserBubble) return null;
  const finalized = activeUserBubble;
  activeUserBubble = null;

  finalized.row.classList.remove('streaming');
  const cleanText = deduplicateAll(finalized.text.trim());
  if (!cleanText) {
    finalized.row.remove();
    return null;
  }

  finalized.bubble.textContent = cleanText;
  lastFinalizedUserText = cleanText;
  state.messages.push({ role: 'user', text: cleanText });
  return finalized;
}

function ensureAiBubble() {
  // Always finalize any open User bubble first so AI appears cleanly BELOW User
  if (activeUserBubble) {
    finalizeUserBubble();
  }
  if (activeAiBubble) return activeAiBubble;

  const row = document.createElement('div');
  row.className = 'msg-row ai streaming';

  const avatarLetter = (state.voice || 'P')[0].toUpperCase();
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = `
    <span class="msg-avatar">${escapeHtml(avatarLetter)}</span>
    <span class="msg-sender">${escapeHtml(state.voice)}</span>
  `;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = '';

  row.appendChild(meta);
  row.appendChild(bubble);
  chatMessages.appendChild(row);

  activeAiBubble = { row, bubble, text: '' };
  scrollChatToBottom(true);
  return activeAiBubble;
}

function appendAiTranscript(delta) {
  if (!delta) return;
  // Filter out accidental Hangul if any ever appeared in transcription
  const cleanDelta = delta.replace(/[\u3131-\u318E\uAC00-\uD7A3]+/g, '');
  if (!cleanDelta) return;

  const b = ensureAiBubble();
  b.text = normalizeStreamingText(b.text + cleanDelta);
  b.bubble.textContent = b.text;
  scrollChatToBottom(false);
}

function finalizeAiBubble(wasInterrupted = false) {
  if (!activeAiBubble) return null;
  const finalized = activeAiBubble;
  activeAiBubble = null;

  finalized.row.classList.remove('streaming');
  const cleanText = finalized.text.trim();
  if (!cleanText) {
    finalized.row.remove();
    return null;
  }

  finalized.bubble.textContent = cleanText;
  if (wasInterrupted) {
    const tag = document.createElement('span');
    tag.className = 'msg-interrupted-tag';
    tag.textContent = '• 끼어듦';
    finalized.bubble.appendChild(tag);
  }

  state.messages.push({ role: 'model', text: cleanText });
  inspectAiTranscriptForDrill(cleanText);
  return { row: finalized.row, text: cleanText };
}

// ==============================================================================
// 🎯 10-Repetition Live Turn-Taking Drill Engine
// ==============================================================================
const drillState = {
  active: false,
  count: 0,
  original: '',
  target: '',
  explanation: ''
};

function showDrillBanner(orig, target, expl, count = 1) {
  drillState.active = true;
  drillState.original = orig || drillState.original || '';
  drillState.target = target || drillState.target || '';
  drillState.explanation = expl || drillState.explanation || '';
  drillState.count = count;

  if (drillOrigText) drillOrigText.textContent = drillState.original || '-';
  if (drillTargetText) drillTargetText.textContent = drillState.target || '-';
  if (drillExplText) drillExplText.textContent = drillState.explanation ? `💡 ${drillState.explanation}` : '';
  if (drillCountBadge) {
    drillCountBadge.textContent = `Count ${drillState.count} / 10`;
    drillCountBadge.style.background = '#f59e0b';
    drillCountBadge.style.color = '#111827';
  }
  if (drillProgressFill) drillProgressFill.style.width = `${Math.min(100, (drillState.count / 10) * 100)}%`;
  if (drillBanner) drillBanner.classList.remove('hidden');
}

function updateDrillCount(count, isRetry = false) {
  if (!drillState.active && count >= 1) {
    drillState.active = true;
    if (drillBanner) drillBanner.classList.remove('hidden');
  }
  drillState.count = count;
  if (drillCountBadge) {
    if (isRetry) {
      drillCountBadge.textContent = `Count ${drillState.count} / 10 🔄 다시 시도`;
      drillCountBadge.style.background = '#ef4444';
      drillCountBadge.style.color = '#ffffff';
    } else {
      drillCountBadge.textContent = `Count ${drillState.count} / 10`;
      drillCountBadge.style.background = '#f59e0b';
      drillCountBadge.style.color = '#111827';
    }
  }
  if (drillProgressFill) drillProgressFill.style.width = `${Math.min(100, (drillState.count / 10) * 100)}%`;

  if (count >= 10 && !isRetry) {
    if (drillCountBadge) {
      drillCountBadge.textContent = `🎉 10회 완료!`;
      drillCountBadge.style.background = '#10b981';
      drillCountBadge.style.color = '#ffffff';
    }
    if (drillProgressFill) drillProgressFill.style.width = '100%';

    if (drillState.target) {
      const tip = {
        original: drillState.original,
        corrected: drillState.target,
        explanation: drillState.explanation || '10회 집중 반복 훈련 완료'
      };
      state.corrections.push(tip);
      accumulateMasterNote(tip);
      if (state.gdriveWebhookUrl) {
        syncToGoogleDrive().catch(() => {});
      }
    }

    setTimeout(() => {
      if (drillBanner && drillState.count >= 10) {
        drillBanner.classList.add('hidden');
        drillState.active = false;
        if (drillCountBadge) {
          drillCountBadge.style.background = '#f59e0b';
          drillCountBadge.style.color = '#111827';
        }
      }
    }, 3500);
  }
}

function inspectAiTranscriptForDrill(aiText) {
  if (!aiText) return;

  // 1. Check for initial drill initiation: "You said '...', but native speakers usually say: '...'"
  const startMatch = aiText.match(/You said ['"“]([^'"“”]+)['"”],?\s*but native speakers (?:usually )?say:?\s*['"“]([^'"“”]+)['"”](?:\.?\s*([^.!?\n]+[.!?]))?/i);
  if (startMatch) {
    const orig = deduplicateAll(startMatch[1].trim());
    const target = deduplicateAll(startMatch[2].trim());
    const expl = (startMatch[3] || '').trim();
    showDrillBanner(orig, target, expl, 1);
    return;
  }

  // 2. Check for turn-by-turn number prompt with retry detection
  const isRetry = /\b(retry|again|redo|once more|one more time|repeat Number)\b/i.test(aiText);
  const numMatch = aiText.match(/\b(?:Number|Count|Round)\s*(\d+)\b/i);
  if (numMatch) {
    const count = parseInt(numMatch[1], 10);
    if (count >= 1 && count <= 10) {
      if (!drillState.active) {
        const afterColon = aiText.split(/Number \d+[:.]?/i)[1];
        const targetCandidate = afterColon ? afterColon.replace(/[.!?].*$/, '').trim() : '';
        showDrillBanner('', targetCandidate, '', count);
      } else {
        updateDrillCount(count, isRetry);
      }
    }
  } else if (aiText.match(/10 times completed|10th time completed|completed 10 times|all 10 times/i)) {
    updateDrillCount(10, false);
  }
}

function dismissDrill() {
  drillState.active = false;
  if (drillBanner) drillBanner.classList.add('hidden');
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text: `[Drill skipped] Let's continue chatting about ${state.currentTopic}!` }]
        }],
        turnComplete: true
      }
    }));
  }
}

function renderInlineTipCard(aiRowEl, tip) {
  if (!aiRowEl || !tip || !tip.corrected) return;
  const card = document.createElement('div');
  card.className = 'tip-card';
  card.innerHTML = `
    <div class="tip-card-header">✨ 원어민 표현 팁 • 마스터 노트 자동 저장</div>
    ${tip.original ? `<div class="tip-orig">${escapeHtml(tip.original)}</div>` : ''}
    <div class="tip-native">👉 ${escapeHtml(tip.corrected)}</div>
    ${tip.explanation ? `<div class="tip-expl">💡 ${escapeHtml(tip.explanation)}</div>` : ''}
  `;
  aiRowEl.appendChild(card);
  scrollChatToBottom(false);
}

// Silent background analyzer (0ms impact on live voice speed!)
async function analyzeTurnInBackground(userText, aiText, aiRowEl) {
  if (!userText || !aiText || userText.length < 4) return;
  try {
    const res = await fetch('/api/analyze-turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userText,
        aiText,
        apiKey: state.apiKey
      })
    });
    const tip = await res.json();
    if (tip && tip.hasTip && tip.corrected) {
      state.corrections.push(tip);
      accumulateMasterNote(tip);
      renderInlineTipCard(aiRowEl, tip);
    }
  } catch (e) {
    // Non-critical background task
  }
}

// ==============================================================================
// 🌐 Gemini 3.8 Live WebSocket Session Management
// ==============================================================================
function buildLiveSystemInstruction() {
  const stealthLines = state.stealthTargets.length > 0
    ? `\n[STEALTH REVIEW TARGETS — WEAVE IN NATURALLY]\nThe user previously learned or struggled with these expressions:\n${state.stealthTargets.map((t, i) => `${i + 1}. "${t.corrected}" (past mistake: "${t.original}")`).join('\n')}\nNEVER mention "from last time" or "remember this". Just naturally create situations where they might use them.\n`
    : '';

  const recentRecap = state.messages.length > 0
    ? `\n[RECENT CONVERSATION CONTEXT BEFORE RECONNECT]\n${state.messages.slice(-8).map(m => `${m.role === 'user' ? 'User' : state.voice}: ${m.text}`).join('\n')}\nContinue seamlessly without re-introducing yourself.\n`
    : '';

  const mem = state.userProfile || {};
  const interests = (mem.interests && mem.interests.length > 0)
    ? mem.interests.join(', ')
    : 'Gangnam real estate & house hunting, cars & commuting, travel videos';
  const facts = (mem.personalFacts && mem.personalFacts.length > 0)
    ? mem.personalFacts.join('; ')
    : 'Looking to buy a house/apartment in Gangnam; often talks in English while driving in the car';
  const prefs = (mem.learningPreferences && mem.learningPreferences.length > 0)
    ? mem.learningPreferences.join('; ')
    : 'Wants strict 10-repetition drills whenever making an awkward phrase or mistake; prefers friendly American native style';
  const recentHighlights = (mem.recentMemories && mem.recentMemories.length > 0)
    ? mem.recentMemories.join('; ')
    : '';

  const memorySection = `
[WHO I AM & WHAT YOU PERSONALLY REMEMBER ABOUT ME (LONG-TERM FRIEND MEMORY)]:
You are not a generic AI bot talking to a stranger. You are ${state.voice}, my real close American friend who knows my life and remembers our past chats!
- My Interests & Passions: ${interests}
- Life Situation & Personal Facts: ${facts}
- My Learning & Conversational Preferences: ${prefs}
${recentHighlights ? `- Things We Talked About In Past Chats: ${recentHighlights}` : ''}

HOW TO ACT ON THIS KNOWLEDGE:
- Casually reference or build on things you know about me when relevant (e.g. if we talk about living spaces or homes, you know I'm looking at Gangnam; if I talk about driving, you know my commute stories).
- Talk to me like a real close friend who has shared history with me, not a robotic stranger. Never say "According to my notes" — just naturally know it like a true friend!
`;

  return `You are ${state.voice}, a close, warm, witty American friend in your 30s having a real-time spoken English conversation over coffee.

CRITICAL RULES (NON-NEGOTIABLE):
1. 100% PURE NATIVE AMERICAN ENGLISH ONLY:
   - NEVER speak Korean and NEVER attempt to pronounce Korean words.
   - Speak naturally with authentic American rhythm, contractions, and connected speech (gonna, wanna, kinda, didn't, what's up, you know).

2. STRICT SENTENCE-BY-SENTENCE CORRECTION & RIGOROUS 10-REPETITION DRILL WITH INSTANT QUALITY EVALUATION:
   - The user's primary goal is to build genuine English muscle memory and fix mistakes.
   - Whenever the user makes ANY awkward phrasing, grammatical slip, Konglish, broken sentence, or unnatural word choice (e.g., "A want to buy", "houses price is getting increasing", "I eat medicine", "yesterday I sleep early", "neighborhood means people who live next to me", "videos about traveling and looking around the house"):
     * DO NOT ignore it! DO NOT let it slide and DO NOT just continue the conversation without fixing it!
     * Step 1 (Point out & Count 1):
       "You said '[User's awkward phrase]', but native speakers usually say: '[Target Native Expression]'. [1 brief sentence explanation of the nuance]. Let's practice this 10 times until you master it! Repeat after me. Number 1: [Target Native Expression]"
     * Step 2 (Turn-by-Turn Drill with Strict Quality Evaluation Count 1 to 10):
       On EACH turn, listen carefully to whether the user repeated it accurately:
       - IF ACCURATE & CLEAR: Praise briefly (e.g. "Great rhythm!", "Clear pronunciation!") and advance to the next count:
         "Number [Next Count]: [Target Native Expression]"
       - IF FLAWED / MUMBLED / DROPPED SOUNDS / INACCURATE:
         DO NOT advance the count! Do NOT let them move to the next number!
         Give 1 immediate micro-coaching tip in English pointing out the exact flaw, and retry the SAME number:
         "Close, but you dropped the 's' on [word]. Listen closely. Let's retry Number [Same Count]: [Target Native Expression]"
         or
         "Watch the linking: connect those words smoothly. Let's do Number [Same Count] again: [Target Native Expression]"
         Keep them on that SAME number until they repeat it accurately!
     * Step 3 (Celebration & Continuation):
       Only after all 10 repetitions have been successfully passed with good quality:
       "Awesome! All 10 repetitions nailed! Great job. Now back to our talk: [Engaging follow-up question]"
   - If the user's sentence is already natural and correct, keep the chat rolling with 1 to 3 lively conversational sentences.

3. NOISE & RUSTLING REJECTION:
   - Completely ignore clothing friction, jacket rustling, car engine hum, breathing, or unintelligible noise.
   - If the audio is just rustle or unclear ambient noise, REMAIN SILENT. Never hallucinate words or answer noise.

4. UNKNOWN WORDS:
   - If the user asks what a word means ("What does X mean?"), explain it simply in easy English (A2-B1), give 1-2 short everyday example sentences, mention the vibe/nuance, and ask a fun follow-up question using it.

5. TODAY'S TOPIC: ${state.currentTopic}
${stealthLines}${recentRecap}${memorySection}`;
}

function connectLiveWebSocket(isReconnect = false) {
  return new Promise((resolve, reject) => {
    if (!state.apiKey) {
      reject(new Error('Gemini API 키가 없습니다. 우측 상단 ⚙️ 설정에서 API 키를 입력해 주세요.'));
      return;
    }

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(state.apiKey)}`;
    ws = new WebSocket(wsUrl);

    let setupDone = false;
    const setupTimeout = setTimeout(() => {
      if (!setupDone) {
        try { ws.close(); } catch (e) {}
        reject(new Error('Gemini Live 서버 연결 시간 초과'));
      }
    }, 10000);

    ws.onopen = () => {
      const setupPayload = {
        setup: {
          model: state.liveModel,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: state.voice
                }
              }
            }
          },
          systemInstruction: {
            parts: [{ text: buildLiveSystemInstruction() }]
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: false,
              startOfSpeechSensitivity: state.bargeInSensitivity,
              endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
              prefixPaddingMs: 220,
              silenceDurationMs: state.silenceDurationMs
            },
            activityHandling: 'START_OF_ACTIVITY_INTERRUPTS'
          }
        }
      };
      ws.send(JSON.stringify(setupPayload));
    };

    ws.onmessage = async (event) => {
      let raw = event.data;
      if (raw instanceof Blob) {
        raw = await raw.text();
      }
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        return;
      }

      if (msg.setupComplete) {
        setupDone = true;
        clearTimeout(setupTimeout);
        state.isConnecting = false;
        state.isConnected = true;
        state.reconnectAttempts = 0;
        updateVisuals();

        // Kick off conversation proactively on fresh start OR resume seamlessly!
        if (!isReconnect) {
          ws.send(JSON.stringify({
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{
                  text: `[Session started] Kick off our chat right now with a super natural, short, fun 2-sentence friend opener about "${state.currentTopic}". Do NOT say "How was your day?" — jump right into a relatable mini-story or fun question!`
                }]
              }],
              turnComplete: true
            }
          }));
        } else {
          // User returned from background / home screen: seamlessly welcome back and continue!
          ws.send(JSON.stringify({
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{
                  text: `[I just returned to our conversation from background/home screen] In 1 short, warm, natural friend sentence, welcome me back and continue our conversation about "${state.currentTopic}" right where we left off!`
                }]
              }],
              turnComplete: true
            }
          }));
        }
        resolve();
        return;
      }

      if (msg.serverContent) {
        const sc = msg.serverContent;

        // 1. Instant Full-Duplex Barge-in!
        if (sc.interrupted) {
          stopAllAiAudio();
          finalizeAiBubble(true);
          updateVisuals();
        }

        // 2. Real-Time User Speech Transcription (Clean, Zero Duplication!)
        if (sc.inputTranscription && sc.inputTranscription.text) {
          appendUserTranscript(sc.inputTranscription.text);
        }

        // 3. Real-Time AI Speech Transcription
        if (sc.outputTranscription && sc.outputTranscription.text) {
          appendAiTranscript(sc.outputTranscription.text);
        }

        // 4. Real-Time 24kHz Native Puck/Aoede Audio Chunks
        if (sc.modelTurn && sc.modelTurn.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.inlineData && part.inlineData.data) {
              enqueuePcm24kAudio(part.inlineData.data);
            }
          }
        }

        // 5. Turn Complete -> Finalize AI bubble & quietly check for native tips in background
        if (sc.turnComplete) {
          const userSnap = lastFinalizedUserText;
          const aiDone = finalizeAiBubble(false);
          if (aiDone && userSnap) {
            lastFinalizedUserText = '';
            analyzeTurnInBackground(userSnap, aiDone.text, aiDone.row);
          }
          saveActiveSessionToStorage();
          updateVisuals();
        }
      }
    };

    ws.onerror = (err) => {
      console.error('[Live WS Error]', err);
      if (!setupDone) {
        clearTimeout(setupTimeout);
        reject(new Error('Gemini Live WebSocket 연결 오류'));
      }
    };

    ws.onclose = (ev) => {
      clearTimeout(setupTimeout);
      state.isConnected = false;
      state.isConnecting = false;
      stopAllAiAudio();
      finalizeAiBubble(false);
      finalizeUserBubble();

      if (!setupDone) {
        let reason = ev.reason;
        if (reason && (reason.includes('prepayment credits') || reason.includes('depleted') || reason.includes('RESOURCE_EXHAUSTED'))) {
          reason = 'Google AI Studio API 크레딧(선불 잔액)이 소진되었습니다. 우측 상단 ⚙️ 설정에서 새 API 키를 등록하거나 크레딧을 충전해 주세요.';
        }
        reject(new Error(reason || `연결 종료 (code ${ev.code})`));
        return;
      }

      // Seamless auto-reconnect if dropped unexpectedly during an active session
      if (state.sessionActive && !state.isExplicitlyEnded) {
        state.isPausedInBackground = true;
        saveActiveSessionToStorage();

        // If page is currently hidden (user is on home screen/another app), keep session alive!
        if (document.visibilityState === 'hidden') {
          console.log('[Live WS] Background paused. Standing by for user return.');
          return;
        }

        if (state.reconnectAttempts < 5) {
          state.reconnectAttempts++;
          statusMsg.textContent = `🔄 연결 재시도 중... (${state.reconnectAttempts}/5)`;
          updateVisuals();
          setTimeout(() => {
            if (state.sessionActive && !state.isExplicitlyEnded) {
              connectLiveWebSocket(true).catch(() => {
                showResumeBanner();
              });
            }
          }, 1200);
        } else {
          showResumeBanner();
        }
      }
    };
  });
}

// ==============================================================================
// 🚀 Start / Stop / Mute / Text Send Actions
// ==============================================================================
async function startSession(isResume = false) {
  if (state.sessionActive || state.isConnecting) return;

  // 1. Synchronously unlock AudioContexts inside the tap gesture!
  try {
    initAudioContextsSync();
  } catch (e) {
    alert(e.message);
    return;
  }
  requestWakeLock();

  state.sessionActive = true;
  state.isConnecting = true;
  state.isMuted = false;
  state.isExplicitlyEnded = false;
  state.isPausedInBackground = false;
  lastFinalizedUserText = '';

  if (resumeBanner) resumeBanner.classList.add('hidden');
  welcomeHero.classList.add('hidden');
  muteBtn.classList.remove('hidden');
  endCallBtn.classList.remove('hidden');

  if (!isResume) {
    state.messages = [];
    state.corrections = [];
    chatMessages.innerHTML = '';
  }

  updateVisuals();
  statusMsg.textContent = isResume
    ? `🔄 ${state.voice} 이전 대화 복원 중...`
    : `⚡ ${state.voice} 원어민 라이브 연결 중...`;

  try {
    // 2. Request Mic + Load Topic & User Profile Memory in parallel!
    const [initData] = await Promise.all([
      fetch('/api/session-init').then(r => r.json()).catch(() => ({})),
      startMicCapture()
    ]);

    if (initData && initData.userProfile) {
      state.userProfile = initData.userProfile;
      try {
        localStorage.setItem('user_persona_memory', JSON.stringify(initData.userProfile));
      } catch (e) {}
    }

    const recentTopics = initData.recentTopics || [];
    state.skillPrompt = initData.skillPrompt || '';

    let localNotes = [];
    try {
      localNotes = JSON.parse(localStorage.getItem('master_review_notes') || '[]');
    } catch (e) {}
    const localPending = localNotes.filter(n => n.status !== 'mastered');
    state.stealthTargets = localPending.length > 0 ? localPending.slice(0, 5) : (initData.pendingTargets || []);

    if (!isResume || !state.currentTopic) {
      const availableTopics = TOPICS.filter(t => !recentTopics.some(rt => t.includes(rt) || rt.includes(t)));
      state.currentTopic = availableTopics.length > 0
        ? availableTopics[Math.floor(Math.random() * availableTopics.length)]
        : TOPICS[Math.floor(Math.random() * TOPICS.length)];
      topicText.textContent = state.currentTopic;
      addSystemPill(`🎙️ ${state.voice} 연결됨 • 주제: ${state.currentTopic.split('(')[0].trim()}`);
    } else {
      topicText.textContent = state.currentTopic;
      addSystemPill(`🔄 이전 대화 재개 • 주제: ${state.currentTopic.split('(')[0].trim()}`);
    }

    // 3. Connect Gemini 3.8 Live WebSocket!
    await connectLiveWebSocket(isResume);
    startVisualizerLoop();
    updateVisuals();

  } catch (err) {
    console.error('[StartSession Error]', err);
    stopMicCapture();
    releaseWakeLock();
    state.sessionActive = false;
    state.isConnecting = false;
    state.isConnected = false;
    muteBtn.classList.add('hidden');
    endCallBtn.classList.add('hidden');
    updateVisuals();

    let msg = `⚠️ 연결 실패: ${err.message}`;
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      msg = '⚠️ 마이크 권한이 거부되었습니다. 브라우저 주소창 옆 권한 설정에서 마이크를 허용해 주세요.';
    } else if (err.message && (err.message.includes('크레딧') || err.message.includes('prepayment credits') || err.message.includes('depleted') || err.message.includes('RESOURCE_EXHAUSTED'))) {
      msg = '⚠️ Google AI Studio 크레딧(선불 잔액) 소진: ⚙️ 설정에서 새 API 키를 입력해 주세요.';
      setTimeout(() => {
        if (settingsBtn) settingsBtn.click();
      }, 1000);
    }
    statusMsg.textContent = msg;
    addSystemPill(msg);
  }
}

async function endSession(autoSave = true) {
  state.sessionActive = false;
  state.isConnecting = false;
  state.isConnected = false;
  state.isMuted = false;
  state.isExplicitlyEnded = true;
  state.isPausedInBackground = false;

  try {
    sessionStorage.removeItem('english_friend_active_session');
  } catch (e) {}

  if (resumeBanner) resumeBanner.classList.add('hidden');

  stopAllAiAudio();
  stopMicCapture();
  releaseWakeLock();

  if (ws) {
    try { ws.close(1000, 'User ended call'); } catch (e) {}
    ws = null;
  }

  finalizeUserBubble();
  finalizeAiBubble(false);

  muteBtn.classList.add('hidden');
  endCallBtn.classList.add('hidden');
  updateVisuals();

  if (autoSave && state.messages.length > 0) {
    addSystemPill('📞 통화 종료 • 대화 기록을 자동 저장하고 나에 대한 기억을 학습하고 있습니다...');
    await saveSessionLog(true);
    triggerContinuousMemoryLearning().catch(() => {});
  } else {
    statusMsg.textContent = '통화가 종료되었습니다. 마이크를 눌러 언제든 다시 시작하세요.';
  }
}

function toggleMute() {
  if (!state.sessionActive) return;
  state.isMuted = !state.isMuted;
  updateVisuals();
}

function sendTextMessage(text) {
  const clean = text.trim();
  if (!clean) return;

  if (!state.sessionActive) {
    // Start session first if user sends text before tapping start
    startSession().then(() => {
      setTimeout(() => sendTextMessage(clean), 1200);
    });
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  stopAllAiAudio();
  finalizeAiBubble(false);

  const b = ensureUserBubble();
  b.text = clean;
  b.bubble.textContent = clean;
  finalizeUserBubble();

  ws.send(JSON.stringify({
    clientContent: {
      turns: [{ role: 'user', parts: [{ text: clean }] }],
      turnComplete: true
    }
  }));
  scrollChatToBottom(true);
}

function updateVisuals() {
  statusDot.className = 'status-indicator';
  callOrbBtn.className = 'live-orb-btn';
  voiceBars.className = 'voice-bars';
  voiceBadge.textContent = `LIVE • ${state.voice}`;

  const modelLabel = state.liveModel.includes('3.8')
    ? 'Gemini 3.8 Live'
    : state.liveModel.includes('3.1')
      ? 'Gemini 3.1 Live'
      : 'Gemini 2.5 Live';
  if (liveChip) liveChip.textContent = modelLabel;

  if (muteBtn) {
    muteBtn.classList.toggle('active-mute', state.isMuted);
    if (muteIconOn) muteIconOn.classList.toggle('hidden', state.isMuted);
    if (muteIconOff) muteIconOff.classList.toggle('hidden', !state.isMuted);
  }

  if (state.isConnecting) {
    statusDot.classList.add('connecting');
    callOrbBtn.classList.add('connecting');
    statusMsg.textContent = `⚡ ${state.voice} 연결 중...`;
  } else if (!state.sessionActive) {
    statusMsg.textContent = '마이크 버튼을 눌러 원어민 친구와 대화를 시작하세요';
  } else if (state.isMuted) {
    statusDot.classList.add('muted');
    callOrbBtn.classList.add('muted');
    statusMsg.textContent = '🔇 마이크가 음소거되었습니다';
  } else if (state.isAiSpeaking) {
    statusDot.classList.add('speaking');
    callOrbBtn.classList.add('speaking');
    voiceBars.classList.add('speaking');
    statusMsg.textContent = `🔊 ${state.voice} 말하는 중 • 말 걸면 바로 끼어들 수 있어요`;
  } else if (state.isConnected) {
    statusDot.classList.add('listening');
    callOrbBtn.classList.add('listening');
    voiceBars.classList.add('listening');
    statusMsg.textContent = '🟢 듣고 있어요 • 편하게 연음으로 말씀하세요!';
  }
}

// ==============================================================================
// 💾 Master Review Notes & Google Drive Auto-Sync
// ==============================================================================
function accumulateMasterNote(corr) {
  if (!corr || !corr.corrected) return;
  const cleanOriginal = deduplicateAll(corr.original || '');
  const cleanCorrected = deduplicateAll(corr.corrected || '');
  if (!cleanCorrected) return;

  let notes = [];
  try {
    notes = JSON.parse(localStorage.getItem('master_review_notes') || '[]');
  } catch (e) {}

  const exists = notes.some(n => deduplicateAll(n.corrected).toLowerCase() === cleanCorrected.toLowerCase());
  if (!exists) {
    const today = new Date().toISOString().split('T')[0];
    const newEntry = {
      dateAdded: today,
      original: cleanOriginal,
      corrected: cleanCorrected,
      explanation: corr.explanation || '',
      status: 'pending'
    };
    notes.unshift(newEntry);
    localStorage.setItem('master_review_notes', JSON.stringify(notes));

    fetch('/api/save-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: state.currentTopic,
        corrections: [newEntry],
        voice: state.voice
      })
    }).catch(() => {});
  }
}

async function syncToGoogleDrive(fullTranscript = '') {
  if (!state.gdriveWebhookUrl) return null;
  const transcript = fullTranscript || state.messages
    .map(m => `${m.role === 'user' ? 'Me' : state.voice}: ${m.text}`)
    .join('\n\n');

  try {
    const res = await fetch('/api/sync-gdrive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: state.currentTopic || 'English Conversation',
        corrections: state.corrections,
        fullTranscript: transcript,
        webhookUrl: state.gdriveWebhookUrl,
        date: new Date().toISOString().split('T')[0]
      })
    });
    return await res.json();
  } catch (err) {
    console.warn('[GDrive Sync Warning]', err.message);
    return null;
  }
}

async function saveSessionLog(silent = false) {
  if (state.messages.length === 0) {
    if (!silent) alert('아직 나눈 대화가 없습니다.');
    return;
  }

  const fullTranscript = state.messages
    .map(m => `${m.role === 'user' ? 'Me' : state.voice}: ${m.text}`)
    .join('\n\n');

  if (state.gdriveWebhookUrl) {
    syncToGoogleDrive(fullTranscript);
  }

  try {
    const res = await fetch('/api/save-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: state.currentTopic,
        corrections: state.corrections,
        fullTranscript,
        voice: state.voice
      })
    });
    const data = await res.json();
    if (data.success) {
      if (silent) {
        addSystemPill(`✅ 저장 완료! (누적 표현 ${data.masterCount}개${state.gdriveWebhookUrl ? ' • 구글 드라이브 동기화됨' : ''})`);
      } else {
        const gd = state.gdriveWebhookUrl ? '\n• 구글 드라이브 [영어 회화] 폴더 자동 동기화 ☁️' : '';
        alert(`🎉 대화 일지가 저장되었습니다!\n• 세션: ${data.sessionFilename}\n• 누적 표현: 총 ${data.masterCount}개${gd}`);
      }
    }
  } catch (err) {
    if (!silent) alert('저장 오류: ' + err.message);
  }
}

function renderMasterNotes() {
  let notes = [];
  try {
    notes = JSON.parse(localStorage.getItem('master_review_notes') || '[]');
  } catch (e) {}

  // Auto-clean any duplicated tokens from existing localStorage
  let modified = false;
  notes = notes.map(item => {
    const origClean = deduplicateAll(item.original || '');
    const corrClean = deduplicateAll(item.corrected || '');
    if (origClean !== item.original || corrClean !== item.corrected) {
      modified = true;
      return { ...item, original: origClean, corrected: corrClean };
    }
    return item;
  });
  if (modified) {
    localStorage.setItem('master_review_notes', JSON.stringify(notes));
  }

  if (!notes.length) {
    notesListContainer.innerHTML = `<p class="empty-notes">아직 누적된 교정 표현이 없습니다.<br>대화 중 친구가 알려준 원어민 표현이 자동 저장됩니다.</p>`;
    return;
  }

  let html = `
    <table class="master-table">
      <thead>
        <tr>
          <th>날짜</th>
          <th>원래 한 말 ➔ 원어민 표현</th>
          <th>뉘앙스 설명</th>
          <th>상태</th>
        </tr>
      </thead>
      <tbody>
  `;
  notes.forEach(item => {
    const badge = item.status === 'mastered'
      ? `<span class="status-tag mastered">✅ 마스터</span>`
      : `<span class="status-tag pending">🎯 복습</span>`;
    html += `
      <tr>
        <td style="color:#9ca3af;font-size:11px;white-space:nowrap;">${escapeHtml(item.dateAdded || '-')}</td>
        <td>
          ${item.original ? `<div class="orig-text">${escapeHtml(item.original)}</div>` : ''}
          <div class="target-text">${escapeHtml(item.corrected)}</div>
        </td>
        <td class="expl-text">${escapeHtml(item.explanation || '-')}</td>
        <td>${badge}</td>
      </tr>
    `;
  });
  html += `</tbody></table>`;
  notesListContainer.innerHTML = html;
}

// ==============================================================================
// ⚙️ Config Loading & Event Wiring
// ==============================================================================
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (!localStorage.getItem('live_model') && data.currentLiveModel) {
      state.liveModel = data.currentLiveModel;
    }
    if (!localStorage.getItem('live_voice') && data.currentVoice) {
      state.voice = data.currentVoice;
    }

    if (voiceSelect) voiceSelect.value = state.voice;
    if (liveModelSelect) liveModelSelect.value = state.liveModel;
    if (silenceSelect) silenceSelect.value = String(state.silenceDurationMs);
    if (bargeInSelect) bargeInSelect.value = state.bargeInSensitivity;

    if (data.localIps && data.localIps.length > 0 && mobileUrls) {
      mobileUrls.innerHTML = data.localIps
        .map(ip => `<div>http://${ip}:${data.port || 3000}</div>`)
        .join('');
    }
    updateVisuals();
  } catch (e) {
    console.warn('Config load warning:', e);
  }
}

// Direct Start Button
directStartBtn.addEventListener('click', startSession);

// Center Live Orb Button: Start call OR instant manual barge-in interrupt
callOrbBtn.addEventListener('click', () => {
  if (!state.sessionActive) {
    startSession();
  } else if (state.isAiSpeaking) {
    // Instant manual interrupt in addition to automatic voice barge-in
    stopAllAiAudio();
    finalizeAiBubble(true);
    statusMsg.textContent = '🟢 바로 말씀하세요!';
  } else if (state.isMuted) {
    toggleMute();
  }
});

muteBtn.addEventListener('click', toggleMute);
endCallBtn.addEventListener('click', () => endSession(true));

sendBtn.addEventListener('click', () => {
  const val = textInput.value;
  if (val.trim()) {
    textInput.value = '';
    sendTextMessage(val);
  }
});

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    const val = textInput.value;
    if (val.trim()) {
      textInput.value = '';
      sendTextMessage(val);
    }
  }
});

saveLogBtn.addEventListener('click', () => saveSessionLog(false));

// Settings Modal
settingsBtn.addEventListener('click', () => {
  loadConfig();
  if (apiKeyInput) apiKeyInput.value = state.apiKey;
  if (voiceSelect) voiceSelect.value = state.voice;
  if (liveModelSelect) liveModelSelect.value = state.liveModel;
  if (silenceSelect) silenceSelect.value = String(state.silenceDurationMs);
  if (bargeInSelect) bargeInSelect.value = state.bargeInSensitivity;
  if (gdriveWebhookInput) gdriveWebhookInput.value = state.gdriveWebhookUrl;
  if (state.gdriveWebhookUrl && gdriveStatusText) {
    gdriveStatusText.innerHTML = '✅ <span style="color:#4ade80;">구글 드라이브 [영어 회화] 폴더 자동 연동 중</span>';
  }
  settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

saveSettingsBtn.addEventListener('click', async () => {
  const newVoice = voiceSelect.value;
  const newModel = liveModelSelect.value;
  const newSilence = parseInt(silenceSelect.value, 10);
  const newBargeIn = bargeInSelect.value;
  const newKey = apiKeyInput.value.trim();
  const newGdrive = gdriveWebhookInput.value.trim();

  const needsReconnect = state.sessionActive && (
    newVoice !== state.voice ||
    newModel !== state.liveModel ||
    newSilence !== state.silenceDurationMs ||
    newBargeIn !== state.bargeInSensitivity ||
    (newKey && newKey !== state.apiKey)
  );

  if (newKey) {
    state.apiKey = newKey;
    localStorage.setItem('gemini_api_key', newKey);
  }
  state.voice = newVoice;
  state.liveModel = newModel;
  state.silenceDurationMs = newSilence;
  state.bargeInSensitivity = newBargeIn;
  state.gdriveWebhookUrl = newGdrive;

  localStorage.setItem('live_voice', newVoice);
  localStorage.setItem('live_model', newModel);
  localStorage.setItem('live_silence_ms', String(newSilence));
  localStorage.setItem('live_bargein', newBargeIn);
  localStorage.setItem('gdrive_webhook_url', newGdrive);

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ liveModel: newModel, voice: newVoice, apiKey: state.apiKey })
  }).catch(() => {});

  settingsModal.classList.add('hidden');
  updateVisuals();

  if (needsReconnect) {
    addSystemPill(`🔄 설정 적용 중 (${newVoice})...`);
    stopAllAiAudio();
    if (ws) {
      try { ws.close(1000, 'Applying new settings'); } catch (e) {}
    }
    state.reconnectAttempts = 0;
    try {
      await connectLiveWebSocket(true);
      addSystemPill(`✅ ${newVoice} 목소리로 즉시 전환되었습니다!`);
    } catch (e) {
      addSystemPill(`⚠️ 재연결 실패: ${e.message}`);
    }
  }
});

// Google Drive Test
if (testGdriveBtn) {
  testGdriveBtn.addEventListener('click', async () => {
    const url = gdriveWebhookInput.value.trim();
    if (!url) return alert('구글 앱스 스크립트 웹앱 URL을 입력해 주세요.');
    testGdriveBtn.textContent = '연결 중...';
    try {
      const res = await fetch('/api/sync-gdrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'Google Drive Connection Test',
          corrections: [{ original: 'I eat medicine', corrected: 'I took some medicine', explanation: '구글 드라이브 연동 테스트' }],
          fullTranscript: 'Me: Testing Drive sync.\nPuck: Connected and ready!',
          webhookUrl: url
        })
      });
      const data = await res.json();
      if (data.success || data.message) {
        state.gdriveWebhookUrl = url;
        localStorage.setItem('gdrive_webhook_url', url);
        gdriveStatusText.innerHTML = '✅ <span style="color:#4ade80;">구글 드라이브 연동 성공!</span>';
        alert('🎉 구글 드라이브 [영어 회화] 폴더 연동 성공!');
      } else {
        alert('연동 실패: ' + (data.error || 'URL과 권한을 확인해 주세요.'));
      }
    } catch (err) {
      alert('연동 오류: ' + err.message);
    } finally {
      testGdriveBtn.textContent = '연결 테스트';
    }
  });
}

// Notes Modal
notesBtn.addEventListener('click', () => {
  renderMasterNotes();
  notesModal.classList.remove('hidden');
});
closeNotesBtn.addEventListener('click', () => notesModal.classList.add('hidden'));
closeNotesBtn2.addEventListener('click', () => notesModal.classList.add('hidden'));

copyNotesBtn.addEventListener('click', () => {
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem('master_review_notes') || '[]'); } catch (e) {}
  if (!notes.length) return alert('복사할 표현이 없습니다.');

  let md = `# 📚 누적 복습 마스터 표현 노트\n\n`;
  notes.forEach((n, i) => {
    md += `${i + 1}. ${n.original || '-'} ➔ ${n.corrected}\n   💡 ${n.explanation || '-'}\n\n`;
  });
  navigator.clipboard.writeText(md)
    .then(() => alert('📋 클립보드에 복사되었습니다!'))
    .catch(() => alert('복사 권한 오류'));
});

// ==============================================================================
// 🧠 AI Long-Term Memory & User Persona Engine
// Continuously learns from conversations and remembers user facts across sessions
// ==============================================================================
async function triggerContinuousMemoryLearning() {
  if (state.messages.length < 2) return;
  const transcript = state.messages
    .map(m => `${m.role === 'user' ? 'Me' : state.voice}: ${m.text}`)
    .join('\n\n');

  try {
    const res = await fetch('/api/learn-user-memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        apiKey: state.apiKey
      })
    });
    const data = await res.json();
    if (data.success && data.profile) {
      state.userProfile = data.profile;
      localStorage.setItem('user_persona_memory', JSON.stringify(data.profile));
      console.log('[AI Memory] User profile learned and updated!');
    }
  } catch (e) {
    console.warn('[AI Memory Learning Warning]:', e.message);
  }
}

function renderUserProfileMemory() {
  const profile = state.userProfile || {};

  // 1. Interests
  if (memInterestsContainer) {
    const interests = profile.interests || [];
    memInterestsContainer.innerHTML = interests.length > 0
      ? interests.map(item => `<span class="mem-tag">💡 ${escapeHtml(item)}</span>`).join('')
      : `<span style="color:#9ca3af;font-size:12px;">아직 기록된 관심사가 없습니다.</span>`;
  }

  // 2. Personal Facts
  if (memFactsContainer) {
    const facts = profile.personalFacts || [];
    memFactsContainer.innerHTML = facts.length > 0
      ? facts.map(f => `<div class="mem-list-item">${escapeHtml(f)}</div>`).join('')
      : `<span style="color:#9ca3af;font-size:12px;">대화에서 AI가 자동으로 파악합니다.</span>`;
  }

  // 3. Preferences
  if (memPrefsContainer) {
    const prefs = profile.learningPreferences || [];
    memPrefsContainer.innerHTML = prefs.length > 0
      ? prefs.map(p => `<div class="mem-list-item">${escapeHtml(p)}</div>`).join('')
      : `<span style="color:#9ca3af;font-size:12px;">학습 및 대화 스타일을 분석 중입니다.</span>`;
  }

  // 4. Recent Memories
  if (memRecentContainer) {
    const memories = profile.recentMemories || [];
    memRecentContainer.innerHTML = memories.length > 0
      ? memories.map(m => `<div class="mem-list-item">${escapeHtml(m)}</div>`).join('')
      : `<span style="color:#9ca3af;font-size:12px;">최근 나눈 주요 대화가 여기에 누적됩니다.</span>`;
  }
}

async function addMemoryFact() {
  const userFact = prompt('AI 친구에게 나에 대해 알려주고 싶은 내용을 적어주세요!\n(예: 저는 판교에서 IT 개발자로 일해요 / 강아지를 키워요 / 다음 달에 미국 여행을 가요):');
  if (!userFact || !userFact.trim()) return;

  const clean = userFact.trim();
  const current = state.userProfile || {};
  const updatedFacts = [...(current.personalFacts || []), clean];

  try {
    const res = await fetch('/api/user-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personalFacts: updatedFacts })
    });
    const data = await res.json();
    if (data.success && data.profile) {
      state.userProfile = data.profile;
      localStorage.setItem('user_persona_memory', JSON.stringify(data.profile));
      renderUserProfileMemory();
      alert('🎉 새로운 기억이 저장되었습니다! 다음 대화부터 AI 친구가 이 내용을 자연스럽게 알고 대화합니다.');
    }
  } catch (e) {
    alert('기억 저장 실패: ' + e.message);
  }
}

// Memory Modal Wiring
if (memoryBtn) {
  memoryBtn.addEventListener('click', () => {
    renderUserProfileMemory();
    if (memoryModal) memoryModal.classList.remove('hidden');
  });
}
if (closeMemoryBtn) closeMemoryBtn.addEventListener('click', () => memoryModal.classList.add('hidden'));
if (closeMemoryBtn2) closeMemoryBtn2.addEventListener('click', () => memoryModal.classList.add('hidden'));
if (addMemoryFactBtn) addMemoryFactBtn.addEventListener('click', addMemoryFact);

// Resume Banner Wiring
if (resumeCallBtn) {
  resumeCallBtn.addEventListener('click', () => {
    if (resumeBanner) resumeBanner.classList.add('hidden');
    startSession(true); // resume existing session!
  });
}
if (discardResumeBtn) {
  discardResumeBtn.addEventListener('click', () => {
    if (resumeBanner) resumeBanner.classList.add('hidden');
    sessionStorage.removeItem('english_friend_active_session');
    endSession(false);
  });
}

function checkSecureContext() {
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!window.isSecureContext && !isLocal && insecureBanner) {
    insecureBanner.classList.remove('hidden');
  }
}

if (skipDrillBtn) {
  skipDrillBtn.addEventListener('click', dismissDrill);
}

// Auto-sync to Google Drive when tab closes or changes visibility
window.addEventListener('beforeunload', () => {
  if (state.sessionActive && state.messages.length > 0 && state.gdriveWebhookUrl) {
    const fullTranscript = state.messages
      .map(m => `${m.role === 'user' ? 'Me' : state.voice}: ${m.text}`)
      .join('\n\n');
    const payload = JSON.stringify({
      topic: state.currentTopic || 'English Conversation',
      corrections: state.corrections,
      fullTranscript,
      webhookUrl: state.gdriveWebhookUrl,
      date: new Date().toISOString().split('T')[0]
    });
    try {
      navigator.sendBeacon('/api/sync-gdrive', new Blob([payload], { type: 'application/json' }));
    } catch (e) {}
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  loadConfig();
  checkSecureContext();
  updateVisuals();

  // Load User Persona Memory
  try {
    const res = await fetch('/api/user-profile');
    const profile = await res.json();
    if (profile && profile.personalFacts) {
      state.userProfile = profile;
      localStorage.setItem('user_persona_memory', JSON.stringify(profile));
    }
  } catch (e) {
    try {
      state.userProfile = JSON.parse(localStorage.getItem('user_persona_memory') || '{}');
    } catch (err) {}
  }

  // Restore Active Session if user refreshed or navigated back within 1 hour
  try {
    const savedRaw = sessionStorage.getItem('english_friend_active_session');
    if (savedRaw) {
      const saved = JSON.parse(savedRaw);
      if (saved && saved.messages && saved.messages.length > 0 && (Date.now() - (saved.timestamp || 0)) < 3600000) {
        state.currentTopic = saved.topic || '';
        state.messages = saved.messages;
        state.corrections = saved.corrections || [];
        if (saved.voice) state.voice = saved.voice;

        welcomeHero.classList.add('hidden');
        chatMessages.innerHTML = '';
        saved.messages.forEach(m => {
          const row = document.createElement('div');
          row.className = `msg-row ${m.role === 'user' ? 'user' : 'ai'}`;
          const avatarLetter = (state.voice || 'P')[0].toUpperCase();
          row.innerHTML = `
            <div class="msg-meta">
              ${m.role === 'user' ? '<span class="msg-sender">Me</span>' : `<span class="msg-avatar">${escapeHtml(avatarLetter)}</span><span class="msg-sender">${escapeHtml(state.voice)}</span>`}
            </div>
            <div class="msg-bubble">${escapeHtml(m.text)}</div>
          `;
          chatMessages.appendChild(row);
        });

        showResumeBanner();
      }
    }
  } catch (e) {}

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});

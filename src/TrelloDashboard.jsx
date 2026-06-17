import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Kanban, 
  Play, 
  Square, 
  Volume2, 
  VolumeX, 
  BellRing, 
  CheckCircle2, 
  AlertTriangle,
  Settings2,
  Upload,
  Activity
} from 'lucide-react';

const API_KEY = '4a2f87929257d1557d800be137588c07';
const MAX_BUCKETS = 10;

// Inline Worker Code to completely bypass Vite/Esbuild build pipeline and file resolution errors
const WORKER_CODE = `
let intervalId = null;
let listStates = {}; 
let apiKey = '';
let token = '';

const POLL_INTERVAL = 15000; 

const IGNORED_KEYWORDS = [
    "Out of Office",
    "Training",    
    "Innovation",  
    "Divider",
    "Analyst"
];

self.onmessage = async function(e) {
    const { cmd, payload } = e.data;
    
    if (cmd === 'start') {
        apiKey = payload.apiKey;
        token = payload.token;
        const targets = payload.targets;
        
        if (intervalId) clearInterval(intervalId);
        listStates = {};
        
        startLoop(targets);
    } 
    else if (cmd === 'stop') {
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
        listStates = {};
        postMessage({ type: 'log', msg: 'Worker stopped.' });
    }
};

function shouldIgnore(cardName) {
    if (!cardName) return true;
    const cleanName = cardName.trim().toLowerCase();
    
    const hasBasicKeyword = IGNORED_KEYWORDS.some(keyword => 
        cleanName.includes(keyword.toLowerCase())
    );
    if (hasBasicKeyword) return true;

    // GUARDIAN: Advanced Regex Filtering
    if (/test/i.test(cardName)) return true;
    if (/ignore/i.test(cardName)) return true;
    if (/\\bdemo\\b/i.test(cardName)) return true;

    return false;
}

async function trelloFetch(url) {
    const response = await fetch(url + '?key=' + apiKey + '&token=' + token);
    if (response.status === 401) throw new Error('Unauthorized');
    if (!response.ok) throw new Error('API Error: ' + response.status);
    return await response.json();
}

async function startLoop(targets) {
    postMessage({ type: 'log', msg: 'Worker started. Monitoring ' + targets.length + ' lists...' });

    const checkLists = async (isFirstRun = false) => {
        let globalTotal = 0;
        let bucketStats = [];
        let alarmTriggered = false;

        const fetchPromises = targets.map(async (target) => {
            try {
                const rawCards = await trelloFetch('https://api.trello.com/1/lists/' + target.id + '/cards');
                return { success: true, target: target, rawCards: rawCards };
            } catch (error) {
                return { success: false, target: target, error: error };
            }
        });

        const results = await Promise.all(fetchPromises);

        for (const result of results) {
            if (!result.success) {
                if (result.error.message === 'Unauthorized') {
                    clearInterval(intervalId);
                    postMessage({ type: 'auth_fail' });
                    return; 
                }
                postMessage({ type: 'log', msg: 'Sync error on ' + result.target.name + ': ' + result.error.message, isError: true });
                continue;
            }

            const target = result.target;
            const rawCards = result.rawCards;

            const activeCards = rawCards.filter(c => !shouldIgnore(c.name));
            const currentSet = new Set(activeCards.map(c => c.id));
            const previousSet = listStates[target.id] || new Set();

            if (!isFirstRun && !alarmTriggered) {
                const newCard = activeCards.find(c => !previousSet.has(c.id));
                
                if (newCard) {
                    postMessage({ 
                        type: 'alarm', 
                        cardName: newCard.name, 
                        listName: target.name 
                    });
                    alarmTriggered = true; 
                }
            }

            listStates[target.id] = currentSet;
            const count = currentSet.size;
            globalTotal += count;
            bucketStats.push({
                id: target.id,
                name: target.name,
                count: count
            });
        }

        postMessage({ 
            type: 'stats', 
            total: globalTotal,
            buckets: bucketStats 
        });
    };

    await checkLists(true);

    intervalId = setInterval(() => {
        checkLists(false);
    }, POLL_INTERVAL);
}
`;

export default function TrelloDashboard() {
  // --- CORE STATE ---
  const [trelloToken, setTrelloToken] = useState(localStorage.getItem('watcher_trello_token') || null);
  const [boards, setBoards] = useState([]);
  const [selectedBoard, setSelectedBoard] = useState(localStorage.getItem('watcher_board_id') || '');
  const [lists, setLists] = useState([]);
  const [selectedBuckets, setSelectedBuckets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('watcher_bucket_ids')) || []; } 
    catch { return []; }
  });
  
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [gridStats, setGridStats] = useState({ total: 0, buckets: [] });
  const [isLoading, setIsLoading] = useState(false);

  // --- AUDIO & PREFERENCES STATE ---
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [alertMode, setAlertMode] = useState(localStorage.getItem('watcher_mode') || 'wake');
  const [tone, setTone] = useState(localStorage.getItem('watcher_tone_wake') || 'default');
  const [stealthEnabled, setStealthEnabled] = useState(localStorage.getItem('watcher_stealth') !== 'false');
  const [customAudioUrl, setCustomAudioUrl] = useState(localStorage.getItem('watcher_custom_sound') || null);

  // Alarm State
  const [alarmActive, setAlarmActive] = useState(false);
  const [alarmData, setAlarmData] = useState({ cardName: '', listName: '' });
  const [isTesting, setIsTesting] = useState(false);

  // --- REFS (For Audio & Worker) ---
  const workerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);
  const customAudioRef = useRef(null);
  const wakeLockRef = useRef(null);
  const alarmTimeouts = useRef([]);

  // Silent Keep-Alive Refs
  const silentOscillatorRef = useRef(null);
  const silentGainRef = useRef(null);

  // File input ref for custom sound upload
  const fileInputRef = useRef(null);

  // --- 1. AUTHENTICATION & INITIAL LOAD ---
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    if (params.has('token')) {
      const token = params.get('token');
      localStorage.setItem('watcher_trello_token', token);
      setTrelloToken(token);
      window.location.hash = ''; 
    }
  }, []);

  useEffect(() => {
    if (trelloToken) fetchBoards();
  }, [trelloToken]);

  useEffect(() => {
    if (selectedBoard && trelloToken) fetchLists(selectedBoard);
  }, [selectedBoard, trelloToken]);

  useEffect(() => {
    return () => {
      stopMonitoring();
      stopAlarm();
      stopSilentNoise();
    };
  }, []);

  // Sync Stealth Mode toggle while monitoring
  useEffect(() => {
    if (isMonitoring) {
      if (stealthEnabled) startSilentNoise();
      else stopSilentNoise();
    }
  }, [stealthEnabled, isMonitoring]);

  // --- 2. API CALLS ---
  const authorizeTrello = () => {
    const returnUrl = window.location.href;
    const authUrl = `https://trello.com/1/authorize?expiration=never&name=CommandCenterWatcher&scope=read&response_type=token&key=${API_KEY}&return_url=${encodeURIComponent(returnUrl)}`;
    window.location.href = authUrl;
  };

  const trelloFetch = async (url) => {
    const res = await fetch(`${url}?key=${API_KEY}&token=${trelloToken}`);
    if (res.status === 401) {
      handleLogout();
      throw new Error('Unauthorized');
    }
    if (!res.ok) throw new Error('API Error');
    return res.json();
  };

  const fetchBoards = async () => {
    setIsLoading(true);
    try {
      const data = await trelloFetch('https://api.trello.com/1/members/me/boards');
      setBoards(data);
      if (!selectedBoard) {
        const defaultBoard = data.find(b => b.name.toLowerCase().includes('actuarial reports'));
        if (defaultBoard) {
          setSelectedBoard(defaultBoard.id);
          localStorage.setItem('watcher_board_id', defaultBoard.id);
        }
      }
    } catch (err) {
      console.error(err);
    }
    setIsLoading(false);
  };

  const fetchLists = async (boardId) => {
    try {
      const data = await trelloFetch(`https://api.trello.com/1/boards/${boardId}/lists`);
      setLists(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('watcher_trello_token');
    setTrelloToken(null);
    stopMonitoring();
  };

  const handleBucketToggle = (listId) => {
    let newSelection = [...selectedBuckets];
    if (newSelection.includes(listId)) {
      newSelection = newSelection.filter(id => id !== listId);
    } else {
      if (newSelection.length >= MAX_BUCKETS) {
        alert(`Maximum ${MAX_BUCKETS} buckets allowed.`);
        return;
      }
      newSelection.push(listId);
    }
    setSelectedBuckets(newSelection);
    localStorage.setItem('watcher_bucket_ids', JSON.stringify(newSelection));
  };

  const handleModeChange = (mode) => {
    setAlertMode(mode);
    localStorage.setItem('watcher_mode', mode);
    
    // Auto-switch to appropriate saved tone
    const newTone = (mode === 'wake') 
      ? (localStorage.getItem('watcher_tone_wake') || 'default') 
      : (localStorage.getItem('watcher_tone_notify') || 'sounds/message_my_lord.mp3');
    setTone(newTone);
  };

  const handleToneChange = (e) => {
    const value = e.target.value;
    if (value === 'custom_upload') {
      fileInputRef.current?.click();
      return; // Wait for upload
    }

    setTone(value);
    if (alertMode === 'wake') localStorage.setItem('watcher_tone_wake', value);
    else localStorage.setItem('watcher_tone_notify', value);

    // Preload audio - GUARDIAN: Using relative path ./ to ensure it works on GitHub Pages
    if (value !== 'default' && value !== 'custom') {
      const audio = new Audio(`./${value}`);
      audio.load();
    }
  };

  const handleSoundUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Max file size is 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const result = ev.target.result;
          localStorage.setItem('watcher_custom_sound', result);
          setCustomAudioUrl(result);
          setTone('custom');
          if (alertMode === 'wake') localStorage.setItem('watcher_tone_wake', 'custom');
          else localStorage.setItem('watcher_tone_notify', 'custom');
        } catch (err) {
          alert("Storage full or file too large.");
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = ''; // Reset input
  };

  const handleStealthToggle = () => {
    const newState = !stealthEnabled;
    setStealthEnabled(newState);
    localStorage.setItem('watcher_stealth', newState);
  };

  // --- 3. MONITORING LOGIC ---
  const startMonitoring = async () => {
    if (selectedBuckets.length === 0) {
      alert("Please select at least one list to watch.");
      return;
    }

    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }

    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch (err) { console.warn("Wake lock failed", err); }

    if (stealthEnabled) {
      startSilentNoise();
    }

    const targets = lists
      .filter(l => selectedBuckets.includes(l.id))
      .map(l => ({ id: l.id, name: l.name }));

    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    workerRef.current = new Worker(workerUrl);
    
    workerRef.current.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'auth_fail') {
        handleLogout();
      } else if (data.type === 'stats') {
        setGridStats({ total: data.total, buckets: data.buckets });
      } else if (data.type === 'alarm') {
        setSoundEnabled(currentSoundState => {
          if (currentSoundState) {
            triggerAlarm(data.cardName, data.listName);
          }
          return currentSoundState;
        });
      }
    };

    workerRef.current.postMessage({
      cmd: 'start',
      payload: { apiKey: API_KEY, token: trelloToken, targets }
    });

    setIsMonitoring(true);
  };

  const stopMonitoring = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ cmd: 'stop' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(()=>{});
      wakeLockRef.current = null;
    }
    stopSilentNoise();
    setIsMonitoring(false);
    setGridStats({ total: 0, buckets: [] });
    stopAlarm();
  };

  // --- GUARDIAN: 30HZ STEALTH KEEP-ALIVE ---
  const startSilentNoise = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();

      const osc = audioCtxRef.current.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 30; // 30Hz - Inaudible to most human ears and speakers

      const gain = audioCtxRef.current.createGain();
      gain.gain.value = 0.01; // Just enough for browser to register audio activity

      osc.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      osc.start();

      silentOscillatorRef.current = osc;
      silentGainRef.current = gain;
    } catch (e) {
      console.error("Silent Noise Failed", e);
    }
  };

  const stopSilentNoise = () => {
    if (silentOscillatorRef.current) {
      try { silentOscillatorRef.current.stop(); silentOscillatorRef.current.disconnect(); } catch(e){}
      silentOscillatorRef.current = null;
    }
    if (silentGainRef.current) {
      try { silentGainRef.current.disconnect(); } catch(e){}
      silentGainRef.current = null;
    }
  };

  // --- 4. AUDIO & ALARMS ---
  const triggerAlarm = (cardName, listName) => {
    setAlarmData({ cardName, listName });
    setAlarmActive(true);
    
    const shouldLoop = (alertMode === 'wake');
    playAudio(shouldLoop);

    if (alertMode === 'wake') {
      alarmTimeouts.current.push(setTimeout(() => {
        stopSoundOnly();
        alarmTimeouts.current.push(setTimeout(() => {
          playAudio(true);
          alarmTimeouts.current.push(setTimeout(() => {
            stopAlarm();
          }, 180000));
        }, 30000));
      }, 180000));
    } else {
      alarmTimeouts.current.push(setTimeout(() => {
        stopAlarm();
      }, 5000));
    }
  };

  const toggleTestSound = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();

    if (isTesting || alarmActive) {
      stopAlarm();
      setIsTesting(false);
    } else {
      setIsTesting(true);
      const shouldLoop = (alertMode === 'wake');
      playAudio(shouldLoop);
      if (!shouldLoop) {
        setTimeout(() => {
          setIsTesting(false);
        }, 4000);
      }
    }
  };

  const playAudio = (loop) => {
    stopSoundOnly();
    try {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }

      let audioSrc = null;
      if (tone === 'custom' && customAudioUrl) {
        audioSrc = customAudioUrl;
      } else if (tone !== 'default') {
        // GUARDIAN: Using relative path ./ to ensure it works on GitHub Pages
        audioSrc = `./${tone}`;
      }

      // MP3 Engine
      if (audioSrc) {
        const audio = new Audio(audioSrc);
        audio.loop = loop;
        customAudioRef.current = audio;
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            if (e.name !== 'AbortError') {
              console.warn("MP3 Audio failed, falling back to synth", e);
              playSynth(loop);
            }
          });
        }
      } else {
        // Synth Engine Fallback (Default)
        playSynth(loop);
      }
    } catch (err) {
      console.error("Audio Dispatch Error", err);
    }
  };

  const playSynth = (loop) => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (loop) {
        gainNode.gain.value = 0.15;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.start();
        osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.5);
        
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 2;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 300;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start();
        
        oscillatorRef.current = osc;
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
        osc.start();
        osc.stop(ctx.currentTime + 1);
      }
    } catch (e) {
      console.error("Synth Error", e);
    }
  };

  const stopSoundOnly = () => {
    if (customAudioRef.current) {
      try { customAudioRef.current.pause(); customAudioRef.current.currentTime = 0; } catch(e){}
      customAudioRef.current = null;
    }
    if (oscillatorRef.current) {
      try { oscillatorRef.current.stop(); oscillatorRef.current.disconnect(); } catch(e){}
      oscillatorRef.current = null;
    }
  };

  const stopAlarm = () => {
    setAlarmActive(false);
    alarmTimeouts.current.forEach(clearTimeout);
    alarmTimeouts.current = [];
    setIsTesting(false);
    stopSoundOnly();
  };

  // --- RENDERERS ---
  if (!trelloToken) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 max-w-md w-full">
          <Kanban className="w-16 h-16 text-blue-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Trello Watcher</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
            To securely monitor your private boards, authorize this module with Trello. Connection happens directly in your browser.
          </p>
          <button 
            onClick={authorizeTrello}
            className="w-full bg-[#0052CC] hover:bg-[#0047b3] text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all"
          >
            Authorize with Trello
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden relative">
      
      {/* ALARM OVERLAY */}
      {alarmActive && (
        <div className="absolute inset-0 z-50 bg-rose-900/90 backdrop-blur-md flex flex-col items-center justify-center text-white p-8 animate-pulse">
          <AlertTriangle className="w-24 h-24 text-rose-400 mb-6" />
          <h1 className="text-5xl font-black mb-2 text-center text-rose-100">ALARM TRIGGERED</h1>
          <p className="text-xl text-rose-200 mb-8 tracking-widest uppercase">Incoming to: <span className="font-bold text-white">{alarmData.listName}</span></p>
          
          <div className="bg-rose-950 p-6 rounded-2xl border-2 border-rose-500 mb-12 max-w-xl w-full text-center shadow-2xl">
            <h2 className="text-2xl font-bold">{alarmData.cardName}</h2>
          </div>

          <button 
            onClick={stopAlarm}
            className="bg-white text-rose-900 font-black text-xl py-4 px-12 rounded-full shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:scale-105 transition-transform"
          >
            ACKNOWLEDGE
          </button>
        </div>
      )}

      {/* TOP BAR / CONTROLS */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg text-blue-600 dark:text-blue-400">
            <Kanban className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 dark:text-slate-100">Board Monitor</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isMonitoring ? 'Scanning active targets...' : 'Configure your targets'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-lg transition-colors ${soundEnabled ? 'text-amber-500 bg-amber-50 dark:bg-amber-500/10' : 'text-slate-400 bg-slate-100 dark:bg-slate-700'}`}
            title="Toggle Sound"
          >
            {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>

          {!isMonitoring ? (
            <button 
              onClick={startMonitoring}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Play size={18} fill="currentColor" /> Start Watching
            </button>
          ) : (
            <button 
              onClick={stopMonitoring}
              className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-rose-500/20 transition-all animate-pulse"
            >
              <Square size={18} fill="currentColor" /> Stop
            </button>
          )}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-hidden flex gap-6">
        
        {/* LEFT COLUMN: SETUP */}
        <div className={`w-[360px] shrink-0 flex flex-col gap-6 overflow-y-auto pr-2 custom-scroll transition-opacity duration-300 ${isMonitoring ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">1. Select Board</label>
            <select 
              value={selectedBoard} 
              onChange={(e) => setSelectedBoard(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            >
              <option value="">-- Choose Board --</option>
              {boards.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shrink-0 flex flex-col">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              2. Select Buckets ({selectedBuckets.length}/{MAX_BUCKETS})
            </label>
            
            {isLoading ? (
              <div className="py-8 flex items-center justify-center text-sm text-slate-400">Loading lists...</div>
            ) : lists.length === 0 ? (
              <div className="py-8 flex items-center justify-center text-sm text-slate-400">Select a board above.</div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scroll">
                {lists.map(list => (
                  <label key={list.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${selectedBuckets.includes(list.id) ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-slate-50 dark:bg-slate-900/50 border-transparent hover:border-slate-200 dark:hover:border-slate-700'}`}>
                    <input 
                      type="checkbox" 
                      checked={selectedBuckets.includes(list.id)}
                      onChange={() => handleBucketToggle(list.id)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 line-clamp-1">{list.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* GUARDIAN: Advanced Audio Preferences restored from Legacy HTML */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
            <div className="flex items-center gap-2 mb-4">
               <Settings2 className="text-amber-500 w-4 h-4" />
               <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">3. Advanced Alert Prefs</span>
            </div>

            <div className="mb-4">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Alert Mode</label>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleModeChange('wake')} 
                  className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-colors ${alertMode === 'wake' ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400' : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700'}`}
                >
                  Wake (Loop)
                </button>
                <button 
                  onClick={() => handleModeChange('notify')} 
                  className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-colors ${alertMode === 'notify' ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400' : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700'}`}
                >
                  Notify (Once)
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Audio File / Tone</label>
              <div className="flex gap-2">
                <select 
                  value={tone}
                  onChange={handleToneChange}
                  className="flex-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
                >
                  <option value="default">Default Siren (Synth)</option>
                  <option value="sounds/message_tone.mp3">Message Tone</option>
                  <option value="sounds/message_messaaaaaage.mp3">Message... Message!</option>
                  <option value="sounds/message_my_lord.mp3">Message My Lord</option>
                  <option value="sounds/email_notification.mp3">Email Notification</option>
                  <option value="sounds/bottle_opener.mp3">Bottle Opener</option>
                  <option value="sounds/carlock.mp3">Car Lock</option>
                  <option value="sounds/doorbell.mp3">Doorbell</option>
                  <option value="sounds/zap.mp3">Zap</option>
                  <option value="sounds/just_calledf__k_u.mp3">Just Called...</option>
                  <option value="sounds/ping.mp3">Ping</option>
                  <option value="sounds/notification.mp3">Simple Notification</option>
                  <option value="sounds/sneeze.mp3">Sneeze</option>
                  <option value="sounds/wahwahwahwahhh.mp3">Wah Wah Wah</option>
                  {customAudioUrl && <option value="custom">Custom Saved Upload</option>}
                  <option value="custom_upload">Upload New Audio...</option>
                </select>
                <input type="file" accept="audio/*" ref={fileInputRef} className="hidden" onChange={handleSoundUpload} />

                <button 
                  onClick={toggleTestSound}
                  className={`px-3 rounded-lg font-bold text-white transition-all shadow-sm ${isTesting ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                  title="Test Alert Tone"
                >
                  {isTesting ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
               <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                    <Activity size={14} className="text-blue-500" /> Stealth Keep-Alive
                  </div>
                  <div className="text-[9px] text-slate-400 mt-0.5 max-w-[200px] leading-tight">
                    Plays a silent 30Hz tone to prevent the browser from sleeping while tabbed out.
                  </div>
               </div>
               
               <button 
                 onClick={handleStealthToggle}
                 className={`w-10 h-6 rounded-full transition-colors relative ${stealthEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
               >
                 <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${stealthEnabled ? 'left-5' : 'left-1'}`} />
               </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SMART GRID */}
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden relative">
          
          {/* Status Header */}
          <div className="p-6 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/20">
            <div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">Live Grid</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Cards: <span className="font-black text-blue-500">{gridStats.total}</span></p>
            </div>
            {isMonitoring && (
              <div className="flex items-center gap-2 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full text-xs font-bold tracking-wider">
                <CheckCircle2 size={14} /> SCANNING
              </div>
            )}
          </div>

          {/* Grid Area */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-100/50 dark:bg-slate-900/50">
            {!isMonitoring ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <Kanban className="w-16 h-16 mb-4 opacity-20" />
                <p>Press "Start Watching" to activate the Smart Grid.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-max">
                {gridStats.buckets.map(b => (
                  <div key={b.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center text-center transition-transform hover:scale-105">
                    <span className="text-3xl font-black text-blue-500 mb-1">{b.count}</span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider line-clamp-2 leading-tight">{b.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
        </div>
      </div>

    </div>
  );
}
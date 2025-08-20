// Soniditos con WebAudio (sin archivos). Export simple API.
let ctx;
let muted = JSON.parse(localStorage.getItem('bc_muted') || 'false');

function ac() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); return ctx; }

function beep({freq=440, duration=0.1, type='sine', gain=0.06}={}){
  if (muted) return;
  const actx = ac();
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = type; osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g); g.connect(actx.destination);
  osc.start();
  osc.stop(actx.currentTime + duration);
}

export const Sound = {
  click(){ beep({freq:520, duration:0.06, type:'square'}); },
  turn(){ beep({freq:660, duration:0.08, type:'sine'}); },
  success(){ beep({freq:880, duration:0.15, type:'triangle', gain:0.08}); },
  minor(){ beep({freq:620, duration:0.07, type:'triangle'}); },
  lose(){ beep({freq:260, duration:0.25, type:'sawtooth', gain:0.07}); },
  timeout(){ beep({freq:220, duration:0.12, type:'sine'}); },
  isMuted(){ return muted; },
  setMuted(v){ muted = !!v; localStorage.setItem('bc_muted', JSON.stringify(muted)); },
  toggleMuted(){ Sound.setMuted(!muted); return muted; }
};

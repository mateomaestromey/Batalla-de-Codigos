import { firebaseConfig } from './firebase-config.js';
import { Sound } from './sound.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, onSnapshot, collection, query, orderBy,
  addDoc, updateDoc, serverTimestamp, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Anti-mezcla
if(!document.getElementById('tryBtn') || !document.getElementById('resetBtn')){
  console.warn('Script de juego ejecutado fuera de juego.html — abortando'); throw new Error('Wrong page');
}

// ==== Parámetros del contador (podés ajustar) ====
const TURN_SECONDS = 30;            // segundos por turno
const AUTO_PASS_ON_TIMEOUT = false; // si true, pasa el turno solo (no recomiendo por ahora)

// Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await signInAnonymously(auth);

// DOM
const $ = (q)=>document.querySelector(q);
const hdr = $('#hdr'), h1=$('#h1'), h2=$('#h2'), hist1=$('#hist1'), hist2=$('#hist2');
const panel1 = $('#panel1'), panel2 = $('#panel2');
const turnName=$('#turnName'), statusEl=$('#status'), guessEl=$('#guess'), tryBtn=$('#tryBtn'), playErr=$('#playError'), resultArea=$('#resultArea'), resetBtn=$('#resetBtn');
const btnTJ1 = $('#toggleJ1'), btnTJ2 = $('#toggleJ2');
const helpBtn = $('#helpBtn'), helpModal = $('#helpModal'), closeHelp = $('#closeHelp');
const soundBtn = $('#soundBtn');
const timer = $('#timer'), timerBar = $('#timerBar'), timerText = $('#timerText');

// Estado local
const saved = JSON.parse(sessionStorage.getItem('bc_remote') || 'null');
if(!saved || !saved.roomId || !saved.mySecret || !saved.myRole){ location.href='index.html'; }
const roomId = saved.roomId, myRole = saved.myRole, mySecret = saved.mySecret;
hdr.textContent = `Sala ${roomId} – Sos ${myRole.toUpperCase()}`;

const roomRef = doc(db, 'rooms', roomId);
const guessesCol = collection(db, 'rooms', roomId, 'guesses');

let room = { p1Name:'Jugador 1', p2Name:'Jugador 2', p1Joined:false, p2Joined:false, currentTurn:'p1', starter:'p1', finished:false, firstWinner:null, capAttempts:null, winner:null, p1Secret:null, p2Secret:null };
try { await updateDoc(roomRef, myRole==='p1' ? { p1Joined:true } : { p2Joined:true }); } catch(e){}

let myTries = 0, otherTries = 0;
let postedWinnerSecret = false;
let lastTurn = null;

// Input
const only4 = s => /^\d{4}$/.test(s);
guessEl.addEventListener('input', ()=>{ guessEl.value = guessEl.value.replace(/\D/g,'').slice(0,4); });

// UI helpers
function setStatus(msg){ statusEl.textContent = msg; }
function setTurnUI(){ turnName.textContent = room.currentTurn==='p1' ? (room.p1Name||'Jugador 1') : (room.p2Name||'Jugador 2'); }
function bothJoined(){ return !!(room.p1Joined && room.p2Joined); }
function enableTry(){ tryBtn.disabled = room.finished || !bothJoined() || room.currentTurn !== myRole; }

// Historial
function appendHistory(player, guessStr, aciertos, isWin){
  const host = player===1 ? hist1 : hist2;
  const row = document.createElement('div'); row.className='tileRow';
  const digits = document.createElement('div'); digits.className='digits'; if(isWin) digits.classList.add('win');
  for(let i=0;i<4;i++){ const d=document.createElement('div'); d.className='digit'; d.textContent=guessStr[i]; digits.appendChild(d); }
  const badge=document.createElement('span'); badge.className='badge'; badge.textContent = `Aciertos: ${aciertos}`;
  row.appendChild(digits); row.appendChild(badge); host.prepend(row);
}

// Resultado
function endGame(type, details=''){
  tryBtn.disabled = true; guessEl.disabled = true;
  const box = document.createElement('div');
  if(type==='draw'){ box.className='draw'; box.textContent = `¡Empate! ${details}`; }
  else {
    box.className='winner';
    const n = type==='p1' ? (room.p1Name||'Jugador 1') : (room.p2Name||'Jugador 2');
    box.textContent = `¡${n} gana! ${details}`;
  }
  resultArea.innerHTML=''; resultArea.appendChild(box);
  if(type==='draw') Sound.minor(); else (type===myRole ? Sound.success() : Sound.lose());
}

function showReveal(code, name){
  const r = document.createElement('div');
  r.className='reveal';
  r.textContent = `El código de ${name} era: ${code}`;
  resultArea.appendChild(r);
}

// ===== Contador de turno =====
let tInterval = null;
function resetTimerUI(){ timerBar.style.width = '0%'; timerText.textContent = '—'; }
function startTurnTimer(){
  clearInterval(tInterval);
  if (!bothJoined() || room.finished){ resetTimerUI(); return; }
  let rem = TURN_SECONDS;
  timerBar.style.width = '100%'; // arranca lleno y baja
  timerText.textContent = `${rem}s`;
  tInterval = setInterval(async ()=>{
    rem--;
    const pct = Math.max(0, (rem / TURN_SECONDS) * 100);
    timerBar.style.width = pct + '%';
    timerText.textContent = `${Math.max(0,rem)}s`;
    if (rem <= 5 && rem > 0) Sound.timeout();
    if (rem <= 0){
      clearInterval(tInterval);
      Sound.timeout();
      if (AUTO_PASS_ON_TIMEOUT && bothJoined() && !room.finished && room.currentTurn === myRole){
        const next = (myRole==='p1') ? 'p2' : 'p1';
        try{ await updateDoc(roomRef, { currentTurn: next }); }catch{}
      }
    }
  }, 1000);
}

// ===== Suscripción a sala =====
onSnapshot(roomRef, snap=>{
  if(!snap.exists()) { setStatus('La sala no existe.'); tryBtn.disabled=true; return; }
  const data = snap.data();
  room = { ...room, ...data };

  h1.textContent = `Historial de ${room.p1Name||'Jugador 1'}`;
  h2.textContent = `Historial de ${room.p2Name||'Jugador 2'}`;
  setTurnUI();

  if(!bothJoined()){
    const falta = room.p1Joined ? (room.p2Name||'Jugador 2') : (room.p1Name||'Jugador 1');
    setStatus(`Esperando a que ${falta} se una…`);
  } else if(!room.finished){
    const quien = room.currentTurn==='p1' ? (room.p1Name||'Jugador 1') : (room.p2Name||'Jugador 2');
    setStatus(`Turno de ${quien}.`);
  }

  // cambio de turno -> sonido + reinicio contador
  if(lastTurn !== room.currentTurn){
    if (lastTurn !== null) Sound.turn();
    lastTurn = room.currentTurn;
    startTurnTimer();
  }

  // final
  if(room.finished){
    // ganador publica su secreto
    if(room.winner && room.winner === myRole && !postedWinnerSecret){
      const field = myRole === 'p1' ? 'p1Secret' : 'p2Secret';
      if(!room[field]){ updateDoc(roomRef, { [field]: mySecret }).catch(()=>{}); }
      postedWinnerSecret = true;
    }
    endGame(room.winner || 'draw');

    if(room.winner && room.winner !== myRole){
      const field = room.winner === 'p1' ? 'p1Secret' : 'p2Secret';
      const wName = room.winner === 'p1' ? (room.p1Name||'Jugador 1') : (room.p2Name||'Jugador 2');
      if(room[field]) showReveal(room[field], wName);
      else setStatus(`Esperando revelación del código de ${wName}…`);
    }
  }

  enableTry();
});

// ===== Suscripción a guesses =====
onSnapshot(query(guessesCol, orderBy('createdAt','asc')), (snap)=>{
  myTries = 0; otherTries = 0;
  hist1.innerHTML=''; hist2.innerHTML='';
  let myLastGuessMap = new Map(); // para detectar modificaciones con aciertos

  snap.forEach(docu=>{
    const g = docu.data();
    const player = g.owner==='p1' ? 1 : 2;
    if(g.owner===myRole) { myTries++; myLastGuessMap.set(docu.id, g); }
    else otherTries++;
    if(g.aciertos != null){ appendHistory(player, g.digits, g.aciertos, g.aciertos===4); }
  });

  // Sonido especial cuando MI intento pasa a 4 aciertos (doc cambiado)
  snap.docChanges().forEach(chg=>{
    if(chg.type === 'modified'){
      const g = { id: chg.doc.id, ...chg.doc.data() };
      if(g.owner===myRole && g.aciertos===4){ Sound.success(); }
      else if(g.owner===myRole && g.aciertos>0){ Sound.minor(); }
    }
  });

  // Resolver como defensor intentos nuevos
  snap.docChanges().forEach(async (chg)=>{
    if(chg.type!=='added') return;
    const g = { id: chg.doc.id, ...chg.doc.data() };
    const soyDefensor = (g.owner !== myRole);
    if(soyDefensor && g.aciertos == null){
      const a = countMatches(g.digits, mySecret);
      await updateDoc(doc(db, 'rooms', roomId, 'guesses', g.id), { aciertos: a });
      await applyGameLogicAfterDefense(g.owner, a, g.turnIndex);
    }
  });

  enableTry();
});

function countMatches(guess, secret){ let c=0; for(let i=0;i<4;i++) if(guess[i]===secret[i]) c++; return c; }

async function applyGameLogicAfterDefense(attackerRole, aciertos, turnIndex){
  const defenderRole = attackerRole==='p1' ? 'p2' : 'p1';
  const snap = await getDoc(roomRef);
  if(!snap.exists()) return;
  const r = snap.data();

  let update = {};
  const starter = r.starter || 'p1';
  const firstWinner = r.firstWinner || null;
  const cap = r.capAttempts || null;
  const finished = r.finished === true;
  if(finished) return;

  if(aciertos === 4){
    if(!firstWinner){
      update.firstWinner = attackerRole;
      if(attackerRole === starter){
        update.capAttempts = turnIndex;
        update.currentTurn = defenderRole;
      } else {
        update.finished = true; update.winner = attackerRole;
      }
    } else {
      const attemptsStarter = cap;
      const attemptsOther   = turnIndex;
      let winner;
      if(attemptsOther < attemptsStarter) winner = attackerRole;
      else if(attemptsOther === attemptsStarter) winner = 'draw';
      else winner = firstWinner;
      update.finished = true; update.winner = winner;
    }
  } else {
    if(cap){
      const second = (starter==='p1') ? 'p2' : 'p1';
      if(attackerRole === second && turnIndex >= cap){
        update.finished = true; update.winner = firstWinner || starter;
      }
    }
    if(!update.finished) update.currentTurn = defenderRole;
  }

  if(Object.keys(update).length){ await updateDoc(roomRef, update); }
}

// ===== Acciones =====
tryBtn.addEventListener('click', async ()=>{
  playErr.style.display='none';
  if(room.finished){ return; }
  if(!bothJoined()){ playErr.textContent='Esperá a que se una el otro jugador.'; playErr.style.display='block'; Sound.timeout(); return; }
  if(room.currentTurn !== myRole){ playErr.textContent='No es tu turno.'; playErr.style.display='block'; Sound.timeout(); return; }
  const g = (guessEl.value||'').trim();
  if(!only4(g)){ playErr.textContent='El intento debe tener 4 dígitos.'; playErr.style.display='block'; Sound.timeout(); return; }

  const turnIndex = myTries + 1;
  await addDoc(guessesCol, {
    owner: myRole, digits: g, aciertos: null, createdAt: serverTimestamp(), turnIndex
  });

  guessEl.value=''; guessEl.focus();
  Sound.click();
});

guessEl.addEventListener('keydown', e=>{ if(e.key==='Enter') tryBtn.click(); });

resetBtn.addEventListener('click', async ()=>{
  if(!confirm('¿Reiniciar la partida en esta sala?')) return;
  const q = await getDocs(query(guessesCol));
  const ops = []; q.forEach(d=> ops.push(deleteDoc(d.ref)));
  await Promise.all(ops);
  const snap = await getDoc(roomRef);
  const r = snap.data()||{};
  await updateDoc(roomRef, {
    finished:false, winner:null, firstWinner:null, capAttempts:null,
    currentTurn: r.starter || 'p1',
    p1Secret: null, p2Secret: null
  });
  hist1.innerHTML=''; hist2.innerHTML=''; resultArea.innerHTML='';
  myTries=0; otherTries=0;
  setStatus(`Partida reiniciada. Empieza ${ (r.starter||'p1')==='p1'?(r.p1Name||'Jugador 1'):(r.p2Name||'Jugador 2') }.`);
  tryBtn.disabled=false; guessEl.disabled=false; guessEl.value=''; guessEl.focus();
  Sound.click(); startTurnTimer();
});

// Switch/colapsables
function applyCollapsibleMode(){
  const mobile = window.matchMedia('(max-width: 900px)').matches;
  if(!mobile){
    panel1.classList.remove('collapsed','hidden');
    panel2.classList.remove('collapsed','hidden');
  }else{
    panel1.classList.remove('hidden'); panel2.classList.remove('hidden');
  }
}
applyCollapsibleMode();
window.addEventListener('resize', applyCollapsibleMode);
h1.addEventListener('click', ()=>{ if(window.matchMedia('(max-width: 900px)').matches) panel1.classList.toggle('collapsed'); });
h2.addEventListener('click', ()=>{ if(window.matchMedia('(max-width: 900px)').matches) panel2.classList.toggle('collapsed'); });
btnTJ1.addEventListener('click', ()=>{ if(window.matchMedia('(max-width: 900px)').matches) panel1.classList.toggle('hidden'); });
btnTJ2.addEventListener('click', ()=>{ if(window.matchMedia('(max-width: 900px)').matches) panel2.classList.toggle('hidden'); });

// Modal ayuda
function openHelp(){ helpModal.classList.add('open'); helpModal.setAttribute('aria-hidden','false'); }
function closeHelpFn(){ helpModal.classList.remove('open'); helpModal.setAttribute('aria-hidden','true'); }
helpBtn.addEventListener('click', openHelp);
closeHelp.addEventListener('click', closeHelpFn);
helpModal.addEventListener('click', (e)=>{ if(e.target===helpModal) closeHelpFn(); });
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeHelpFn(); });

// Sonido toggle
function refreshSoundBtn(){ soundBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; }
soundBtn.addEventListener('click', ()=>{ Sound.toggleMuted(); refreshSoundBtn(); Sound.click(); });
refreshSoundBtn();

// Inicia contador si ya están ambos (por si entrás con la partida andando)
startTurnTimer();

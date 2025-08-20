import { firebaseConfig } from './firebase-config.js';
import { Sound } from './sound.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Anti-mezcla
if(!document.getElementById('start') || !document.getElementById('roomId')){
  console.warn('Script de index ejecutado fuera de index.html — abortando'); throw new Error('Wrong page');
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await signInAnonymously(auth);

const $ = (q)=>document.querySelector(q);
const roomId = $('#roomId');
const role = $('#role');
const myName = $('#myName');
const starter = $('#starter');
const myCode = $('#myCode');
const toggle = $('#toggle');
const lock = $('#lock');
const start = $('#start');
const reset = $('#reset');
const err = $('#err');
const invite = $('#invite');
const wipe = $('#wipe');
const genCode = $('#genCode');

let secret = null, locked = false;

// Prefill por URL
const params = new URLSearchParams(location.search);
const preRoom = params.get('room');
const preRole = params.get('role');
const preName = params.get('name');
if (preRoom) roomId.value = preRoom.toUpperCase();
if (preRole && (preRole==='p1'||preRole==='p2')) role.value = preRole;
if (preName) myName.value = preName;
if (wipe && preRole === 'p2') wipe.checked = false;

const only4 = s => /^\d{4}$/.test(s);
myCode.addEventListener('input', ()=>{ myCode.value = myCode.value.replace(/\D/g,'').slice(0,4); });

toggle.addEventListener('click', ()=>{ 
  myCode.type = myCode.type === 'password' ? 'text' : 'password';
  toggle.textContent = myCode.type === 'password' ? 'Mostrar' : 'Ocultar';
  Sound.click();
});

lock.addEventListener('click', ()=>{
  err.style.display='none';
  const v = (myCode.value||'').trim();
  if(!only4(v)){ err.textContent='El código debe tener 4 dígitos.'; err.style.display='block'; Sound.timeout(); return; }
  secret = v; locked = true; myCode.disabled = true; toggle.disabled = true; lock.disabled = true;
  checkReady(); Sound.success();
});

function checkReady(){
  start.disabled = !(locked && roomId.value.trim().length >= 3 && myName.value.trim().length >= 1);
}
roomId.addEventListener('input', ()=>{ roomId.value = roomId.value.replace(/[^A-Za-z0-9_-]/g,'').toUpperCase(); checkReady(); });
myName.addEventListener('input', checkReady);
checkReady();

reset.addEventListener('click', ()=>{
  secret=null; locked=false; myCode.disabled=false; toggle.disabled=false; lock.disabled=false;
  myCode.type='password'; myCode.value=''; toggle.textContent='Mostrar'; start.disabled=true; err.style.display='none';
  Sound.click();
});

// Invitación
invite.addEventListener('click', async ()=>{
  const rid = (roomId.value||'').trim().toUpperCase();
  if (!rid) { alert('Poné primero un código de sala.'); Sound.timeout(); return; }
  const url = new URL(location.href);
  url.searchParams.set('room', rid);
  url.searchParams.set('role', 'p2');
  const link = url.toString();
  try { await navigator.clipboard.writeText(link); alert('¡Link copiado! Pegalo en WhatsApp.'); }
  catch { prompt('Copiá este link:', link); }
  Sound.click();
});

// Generador de código
function randomCode(len=6){
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // evita I,O,0,1
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, n => alphabet[n % alphabet.length]).join('');
}
async function generateUniqueRoomId(tries=10){
  for(let i=0;i<tries;i++){
    const candidate = randomCode(6);
    const s = await getDoc(doc(db,'rooms',candidate));
    if(!s.exists()) return candidate;
  }
  return randomCode(5) + Math.floor(Math.random()*9+1);
}
genCode.addEventListener('click', async ()=>{
  const rid = await generateUniqueRoomId();
  roomId.value = rid; role.value = 'p1'; starter.value = 'p1';
  if (wipe) wipe.checked = true;
  checkReady(); Sound.click();
});

// Sugerencia auto: si ya existe y sos p2, desmarca wipe
async function hintWipeAuto(){
  if (!wipe) return;
  const rid = (roomId.value||'').trim().toUpperCase();
  if(!rid) return;
  const s = await getDoc(doc(db,'rooms',rid));
  if(s.exists() && role.value==='p2') wipe.checked = false;
}
roomId.addEventListener('blur', hintWipeAuto);
role.addEventListener('change', hintWipeAuto);

// START: crea sala o se une — SOLO limpia si el otro NO está
start.addEventListener('click', async ()=>{
  try{
    const rid = roomId.value.trim().toUpperCase();
    const myRoleVal = role.value;
    const defaultName = myRoleVal==='p1' ? 'Jugador 1' : 'Jugador 2';
    const myDisplay = myName.value || defaultName;

    const roomRef = doc(db, 'rooms', rid);
    const snap = await getDoc(roomRef);

    if(!snap.exists()){
      await setDoc(roomRef, {
        p1Name: myRoleVal==='p1' ? myDisplay : 'Jugador 1',
        p2Name: myRoleVal==='p2' ? myDisplay : 'Jugador 2',
        p1Joined: myRoleVal==='p1',
        p2Joined: myRoleVal==='p2',
        starter: starter.value, currentTurn: starter.value,
        capAttempts: null, firstWinner: null, finished: false, winner: null,
        p1Secret: null, p2Secret: null,
        createdAt: Date.now()
      });
    } else {
      const data = snap.data() || {};
      const otherRole = (myRoleVal === 'p1') ? 'p2' : 'p1';
      const otherDefault = (otherRole === 'p1') ? 'Jugador 1' : 'Jugador 2';
      const otherJoined = data[otherRole + 'Joined'] === true;
      const otherHasCustomName = !!(data[otherRole + 'Name'] && data[otherRole + 'Name'] !== otherDefault);
      const safeToWipe = !!(wipe && wipe.checked && !otherJoined && !otherHasCustomName);

      if (safeToWipe) {
        const guessesRef = collection(db, 'rooms', rid, 'guesses');
        const q = await getDocs(guessesRef);
        await Promise.all(q.docs.map(d=> deleteDoc(d.ref)));

        await setDoc(roomRef, {
          p1Name: myRoleVal==='p1' ? myDisplay : 'Jugador 1',
          p2Name: myRoleVal==='p2' ? myDisplay : 'Jugador 2',
          p1Joined: myRoleVal==='p1',
          p2Joined: myRoleVal==='p2',
          starter: starter.value,
          currentTurn: starter.value,
          finished:false, winner:null, firstWinner:null, capAttempts:null,
          p1Secret:null, p2Secret:null
        }, { merge:true });
      } else {
        const update = {};
        if (myRoleVal === 'p1') { update.p1Name = myDisplay; update.p1Joined = true; }
        else { update.p2Name = myDisplay; update.p2Joined = true; }
        if (!data.starter) update.starter = 'p1';
        if (!data.currentTurn) update.currentTurn = data.starter || 'p1';
        await setDoc(roomRef, update, { merge:true });
      }
    }

    sessionStorage.setItem('bc_remote', JSON.stringify({
      roomId: rid, myRole: myRoleVal, mySecret: secret, myName: myDisplay
    }));

    Sound.success();
    location.href = 'juego.html';
  }catch(e){
    err.textContent = 'Error iniciando sala: ' + (e?.message||e);
    err.style.display='block';
    Sound.timeout();
  }
});

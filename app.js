/* Sudoku PWA — działa offline na iOS. */
const $ = (sel, par=document) => par.querySelector(sel);
const $$ = (sel, par=document) => Array.from(par.querySelectorAll(sel));

const STATE_KEY = "sudoku-state-v1";
const SETTINGS_KEY = "sudoku-settings-v1";

const DIFFICULTY_MAP = {
  easy:   {minClues: 40, maxClues: 45},
  medium: {minClues: 32, maxClues: 36},
  hard:   {minClues: 26, maxClues: 30},
  expert: {minClues: 22, maxClues: 25}
};
const DIFF_LABELS = { easy:"Łatwy", medium:"Średni", hard:"Trudny", expert:"Ekspert" };
const MAX_MISTAKES = 3;

let state = {
  grid: Array.from({length:9},()=>Array(9).fill(0)),
  fixed: Array.from({length:9},()=>Array(9).fill(false)),
  notes: Array.from({length:9},()=>Array.from({length:9},()=>new Set())),
  mistakes: 0,
  startTime: Date.now(),
  elapsed: 0,
  pencil: false,
  solution: null,
  difficulty: "easy",
  hintsLeft: 3,
  locked: false,
  extraHintsUsed: false,

  /* NOWE: numer klikniętego klawisza do mocnego podświetlenia */
  highlightDigit: null
};

let settings = { highlightPeers: true };

/* ---------- storage ---------- */
function save(){
  const toJSON = {...state, notes: state.notes.map(r=>r.map(s=>Array.from(s)))};
  localStorage.setItem(STATE_KEY, JSON.stringify(toJSON));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
function load(){
  const raw = localStorage.getItem(STATE_KEY);
  if(raw){
    try{
      const saved = JSON.parse(raw);
      state = {...state, ...saved, notes: saved.notes.map(r=>r.map(a=>new Set(a)))};
    }catch(e){ console.warn("Nie można odczytać zapisu", e); }
  }
  const rawSet = localStorage.getItem(SETTINGS_KEY);
  if(rawSet){ try{ settings = JSON.parse(rawSet); }catch{} }
}

/* ---------- helpers ---------- */
function toast(msg, ms=1200){ const el=$("#toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),ms); }
function onPointer(sel, fn){ document.addEventListener("pointerup", (e)=>{ const el=e.target.closest(sel); if(!el) return; fn(e,el); }); }

/* custom dropdowns */
function setupDropdown(rootId, hiddenId, onChange){
  const root = $("#"+rootId); if(!root) return;
  const btn  = root.querySelector(".dd-btn");
  const list = root.querySelector(".dd-list");
  const label= root.querySelector(".dd-label");
  const hidden = $("#"+hiddenId);

  function open(){ root.classList.add("open"); btn.setAttribute("aria-expanded","true"); }
  function close(){ root.classList.remove("open"); btn.setAttribute("aria-expanded","false"); }
  function setValue(val){
    hidden.value = val;
    label.textContent = DIFF_LABELS[val] || val;
    root.querySelectorAll('.dd-list [role="option"]').forEach(li=>{
      li.setAttribute("aria-selected", String(li.dataset.val===val));
    });
    if(onChange) onChange(val);
  }

  setValue(hidden.value || "easy");
  btn.addEventListener("pointerup",(e)=>{ e.preventDefault(); (root.classList.contains("open")?close:open)(); });
  list.addEventListener("pointerup",(e)=>{ const li=e.target.closest('[role="option"]'); if(!li) return; setValue(li.dataset.val); close(); });
  document.addEventListener("pointerup",(e)=>{ if(!root.contains(e.target)) close(); });

  return { setValue };
}

function updateUI(){
  const m=$("#mistakes"); if(m) m.textContent=`${Math.min(state.mistakes,MAX_MISTAKES)}/${MAX_MISTAKES}`;

  const counts=Array(10).fill(0);
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){ const v=state.grid[r][c]; if(v>=1&&v<=9) counts[v]++; }
  for(let d=1; d<=9; d++){
    const left=9-counts[d];
    const sub=$(`#count-${d}`); if(sub) sub.textContent=String(left);
    const key=document.querySelector(`.key[data-key="${d}"]`);
    if(key){ if(left===0){ key.classList.add("depleted"); key.disabled=true; } else { key.classList.remove("depleted"); key.disabled=false; } }
  }

  const hasEmpty=state.grid.flat().some(v=>v===0);
  const hintBtn=$("#hint");
  if(hintBtn){ hintBtn.innerHTML=`<span class="icon">💡</span>Podpowiedź (${state.hintsLeft})`; hintBtn.disabled=state.hintsLeft<=0||!hasEmpty||state.locked; }
  const addBtn=$("#addHints"); if(addBtn){ const canAdd=(state.hintsLeft===0)&&!state.extraHintsUsed&&!state.locked; addBtn.disabled=!canAdd; }
  const pencilBtn=$("#pencil"); if(pencilBtn){ pencilBtn.innerHTML=`<span class="icon">✏️</span>${state.pencil?"Ołówek (ON)":"Ołówek"}`; pencilBtn.disabled=state.locked; }
}

/* modale */
function openModal(type){
  state.locked=true;
  const modal=$("#modal"), title=$("#modal-title"), text=$("#modal-text");

  const headerVal=$("#difficulty").value||"easy";
  if(window._modalDD&&window._modalDD.setValue) window._modalDD.setValue(headerVal);
  $("#modal-diff").value=headerVal;

  if(type==="lose"){ title.textContent="Upsik 😘"; text.innerHTML="Ojojoj, ktoś tu się pomylił, kolejnym razem pójdzie Ci świetnie księżniczko! 💖💋🥰✨"; }
  else{ title.textContent="O wooooow 💛"; text.innerHTML="Jestem z Ciebie dumny! Mam mądrą narzeczoną i przyszłą żonę! Może inny level? ^^ 💖💋🥰✨"; }

  modal.hidden=false;
  $("#modal-new").onclick=()=>{ const val=$("#modal-diff").value||"easy"; if(window._headerDD&&window._headerDD.setValue) window._headerDD.setValue(val); $("#difficulty").value=val; newGame(); modal.hidden=true; };
}

/* Dodaj podpowiedzi */
let extraClickCount=0;
function openExtraModal(){
  if(state.extraHintsUsed||state.hintsLeft>0||state.locked) return;
  extraClickCount=0;
  const modal=$("#extra-modal");
  const btnAdd=$("#extra-click");
  const btnCont=$("#extra-continue");
  btnAdd.textContent="Kliknij mnie słodziutka";
  modal.hidden=false;
  btnAdd.onclick=()=>{ extraClickCount++; if(extraClickCount>=41){ state.hintsLeft+=3; state.extraHintsUsed=true; modal.hidden=true; updateUI(); } };
  btnCont.onclick=()=>{ modal.hidden=true; };
}

/* ---------- PLANSZA: 3×3 BLOKI, KAŻDY 3×3 KOMÓRKI ---------- */
function renderBoard(){
  const board=$("#board"); board.innerHTML="";

  for(let br=0;br<3;br++){
    for(let bc=0;bc<3;bc++){
      const block=document.createElement("div");
      block.className="block";
      board.appendChild(block);

      for(let r=br*3;r<br*3+3;r++){
        for(let c=bc*3;c<bc*3+3;c++){
          const cell=document.createElement("button");
          cell.type="button"; cell.className="cell";
          cell.setAttribute("role","gridcell");
          cell.setAttribute("aria-rowindex", String(r+1));
          cell.setAttribute("aria-colindex", String(c+1));
          cell.dataset.r=r; cell.dataset.c=c;

          if(state.fixed[r][c]) cell.classList.add("fixed");
          const v=state.grid[r][c];
          if(v){
            const s=document.createElement("span"); s.className="value"; s.textContent=v; cell.appendChild(s);
          }else if(state.notes[r][c].size){
            const notes=document.createElement("div"); notes.className="notes";
            for(let n=1;n<=9;n++){ const sp=document.createElement("span"); sp.textContent=state.notes[r][c].has(n)?n:""; notes.appendChild(sp); }
            cell.appendChild(notes);
          }
          block.appendChild(cell);
        }
      }
    }
  }
  updateSelectionStyles(); updateUI();
}

let selected={r:null,c:null};
function updateSelectionStyles(){
  // usuń stare klasy
  $$(".cell").forEach(c=>c.classList.remove("selected","conflict","peer-row","peer-col","peer-block","same","key-same"));

  const {r,c}=selected;
  const highlightDigit = state.highlightDigit;

  if(r!=null && c!=null){
    const selEl=document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if(selEl) selEl.classList.add("selected");

    // wiersz/kolumna
    for(let i=0;i<9;i++){
      if(i!==c){ const elR=document.querySelector(`.cell[data-r="${r}"][data-c="${i}"]`); if(elR) elR.classList.add("peer-row"); }
      if(i!==r){ const elC=document.querySelector(`.cell[data-r="${i}"][data-c="${c}"]`); if(elC) elC.classList.add("peer-col"); }
    }
    // blok 3x3
    const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3;
    for(let rr=br; rr<br+3; rr++) for(let cc=bc; cc<bc+3; cc++){
      if(!(rr===r && cc===c)){ const elB=document.querySelector(`.cell[data-r="${rr}"][data-c="${cc}"]`); if(elB) elB.classList.add("peer-block"); }
    }

    // „takie same cyfry” z komórki (gdy brak trybu z klawisza)
    const val=state.grid[r][c];
    if(val && !highlightDigit){
      for(let rr=0; rr<9; rr++){
        for(let cc=0; cc<9; cc++){
          if(state.grid[rr][cc]===val){
            const el=document.querySelector(`.cell[data-r="${rr}"][data-c="${cc}"]`);
            if(el) el.classList.add("same");
          }
        }
      }
      // konflikty (jak wcześniej)
      for(let i=0;i<9;i++){
        if(i!==c && state.grid[r][i]===val) mark(r,i);
        if(i!==r && state.grid[i][c]===val) mark(i,c);
      }
      const rr0=Math.floor(r/3)*3, cc0=Math.floor(c/3)*3;
      for(let rr=rr0; rr<rr0+3; rr++) for(let cc=cc0; cc<cc0+3; cc++){
        if(!(rr===r&&cc===c) && state.grid[rr][cc]===val) mark(rr,cc);
      }
    }
  }

  // „takie same cyfry” po kliknięciu klawisza – MOCNE
  if(highlightDigit){
    for(let rr=0; rr<9; rr++){
      for(let cc=0; cc<9; cc++){
        if(state.grid[rr][cc]===highlightDigit){
          const el=document.querySelector(`.cell[data-r="${rr}"][data-c="${cc}"]`);
          if(el) el.classList.add("key-same");
        }
      }
    }
  }

  function mark(rr,cc){
    const el=document.querySelector(`.cell[data-r="${rr}"][data-c="${cc}"]`);
    if(el) el.classList.add("conflict");
  }
}

/* rozgrywka */
function forEachPeer(r,c,cb){ for(let i=0;i<9;i++){ if(i!==c) cb(r,i); if(i!==r) cb(i,c); } const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3; for(let rr=br; rr<br+3; rr++) for(let cc=bc; cc<bc+3; cc++){ if(!(rr===r&&cc===c)) cb(rr,cc); } }
function setValue(r,c,val){
  if(state.locked || state.fixed[r][c]) return;
  const prev=state.grid[r][c]; if(prev===val) return;
  if(state.pencil && val!==0){ toggleNote(r,c,val); return; }
  state.notes[r][c].clear(); state.grid[r][c]=val;
  if(val){ forEachPeer(r,c,(rr,cc)=>{ if(state.notes[rr][cc].has(val)) state.notes[rr][cc].delete(val); }); }
  let ok=false;
  if(val && state.solution){
    if(val===state.solution[r][c]){ ok=true; state.fixed[r][c]=true; }
    else{ state.mistakes++; if(state.mistakes>=MAX_MISTAKES){ save(); renderBoard(); updateSelectionStyles(); updateUI(); openModal("lose"); return; } }
  }
  save(); renderBoard();
  const el=document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  if(val && state.solution && el){ el.classList.add(ok?"correct":"wrong"); setTimeout(()=>el.classList.remove(ok?"correct":"wrong"),800); }
  selected={r,c}; updateSelectionStyles(); checkCompletion();
}
function clearNotes(r,c){ if(state.locked||state.fixed[r][c]||state.notes[r][c].size===0) return; state.notes[r][c].clear(); save(); renderBoard(); selected={r,c}; updateSelectionStyles(); }
function toggleNote(r,c,n){ if(state.locked||state.fixed[r][c]||state.grid[r][c]) return; if(state.notes[r][c].has(n)) state.notes[r][c].delete(n); else state.notes[r][c].add(n); save(); renderBoard(); selected={r,c}; updateSelectionStyles(); }

/* solver & generator */
function isValid(g,r,c,n){ for(let i=0;i<9;i++) if(g[r][i]===n||g[i][c]===n) return false; const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3; for(let rr=br; rr<br+3; rr++) for(let cc=bc; cc<bc+3; cc++) if(g[rr][cc]===n) return false; return true; }
function solve(g){ for(let r=0;r<9;r++){ for(let c=0;c<9;c++){ if(g[r][c]===0){ for(let n=1;n<=9;n++){ if(isValid(g,r,c,n)){ g[r][c]=n; if(solve(g)) return true; g[r][c]=0; } } return false; } } } return true; }
function countSolutions(g,limit=2){ let count=0; (function backtrack(){ for(let r=0;r<9;r++){ for(let c=0;c<9;c++){ if(g[r][c]===0){ for(let n=1;n<=9;n++){ if(isValid(g,r,c,n)){ g[r][c]=n; backtrack(); if(count>=limit) return; g[r][c]=0; } } return; } } } count++; })(); return count; }
function generateFull(){ const g=Array.from({length:9},()=>Array(9).fill(0)); const nums=[1,2,3,4,5,6,7,8,9]; (function fill(p=0){ if(p===81) return true; const r=Math.floor(p/9), c=p%9; const sh=nums.slice().sort(()=>Math.random()-0.5); for(const n of sh){ if(isValid(g,r,c,n)){ g[r][c]=n; if(fill(p+1)) return true; g[r][c]=0; } } return false; })(0); return g; }
function generatePuzzle(level="easy"){ const {minClues,maxClues}=DIFFICULTY_MAP[level]; const solution=generateFull(); const puzzle=solution.map(r=>r.slice()); const pos=Array.from({length:81},(_,i)=>i).sort(()=>Math.random()-0.5); const target=Math.floor(Math.random()*(maxClues-minClues+1))+minClues; let removed=0; for(const p of pos){ const r=Math.floor(p/9), c=p%9; const b=puzzle[r][c]; if(b===0) continue; puzzle[r][c]=0; const copy=puzzle.map(r=>r.slice()); if(countSolutions(copy,2)>1){ puzzle[r][c]=b; }else{ removed++; const clues=81-removed; if(clues<=target) break; } } return {puzzle,solution}; }

/* nowa gra */
function newGame(){
  const level=$("#difficulty").value || "easy";
  const {puzzle, solution}=generatePuzzle(level);
  state.grid=puzzle; state.fixed=puzzle.map(r=>r.map(v=>v!==0)); state.solution=solution;
  state.notes=Array.from({length:9},()=>Array.from({length:9},()=>new Set()));
  state.mistakes=0; state.hintsLeft=3; state.startTime=Date.now(); state.elapsed=0; state.difficulty=level; state.locked=false; state.extraHintsUsed=false;
  state.highlightDigit=null;            /* reset */
  selected={r:null,c:null};
  save(); renderBoard();
  $("#clock").textContent="00:00";
  $("#modal")?.setAttribute("hidden","hidden");
  $("#extra-modal")?.setAttribute("hidden","hidden");
  updateUI();
}

/* koniec / podpowiedź / zegar */
function checkCompletion(){ for(let r=0;r<9;r++) for(let c=0;c<9;c++){ if(state.grid[r][c]===0) return; } const g=state.grid.map(r=>r.slice()); if(solve(g)) openModal("win"); }
function hint(){ if(state.locked||state.hintsLeft<=0) return; const empty=[]; for(let r=0;r<9;r++) for(let c=0;c<9;c++) if(state.grid[r][c]===0) empty.push([r,c]); if(!empty.length) return; const [r,c]=empty[Math.floor(Math.random()*empty.length)]; setValue(r,c,state.solution[r][c]); state.hintsLeft--; updateUI(); }
function tick(){ const now=Date.now(); const elapsed=state.elapsed+(now-state.startTime); const total=Math.floor(elapsed/1000); const mm=String(Math.floor(total/60)).padStart(2,"0"); const ss=String(total%60).padStart(2,"0"); $("#clock").textContent=`${mm}:${ss}`; }
setInterval(tick,1000);

/* UI bindings */
function setupUI(){
  window._headerDD = setupDropdown("diff-dd","difficulty",(val)=>{ $("#difficulty").value=val; newGame(); });
  window._modalDD  = setupDropdown("modal-dd","modal-diff",null);

  onPointer(".cell", (_e,el)=>{ if(state.locked) return; const r=+el.dataset.r, c=+el.dataset.c; selected={r,c}; updateSelectionStyles(); });

  onPointer(".key", (_e,el)=>{
    if(state.locked) return;
    const n=+el.dataset.key;
    // MOCNE podświetlenie cyfr po kliknięciu klawisza
    state.highlightDigit = (n>=1 && n<=9) ? n : null;

    const {r,c}=selected;
    if(r==null||c==null){
      // Bez aktywnej komórki – tylko highlight
      updateSelectionStyles();
      return;
    }
    if(n===0){
      if(state.pencil) clearNotes(r,c);
      else if(!state.fixed[r][c]) setValue(r,c,0);
      updateSelectionStyles();
      return;
    }
    setValue(r,c,n);
  });

  onPointer("#pencil", ()=>{ if(state.locked) return; state.pencil=!state.pencil; updateUI(); });
  onPointer("#hint", hint);
  onPointer("#addHints", openExtraModal);
  onPointer("#newGame", newGame);

  // klawiatura fizyczna
  window.addEventListener("keydown", (e)=>{
    if(state.locked) return;
    if(e.key>='1'&&e.key<='9'){ state.highlightDigit=+e.key; }
    if(e.key==='0'||e.key==='Backspace'||e.key==='Delete'){ state.highlightDigit=null; }
    const {r,c}=selected; if(r==null||c==null){ updateSelectionStyles(); return; }
    if(e.key>='1'&&e.key<='9') setValue(r,c,+e.key);
    else if(e.key==='Backspace'||e.key==='Delete'||e.key==='0'){
      if(state.pencil) clearNotes(r,c); else if(!state.fixed[r][c]) setValue(r,c,0);
    }
  });
}

/* SW + init */
function registerSW(){ if("serviceWorker" in navigator){ window.addEventListener("load", ()=>{ navigator.serviceWorker.register("./service-worker.js").catch(()=>{}); }); } }
function init(){ load(); if(state.grid.flat().every(v=>v===0)){ newGame(); } else { renderBoard(); updateUI(); } setupUI(); registerSW(); }
init();

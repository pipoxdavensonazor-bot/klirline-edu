/* NORIA — hors ligne (mode serveur seulement).
   - File de saisie IndexedDB (base noria_offline, magasin « ops ») : chaque saisie de présence reçoit une clé
     d'idempotence (op_id) et la version de la fiche vue par l'appareil ; elle est envoyée dès que le réseau revient.
     Le serveur décide : appliquée, identique, refusée, ou conflit (la valeur du serveur est conservée et journalisée).
   - Les notes passent par la même file (kind « grade », route /api/grades/sync, mêmes règles d'idempotence et de conflit).
   - Cache de lecture noria_cache_v1 (magasin « cache ») : profil, élèves, classes et feuilles d'appel déjà vues, pour
     rouvrir l'application sans réseau. Effacé à la déconnexion. Jamais de mot de passe ni de jeton.
   - Indicateur honnête : « Hors ligne · X en attente », « X en attente », « Synchronisé à HH:MM », conflits. */
(function(){
"use strict";
const DBN="noria_offline", CACHE_KEY="noria_cache_v1";
let dbp=null;
function idb(){
  if(dbp) return dbp;
  dbp=new Promise((ok,ko)=>{ const r=indexedDB.open(DBN,1);
    r.onupgradeneeded=()=>{ const d=r.result; if(!d.objectStoreNames.contains("ops")) d.createObjectStore("ops",{keyPath:"op_id"}); if(!d.objectStoreNames.contains("cache")) d.createObjectStore("cache",{keyPath:"k"}); };
    r.onsuccess=()=>ok(r.result); r.onerror=()=>ko(r.error); });
  return dbp;
}
async function store(name,mode,fn){ const d=await idb(); return new Promise((ok,ko)=>{ const tx=d.transaction(name,mode); const s=tx.objectStore(name); let out; Promise.resolve(fn(s)).then(v=>{out=v;}); tx.oncomplete=()=>ok(out); tx.onerror=()=>ko(tx.error); tx.onabort=()=>ko(tx.error); }); }
const req=r=>new Promise((ok,ko)=>{ r.onsuccess=()=>ok(r.result); r.onerror=()=>ko(r.error); });
const allOps=()=>store("ops","readonly",s=>req(s.getAll()));

const ST={user:null,pending:0,conflicts:[],refused:[],lastSync:null,reachable:true,sending:false,authLost:false};
const listeners=[];
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const L={
  fr:{off:"Hors ligne",wait:n=>`${n} en attente`,synced:h=>`Synchronisé à ${h}`,never:"Rien à envoyer",send:"Envoi…",conf:n=>`${n} conflit${n>1?"s":""}`,auth:n=>`Reconnectez-vous pour envoyer ${n} saisie${n>1?"s":""}`},
  ht:{off:"San entènèt",wait:n=>`${n} ap tann`,synced:h=>`Senkwonize a ${h}`,never:"Anyen pou voye",send:"Ap voye…",conf:n=>`${n} konfli`,auth:n=>`Rekonekte pou voye ${n} antre`},
};
const online=()=>navigator.onLine&&ST.reachable;
function hm(iso){ try{ return new Date(iso).toLocaleTimeString(lang()==="ht"?"fr-HT":"fr-FR",{hour:"2-digit",minute:"2-digit"}); }catch(e){ return "—"; } }

function indicator(){
  const top=document.querySelector(".topbar"); if(!top||!ST.user) return;
  let el=document.getElementById("offInd");
  if(!el){ el=document.createElement("button"); el.type="button"; el.id="offInd"; el.className="off-ind"; el.setAttribute("aria-live","polite");
    el.addEventListener("click",()=>{ flush(); }); const chip=document.getElementById("userChip"); top.insertBefore(el,chip?chip.nextSibling:top.firstChild); }
  const t=L[lang()]; let txt, cls;
  if(ST.authLost&&ST.pending){ txt=t.auth(ST.pending); cls="warn"; }
  else if(!online()){ txt=t.off+(ST.pending?" · "+t.wait(ST.pending):""); cls="off"; }
  else if(ST.pending){ txt=ST.sending?t.send+" "+t.wait(ST.pending):t.wait(ST.pending); cls="wait"; }
  else { txt=ST.lastSync?t.synced(hm(ST.lastSync)):t.never; cls="ok"; }
  if(ST.conflicts.length) txt+=" · "+t.conf(ST.conflicts.length);
  el.textContent=txt; el.dataset.state=cls;
  el.title=lang()==="ht"?"Klike pou eseye voye kounye a":"Cliquer pour tenter l'envoi maintenant";
}
async function refreshCount(){ const ops=await allOps().catch(()=>[]); ST.pending=ops.filter(o=>o.user_id===(ST.user&&ST.user.id)).length; indicator(); }
function emit(){ indicator(); listeners.forEach(f=>{ try{ f(ST); }catch(e){} }); }

async function enqueue(ops){
  const now=new Date().toISOString();
  const rows=ops.map(o=>({...o,op_id:o.op_id||(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2)),
    user_id:ST.user.id,recorded_at:o.recorded_at||now,offline:!online(),queued_at:now}));
  await store("ops","readwrite",s=>{ rows.forEach(r=>s.put(r)); });
  await refreshCount(); emit();
  flush();
  return rows;
}

async function flush(){
  if(ST.sending||!ST.user) return;
  if(!navigator.onLine){ emit(); return; }
  const mine=(await allOps().catch(()=>[])).filter(o=>o.user_id===ST.user.id).sort((a,b)=>a.queued_at.localeCompare(b.queued_at));
  if(!mine.length){ ST.reachable=true; emit(); return; }
  ST.sending=true; emit();
  try{
    // Même file pour l'appel et les notes : chaque saisie part vers sa route (kind « grade » → /api/grades/sync).
    const batches=[]; for(const kind of ["att","grade"]){ const ofKind=mine.filter(o=>(o.kind||"att")===kind); for(let i=0;i<ofKind.length;i+=200) batches.push([kind,ofKind.slice(i,i+200)]); }
    for(const [kind,chunk] of batches){
      const body={ops:chunk.map(({user_id,queued_at,kind:_k,...o})=>o)};
      let r;
      try{ r=await fetch(kind==="grade"?"/api/grades/sync":"/api/attendance/sync",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json","x-noria":"1"},body:JSON.stringify(body)}); }
      catch(e){ ST.reachable=false; break; } // réseau injoignable malgré navigator.onLine
      ST.reachable=true;
      if(r.status===401){ ST.authLost=true; break; }
      if(!r.ok) break; // erreur serveur : la file reste, nouvel essai plus tard
      ST.authLost=false;
      const out=await r.json();
      const done=new Set();
      for(const res of out.results||[]){
        done.add(res.op_id);
        const op=chunk.find(o=>o.op_id===res.op_id);
        if(res.result==="conflit") ST.conflicts.push({...res,kind,student_id:op&&op.student_id,day:op&&op.day,class_id:op&&op.class_id,evaluation_id:op&&op.evaluation_id});
        if(res.result==="refuse") ST.refused.push({...res,kind,student_id:op&&op.student_id,evaluation_id:op&&op.evaluation_id});
        if(op&&kind==="grade"&&res.version) await rememberGrade(op.evaluation_id,op.student_id,res);
        if(op&&kind==="att"&&res.status) await rememberStatus(op.class_id,op.day,op.student_id,res.status,res.version);
      }
      await store("ops","readwrite",s=>{ done.forEach(id=>s.delete(id)); });
      ST.lastSync=out.serverTime||new Date().toISOString();
      await putCache("lastSync",ST.lastSync);
    }
  } finally { ST.sending=false; await refreshCount(); emit(); }
}

/* ---- cache de lecture (noria_cache_v1) ---- */
const putCache=(k,v)=>store("cache","readwrite",s=>{ s.put({k:CACHE_KEY+":"+k,v,at:Date.now()}); }).catch(()=>{});
const getCache=k=>store("cache","readonly",s=>req(s.get(CACHE_KEY+":"+k))).then(r=>r?r.v:null).catch(()=>null);
async function clearCache(){ await store("cache","readwrite",s=>{ s.clear(); }).catch(()=>{}); }
async function rememberStatus(classId,day,studentId,status,version){
  const k=`att:${classId}:${day}`; const sheet=(await getCache(k))||{};
  sheet[studentId]={status,version}; await putCache(k,sheet);
}
// Feuille d'appel : serveur si possible (et mise en cache), sinon dernière copie connue.
async function loadSheet(classId,day){
  const k=`att:${classId}:${day}`;
  if(navigator.onLine){
    try{
      const r=await fetch(`/api/attendance?class_id=${encodeURIComponent(classId)}&day=${encodeURIComponent(day)}`,{credentials:"same-origin",cache:"no-store"});
      if(r.ok){ ST.reachable=true; const rows=await r.json(); const sheet={}; rows.forEach(x=>{ sheet[x.student_id]={status:x.status,version:x.version}; }); await putCache(k,sheet); return {sheet,fresh:true}; }
      if(r.status===401) ST.authLost=true;
    }catch(e){ ST.reachable=false; }
  }
  return {sheet:(await getCache(k))||{},fresh:false};
}
async function rememberGrade(evId,studentId,res){
  const k=`eval:${evId}`; const ev=await getCache(k); if(!ev) return;
  ev.grades=(ev.grades||[]).filter(g=>g.student_id!==studentId).concat([{student_id:studentId,score:res.score,mention:res.mention,version:res.version}]);
  await putCache(k,ev);
}
async function pendingGrades(evId){
  const ops=(await allOps().catch(()=>[])).filter(o=>o.kind==="grade"&&o.user_id===(ST.user&&ST.user.id)&&o.evaluation_id===evId);
  const m={}; ops.sort((a,b)=>a.queued_at.localeCompare(b.queued_at)).forEach(o=>{ m[o.student_id]={score:o.score,mention:o.mention}; }); return m;
}
async function pendingFor(classId,day){
  const ops=(await allOps().catch(()=>[])).filter(o=>o.user_id===(ST.user&&ST.user.id)&&o.class_id===classId&&o.day===day);
  const m={}; ops.filter(o=>(o.kind||"att")==="att").sort((a,b)=>a.queued_at.localeCompare(b.queued_at)).forEach(o=>{ m[o.student_id]=o.status; }); return m;
}

async function init(me){
  ST.user=me; ST.lastSync=await getCache("lastSync");
  await refreshCount(); emit();
  if(!init.done){
    init.done=true;
    window.addEventListener("online",()=>{ ST.reachable=true; flush(); });
    window.addEventListener("offline",emit);
    document.addEventListener("visibilitychange",()=>{ if(!document.hidden) flush(); });
    setInterval(()=>{ if(ST.pending) flush(); },30000);
    const ls=document.getElementById("langSel"); if(ls) ls.addEventListener("change",()=>setTimeout(indicator,0));
  }
  flush();
}

window.NORIA_OFF={init,enqueue,flush,loadSheet,pendingFor,pendingGrades,putCache,getCache,clearCache,state:()=>ST,online,
  onChange:f=>listeners.push(f),takeConflicts:()=>{ const c=ST.conflicts.slice(); return c; },clearConflicts:()=>{ ST.conflicts=[]; emit(); },
  takeRefused:()=>{ const r=ST.refused; ST.refused=[]; return r; }};
})();

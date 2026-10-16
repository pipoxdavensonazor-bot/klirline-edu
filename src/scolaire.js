/* NORIA — cœur scolaire en mode serveur : notes, bulletins, annonces, calendrier, invitations.
   Tout vient de l'API (rien dans localStorage). Les notes saisies passent par la file hors ligne idempotente
   (NORIA_OFF, kind « grade ») ; la dernière copie vue d'une évaluation est gardée dans noria_cache_v1. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{grades:"Notes et évaluations",cls:"Classe",term:"Période",subject:"Matière",newEv:"Nouvelle évaluation",title:"Intitulé",day:"Date",max:"Barème",custom:"Autre…",customMax:"Barème personnalisé",applyMax:"Changer le barème",maxLocked:"Barème verrouillé (évaluation soumise).",maxChanged:m=>`Barème changé : /${m}.`,onScale:m=>`notes ramenées sur /${m}`,coef:"Coefficient",
    create:"Créer",save:"Enregistrer les notes",submit:"Soumettre à la direction",publish:"Publier aux familles",reopen:"Rouvrir",reason:"Motif (obligatoire) :",
    st:{brouillon:"Brouillon",soumise:"Soumise",publiee:"Publiée"},absent:"Absent",dispense:"Dispensé",none:"Aucune évaluation pour cette période.",
    pend:"en attente d'envoi",queued:n=>`${n} note(s) mises en file — envoi dès que le réseau le permet.`,readonly:"Lecture seule.",
    rc:"Bulletins",rc1:"Bulletin",issue:"Émettre le bulletin",pdf:"PDF",code:"Code de vérification",revoked:"Annulé",valid:"Valide",copy:"Copier",copied:"Copié.",
    avg:"Moyenne",general:"Moyenne générale",noPub:"Aucune note publiée pour l'instant.",loading:"Chargement…",off:"Hors ligne : dernière copie connue.",
    ann:"Annonces",cal:"Calendrier",newAnn:"Publier une annonce",body:"Texte",aud:"Audience",start:"Début",end:"Fin (facultatif)",add:"Ajouter",
    auds:{ecole:"Toute l'école",classe:"Une classe",parents:"Parents",enseignants:"Enseignants"},noAnn:"Aucune annonce.",noEv:"Aucun événement.",
    acc:"Comptes",invite:"Inviter un compte",name:"Nom affiché",email:"E-mail",phone:"Téléphone",role:"Rôle",student:"Élève lié",send:"Créer l'invitation",
    link:"Lien d'invitation à transmettre",simul:"Envoi SMS / e-mail simulé : copiez le lien et transmettez-le vous-même.",sentOk:c=>`Invitation envoyée par ${c==="sms"?"SMS":"e-mail"}. Le lien reste copiable ici.`,sentKo:"L'envoi a échoué : copiez le lien et transmettez-le vous-même.",invs:"Invitations",
    used:"Activée",roles:{parent:"Parent",eleve:"Élève",enseignant:"Enseignant",secretariat:"Secrétariat",comptabilite:"Comptabilité",bibliotheque:"Bibliothèque",direction:"Direction"},expired:"Expirée",waiting:"En attente",cancel:"Annuler",err:"Refusé : ",net:"Réseau indisponible.",needNet:"Réseau nécessaire pour cette action."},
  ht:{grades:"Nòt ak evalyasyon",cls:"Klas",term:"Peryòd",subject:"Matyè",newEv:"Nouvo evalyasyon",title:"Tit",day:"Dat",max:"Baremn",custom:"Lòt…",customMax:"Baremn pèsonalize",applyMax:"Chanje baremn nan",maxLocked:"Baremn nan bloke (evalyasyon an voye deja).",maxChanged:m=>`Baremn chanje : /${m}.`,onScale:m=>`nòt yo ramnen sou /${m}`,coef:"Koefisyan",
    create:"Kreye",save:"Anrejistre nòt yo",submit:"Voye bay direksyon",publish:"Pibliye pou fanmi yo",reopen:"Relouvri",reason:"Rezon (obligatwa) :",
    st:{brouillon:"Bouyon",soumise:"Voye",publiee:"Pibliye"},absent:"Absan",dispense:"Egzante",none:"Pa gen evalyasyon pou peryòd sa a.",
    pend:"ap tann pou pati",queued:n=>`${n} nòt nan fil la — y ap pati lè rezo a la.`,readonly:"Lekti sèlman.",
    rc:"Bilten",rc1:"Bilten",issue:"Bay bilten an",pdf:"PDF",code:"Kòd verifikasyon",revoked:"Anile",valid:"Valab",copy:"Kopye",copied:"Kopye.",
    avg:"Mwayèn",general:"Mwayèn jeneral",noPub:"Poko gen nòt ki pibliye.",loading:"Ap chaje…",off:"San entènèt : dènye kopi ki te la.",
    ann:"Anons",cal:"Kalandriye",newAnn:"Pibliye yon anons",body:"Tèks",aud:"Pou ki moun",start:"Kòmansman",end:"Fen (si genyen)",add:"Ajoute",
    auds:{ecole:"Tout lekòl la",classe:"Yon klas",parents:"Paran",enseignants:"Pwofesè"},noAnn:"Pa gen anons.",noEv:"Pa gen evènman.",
    acc:"Kont",invite:"Envite yon kont",name:"Non",email:"Imèl",phone:"Telefòn",role:"Wòl",student:"Elèv ki lye",send:"Kreye envitasyon an",
    link:"Lyen envitasyon pou voye",simul:"SMS / imèl la se similasyon : kopye lyen an epi voye l ou menm.",sentOk:c=>`Envitasyon an pati pa ${c==="sms"?"SMS":"imèl"}. Lyen an rete la pou kopye.`,sentKo:"Voye a pa mache : kopye lyen an epi voye l ou menm.",invs:"Envitasyon",
    used:"Aktive",roles:{parent:"Paran",eleve:"Elèv",enseignant:"Pwofesè",secretariat:"Sekretarya",comptabilite:"Kontablite",bibliotheque:"Bibliyotèk",direction:"Direksyon"},expired:"Ekspire",waiting:"Ap tann",cancel:"Anile",err:"Refize : ",net:"Rezo a pa disponib.",needNet:"Fò gen rezo pou aksyon sa a."},
};
const t=k=>T[lang()][k];
const C={}; // cache mémoire des réponses GET
const ST={cls:null,term:null,ev:null,draft:{},inv:null,msg:""};
let S=null, rerender=()=>{};
const has=(...r)=>S&&r.includes(S.role);

async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let body=null; try{ body=await r.json(); }catch(e){}
  return {status:r.status,body};
}
const post=(p,b)=>api(p,{method:"POST",body:JSON.stringify(b||{})});
const patch=(p,b)=>api(p,{method:"PATCH",body:JSON.stringify(b||{})});
// Barème : 100 par défaut, 200 et 300 proposés, ou valeur personnalisée positive (1000 au plus, comme le serveur).
const PRESETS=[100,200,300];
function maxPicker(cur,id){ const c=Number(cur)||100; const custom=!PRESETS.includes(c);
  return `<span class="sco-max"><select name="maxSel" id="${id}Sel" aria-label="${esc(t("max"))}" onchange="NORIA_SCO.maxSel(this)">${PRESETS.map(v=>`<option value="${v}"${v===c?" selected":""}>/${v}</option>`).join("")}<option value="autre"${custom?" selected":""}>${esc(t("custom"))}</option></select>
  <input name="max" id="${id}" type="number" inputmode="decimal" min="0.01" max="1000" step="0.01" value="${c}" aria-label="${esc(t("customMax"))}" required${custom?"":" hidden"}></span>`; }
function maxSel(sel){ const i=sel.parentNode.querySelector("input[name=max]"); if(sel.value==="autre"){ i.hidden=false; i.focus(); } else { i.hidden=true; i.value=sel.value; } }
function readMax(i){ const v=Number(String(i.value).replace(",",".")); return Number.isFinite(v)&&v>0&&v<=1000?Math.round(v*100)/100:null; }
function toast(m){ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),3500); }
// GET avec cache mémoire + copie hors ligne ; relance l'affichage quand la réponse arrive.
function get(path){
  if(path in C) return C[path];
  C[path]=undefined;
  (async()=>{
    let v=null;
    if(navigator.onLine){ try{ const r=await api(path); if(r.status===200){ v=r.body; window.NORIA_OFF&&NORIA_OFF.putCache("get:"+path,v); } else v={__err:r.status}; }catch(e){} }
    if(v==null&&window.NORIA_OFF){ v=await NORIA_OFF.getCache("get:"+path); if(v!=null){ v=Array.isArray(v)?Object.assign(v.slice(),{__stale:1}):{...v,__stale:1}; } }
    C[path]=v==null?{__err:0}:v; rerender();
  })();
  return undefined;
}
function invalidate(prefix){ Object.keys(C).forEach(k=>{ if(k.startsWith(prefix)) delete C[k]; }); }
const ok=v=>v!==undefined&&v!==null&&!v.__err;
const wait=`<p class="mut small">${"…"}</p>`;
function sel(id,items,cur,onch){ return `<select id="${id}" onchange="${onch}">${items.map(([v,l])=>`<option value="${esc(v)}"${String(v)===String(cur)?" selected":""}>${esc(l)}</option>`).join("")}</select>`; }
function failMsg(r){ return t("err")+((r&&r.body&&r.body.error)||(r?r.status:t("net"))); }
async function act(fn){ if(!navigator.onLine){ toast(t("needNet")); return null; } try{ return await fn(); }catch(e){ toast(t("net")); return null; } }

/* ---------- notes (personnel) ---------- */
function terms(){ const v=get("/api/terms"); if(!ok(v)) return null; if(!ST.term){ const d=new Date().toLocaleDateString("en-CA"); ST.term=(v.find(x=>x.starts_on<=d&&d<=x.ends_on)||v[0]||{}).id; } return v; }
function acad(state){
  S=state;
  if(has("parent","eleve")) return family();
  const tm=terms(); if(!tm) return `<h2>${t("grades")}</h2>${wait}`;
  const classes=S.classes; if(!ST.cls&&classes[0]) ST.cls=classes[0].serverId;
  const evs=get(`/api/evaluations?class_id=${ST.cls}&term_id=${ST.term}`);
  let h=`<div class="row sp"><h2 style="margin:0">${esc(t("grades"))}</h2></div>
  <div class="toolbar sco-bar"><label class="small">${esc(t("cls"))} ${sel("scoCls",classes.map(c=>[c.serverId,c.name]),ST.cls,"NORIA_SCO.setCls(this.value)")}</label>
  <label class="small">${esc(t("term"))} ${sel("scoTerm",tm.map(x=>[x.id,x.name]),ST.term,"NORIA_SCO.setTerm(this.value)")}</label></div>`;
  if(!ok(evs)) return h+wait;
  if(evs.__stale) h+=`<p class="small mut">${esc(t("off"))}</p>`;
  h+=`<div class="grid g2" style="margin-top:10px"><div class="card"><h3>${esc(t("grades"))}</h3>${evs.length?evs.map(e=>`<button class="sco-ev${ST.ev===e.id?" on":""}" onclick="NORIA_SCO.openEv(${e.id})"><b>${esc(e.subject)}</b> — ${esc(e.title)}<br><span class="small mut">${esc(e.day)} · /${e.max_score} · coef ${e.coefficient} · ${e.grades} </span><span class="badge st-${e.status}">${esc(t("st")[e.status])}</span></button>`).join(""):`<p class="mut small">${esc(t("none"))}</p>`}
  ${has("enseignant","direction")?newEvForm():""}</div><div>${ST.ev&&evs.some(e=>e.id===ST.ev)?sheet():""}${has("direction","secretariat")?cards():""}</div></div>`;
  return h;
}
function newEvForm(){
  const subj=get("/api/subjects"); if(!ok(subj)) return "";
  const mine=subj.filter(s=>s.class_id==null||s.class_id===Number(ST.cls));
  if(!mine.length) return "";
  return `<details class="sco-new"><summary>${esc(t("newEv"))}</summary><form onsubmit="event.preventDefault();NORIA_SCO.createEv(this)">
    <label class="fld">${esc(t("subject"))}<select name="subject">${mine.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>
    <label class="fld">${esc(t("title"))}<input name="title" required maxlength="120"></label>
    <div class="row"><label class="fld">${esc(t("day"))}<input name="day" type="date" required value="${new Date().toLocaleDateString("en-CA")}"></label>
    <label class="fld">${esc(t("max"))}${maxPicker(100,"scoNewMax")}</label>
    <label class="fld">${esc(t("coef"))}<input name="coef" type="number" min="0.5" max="10" step="0.5" value="1" required></label></div>
    <button type="submit">${esc(t("create"))}</button></form></details>`;
}
function sheet(){
  const ev=get(`/api/evaluations/${ST.ev}`); if(!ok(ev)) return `<div class="card">${wait}</div>`;
  const pend=ST.pend||{};
  const canEdit=(has("enseignant")&&ev.status==="brouillon")||has("direction");
  const g=Object.fromEntries((ev.grades||[]).map(x=>[x.student_id,x]));
  const rows=ev.students.map(s=>{ const d=ST.draft[s.id]||pend[s.id]||g[s.id]||{}; const p=!!pend[s.id];
    const v=d.mention?"":(d.score??"");
    return `<tr><td>${esc(s.first_name)} ${esc(s.last_name)}${p?` <span class="badge b-pend" title="${esc(t("pend"))}">⏳</span>`:""}</td>
    <td><input class="sco-in" inputmode="decimal" placeholder="/${ev.max_score}" aria-label="${esc(s.first_name)}" data-sid="${s.id}" value="${esc(v)}" ${canEdit?"":"disabled"} oninput="NORIA_SCO.edit(${s.id},this.value,null)"></td>
    <td><select data-msid="${s.id}" ${canEdit?"":"disabled"} onchange="NORIA_SCO.edit(${s.id},null,this.value)"><option value="">—</option><option value="absent"${d.mention==="absent"?" selected":""}>${esc(t("absent"))}</option><option value="dispense"${d.mention==="dispense"?" selected":""}>${esc(t("dispense"))}</option></select></td></tr>`; }).join("");
  const btn=[];
  if(canEdit) btn.push(`<button id="scoSave" onclick="NORIA_SCO.saveGrades()">${esc(t("save"))}</button>`);
  if(ev.status==="brouillon"&&has("enseignant","direction")) btn.push(`<button class="ghost" id="scoSubmit" onclick="NORIA_SCO.move('soumettre')">${esc(t("submit"))}</button>`);
  if(ev.status==="soumise"&&has("direction")) btn.push(`<button class="ghost" id="scoPublish" onclick="NORIA_SCO.move('publier')">${esc(t("publish"))}</button>`);
  if(ev.status!=="brouillon"&&has("direction")) btn.push(`<button class="ghost" onclick="NORIA_SCO.move('rouvrir')">${esc(t("reopen"))}</button>`);
  return `<div class="card"><h3>${esc(ev.title)} <span class="badge st-${ev.status}">${esc(t("st")[ev.status])}</span></h3><p class="small mut">${esc(ev.day)} · /${ev.max_score} · coef ${ev.coefficient}${canEdit?"":" · "+esc(t("readonly"))}</p>
  ${ev.status==="brouillon"&&has("enseignant","direction")?`<form class="row sco-maxf" onsubmit="event.preventDefault();NORIA_SCO.setMax(this)"><label class="small">${esc(t("max"))} ${maxPicker(ev.max_score,"scoEvMax")}</label><button class="ghost" type="submit">${esc(t("applyMax"))}</button></form>`:`<p class="small mut">${esc(t("maxLocked"))}</p>`}
  <table class="sco-tab"><tbody>${rows}</tbody></table>${ST.msg?`<p class="small" role="status">${esc(ST.msg)}</p>`:""}<div class="toolbar">${btn.join("")}</div></div>`;
}
function cards(){
  const kids=S.students.filter(s=>s.classId==="c"+ST.cls);
  return `<div class="card" style="margin-top:10px"><h3>${esc(t("rc"))}</h3>${kids.map(k=>{ const list=get(`/api/report-cards?student_id=${k.serverId}`);
    const cur=ok(list)?list.find(r=>!r.revoked_at&&r.term_id===Number(ST.term)):null;
    return `<div class="row sp sco-rc"><span>${esc(k.firstName)} ${esc(k.lastName)}${cur?` <span class="small mut">${cur.average==null?"":esc(String(cur.average))+"/"+(cur.scale||100)}</span>`:""}</span><span class="row">
    ${cur?`<button class="soft" onclick="NORIA_SCO.pdf(${cur.id})">${esc(t("pdf"))}</button>`:""}<button class="ghost" data-issue="${k.serverId}" onclick="NORIA_SCO.issue(${k.serverId})">${esc(t("issue"))}</button></span></div>`; }).join("")}
  ${ST.issued?`<div class="sco-link"><p class="small">${esc(t("code"))} : <b>${esc(ST.issued.code)}</b></p><input readonly value="${esc(ST.issued.verifyUrl)}" id="scoVerify"><button class="ghost" onclick="NORIA_SCO.copy('scoVerify')">${esc(t("copy"))}</button></div>`:""}</div>`;
}
async function openEv(id){ ST.ev=id; ST.draft={}; ST.msg=""; ST.pend=window.NORIA_OFF?await NORIA_OFF.pendingGrades(id):{}; rerender(); }
function edit(sid,score,mention){ const d=ST.draft[sid]||{}; if(score!==null){ d.score=score; if(score!=="") d.mention=null; } if(mention!==null){ d.mention=mention||null; } ST.draft[sid]=d; }
async function saveGrades(){
  const ev=C[`/api/evaluations/${ST.ev}`]; if(!ok(ev)) return;
  const g=Object.fromEntries((ev.grades||[]).map(x=>[x.student_id,x]));
  let reason=null;
  if(ev.status==="publiee"){ reason=window.prompt(t("reason")); if(!reason) return; }
  const ops=[];
  for(const [sid,d] of Object.entries(ST.draft)){
    const n=Number(sid); const op={kind:"grade",evaluation_id:ev.id,student_id:n,base_version:g[n]?g[n].version:0};
    if(d.mention) op.mention=d.mention; else if(d.score!==""&&d.score!=null){ const v=Number(String(d.score).replace(",",".")); if(!Number.isFinite(v)||v<0||v>ev.max_score){ toast(`0 – ${ev.max_score}`); return; } op.score=v; } else continue;
    op.max_score=ev.max_score; // barème vu à la saisie : refusé au serveur s'il a changé entre-temps (saisie hors ligne)
    if(reason) op.reason=reason; ops.push(op);
  }
  if(!ops.length) return;
  await NORIA_OFF.enqueue(ops);
  ST.msg=t("queued")(ops.length); ST.draft={};
  ST.pend=await NORIA_OFF.pendingGrades(ev.id); lastPending=null;
  rerender();
}
async function createEv(f){
  const r=await act(()=>post("/api/evaluations",{class_id:Number(ST.cls),term_id:Number(ST.term),subject_id:Number(f.subject.value),title:f.title.value,day:f.day.value,max_score:readMax(f.max),coefficient:Number(f.coef.value)}));
  if(!r) return; if(r.status!==200){ toast(failMsg(r)); return; }
  invalidate("/api/evaluations"); openEv(r.body.id);
}
async function setMax(f){
  const m=readMax(f.max); if(m==null){ toast(`0 < ${t("max")} ≤ 1000`); return; }
  const r=await act(()=>patch(`/api/evaluations/${ST.ev}`,{max_score:m})); if(!r) return; if(r.status!==200){ toast(failMsg(r)); return; }
  ST.msg=t("maxChanged")(r.body.max_score); invalidate("/api/evaluations"); rerender();
}
async function move(action){
  let body={}; if(action==="rouvrir"){ const m=window.prompt(t("reason")); if(!m) return; body.reason=m; }
  const r=await act(()=>post(`/api/evaluations/${ST.ev}/${action}`,body)); if(!r) return;
  if(r.status!==200){ toast(failMsg(r)); return; }
  invalidate("/api/evaluations"); toast(t("st")[r.body.status]); rerender();
}
async function issue(sid){
  const r=await act(()=>post("/api/report-cards",{student_id:sid,term_id:Number(ST.term)})); if(!r) return;
  if(r.status!==200){ toast(failMsg(r)); return; }
  ST.issued=r.body; invalidate("/api/report-cards"); rerender();
}
async function pdf(id){
  if(!navigator.onLine){ toast(t("needNet")); return; }
  const r=await fetch(`/api/report-cards/${id}/pdf`,{credentials:"same-origin",cache:"no-store"});
  if(!r.ok){ toast(t("err")+r.status); return; }
  const b=await r.blob(); const a=document.createElement("a"); a.href=URL.createObjectURL(b);
  a.download=((r.headers.get("content-disposition")||"").match(/filename="?([^";]+)/)||[])[1]||"bulletin.pdf"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
function copy(id){ const el=document.getElementById(id); if(!el) return; el.select();
  (navigator.clipboard?navigator.clipboard.writeText(el.value):Promise.reject()).then(()=>toast(t("copied")),()=>{ try{ document.execCommand("copy"); toast(t("copied")); }catch(e){} }); }

/* ---------- familles ---------- */
function family(){
  const tm=terms(); if(!tm) return `<h2>${t("grades")}</h2>${wait}`;
  let h=`<div class="row sp"><h2 style="margin:0">${esc(t("grades"))}</h2><label class="small">${esc(t("term"))} ${sel("scoTerm",tm.map(x=>[x.id,x.name]),ST.term,"NORIA_SCO.setTerm(this.value)")}</label></div>`;
  for(const k of S.students){
    const gr=get(`/api/students/${k.serverId}/grades?term_id=${ST.term}`), av=get(`/api/students/${k.serverId}/averages?term_id=${ST.term}`), rc=get(`/api/report-cards?student_id=${k.serverId}`);
    h+=`<div class="card sco-kid" style="margin-top:10px"><h3>${esc(k.firstName)} ${esc(k.lastName)}</h3>`;
    if(!ok(gr)){ h+=wait+"</div>"; continue; }
    if(gr.__stale) h+=`<p class="small mut">${esc(t("off"))}</p>`;
    h+=gr.length?`<table class="sco-tab"><tbody>${gr.map(g=>`<tr><td>${esc(g.subject)}<br><span class="small mut">${esc(g.title)} · ${esc(g.day)}</span></td><td class="sco-note"><b>${g.mention?esc(t(g.mention)):esc(String(g.score))+"/"+g.max_score}</b></td></tr>`).join("")}</tbody></table>`:`<p class="mut small">${esc(t("noPub"))}</p>`;
    if(ok(av)&&av.general!=null) h+=`<p class="sco-avg">${esc(t("general"))} : <b>${esc(String(av.general))}/${av.scale}</b> <span class="small mut">${av.subjects.filter(s=>s.average!=null).map(s=>`${esc(s.name)} ${s.average}`).join(" · ")}</span></p>`;
    if(ok(rc)&&rc.length) h+=`<div class="toolbar">${rc.filter(r=>!r.revoked_at).map(r=>`<button class="ghost" onclick="NORIA_SCO.pdf(${r.id})">${esc(t("rc1"))} ${esc(r.term)} · ${esc(t("pdf"))}</button>`).join("")}</div>`;
    h+="</div>";
  }
  return h;
}

/* ---------- annonces et calendrier ---------- */
function comms(state){
  S=state;
  const an=get("/api/announcements"), evs=get("/api/events");
  const auds=has("direction","secretariat")?["ecole","classe","parents","enseignants"]:has("enseignant")?["classe"]:[];
  const audSel=`<label class="fld">${esc(t("aud"))}<select name="aud">${auds.map(a=>`<option value="${a}">${esc(t("auds")[a])}</option>`).join("")}</select></label>
    <label class="fld">${esc(t("cls"))}<select name="cls">${S.classes.map(c=>`<option value="${c.serverId}">${esc(c.name)}</option>`).join("")}</select></label>`;
  const audLbl=x=>x.audience==="classe"?(x.class_name||t("auds").classe):t("auds")[x.audience];
  return `<h2 style="margin:0">${esc(t("ann"))}</h2><div class="grid g2" style="margin-top:10px"><div>
  ${auds.length?`<details class="card sco-new"><summary>${esc(t("newAnn"))}</summary><form onsubmit="event.preventDefault();NORIA_SCO.postAnn(this)">
    <label class="fld">${esc(t("title"))}<input name="title" required maxlength="120"></label><label class="fld">${esc(t("body"))}<textarea name="body" required maxlength="2000" rows="3"></textarea></label>
    ${audSel}<button type="submit">${esc(t("newAnn"))}</button></form></details>`:""}
  ${!ok(an)?wait:an.length?an.map(a=>`<div class="card sco-ann" style="margin-bottom:10px"><h3>${esc(a.title)}</h3><div class="small mut">${esc(audLbl(a))} · ${esc(String(a.created_at).slice(0,10))} · ${esc(a.author)}</div><p>${esc(a.body)}</p></div>`).join(""):`<p class="mut small">${esc(t("noAnn"))}</p>`}
  </div><div><div class="card"><h3>${esc(t("cal"))}</h3>${!ok(evs)?wait:evs.length?evs.map(e=>`<div class="small sco-evt"><b>${esc(e.title)}</b><br>${esc(e.starts_on)}${e.ends_on?" → "+esc(e.ends_on):""} · ${esc(audLbl(e))}</div>`).join(""):`<p class="mut small">${esc(t("noEv"))}</p>`}
  ${auds.length?`<details class="sco-new"><summary>${esc(t("add"))}</summary><form onsubmit="event.preventDefault();NORIA_SCO.postEvt(this)">
    <label class="fld">${esc(t("title"))}<input name="title" required maxlength="120"></label><div class="row"><label class="fld">${esc(t("start"))}<input name="start" type="date" required></label><label class="fld">${esc(t("end"))}<input name="end" type="date"></label></div>
    ${audSel}<button type="submit">${esc(t("add"))}</button></form></details>`:""}</div></div></div>`;
}
function audBody(f){ const a=f.aud.value; return a==="classe"?{audience:a,class_id:Number(f.cls.value)}:{audience:a}; }
async function postAnn(f){ const r=await act(()=>post("/api/announcements",{title:f.title.value,body:f.body.value,...audBody(f)})); if(!r) return; if(r.status!==200){ toast(failMsg(r)); return; } invalidate("/api/announcements"); rerender(); }
async function postEvt(f){ const r=await act(()=>post("/api/events",{title:f.title.value,starts_on:f.start.value,ends_on:f.end.value||null,...audBody(f)})); if(!r) return; if(r.status!==200){ toast(failMsg(r)); return; } invalidate("/api/events"); rerender(); }

/* ---------- comptes : invitations ---------- */
function accounts(state){
  S=state;
  const list=get("/api/invitations");
  const roles=has("direction")?["parent","eleve","enseignant","secretariat","comptabilite","bibliotheque","direction"]:["parent","eleve"];
  const R=t("roles");
  return `<h2 style="margin:0">${esc(t("acc"))}</h2><div class="grid g2" style="margin-top:10px"><div class="card"><h3>${esc(t("invite"))}</h3>
  <form id="invForm" onsubmit="event.preventDefault();NORIA_SCO.invite(this)">
   <label class="fld">${esc(t("name"))}<input name="name" required maxlength="80"></label>
   <label class="fld">${esc(t("phone"))}<input name="phone" inputmode="tel" placeholder="+509 …"></label>
   <label class="fld">${esc(t("email"))}<input name="email" type="email" autocapitalize="none"></label>
   <label class="fld">${esc(t("role"))}<select name="role">${roles.map(r=>`<option value="${r}">${esc(R[r]||r)}</option>`).join("")}</select></label>
   <label class="fld">${esc(t("student"))}<select name="student"><option value="">—</option>${S.students.map(s=>`<option value="${s.serverId}">${esc(s.firstName)} ${esc(s.lastName)}</option>`).join("")}</select></label>
   <button type="submit">${esc(t("send"))}</button></form>
  ${ST.inv?`<div class="sco-link" id="invLinkBox"><p class="small"><b>${esc(t("link"))}</b></p><input readonly id="invLink" value="${esc(ST.inv)}"><button class="ghost" onclick="NORIA_SCO.copy('invLink')">${esc(t("copy"))}</button><p class="small mut">${esc(ST.invSent==="envoyé"?t("sentOk")(ST.invCh):ST.invSent==="échec"?t("sentKo"):t("simul"))}</p></div>`:""}</div>
  <div class="card"><h3>${esc(t("invs"))}</h3>${!ok(list)?wait:list.map(i=>{ const exp=Date.parse(/[TZ]/.test(i.expires_at)?i.expires_at:i.expires_at.replace(" ","T")+"Z"); const st=i.used_at?"used":exp<Date.now()?"expired":"waiting";
    return `<div class="row sp sco-inv"><span><b>${esc(i.display_name)}</b> <span class="small mut">${esc(R[i.role]||i.role)} · ${esc(i.phone||i.email||"")}</span></span><span class="row"><span class="badge inv-${st}">${esc(t(st))}</span>${st==="waiting"?`<button class="ghost" onclick="NORIA_SCO.cancelInv(${i.id})">${esc(t("cancel"))}</button>`:""}</span></div>`; }).join("")}</div></div>`;
}
async function invite(f){
  const body={display_name:f.name.value,role:f.role.value,lang:lang()};
  if(f.phone.value.trim()) body.phone=f.phone.value.trim(); if(f.email.value.trim()) body.email=f.email.value.trim();
  if(f.student.value) body.student_id=Number(f.student.value);
  const r=await act(()=>post("/api/invitations",body)); if(!r) return;
  if(r.status!==200){ toast(failMsg(r)); return; }
  ST.inv=location.origin+r.body.link; ST.invSent=r.body.envoi; ST.invCh=r.body.channel; invalidate("/api/invitations"); rerender();
}
async function cancelInv(id){ const r=await act(()=>post(`/api/invitations/${id}/annuler`)); if(!r) return; if(r.status!==200){ toast(failMsg(r)); return; } invalidate("/api/invitations"); rerender(); }

// Quand la file se vide (retour du réseau), on relit l'évaluation ouverte : versions et notes du serveur.
let lastPending=null;
if(window.NORIA_OFF) NORIA_OFF.onChange(async st=>{
  if(st.sending||st.pending===lastPending) return; lastPending=st.pending;
  if(!ST.ev||!S) return;
  ST.pend=await NORIA_OFF.pendingGrades(ST.ev);
  const rf=NORIA_OFF.takeRefused(); const g=rf.filter(r=>r.kind==="grade"); if(g.length) toast(t("err")+g[0].error);
  if(navigator.onLine) invalidate("/api/evaluations");
  rerender();
});
window.NORIA_SCO={maxSel,setMax,acad,comms,accounts,openEv,edit,saveGrades,createEv,move,issue,pdf,copy,postAnn,postEvt,invite,cancelInv,
  setCls:v=>{ ST.cls=Number(v); ST.ev=null; ST.issued=null; rerender(); }, setTerm:v=>{ ST.term=Number(v); ST.ev=null; rerender(); },
  bind:fn=>{ rerender=fn; }, reset:()=>{ Object.keys(C).forEach(k=>delete C[k]); }, label:k=>t(k)};
})();

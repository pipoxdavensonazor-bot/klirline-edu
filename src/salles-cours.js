/* NORIA — Salles de cours (mode serveur) : séance d'une classe enregistrée sur le serveur.
   Infos du cours (classe, matière, enseignant, horaire, ordre du jour), ressources (lien, texte, formule KaTeX, PDF lu avec PDF.js),
   tableau blanc, minuteur, main levée, sondages, mode faible connexion (Jitsi audio seul, PDF chargé à la demande).
   Bibliothèques libres hébergées dans src/vendor (KaTeX MIT, PDF.js Apache 2.0), chargées seulement quand on en a besoin.
   La vidéo reste dans Jitsi (meet.systemli.org) ; NORIA ne stocke ni son ni image. CSP stricte : aucun style ni gestionnaire en ligne. */
(function(){
"use strict";
const esc=window.NORIA_U.esc, safeUrl=window.NORIA_U.safeUrl, ver=window.NORIA_U.v;
const L=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const TX={
 fr:{title:"Salles de cours",intro:"Chaque séance est enregistrée sur le serveur de l'école : horaire, enseignant, ressources, mains levées et sondages. La vidéo passe par Jitsi (gratuit, sans compte).",
  back:"← Retour",hub:"Extensions",list:"Séances",none:"Aucune séance pour vos classes.",newS:"Nouvelle séance",cls:"Classe",subject:"Matière",ttl:"Titre",agenda:"Ordre du jour",
  start:"Début",dur:"Durée (min)",low:"Faible connexion (audio seul)",create:"Créer la séance",enter:"Entrer",teacher:"Enseignant",st:{planifiee:"Planifiée",ouverte:"Ouverte",terminee:"Terminée"},
  open:"Ouvrir la séance",close:"Terminer la séance",reopen:"Rouvrir",lowOn:"Mode faible connexion : activé",lowOff:"Mode faible connexion : désactivé",lowToggle:"Changer",
  join:"Rejoindre le direct (Jitsi)",joinAudio:"Rejoindre en audio seul",leave:"Quitter le direct",liveNote:"Jitsi public meet.systemli.org — démonstration ; ne partagez pas de dossiers d'élèves à l'oral.",
  res:"Ressources",noRes:"Aucune ressource pour cette séance.",addRes:"Ajouter une ressource",kind:"Type",k:{lien:"Lien",texte:"Texte",formule:"Formule (LaTeX)",pdf:"PDF léger"},
  url:"Adresse https://",body:"Contenu",file:"Fichier PDF (700 Ko au plus)",add:"Ajouter",del:"Retirer",openPdf:"Afficher le PDF",dl:"Télécharger",prev:"‹ Page préc.",next:"Page suiv. ›",page:(a,b)=>`Page ${a} / ${b}`,
  board:"Tableau blanc",pen:"Crayon",eraser:"Gomme",clear:"Effacer",png:"Enregistrer en image",boardNote:"Le tableau reste sur cet appareil ; partagez l'écran dans Jitsi pour le montrer.",
  timer:"Minuteur",go:"Démarrer",pause:"Pause",reset:"Remettre",timeUp:"Temps écoulé !",
  hands:"Mains levées",raise:"Lever la main",lower:"Baisser la main",lowerAll:"Baisser toutes les mains",noHands:"Aucune main levée.",handUp:"Votre main est levée.",anon:"Un participant",
  polls:"Sondages",noPolls:"Aucun sondage.",q:"Question",opts:"Choix (un par ligne, 2 à 6)",ask:"Lancer le sondage",vote:"Voter",closeP:"Clore",closed:"Clos",votes:n=>`${n} vote${n>1?"s":""}`,hidden:"Résultats visibles après votre vote.",
  info:"Le cours",when:"Horaire",ends:"fin prévue",in:m=>`commence dans ${m} min`,elapsed:m=>`en cours depuis ${m} min`,done:"Séance terminée",refresh:"Actualiser",err:"Refusé : ",net:"Réseau nécessaire.",saved:"Enregistré.",
  tools:"Outils de l'élève",tipsT:"Conseils",tips:["Coupez votre micro quand vous ne parlez pas.","Levez la main avant de parler ; l'enseignant vous donne la parole.","En faible connexion, laissez la vidéo coupée et téléchargez les PDF après le cours."]},
 ht:{title:"Sal klas",intro:"Chak seyans anrejistre sou sèvè lekòl la : orè, pwofesè, resous, men leve ak sondaj. Videyo a pase nan Jitsi (gratis, san kont).",
  back:"← Retounen",hub:"Ekstansyon",list:"Seyans",none:"Pa gen seyans pou klas ou yo.",newS:"Nouvo seyans",cls:"Klas",subject:"Matyè",ttl:"Tit",agenda:"Lòd dijou",
  start:"Kòmansman",dur:"Dire (min)",low:"Koneksyon fèb (son sèlman)",create:"Kreye seyans lan",enter:"Antre",teacher:"Pwofesè",st:{planifiee:"Planifye",ouverte:"Louvri",terminee:"Fini"},
  open:"Louvri seyans lan",close:"Fini seyans lan",reopen:"Relouvri",lowOn:"Mòd koneksyon fèb : aktive",lowOff:"Mòd koneksyon fèb : dezaktive",lowToggle:"Chanje",
  join:"Antre nan dirèk la (Jitsi)",joinAudio:"Antre ak son sèlman",leave:"Kite dirèk la",liveNote:"Jitsi piblik meet.systemli.org — demonstrasyon ; pa pale de dosye elèv.",
  res:"Resous",noRes:"Pa gen resous pou seyans sa a.",addRes:"Ajoute yon resous",kind:"Kalite",k:{lien:"Lyen",texte:"Tèks",formule:"Fòmil (LaTeX)",pdf:"PDF lejè"},
  url:"Adrès https://",body:"Kontni",file:"Fichye PDF (700 Ko maksimòm)",add:"Ajoute",del:"Retire",openPdf:"Montre PDF la",dl:"Telechaje",prev:"‹ Paj anvan",next:"Paj apre ›",page:(a,b)=>`Paj ${a} / ${b}`,
  board:"Tablo blan",pen:"Kreyon",eraser:"Gòm",clear:"Efase",png:"Anrejistre kòm imaj",boardNote:"Tablo a rete sou aparèy sa a ; pataje ekran an nan Jitsi pou montre l.",
  timer:"Kwonomèt",go:"Kòmanse",pause:"Poze",reset:"Rekòmanse",timeUp:"Tan an fini !",
  hands:"Men leve",raise:"Leve men",lower:"Bese men",lowerAll:"Bese tout men yo",noHands:"Pèsonn pa leve men.",handUp:"Men ou leve.",anon:"Yon patisipan",
  polls:"Sondaj",noPolls:"Pa gen sondaj.",q:"Kesyon",opts:"Chwa (youn pa liy, 2 a 6)",ask:"Lanse sondaj la",vote:"Vote",closeP:"Fèmen",closed:"Fèmen",votes:n=>`${n} vòt`,hidden:"W ap wè rezilta yo apre ou vote.",
  info:"Kou a",when:"Orè",ends:"fen prevwa",in:m=>`ap kòmanse nan ${m} min`,elapsed:m=>`kòmanse depi ${m} min`,done:"Seyans lan fini",refresh:"Rafrechi",err:"Refize : ",net:"Fò gen rezo.",saved:"Anrejistre.",
  tools:"Zouti elèv la",tipsT:"Konsèy",tips:["Koupe mikwo ou lè ou pa pale.","Leve men anvan ou pale ; pwofesè a ba ou laparòl.","Si koneksyon an fèb, kite videyo a koupe epi telechaje PDF yo apre kou a."]}
};
const t=k=>TX[L()][k];
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.json(); }catch(e){} return {status:r.status,body:b};
}
const send=(m,p,b)=>api(p,{method:m,body:JSON.stringify(b||{})}).catch(()=>null);
const get=p=>api(p).catch(()=>null);
function toast(m){ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
const errOf=r=>t("err")+((r&&r.body&&r.body.error)||t("net"));
const fmt=iso=>{ try{ return new Date(iso).toLocaleString(L()==="ht"?"fr-HT":"fr-CA",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}); }catch(e){ return iso; } };
const badge=s=>`<span class="badge ${s==="ouverte"?"b-present":s==="terminee"?"b-pending":"b-borrowed"}">${esc(t("st")[s]||s)}</span>`;

let ROOT=null, ME=null, CUR=null, POLL=null, LIVE=null, PDFV=null;
const isHostRole=()=>ME&&(ME.roles||[]).some(r=>r==="direction"||r==="enseignant");
const alive=()=>ROOT&&ROOT.isConnected;
function stopPoll(){ if(POLL){ clearTimeout(POLL); POLL=null; } }

/* ---------- liste ---------- */
async function render(el){
  ROOT=el; CUR=null; LIVE=null; PDFV=null; stopPoll(); stopTimer();
  el.innerHTML=`<p class="mut">…</p>`;
  if(!ME){ const m=await get("/api/me"); ME=m&&m.status===200?m.body:{roles:[]}; }
  const [s,c]=await Promise.all([get("/api/salles"),get("/api/classes")]);
  if(!alive()) return;
  if(!s||s.status!==200){ el.innerHTML=`<div class="badbox">${esc(errOf(s))}</div>`; return; }
  const classes=c&&c.status===200?c.body:[];
  const d=new Date(Date.now()+3600e3); d.setMinutes(0,0,0);
  const local=new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,16);
  el.innerHTML=`<h2 class="u6">${esc(t("title"))}</h2><p class="small mut">${esc(t("intro"))}</p>
  ${isHostRole()&&classes.length?`<details class="u8 card sal-new"><summary><b>${esc(t("newS"))}</b></summary><form id="salNew" data-action-submit="NORIA_SAL.create" novalidate><div class="grid g2">
   <label class="fld">${esc(t("cls"))}<select name="class_id">${classes.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></label>
   <label class="fld">${esc(t("subject"))}<input name="subject" maxlength="80"></label>
   <label class="fld">${esc(t("ttl"))} *<input name="title" maxlength="120" required></label>
   <label class="fld">${esc(t("start"))}<input name="starts_at" type="datetime-local" value="${local}"></label>
   <label class="fld">${esc(t("dur"))}<input name="duration_min" type="number" min="5" max="240" value="45"></label>
   <label class="chk"><input type="checkbox" name="low_data"> ${esc(t("low"))}</label></div>
   <label class="fld">${esc(t("agenda"))}<textarea name="agenda" rows="3" maxlength="2000"></textarea></label><button type="submit">${esc(t("create"))}</button></form></details>`:""}
  <h3 class="u8">${esc(t("list"))} (${s.body.length})</h3>
  ${s.body.length?`<div class="grid g2">${s.body.map(x=>`<article class="card sal-card"><div class="row sp"><b>${esc(x.title)}</b>${badge(x.status)}</div>
    <div class="small mut">${esc(x.class_name)}${x.subject?" · "+esc(x.subject):""}${x.teacher_name?" · "+esc(x.teacher_name):""}</div>
    <div class="small">${esc(fmt(x.starts_at))} · ${Number(x.duration_min)} min${Number(x.low_data)?" · "+esc(t("low")):""} · ${Number(x.resources)} ${esc(t("res").toLowerCase())}</div>
    <button class="soft" data-action="NORIA_SAL.enter" data-a0="n:${x.id}">${esc(t("enter"))}</button></article>`).join("")}</div>`:`<div class="card mut">${esc(t("none"))}</div>`}`;
}
async function create(){
  const f=document.getElementById("salNew"); if(!f) return; const e=f.elements;
  const start=e.starts_at.value?new Date(e.starts_at.value).toISOString():new Date().toISOString();
  const r=await send("POST","/api/salles",{class_id:Number(e.class_id.value),subject:e.subject.value,title:e.title.value,agenda:e.agenda.value,starts_at:start,duration_min:Number(e.duration_min.value||45),low_data:e.low_data.checked});
  if(!r||r.status!==200){ toast(errOf(r)); return; }
  toast(t("saved")); CUR=r.body; paintRoom();
}

/* ---------- salle ---------- */
async function enter(id){ const r=await get(`/api/salles/${Number(id)}`); if(!r||r.status!==200){ toast(errOf(r)); return; } CUR=r.body; LIVE=null; PDFV=null; paintRoom(); }
function schedule(){
  stopPoll(); if(!CUR||!alive()) return;
  const ms=CUR.session.status==="terminee"?0:(CUR.session.low_data?45000:15000);
  if(ms) POLL=setTimeout(async()=>{ if(!alive()||!CUR) return; if(document.hidden){ schedule(); return; }
    const r=await get(`/api/salles/${CUR.session.id}`); if(r&&r.status===200&&alive()&&CUR&&r.body.session.id===CUR.session.id){ CUR=r.body; paintLive(); } schedule(); },ms);
}
function when(){
  const s=CUR.session, now=Date.parse(CUR.now)||Date.now(), st=Date.parse(s.starts_at), end=st+Number(s.duration_min)*6e4;
  if(s.status==="terminee") return t("done");
  if(now<st) return t("in")(Math.ceil((st-now)/6e4));
  return t("elapsed")(Math.floor((now-st)/6e4))+` · ${t("ends")} ${new Date(end).toLocaleTimeString(L()==="ht"?"fr-HT":"fr-CA",{hour:"2-digit",minute:"2-digit"})}`;
}
function paintRoom(){
  if(!alive()||!CUR) return; const s=CUR.session, h=CUR.host;
  ROOT.innerHTML=`<div class="row sp"><button class="ghost" data-action="NORIA_SAL.list">${esc(t("back"))} · ${esc(t("list"))}</button><button class="ghost small" data-action="NORIA_SAL.reload">${esc(t("refresh"))}</button></div>
  <section class="board sal-head"><div class="board-kicker">${esc(s.class_name)}${s.subject?" · "+esc(s.subject):""}</div><h3 class="board-title">${esc(s.title)}</h3>
   <div class="row sal-meta"><span>${badge(s.status)}</span><span>${esc(t("teacher"))} : <b>${esc(s.teacher_name||"—")}</b></span><span>${esc(t("when"))} : ${esc(fmt(s.starts_at))} · ${Number(s.duration_min)} min</span><span id="salWhen" class="mut">${esc(when())}</span></div>
   ${s.agenda?`<pre class="sal-agenda">${esc(s.agenda)}</pre>`:""}</section>
  <div class="card sal-ctl"><div class="row">
   ${h?(s.status!=="ouverte"?`<button data-action="NORIA_SAL.status" data-a0="s:ouverte">${esc(s.status==="terminee"?t("reopen"):t("open"))}</button>`:`<button class="danger" data-action="NORIA_SAL.status" data-a0="s:terminee">${esc(t("close"))}</button>`):""}
   <span class="small">${esc(s.low_data?t("lowOn"):t("lowOff"))}</span>${h?`<button class="ghost small" data-action="NORIA_SAL.lowData">${esc(t("lowToggle"))}</button>`:""}
   ${s.status==="ouverte"?(LIVE?`<button class="ghost" data-action="NORIA_SAL.live" data-a0="s:">${esc(t("leave"))}</button>`:`<button class="soft" data-action="NORIA_SAL.live" data-a0="s:audio">${esc(t("joinAudio"))}</button>${s.low_data?"":`<button class="soft" data-action="NORIA_SAL.live" data-a0="s:video">${esc(t("join"))}</button>`}`):""}</div>
   <div id="salLive" class="sal-live"></div></div>
  <div class="sal-grid">
   <section class="card sal-res"><h3>${esc(t("res"))}</h3><div id="salRes"></div>${h?resForm():""}<div id="salPdf" class="sal-pdf"></div></section>
   <aside class="sal-side">
    <section class="card"><h3>${esc(t("hands"))}</h3><div id="salHands"></div></section>
    <section class="card"><h3>${esc(t("polls"))}</h3><div id="salPolls"></div>${h?`<form id="salPoll" class="sal-pollnew" data-action-submit="NORIA_SAL.ask" novalidate><label class="fld">${esc(t("q"))}<input name="question" maxlength="200"></label><label class="fld">${esc(t("opts"))}<textarea name="options" rows="3"></textarea></label><button type="submit" class="small">${esc(t("ask"))}</button></form>`:""}</section>
    <section class="card"><h3>${esc(t("timer"))}</h3><div class="sal-timer"><output id="salClock">${clockTxt()}</output><div class="row"><input id="salMin" type="number" min="1" max="120" value="${Math.round(TIMER.total/60)}" aria-label="min"><button class="small" data-action="NORIA_SAL.timer" data-a0="s:go">${esc(TIMER.run?t("pause"):t("go"))}</button><button class="ghost small" data-action="NORIA_SAL.timer" data-a0="s:reset">${esc(t("reset"))}</button></div></div></section>
    <section class="card"><h3>${esc(t("tipsT"))}</h3><ul class="small">${t("tips").map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section>
   </aside></div>
  <section class="card sal-boardw"><div class="row sp"><h3>${esc(t("board"))}</h3><div class="row"><button class="small" data-action="NORIA_SAL.tool" data-a0="s:pen">${esc(t("pen"))}</button>
   ${["#111111","#c62828","#1565c0","#2e7d32"].map(c=>`<button class="sal-sw sal-sw-${c.slice(1)}" aria-label="${c}" data-action="NORIA_SAL.color" data-a0="s:${c}"></button>`).join("")}
   <button class="ghost small" data-action="NORIA_SAL.tool" data-a0="s:eraser">${esc(t("eraser"))}</button><button class="ghost small" data-action="NORIA_SAL.clear">${esc(t("clear"))}</button><button class="ghost small" data-action="NORIA_SAL.png">${esc(t("png"))}</button></div></div>
   <canvas id="salCanvas" class="sal-canvas" width="1200" height="600"></canvas><p class="small mut">${esc(t("boardNote"))}</p></section>`;
  initBoard(); paintLive(); paintLiveFrame(); schedule();
}
function resForm(){
  return `<details class="sal-add"><summary>${esc(t("addRes"))}</summary><form id="salResF" data-action-submit="NORIA_SAL.addRes" novalidate>
  <label class="fld">${esc(t("kind"))}<select name="kind" data-action-change="NORIA_SAL.kindSel" data-a0="v">${Object.keys(t("k")).map(k=>`<option value="${k}">${esc(t("k")[k])}</option>`).join("")}</select></label>
  <label class="fld">${esc(t("ttl"))}<input name="title" maxlength="120"></label>
  <label class="fld" data-k="lien">${esc(t("url"))}<input name="url" type="url" maxlength="500"></label>
  <label class="fld" data-k="texte formule" hidden>${esc(t("body"))}<textarea name="body" rows="3" maxlength="4000"></textarea></label>
  <label class="fld" data-k="pdf" hidden>${esc(t("file"))}<input name="file" type="file" accept="application/pdf"></label>
  <button type="submit" class="small">${esc(t("add"))}</button></form></details>`;
}
function kindSel(k){ document.querySelectorAll("#salResF [data-k]").forEach(x=>{ x.hidden=!x.dataset.k.split(" ").includes(k); }); }
function paintLive(){
  if(!alive()||!CUR) return; const h=CUR.host;
  const w=document.getElementById("salWhen"); if(w) w.textContent=when();
  const r=document.getElementById("salRes");
  if(r){ r.innerHTML=CUR.resources.length?`<ul class="sal-rl">${CUR.resources.map(x=>`<li class="sal-r sal-r-${esc(x.kind)}"><div class="row sp"><b>${esc(x.title)}</b><span class="badge">${esc(t("k")[x.kind]||x.kind)}</span></div>
     ${x.kind==="lien"?`<a href="${esc(safeUrl(x.url)||"#")}" target="_blank" rel="noopener noreferrer">${esc(x.url)}</a>`:""}
     ${x.kind==="texte"?`<p class="sal-txt">${esc(x.body)}</p>`:""}
     ${x.kind==="formule"?`<div class="sal-tex" data-tex="${esc(x.body)}">${esc(x.body)}</div>`:""}
     ${x.kind==="pdf"?`<div class="row"><button class="small soft" data-action="NORIA_SAL.pdf" data-a0="n:${x.id}">${esc(t("openPdf"))}</button><a class="small" href="/api/salles/${CUR.session.id}/ressources/${x.id}/fichier" download>${esc(t("dl"))} (${Math.ceil(Number(x.size||0)/1024)} Ko)</a></div>`:""}
     ${h?`<button class="ghost small danger" data-action="NORIA_SAL.delRes" data-a0="n:${x.id}">${esc(t("del"))}</button>`:""}</li>`).join("")}</ul>`:`<p class="small mut">${esc(t("noRes"))}</p>`;
    if(r.querySelector("[data-tex]")) tex(r); }
  const hd=document.getElementById("salHands");
  if(hd){ const open=CUR.session.status==="ouverte";
    hd.innerHTML=h?(CUR.hands.length?`<ol class="sal-hl">${CUR.hands.map(x=>`<li>${esc(x.name||t("anon"))} <span class="mut small">${esc(new Date(x.raised_at).toLocaleTimeString("fr-CA",{hour:"2-digit",minute:"2-digit"}))}</span> <button class="ghost small" data-action="NORIA_SAL.lowerOne" data-a0="n:${x.id}">${esc(t("lower"))}</button></li>`).join("")}</ol><button class="ghost small" data-action="NORIA_SAL.lowerOne" data-a0="n:0">${esc(t("lowerAll"))}</button>`:`<p class="small mut">${esc(t("noHands"))}</p>`)
      :`<p class="small">${CUR.my_hand?`<b>✋ ${esc(t("handUp"))}</b>`:""} <span class="mut">(${CUR.hands.length})</span></p>${open?`<button class="${CUR.my_hand?"ghost":""}" data-action="NORIA_SAL.hand" data-a0="${CUR.my_hand?"n:0":"n:1"}">${esc(CUR.my_hand?t("lower"):"✋ "+t("raise"))}</button>`:""}`; }
  const pl=document.getElementById("salPolls");
  if(pl){ pl.innerHTML=CUR.polls.length?CUR.polls.map(p=>`<div class="sal-poll"><b>${esc(p.question)}</b> ${p.is_open?"":`<span class="badge b-pending">${esc(t("closed"))}</span>`}
     ${p.counts?`<ul class="sal-bars">${p.options.map((o,i)=>`<li${p.mine===i?' class="mine"':""}><span>${esc(o)}</span><progress class="kl-prog" max="${Math.max(1,p.total)}" value="${p.counts[i]}"></progress><small>${p.counts[i]}</small></li>`).join("")}</ul><small class="mut">${esc(t("votes")(p.total))}</small>`:`<small class="mut">${esc(t("hidden"))}</small>`}
     ${p.is_open&&!h&&p.mine===null&&CUR.session.status==="ouverte"?`<div class="row">${p.options.map((o,i)=>`<button class="small soft" data-action="NORIA_SAL.vote" data-a0="n:${p.id}" data-a1="n:${i}">${esc(o)}</button>`).join("")}</div>`:""}
     ${p.is_open&&h?`<button class="ghost small" data-action="NORIA_SAL.closePoll" data-a0="n:${p.id}">${esc(t("closeP"))}</button>`:""}</div>`).join(""):`<p class="small mut">${esc(t("noPolls"))}</p>`; }
}
async function act(m,p,b){ const r=await send(m,p,b); if(!r||r.status!==200){ toast(errOf(r)); return null; } return r; }
async function reload(){ if(!CUR) return; const r=await get(`/api/salles/${CUR.session.id}`); if(r&&r.status===200){ CUR=r.body; paintLive(); } }
async function status(s){ const r=await act("PATCH",`/api/salles/${CUR.session.id}`,{status:s}); if(r){ CUR=r.body; if(s!=="ouverte") LIVE=null; paintRoom(); } }
async function lowData(){ const r=await act("PATCH",`/api/salles/${CUR.session.id}`,{low_data:!CUR.session.low_data}); if(r){ CUR=r.body; if(CUR.session.low_data&&LIVE==="video") LIVE="audio"; paintRoom(); } }
async function hand(up){ if(await act("POST",`/api/salles/${CUR.session.id}/main`,{raised:!!up})) reload(); }
async function lowerOne(hid){ if(await act("POST",`/api/salles/${CUR.session.id}/mains/baisser`,hid?{hand_id:hid}:{})) reload(); }
async function ask(){ const f=document.getElementById("salPoll"); const options=f.elements.options.value.split("\n").map(x=>x.trim()).filter(Boolean);
  if(await act("POST",`/api/salles/${CUR.session.id}/sondages`,{question:f.elements.question.value,options})){ f.reset(); reload(); } }
async function vote(pid,i){ if(await act("POST",`/api/salles/${CUR.session.id}/sondages/${pid}/vote`,{choice:i})) reload(); }
async function closePoll(pid){ if(await act("POST",`/api/salles/${CUR.session.id}/sondages/${pid}/fermer`,{})) reload(); }
async function delRes(rid){ const r=await api(`/api/salles/${CUR.session.id}/ressources/${rid}`,{method:"DELETE"}).catch(()=>null); if(!r||r.status!==200){ toast(errOf(r)); return; } reload(); }
async function addRes(){
  const f=document.getElementById("salResF"); const e=f.elements; const kind=e.kind.value; const b={kind,title:e.title.value};
  if(kind==="lien") b.url=e.url.value; else if(kind==="pdf"){ const file=e.file.files[0]; if(!file){ toast(t("file")); return; }
    if(file.size>700*1024){ toast(errOf({body:{error:"PDF > 700 Ko"}})); return; }
    b.data=await new Promise((ok,ko)=>{ const fr=new FileReader(); fr.onload=()=>ok(String(fr.result).split(",")[1]||""); fr.onerror=ko; fr.readAsDataURL(file); });
    if(!b.title) b.title=file.name.slice(0,120); }
  else b.body=e.body.value;
  if(await act("POST",`/api/salles/${CUR.session.id}/ressources`,b)){ f.reset(); kindSel("lien"); toast(t("saved")); reload(); }
}

/* ---------- KaTeX (MIT) : rendu DOM, compatible CSP (pas de HTML en chaîne) ---------- */
let katexP=null;
function loadKatex(){
  if(window.katex) return Promise.resolve(window.katex);
  if(!katexP) katexP=new Promise((ok,ko)=>{ const l=document.createElement("link"); l.rel="stylesheet"; l.href=ver("src/vendor/katex/katex.min.css"); document.head.appendChild(l);
    const s=document.createElement("script"); s.src=ver("src/vendor/katex/katex.min.js"); s.onload=()=>ok(window.katex); s.onerror=()=>{ katexP=null; ko(new Error("katex")); }; document.head.appendChild(s); });
  return katexP;
}
function tex(root){ loadKatex().then(k=>root.querySelectorAll("[data-tex]").forEach(el=>{ try{ k.render(el.dataset.tex,el,{throwOnError:false,displayMode:true,trust:false,maxSize:20,maxExpand:200}); }catch(e){} })).catch(()=>{}); }

/* ---------- PDF.js (Apache 2.0) : chargé au clic, jamais automatiquement (faible connexion) ---------- */
let pdfjsP=null;
function loadPdfjs(){ if(!pdfjsP) pdfjsP=import(new URL(ver("src/vendor/pdfjs/pdf.min.mjs"),location.href).href).then(m=>{ m.GlobalWorkerOptions.workerSrc=new URL(ver("src/vendor/pdfjs/pdf.worker.min.mjs"),location.href).href; return m; }).catch(e=>{ pdfjsP=null; throw e; }); return pdfjsP; }
async function pdf(rid){
  const box=document.getElementById("salPdf"); if(!box) return; box.innerHTML=`<p class="mut small">…</p>`;
  try{ const lib=await loadPdfjs();
    const doc=await lib.getDocument({url:`/api/salles/${CUR.session.id}/ressources/${rid}/fichier`,withCredentials:true,isEvalSupported:false,enableXfa:false}).promise;
    PDFV={doc,page:1,rid}; drawPdf();
  }catch(e){ box.innerHTML=`<p class="badbox small">PDF : ${esc(e.message||"erreur")}</p>`; }
}
async function drawPdf(){
  const box=document.getElementById("salPdf"); if(!box||!PDFV) return; const {doc,page}=PDFV;
  box.innerHTML=`<div class="row sp"><button class="ghost small" data-action="NORIA_SAL.pdfPage" data-a0="n:-1"${page<=1?" disabled":""}>${esc(t("prev"))}</button><span class="small">${esc(t("page")(page,doc.numPages))}</span><button class="ghost small" data-action="NORIA_SAL.pdfPage" data-a0="n:1"${page>=doc.numPages?" disabled":""}>${esc(t("next"))}</button></div><canvas class="sal-pdfc"></canvas>`;
  const p=await doc.getPage(page); const w=Math.min(900,box.clientWidth||600); const v0=p.getViewport({scale:1}); const vp=p.getViewport({scale:w/v0.width});
  const c=box.querySelector("canvas"); c.width=Math.floor(vp.width); c.height=Math.floor(vp.height);
  await p.render({canvasContext:c.getContext("2d"),viewport:vp,canvas:c}).promise;
}
function pdfPage(d){ if(!PDFV) return; PDFV.page=Math.min(PDFV.doc.numPages,Math.max(1,PDFV.page+d)); drawPdf(); }

/* ---------- Jitsi (Apache 2.0, serveur public) : audio seul en faible connexion ---------- */
function live(mode){ LIVE=mode||null; paintRoom(); }
function paintLiveFrame(){
  const box=document.getElementById("salLive"); if(!box) return; box.replaceChildren(); if(!LIVE||!CUR) return;
  const s=CUR.session; const room="noria-"+(ME&&ME.schoolId||"x")+"-salle-"+s.id+"-"+String(s.created_at||"").replace(/\D/g,"").slice(-6);
  const audio=LIVE==="audio"||s.low_data;
  const cfg=["config.prejoinPageEnabled=true","config.startWithAudioMuted=true","config.disableDeepLinking=true",
    audio?"config.startAudioOnly=true":"config.startWithVideoMuted=true",audio?"config.startWithVideoMuted=true":"",audio?"config.resolution=180":"config.resolution=360",
    "config.channelLastN="+(audio?"1":"4")].filter(Boolean).join("&");
  const f=document.createElement("iframe"); f.className="sal-jitsi"; f.title="Jitsi";
  f.allow="camera; microphone; fullscreen; display-capture; autoplay"; f.referrerPolicy="strict-origin-when-cross-origin";
  f.src="https://meet.systemli.org/"+encodeURIComponent(room)+"#"+cfg+"&userInfo.displayName="+encodeURIComponent(JSON.stringify(ME&&ME.name||""));
  const n=document.createElement("p"); n.className="small mut"; n.textContent=t("liveNote");
  box.append(f,n);
}

/* ---------- minuteur (local) ---------- */
const TIMER={total:600,left:600,run:false,h:null};
function stopTimer(){ if(TIMER.h){ clearInterval(TIMER.h); TIMER.h=null; } TIMER.run=false; }
function clockTxt(){ const m=Math.floor(TIMER.left/60), s=TIMER.left%60; return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; }
function timer(cmd){
  const inp=document.getElementById("salMin"); const out=()=>{ const o=document.getElementById("salClock"); if(o) o.textContent=clockTxt(); };
  if(cmd==="reset"){ stopTimer(); TIMER.total=TIMER.left=Math.max(1,Math.min(120,Number(inp&&inp.value)||10))*60; out(); }
  else if(TIMER.run){ stopTimer(); }
  else { if(TIMER.left<=0||TIMER.left===TIMER.total){ TIMER.total=TIMER.left=Math.max(1,Math.min(120,Number(inp&&inp.value)||10))*60; }
    TIMER.run=true; TIMER.h=setInterval(()=>{ TIMER.left=Math.max(0,TIMER.left-1); out(); if(!TIMER.left){ stopTimer(); toast(t("timeUp")); syncBtn(); } if(!alive()) stopTimer(); },1000); }
  syncBtn();
}
function syncBtn(){ const b=document.querySelector('[data-action="NORIA_SAL.timer"][data-a0="s:go"]'); if(b) b.textContent=TIMER.run?t("pause"):t("go"); }

/* ---------- tableau blanc (canvas maison, aucune dépendance) ---------- */
const BD={color:"#111111",tool:"pen",img:null};
function initBoard(){
  const c=document.getElementById("salCanvas"); if(!c) return; const g=c.getContext("2d");
  g.fillStyle="#ffffff"; g.fillRect(0,0,c.width,c.height); if(BD.img) g.putImageData(BD.img,0,0);
  g.lineCap="round"; g.lineJoin="round"; let down=false, last=null;
  const pt=e=>{ const r=c.getBoundingClientRect(); return [(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height]; };
  c.addEventListener("pointerdown",e=>{ down=true; last=pt(e); c.setPointerCapture(e.pointerId); });
  c.addEventListener("pointermove",e=>{ if(!down) return; const p=pt(e); g.strokeStyle=BD.tool==="eraser"?"#ffffff":BD.color; g.lineWidth=BD.tool==="eraser"?28:4;
    g.beginPath(); g.moveTo(last[0],last[1]); g.lineTo(p[0],p[1]); g.stroke(); last=p; });
  const up=()=>{ if(down){ down=false; BD.img=g.getImageData(0,0,c.width,c.height); } };
  c.addEventListener("pointerup",up); c.addEventListener("pointercancel",up);
}
function clear(){ BD.img=null; initBoardFill(); }
function initBoardFill(){ const c=document.getElementById("salCanvas"); if(!c) return; const g=c.getContext("2d"); g.fillStyle="#ffffff"; g.fillRect(0,0,c.width,c.height); }
function png(){ const c=document.getElementById("salCanvas"); if(!c) return; const a=document.createElement("a"); a.href=c.toDataURL("image/png"); a.download="tableau-"+(CUR?CUR.session.id:"")+".png"; a.click(); }

window.NORIA_SAL=Object.freeze({render,create,enter,list:()=>render(ROOT),reload,status,lowData,live,hand,lowerOne,ask,vote,closePoll,addRes,delRes,kindSel,pdf,pdfPage,timer,
  tool:k=>{ BD.tool=k; },color:c=>{ BD.color=c; BD.tool="pen"; },clear,png});
})();

/* Klirline EXTENSIONS — couche additive (ne modifie aucun fichier existant).
   Stockage isolé klirline_ext_v1. Lecture seule sur klirline_school_v1.
   Seule écriture croisée : "Appliquer au registre" (explicite + rechargement). */
(function(){
"use strict";
const XD = window.KLXD;
let X = XD.loadX();
let XROUTE = null;
let liveWanted = false;
const save = ()=>XD.saveX(X);
const {esc,safeUrl}=window.NORIA_U;
const money = n=>Number(n||0).toLocaleString("fr-FR").replace(/,/g," ")+" G";
const today = ()=>new Date().toISOString().slice(0,10);
const O = ()=>XD.readOld();
const lang = ()=>{ const o=O(); return (o&&o.lang)||"fr"; };
const T = k=>{ const I=window.KL_I18N||{}; const L=lang(); return (I[L]&&I[L][k])||(I.fr&&I.fr[k])||k; };
const role = ()=>{ const o=O(); return (o&&o.role)||"direction"; };
function toast(m){ const c=document.querySelector("#toasts"); if(!c){ alert(m); return; } const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),3400); }
function dl(name,content,type){ const b=new Blob([content],{type:type||"text/plain"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); }
const csv = rows=>"\uFEFF"+window.NORIA_U.toCSV(rows);
function audit(action,detail){ try{ X.audit.unshift({at:new Date().toLocaleString(),by:role(),action,detail:String(detail||"").slice(0,220)}); X.audit=X.audit.slice(0,300); save(); }catch(e){} }
function online(){ const o=O(); return o?!!o.online:true; }
function queuePush(kind,ref){ X.queue.push({kind,ref,at:new Date().toLocaleString(),by:role(),st:online()?"synced":"pending"}); if(online()){ X.queue=X.queue.filter(q=>q.st!=="synced"); } save(); }
function flushQ(){ const n=X.queue.filter(q=>q.st==="pending").length; X.queue=[]; save(); return n; }

/* ---------- lens sur l'ancien registre ---------- */
const stu = id=>{ const o=O(); return o?o.students.find(s=>s.id===id):null; };
const cls = id=>{ const o=O(); return o?o.classes.find(c=>c.id===id):null; };
function kidsOf(){ const o=O(); if(!o) return []; if(role()==="parent") return o.students.filter(s=>(o.currentUser.parentKids||[]).includes(s.id)); if(role()==="eleve") return o.students.filter(s=>s.id===o.currentUser.studentId); return o.students; }
function teacherCls(){ const o=O(); if(!o) return []; if(role()==="enseignant") return o.classes.filter(c=>["c7a","c8a"].includes(c.id)); return o.classes; }
function classScope(){ const r=role(); if(r==="enseignant") return teacherCls(); if(r==="parent"||r==="eleve"){ const k=kidsOf(); const ids=[...new Set(k.map(s=>s.classId))]; const o=O(); return o.classes.filter(c=>ids.includes(c.id)); } const o=O(); return o?o.classes:[]; }
function effClass(s){ const mv=X.movements.filter(m=>m.studentId===s.id&&(m.kind==="mvTr"||m.kind==="mvPro")&&!m.reverted).pop(); return mv?{id:mv.to,via:true}: {id:s.classId}; }
function feeOf(level){ const o=O(); return o&&o.fees?o.fees[level]:null; }
function paidOf(sid){ const o=O(); if(!o) return 0; const p=o.payments.filter(p=>p.studentId===sid).reduce((a,p)=>a+(+p.amount||0),0); const d=(o.discounts||[]).filter(d=>d.studentId===sid).reduce((a,d)=>a+(+d.amount||0),0); const b=X.bourses.filter(b=>b.studentId===sid).reduce((a,b)=>a+(+b.amount||0),0); return p+d+b; }

/* ---------- routes + permissions ---------- */
const XR = [
  {r:"ext-hub", fr:"Extensions", ht:"Ekstansyon", ic:"", roles:["direction","secretariat","enseignant","comptable","bibliothecaire","parent","eleve"]},
  {r:"ext-devoirs", fr:"Devoirs & leçons", ht:"Devwa & leson", ic:"", roles:["direction","secretariat","enseignant","parent","eleve"]},
  {r:"ext-classe", fr:"Classe virtuelle", ht:"Klas vityèl", ic:"", roles:["direction","secretariat","enseignant","parent","eleve"]},
  {r:"ext-reunion", fr:"Centre de réunion", ht:"Sant reyinyon", ic:"", roles:["direction","secretariat","enseignant","parent","eleve"]},
  {r:"ext-visuel", fr:"Classe visuelle", ht:"Klas vityèl", ic:"", roles:["direction","secretariat","enseignant","parent","eleve"]},
  {r:"ext-salles", fr:"Salles de cours", ht:"Sal klas", ic:"", roles:["direction","secretariat","enseignant","parent","eleve"]},
  {r:"ext-discussion", fr:"Discussion", ht:"Diskisyon", ic:"", roles:["direction","enseignant","parent","eleve"]},
  {r:"ext-portails", fr:"Portails", ht:"Pòtay", ic:"", roles:["direction"]},
  {r:"ext-structure", fr:"Structure établissement", ht:"Estrikti lekòl", ic:"", roles:["direction","secretariat"]},
  {r:"ext-inscriptions", fr:"Suivi inscriptions", ht:"Swivi enskripsyon", ic:"", roles:["direction","secretariat"]},
  {r:"ext-presences", fr:"Présences +", ht:"Prezans +", ic:"", roles:["direction","secretariat","enseignant"]},
  {r:"ext-comms", fr:"Communications +", ht:"Kominikasyon +", ic:"", roles:["direction","secretariat","enseignant","parent"]},
  {r:"ext-finances", fr:"Finances +", ht:"Finans +", ic:"", roles:["direction","comptable"]},
  {r:"ext-biblio", fr:"Bibliothèque ouverte", ht:"Bibliyotèk ouvè", ic:"", roles:["direction","secretariat","enseignant","bibliothecaire","parent","eleve"]},
  {r:"ext-rapports", fr:"Rapports +", ht:"Rapò +", ic:"", roles:["direction","secretariat","comptable","enseignant"]},
  {r:"ext-audit", fr:"Audit & données", ht:"Odit & done", ic:"", roles:["direction","comptable","secretariat"]},
  {r:"ext-setup", fr:"Installation d'école", ht:"Enstalasyon lekòl", ic:"", roles:["direction","secretariat"]},
  {r:"ext-comptes", fr:"Comptes & accès", ht:"Kont & aksè", ic:"", roles:["direction"]},
  {r:"ext-impressions", fr:"Impressions", ht:"Enpresyon", ic:"", roles:["direction","secretariat","enseignant","comptable","bibliothecaire"]},
  {r:"ext-pret", fr:"Guichet des prêts", ht:"Giche pre", ic:"", roles:["direction","bibliothecaire"]},
  {r:"ext-cal", fr:"Calendrier +", ht:"Kalendriye +", ic:"", roles:["direction","secretariat","enseignant","parent","eleve"]},
  {r:"ext-pilote", fr:"Validation pilote", ht:"Validasyon pilòt", ic:"", roles:["direction","secretariat"]},
  {r:"ext-continuite", fr:"Continuité scolaire", ht:"Kontinite lekòl", ic:"", roles:["direction","secretariat","enseignant","parent","eleve"]},
];
const CORE_DEFAULT={
  direction:["dashboard","students","classes","attendance","academic","comms","finance","library","reports","settings"],
  secretariat:["dashboard","students","classes","attendance","comms","reports"],
  enseignant:["dashboard","classes","attendance","academic","comms"],
  comptable:["dashboard","students","finance","reports"],
  bibliothecaire:["dashboard","students","library","reports"],
  parent:["dashboard","attendance","academic","comms","finance","library"],
  eleve:["dashboard","academic","library","comms"]
};
const SPACE_DEFAULT={
  direction:["ext-reunion","ext-visuel","ext-discussion","ext-portails"],
  secretariat:["ext-reunion","ext-visuel"],
  enseignant:["ext-reunion","ext-visuel","ext-discussion"],
  comptable:[],
  bibliothecaire:[],
  parent:["ext-reunion","ext-visuel","ext-discussion"],
  eleve:["ext-reunion","ext-visuel","ext-discussion"]
};
const DENY={
  bibliothecaire:["finance","academic","settings"],
  eleve:["finance","students","settings","reports"],
  parent:["students","settings","reports"],
  enseignant:["finance","settings"]
};
const CORE_LBL={dashboard:"Tableau de bord",students:"Élèves",classes:"Classes",attendance:"Présences",academic:"Notes",comms:"Annonces",finance:"Finances",library:"Bibliothèque",reports:"Rapports",settings:"Paramètres"};
const SPACE_LBL={"ext-reunion":"Centre de réunion","ext-visuel":"Classe visuelle","ext-discussion":"Discussion","ext-portails":"Portails"};
const ROLE_LBL={direction:"Direction",secretariat:"Secrétariat",enseignant:"Enseignant",comptable:"Comptabilité",bibliothecaire:"Bibliothèque",parent:"Parent",eleve:"Élève"};
function denied(rn,key){ return ((DENY[rn]||[]).includes(key)); }
function ensurePortals(){
  if(!X.portals){
    X.portals={};
    Object.keys(CORE_DEFAULT).forEach(rn=>{ X.portals[rn]={core:CORE_DEFAULT[rn].slice(), spaces:(SPACE_DEFAULT[rn]||[]).slice()}; });
    save();
  }
  Object.keys(CORE_DEFAULT).forEach(rn=>{
    if(!X.portals[rn]) X.portals[rn]={core:CORE_DEFAULT[rn].slice(), spaces:(SPACE_DEFAULT[rn]||[]).slice()};
    if(!Array.isArray(X.portals[rn].core)) X.portals[rn].core=CORE_DEFAULT[rn].slice();
    if(!Array.isArray(X.portals[rn].spaces)) X.portals[rn].spaces=(SPACE_DEFAULT[rn]||[]).slice();
  });
  return X.portals;
}
function spacesOf(rn){
  const p=ensurePortals()[rn];
  const list=p?p.spaces.slice():(SPACE_DEFAULT[rn]||[]).slice();
  if(rn==="direction" && !list.includes("ext-portails")) list.push("ext-portails");
  return list;
}
const canX = r=>{
  if(r==="ext-portails") return role()==="direction";
  // Salles de cours : enregistrées sur le serveur (lot 6) ; mêmes droits que la classe visuelle.
  if(r==="ext-salles") return document.documentElement.dataset.backend==="server"&&canX("ext-visuel");
  if(Object.prototype.hasOwnProperty.call(SPACE_LBL,r)) return spacesOf(role()).includes(r);
  const m=XR.find(x=>x.r===r); return m&&m.roles.includes(role());
};
window.KL_PORTAL={
  allow(rn, module, base){
    const p=ensurePortals()[rn];
    if(!p) return base;
    if(denied(rn, module)) return false;
    if(rn==="direction" && module==="settings") return true;
    return p.core.includes(module);
  }
};
const lbl = m=>lang()==="ht"?m.ht:m.fr;

/* ---------- hub ---------- */
function vHub(){
  const pend = X.queue.length;
  return `<div class="row sp"><h2 class="u6">${esc(T("extHub"))}</h2>${pend?`<span class="badge b-pending">${pend} ${esc(T("pendingX"))}</span> <button class="ghost" data-action="KLX.sync">${esc(T("syncX"))}</button>`:`<span class="badge b-pending">${lang()==="ht"?"demo lokal":"démo locale"}</span>`}</div>
  <div class="notice small">${esc(T("extIntro"))}</div>
  <div class="u8 card"><h3> ${lang()==="ht"?"Pakou gide — 3 priyorite":"Parcours guidés — 3 priorités"}</h3>
  <div class="small mut">${lang()==="ht"?"Fè apèl • dosye pitit • pibliye anons. Etap pa etap, pou tès pilòt.":"Faire l'appel • dossier d'un enfant • publier une annonce. Étape par étape, pour les tests pilotes."}</div>
  <div class="toolbar" id="xTours">${(window.KLX&&window.KLX.toursList?window.KLX.toursList():[]).map(t=>`<button class="soft" data-action="KLX.tour" data-a0="s:${esc(t.id)}">${esc(t.title)}${t.done?" ✓":""}</button>`).join("")}</div></div>
  <div class="u8 grid g3">${XR.filter(m=>m.r!=="ext-hub"&&canX(m.r)).map(m=>{
    const desc={ "ext-devoirs":"Devoirs, leçons, fichiers légers — faible connexion","ext-classe":"Planifier le cours, puis l'ouvrir dans la salle","ext-reunion":"Séances de classe : ordre du jour, présence, salle","ext-visuel":"Cours en direct, tableau, présence, discussion et devoirs","ext-salles":"Séances enregistrées : horaire, enseignant, ressources PDF et formules, main levée, sondages, minuteur, faible connexion","ext-discussion":"Fil de la classe entre enseignant et élèves","ext-portails":"La direction ouvre ou ferme l'accès de chaque rôle","ext-structure":"Campus, sections, matières/coefs, périodes, barème","ext-inscriptions":"Transferts, promotions, retraits, urgences, fratries","ext-presences":"Motifs de correction, avis parents, consentements","ext-comms":"Annonces programmées, RSVP réunions, canaux/coûts","ext-finances":"Échéanciers datés, bourses, remboursements, compta","ext-biblio":"Ressources candidates : à vérifier, licence, listes, paquets","ext-rapports":"Filtres + presets MENFP configurables","ext-audit":"Traçabilité, exports, portabilité","ext-setup":"Parcours progressif : école → classe pilote","ext-comptes":"Rôles, codes d'activation à usage unique","ext-impressions":"Rapports par module : aperçu + permissions","ext-pret":"Carte de prêt, limite d'école, QR identifiant","ext-cal":"Publication, partage ciblé, historique","ext-pilote":"Checklist terrain : cibles à mesurer, pas des promesses","ext-continuite":"Perturbation → reprise : événement, plans par classe, suivi" }[m.r]||"";
    return `<div class="card"><h3>${m.ic} ${esc(lbl(m))}</h3><div class="small mut">${esc(desc)}</div><div class="toolbar"><button class="soft" data-action="KL.go" data-a0="s:${esc(m.r)}">${esc(T("view"))}</button></div></div>`;}).join("")}</div>`;
}

/* ---------- devoirs ---------- */
let hwCls = "";
function subStLbl(st,ht){ return ({submitted:ht?"Remèt":"Remise",late:ht?"An reta":"En retard",returned:ht?"Korije — nouvo vèsyon":"Corrigé — nouvelle version attendue",graded:ht?"Bay nòt":"Notée"})[st]||st; }
function subStBadge(st){ return st==="submitted"?"b-synced":st==="late"?"b-conflict":st==="returned"?"b-pending":st==="graded"?"b-present":"b-pending"; }
function subMig(h){ (h.subs||[]).forEach(s=>{ if(!s.st) s.st=(s.at&&h.due&&s.at>h.due)?"late":"submitted"; if(!s.vers) s.vers=1; }); }
function vDevoirs(){
  const classes = classScope(); if(!hwCls||!classes.find(c=>c.id===hwCls)) hwCls = classes[0]?classes[0].id:"";
  const list = X.homework.filter(h=>!hwCls||h.classId===hwCls).slice().reverse();
  const canEdit = ["direction","secretariat","enseignant"].includes(role());
  const ht = lang()==="ht"; const me = kidsOf()[0];
  const grps = X.groups.filter(g=>!hwCls||g.classId===hwCls);
  return `<div class="row sp"><h2 class="u6"> ${esc(T("homework"))}</h2><span class="row"><select data-action-change="KLX.hwCls" data-a0="v">${classes.map(c=>`<option value="${c.id}" ${c.id===hwCls?"selected":""}>${esc(c.name)}</option>`).join("")}</select>${canEdit?`<button data-action="KLX.hwModal">${esc(T("newHw"))}</button>`:""}<button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></span></div>
  <p class="small mut">${esc(T("lowConnNote"))} ${ht?"Editè tèks senp — n ap evalye yon pakèt zouti biwo pita.":"Éditeur texte simple — suite bureautique évaluée plus tard."}</p>
  ${list.map(h=>{ subMig(h); const c=cls(h.classId); const subs=(h.subs||[]).filter(s=>!s.hidden);
    const own=(me&&(role()==="eleve")?(h.subs||[]).filter(s=>s.sid===me.id&&!s.hidden):[]);
    const lastOwn=own.slice().sort((a,b)=>(a.vers||1)-(b.vers||1)).pop(); return `<div class="u14 card"><h3>${esc(h.title)} <span class="mut small">${esc(c?c.name:"")} • ${esc(h.subject)} • ${esc(T("due"))} ${esc(h.due)}</span></h3><p class="small">${esc(h.instructions)}</p>${h.file?`<div class="small"> ${esc(h.file)}</div>`:""}<div class="small mut">${esc(h.at)} • ${esc(h.by)} ${h.st==="pending"?`• <span class="badge b-pending">${esc(T("pending"))}</span>`:""}</div>
  ${(role()==="eleve"&&me)?`<div class="toolbar"><button class="soft" data-action="KLX.rmOpen" data-a0="s:${esc(h.id)}">${ht?"Ekri / reprann":"Écrire / reprendre"}</button>${lastOwn?`<span class="small">v${lastOwn.vers} • <span class="badge ${subStBadge(lastOwn.st)}">${esc(subStLbl(lastOwn.st,ht))}</span>${lastOwn.grade?` • <b>${esc(lastOwn.grade)}</b>`:""}${lastOwn.corr?` — <i>${esc(lastOwn.corr)}</i>`:""}</span>`:`<span class="small mut">${ht?"Poko remèt":"Pas encore remis"}</span>`}</div>`:""}
  ${subs.length&&canEdit?`<details class="small" open><summary>${ht?"Kopi remèt — bwat koreksyon":"Copies remises — corbeille de correction"} (${subs.length})</summary>${subs.map(s2=>{const st=stu(s2.sid);return `<div class="u9">• <b>${esc(st?st.firstName+" "+st.lastName:s2.sid)}</b> <span class="mut">v${s2.vers||1} • ${esc(s2.at)}</span> <span class="badge ${subStBadge(s2.st)}">${esc(subStLbl(s2.st,ht))}</span>${s2.grade?` <b>${esc(s2.grade)}</b>`:""}${s2.title?` — <b>${esc(s2.title)}</b>`:""}<br><span>${esc(s2.text)}</span>${s2.corr?`<br><i> ${esc(s2.corr)}</i>`:""}<br><button class="ghost" data-action="KLX.subSt" data-a0="s:${esc(h.id)}" data-a1="s:${esc(s2.id)}" data-a2="s:back">${ht?"Retounen":"Retourner"}</button> <button class="ghost" data-action="KLX.subSt" data-a0="s:${esc(h.id)}" data-a1="s:${esc(s2.id)}" data-a2="s:grade">${ht?"Bay nòt":"Noter"}</button> <button class="ghost" data-action="KLX.modSub" data-a0="s:${esc(h.id)}" data-a1="s:${esc(s2.id)}">Masquer</button></div>`;}).join("")}</details>`
    :subs.length?`<details class="small"><summary>${ht?"Kopi remèt":"Copies remises"} (${subs.length})</summary>${subs.map(s2=>`<div>• v${s2.vers||1} <span class="badge ${subStBadge(s2.st)}">${esc(subStLbl(s2.st,ht))}</span> <span class="mut">(${esc(s2.at)})</span></div>`).join("")}</details>`:""}
  ${canEdit?`<div class="toolbar"><button class="ghost" data-action="KLX.hwDel" data-a0="s:${esc(h.id)}">${esc(T("del"))}</button></div>`:""}</div>`;}).join("")||`<div class="card mut">${esc(T("emptyX"))}</div>`}
  <div class="card"><h3> ${ht?"Gwoup klas":"Groupes de classe"} (${grps.length})</h3><div class="small mut">${ht?"Pwofesè a kreye l epi li modere l — règ pou minè.":"Créés par les professeurs, modérés — règles mineurs."}</div>
  ${grps.map(g=>{const cc=cls(g.classId);return `<div class="u18 small"><b>${esc(g.title)}</b> <span class="mut">${esc(cc?cc.name:"")} • ${g.members.length} ${ht?"manm":"membres"}</span><br>${g.members.map(id=>{const st=stu(id);return st?esc(st.firstName):id;}).join(", ")}</div>`;}).join("")||`<div class="small mut">—</div>`}
  ${canEdit?`<div class="toolbar"><input id="x_gt" placeholder="${ht?"Non gwoup":"Nom du groupe"}" class="u16"><button data-action="KLX.grpAdd">${esc(T("addRow"))}</button></div>`:""}</div><div id="xModal"></div>`;
}

/* ---------- classe virtuelle (salle NORIA + Jitsi public, sans compte) ---------- */
function vClasse(){
  const ht=lang()==="ht", r=role(), classes=classScope(), o=O();
  const isStaff=["direction","enseignant"].includes(r);
  const allowed=classes.map(c=>c.id);
  const sessions=(X.classrooms||[]).filter(s=>allowed.includes(s.classId)).slice().sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  const canCreate=["direction","enseignant"].includes(r);
  return `<div class="row sp"><h2 class="u6">${ht?"Klas vityèl":"Classe virtuelle"}</h2><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></div>
  <p class="small mut">${ht?"Orè, objektif ak resous yo nan menm kou a. Lè w antre, videyo, tablo, prezans, diskisyon ak devwa yo ouvri nan sal NORIA a.":"L'horaire, les objectifs et les ressources restent avec le cours. En entrant, la vidéo, le tableau, la présence, la discussion et les devoirs s'ouvrent dans la salle NORIA."}</p>
  <div class="notice small">${ht?"Kou an dirèk la sèvi ak Jitsi sou meet.systemli.org, yon sèvè piblik gratis san kont. Li bon pou demonstrasyon an, pa pou dosye elèv reyèl.":"Le cours en direct utilise Jitsi sur meet.systemli.org, un serveur public gratuit sans compte. Il convient à la démonstration, pas à de vrais dossiers d'élèves."}</div>
  ${canCreate?`<section class="u8 card"><h3>${ht?"Planifye yon kou":"Planifier un cours"}</h3><div class="grid g2"><label class="fld">${ht?"Klas":"Classe"}<select id="cl_cls">${classes.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></label><label class="fld">${ht?"Matyè":"Matière"}<input id="cl_subject" maxlength="80" placeholder="${ht?"Matematik":"Mathématiques"}"></label><label class="fld">${ht?"Tit kou a":"Titre du cours"}<input id="cl_title" maxlength="120" placeholder="${ht?"Egzanp : fraksyon":"Ex. : Les fractions"}"></label><label class="fld">${ht?"Dat ak lè":"Date et heure"}<input id="cl_date" type="date" value="${today()}"><input id="cl_time" type="time" value="09:00"></label><label class="fld">${ht?"Objektif ak enstriksyon":"Objectifs et consignes"}<textarea id="cl_agenda" rows="3" maxlength="1000" placeholder="${ht?"Sa elèv la pral aprann":"Ce que les élèves vont apprendre"}"></textarea></label><label class="fld">${ht?"Resous oswa lyen kou":"Ressource ou lien du cours"}<input id="cl_resource" type="url" placeholder="https://"></label></div><button data-action="KLX.clAdd">${ht?"Anrejistre kou a":"Enregistrer le cours"}</button></section>`:""}
  ${sessions.length?sessions.map(s=>{const c=cls(s.classId);return `<article class="u8 card"><div class="row sp"><div><h3>${esc(s.title)}</h3><div class="small mut">${esc(c?c.name:"Classe")} • ${esc(s.subject)} • ${esc(s.date)} ${esc(s.time)}</div></div>${isStaff?`<button class="ghost" data-action="KLX.clDel" data-a0="s:${esc(s.id)}">${ht?"Retire":"Supprimer"}</button>`:""}</div><p>${esc(s.agenda|| (ht?"Pa gen enstriksyon adisyonèl.":"Aucune consigne supplémentaire."))}</p><div class="toolbar"><button class="soft" data-action="KLX.clEnter" data-a0="s:${esc(s.id)}">${ht?"Antre nan sal la":"Entrer dans la salle"}</button>${s.resource?`<a class="ghost button-link" href="${esc(safeUrl(s.resource)||"#")}" target="_blank" rel="noopener noreferrer">${ht?"Louvri resous la":"Ouvrir la ressource"}</a>`:""}<span class="small mut">${ht?"Kreye pa":"Créé par"} : ${esc(s.by)}</span></div></article>`;}).join(""):`<div class="u8 card mut">${ht?"Pa gen kou planifye pou klas sa yo.":"Aucun cours n'est planifié pour ces classes."}</div>`}
  <section class="u8 card"><h3>${ht?"Sa ki nan sal la":"Ce que la salle réunit"}</h3><ul><li>${ht?"Kou an dirèk Jitsi : kamera, mikwo, pataj ekran ak tablo, san kite paj la.":"Cours en direct Jitsi : caméra, micro, partage d'écran et tableau, sans quitter la page."}</li><li>${ht?"Prezans klas la, sou non yo.":"La présence de la classe, par prénom."}</li><li>${ht?"Diskisyon lekòl la, ki rete anrejistre nan klas la.":"La discussion de l'école, conservée dans la classe."}</li><li>${ht?"Devwa klas la, ak lyen resous HTTPS.":"Les devoirs de la classe, et le lien de ressource HTTPS."}</li></ul></section>`;
}

/* ---------- structure ---------- */
function vStructure(){
  const o = O(); const campOld = (o&&o.school&&o.school.campuses)||[];
  const camps = [...campOld, ...X.cfg.campuses.filter(c=>!campOld.includes(c))];
  const subs = [...(o?o.subjects:[]), ...X.cfg.subjects];
  const per = [...(o?o.periods:[]), ...X.cfg.periods.map(p=>p.name)];
  const sc = X.cfg.scale || (o?o.scale:null);
  return `<div class="row sp"><h2 class="u6"> ${esc(T("structure"))}</h2><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></div>
  <div class="u8 grid g2">
  <div class="card"><h3>${esc(T("campusMgt"))}</h3>${camps.map(c=>`<div class="u9 small">${esc(c)}</div>`).join("")}<div class="toolbar"><input id="x_campus" placeholder="Nouvo kanpis / Nouveau campus"><button data-action="KLX.addCampus">${esc(T("addRow"))}</button></div></div>
  <div class="card"><h3>${esc(T("sectionsMgt"))}</h3>${(o?o.classes:[]).map(c=>`<div class="u9 small row sp"><span><b>${esc(c.name)}</b> <span class="mut">${esc(c.level)}</span></span><input value="${esc(X.cfg.sections[c.id]||"")}" placeholder="Section A/B…" class="u19" data-action-change="KLX.setSection" data-a0="s:${esc(c.id)}" data-a1="v"></div>`).join("")}</div>
  <div class="card"><h3>${esc(T("subjectsMgt"))}</h3>${subs.map(s=>`<div class="u9 small">${esc(s.name)} • ${esc(T("coef"))} <b>${esc(s.coef)}</b></div>`).join("")}<div class="toolbar"><input id="x_sub" placeholder="Matière / Matyè" class="u16"><input id="x_coef" type="number" value="2" class="u17"><button data-action="KLX.addSub">${esc(T("addRow"))}</button></div></div>
  <div class="card"><h3>${esc(T("periodsMgt"))} & ${esc(T("scaleMgt"))}</h3><div class="small">Périodes : <b>${esc(per.join(", "))}</b></div><div class="toolbar"><input id="x_per" placeholder="T4 / Trimestre"><button data-action="KLX.addPer">${esc(T("addRow"))}</button></div><div class="small">Barème : passage <b>${esc(sc?sc.pass:"—")}</b> / ${esc(sc?sc.max:"—")} • arrondi <b>${esc(sc?sc.round:"—")}</b></div><div class="toolbar"><input id="x_pass" type="number" value="${esc(sc?sc.pass:50)}" class="u17"><input id="x_max" type="number" value="${esc(sc?sc.max:100)}" class="u17"><input id="x_round" value="${esc(sc?sc.round:"0.5")}" class="u17"><button data-action="KLX.setScale">${esc(T("save"))}</button></div></div>
  </div><p class="small mut">Surcharges stockées à part — l'ancien registre n'est pas modifié.</p>`;
}

/* ---------- inscriptions ---------- */
let mvQ = "", mvSid = "";
function vInsc(){
  const o = O(); const q = mvQ.toLowerCase();
  const list = o.students.filter(s=>!q||(s.firstName+" "+s.lastName+" "+s.code).toLowerCase().includes(q)).slice(0,12);
  if(!mvSid && list[0]) mvSid = list[0].id;
  const s = stu(mvSid); const ec = effClass(s||{id:"",classId:""});
  const urg = (s&&X.emergency[s.id])||[];
  const sibAll = s?[...(s.siblings||[]), ...X.sibX.filter(x=>x.a===s.id).map(x=>x.b), ...X.sibX.filter(x=>x.b===s.id).map(x=>x.a)]:[];
  const hist = s?X.movements.filter(m=>m.studentId===s.id).slice().reverse():[];
  return `<div class="row sp"><h2 class="u6"> ${esc(T("movements"))}</h2><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></div>
  <div class="toolbar"><input placeholder="${esc(T("search"))}" value="${esc(mvQ)}" data-action-input="KLX.mvQ" data-a0="v" class="u20"><select data-action-change="KLX.mvSid" data-a0="v">${list.map(x=>`<option value="${x.id}" ${x.id===mvSid?"selected":""}>${esc(x.firstName)} ${esc(x.lastName)} — ${esc(x.code)}</option>`).join("")}</select><button class="ghost" data-action="KLX.mvCSV">${esc(T("export"))} CSV</button></div>
  ${s?`<div class="grid g2"><div class="card"><h3>${esc(s.firstName)} ${esc(s.lastName)} <span class="mut small">${esc(s.code)}</span></h3>
    <div class="small">Classe registre : <b>${esc(cls(s.classId)?cls(s.classId).name:"")}</b>${ec.via?` → effective : <b>${esc(cls(ec.id)?cls(ec.id).name:"")}</b> <span class="badge b-pending">mouvement</span>`:""}</div>
    <div class="small mut">${esc(s.level)} • ${esc(s.campus)} • ${esc(s.status)}</div>
    <h3 class="u8">${esc(T("emergency"))}</h3>${urg.map(u=>`<div class="small"> <b>${esc(u.name)}</b> (${esc(u.link)}) — ${esc(u.phone)}</div>`).join("")||`<div class="small mut">—</div>`}
    <div class="toolbar"><input id="x_un" placeholder="Non / Nom"><input id="x_ul" placeholder="Lien" class="u21"><input id="x_up" placeholder="+509 …" class="u16"><button data-action="KLX.addUrg" data-a0="s:${esc(s.id)}">${esc(T("addRow"))}</button></div>
    <h3 class="u8">${esc(T("siblings"))}</h3><div class="small">${[...new Set(sibAll)].map(id=>{const k=stu(id);return k?esc(k.firstName+" "+k.lastName):id;}).join(", ")||"—"}</div>
    <div class="toolbar"><input id="x_sib" placeholder="Code élève (KL-2025-…)"><button data-action="KLX.addSib" data-a0="s:${esc(s.id)}">${esc(T("addRow"))}</button></div></div>
  <div class="card"><h3>Nouveau mouvement</h3><div class="grid g2"><div class="fld"><label>${esc(T("kind"))}</label><select id="x_mk"><option value="mvIns">${esc(T("mvIns"))}</option><option value="mvRe">${esc(T("mvRe"))}</option><option value="mvTr">${esc(T("mvTr"))}</option><option value="mvOut">${esc(T("mvOut"))}</option><option value="mvPro">${esc(T("mvPro"))}</option></select></div>
  <div class="fld"><label>${esc(T("to"))}</label><select id="x_to">${o.classes.map(c=>`<option value="${c.id}">${esc(c.name)} — ${esc(c.level)}</option>`).join("")}</select></div></div>
  <div class="fld"><label>${esc(T("motif"))}</label><input id="x_mo" placeholder="Motif / rezon"></div>
  <div class="toolbar"><button data-action="KLX.addMv" data-a0="s:${esc(s.id)}">OK</button><button class="warn" data-action="KLX.applyReg">${esc(T("applyReg"))}</button></div>
  <h3>${esc(T("historyMv"))}</h3>${hist.map(m=>`<div class="u9 small">${esc(m.at)} — <b>${esc(T(m.kind))}</b> ${esc(m.from?((cls(m.from)||{}).name||"")+" → ":"")}${esc((cls(m.to)||{}).name||m.to||"")} • ${esc(m.motif||"")} • ${esc(m.by)} ${m.applied?'<span class="badge b-synced">✓</span>':'<span class="badge b-pending">lens</span>'}</div>`).join("")||`<div class="small mut">—</div>`}</div></div>`:""}`;
}

/* ---------- présences + ---------- */
let pfCls = "";
function vPres(){
  const classes = classScope(); if(!pfCls||!classes.find(c=>c.id===pfCls)) pfCls = classes[0]?classes[0].id:"";
  const o = O(); const pupils = o?o.students.filter(s=>s.classId===pfCls):[];
  const recent = o?Object.entries(o.attendance||{}).filter(([k,a])=>a.classId===pfCls).slice(-4):[];
  const abs = []; recent.forEach(([k,a])=>Object.entries(a.records||{}).forEach(([sid,st])=>{ if(st!=="P") abs.push({key:k,day:a.day,sid,st}); }));
  return `<div class="row sp"><h2 class="u6"> ${esc(T("attPlus"))}</h2><span class="row"><select data-action-change="KLX.pfCls" data-a0="v">${classes.map(c=>`<option value="${c.id}" ${c.id===pfCls?"selected":""}>${esc(c.name)}</option>`).join("")}</select><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></span></div>
  <div class="u8 grid g2"><div class="card"><h3>${esc(T("prefs"))}</h3>${pupils.map(s=>{ const p=X.prefs[s.id]||{canal:"WhatsApp",ok:false}; return `<div class="u9 small row sp"><span>${esc(s.firstName)} ${esc(s.lastName)}</span><span class="row"><select data-action-change="KLX.setPref" data-a0="s:${esc(s.id)}" data-a1="s:canal" data-a2="v">${["WhatsApp","SMS","Papier","Courriel"].map(c=>`<option ${p.canal===c?"selected":""}>${c}</option>`).join("")}</select><label><input type="checkbox" ${p.ok?"checked":""} data-action-change="KLX.setPref" data-a0="s:${esc(s.id)}" data-a1="s:ok" data-a2="k"> ${esc(T("optIn"))}</label></span></div>`;}).join("")}</div>
  <div><div class="card"><h3>${esc(T("avisLog"))}</h3>${abs.slice(-10).reverse().map(a=>{ const s=stu(a.sid); const st=X.avis[a.key+"|"+a.sid]; return `<div class="u9 small row sp"><span>${esc(a.day)} — <b>${esc(s?s.firstName+" "+s.lastName:"")}</b> (${esc(a.st)})</span>${st?`<span class="badge b-synced">✓ ${esc(st.at)}</span>`:`<button class="ghost" data-action="KLX.avis" data-a0="s:${esc(a.key)}" data-a1="s:${esc(a.sid)}">${esc(T("markSent"))}</button>`}</div>`;}).join("")||`<div class="small mut">—</div>`}</div>
  <div class="u8 card"><h3>${esc(T("correction"))} + ${esc(T("motif"))}</h3><div class="toolbar"><select id="x_cs">${pupils.map(s=>`<option value="${s.id}">${esc(s.firstName)} ${esc(s.lastName)}</option>`).join("")}</select><select id="x_cn"><option value="P">P</option><option value="A">A</option><option value="R">R</option><option value="E">E</option></select></div><div class="fld"><input id="x_cm" placeholder="${esc(T("motif"))}"></div><button data-action="KLX.attCorr">OK</button>
  ${X.attCorr.filter(c=>c.classId===pfCls).slice(-5).reverse().map(c=>{const s=stu(c.sid);return `<div class="u22 small">• ${esc(c.day)} ${esc(s?s.firstName+" "+s.lastName:"")} : ${esc(c.prev||"?")} → <b>${esc(c.next)}</b> — ${esc(c.motif)} (${esc(c.by)})</div>`;}).join("")}</div></div></div>`;
}

/* ---------- comms + ---------- */
function vComms(){
  const o = O(); const feed = [...(o?o.announces:[]).map(a=>({...a,src:"registre"})), ...X.sched.map(s=>({title:s.title,target:s.target,channel:s.channel,date:s.sendAt,text:s.text,status:s.status,src:"extension"}))];
  return `<div class="row sp"><h2 class="u6"> ${esc(T("commsPlus"))}</h2><span class="row">${["direction","secretariat","enseignant"].includes(role())?`<button data-action="KLX.schModal">${esc(T("sched"))}</button>`:""}<button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></span></div>
  <div class="notice small">Notifications : aucun détail sensible sur écran verrouillé (ni notes, ni dossiers) — titres et rappels uniquement, canaux avec consentement.</div>
  <div class="u8 grid g2"><div>${feed.slice(0,8).map(a=>`<div class="u14 card"><h3>${esc(a.title)} <span class="badge ${a.status==="sent"||!a.status?"b-sent":"b-pending"}">${a.src==="extension"?esc(T("scheduled")):"✓"}</span></h3><div class="small mut">${esc(a.target)} • ${esc(a.channel)} • ${esc(a.date||a.sendAt)}</div><p class="small">${esc(a.text)}</p></div>`).join("")}</div>
  <div><div class="card"><h3>${esc(T("channels"))}</h3>${X.channels.map(c=>{ const n=Object.values(X.prefs).filter(p=>p.ok&&(p.canal===c.label||(c.id==="whatsapp"&&p.canal==="WhatsApp"))).length; return `<div class="u18 small row sp"><span><b>${esc(c.label)}</b> <span class="mut">• ${esc(c.cost)} • ${n} ${esc(T("consent"))}</span></span>${["direction"].includes(role())?`<button class="ghost" data-action="KLX.chCost" data-a0="s:${esc(c.id)}">${esc(T("edit"))}</button>`:""}</div>`;}).join("")}</div>
  <div class="u8 card"><h3>${esc(T("meetings"))} — ${esc(T("rsvp"))}</h3>${(o?o.meetings:[]).map(m=>{ const r=X.rsvp[m.id]||{oui:m.confirmed||0,non:0}; return `<div class="u4 small"><b>${esc(m.title)}</b><br>${esc(m.date)} • ${esc(m.place)}<br> ${r.oui} /  ${r.non} <span class="u23 row"><button class="ghost" data-action="KLX.rsvp" data-a0="s:${esc(m.id)}" data-a1="n:1">${esc(T("yes"))}</button><button class="ghost" data-action="KLX.rsvp" data-a0="s:${esc(m.id)}" data-a1="n:0">${esc(T("no"))}</button></span></div>`;}).join("")}</div></div></div><div id="xModal"></div>`;
}

/* ---------- finances + ---------- */
function vFin(){
  const o = O(); const levels = o?Object.keys(o.fees||{}):[];
  levels.forEach(lv=>{ if(!X.schedules[lv]){ const f=o.fees[lv]; X.schedules[lv]=(f.tranches||[]).map((a,i)=>({label:"Tranche "+(i+1),amount:a,due:"2025-1"+(i+1)+"-15"})); } });
  save();
  return `<div class="row sp"><h2 class="u6"> ${esc(T("finPlus"))}</h2><span class="row"><button class="ghost" data-action="KLX.finCSV">${esc(T("exportCompta"))}</button><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></span></div>
  <div class="u8 grid g2"><div class="card"><h3>${esc(T("tranches"))}</h3>${levels.map(lv=>`<div class="u24"><b>${esc(lv)}</b>${X.schedules[lv].map((tr,i)=>`<div class="u22 small row sp"><span>${esc(tr.label)} : <b>${money(tr.amount)}</b> <span class="mut">→ ${esc(tr.due)}</span></span>${["direction","comptable"].includes(role())?`<button class="ghost" data-action="KLX.trDue" data-a0="s:${esc(lv)}" data-a1="n:${i}">Modifier la date</button>`:""}</div>`).join("")}</div>`).join("")}</div>
  <div><div class="card"><h3>${esc(T("bourses"))}</h3>${[...(o?o.discounts:[]).map(d=>({...d,src:"registre"})),...X.bourses.map(b=>({...b,src:"ext"}))].map(b=>{const s=stu(b.studentId);return `<div class="u9 small">${esc(s?s.firstName+" "+s.lastName:"?")} — <b>${esc(b.label)}</b> : ${money(b.amount)} <span class="mut">(${esc(b.src)})</span></div>`;}).join("")}
  ${["direction","comptable"].includes(role())?`<div class="toolbar"><select id="x_bs">${o.students.slice(0,30).map(s=>`<option value="${s.id}">${esc(s.firstName)} ${esc(s.lastName)}</option>`).join("")}</select><input id="x_bl" placeholder="Bourse mérite" class="u16"><input id="x_ba" type="number" value="5000" class="u25"><button data-action="KLX.addBourse">${esc(T("addRow"))}</button></div>`:""}</div>
  <div class="u8 card"><h3>${esc(T("refunds"))}</h3>${X.refunds.slice().reverse().map(r=>`<div class="u9 small"> ${esc(r.ref)} : <b>${money(r.amount)}</b> — ${esc(r.motif)} (${esc(r.at)} • ${esc(r.by)})</div>`).join("")||`<div class="small mut">—</div>`}
  ${["direction","comptable"].includes(role())?`<div class="toolbar"><select id="x_rs">${o.payments.slice(-10).map(p=>`<option value="${p.ref}">${esc(p.ref)} — ${money(p.amount)}</option>`).join("")}</select><input id="x_ra" type="number" placeholder="Montan" class="u21"><input id="x_rm" placeholder="${esc(T("motif"))}" class="u16"><button data-action="KLX.addRefund">${esc(T("addRow"))}</button></div>`:""}</div></div></div>`;
}

/* ---------- bibliothèque ouverte ---------- */
let bq = {q:"",level:"",lang:"",access:"",type:"",off:false};
const LVL = ["7e AF","8e AF","9e AF","NS1","NS2"];
function vBib(){
  const ht2 = lang()==="ht";
  const list = X.resources.filter(r=>{
    if(r.status==="retired") return false;
    if(bq.q && !(r.title+" "+r.org).toLowerCase().includes(bq.q.toLowerCase())) return false;
    if(bq.level && !(r.levels||[]).includes(bq.level)) return false;
    if(bq.lang && r.lang!==bq.lang) return false;
    if(bq.access && r.access!==bq.access) return false;
    if(bq.type && (r.type||"ressource")!==bq.type) return false;
    if(bq.off && !r.offline) return false;
    return true;
  });
  const canEdit = ["direction","bibliothecaire","secretariat"].includes(role());
  const accB = a=>({ext_link:"Lien externe",ext_dl:"Téléchargement",ext_adapt:"À adapter",ext_auth:"Accès requis"}[a]||"");
  return `<div class="row sp"><h2 class="u6"> ${esc(T("openLib"))} (${list.length})</h2><span class="row">${canEdit?`<button data-action="KLX.resModal">${esc(T("newRes"))}</button>`:""}<button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></span></div>
  <div class="warnbox small"> ${esc(T("freeRule"))}</div>
  <div class="toolbar"><input placeholder="${esc(T("search"))}" value="${esc(bq.q)}" data-action-input="KLX.bq" data-a0="s:q" data-a1="v" class="u26">
  <select data-action-change="KLX.bq" data-a0="s:level" data-a1="v"><option value="">${esc(T("levelF"))}: ${esc(T("allF"))}</option>${LVL.map(l=>`<option ${bq.level===l?"selected":""}>${l}</option>`).join("")}</select>
  <select data-action-change="KLX.bq" data-a0="s:lang" data-a1="v"><option value="">${esc(T("langF"))}: ${esc(T("allF"))}</option><option value="ht" ${bq.lang==="ht"?"selected":""}>Kreyòl</option><option value="fr" ${bq.lang==="fr"?"selected":""}>Français</option></select>
  <select data-action-change="KLX.bq" data-a0="s:access" data-a1="v"><option value="">${esc(T("accessMode"))}: ${esc(T("allF"))}</option><option value="ext_link" ${bq.access==="ext_link"?"selected":""}>${esc(T("ext_link"))}</option><option value="ext_dl" ${bq.access==="ext_dl"?"selected":""}>${esc(T("ext_dl"))}</option><option value="ext_adapt" ${bq.access==="ext_adapt"?"selected":""}>${esc(T("ext_adapt"))}</option><option value="ext_auth" ${bq.access==="ext_auth"?"selected":""}>${esc(T("ext_auth"))}</option></select>
  <label class="small"><input type="checkbox" ${bq.off?"checked":""} data-action-change="KLX.bq" data-a0="s:off" data-a1="k"> ${esc(T("offlineOk"))}</label>
  <select data-action-change="KLX.bq" data-a0="s:type" data-a1="v"><option value="">Type: ${esc(T("allF"))}</option><option value="ressource" ${bq.type==="ressource"?"selected":""}>Ressource</option><option value="cours" ${bq.type==="cours"?"selected":""}>Cours</option><option value="plateforme hors-ligne" ${bq.type==="plateforme hors-ligne"?"selected":""}>Hors-ligne</option></select></div>
  ${list.map(r=>`<div class="u14 card"><h3>${accB(r.access)} ${esc(r.title)} <span class="badge ${r.status==="verifiedSt"||r.status==="verified"?"b-present":"b-pending"}">${esc(r.status==="toCheck"?T("toCheck"):r.status==="retired"?T("retired"):T("verifiedSt"))}</span></h3>
  <div class="small mut">${esc(r.org)} • ${r.lang==="ht"?"Kreyòl":"Français"} • ${(r.levels||[]).join(", ")} • ${(r.subjects||[]).join(", ")} • ${esc(r.fmt)}${r.offline?" • ":""}</div>
  <div class="small"> ${esc(r.licence)}</div>${r.costs?`<div class="small"> ${ht2?"Kou":"Cours"} : <b>${esc(r.costs.cours)}</b> • ${ht2?"Atestasyon":"Attestation"} : <b>${esc(r.costs.attest)}</b> • ${ht2?"Sètifika":"Certificat"} : <b>${esc(r.costs.cert)}</b> <span class="mut">(${ht2?"kou gratis ≠ sètifika gratis":"cours gratuit ≠ certificat gratuit"})</span></div>`:""}${r.issuer||r.eval||r.ident||r.recog?`<div class="small"> ${esc(r.issuer||"—")}${r.eval?` •  ${esc(r.eval)}`:""}${r.badge&&r.badge!=="—"?` •  ${esc(r.badge)}`:""}${r.ident&&r.ident!=="—"?` •  ${esc(r.ident)}`:""}</div>${r.duree?`<div class="small mut"> ${ht2?"Dire":"Durée"} : ${esc(r.duree)}${r.session?` •  ${esc(r.session)}`:""}${r.age&&r.age!=="—"?` •  ${esc(r.age)}`:""}${r.prerequis?` •  ${esc(r.prerequis)}`:""}</div>`:""}${r.recog?`<div class="small mut"> ${esc(r.recog)}</div>`:""}`:""}<div class="small mut"> ${esc(T("attrib"))} : ${esc(r.attrib)} • ${esc(T("verified"))} ${esc(r.addedAt||r.verified||"—")} — ${ht2?"se pa yon dat kontwòl editoryal":"ce n'est pas une date de contrôle éditorial"} • ${esc(r.size)} • v${esc(r.version)}</div>
  ${r.note?`<div class="small"> ${esc(r.note)}</div>`:""}
  <div class="toolbar"><a class="soft button-link" href="${esc(safeUrl(r.url)||"#")}" target="_blank" rel="noopener noreferrer">${esc(T("origin"))}</a>
  ${canEdit?`<button class="ghost" data-action="KLX.resVerify" data-a0="s:${esc(r.id)}">${ht2?"Make « lisans konfime » (demo)":"Marquer « licence confirmée » (démo)"}</button><button class="ghost" data-action="KLX.resReport" data-a0="s:${esc(r.id)}">${esc(T("report"))}</button><button class="ghost" data-action="KLX.resRetire" data-a0="s:${esc(r.id)}">${esc(T("retire"))}</button>`:`<button class="ghost" data-action="KLX.resReport" data-a0="s:${esc(r.id)}">${esc(T("report"))}</button>`}</div>
  <details class="small"><summary>Historique</summary>${(r.hist||[]).map(h=>`<div>• ${esc(h.at)} — ${esc(h.by)} : ${esc(h.info)}</div>`).join("")}</details></div>`).join("")||`<div class="card mut">${esc(T("emptyX"))}</div>`}
  <div class="grid g2"><div class="card"><h3> ${esc(T("readingLists"))} (${X.lists.length})</h3>${X.lists.map(l=>`<div class="u18 small"><b>${esc(l.title)}</b> <span class="mut">${esc(l.level||"")} • ${l.items.length} res.</span><br><button class="ghost" data-action="KLX.shareList" data-a0="s:${esc(l.id)}">${esc(T("shareLink"))}</button> <input id="sh_${l.id}" readonly value="${esc(shareUrl("liste="+l.id))}" class="u27"></div>`).join("")||`<div class="small mut">—</div>`}
  ${["direction","secretariat","enseignant","bibliothecaire"].includes(role())?`<div class="toolbar"><input id="x_lt" placeholder="Titre / Tit" class="u16"><button data-action="KLX.addList">${esc(T("newList"))}</button></div><div class="small mut">Cochez des ressources ci-dessus pour composer : utilisez « + liste ».</div><div class="toolbar"><select id="x_lr">${X.resources.filter(r=>r.status!=="retired").map(r=>`<option value="${r.id}">${esc(r.title.slice(0,40))}</option>`).join("")}</select><select id="x_ll">${X.lists.map(l=>`<option value="${l.id}">${esc(l.title)}</option>`).join("")}</select><button class="ghost" data-action="KLX.pushList">+ liste</button></div>`:""}</div>
  <div class="card"><h3> ${esc(T("packs"))} (${X.packs.length})</h3>${X.packs.map(p=>`<div class="u18 small"><b>${esc(p.title)}</b> — ${p.items.length} res. <span class="mut">${esc(p.note||"")}</span><br>${p.items.map(id=>{const r=X.resources.find(x=>x.id===id);return r?esc(r.title):id;}).join(" • ")}</div>`).join("")||`<div class="small mut">—</div>`}
  ${["direction","secretariat","enseignant"].includes(role())?`<div class="toolbar"><input id="x_pt" placeholder="Paquet T1 — maths 7e" class="u16"><button data-action="KLX.addPack">${esc(T("newPack"))}</button></div>`:""}</div></div><div id="xModal"></div>`;
}
function shareUrl(frag){ try{ const g=(window.generatorName||""); if(g) return "https://perchance.org/"+g+"#"+frag; }catch(e){} return location.href.split("#")[0]+"#"+frag; }

/* ---------- rapports + ---------- */
let fq = {level:"",classId:"",campus:"",period:""};
function vRep(){
  const o = O(); if(!o) return "—";
  const finR = ["direction","comptable"].includes(role());
  const studs = o.students.filter(s=>(!fq.level||s.level===fq.level)&&(!fq.classId||s.classId===fq.classId)&&(!fq.campus||s.campus===fq.campus));
  const attKeys = Object.entries(o.attendance||{}).filter(([k,a])=>(!fq.classId||a.classId===fq.classId));
  const all = attKeys.flatMap(([k,a])=>Object.values(a.records||{}));
  const rate = all.length?Math.round(all.filter(x=>x==="P").length/all.length*100):100;
  const due = studs.reduce((a,s)=>a+((o.fees[s.level]||{tuition:0}).tuition),0);
  const paid = studs.reduce((a,s)=>a+paidOf(s.id),0);
  const loans = o.loans.filter(l=>!l.back).length;
  return `<div class="row sp"><h2 class="u6"> ${esc(T("repPlus"))}</h2><span class="row">${["direction","secretariat","comptable"].includes(role())?`<button class="ghost" data-action="KLX.repCSV">CSV</button>`:""}${["direction","secretariat"].includes(role())?`<button class="ghost" data-action="KLX.menfpCSV">${esc(T("menfpFmt"))}</button>`:""}<button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></span></div>
  <div class="toolbar"><select data-action-change="KLX.fq" data-a0="s:level" data-a1="v"><option value="">${esc(T("levelF"))}: ${esc(T("allF"))}</option>${[...new Set(o.students.map(s=>s.level))].map(l=>`<option ${fq.level===l?"selected":""}>${esc(l)}</option>`).join("")}</select>
  <select data-action-change="KLX.fq" data-a0="s:classId" data-a1="v"><option value="">Classe: ${esc(T("allF"))}</option>${o.classes.map(c=>`<option value="${c.id}" ${fq.classId===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select>
  <select data-action-change="KLX.fq" data-a0="s:campus" data-a1="v"><option value="">${esc(T("campus"))}: ${esc(T("allF"))}</option>${[...new Set(o.students.map(s=>s.campus))].map(l=>`<option ${fq.campus===l?"selected":""}>${esc(l)}</option>`).join("")}</select></div>
  <div class="grid g4"><div class="card"><div class="kpi">${studs.length}</div><div class="kpi-sub">${esc(T("enrol"))}</div></div><div class="card"><div class="kpi">${rate} %</div><div class="kpi-sub">Présence (filtre classe)</div></div>${finR?`<div class="card"><div class="kpi">${money(paid)}</div><div class="kpi-sub">Encaissé / ${money(due)}</div></div>`:`<div class="card"><div class="kpi"></div><div class="kpi-sub">${lang()==="ht"?"Finans : direksyon / kontablite":"Finances : direction / comptabilité"}</div></div>`}<div class="card"><div class="kpi">${loans}</div><div class="kpi-sub">Prêts actifs (+${X.resources.length} ress. ouvertes)</div></div></div>
  <div class="u3 card"><h3>${esc(T("menfpFmt"))}</h3><p class="small mut">Preset « Recensement de base » : code, nom, sexe, naissance, niveau, classe, campus, année. Configurable, sans valeur officielle — à valider avec le MENFP.</p></div>`;
}

/* ---------- audit ---------- */
function vAudit(){
  return `<div class="row sp"><h2 class="u6"> ${esc(T("auditLog"))} (${X.audit.length})</h2><span class="row"><button class="ghost" data-action="KLX.auditCSV">CSV</button><button class="ghost" data-action="KLX.extJSON">JSON ext</button><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></span></div>
  <div class="notice small">Portabilité : export JSON de l'ancien registre (bouton existant dans Rapports) + JSON des extensions ici. Conservation : données de démonstration — aucun vrai dossier d'élève.</div>
  <div class="u8 card"><div class="u7"><table><tr><th>${esc(T("date"))}</th><th>${esc(T("actor"))}</th><th>${esc(T("action"))}</th><th>${esc(T("detail"))}</th></tr>
  ${X.audit.slice(0,100).map(a=>`<tr><td class="small">${esc(a.at)}</td><td class="small">${esc(a.by)}</td><td><b>${esc(a.action)}</b></td><td class="small">${esc(a.detail)}</td></tr>`).join("")||`<tr><td colspan="4" class="mut">${esc(T("emptyX"))}</td></tr>`}</table></div></div>`;
}

/* ---------- dispatcher ---------- */
function initials(s){ const a=(s.firstName||"?").slice(0,1), b=(s.lastName||"").slice(0,1); return (a+b).toUpperCase(); }
function postName(p){
  if(p.sid){ const s=stu(p.sid); if(s) return p.role==="parent"?("Parent · "+s.firstName+" "+s.lastName):(s.firstName+" "+s.lastName); }
  if(p.role==="enseignant"){ const o=O(); const t=o&&o.staff&&o.staff.find(x=>x.role==="enseignant"); return t?t.name:"Enseignant"; }
  if(p.role==="direction"){ const o=O(); const t=o&&o.staff&&o.staff.find(x=>x.role==="direction"); return t?t.name:"Direction"; }
  return p.name||p.role||"";
}
function inScope(classId){ return role()==="direction"||role()==="secretariat"||classScope().some(c=>c.id===classId); }
function canLead(){ return role()==="direction"||role()==="enseignant"; }
function extHref(raw){
  const v=String(raw||"").trim(); if(!v) return "";
  const u=new URL(v); if(u.protocol!=="https:") throw new Error("https"); return u.href;
}
function vReunion(){
  const ht=lang()==="ht";
  const list=(X.meetings||[]).filter(m=>inScope(m.classId)).slice().sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  const classes=classScope();
  return `<div class="row sp"><h2 class="u6">${ht?"Sant reyinyon":"Centre de réunion"}</h2><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></div>
  <p class="portal-kicker">${esc(ROLE_LBL[role()]||role())} · ${ht?"aksè ouvri pa direksyon an":"accès ouvert par la direction"}</p>
  <div class="notice small">${ht?"Sal la chita nan NORIA : kou an dirèk Jitsi (meet.systemli.org, gratis, san kont), tablo, prezans, diskisyon ak devwa. Sèvè a piblik — demonstrasyon sèlman. Yon lyen HTTPS rete opsyonèl.":"La salle est dans NORIA : cours en direct Jitsi (meet.systemli.org, gratuit, sans compte), tableau, présence, discussion et devoirs. Le serveur est public — démonstration seulement. Un lien HTTPS reste optionnel."}</div>
  ${canLead()?`<section class="u8 card"><h3>${ht?"Nouvo seyans":"Nouvelle séance"}</h3><div class="grid g2"><label class="fld">${ht?"Klas":"Classe"}<select id="mt_cls">${classes.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></label><label class="fld">${ht?"Matyè":"Matière"}<input id="mt_sub" maxlength="80" value="${ht?"Matematik":"Mathématiques"}"></label><label class="fld">${ht?"Tit":"Titre"}<input id="mt_title" maxlength="120" placeholder="${ht?"Egzanp : fraksyon":"Ex. : Les fractions"}"></label><label class="fld">${ht?"Dat ak lè":"Date et heure"}<input id="mt_date" type="date" value="${today()}"><input id="mt_time" type="time" value="09:00"></label><label class="fld">${ht?"Lòd jounen an":"Ordre du jour"}<textarea id="mt_agenda" rows="3" maxlength="800"></textarea></label><label class="fld">${ht?"Lyen ekstèn opsyonèl (https)":"Lien externe optionnel (https)"}<input id="mt_ext" type="url" placeholder="https://"></label></div><button data-action="KLX.meetAdd">${ht?"Kreye seyans la":"Créer la séance"}</button></section>`:""}
  ${list.map(m=>{const c=cls(m.classId); const st=m.status==="open"?(ht?"Louvri":"Ouverte"):m.status==="closed"?(ht?"Fèmen":"Fermée"):(ht?"Planifye":"Planifiée"); return `<article class="u8 card"><div class="row sp"><div><h3>${esc(m.title)}</h3><div class="small mut">${esc(c?c.name:"")} • ${esc(m.subject)} • ${esc(m.date)} ${esc(m.time)}</div></div><span class="badge ${m.status==="open"?"b-present":m.status==="closed"?"b-pending":"b-borrowed"}">${st}</span></div><p>${esc(m.agenda||"—")}</p><div class="toolbar"><button class="soft" data-action="KLX.roomOpen" data-a0="s:${esc(m.id)}">${ht?"Antre nan sal la":"Entrer dans la salle"}</button>${canX("ext-discussion")?`<button class="ghost" data-action="KL.go" data-a0="s:ext-discussion">${ht?"Diskisyon klas la":"Discussion de la classe"}</button>`:""}${m.external?`<a class="ghost button-link" href="${esc(safeUrl(m.external)||"#")}" target="_blank" rel="noopener noreferrer">${ht?"Lyen ekstèn":"Lien externe"}</a>`:""}${canLead()&&m.status!=="open"?`<button class="ghost" data-action="KLX.meetStatus" data-a0="s:${esc(m.id)}" data-a1="s:open">${ht?"Louvri":"Ouvrir"}</button>`:""}${canLead()&&m.status==="open"?`<button class="ghost" data-action="KLX.meetStatus" data-a0="s:${esc(m.id)}" data-a1="s:closed">${ht?"Fèmen":"Fermer"}</button>`:""}</div></article>`;}).join("")||`<div class="u8 card mut">${ht?"Pa gen seyans pou klas ou yo.":"Aucune séance pour vos classes."}</div>`}`;
}
function vVisuel(){
  const ht=lang()==="ht"; const o=O();
  const meet=focusedMeet();
  if(!meet) return `<div class="row sp"><h2 class="u6">${ht?"Klas vizyèl":"Classe visuelle"}</h2><button class="ghost" data-action="KL.go" data-a0="s:ext-reunion">${ht?"Sant reyinyon":"Centre de réunion"}</button></div><div class="card mut">${ht?"Pa gen sal ouvri pou ou.":"Aucune salle ouverte pour vous."}</div>`;
  const c=cls(meet.classId);
  const pupils=o?o.students.filter(s=>s.classId===meet.classId):[];
  const lead=canLead()&&(role()==="direction"||classScope().some(x=>x.id===meet.classId));
  const threads=(X.threads||[]).filter(t=>t.classId===meet.classId);
  const write=(role()==="direction"||role()==="enseignant"||role()==="eleve"||(role()==="parent"&&X.discParentWrite))&&inScope(meet.classId);
  const hw=(X.homework||[]).filter(h=>h.classId===meet.classId);
  const me=kidsOf()[0];
  const res=/^https:\/\//.test(String(meet.external||""))?meet.external:"";
  return `<div class="row sp"><h2 class="u6">${ht?"Klas vizyèl":"Classe visuelle"}</h2><span class="row"><button class="soft" data-action="KLX.liveToggle">${liveWanted?(ht?"Fèmen dirèk la":"Fermer le direct"):(ht?"Ouvri kou an dirèk":"Ouvrir le cours en direct")}</button><button class="ghost" data-action="KL.go" data-a0="s:ext-reunion">${ht?"Reyinyon":"Réunions"}</button></span></div>
  <p class="portal-kicker">${esc(c?c.name:"")} · ${esc(ROLE_LBL[role()]||role())}</p>
  <div class="notice small">${ht?"Kou an dirèk la se Jitsi (meet.systemli.org), gratis, san kont : kamera, mikwo, pataj ekran ak tablo. Sèvè a piblik — demonstrasyon sèlman, pa pou dosye timoun. Diskisyon lekòl la rete nan NORIA ; chat Jitsi a pa anrejistre isit.":"Le cours en direct est Jitsi (meet.systemli.org), gratuit et sans compte : caméra, micro, partage d'écran et tableau. Le serveur est public — démonstration seulement, pas pour des dossiers d'enfants. La discussion de l'école reste dans NORIA ; le chat Jitsi n'y est pas enregistré."}</div>
  <section class="board"><div class="board-kicker">${esc(meet.subject)} · ${esc(meet.date)} ${esc(meet.time)}</div><h3 class="board-title">${esc(meet.title)}</h3><p>${esc(meet.agenda||"")}</p>${res?`<p class="u8"><a href="${esc(safeUrl(res)||"#")}" target="_blank" rel="noopener noreferrer">${ht?"Louvri resous la":"Ouvrir la ressource"}</a></p>`:""}</section>
  <div class="u3 card"><h3>${ht?"Elèv nan sal la":"Élèves dans la salle"} <span class="mut small">(${(meet.present||[]).length}/${pupils.length})</span></h3>
  <div class="seats">${pupils.map(s=>{const on=(meet.present||[]).includes(s.id); return `<button type="button" class="seat${on?" on":""}" ${lead?`data-action="KLX.meetHere" data-a0="s:${esc(meet.id)}" data-a1="s:${esc(s.id)}"`:"disabled"}><b>${esc(initials(s))}</b><span>${esc(s.firstName)}</span></button>`;}).join("")}</div>
  <p class="small mut">${lead?(ht?"Klike yon non pou make li prezan.":"Cliquez un prénom pour le marquer présent."):(ht?"Ou wè klas ou. Ou pa ka chanje prezans la.":"Vous voyez votre classe. Vous ne pouvez pas modifier la présence.")}</p></div>
  <section class="u3 card"><h3>${ht?"Diskisyon klas la":"Discussion de la classe"}</h3>
  ${lead?`<div class="toolbar"><input id="th_room" maxlength="120" placeholder="${ht?"Nouvo sijè":"Nouveau sujet"}" class="u16"><button data-action="KLX.roomThread" data-a0="s:${esc(meet.classId)}">${ht?"Ouvri":"Ouvrir"}</button></div>`:""}
  ${threads.map(th=>`<article class="u2"><h4 class="u28">${esc(th.title)}</h4>
    ${(th.posts||[]).map(p=>{const hidden=p.hidden&&!lead; return `<div class="msg"><div class="who">${esc(postName(p))} <span class="mut">${esc(p.at)}</span>${p.hidden&&lead?` <span class="badge b-pending">${ht?"Maske":"Masqué"}</span>`:""}</div><div>${hidden?(ht?"Mesaj maske":"Message masqué"):esc(p.text)}</div>${lead&&!p.hidden?`<button class="ghost" data-action="KLX.postHide" data-a0="s:${esc(th.id)}" data-a1="s:${esc(p.id)}" data-a2="s:ext-visuel">${ht?"Maske":"Masquer"}</button>`:""}</div>`;}).join("")}
    ${write?`<div class="toolbar"><input id="th_${esc(th.id)}" maxlength="500" placeholder="${ht?"Mesaj ou":"Votre message"}" class="u16"><button data-action="KLX.postAdd" data-a0="s:${esc(th.id)}" data-a1="s:ext-visuel">${ht?"Voye":"Envoyer"}</button></div>`:""}
  </article>`).join("")||`<p class="small mut">${ht?"Pa gen sijè pou klas sa a.":"Aucun sujet pour cette classe."}</p>`}
  </section>
  <section class="u3 card"><div class="row sp"><h3 class="u6">${ht?"Devwa klas la":"Devoirs de la classe"}</h3><button class="ghost" data-action="KL.go" data-a0="s:ext-devoirs">${ht?"Tout devwa yo":"Tous les devoirs"}</button></div>
  ${hw.map(h=>{const own=me&&role()==="eleve"?(h.subs||[]).filter(s=>s.sid===me.id&&!s.hidden):[]; const last=own.slice().sort((a,b)=>(a.vers||1)-(b.vers||1)).pop(); return `<article class="u2"><b>${esc(h.title)}</b> <span class="small mut">${esc(h.subject)} · ${esc(T("due"))} ${esc(h.due)}</span><p class="small">${esc(h.instructions||"")}</p>${role()==="eleve"&&me&&me.classId===h.classId?`<div class="toolbar"><button class="soft" data-action="KLX.rmOpen" data-a0="s:${esc(h.id)}">${ht?"Ekri / remèt":"Écrire / remettre"}</button>${last?`<span class="small">v${last.vers}</span>`:`<span class="small mut">${ht?"Poko remèt":"Pas encore remis"}</span>`}</div>`:""}</article>`;}).join("")||`<p class="small mut">${ht?"Pa gen devwa pou klas sa a.":"Aucun devoir pour cette classe."}</p>`}
  </section><div id="xModal"></div>`;
}
function vDiscussion(){
  const ht=lang()==="ht";
  const classes=role()==="direction"?(O()?O().classes:[]):classScope();
  const cid=X.focusClass&&classes.some(c=>c.id===X.focusClass)?X.focusClass:(classes[0]&&classes[0].id);
  const threads=(X.threads||[]).filter(t=>t.classId===cid);
  const write=cid&&(role()==="direction"||role()==="enseignant"||role()==="eleve"||(role()==="parent"&&X.discParentWrite))&&inScope(cid);
  const lead=canLead()&&(role()==="direction"||classScope().some(c=>c.id===cid));
  return `<div class="row sp"><h2 class="u6">${ht?"Diskisyon klas la":"Discussion de la classe"}</h2><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></div>
  <p class="portal-kicker">${esc(ROLE_LBL[role()]||role())} · ${role()==="parent"?(X.discParentWrite?(ht?"ou ka ekri":"vous pouvez écrire"):(ht?"lekti sèlman":"lecture seule")):(ht?"fil klas la":"fil de la classe")}</p>
  <div class="toolbar"><select data-action-change="KLX.discClass" data-a0="v">${classes.map(c=>`<option value="${esc(c.id)}" ${c.id===cid?"selected":""}>${esc(c.name)}</option>`).join("")}</select></div>
  <div class="notice small">${ht?"Mesaj yo rete nan klas la. Yon pwofesè oswa direksyon an ka maske yon mesaj. Pa gen mesaj ki soti deyò lekòl la.":"Les messages restent dans la classe. Un enseignant ou la direction peut masquer un message. Aucun message n'est envoyé hors de l'école."}</div>
  ${lead?`<div class="u8 card"><h3>${ht?"Nouvo sijè":"Nouveau sujet"}</h3><div class="toolbar"><input id="th_title" maxlength="120" placeholder="${ht?"Sijè a":"Sujet"}" class="u16"><button data-action="KLX.threadAdd" data-a0="s:${esc(cid||"")}">${ht?"Ouvri":"Ouvrir"}</button></div></div>`:""}
  ${threads.map(th=>`<article class="u8 card"><h3>${esc(th.title)}</h3>
    ${(th.posts||[]).map(p=>{const hidden=p.hidden&&!lead; return `<div class="msg"><div class="who">${esc(postName(p))} <span class="mut">${esc(p.at)}</span>${p.hidden&&lead?` <span class="badge b-pending">${ht?"Maske":"Masqué"}</span>`:""}</div><div>${hidden?(ht?"Mesaj maske":"Message masqué"):esc(p.text)}</div>${lead&&!p.hidden?`<button class="ghost" data-action="KLX.postHide" data-a0="s:${esc(th.id)}" data-a1="s:${esc(p.id)}">${ht?"Maske":"Masquer"}</button>`:""}</div>`;}).join("")}
    ${write?`<div class="toolbar"><input id="th_${esc(th.id)}" maxlength="500" placeholder="${ht?"Mesaj ou":"Votre message"}" class="u16"><button data-action="KLX.postAdd" data-a0="s:${esc(th.id)}">${ht?"Voye":"Envoyer"}</button></div>`:""}
  </article>`).join("")||`<div class="u8 card mut">${ht?"Pa gen sijè pou klas sa a.":"Aucun sujet pour cette classe."}</div>`}`;
}
function vPortails(){
  const ht=lang()==="ht";
  if(role()!=="direction") return `<div class="badbox">${esc(T("noAccess"))}</div>`;
  const p=ensurePortals();
  const roles=Object.keys(ROLE_LBL);
  const cell=(rn,key,bucket)=>{
    const on=bucket==="core"?p[rn].core.includes(key):p[rn].spaces.includes(key);
    const lock=(rn==="direction"&&(key==="settings"||key==="ext-portails"))||denied(rn,key);
    return `<label class="chk"><input type="checkbox" ${on?"checked":""} ${lock?"disabled":""} data-action-change="KLX.portalSet" data-a0="s:${esc(rn)}" data-a1="s:${esc(key)}" data-a2="s:${esc(bucket)}" data-a3="c"> ${esc(bucket==="core"?CORE_LBL[key]:SPACE_LBL[key])}</label>`;
  };
  return `<div class="row sp"><h2 class="u6">${ht?"Pòtay chak wòl":"Portails de chaque rôle"}</h2><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></div>
  <p class="portal-kicker">${ht?"Direksyon lekòl la":"Direction de l'école"}</p>
  <div class="notice small">${ht?"Se kont direksyon an ki ouvri oswa fèmen espas chak responsab. Nan maquette sa a, kontwòl la se nan navigatè a : li montre kijan aksè yo dwe mache, li pa ranplase yon sèvè.":"Le compte direction ouvre ou ferme l'espace de chaque responsable. Dans cette maquette, le contrôle est dans le navigateur : il montre comment les accès doivent fonctionner, il ne remplace pas un serveur."}</div>
  <div class="u8 card"><label class="chk"><input type="checkbox" ${X.discParentWrite?"checked":""} data-action-change="KLX.parentWrite" data-a0="c"> ${ht?"Paran yo ka ekri nan diskisyon klas la":"Les parents peuvent écrire dans la discussion de la classe"}</label><p class="small mut">${ht?"Si sa pa tcheke, paran an li sèlman mesaj pitit li.":"Sans cette case, le parent lit seulement les messages de la classe de son enfant."}</p></div>
  ${roles.map(rn=>`<section class="u8 card"><h3>${esc(ht&&rn==="enseignant"?"Pwofesè":ROLE_LBL[rn])}</h3><div class="checks">${Object.keys(CORE_LBL).map(k=>cell(rn,k,"core")).join("")}${Object.keys(SPACE_LBL).map(k=>cell(rn,k,"spaces")).join("")}</div></section>`).join("")}`;
}
const VV = {"ext-hub":vHub,"ext-salles":vSalles,"ext-devoirs":vDevoirs,"ext-classe":vClasse,"ext-reunion":vReunion,"ext-visuel":vVisuel,"ext-discussion":vDiscussion,"ext-portails":vPortails,"ext-structure":vStructure,"ext-inscriptions":vInsc,"ext-presences":vPres,"ext-comms":vComms,"ext-finances":vFin,"ext-biblio":vBib,"ext-rapports":vRep,"ext-audit":vAudit,"ext-setup":vSetup,"ext-comptes":vComptes,"ext-impressions":vPrint,"ext-pret":vPret,"ext-cal":vCal,"ext-pilote":vPilote,"ext-continuite":vContinuite};

/* ---------- installation progressive d'école (PRD §14) ---------- */
function vSetup(){
  const o = O(); const ht = lang()==="ht";
  const steps = [
    {t:ht?"Lekòl + ane":"École + année", ok:!!(o&&o.school&&o.school.name&&o.year), go:"settings"},
    {t:ht?"Kanpis (≥1)":"Campus (≥1)", ok:!!(o&&o.school&&o.school.campuses&&o.school.campuses.length+X.cfg.campuses.length>0), go:"ext-structure"},
    {t:ht?"Peryòd + barèm":"Périodes + barème", ok:!!(o&&o.periods&&o.periods.length>0), go:"ext-structure"},
    {t:ht?"Klas ak elèv":"Classe avec élèves", ok:!!(o&&o.classes.some(c=>o.students.some(s=>s.classId===c.id))), go:"students"},
    {t:ht?"Frè konfigire":"Frais configurés", ok:!!(o&&o.fees&&Object.keys(o.fees).length>0), go:"ext-finances"},
    {t:ht?"Premye apèl":"Premier appel", ok:!!(o&&o.attLog&&o.attLog.length>0), go:"attendance"},
    {t:ht?"Anons pibliye":"Annonce publiée", ok:!!(o&&o.announces&&o.announces.length>0), go:"ext-comms"},
  ];
  const n = steps.filter(s=>s.ok).length;
  return `<div class="row sp"><h2 class="u6"> ${ht?"Enstalasyon lekòl":"Installation d'école"} (${n}/${steps.length})</h2><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></div>
  <div class="notice small">${ht?"Ou ka reprann pita — chak etap montre sa ki manke.":"Reprise plus tard possible — chaque étape montre ce qui manque."}</div>
  <div class="u8 card"><progress class="kl-prog" max="100" value="${Math.round(n/steps.length*100)}">${Math.round(n/steps.length*100)} %</progress>
  ${steps.map(s=>`<div class="u29 row sp"><span>${s.ok?"":""} <b>${esc(s.t)}</b></span><button class="${s.ok?"ghost":"soft"}" data-action="KL.go" data-a0="s:${esc(s.go)}">${s.ok?esc(T("view")):"→"}</button></div>`).join("")}</div>`;
}

/* ---------- comptes & accès (codes d'activation à usage unique — démo locale) ---------- */
function vComptes(){
  const ht = lang()==="ht";
  const exp = c=>new Date(c.expires).getTime()<Date.now()?"expiré":(c.used?"utilisé":(c.given?"remis (2/3)":"en attente (1/3)"));
  return `<div class="row sp"><h2 class="u6"> ${ht?"Kont & aksè":"Comptes & accès"}</h2><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></div>
  <div class="warnbox small">${ht?"Kòd itilizatè a se yon idantifyan, li PA JANM yon modpas. Kòd aktivasyon : tanporè, yon sèl itilizasyon. Se SIMILASYON lokal — sèvè a ap enpoze bcrypt, bloke tantativ, ekspirasyon reyèl.":"Codes d'utilisateur = identifiants, JAMAIS mots de passe. Codes d'activation : temporaires, à usage unique. SIMULATION locale — le serveur imposera hash robuste, verrouillage et expiration réels."}</div>
  <div class="notice small">Un compte = une personne — comptes partagés interdits. Récupération assistée : la direction émet un NOUVEAU code (3 étapes), l'ancien n'est jamais réutilisé.</div>
  <div class="u8 grid g2"><div class="card"><h3>${ht?"Itilizatè":"Utilisateurs"} (${X.users.length})</h3>
  ${X.users.map(u=>`<div class="u18 small row sp"><span><b>${esc(u.code)}</b> — ${esc(u.name)} <span class="mut">(${esc(u.role)})</span> ${u.active?'<span class="badge b-present">✓</span>':'<span class="badge b-pending">…</span>'}</span><span class="row"><button class="ghost" data-action="KLX.uTog" data-a0="s:${esc(u.id)}">${u.active?(ht?"Dezaktive":"Désactiver"):(ht?"Aktive":"Activer")}</button><button class="ghost" data-action="KLX.uReset" data-a0="s:${esc(u.id)}">+ code</button><button class="ghost" data-action="KLX.uDel" data-a0="s:${esc(u.id)}">Supprimer</button></span></div>`).join("")||`<div class="small mut">—</div>`}
  <div class="toolbar"><input id="x_un2" placeholder="${ht?"Non":"Nom"}" class="u16"><select id="x_ur"><option value="enseignant">Enseignant</option><option value="secretariat">Secrétariat</option><option value="comptable">Comptable</option><option value="bibliothecaire">Bibliothécaire</option><option value="parent">Parent</option><option value="eleve">Élève</option></select><button data-action="KLX.uAdd">${ht?"Kreye + kòd (1/3)":"Créer + code (1/3)"}</button></div></div>
  <div class="card"><h3>${ht?"Kòd aktivasyon":"Codes d'activation"} (${X.actCodes.length})</h3>
  ${X.actCodes.slice().reverse().map(c=>`<div class="u18 small row sp"><span><b>${esc(c.code)}</b> <span class="mut">→ ${esc(c.uid)} • ${esc(exp(c))}</span></span>${!c.used?(c.given?`<button class="soft" data-action="KLX.uUse" data-a0="s:${esc(c.id)}">${ht?"Aktive (3/3)":"Activer (3/3)"}</button>`:`<button class="ghost" data-action="KLX.uGive" data-a0="s:${esc(c.id)}"> ${ht?"Remèt (2/3)":"Remettre (2/3)"}</button>`):""}</div>`).join("")||`<div class="small mut">—</div>`}
  <div id="xModal2"></div></div></div>`;
}

/* ---------- impressions par module (aperçu + permissions) ---------- */
let prMod = "presences", prCls = "";
function vPrint(){
  const ht = lang()==="ht"; const o = O();
  const mods = [["presences",ht?"Prezans":"Présences"],["notes",ht?"Nòt":"Notes"],["calendrier",ht?"Kalendriye":"Calendrier"],["finances",ht?"Finans":"Finances"],["prets",ht?"Pre":"Prêts"]];
  const allowed = {presences:["direction","secretariat","enseignant"],notes:["direction","secretariat","enseignant"],calendrier:["direction","secretariat","enseignant","parent","eleve"],finances:["direction","comptable"],prets:["direction","bibliothecaire","secretariat"]};
  const ok = (allowed[prMod]||[]).includes(role());
  if(!prCls||!classScope().find(c=>c.id===prCls)){ const cs=classScope(); prCls=cs[0]?cs[0].id:""; }
  return `<div class="row sp"><h2 class="u6"> ${ht?"Enpresyon":"Impressions"}</h2><span class="row"><select data-action-change="KLX.prMod" data-a0="v">${mods.map(m=>`<option value="${m[0]}" ${prMod===m[0]?"selected":""}>${esc(m[1])}</option>`).join("")}</select><select data-action-change="KLX.prCls" data-a0="v">${classScope().map(c=>`<option value="${c.id}" ${prCls===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></span></div>
  ${ok?`<div class="toolbar"><button class="soft" data-action="KLX.prGo">${ht?"Apèsi / enprime":"Aperçu / imprimer"}</button><button class="ghost" data-action="KLX.prCSV">CSV</button></div><p class="small mut">${ht?"Dokiman an respekte wòl ou a (done filtre).":"Document filtré selon votre rôle et vos permissions."}</p>`
  :`<div class="badbox">${esc(T("noAccess"))} — ${ht?"wòl ou pa gen aksè modil sa a":"votre rôle n'a pas accès à ce module"}.</div>`}<div id="xModal"></div>`;
}

/* ---------- guichet des prêts (carte de prêt, limite, QR = identifiant seul) ---------- */
let pq = "";
function vPret(){
  const ht = lang()==="ht"; const o = O(); const lim = (o?o.bibLimit:0)||1;
  const s = pq?(o.students.find(x=>x.code===pq||x.id===pq||x.cardRef===pq)||null):null;
  const act = s?o.loans.filter(l=>l.studentId===s.id&&!l.back):[];
  const dispo = o?o.books.filter(b=>b.available>0):[];
  return `<div class="row sp"><h2 class="u6"> ${ht?"Giche pre":"Guichet des prêts"}</h2><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></div>
  <div class="notice small">${ht?"Kat la sèvi pou jwenn kont pre a. QR = idantifyan pre SÈLMAN — li pa bay aksè pòtal. Limit lekòl : ":"La carte sert à retrouver le compte de prêt. Le QR est un identifiant de prêt UNIQUEMENT — aucun accès portail. Limite d'école : "}<b>${lim} / élève</b> (réglable : Paramètres).</div>
  <div class="toolbar"><input placeholder="Code carte / élève (KL-2025-…)" value="${esc(pq)}" data-action-input="KLX.pq" data-a0="v" class="u30"></div>
  ${s?`<div class="grid g2"><div class="card"><h3>${esc(s.firstName)} ${esc(s.lastName)} <span class="mut small">${esc(s.code)} • ${esc((cls(s.classId)||{}).name||"")}</span></h3>
    <div class="small">Prêts actifs : <b>${act.length}/${lim}</b> ${act.length>=lim?`<span class="badge b-conflict">${ht?"Limit":"Limite atteinte"}</span>`:`<span class="badge b-present">OK</span>`}</div>
    ${act.map(l=>{const b=o.books.find(x=>x.id===l.bookId);return `<div class="small"> ${esc(b?b.title:"?")} <span class="mut">(${esc(l.out)} → ${esc(l.due)})</span></div>`;}).join("")}
    <div class="fld"><label>${ht?"Nouvo pre":"Nouveau prêt"}</label><select id="x_pb">${dispo.map(b=>`<option value="${b.id}">${esc(b.title)} (${b.available})</option>`).join("")}</select></div>
    <button class="soft" data-action="KLX.pretGo" data-a0="s:${esc(s.id)}" ${act.length>=lim||!dispo.length?"disabled":""}>${ht?"Prete":"Prêter"}</button></div>
  <div class="card"><h3> ${ht?"Kat pre":"Carte de prêt"}</h3><div class="u31 receipt"><b class="u32">${esc(s.cardRef||s.code)}</b><br><span class="small mut">${esc(s.firstName)} ${esc(s.lastName)} • ${esc(s.code)}</span><p class="small mut">${ht?"Referans opak pre — ni modpas, ni aksè pòtal. Okenn QR skanab nan demo sa a.":"Référence opaque de prêt — ni mot de passe, ni accès portail. Aucun QR scannable généré dans cette démo."}</p></div>
  <div class="toolbar"><button class="ghost" data-action="print">${esc(T("print"))}</button></div></div></div>`:`<div class="card mut">${ht?"Tape kòd kat la pi wo a.":"Saisissez un code de carte ci-dessus."}</div>`}`;
}

/* ---------- calendrier + (publication direction seule, partage ciblé filtré) ---------- */
function userCampuses(){ const r=role(),o=O(); if(!o) return []; if(r==="parent"||r==="eleve") return [...new Set(kidsOf().map(s=>s.campus))]; if(r==="enseignant") return [...new Set(teacherCls().map(c=>c.campus))]; return (o.school&&o.school.campuses)||[]; }
function userClassNames(){ const r=role(),o=O(); if(!o) return []; if(r==="parent"||r==="eleve"){ const k=kidsOf(); const ids=[...new Set(k.map(s=>s.classId))]; return o.classes.filter(c=>ids.includes(c.id)).map(c=>c.name); } if(r==="enseignant") return teacherCls().map(c=>c.name); return o.classes.map(c=>c.name); }
function calOk(k){ if(["direction","secretariat","comptable","bibliothecaire"].includes(role())) return true; const t2=(k.pub&&k.pub.target)||"Toute l'école"; if(t2==="Toute l'école") return true; if(t2.indexOf("Campus ")===0) return userCampuses().includes(t2.replace("Campus ","")); return userClassNames().includes(t2); }
function visibleCalendarEvents(){ const o=O(), canEdit=role()==="direction"; return (o?o.calendar:[]).map(k=>({...k,pub:X.calPub[k.id]||{status:"draft",target:"Toute l'école"}})).filter(k=>(canEdit||k.pub.status==="published")&&calOk(k)); }
function vCal(){
  const ht = lang()==="ht"; const o = O(); const canEdit = ["direction"].includes(role());
  const vis = visibleCalendarEvents();
  const props = (X.calProp||[]).slice().reverse();
  const myTargets = ["Toute l'école",...userCampuses().map(c=>"Campus "+c),...userClassNames()];
  return `<div class="row sp"><h2 class="u6"> ${ht?"Kalendriye +":"Calendrier +"} </h2><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></div>
  <div class="notice small">${ht?"Okenn abònman ekstèn aktif nan demo a — ekspòtasyon ICS manyèl.":"Aucun abonnement externe actif dans la démo — export ICS manuel."}</div>
  ${role()==="enseignant"?`<div class="u8 card"><h3>${ht?"Pwopoze yon evènman (direksyon pibliye)":"Proposer un événement (la direction publie)"}</h3><div class="toolbar"><input id="cp_n" placeholder="${ht?"Non evènman":"Nom de l'événement"}" class="u33"><input id="cp_s" type="date" value="${today()}"><select id="cp_t">${myTargets.map(t2=>`<option>${esc(t2)}</option>`).join("")}</select><button class="soft" data-action="KLX.calProp">OK</button></div></div>`:""}
  ${canEdit&&props.filter(p=>p.st==="propose").length?`<div class="u8 card"><h3>${ht?"Pwopozisyon pwofesè":"Propositions des enseignants"} (${props.filter(p=>p.st==="propose").length})</h3>${props.filter(p=>p.st==="propose").map(p=>`<div class="u9 small row sp"><span><b>${esc(p.name)}</b> <span class="mut">${esc(p.start)} → ${esc(p.target)} • par ${esc(p.by)}</span></span><span class="row"><button class="soft" data-action="KLX.calPropOk" data-a0="s:${esc(p.id)}">${ht?"Kreye (bouyon)":"Créer (brouillon)"}</button><button class="ghost" data-action="KLX.calPropNo" data-a0="s:${esc(p.id)}">Refuser</button></span></div>`).join("")}</div>`:""}
  ${vis.map(k=>`<div class="u24 card"><div class="row sp"><span><b>${esc(k.name)}</b> <span class="mut small">${esc(k.start)} → ${esc(k.end)}</span><br><span class="small"> ${esc(k.pub.target)}</span> <span class="badge ${k.pub.status==="published"?"b-present":"b-pending"}">${k.pub.status==="published"?(ht?"Pibliye":"Publié"):(ht?"Bouyon":"Brouillon")}</span></span>
  ${canEdit?`<span class="row"><select data-action-change="KLX.calTg" data-a0="s:${esc(k.id)}" data-a1="v">${["Toute l'école","Campus Delmas","Campus Pétion-Ville","7e A","8e A","9e A"].map(t2=>`<option ${k.pub.target===t2?"selected":""}>${t2}</option>`).join("")}</select><button class="soft" data-action="KLX.calPub" data-a0="s:${esc(k.id)}">${k.pub.status==="published"?(ht?"Depibliye":"Dépublier"):(ht?"Pibliye":"Publier")}</button></span>`:""}</div></div>`).join("")}
  <div class="card"><h3>${ht?"Istwa chanjman":"Historique des changements"}</h3>${X.calHist.slice(-8).reverse().map(h=>`<div class="u22 small">• ${esc(h.at)} — ${esc(h.by)} : ${esc(h.info)}</div>`).join("")||`<div class="small mut">—</div>`}
  <div class="toolbar"><button class="ghost" data-action="KLX.calCSV">CSV</button><button class="ghost" data-action="KLX.calICS">ICS</button><button class="ghost" data-action="print">${esc(T("print"))}</button></div></div>`;
}
function focusedMeet(){
  const list=X.meetings||[];
  return list.find(m=>m.id===X.focusMeet&&inScope(m.classId))||list.find(m=>m.status==="open"&&inScope(m.classId))||null;
}
function jitsiRoom(id){ return "NoriaCours"+String(id||"classe").replace(/[^a-zA-Z0-9]/g,""); }
function liveName(){
  const ht=lang()==="ht";
  return ({direction:ht?"Direksyon":"Direction",secretariat:"Secrétariat",enseignant:ht?"Pwofesè":"Enseignant",parent:ht?"Paran":"Parent",eleve:ht?"Elèv":"Élève",comptable:ht?"Kontablite":"Comptabilité",bibliothecaire:ht?"Bibliyotèk":"Bibliothèque"})[role()]||"NORIA";
}
function syncLive(meet){
  const existing=document.querySelector("#liveDock");
  if(!liveWanted||!meet||XROUTE!=="ext-visuel"){ if(existing) existing.remove(); return; }
  const ht=lang()==="ht";
  const room=jitsiRoom(meet.id);
  let dock=existing;
  if(!dock){
    dock=document.createElement("section");
    dock.id="liveDock";
    dock.className="live-dock";
    dock.setAttribute("aria-label", ht?"Kou an dirèk":"Cours en direct");
    dock.innerHTML='<div class="live-bar"><b></b><button type="button" class="ghost" id="liveClose"></button></div><p class="live-note"></p><div class="live-frame"></div>';
    document.body.appendChild(dock);
    dock.querySelector("#liveClose").onclick=()=>{ liveWanted=false; XGO("ext-visuel"); };
  }
  dock.querySelector(".live-bar b").textContent=(ht?"Kou an dirèk":"Cours en direct")+" · "+meet.title;
  dock.querySelector("#liveClose").textContent=ht?"Fèmen":"Fermer";
  dock.querySelector(".live-note").textContent=ht?"Jitsi gratis (meet.systemli.org) : kamera, mikwo, pataj ekran ak tablo. Pa gen kont. Sèvè piblik — demonstrasyon sèlman.":"Jitsi gratuit (meet.systemli.org) : caméra, micro, partage d'écran et tableau. Aucun compte. Serveur public — démonstration seulement.";
  const frame=dock.querySelector(".live-frame");
  if(frame.dataset.room!==room){
    frame.dataset.room=room;
    frame.replaceChildren();
    const iframe=document.createElement("iframe");
    iframe.title=ht?"Kou an dirèk":"Cours en direct";
    iframe.allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write";
    iframe.referrerPolicy="strict-origin-when-cross-origin";
    iframe.src="https://meet.systemli.org/"+encodeURIComponent(room)+"#config.prejoinPageEnabled=true&config.startWithAudioMuted=true&config.startWithVideoMuted=true&config.disableDeepLinking=true&userInfo.displayName="+encodeURIComponent(JSON.stringify(liveName()));
    frame.appendChild(iframe);
  }
}
function vSalles(){
  // Module chargé à la demande (src/salles-cours.js) ; il remplit #salRoot.
  setTimeout(()=>{ const el=document.getElementById("salRoot"); if(!el) return;
    (window.NORIA_ECO?NORIA_ECO.load("src/salles-cours.js"):Promise.reject()).then(()=>{ if(el.isConnected) NORIA_SAL.render(el); }).catch(()=>{ el.innerHTML="<div class='badbox'>"+esc(T("noAccess"))+"</div>"; }); },0);
  return '<div id="salRoot"><p class="mut">…</p></div>';
}
// Barre « Retour » commune à tout l'espace Extensions : page parente (salle → réunions) puis l'accueil des extensions ;
// depuis l'accueil des extensions, retour au tableau de bord.
const XPARENT={"ext-visuel":"ext-reunion","ext-classe":"ext-hub"};
function backBar(r){
  const ht=lang()==="ht"; const up=XPARENT[r]||"ext-hub"; const upL=(XR.find(m=>m.r===up)||{});
  if(r==="ext-hub") return `<nav class="xback noprint" aria-label="${ht?"Navigasyon":"Navigation"}"><button class="ghost" data-action="KL.go" data-a0="s:dashboard">← ${ht?"Retounen nan tablo debò":"Retour au tableau de bord"}</button></nav>`;
  return `<nav class="xback noprint" aria-label="${ht?"Navigasyon":"Navigation"}"><button class="ghost" data-action="KL.go" data-a0="s:${up}">← ${ht?"Retounen":"Retour"}${up!=="ext-hub"?" · "+esc(lbl(upL)):""}</button>${up!=="ext-hub"?`<button class="ghost small" data-action="KL.go" data-a0="s:ext-hub">${esc(T("ext"))}</button>`:""}<span class="mut small">${esc(T("ext"))} › ${esc(lbl(XR.find(m=>m.r===r)||{fr:r,ht:r}))}</span></nav>`;
}
function XGO(r){
  if(!canX(r)){ toast(T("noAccess")); return; }
  XROUTE = r;
  const v = document.querySelector("#view"); if(!v) return;
  try{ v.innerHTML = '<div data-xview="1" class="u34">'+backBar(r)+VV[r]()+'</div>'; }catch(e){ v.innerHTML = "<div class='badbox'>Erreur extension : "+esc(e.message)+"</div>"; }
  if(r==="ext-visuel") syncLive(focusedMeet());
  else { liveWanted=false; syncLive(null); }
  markNav(); window.scrollTo(0,0);
}
function markNav(){
  document.querySelectorAll("[data-xnav]").forEach(b=>{ b.classList.toggle("on", !!XROUTE); });
}

/* ---------- accueil « Aujourd'hui » par rôle (recherche portails — additif, injecté sans toucher le tableau de bord) ---------- */
function todayHTML(){
  const o=O(); const ht=lang()==="ht"; const r=role(); const td=today();
  const pendX=X.queue.filter(q=>q.st==="pending").length;
  const pendO=o?(o.queue||[]).length:0;
  const srv=document.documentElement.dataset.backend==="server";
  const demoLn=srv&&document.documentElement.dataset.demo!=="1"?"":srv?(ht?"Sèvè demonstrasyon : elèv ak klas soti nan sèvè a ; lòt modil yo rete lokal.":"Serveur de démonstration : élèves et classes viennent du serveur ; les autres modules restent locaux."):ht?"Demonstrasyon : done fo anrejistre sou aparèy sa a. Pa gen senkwonizasyon ak yon lekòl.":"Démonstration : données fictives enregistrées sur cet appareil. Aucune synchronisation avec une école.";
  const queueLn=pendO+pendX?` <b>${pendO+pendX}</b> ${ht?"nan fil lokal la":"dans la file locale"}.`:"";
  const ageL=(o&&o.attLog&&o.attLog[0])?o.attLog[0].date:(X.audit[0]?X.audit[0].at:"—");
  let body="";
  if(r==="direction"){
    const noCall=o?o.classes.filter(c=>!Object.values(o.attendance||{}).some(a=>a.classId===c.id&&a.day===td)).length:0;
    const sub=o?o.evals.filter(e=>e.status==="submitted").length:0;
    const late=o?o.loans.filter(l=>!l.back&&l.due<td).length:0;
    body=`<div class="small"> ${ht?"Jodi a":"Aujourd'hui"} : <b>${o?o.classes.length:0}</b> ${ht?"klas":"classes"} •  ${ht?"san apèl":"sans appel"} : <b>${noCall}</b> •  ${ht?"pou verifye":"à vérifier"} : <b>${sub}</b> •  ${ht?"reta":"retards"} : <b>${late}</b></div>
    <div class="toolbar"><button class="soft" data-action="KL.go" data-a0="s:attendance">${ht?"Fè apèl":"Faire l'appel"}</button><button class="ghost" data-action="KL.go" data-a0="s:academic">Ouvrir les notes</button><button class="ghost" data-action="KLX.tour" data-a0="s:annonce">Préparer une annonce</button><button class="ghost" data-action="KL.go" data-a0="s:ext-pilote">Validation pilote</button></div>`;
  } else if(r==="enseignant"){
    const tc=teacherCls(); const first=tc[0]; const ids=tc.map(c=>c.id);
    const d=o?o.evals.filter(e=>e.status==="draft"&&ids.includes(e.classId)).length:0;
    body=`<div class="small"> ${ht?"Pwochen klas":"Prochaine classe"} : <b>${first?esc(first.name):"—"}</b> •  ${ht?"bouyon":"brouillons"} : <b>${d}</b></div>
    <div class="toolbar">${first?`<button class="soft" data-action="KL.attGo" data-a0="s:${esc(first.id)}">${ht?"Fè apèl":"Faire l'appel"}</button>`:""}<button class="ghost" data-action="KL.go" data-a0="s:academic">Ouvrir les notes</button><button class="ghost" data-action="KLX.tour" data-a0="s:appel">Guide de l’appel</button></div>`;
  } else if(r==="parent"){
    const k=kidsOf();
    body=`<div class="small"> ${ht?"Chwazi pitit la — yon dosye alafwa":"Choisissez l'enfant — un dossier à la fois"} :</div>
    <div class="toolbar">${k.map(s=>`<button class="soft" data-action="KL.bulletin" data-a0="s:${esc(s.id)}"> ${esc(s.firstName)} <span class="mut">${esc(s.code)}</span></button>`).join("")||"—"}</div>`;
  } else if(r==="eleve"){
    const me=kidsOf()[0]; const hw=me?X.homework.filter(h=>h.classId===me.classId).sort((a,b)=>String(a.due).localeCompare(String(b.due))).slice(0,2):[];
    const pub=o&&me?o.evals.filter(e=>e.status==="published"&&e.classId===me.classId).length:0;
    body=`<div class="small"> ${ht?"Pwochen travay":"Prochains travaux"} : ${hw.map(h=>`<b>${esc(h.title)}</b> (${esc(h.due)})`).join(" • ")||"—"} •  ${ht?"nòt pibliye":"notes publiées"} : <b>${pub}</b></div>
    <div class="toolbar"><button class="soft" data-action="KL.go" data-a0="s:ext-devoirs">Devoirs et leçons</button><button class="ghost" data-action="KL.go" data-a0="s:academic">Ouvrir les notes</button><button class="ghost" data-action="KL.go" data-a0="s:library">Bibliothèque</button></div>`;
  } else if(r==="secretariat"){
    const mv=X.movements.filter(m=>!m.applied).length;
    body=`<div class="small"> ${ht?"Mouvman ki ap tann":"Mouvements en attente"} : <b>${mv}</b></div>
    <div class="toolbar"><button class="soft" data-action="KL.go" data-a0="s:ext-inscriptions">Suivi des inscriptions</button><button class="ghost" data-action="KL.go" data-a0="s:ext-setup">Installation de l’école</button><button class="ghost" data-action="KL.go" data-a0="s:ext-pilote">Validation pilote</button></div>`;
  } else if(r==="comptable"){
    const un=o?o.students.filter(s=>{const f=o.fees[s.level]; if(!f) return false; const p=o.payments.filter(p=>p.studentId===s.id).reduce((a,p)=>a+(+p.amount||0),0); return p<f.tuition;}).length:0;
    body=`<div class="small"> ${ht?"Elèv ki dwe":"Élèves avec solde dû"} : <b>${un}</b></div>
    <div class="toolbar"><button class="soft" data-action="KL.go" data-a0="s:finance">Ouvrir les finances</button><button class="ghost" data-action="KL.go" data-a0="s:ext-finances">Échéanciers et bourses</button></div>`;
  } else {
    const late=o?o.loans.filter(l=>!l.back&&l.due<td).length:0;
    body=`<div class="small">  ${ht?"reta":"retards"} : <b>${late}</b></div>
    <div class="toolbar"><button class="soft" data-action="KL.go" data-a0="s:ext-pret">Guichet des prêts</button><button class="ghost" data-action="KL.go" data-a0="s:library">Bibliothèque</button></div>`;
  }
  const doors=[["ext-reunion",ht?"Reyinyon":"Réunions"],["ext-visuel",ht?"Klas vizyèl":"Classe visuelle"],["ext-discussion",ht?"Diskisyon":"Discussion"],["ext-portails",ht?"Pòtay":"Portails"]].filter(([id])=>canX(id));
  return `<div class="u14 notice"><div class="row sp"><b> ${ht?"Jodi a":"Aujourd'hui"} — ${esc(td)}</b><span class="row"><button class="ghost" data-action="KLX.help"> ${ht?"Èd":"Aide"}</button></span></div><p class="u35 small">${esc(demoLn)}${queueLn}</p><p class="portal-kicker">${esc(ROLE_LBL[r]||r)}</p>${body}${doors.length?`<div class="toolbar">${doors.map(([id,lb])=>`<button class="ghost" data-action="KL.go" data-a0="s:${esc(id)}">${lb}</button>`).join("")}</div>`:""}<div class="small mut"> ${ht?"Dènye aktivite lokal":"Dernière activité locale"} : ${esc(ageL)}</div></div>`;
}
function injectToday(){
  if(XROUTE) return;
  if((window.__klLast||"dashboard")!=="dashboard") return;
  const v=document.querySelector("#view"); if(!v||v.querySelector("#todayStrip")) return;
  const d=document.createElement("div"); d.id="todayStrip"; d.innerHTML=todayHTML();
  v.insertBefore(d,v.firstChild);
}
function helpModal(){
  const ht=lang()==="ht";
  const w=document.createElement("div");
  w.innerHTML=`<div class="modal"><div class="sheet"><div class="noprint row sp"><b> ${ht?"Bezwen èd ?":"Besoin d'aide ?"}</b><button class="ghost" data-action="retirer" data-a0="s:.modal">${ht?"Fèmen":"Fermer"}</button></div>
  <div class="small">${ht?"Biwo lekòl la : [kontak pou ranplase] — presize wòl ou, klas la ak sa ou tap fè.":"Bureau de l'école : [contact à remplacer] — précisez votre rôle, la classe et l'action en cours."}</div>
  <div class="u2 warnbox small">${ht?"Pa voye done sante oswa dosye elèv nan sipò jeneral.":"Ne jamais envoyer de données de santé ni de dossiers d'élèves dans le support général."}</div>
  <div class="toolbar"><button class="ghost" data-action="KLX.tour" data-a0="s:appel"> ${ht?"Pakou apèl":"Parcours appel"}</button><button class="ghost" data-action="KL.go" data-a0="s:ext-setup"> ${ht?"Enstalasyon":"Installation"}</button></div></div></div>`;
  document.body.appendChild(w);
}

/* ---------- validation pilote : cibles à mesurer, pas des promesses ---------- */
function vPilote(){
  const ht=lang()==="ht"; const o=O();
  const done=id=>{ try{ return !!(X.toursDone&&X.toursDone[id]); }catch(e){ return false; } };
  const pendX=X.queue.filter(q=>q.st==="pending").length;
  const pendO=o?(o.queue||[]).length:0;
  const badge=(document.querySelector("#syncBadge")||{textContent:""}).textContent;
  let lsB=0; try{ lsB=((localStorage.getItem("klirline_school_v1")||"").length+(localStorage.getItem("klirline_ext_v1")||"").length); }catch(e){}
  let nav="—"; try{ const n=performance.getEntriesByType("navigation")[0]; if(n) nav=`DCL ${Math.round(n.domContentLoadedEventEnd)} ms • load ${Math.round(n.loadEventEnd)} ms`; }catch(e){}
  const viewB=(document.querySelector("#view")||{innerHTML:""}).innerHTML.length;
  const row=(ok,t2,ev)=>`<div class="u15 row sp"><span>${ok?"":""} <b>${t2}</b><br><span class="small mut">${ev}</span></span></div>`;
  return `<div class="row sp"><h2 class="u6"> ${ht?"Validasyon pilòt":"Validation pilote"}</h2><span class="row"><button class="ghost" data-action="KL.go" data-a0="s:ext-pilote">↻ ${ht?"Mezire":"Mesurer"}</button><button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></span></div>
  <div class="warnbox small">${ht?"Sa yo se SIB pou mezire sou teren (Android debaz, 4G lant / koupe), pa rezilta.":"Ce sont des CIBLES à mesurer sur le terrain (Android d'entrée de gamme, 4G lente/coupée), pas des résultats acquis."}</div>
  <div class="u8 card">
  ${row(done("appel"),ht?"Apèl an ≤ 3 aksyon":"Appel en ≤ 3 actions",(o&&o.attLog?o.attLog.length:0)+" appels journalisés"+(done("appel")?" • parcours guidé ✓":(ht?" • pakou gide pou teste":" • parcours guidé à tester")))}
  ${row(done("dossier"),ht?"Okenn konfizyon pitit/destinatè":"Aucune confusion enfant/destinataire",(ht?"yon pitit apre lòt (kat → bilten)":"pastilles par enfant (carte → relevé)")+" • "+(o?o.students.length:0)+(ht?" elèv":" élèves"))}
  ${row((pendO+pendX)===0||!!badge,(ht?"Tout sa ki ap tann parèt":"100 % non synchronisé signalé"),(ht?"Fil : ":"File : ")+pendO+" + "+pendX+" • badge « "+esc(badge||"—")+" »")}
  ${row(true,(ht?"Pwa akèy (san medya)":"Poids de l'accueil (hors médias)"),(ht?"Stokaj lokal : ":"Stockage local : ")+Math.round(lsB/1024)+" Ko • vue : "+Math.round(viewB/1024)+" Ko")}
  ${row(true,(ht?"Repè web.dev (sib)":"Repères web.dev (cibles)"),"LCP ≤ 2,5 s • INP ≤ 200 ms • CLS ≤ 0,1 (p75 mobile) • "+nav+" "+(ht?"(preview dev, PA reprezantatif)":"(préview dev, NON représentatif)"))}
  </div>
  <div class="card"><h3>${ht?"Pwotokòl tès":"Protocole de test"}</h3><div class="small">1. ${ht?"Jwenn orè, avi absans, bilten pibliye (konbyen tan ?).":"Retrouver horaire, avis d'absence, relevé publié (combien de temps ?)"}<br>2. ${ht?"Fè apèl — èske « anrejistre / ap tann / senkwonize » klè ?":"Faire l'appel — « enregistré / en attente / synchronisé » est-il compris ?"}<br>3. ${ht?"Pase ant pitit san louvri dosye yon lòt.":"Passer d'un enfant à l'autre sans ouvrir un autre dossier."}<br>4. ${ht?"Pibliye anons la pou moun ki konsène yo.":"Publier une annonce à la bonne audience."}</div></div>`;
}

/* ---------- continuité scolaire P1 (perturbation → reprise — dossier d'événement, additif démo) ---------- */
const CX_TYPES=["fermeture temporaire","horaire modifié","reprise partielle","lieu temporaire","reprise complète"];
const CX_STATUS=["brouillon","publié","terminé","annulé"];
function cxLbl(s,ht){ return ({brouillon:ht?"Bouyon":"Brouillon","publié":ht?"Pibliye":"Publié","terminé":ht?"Fini":"Terminé","annulé":ht?"Anile":"Annulé"})[s]||s; }
function cxStBadge(s){ return s==="publié"?"b-present":s==="brouillon"?"b-pending":s==="terminé"?"b-synced":"b-conflict"; }
function cxVisible(e){
  if(e.status!=="publié") return false;
  const r=role();
  if(["direction","secretariat","comptable","bibliothecaire"].includes(r)) return true;
  if(r==="enseignant"){ const tc=teacherCls().map(c=>c.id); return !e.classIds.length||e.classIds.some(c=>tc.includes(c)); }
  const k=kidsOf(); const camps=k.map(s=>s.campus); const cls=k.map(s=>s.classId);
  const campOk=!e.campuses.length||e.campuses.some(c=>camps.includes(c));
  const clsOk=!e.classIds.length||e.classIds.some(c=>cls.includes(c));
  return campOk&&clsOk;
}
function vContinuite(){
  const ht=lang()==="ht"; const o=O(); const r=role();
  const canWrite=["direction","secretariat"].includes(r);
  const canPublish=(r==="direction");
  const camps=[...new Set([...((o&&o.school&&o.school.campuses)||[]),...X.cfg.campuses])];
  const classes=classScope();
  const evts=X.continuite.slice().reverse();
  const vis=evts.filter(e=>canWrite||cxVisible(e));
  const plansByEv={}; X.replans.forEach(p=>{ (plansByEv[p.eventId]=plansByEv[p.eventId]||[]).push(p); });
  const agg={}; X.replans.forEach(p=>{ agg[p.state]=(agg[p.state]||0)+1; });
  let h=`<div class="row sp"><h2 class="u6"> ${ht?"Kontinite lekòl":"Continuité scolaire"}</h2><span class="row">${["direction","secretariat"].includes(r)?`<button class="ghost" data-action="KLX.cxCSV">CSV</button><button class="ghost" data-action="KLX.cxPrint">${ht?"Rezime":"Résumé"}</button>`:""}<button class="ghost" data-action="KL.go" data-a0="s:ext-hub">← ${esc(T("ext"))}</button></span></div>
  <div class="warnbox small">${ht?"Modil operasyonèl : li pa di si yon lekòl an sekirite, li pa swiv kote fanmi yo, li pa deside pwomosyon.":"Module opérationnel : il ne dit pas si une école est sûre, ne suit pas les familles, ne décide d'aucune promotion."}</div>
  <div class="small mut">${ht?"Evènman":"Événements"} : <b>${X.continuite.filter(e=>e.status==="publié").length} ${ht?"pibliye":"publiés"}</b> • ${ht?"Plan repriz":"Plans de reprise"} : <b>${X.replans.length}</b>${Object.keys(agg).length?" ("+Object.entries(agg).map(([k,v])=>v+" "+esc(k)).join(" • ")+")":""}</div>`;
  if(canWrite) h+=`<div class="u8 card"><h3> ${ht?"Nouvo evènman":"Nouvel événement"}</h3>
    <div class="grid g2"><div class="fld"><label>Type</label><select id="cx_t">${CX_TYPES.map(t2=>`<option>${t2}</option>`).join("")}</select></div>
    <div class="fld"><label>${ht?"Tit":"Titre"}</label><input id="cx_ti" placeholder="${ht?"Fèmti tanporè — fevriye":"Fermeture temporaire — février"}"></div></div>
    <div class="fld"><label>${ht?"Kanpis (vid = tout lekòl)":"Campus (vide = toute l'école)"}</label><div class="u36 row">${camps.map(c=>`<label class="small"><input type="checkbox" class="cx_camp" value="${esc(c)}"> ${esc(c)}</label>`).join("")||"<span class='small mut'>—</span>"}</div></div>
    <div class="fld"><label>${ht?"Klas (vid = tout)":"Classes (vide = toutes)"}</label><div class="u36 row">${classes.map(c=>`<label class="small"><input type="checkbox" class="cx_cls" value="${c.id}"> ${esc(c.name)}</label>`).join("")}</div></div>
    <div class="grid g2"><div class="fld"><label>${ht?"Kòmansman":"Début"}</label><input id="cx_ds" type="date" value="${today()}"></div>
    <div class="fld"><label>Fin (estimée)</label><input id="cx_de" type="date" value="${today()}"></div></div>
    <div class="fld"><label>${ht?"Responsab":"Responsable"}</label><input id="cx_rp" placeholder="${ht?"Non":"Nom"}"></div>
    <div class="toolbar"><button class="soft" data-action="KLX.cxAdd">OK (${ht?"bouyon":"brouillon"})</button></div></div>`;
  h+=vis.map(e=>{
    const pls=plansByEv[e.id]||[];
    const clsIds=e.classIds.length?e.classIds:(o?o.classes.map(c=>c.id):[]);
    const board=clsIds.map(cid=>{ const c=cls(cid); const ps=pls.filter(p=>p.classId===cid); const st={}; ps.forEach(p=>st[p.state]=(st[p.state]||0)+1);
      return `<div class="u37 small">${esc(c?c.name:cid)} : ${ps.length?Object.entries(st).map(([k,v])=>v+" "+esc(k)).join(" • "):"<span class='mut'>"+(ht?"okenn plan":"aucun plan")+"</span>"}</div>`; }).join("");
    const canPlan=["direction","secretariat"].includes(r)||(r==="enseignant"&&(!e.classIds.length||e.classIds.some(c=>teacherCls().map(x=>x.id).includes(c))));
    const planOpts=(r==="enseignant"?teacherCls():classes).filter(c=>!e.classIds.length||e.classIds.includes(c.id));
    return `<div class="u8 card"><div class="row sp"><span><b>${esc(e.title)}</b> <span class="badge">${esc(e.type)}</span> <span class="badge ${cxStBadge(e.status)}">${cxLbl(e.status,ht)}</span></span>
    ${canPublish&&e.status==="brouillon"?`<button class="soft" data-action="KLX.cxStatus" data-a0="s:${esc(e.id)}" data-a1="s:publié">${ht?"Pibliye":"Publier"}</button>`:""}
    ${canPublish&&e.status==="publié"?`<button class="soft" data-action="KLX.cxStatus" data-a0="s:${esc(e.id)}" data-a1="s:terminé">${ht?"Fini":"Terminer"}</button>`:""}
    ${canPublish&&!["terminé","annulé"].includes(e.status)?`<button class="ghost" data-action="KLX.cxStatus" data-a0="s:${esc(e.id)}" data-a1="s:annulé">${ht?"Anile":"Annuler"}</button>`:""}</div>
    <div class="small mut">${esc(e.start)} → ${esc(e.end)} •  ${(e.campuses||[]).join(", ")||(ht?"tout lekòl":"toute l'école")} • ${(e.classIds||[]).map(cid=>esc((cls(cid)||{}).name||cid)).join(", ")||(ht?"tout klas":"toutes classes")} •  ${esc(e.resp||"—")}${e.calId?` •  ${ht?"lye":"lié"}`:""}${e.annId?` •  ${ht?"lye":"lié"}`:""}</div>
    ${canWrite&&e.status!=="annulé"?`<div class="toolbar"><button class="ghost" data-action="KLX.cxCal" data-a0="s:${esc(e.id)}"> ${ht?"Kopi nan kalendriye":"Copier vers le calendrier"}</button><button class="ghost" data-action="KLX.cxAn" data-a0="s:${esc(e.id)}"> ${ht?"Kreye anons":"Créer l'annonce"}</button></div>`:""}
    <h3 class="u2">${ht?"Repriz pa klas":"Reprise par classe"}</h3>${board}
    ${pls.length?`<details class="small"><summary>${ht?"Plan repriz":"Plans de reprise"} (${pls.length})</summary>${pls.map(p=>{const c=cls(p.classId);return `<div>• <b>${esc((c||{}).name||"")}</b> — ${esc(p.activity)} <span class="mut">(${esc(p.date)} • ${esc(p.state)}${p.res?` •  ${esc(p.res)}`:""} • ${esc(p.by)})</span></div>`;}).join("")}</details>`:""}
    ${canPlan&&e.status==="publié"?`<div class="toolbar"><select id="cx_pc_${e.id}">${planOpts.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select><input id="cx_pa_${e.id}" placeholder="${ht?"Aktivite ratrapaj":"Activité de rattrapage"}" class="u26"><input id="cx_pd_${e.id}" type="date" value="${today()}" class="u19"><input id="cx_pr_${e.id}" placeholder="${ht?"Resous lejè (opsyonèl)":"Ressource légère (optionnel)"}" class="u38"><select id="cx_ps_${e.id}"><option>accessible</option><option>en attente</option><option>hors ligne</option></select><button data-action="KLX.cxPlan" data-a0="s:${esc(e.id)}">OK</button></div>`:""}
    <details class="small"><summary>${ht?"Istwa":"Historique"}</summary>${(e.hist||[]).map(x=>`<div>• ${esc(x.at)} — ${esc(x.by)} : ${esc(x.info)}</div>`).join("")}</details></div>`;
  }).join("")||`<div class="u8 card mut">${ht?"Okenn evènman vizib.":"Aucun événement visible."}</div>`;
  return h;
}

/* ---------- API publique KLX ---------- */
const KLX = window.KLX = {};
KLX.roomOpen = id=>{ const m=(X.meetings||[]).find(x=>x.id===id); if(!m||!inScope(m.classId)){ toast(T("noAccess")); return; } X.focusMeet=id; X.focusClass=m.classId; liveWanted=true; save(); XGO("ext-visuel"); };
KLX.liveToggle = ()=>{ if(!focusedMeet()){ toast(T("noAccess")); return; } liveWanted=!liveWanted; XGO("ext-visuel"); };
KLX.meetAdd = ()=>{
  if(!canLead()){ toast(T("noAccess")); return; }
  const g=id=>{ const n=document.querySelector(id); return n?String(n.value||"").trim():""; };
  const classId=g("#mt_cls"); if(!inScope(classId)){ toast(T("noAccess")); return; }
  const title=g("#mt_title"); if(!title){ toast("!"); return; }
  let external=""; try{ external=extHref(g("#mt_ext")); }catch(e){ toast(lang()==="ht"?"Lyen an dwe https":"Le lien doit être en https"); return; }
  X.meetings=X.meetings||[];
  X.meetings.push({id:XD.uid("m"),classId,title,subject:g("#mt_sub"),date:g("#mt_date")||today(),time:g("#mt_time")||"09:00",agenda:g("#mt_agenda"),by:role(),status:"planned",external,present:[]});
  save(); audit("reunion.create",title); XGO("ext-reunion");
};
KLX.meetStatus = (id,status)=>{
  const m=(X.meetings||[]).find(x=>x.id===id); if(!m||!canLead()||!inScope(m.classId)){ toast(T("noAccess")); return; }
  m.status=status; save(); audit("reunion."+status,m.title); XGO("ext-reunion");
};
KLX.meetHere = (id,sid)=>{
  const m=(X.meetings||[]).find(x=>x.id===id);
  const staffLead=m&&(role()==="direction"||(role()==="enseignant"&&classScope().some(c=>c.id===m.classId)));
  if(!staffLead){ toast(T("noAccess")); return; }
  m.present=m.present||[];
  const i=m.present.indexOf(sid); if(i>=0) m.present.splice(i,1); else m.present.push(sid);
  X.focusMeet=id; save(); XGO("ext-visuel");
};
KLX.discClass = id=>{ if(!inScope(id)){ toast(T("noAccess")); return; } X.focusClass=id; save(); XGO("ext-discussion"); };
KLX.threadAdd = classId=>{
  if(!(role()==="direction"||(role()==="enseignant"&&classScope().some(c=>c.id===classId)))){ toast(T("noAccess")); return; }
  const title=(document.querySelector("#th_title")||{}).value; if(!String(title||"").trim()){ toast("!"); return; }
  X.threads=X.threads||[];
  X.threads.push({id:XD.uid("th"),classId,title:String(title).trim().slice(0,120),posts:[]});
  X.focusClass=classId; save(); audit("discussion.sujet",title); XGO("ext-discussion");
};
KLX.postAdd = (threadId, back)=>{
  const th=(X.threads||[]).find(t=>t.id===threadId); if(!th||!inScope(th.classId)){ toast(T("noAccess")); return; }
  const r=role();
  const ok=r==="direction"||r==="enseignant"||r==="eleve"||(r==="parent"&&X.discParentWrite);
  if(!ok){ toast(T("noAccess")); return; }
  const input=document.querySelector("#th_"+threadId); const text=input?String(input.value||"").trim():"";
  if(!text){ toast("!"); return; }
  const who=r==="eleve"||r==="parent"?kidsOf().find(s=>s.classId===th.classId):null;
  if((r==="eleve"||r==="parent")&&!who){ toast(T("noAccess")); return; }
  th.posts.push({id:XD.uid("p"),role:r,sid:who?who.id:"",text:text.slice(0,500),at:new Date().toLocaleString(),hidden:false});
  save(); audit("discussion.message",th.title); XGO(back==="ext-visuel"?"ext-visuel":"ext-discussion");
};
KLX.roomThread = classId=>{
  if(!(role()==="direction"||(role()==="enseignant"&&classScope().some(c=>c.id===classId)))){ toast(T("noAccess")); return; }
  const title=(document.querySelector("#th_room")||{}).value; if(!String(title||"").trim()){ toast("!"); return; }
  X.threads=X.threads||[];
  X.threads.push({id:XD.uid("th"),classId,title:String(title).trim().slice(0,120),posts:[]});
  X.focusClass=classId; save(); audit("discussion.sujet",title); XGO("ext-visuel");
};
KLX.postHide = (threadId,postId,back)=>{
  const th=(X.threads||[]).find(t=>t.id===threadId); if(!th){ toast(T("noAccess")); return; }
  const lead=role()==="direction"||(role()==="enseignant"&&classScope().some(c=>c.id===th.classId));
  if(!lead){ toast(T("noAccess")); return; }
  const p=(th.posts||[]).find(x=>x.id===postId); if(!p) return;
  p.hidden=true; save(); audit("discussion.masque",th.title); XGO(back==="ext-visuel"?"ext-visuel":"ext-discussion");
};
KLX.parentWrite = on=>{
  if(role()!=="direction"){ toast(T("noAccess")); return; }
  X.discParentWrite=!!on; save(); audit("portail.parent-ecrit",on?"oui":"non"); XGO("ext-portails");
};
KLX.portalSet = (rn,key,bucket,on)=>{
  if(role()!=="direction"){ toast(T("noAccess")); return; }
  if(rn==="direction"&&(key==="settings"||key==="ext-portails")) return;
  if(denied(rn,key)){ toast(T("noAccess")); XGO("ext-portails"); return; }
  const p=ensurePortals()[rn]; if(!p) return;
  const arr=bucket==="spaces"?p.spaces:p.core;
  const i=arr.indexOf(key);
  if(on&&i<0) arr.push(key);
  if(!on&&i>=0) arr.splice(i,1);
  save(); audit("portail."+rn,key+" "+(on?"ouvert":"fermé"));
  if(window.KL.refreshNav) window.KL.refreshNav();
  injectNav();
  XGO("ext-portails");
};
KLX.go = XGO;
KLX.lastOld = ()=>window.__klLast||"dashboard";
KLX.help = ()=>{ helpModal(); };
KLX.clAdd = ()=>{
  if(!["direction","enseignant"].includes(role())){ toast(T("noAccess")); return; }
  const val=id=>(document.querySelector(id)?.value||"").trim();
  const classId=val("#cl_cls"), title=val("#cl_title"), subject=val("#cl_subject"), date=val("#cl_date"), time=val("#cl_time");
  const clsItem=classScope().find(c=>c.id===classId);
  if(!clsItem||!title||!subject||!date||!time){ toast(lang()==="ht"?"Ranpli klas, matyè, tit, dat ak lè.":"Renseignez la classe, la matière, le titre, la date et l'heure."); return; }
  let resource="";
  if(val("#cl_resource")){ try{ const u=new URL(val("#cl_resource")); if(u.protocol!=="https:") throw new Error("https"); resource=u.href; }catch(e){ toast(lang()==="ht"?"Lyen resous la dwe yon URL HTTPS valab.":"Le lien de ressource doit être une adresse HTTPS valide."); return; } }
  const sessions=X.classrooms||(X.classrooms=[]);
  sessions.push({id:XD.uid("room"),classId,title,subject,date,time,resource,agenda:val("#cl_agenda").slice(0,1000),by:role(),createdAt:new Date().toISOString()});
  save(); audit("classe.virtuelle.create",title+" / "+clsItem.name); XGO("ext-classe"); toast(T("saveOk"));
};
KLX.clEnter = id=>{
  const s=(X.classrooms||[]).find(x=>x.id===id&&classScope().some(c=>c.id===x.classId));
  if(!s){ toast(T("noAccess")); return; }
  X.meetings=X.meetings||[];
  let m=X.meetings.find(x=>x.fromRoom===s.id);
  const link=s.resource||(/^https:\/\//.test(String(s.zoom||""))?s.zoom:"");
  if(!m){
    m={id:XD.uid("m"),classId:s.classId,title:s.title,subject:s.subject||"",date:s.date,time:s.time,agenda:s.agenda||"",by:s.by||role(),status:"open",external:link,present:[],fromRoom:s.id};
    X.meetings.push(m);
  } else {
    m.status="open"; m.title=s.title; m.subject=s.subject||""; m.date=s.date; m.time=s.time; m.agenda=s.agenda||"";
    if(link) m.external=link;
  }
  X.focusMeet=m.id; X.focusClass=s.classId; liveWanted=true;
  save(); audit("classe.entrer",s.title); XGO("ext-visuel");
};
KLX.clDel = id=>{ if(!["direction","enseignant"].includes(role())){ toast(T("noAccess")); return; }
  const sessions=X.classrooms||[], i=sessions.findIndex(s=>s.id===id&&classScope().some(c=>c.id===s.classId)); if(i<0){ toast(T("noAccess")); return; }
  if(!confirm(lang()==="ht"?"Retire kou sa a ?":"Supprimer ce cours ?")) return;
  sessions.splice(i,1); save(); audit("classe.virtuelle.delete",id); XGO("ext-classe");
};
/* ----- continuité scolaire ----- */
KLX.cxAdd = ()=>{ if(!["direction","secretariat"].includes(role())){ toast(T("noAccess")); return; }
  const g=id=>document.querySelector(id).value.trim();
  const title=g("#cx_ti"); if(!title){ toast("!"); return; }
  const e={id:XD.uid("cx"),type:document.querySelector("#cx_t").value,title,
    campuses:[...document.querySelectorAll(".cx_camp:checked")].map(x=>x.value),
    classIds:[...document.querySelectorAll(".cx_cls:checked")].map(x=>x.value),
    start:document.querySelector("#cx_ds").value||today(),end:document.querySelector("#cx_de").value||today(),
    resp:g("#cx_rp")||"—",status:"brouillon",calId:null,annId:null,by:role(),
    hist:[{at:new Date().toLocaleString(),by:role(),info:"créé (brouillon)"}]};
  X.continuite.push(e); queuePush("continuite",title); save(); audit("continuite.create",title); XGO("ext-continuite"); toast(T("saveOk")); };
KLX.cxStatus = (id,st)=>{ if(role()!=="direction"){ toast(T("noAccess")); return; }
  const e=X.continuite.find(x=>x.id===id); if(!e) return;
  if(!confirm((lang()==="ht"?"Chanje estati → ":"Changer le statut → ")+st+" ?")) return;
  e.status=st; e.hist.push({at:new Date().toLocaleString(),by:role(),info:"statut → "+st});
  save(); audit("continuite.statut",e.title+" → "+st); XGO("ext-continuite"); };
KLX.cxCal = id=>{ if(!["direction","secretariat"].includes(role())){ toast(T("noAccess")); return; }
  const e=X.continuite.find(x=>x.id===id); if(!e||e.calId){ toast("—"); return; }
  if(!confirm((X.continuite.length||0)+" → "+(lang()==="ht"?"kopye nan kalendriye ?":"copier vers le calendrier ?"))) return;
  try{ const raw=localStorage.getItem(XD.LSO); const o=JSON.parse(raw); const kid="k"+Date.now();
    o.calendar.push({id:kid,name:"[Continuité] "+e.title,start:e.start,end:e.end,type:"meeting"});
    localStorage.setItem(XD.LSO,JSON.stringify(o));
    X.calPub[kid]={status:"published",target:(e.campuses||[]).join(", ")||"Toute l'école"};
    X.calHist.push({at:new Date().toLocaleString(),by:role(),info:"continuité → calendrier : "+e.title});
    e.calId=kid; e.hist.push({at:new Date().toLocaleString(),by:role(),info:"copié vers le calendrier"});
  }catch(err){ toast("Erreur: "+err.message); return; }
  save(); audit("continuite.calendrier",e.title); toast(T("saveOk")); setTimeout(()=>location.reload(),900); };
KLX.cxAn = id=>{ if(!["direction","secretariat"].includes(role())){ toast(T("noAccess")); return; }
  const e=X.continuite.find(x=>x.id===id); if(!e||e.annId){ toast("—"); return; }
  const tgt=[...(e.campuses||[]),...(e.classIds||[]).map(cid=>{const c=cls(cid);return c?c.name:cid;})].join(", ")||"Toute l'école";
  const a={id:XD.uid("s"),title:"Continuité : "+e.title,target:tgt,channel:"Papier",text:e.type+" — "+e.start+" → "+e.end+" — Resp. "+e.resp,sendAt:e.start,status:"scheduled",by:role()};
  X.sched.unshift(a); e.annId=a.id; e.hist.push({at:new Date().toLocaleString(),by:role(),info:"annonce liée ("+tgt+")"});
  queuePush("annonce",a.title); save(); audit("continuite.annonce",e.title); XGO("ext-continuite"); toast(T("saveOk")); };
KLX.cxPlan = eid=>{ const e=X.continuite.find(x=>x.id===eid); if(!e||e.status!=="publié") return;
  const r=role(); if(r==="enseignant"&&e.classIds.length&&!e.classIds.some(c=>teacherCls().map(x=>x.id).includes(c))){ toast(T("noAccess")); return; }
  if(!["direction","secretariat","enseignant"].includes(r)){ toast(T("noAccess")); return; }
  const g=id=>(document.querySelector(id)||{value:""}).value.trim();
  const act=g("#cx_pa_"+eid); if(!act) return;
  X.replans.push({id:XD.uid("p"),eventId:eid,classId:document.querySelector("#cx_pc_"+eid).value,activity:act,
    date:document.querySelector("#cx_pd_"+eid).value||today(),res:g("#cx_pr_"+eid),state:document.querySelector("#cx_ps_"+eid).value,
    by:r,at:new Date().toLocaleString()});
  queuePush("reprise",eid); save(); audit("continuite.plan",eid+" "+act.slice(0,60)); XGO("ext-continuite"); toast(T("saveOk")); };
KLX.cxCSV = ()=>{ if(!["direction","secretariat"].includes(role())){ toast(T("noAccess")); return; }
  dl("continuite.csv",csv([["titre","type","statut","debut","fin","campus","classes","responsable","plans"],
    ...X.continuite.map(e=>[e.title,e.type,e.status,e.start,e.end,(e.campuses||[]).join("+"),(e.classIds||[]).join("+"),e.resp,X.replans.filter(p=>p.eventId===e.id).length])]),"text/csv");
  audit("export","continuite.csv"); };
KLX.cxPrint = ()=>{ if(!["direction","secretariat"].includes(role())){ toast(T("noAccess")); return; }
  audit("print","continuité scolaire");
  xPrint("Continuité scolaire — résumé",[(lang()==="ht"?"Tit":"Titre"),"Type","Statut","Période","Plans"],
    X.continuite.map(e=>[e.title,e.type,e.status,e.start+" → "+e.end,String(X.replans.filter(p=>p.eventId===e.id).length)])); };
KLX.sync = ()=>{ if(!online()){ toast(T("offline")); return; } const n=flushQ(); audit("sync.ext",n+" items"); toast(T("syncedX")+(n?` (${n})`:"")); if(XROUTE&&VV[XROUTE]) XGO(XROUTE); injectNav(); };
KLX.hwCls = v=>{ hwCls=v; XGO("ext-devoirs"); };
KLX.hwModal = ()=>{ const cl=classScope(); document.querySelector("#xModal").innerHTML=`<div class="modal"><div class="sheet"><h3>${esc(T("newHw"))}</h3><div class="grid g2"><div class="fld"><label>Classe</label><select id="h_c">${cl.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div><div class="fld"><label>${esc(T("subject"))}</label><input id="h_s" value="Français / Kreyòl"></div></div><div class="fld"><label>${esc(T("title"))}</label><input id="h_t"></div><div class="fld"><label>${esc(T("instructions"))}</label><textarea id="h_i" rows="3"></textarea></div><div class="grid g2"><div class="fld"><label>${esc(T("due"))}</label><input id="h_d" type="date" value="${today()}"></div><div class="fld"><label>${esc(T("attachNote"))}</label><input id="h_f" placeholder="exo7.pdf (~200 Ko)"></div></div><div class="row"><button data-action="KLX.hwSave">${esc(T("save"))}</button><button class="ghost" data-action="vider" data-a0="s:#xModal">${esc(T("cancel"))}</button></div></div></div>`; };
KLX.hwSave = ()=>{ const g=id=>document.querySelector(id).value.trim(); const title=g("#h_t"); if(!title) return; X.homework.push({id:XD.uid("h"),classId:g("#h_c"),subject:g("#h_s")||"—",title,instructions:g("#h_i"),due:g("#h_d")||today(),file:g("#h_f"),at:new Date().toLocaleString(),by:role(),st:online()?"synced":"pending"}); queuePush("homework",title); audit("devoir.create",title); XGO("ext-devoirs"); toast(T("saveOk")); };
KLX.hwDel = id=>{ X.homework=X.homework.filter(h=>h.id!==id); save(); audit("devoir.del",id); XGO("ext-devoirs"); };
KLX.addCampus = ()=>{ const v=document.querySelector("#x_campus").value.trim(); if(!v) return; if(!X.cfg.campuses.includes(v)) X.cfg.campuses.push(v); save(); audit("structure.campus",v); XGO("ext-structure"); };
KLX.setSection = (cid,v)=>{ X.cfg.sections[cid]=v.trim(); save(); audit("structure.section",cid+"="+v); };
KLX.addSub = ()=>{ const n=document.querySelector("#x_sub").value.trim(); if(!n) return; X.cfg.subjects.push({id:XD.uid("s"),name:n,coef:+document.querySelector("#x_coef").value||2}); save(); audit("structure.subject",n); XGO("ext-structure"); };
KLX.addPer = ()=>{ const n=document.querySelector("#x_per").value.trim(); if(!n) return; X.cfg.periods.push({name:n}); save(); audit("structure.period",n); XGO("ext-structure"); };
KLX.setScale = ()=>{ X.cfg.scale={pass:+document.querySelector("#x_pass").value||50,max:+document.querySelector("#x_max").value||100,round:document.querySelector("#x_round").value||"0.5"}; save(); audit("structure.scale",JSON.stringify(X.cfg.scale)); XGO("ext-structure"); toast(T("saveOk")); };
KLX.mvQ = v=>{ mvQ=v; XGO("ext-inscriptions"); const n=document.querySelector("#view input"); if(n){ n.focus(); try{n.setSelectionRange(n.value.length,n.value.length);}catch(e){} } };
KLX.mvSid = v=>{ mvSid=v; XGO("ext-inscriptions"); };
KLX.mvCSV = ()=>{ dl("mouvements.csv",csv([["date","eleve","code","type","de","vers","motif","par"],...X.movements.map(m=>{const s=stu(m.studentId);return [m.at,(s?s.firstName+" "+s.lastName:"?"),(s?s.code:""),T(m.kind),m.from||"",m.to||"",m.motif||"",m.by];})]),"text/csv"); audit("export","mouvements.csv"); };
KLX.addUrg = sid=>{ const n=document.querySelector("#x_un").value.trim(); if(!n) return; (X.emergency[sid]=X.emergency[sid]||[]).push({name:n,link:document.querySelector("#x_ul").value||"—",phone:document.querySelector("#x_up").value||"—"}); save(); audit("urgence.add",sid); XGO("ext-inscriptions"); };
KLX.addSib = sid=>{ const code=document.querySelector("#x_sib").value.trim(); const o=O(); const k=o.students.find(s=>s.code===code||s.id===code); if(!k||k.id===sid){ toast("?"); return; } X.sibX.push({a:sid,b:k.id}); save(); audit("fratrie.add",sid+"+"+k.id); XGO("ext-inscriptions"); };
KLX.addMv = sid=>{ const kind=document.querySelector("#x_mk").value, to=document.querySelector("#x_to").value, motif=document.querySelector("#x_mo").value.trim(); const s=stu(sid); X.movements.push({id:XD.uid("m"),studentId:sid,kind,from:s?s.classId:"",to:["mvTr","mvPro"].includes(kind)?to:"",motif,at:new Date().toLocaleString(),by:role(),applied:false}); queuePush("movement",sid+" "+kind); audit("mouvement",sid+" "+kind); XGO("ext-inscriptions"); toast(T("saveOk")); };
KLX.applyReg = ()=>{ const pend=X.movements.filter(m=>!m.applied&&(m.kind==="mvTr"||m.kind==="mvPro")&&m.to); if(!pend.length){ toast("—"); return; } if(!confirm(pend.length+" mouvement(s) → registre ?")) return;
  try{ const raw=localStorage.getItem(XD.LSO); const o=JSON.parse(raw); pend.forEach(m=>{ const s=o.students.find(x=>x.id===m.studentId); const c=o.classes.find(x=>x.id===m.to); if(s&&c){ s.classId=c.id; s.level=c.level; s.campus=c.campus; m.applied=true; } }); localStorage.setItem(XD.LSO,JSON.stringify(o)); }catch(e){ toast("Erreur: "+e.message); return; }
  const nx=XD.loadX(); X.movements=nx.movements; save(); audit("registre.apply",pend.length+" mouvements"); toast(T("appliedOk")); setTimeout(()=>location.reload(),900); };
KLX.pfCls = v=>{ pfCls=v; XGO("ext-presences"); };
KLX.setPref = (sid,k,v)=>{ (X.prefs[sid]=X.prefs[sid]||{canal:"WhatsApp",ok:false}); if(k==="canal")X.prefs[sid].canal=v; else X.prefs[sid].ok=!!+v; save(); };
KLX.avis = (key,sid)=>{ X.avis[key+"|"+sid]={at:today(),by:role(),canal:(X.prefs[sid]||{}).canal||"—"}; queuePush("avis",key); save(); audit("avis",key+" "+sid); XGO("ext-presences"); };
KLX.attCorr = ()=>{ const sid=document.querySelector("#x_cs").value, next=document.querySelector("#x_cn").value, motif=document.querySelector("#x_cm").value.trim(); const o=O(); let prev=""; Object.values(o.attendance||{}).forEach(a=>{ if(a.classId===pfCls&&a.records&&a.records[sid]) prev=a.records[sid]; }); X.attCorr.push({classId:pfCls,day:today(),sid,prev,next,motif:motif||"—",by:role(),at:new Date().toLocaleString()}); queuePush("attCorr",sid); save(); audit("presence.correction",sid+" "+prev+"→"+next+" "+motif); XGO("ext-presences"); toast(T("saveOk")); };
KLX.schModal = ()=>{ document.querySelector("#xModal").innerHTML=`<div class="modal"><div class="sheet"><h3>${esc(T("sched"))}</h3><div class="fld"><label>${esc(T("title"))}</label><input id="s_t"></div><div class="grid g2"><div class="fld"><label>${esc(T("target"))}</label><select id="s_c"><option>Toute l'école</option><option>Campus Delmas</option><option>Campus Pétion-Ville</option><option>7e A</option><option>8e A</option></select></div><div class="fld"><label>${esc(T("channel"))}</label><select id="s_ch">${X.channels.map(c=>`<option>${esc(c.label)}</option>`).join("")}</select></div></div><div class="fld"><label>Message</label><textarea id="s_x" rows="3"></textarea></div><div class="fld"><label>${esc(T("sendAt"))}</label><input id="s_d" type="date" value="${today()}"></div><div class="row"><button data-action="KLX.schSave">${esc(T("sched"))}</button><button class="ghost" data-action="vider" data-a0="s:#xModal">${esc(T("cancel"))}</button></div></div></div>`; };
KLX.schSave = ()=>{ const g=id=>document.querySelector(id).value; if(!g("#s_t").trim()) return; X.sched.unshift({id:XD.uid("s"),title:g("#s_t").trim(),target:g("#s_c"),channel:g("#s_ch"),text:g("#s_x")||"—",sendAt:g("#s_d")||today(),status:"scheduled",by:role()}); queuePush("annonce",g("#s_t")); save(); audit("annonce.schedule",g("#s_t")); XGO("ext-comms"); toast(T("saveOk")); };
KLX.chCost = id=>{ const c=X.channels.find(x=>x.id===id); const v=prompt(T("cost"),c.cost); if(v===null) return; c.cost=v; save(); audit("canal.cout",id); XGO("ext-comms"); };
KLX.rsvp = (mid,oui)=>{ let r=X.rsvp[mid]; if(!r){ const o=O(); const m=o?o.meetings.find(x=>x.id===mid):null; r=X.rsvp[mid]={oui:(m&&m.confirmed)||0,non:0}; } oui?r.oui++:r.non++; save(); audit("rsvp",mid+" "+(oui?"oui":"non")); XGO("ext-comms"); };
KLX.trDue = (lv,i)=>{ const v=prompt("Échéance (AAAA-MM-JJ)",X.schedules[lv][i].due); if(!v) return; X.schedules[lv][i].due=v; save(); audit("echeance",lv+" #"+i+" "+v); XGO("ext-finances"); };
KLX.addBourse = ()=>{ const sid=document.querySelector("#x_bs").value,l=document.querySelector("#x_bl").value.trim()||"Bourse",a=+document.querySelector("#x_ba").value||0; X.bourses.push({id:XD.uid("b"),studentId:sid,label:l,amount:a,by:role(),at:today()}); queuePush("bourse",sid); save(); audit("bourse",sid+" "+a); XGO("ext-finances"); };
KLX.addRefund = ()=>{ const ref=document.querySelector("#x_rs").value,a=+document.querySelector("#x_ra").value||0,m=document.querySelector("#x_rm").value.trim()||"—"; X.refunds.push({id:XD.uid("r"),ref,amount:a,motif:m,by:role(),at:today()}); queuePush("remboursement",ref); save(); audit("remboursement",ref+" "+a); XGO("ext-finances"); toast(T("saveOk")); };
KLX.finCSV = ()=>{ const o=O(); dl("compta.csv",csv([["type","ref","eleve","montant","motif","date"],...o.payments.map(p=>{const s=stu(p.studentId);return ["paiement",p.ref,(s?s.firstName+" "+s.lastName:""),p.amount,p.method,p.date];}),...X.refunds.map(r=>["remboursement",r.ref,"",-r.amount,r.motif,r.at]),...X.bourses.map(b=>{const s=stu(b.studentId);return ["bourse",b.id,(s?s.firstName+" "+s.lastName:""),-b.amount,b.label,b.at];})]),"text/csv"); audit("export","compta.csv"); };
KLX.bq = (k,v)=>{ bq[k]=v; if(k==="q"){ const cur=v; XGO("ext-biblio"); const inputs=document.querySelectorAll("#view input"); const n=inputs[0]; if(n){ n.focus(); try{ n.setSelectionRange(cur.length,cur.length); }catch(e){} } } else XGO("ext-biblio"); };
KLX.resModal = ()=>{ document.querySelector("#xModal").innerHTML=`<div class="modal"><div class="sheet"><h3>${esc(T("newRes"))}</h3><div class="fld"><label>${esc(T("resTitle"))}</label><input id="r_t"></div><div class="grid g2"><div class="fld"><label>Auteur / Organisme</label><input id="r_o"></div><div class="fld"><label>${esc(T("origin"))}</label><input id="r_u" placeholder="https://…"></div></div><div class="grid g2"><div class="fld"><label>${esc(T("lang"))}</label><select id="r_l"><option value="ht">Kreyòl</option><option value="fr">Français</option></select></div><div class="fld"><label>${esc(T("accessMode"))}</label><select id="r_a"><option value="ext_link">${esc(T("ext_link"))}</option><option value="ext_dl">${esc(T("ext_dl"))}</option><option value="ext_adapt">${esc(T("ext_adapt"))}</option><option value="ext_auth">${esc(T("ext_auth"))}</option></select></div></div><div class="fld"><label>${esc(T("licence"))}</label><input id="r_li" placeholder="Ex : lien externe, vérifier avant copie"></div><div class="row"><button data-action="KLX.resSave">${esc(T("save"))}</button><button class="ghost" data-action="vider" data-a0="s:#xModal">${esc(T("cancel"))}</button></div></div></div>`; };
KLX.resSave = ()=>{ const g=id=>document.querySelector(id).value.trim(); if(!g("#r_t")||!g("#r_u")) return; if(!safeUrl(g("#r_u"))){ toast(lang()==="ht"?"Lyen an dwe yon URL HTTPS valab.":"Le lien doit être une adresse HTTPS valide."); return; } X.resources.unshift({id:XD.uid("r"),title:g("#r_t"),org:g("#r_o")||"—",url:safeUrl(g("#r_u")),verified:"",addedAt:today(),lang:g("#r_l"),levels:[],subjects:[],licence:g("#r_li")||"À vérifier",attrib:g("#r_o")||"—",access:g("#r_a"),type:"ressource",fmt:"web",offline:false,size:"—",version:"web",status:"toCheck",note:"",hist:[{at:today(),by:role(),info:"fiche créée"}]}); queuePush("ressource",g("#r_t")); save(); audit("ressource.create",g("#r_t")); XGO("ext-biblio"); };
KLX.resVerify = id=>{ const r=X.resources.find(x=>x.id===id); r.status="verified"; r.hist.push({at:today(),by:role(),info:"marque démo : licence confirmée"}); save(); audit("ressource.verify",r.title); XGO("ext-biblio"); };
KLX.resReport = id=>{ const r=X.resources.find(x=>x.id===id); const m=prompt("Signalement ?", "lien mort"); if(m===null) return; r.status="toCheck"; r.hist.push({at:today(),by:role(),info:"signalement : "+m}); save(); audit("ressource.report",r.title); XGO("ext-biblio"); };
KLX.resRetire = id=>{ const r=X.resources.find(x=>x.id===id); if(!confirm("Retirer ?")) return; r.status="retired"; r.hist.push({at:today(),by:role(),info:"retirée"}); save(); audit("ressource.retire",r.title); XGO("ext-biblio"); };
KLX.addList = ()=>{ const t=document.querySelector("#x_lt").value.trim(); if(!t) return; X.lists.push({id:XD.uid("l"),title:t,level:"",items:[],by:role()}); save(); audit("liste.create",t); XGO("ext-biblio"); };
KLX.pushList = ()=>{ const rid=document.querySelector("#x_lr").value, lid=document.querySelector("#x_ll").value; const l=X.lists.find(x=>x.id===lid); if(l&&!l.items.includes(rid)) l.items.push(rid); save(); XGO("ext-biblio"); };
KLX.shareList = lid=>{ const i=document.querySelector("#sh_"+lid); if(!i) return; i.select(); try{navigator.clipboard.writeText(i.value);}catch(e){} toast(T("linkCopied")); audit("liste.share",lid); };
KLX.addPack = ()=>{ const t=document.querySelector("#x_pt").value.trim(); if(!t) return; const items=X.resources.filter(r=>r.offline&&(r.access==="ext_dl"||r.access==="ext_adapt")&&r.status!=="retired").map(r=>r.id); X.packs.push({id:XD.uid("p"),title:t,items,note:items.length+" ressources (accès autorisé + hors-ligne)",by:role()}); save(); audit("pack.create",t); XGO("ext-biblio"); };
KLX.fq = (k,v)=>{ fq[k]=v; XGO("ext-rapports"); };
KLX.repCSV = ()=>{ if(!["direction","secretariat","comptable"].includes(role())){ toast(T("noAccess")); return; } const o=O(); const studs=o.students.filter(s=>(!fq.level||s.level===fq.level)&&(!fq.classId||s.classId===fq.classId)&&(!fq.campus||s.campus===fq.campus)); dl("rapport-filtre.csv",csv([["code","prenom","nom","sexe","niveau","classe","campus","paye","reste"],...studs.map(s=>[s.code,s.firstName,s.lastName,s.sex,s.level,(cls(s.classId)||{}).name||"",s.campus,paidOf(s.id),((o.fees[s.level]||{tuition:0}).tuition)-paidOf(s.id)])]),"text/csv"); audit("export","rapport-filtre.csv"); };
KLX.menfpCSV = ()=>{ if(!["direction","secretariat"].includes(role())){ toast(T("noAccess")); return; } const o=O(); dl("menfp-recensement.csv",csv([["code_interne","nom","prenom","sexe","naissance","niveau","classe","campus","annee"],...o.students.map(s=>[s.code,s.lastName,s.firstName,s.sex,s.birth,s.level,(cls(s.classId)||{}).name||"",s.campus,o.year||""])]),"text/csv"); audit("export","menfp-recensement.csv (preset, à valider MENFP)"); toast(T("saveOk")); };
KLX.auditCSV = ()=>{ dl("audit.csv",csv([["date","acteur","action","detail"],...X.audit.map(a=>[a.at,a.by,a.action,a.detail])]),"text/csv"); };
KLX.extJSON = ()=>{ dl("klirline-ext.json",JSON.stringify(X,null,2),"application/json"); };

/* ----- comptes ----- */
function rndCode(p,n){ const c="ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let s=""; for(let i=0;i<(n||6);i++) s+=c[Math.floor(Math.random()*c.length)]; return p+"-"+s; }
KLX.uAdd = ()=>{ if(role()!=="direction"){ toast(T("noAccess")); return; } const n=(document.querySelector("#x_un2").value||"").trim(); if(!n) return; const r=document.querySelector("#x_ur").value;
  let uc=""; do{ uc=rndCode("KL",4); }while(X.users.some(u=>u.code===uc));
  let cc=""; do{ cc=rndCode("ACT",6); }while(X.actCodes.some(c=>c.code===cc));
  const u={id:XD.uid("u"),code:uc,name:n,role:r,active:false,by:role(),at:today()};
  const c={id:XD.uid("c"),code:cc,uid:u.id,used:false,given:false,expires:new Date(Date.now()+48*3600*1000).toISOString(),by:role()};
  X.users.push(u); X.actCodes.push(c); save(); audit("compte.create",u.code+" "+r); XGO("ext-comptes"); toast(T("saveOk")); };
KLX.uDel = id=>{ if(role()!=="direction"){ toast(T("noAccess")); return; } if(!confirm("Supprimer ce compte et ses codes ?")) return; X.users=X.users.filter(u=>u.id!==id); X.actCodes=X.actCodes.filter(c=>c.uid!==id); save(); audit("compte.del",id); XGO("ext-comptes"); };
KLX.uTog = id=>{ if(role()!=="direction"){ toast(T("noAccess")); return; } const u=X.users.find(x=>x.id===id); if(!u) return; u.active=!u.active; save(); audit(u.active?"compte.active":"compte.desactive",u.code); XGO("ext-comptes"); toast(T("saveOk")); };
KLX.uReset = id=>{ if(role()!=="direction"){ toast(T("noAccess")); return; } const u=X.users.find(x=>x.id===id); if(!u) return; let cc=""; do{ cc=rndCode("ACT",6); }while(X.actCodes.some(c=>c.code===cc));
  X.actCodes.push({id:XD.uid("c"),code:cc,uid:u.id,used:false,given:false,expires:new Date(Date.now()+48*3600*1000).toISOString(),by:role(),reset:true}); u.active=false;
  save(); audit("compte.reset",u.code+" nouveau code"); XGO("ext-comptes"); toast(T("saveOk")); };
KLX.uGive = id=>{ if(role()!=="direction"){ toast(T("noAccess")); return; } const c=X.actCodes.find(x=>x.id===id); if(!c||c.used||c.given) return;
  if(new Date(c.expires).getTime()<Date.now()){ toast("expiré"); return; }
  c.given=true; c.givenAt=new Date().toISOString(); c.givenBy=role();
  save(); audit("compte.remise",c.code+" par "+role()); XGO("ext-comptes"); toast(T("saveOk")); };
KLX.uUse = id=>{ if(role()!=="direction"){ toast(T("noAccess")); return; } const c=X.actCodes.find(x=>x.id===id); if(!c||c.used) return;
  if(!c.given){ toast(lang()==="ht"?"Remèt kòd la anvan (etap 2/3)":"Remettre le code d'abord (étape 2/3)"); return; }
  if(new Date(c.expires).getTime()<Date.now()){ toast("expiré"); return; }
  const u=X.users.find(x=>x.id===c.uid);
  let pw=""; if(u&&u.role==="eleve"){ pw=prompt("L'élève crée son mot de passe (démo — jamais stocké en clair sur un vrai serveur) :")||""; if(!pw) return; }
  c.used=true; c.usedAt=new Date().toISOString(); if(u) u.active=true;
  save(); audit("compte.activate",c.code+" "+(u?u.role:"")); XGO("ext-comptes"); toast(T("saveOk")); };

/* ----- impressions ----- */
KLX.prMod = v=>{ prMod=v; XGO("ext-impressions"); };
KLX.prCls = v=>{ if(role()==="enseignant"&&!classScope().find(c=>c.id===v)){ toast(T("noAccess")); return; } prCls=v; XGO("ext-impressions"); };
function prData(){ const o=O(); if(role()==="enseignant"&&!classScope().find(c=>c.id===prCls)) return {cols:["—"],rows:[],title:"—"}; const c=cls(prCls);
  if(prMod==="presences"){ const keys=Object.entries(o.attendance||{}).filter(([k,a])=>a.classId===prCls); const rows=o.students.filter(s=>s.classId===prCls).map(s=>[s.code,s.firstName+" "+s.lastName,...keys.map(([k,a])=>a.records[s.id]||"—")]); return {cols:["Code","Élève",...keys.map(([k,a])=>a.day)],rows,title:"Présences — "+(c?c.name:"")}; }
  if(prMod==="notes"){ const evs=o.evals.filter(e=>e.classId===prCls&&e.status==="published"); const rows=o.students.filter(s=>s.classId===prCls).map(s=>[s.code,s.firstName+" "+s.lastName,...evs.map(e=>(o.grades[e.id]||{})[s.id]??"—")]); return {cols:["Code","Élève",...evs.map(e=>e.title)],rows,title:"Notes publiées — "+(c?c.name:"")}; }
  if(prMod==="calendrier"){ return {cols:["Événement","Début","Fin"],rows:visibleCalendarEvents().map(k=>[k.name,k.start,k.end]),title:"Calendrier scolaire"}; }
  if(prMod==="finances"){ return {cols:["Reçu","Élève","Montant","Mode","Date"],rows:o.payments.map(p=>{const s=stu(p.studentId);return [p.ref,s?s.firstName+" "+s.lastName:"",p.amount,p.method,p.date];}),title:"Journal des encaissements"}; }
  const rows=o.loans.map(l=>{const b=o.books.find(x=>x.id===l.bookId);const s=stu(l.studentId);return [b?b.title:"?",s?s.firstName+" "+s.lastName:"?",l.out,l.due,l.back||"—"];});
  return {cols:["Livre","Emprunteur","Sortie","Échéance","Retour"],rows,title:"Prêts de bibliothèque"};
}
function prAllowed(){ const allowed={presences:["direction","secretariat","enseignant"],notes:["direction","secretariat","enseignant"],calendrier:["direction","secretariat","enseignant","parent","eleve"],finances:["direction","comptable"],prets:["direction","bibliothecaire","secretariat"]}; return (allowed[prMod]||[]).includes(role()); }
function prMeta(title){ const o=O(); const c=cls(prCls); return {ecole:o&&o.school?o.school.name:"",annee:o?o.year:"",module:title,classe:c?c.name:"—",date:new Date().toLocaleString(),auteur:role()}; }
function xPrint(title,cols,rows,meta){ const m=meta||{}; const w=document.createElement("div"); w.innerHTML=`<div class="modal"><div class="sheet"><div class="noprint row sp"><b>${esc(title)}</b><span class="row"><button data-action="print">${esc(T("print"))}</button><button class="ghost" data-action="retirer" data-a0="s:.modal">${esc(T("close"))}</button></span></div><div class="u39 small"><b>${esc(m.ecole||"")}</b> • Année ${esc(m.annee||"")} • ${esc(m.module||"")} • Classe : ${esc(m.classe||"—")}<br>Généré le ${esc(m.date||"")} • par ${esc(m.auteur||"")} • <span class="mut">document de maquette, sans valeur officielle</span></div><div class="u7"><table><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${cols.length}">—</td></tr>`}</table></div><p class="small mut">Document filtré selon le rôle — page imprimée le ${esc(m.date||"")} par ${esc(m.auteur||"")}.</p></div></div>`; document.body.appendChild(w); }
KLX.prGo = ()=>{ if(!prAllowed()){ toast(T("noAccess")); return; } const d=prData(); audit("print",d.title); xPrint(d.title,d.cols,d.rows,prMeta(d.title)); };
KLX.prCSV = ()=>{ if(!prAllowed()){ toast(T("noAccess")); return; } const d=prData(); const m=prMeta(d.title); dl("rapport-"+prMod+".csv",csv([["# "+m.ecole+" — "+m.annee+" — "+m.module+" — classe "+m.classe+" — "+m.date+" — par "+m.auteur+" (sans valeur officielle)"],d.cols,...d.rows]),"text/csv"); audit("export","rapport-"+prMod+".csv"); };

/* ----- guichet prêts ----- */
function coreWrite(fn){ try{ const raw=localStorage.getItem(XD.LSO); const o=JSON.parse(raw); const r=fn(o); if(r===false) return false; localStorage.setItem(XD.LSO,JSON.stringify(o)); return true; }catch(e){ toast("Erreur: "+e.message); return false; } }
let rmLid = null;
KLX.loanRemind = lid=>{ if(!["direction","bibliothecaire"].includes(role())){ toast(T("noAccess")); return; } const o=O(), loan=o&&o.loans.find(x=>x.id===lid); if(!loan||loan.back||loan.lost){ toast(T("noAccess")); return; } const pref=X.prefs[loan.studentId]; if(!pref||!pref.ok){ toast("Consentement requis : aucun rappel préparé."); return; } const ht=lang()==="ht"; rmLid=lid;
  const channels=X.channels.filter(c=>c.label===pref.canal); if(!channels.length){ toast("Canal de consentement introuvable."); return; }
  const m=document.querySelector("#bkModal"); if(!m){ toast("—"); return; }
  m.innerHTML=`<div class="modal"><div class="sheet"><h3>${ht?"Rapèl pre":"Rappel de prêt"}</h3><div class="grid g2"><div class="fld"><label>Canal consenti</label><select id="rm_c">${channels.map(c=>`<option>${esc(c.label)}</option>`).join("")}</select></div><div class="fld"><label>Statut</label><select id="rm_s"><option value="prepare">préparé</option><option value="remis">remis</option><option value="echec">échec</option></select></div></div><div class="row"><button data-action="KLX.loanRemindS">${esc(T("save"))}</button><button class="ghost" data-action="vider" data-a0="s:#bkModal">${esc(T("close"))}</button></div><p class="small mut">${ht?"Okenn detay sansib sou ekran ki bloke.":"Aucun détail sensible sur écran verrouillé — titre du livre uniquement, jamais de notes ni de dossier."}</p></div></div>`; };
KLX.loanRemindS = ()=>{ if(!["direction","bibliothecaire"].includes(role())){ toast(T("noAccess")); return; } const lid=rmLid; const c=document.querySelector("#rm_c"),s=document.querySelector("#rm_s"); if(!lid||!c||!s) return;
  const o=O(), l0=o&&o.loans.find(x=>x.id===lid), pref=l0&&X.prefs[l0.studentId]; if(!l0||l0.back||l0.lost||!pref||!pref.ok||pref.canal!==c.value){ toast("Consentement requis pour ce canal."); return; }
  const ok=coreWrite(o=>{ const l=o.loans.find(x=>x.id===lid); if(!l||l.back||l.lost) return false; l.reminded={date:today(),canal:c.value,st:s.value}; });
  if(ok===false) return; audit("pret.rappel",lid+" "+c.value+" "+s.value); toast(T("saveOk")); setTimeout(()=>location.reload(),900); };
KLX.loanExt = lid=>{ if(!["direction","bibliothecaire"].includes(role())){ toast(T("noAccess")); return; } const ok=coreWrite(o=>{ const l=o.loans.find(x=>x.id===lid); if(!l||l.back||l.lost) return false;
    const d=new Date(l.due||today()); d.setDate(d.getDate()+7); l.due=d.toISOString().slice(0,10); });
  if(ok===false) return; audit("pret.prolongation",lid+" +7j"); toast(T("saveOk")); setTimeout(()=>location.reload(),900); };
KLX.loanLost = lid=>{ if(!["direction","bibliothecaire"].includes(role())){ toast(T("noAccess")); return; } if(!confirm("Déclarer perdu ? (le livre ne revient pas au stock)")) return;
  const ok=coreWrite(o=>{ const l=o.loans.find(x=>x.id===lid); if(!l||l.back) return false; l.lost=true; });
  if(ok===false) return; audit("pret.perdu",lid); toast(T("saveOk")); setTimeout(()=>location.reload(),900); };
KLX.pq = v=>{ pq=v.trim(); XGO("ext-pret"); const n=document.querySelector("#view input"); if(n){ n.focus(); try{n.setSelectionRange(n.value.length,n.value.length);}catch(e){} } };
KLX.pretGo = sid=>{ const bid=document.querySelector("#x_pb").value; if(window.KL.loanFor(bid,sid)){ audit("pret",bid+" → "+sid); pq=""; XGO("ext-pret"); } else { XGO("ext-pret"); } };

/* ----- calendrier+ ----- */
KLX.calTg = (id,v)=>{ if(role()!=="direction"){ toast(T("noAccess")); return; } const allowed=["Toute l'école",...userCampuses().map(c=>"Campus "+c),...userClassNames()]; if(!allowed.includes(v)){ toast(T("noAccess")); return; } X.calPub[id]=X.calPub[id]||{status:"draft",target:"Toute l'école"}; X.calPub[id].target=v; save(); };
KLX.calPub = id=>{ if(role()!=="direction"){ toast(T("noAccess")); return; } const o=O(); if(!o||!o.calendar.some(k=>k.id===id)){ toast(T("noAccess")); return; } X.calPub[id]=X.calPub[id]||{status:"draft",target:"Toute l'école"}; const p=X.calPub[id]; p.status=p.status==="published"?"draft":"published"; X.calHist.push({at:new Date().toLocaleString(),by:role(),info:(p.status==="published"?"publié":"dépublié")+" : "+id+" → "+p.target}); save(); audit("calendrier."+p.status,id); XGO("ext-cal"); };
KLX.calCSV = ()=>{ if(!["direction","secretariat","enseignant","parent","eleve"].includes(role())){ toast(T("noAccess")); return; } const evts=visibleCalendarEvents(); dl("calendrier.csv",csv([["evenement","debut","fin","statut","cible"],...evts.map(k=>[k.name,k.start,k.end,k.pub.status,k.pub.target])]),"text/csv"); audit("export","calendrier.csv ("+evts.length+" visibles)"); };
KLX.calICS = ()=>{ if(!["direction","secretariat","enseignant","parent","eleve"].includes(role())){ toast(T("noAccess")); return; } const evts=visibleCalendarEvents();
  const d2=s=>String(s||"").replace(/-/g,""); const ie=s=>String(s||"").replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
  const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//NORIA//Calendrier//FR",...evts.map(k=>["BEGIN:VEVENT","UID:"+k.id+"@noria","DTSTAMP:"+d2(today())+"T000000","DTSTART:"+d2(k.start),"DTEND:"+d2(k.end||k.start),"SUMMARY:"+ie(k.name),"DESCRIPTION:"+ie((k.pub.status||"")+" "+(k.pub.target||"")),"END:VEVENT"].join("\r\n")),"END:VCALENDAR"].join("\r\n");
  dl("calendrier.ics",ics,"text/calendar"); audit("export","calendrier.ics ("+evts.length+" visibles)"); toast(T("saveOk")); };
KLX.calProp = ()=>{ if(role()!=="enseignant"){ toast(T("noAccess")); return; } const n=(document.querySelector("#cp_n").value||"").trim(); if(!n) return;
  const s=document.querySelector("#cp_s").value||today(), t=document.querySelector("#cp_t").value||"Toute l'école";
  X.calProp=X.calProp||[]; X.calProp.push({id:XD.uid("cp"),name:n,start:s,end:s,target:t,st:"propose",by:role(),at:new Date().toLocaleString()});
  save(); audit("calendrier.proposition",n+" → "+t); XGO("ext-cal"); toast(T("saveOk")); };
KLX.calPropOk = id=>{ if(role()!=="direction"){ toast(T("noAccess")); return; } const p=(X.calProp||[]).find(x=>x.id===id); if(!p||p.st!=="propose") return;
  try{ const raw=localStorage.getItem(XD.LSO); const o=JSON.parse(raw); const nid="k"+Date.now(); o.calendar.push({id:nid,name:p.name,start:p.start,end:p.end||p.start,type:"meeting"});
    localStorage.setItem(XD.LSO,JSON.stringify(o)); X.calPub[nid]={status:"draft",target:p.target}; }catch(e){ toast("Erreur: "+e.message); return; }
  p.st="retenue"; X.calHist.push({at:new Date().toLocaleString(),by:role(),info:"proposition retenue (brouillon) : "+p.name+" → "+p.target});
  save(); audit("calendrier.proposition.retenue",p.name); toast(T("saveOk")); setTimeout(()=>location.reload(),900); };
KLX.calPropNo = id=>{ if(role()!=="direction"){ toast(T("noAccess")); return; } const p=(X.calProp||[]).find(x=>x.id===id); if(!p) return;
  p.st="refusee"; save(); audit("calendrier.proposition.refusee",p.name); XGO("ext-cal"); };
KLX.rmOpen = hid=>{ const h=X.homework.find(x=>x.id===hid); if(!h) return; const me=kidsOf()[0]; if(!me) return; const ht=lang()==="ht";
  const key=hid+"|"+me.id; const d=(X.drafts&&X.drafts[key])||{title:"",text:""};
  document.querySelector("#xModal").innerHTML=`<div class="modal"><div class="sheet"><h3>${esc(h.title)} <span class="mut small">— ${esc(ht?"kopi mwen":"ma copie")}</span></h3>
  <div class="fld"><label>${ht?"Tit":"Titre"}</label><input id="rm_t" value="${esc(d.title)}" data-action-input="KLX.rmAuto" data-a0="s:${esc(hid)}"></div>
  <div class="toolbar"><button class="ghost" data-action="KLX.rmFmt" data-a0="s:${esc(hid)}" data-a1="s:b"><b>G</b></button><button class="ghost" data-action="KLX.rmFmt" data-a0="s:${esc(hid)}" data-a1="s:i"><i>I</i></button><button class="ghost" data-action="KLX.rmFmt" data-a0="s:${esc(hid)}" data-a1="s:li">• Liste</button><button class="ghost" data-action="KLX.rmFmt" data-a0="s:${esc(hid)}" data-a1="s:a">Lien</button><span class="small mut" id="rm_state">${d.text?(ht?"Bouyon restore":"Brouillon repris"):(ht?"Pa gen bouyon":"Aucun brouillon")}</span></div>
  <div class="fld"><label>${ht?"Tèks (tou senp)":"Texte (simple, sans suite bureautique)"}</label><textarea id="rm_x" rows="6" data-action-input="KLX.rmAuto" data-a0="s:${esc(hid)}">${esc(d.text)}</textarea></div>
  <div id="rm_prev"></div>
  <div class="row"><button data-action="KLX.rmSend" data-a0="s:${esc(hid)}">${ht?"Remèt":"Remettre"}</button><button class="ghost" data-action="KLX.rmPrev" data-a0="s:${esc(hid)}">${ht?"Apèsi":"Aperçu"}</button><button class="ghost" data-action="KLX.rmTxt" data-a0="s:${esc(hid)}">.txt</button><button class="ghost" data-action="print">${esc(T("print"))}</button><button class="ghost" data-action="vider" data-a0="s:#xModal">${esc(T("close"))}</button></div>
  <p class="small mut">${ht?"Bouyon an rete sou aparèy sa a. Chak fwa ou remèt, sa kreye yon NOUVO vèsyon — nou kenbe ansyen yo.":"Le brouillon reste sur cet appareil. La remise crée une NOUVELLE version — les précédentes sont conservées."}</p></div></div>`; };
KLX.rmFmt = (hid,k)=>{ const t=document.querySelector("#rm_x"); if(!t) return; const s=t.selectionStart||0,e=t.selectionEnd||0,v=t.value,sel=v.slice(s,e)||"texte";
  let ins=sel; if(k==="b") ins="**"+sel+"**"; else if(k==="i") ins="*"+sel+"*"; else if(k==="li") ins="\n- "+sel; else if(k==="a") ins="["+sel+"](https://)";
  t.value=v.slice(0,s)+ins+v.slice(e); t.focus(); KLX.rmAuto(hid); };
KLX.rmAuto = hid=>{ const me=kidsOf()[0]; if(!me) return; const t=document.querySelector("#rm_x"),ti=document.querySelector("#rm_t"); if(!t) return;
  X.drafts=X.drafts||{}; X.drafts[hid+"|"+me.id]={title:ti?ti.value:"",text:t.value,at:new Date().toLocaleString()}; save();
  const st=document.querySelector("#rm_state"); if(st) st.textContent=(lang()==="ht"?"Bouyon anrejistre : ":"Brouillon enregistré : ")+new Date().toLocaleTimeString(); };
KLX.rmPrev = hid=>{ const t=document.querySelector("#rm_x"),ti=document.querySelector("#rm_t"); const p=document.querySelector("#rm_prev"); if(!p) return;
  p.innerHTML=`<div class="card"><h3>${esc(ti&&ti.value?ti.value:"(sans titre)")}</h3><div class="small">${esc((t&&t.value)||"").replace(/\n/g,"<br>")||"<span class='mut'>—</span>"}</div></div>`; };
KLX.rmSend = hid=>{ const me=kidsOf()[0]; if(!me) return; const t=document.querySelector("#rm_x"),ti=document.querySelector("#rm_t");
  const txt=((t&&t.value)||"").trim(); if(!txt) return; const h=X.homework.find(x=>x.id===hid); if(!h) return;
  subMig(h); h.subs=h.subs||[]; const vers=h.subs.filter(s=>s.sid===me.id).reduce((a,s)=>Math.max(a,s.vers||1),0)+1;
  h.subs.push({id:XD.uid("s"),sid:me.id,title:(ti&&ti.value||"").slice(0,120),text:txt.slice(0,2000),at:today(),hidden:false,vers,st:today()>(h.due||"")?"late":"submitted"});
  if(X.drafts) delete X.drafts[hid+"|"+me.id];
  queuePush("remise",hid); save(); audit("devoir.remise",hid+" "+me.id+" v"+vers); XGO(XROUTE==="ext-visuel"?"ext-visuel":"ext-devoirs"); toast(T("saveOk")); };
KLX.rmTxt = hid=>{ const t=document.querySelector("#rm_x"),ti=document.querySelector("#rm_t"); dl(((ti&&ti.value)||"devoir")+".txt",(ti&&ti.value?ti.value+"\n\n":"")+(t?t.value:""),"text/plain"); };
KLX.remise = hid=>KLX.rmOpen(hid);
KLX.subSt = (hid,sid2,act)=>{ const h=X.homework.find(x=>x.id===hid); if(!h) return; const s=(h.subs||[]).find(x=>x.id===sid2); if(!s) return;
  if(!["direction","secretariat","enseignant"].includes(role())){ toast(T("noAccess")); return; }
  if(act==="back"){ const m=prompt(lang()==="ht"?"Kòmantè koreksyon :":"Commentaire de correction :","À reprendre"); if(m===null) return; s.st="returned"; s.corr=m; }
  else { const g=prompt(lang()==="ht"?"Nòt / apresyasyon :":"Note / appréciation :","Bien"); if(g===null) return; s.st="graded"; s.grade=g; }
  save(); audit("devoir."+(act==="back"?"retour":"note"),hid+" "+s.sid); XGO("ext-devoirs"); toast(T("saveOk")); };
KLX.modSub = (hid,sid2)=>{ const h=X.homework.find(x=>x.id===hid); const s=(h.subs||[]).find(x=>x.id===sid2); if(!s) return;
  if(!confirm("Masquer cette copie (modération) ?")) return; s.hidden=true; save(); audit("devoir.moderation",hid); XGO("ext-devoirs"); };
KLX.grpAdd = ()=>{ const t=(document.querySelector("#x_gt").value||"").trim(); if(!t||!hwCls) return;
  X.groups.push({id:XD.uid("g"),title:t,classId:hwCls,members:[],by:role(),at:today()}); save(); audit("groupe.create",t); XGO("ext-devoirs"); };

/* ---------- wrappers audit sur l'ancien (appellent l'original d'abord) ---------- */
function wrap(name,log){
  if(!window.KL||!window.KL[name]||window.KL[name].__xw) return;
  const orig = window.KL[name];
  const fn = function(...a){ const r = orig.apply(this,a); try{ audit(name, typeof log==="function"?log(a):String(log||a[0]||"")); }catch(e){} return r; };
  fn.__xw = true; window.KL[name] = fn;
}
function installWraps(){
  wrap("stuSave",a=>"élève "+(a[0]||"nouveau"));
  wrap("attSave",()=>"appel enregistré");
  wrap("attResolve",a=>"conflit "+a[0]);
  wrap("evPub",a=>"publié "+a[0]);
  wrap("paySave",()=>"paiement");
  wrap("loan",a=>"prêt "+a[0]);
  wrap("back",a=>"retour "+a[0]);
  wrap("anSave",()=>"annonce");
  wrap("mtAdd",()=>"réunion");
  wrap("bkSave",()=>"livre");
  wrap("evModal",()=>"évaluation");
  wrap("calAdd",()=>"calendrier");
  wrap("calDel",a=>"calendrier del "+a[0]);
  wrap("evSubmit",a=>"soumis "+a[0]);
  wrap("loanFor",a=>"prêt "+a[0]+" → "+a[1]);
  // historique calendrier (chaîne après le wrapper audit)
  if(window.KL.calAdd&&!window.KL.calAdd.__xch){ const o2=window.KL.calAdd; const f2=function(){ const before=(XD.readOld()?XD.readOld().calendar:[]).length; const r=o2.apply(this,arguments); try{ const n=document.querySelector("#calN"); X.calHist.push({at:new Date().toLocaleString(),by:role(),info:"ajout : "+(n?n.value:"?")}); save(); }catch(e){} return r; }; f2.__xch=true; f2.__xw=o2.__xw; window.KL.calAdd=f2; }
  if(window.KL.calDel&&!window.KL.calDel.__xch){ const o3=window.KL.calDel; const f3=function(id){ const o=XD.readOld(); const k=o?o.calendar.find(x=>x.id===id):null; const r=o3.apply(this,arguments); try{ X.calHist.push({at:new Date().toLocaleString(),by:role(),info:"suppression : "+(k?k.name+" ("+k.start+"→"+k.end+")":id)}); save(); }catch(e){} return r; }; f3.__xch=true; f3.__xw=o3.__xw; window.KL.calDel=f3; }
  if(window.KL.sync&&!window.KL.sync.__xw){ const o=window.KL.sync; const f=function(){ const r=o.apply(this,arguments); try{ const n=flushQ(); if(n) audit("sync.ext",n+" items"); injectNav(); }catch(e){} return r; }; f.__xw=true; window.KL.sync=f; }
  if(window.KL.go&&!window.KL.go.__xw){ const o=window.KL.go; const f=function(m){ if(typeof m==="string"&&m.indexOf("ext-")===0){ XGO(m); return; } XROUTE=null; liveWanted=false; syncLive(null); try{window.__klLast=m;}catch(e){} const r=o.apply(this,arguments); try{injectToday();}catch(e){} return r; }; f.__xw=true; window.KL.go=f; }
}

/* ---------- injection nav (après chaque renderShell) ---------- */
function injectNav(){
  const o = O(); const L = (o&&o.lang)||"fr"; const ht=L==="ht";
  const label = ht?"Konpleman":"Compléments";
  const name = ht?" Ekstansyon":" Extensions";
  const items=[["ext-reunion",ht?"Reyinyon":"Réunions"],["ext-visuel",ht?"Klas vizyèl":"Classe visuelle"],["ext-discussion",ht?"Diskisyon":"Discussion"],["ext-portails",ht?"Pòtay":"Portails"]].filter(([r])=>canX(r));
  [["#nav",false],["#mnav",true]].forEach(([sel,mob])=>{
    const el = document.querySelector(sel); if(!el) return;
    el.querySelectorAll("[data-space]").forEach(n=>n.remove());
    const anchor=el.querySelector("[data-xnav]");
    const place=node=>{ if(anchor) el.insertBefore(node, anchor); else el.appendChild(node); };
    if(items.length){
      if(!mob){ const s=document.createElement("small"); s.textContent=ht?"Pòtay":"Portail"; s.setAttribute("data-space","1"); place(s); }
      items.forEach(([r,lab])=>{
        const b=document.createElement("button"); b.textContent=lab; b.setAttribute("data-space","1");
        if(XROUTE===r) b.className="on";
        b.onclick=()=>window.KL.go(r); place(b);
      });
    }
    if(el.querySelector("[data-xnav]")) return;
    if(!mob){ const s=document.createElement("small"); s.textContent=label; s.setAttribute("data-xnav","1"); el.appendChild(s); }
    const b=document.createElement("button"); b.textContent = name+(X.queue.length?` (${X.queue.length})`:""); b.setAttribute("data-xnav","1");
    if(XROUTE==="ext-hub") b.classList.add("on");
    b.onclick=()=>window.KL.go("ext-hub"); el.appendChild(b);
  });
  markNav();
}
function syncBar(){
  const bar=document.querySelector(".topbar");
  if(!bar) return;
  const h=Math.ceil(bar.getBoundingClientRect().height)+"px";
  if(document.documentElement.style.getPropertyValue("--bar-h")!==h) document.documentElement.style.setProperty("--bar-h", h);
}
function boot(){
  try{ ensurePortals(); }catch(e){}
  installWraps();
  if(window.KL.refreshNav) window.KL.refreshNav();
  injectNav();
  try{ syncBar(); }catch(e){}
  let barTimer=0;
  window.addEventListener("resize", ()=>{ clearTimeout(barTimer); barTimer=setTimeout(syncBar, 60); });
  if(window.KL){ window.KL.remind=function(lid){ return KLX.loanRemind(lid); }; window.KL.loanExt=function(lid){ return KLX.loanExt(lid); }; window.KL.loanLost=function(lid){ return KLX.loanLost(lid); }; }
  try{ injectToday(); }catch(e){}
  audit("ext.boot","extensions chargées (ancien intact)");
  // injectNav always rewrites portal buttons. Observing those writes would
  // schedule another callback and freeze the page on the first navigation.
  const obs = new MutationObserver(()=>{
    obs.disconnect();
    try{ injectNav(); }catch(e){}
    try{ injectToday(); }catch(e){}
    try{ syncBar(); }catch(e){}
    const v=document.querySelector("#view");
    if(v && !v.querySelector("[data-xview]")){
      if(XROUTE){ XROUTE=null; try{ markNav(); }catch(e){} }
      if(liveWanted||document.querySelector("#liveDock")){ liveWanted=false; try{ syncLive(null); }catch(e){} }
    }
    const nav=document.querySelector("#nav");
    const view=document.querySelector("#view");
    if(nav) obs.observe(nav,{childList:true});
    if(view) obs.observe(view,{childList:true});
  });
  const nav=document.querySelector("#nav"); if(nav) obs.observe(nav,{childList:true});
  const view=document.querySelector("#view"); if(view) obs.observe(view,{childList:true});
}
if(document.readyState!=="loading") boot(); else document.addEventListener("DOMContentLoaded",boot);
})();

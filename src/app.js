/* Klirline app — prototype local, données synthétiques */
(function(){
const $=s=>document.querySelector(s);
const LS="klirline_school_v1";
let S=null;
// Mode serveur : élèves, classes et rôle viennent de l'API ; rien de ce qui vient du serveur n'est écrit dans localStorage.
let SERVER=null;
function load(){ try{const r=localStorage.getItem(LS); if(r){const o=JSON.parse(r); if(o&&o.v===1&&o.students&&o.school){S=o; ensureCards(); return;}}}catch(e){} S=window.KL_SEED(); ensureCards(); save(); }
function ensureCards(){ const seen=new Set(S.students.map(s=>s.cardRef).filter(Boolean)); let mk=false; S.students.forEach(s=>{ if(!s.cardRef){ let c; do{ c="KLC-"+Math.random().toString(36).slice(2,8).toUpperCase(); }while(seen.has(c)); seen.add(c); s.cardRef=c; mk=true; } }); if(mk) save(); }
function save(){ if(SERVER) return; try{localStorage.setItem(LS,JSON.stringify(S));}catch(e){} }
function t(k){ const d=window.KL_I18N[S.lang]||window.KL_I18N.fr; return d[k]||window.KL_I18N.fr[k]||k; }
function syncWord(s){ if(s==="synced") return t("synced"); if(s==="pending") return t("pending"); if(s==="conflict") return t("conflict"); return t("local"); }
const {esc,safeUrl}=window.NORIA_U;
function money(n){ return Number(n||0).toLocaleString("fr-FR").replace(/,/g," ")+" G"; }
function today(){ return new Date().toLocaleDateString("en-CA"); } // jour civil de l'appareil (et non UTC)
let ROUTE="dashboard";
function toast(m){ const c=$("#toasts"); const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),3200); }
function logExport(kind,detail){ S.exportLog.unshift({date:new Date().toLocaleString(),by:S.role,kind,detail}); S.exportLog=S.exportLog.slice(0,50); save(); }
function dl(name,content,type){ const b=new Blob([content],{type:type||"text/plain"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); }
const toCSV=window.NORIA_U.toCSV;
window.KL={};
KL.t=t;

// Ordre du menu (ordinateur, tiroir mobile ; les 5 premières entrées autorisées forment la barre du bas du téléphone).
// « Échanges » (transferts, portail, ministère) juste après le quotidien pour rester visible sans défiler.
const MODULES=[["dashboard",""],["students",""],["classes",""],["attendance",""],["academic",""],["transferts",""],["portail",""],["declaration",""],["comms",""],["finance",""],["reports",""],["monemail",""],["badges",""],["releves",""],["scan",""],["library",""],["ecole",""],["importEleves",""],["accounts",""],["emails",""],["codesActivation",""],["settings",""],["abonnement",""],["connexion",""]];
const SPACE={dashboard:"École",students:"École",classes:"École",attendance:"École",academic:"Classe",transferts:"Échanges",portail:"Échanges",declaration:"Échanges",comms:"Vie scolaire",finance:"Vie scolaire",reports:"Vie scolaire",monemail:"Vie scolaire",badges:"Documents",releves:"Documents",scan:"Documents",library:"Bibliothèque",ecole:"Administration",importEleves:"Administration",accounts:"Administration",emails:"Administration",codesActivation:"Administration",settings:"Administration",abonnement:"Administration",connexion:"Administration"};
const SPACE_HT={"École":"Lekòl","Classe":"Klas","Bibliothèque":"Bibliyotèk","Académie":"Akademi","Échanges":"Echanj","Vie scolaire":"Lavi lekòl","Documents":"Dokiman","Administration":"Administrasyon"};
// Libellés propres au menu : ce que fait l'entrée, et « lecture seule » quand le rôle ne peut que consulter.
const NAV_LBL={fr:{abonnement:"Abonnement",portail:"Portail : propositions",ro:"lecture seule"},ht:{abonnement:"Abònman",portail:"Pòtay : pwopozisyon",ro:"lekti sèlman"}};
const READ_ONLY={secretariat:["declaration","emails"]};
function navLabel(m){ const N=NAV_LBL[S.lang==="ht"?"ht":"fr"]; const base=N[m]||t(m==="comms"?"comms":m); return (READ_ONLY[S.role]||[]).includes(m)?`${base} · ${N.ro}`:base; }
function spaceLbl(s){ return S.lang==="ht"?(SPACE_HT[s]||s):s; }
const ROLE_MODULES={
  direction:["dashboard","students","classes","attendance","academic","comms","finance","library","reports","accounts","ecole","importEleves","scan","badges","releves","transferts","portail","declaration","emails","codesActivation","settings","abonnement","connexion"],
  secretariat:["dashboard","students","classes","attendance","academic","comms","library","reports","accounts","importEleves","scan","badges","releves","transferts","declaration","emails","codesActivation","abonnement","connexion"],
  enseignant:["dashboard","classes","attendance","academic","comms","connexion"],
  comptable:["dashboard","students","finance","reports","abonnement","connexion"],
  bibliothecaire:["dashboard","students","library","reports","scan","connexion"],
  parent:["dashboard","attendance","academic","comms","finance","library","releves","monemail","connexion"],
  eleve:["dashboard","academic","library","comms","releves","monemail","connexion"],
};
function can(m){
  if(m==="accounts"&&!SERVER) return false; // invitations : seulement avec le serveur
  if(m==="ecole"||m==="importEleves"||m==="scan"||m==="badges"||m==="releves"||m==="transferts"||m==="portail") return !!SERVER&&!!window.NORIA_ECO&&(ROLE_MODULES[S.role]||[]).includes(m); // profil d'école, import : serveur seulement
  if(m==="declaration") return !!SERVER&&!!window.NORIA_ECO&&document.documentElement.dataset.ministere==="1"&&(ROLE_MODULES[S.role]||[]).includes(m); // bloc 6 : portail du ministère activé seulement
  if(m==="abonnement") return !!SERVER&&!!window.NORIA_ECO&&(ROLE_MODULES[S.role]||[]).includes(m); // facturation : serveur seulement
  if(m==="connexion"||m==="codesActivation") return !!SERVER&&!!window.NORIA_ECO&&(ROLE_MODULES[S.role]||[]).includes(m); // bloc 9 : serveur seulement
  if(m==="emails"||m==="monemail") return !!SERVER&&!!window.NORIA_ECO&&document.documentElement.dataset.emailsEleves==="1"&&(ROLE_MODULES[S.role]||[]).includes(m); // bloc 7 : NORIA_EMAIL_ELEVES=1 seulement
  if(m==="academic"&&S.role==="secretariat"&&!SERVER) return false;
  const base=(ROLE_MODULES[S.role]||[]).includes(m);
  if(SERVER&&(m==="accounts"||m==="academic"||m==="finance"||m==="library")) return base; // modules serveur : droits vérifiés par l'API, pas par la config locale des portails
  if(window.KL_PORTAL&&typeof window.KL_PORTAL.allow==="function") return window.KL_PORTAL.allow(S.role,m,base);
  return base;
}
function teacherClasses(){ if(SERVER) return S.classes.map(c=>c.id); if(S.role==="enseignant"){ return ["c7a","c8a"]; } return S.classes.map(c=>c.id); }
function kidStudents(){ if(S.role==="parent") return S.students.filter(s=>S.currentUser.parentKids.includes(s.id)); if(S.role==="eleve") return S.students.filter(s=>s.id===S.currentUser.studentId); return S.students; }
function classById(id){ return S.classes.find(c=>c.id===id); }
function stuById(id){ return S.students.find(s=>s.id===id); }
function feeDue(s){ const f=S.fees[s.level]; if(!f) return {due:0,paid:0,rest:0}; const paid=S.payments.filter(p=>p.studentId===s.id).reduce((a,p)=>a+ +p.amount,0)+ (S.discounts.filter(d=>d.studentId===s.id).reduce((a,d)=>a+ +d.amount,0)); return {due:f.tuition,paid,rest:f.tuition-paid}; }

/* ---------- shell ---------- */
function renderShell(){
  const L=window.KL_I18N[S.lang];
  $("#roleSel").value=S.role; $("#langSel").value=S.lang;
  $("#connBtn").innerHTML=`<span class="dot ${S.online?"on":"off"}"></span> ${S.online?L.online:L.offline}`;
  const nav=$("#nav"), mn=$("#mnav"); nav.innerHTML=""; mn.innerHTML="";
  let lastSp="";
  MODULES.forEach(([m,ic])=>{ if(!can(m))return;
    const sp=SPACE[m]||"École";
    if(sp!==lastSp){ lastSp=sp; const lb=document.createElement("small"); lb.textContent=spaceLbl(sp); nav.appendChild(lb); }
    const b=document.createElement("button"); b.type="button"; b.textContent=`${ic} ${navLabel(m)}`.trim(); b.dataset.nav=m; b.className=ROUTE===m?"on":""; if(ROUTE===m) b.setAttribute("aria-current","page"); b.onclick=()=>{ROUTE=m; render();};
    nav.appendChild(b);
    const mb=b.cloneNode(true); mb.onclick=b.onclick; mn.appendChild(mb);
  });
  const q=S.queue.length;
  $("#syncBadge").textContent=q?` • ${q} ${t("pending")}`:"";
  $("#syncBtn").hidden=!q;
}
function render(){
  if(!S) load();
  renderShell();
  const v=$("#view");
  if(!can(ROUTE)) ROUTE="dashboard";
  const fn={dashboard:vDash,students:vStudents,classes:vClasses,attendance:vAtt,academic:vAcad,comms:vComms,finance:vFin,library:vLib,reports:vRep,accounts:vAcc,settings:vSet,ecole:()=>NORIA_ECO.view("ecole"),importEleves:()=>NORIA_ECO.view("importEleves"),scan:()=>NORIA_ECO.view("scan"),badges:()=>NORIA_ECO.view("badges"),releves:()=>NORIA_ECO.view("releves"),transferts:()=>NORIA_ECO.view("transferts"),portail:()=>NORIA_ECO.view("portail"),declaration:()=>NORIA_ECO.view("declaration"),emails:()=>NORIA_ECO.view("emails"),monemail:()=>NORIA_ECO.view("monemail"),connexion:()=>NORIA_ECO.view("connexion"),abonnement:()=>NORIA_ECO.view("abonnement"),codesActivation:()=>NORIA_ECO.view("codesActivation")}[ROUTE];
  // Écran d'accueil après connexion : l'école (logo ou initiales, nom, devise, coordonnées) et, pour un parent, ses enfants.
  v.innerHTML=(SERVER&&ROUTE==="dashboard"&&window.NORIA_ECO?NORIA_ECO.banner():"")+fn();
  const fb={students:bStu,attendance:bAtt,academic:bAcad,comms:bComms,finance:bFin,library:bLib,settings:bSet}[ROUTE];
  if(fb) try{fb();}catch(e){console.warn(e);}
  window.scrollTo(0,0);
}

/* ---------- DASHBOARD ---------- */
function vDash(){
  if(SERVER&&window.NORIA_TAB) return NORIA_TAB.dash(S); // lot 1 : chiffres réels du serveur
  const atts=Object.values(S.attendance);
  const rate=atts.length?Math.round(atts.flatMap(a=>Object.values(a.records||{})).filter(x=>x==="P").length/Math.max(1,atts.flatMap(a=>Object.values(a.records||{})).length)*100):87;
  const collected=S.payments.reduce((a,p)=>a+ +p.amount,0);
  const loaned=S.loans.filter(l=>!l.back).length;
  if(S.role==="parent"){ const kids=kidStudents();
    return `<div class="grid g3">${kids.map(k=>{const d=feeDue(k);const c=classById(k.classId);return `<div class="card"><h3>${esc(k.firstName)} ${esc(k.lastName)} <span class="mut small">${esc(k.code)}</span></h3><div class="small mut">${esc(c?.name||"")} • ${esc(k.level)}</div>${SERVER?"":`<div class="u2 row"><span class="badge ${d.rest<=0?"b-paid":"b-unpaid"}">${d.rest<=0?t("paid"):money(d.rest)+" • "+t("remaining")}</span></div>`}<div class="toolbar"><button class="ghost" data-action="KL.go" data-a0="s:attendance">${t("attendance")}</button><button class="ghost" data-action="KL.go" data-a0="s:academic">${t("reportCard")}</button><button class="ghost" data-action="KL.go" data-a0="s:finance">${t("receipts")}</button></div></div>`;}).join("")}</div><p class="mut small">${esc(t("onlyLinked"))}</p>`+commsPreview();
  }
  if(S.role==="eleve"){ const me=kidStudents()[0]; const c=classById(me?.classId);
    return `<div class="card"><h3>${esc(me.firstName)} ${esc(me.lastName)} — ${esc(c?.name)}</h3><p class="mut">${t("mySchedule")} • ${t("homework")} • ${t("reportCard")}</p><div class="toolbar"><button data-action="KL.go" data-a0="s:academic">${t("reportCard")}</button><button class="ghost" data-action="KL.go" data-a0="s:library">${t("catalog")}</button></div></div>`+commsPreview();
  }
  if(S.role==="enseignant") return `<div class="notice">${esc(t("onlyAssigned"))}</div><div class="grid g4">
    ${kpi(S.students.filter(s=>teacherClasses().includes(s.classId)).length,t("totalStudents"))}
    ${kpi(rate+" %",t("attRate"))}${kpi(S.evals.length,t("eval"))}${kpi(S.meetings.length,t("meetings"))}</div>
    <div class="u3 card"><h3>${t("myClasses")}</h3>${teacherClasses().map(id=>{const c=classById(id);return `<div class="u4 row sp"><span><b>${esc(c.name)}</b> <span class="mut small">${esc(c.level)} • ${esc(c.room)}</span></span><span class="row"><button class="soft" data-action="KL.attGo" data-a0="s:${esc(id)}">${t("rollCall")}</button><button class="ghost" data-action="KL.go" data-a0="s:academic">${t("grades")}</button></span></div>`;}).join("")}</div>`+commsPreview();
  return `<p class="mut">${esc(t("welcomeDir"))}</p><div class="warnbox small"> ${esc(t("pilotNote"))} •  ${esc(t("lowConn"))}</div>
  ${S.online?"":`<div class="badbox"> ${esc(t("offlineNote"))}</div>`}
  <div class="grid g4">${kpi(S.students.length,t("totalStudents"))}${kpi(rate+" %",t("attRate"))}${kpi(money(collected),t("feesCollected"))}${kpi(loaned,t("booksLoaned"))}</div>
  <div class="u3 grid g2">
    <div class="card"><h3>${t("todayView")}</h3><div class="small">• ${t("enrol")}: <b>${S.students.length}</b><br>• ${t("attToDo")}: <b>${S.classes.length} classes</b><br>• ${t("dues")}: <b>${S.students.filter(s=>feeDue(s).rest>0).length} ${t("unpaid")}</b><br>• ${t("alerts")}: <b>${S.queue.length} ${t("pending")}, ${S.loans.filter(l=>!l.back&&l.due<today()).length} ${t("delays")}</b></div><div class="toolbar"><button class="soft" data-action="KL.go" data-a0="s:attendance">${t("rollCall")}</button><button class="ghost" data-action="KL.go" data-a0="s:reports">${t("reports")}</button></div></div>
    <div class="card"><h3>${t("announcements")}</h3>${S.announces.slice(0,3).map(a=>`<div class="u4"><b>${esc(a.title)}</b><div class="small mut">${esc(a.target)} • ${esc(a.date)} • <span class="badge b-sent">${a.ok} OK / ${a.fail} ✕</span></div></div>`).join("")}<div class="toolbar"><button class="ghost" data-action="KL.go" data-a0="s:comms">${t("view")}</button></div><p class="small mut">${esc(t("readAck"))}</p></div>
  </div>`;
}
function kpi(n,l){ return `<div class="card"><div class="kpi">${n}</div><div class="kpi-sub">${l}</div></div>`; }
function commsPreview(){ if(SERVER) return ""; return `<div class="u3 card"><h3>${t("announcements")}</h3>${S.announces.slice(0,4).map(a=>`<div class="u4"><b>${esc(a.title)}</b> <span class="mut small">• ${esc(a.date)}</span><div class="small">${esc(a.text)}</div></div>`).join("")}</div>`; }

/* ---------- ELEVES ---------- */
let stuQ="";
function vStudents(){
  // Liste vide : le bouton « Ajouter un élève » reste visible pour la direction et le secrétariat (fiche manuelle, avec photo).
  if(SERVER&&window.NORIA_TAB&&!S.students.length){ const add=["direction","secretariat"].includes(S.role)?`<button id="stuAdd" data-action="KL.stuAdd">${t("addStudent")}</button>`:"";
    return `<div class="row sp"><h2 class="u6">${t("students")}</h2>${add}</div>`+(S.classes.length?NORIA_TAB.emptyStudents():NORIA_TAB.noClasses())+`<div id="stuModal"></div>`; }
  const full=["direction","secretariat"].includes(S.role);
  const q=stuQ.toLowerCase();
  const f=S.students.filter(s=>!q||(s.firstName+" "+s.lastName+" "+s.code).toLowerCase().includes(q)).slice(0,60);
  const canEdit=full;
  const tools=`<span class="row"><input id="stuQ" placeholder="${t("search")}" value="${esc(stuQ)}" data-action-input="KL.stuQ" data-a0="v">${canEdit?`<button id="stuAdd" data-action="KL.stuAdd">${t("addStudent")}</button>`:""}${(full||S.role==="comptable")?`<button class="ghost" data-action="KL.stuCSV">${t("export")}</button>`:""}${canEdit?`<label class="u5 pill">${t("import")} CSV<input type="file" id="csvIn" accept=".csv" hidden></label>`:""}</span>`;
  const head=`<div class="row sp"><h2 class="u6">${t("students")} (${S.students.length})</h2>${tools}</div>`;
  if(full) return head+`
  <div class="card"><div class="u7"><table><tr><th>Code</th><th>${t("firstName")} / ${t("lastName")}</th><th>${t("class")}</th><th>${t("guardians")}</th><th>${t("status")}</th><th>${t("actions")}</th></tr>
  ${f.map(s=>{const c=classById(s.classId);return `<tr><td class="small">${esc(s.code)}</td><td><b>${esc(s.firstName)} ${esc(s.lastName)}</b> <span class="mut small">${s.sex} • ${esc(s.birth)}</span></td><td>${esc(c?.name||"")} <span class="mut small">${esc(s.level)}</span></td><td class="small">${esc(s.guardians[0]?.name||"")} <span class="mut">${esc(s.guardians[0]?.phone||"")}</span></td><td><span class="badge b-present">${esc(s.status)}</span></td><td class="row"><button class="ghost" data-action="KL.stuFile" data-a0="s:${esc(s.id)}">${t("studentFile")}</button>${canEdit?`<button class="ghost" data-action="KL.stuModal" data-a0="s:${esc(s.id)}">${t("edit")}</button>`:""}</td></tr>`;}).join("")||`<tr><td colspan="6">${t("empty")}</td></tr>`}</table></div></div>
  <p class="small mut">${esc(t("menfpNote"))}</p><div id="stuModal"></div>`;
  if(S.role==="comptable") return head+`
  <div class="card"><div class="u7"><table><tr><th>Code</th><th>${t("firstName")} / ${t("lastName")}</th><th>${t("class")}</th><th>${t("balance")}</th><th></th></tr>
  ${f.map(s=>{const c=classById(s.classId);const d=feeDue(s);return `<tr><td class="small">${esc(s.code)}</td><td><b>${esc(s.firstName)} ${esc(s.lastName)}</b></td><td>${esc(c?.name||"")} <span class="mut small">${esc(s.level)}</span></td><td><b>${money(d.rest)}</b></td><td><button class="ghost" data-action="KL.go" data-a0="s:finance">${t("receipts")}</button></td></tr>`;}).join("")||`<tr><td colspan="5">${t("empty")}</td></tr>`}</table></div></div>
  <p class="small mut">${S.lang==="ht"?"Done finansye sèlman — pa gen fichye konplè, pa gen nòt.":"Données financières uniquement — ni fiche complète, ni notes."}</p><div id="stuModal"></div>`;
  return head+`
  <div class="card"><div class="u7"><table><tr><th>Code</th><th>${t("firstName")} / ${t("lastName")}</th><th>${t("class")}</th></tr>
  ${f.map(s=>{const c=classById(s.classId);return `<tr><td class="small">${esc(s.code)}</td><td><b>${esc(s.firstName)} ${esc(s.lastName)}</b></td><td>${esc(c?.name||"")} <span class="mut small">${esc(s.level)}</span></td></tr>`;}).join("")||`<tr><td colspan="3">${t("empty")}</td></tr>`}</table></div></div>
  <p class="small mut">${S.lang==="ht"?"Idantite minimòm pou prete liv : non, kòd, klas. Pa gen dat nesans, kontak fanmi, nòt oswa finans. Kat la sèvi pou jwenn kont pre a, pa pou ouvri pòtal.":"Identité minimale de prêt : nom, code, classe. Ni naissance, ni contacts familiaux, ni notes, ni finances. La carte sert à retrouver le compte de prêt, pas à ouvrir le portail."}</p><div id="stuModal"></div>`;
}
function bStu(){ const f=$("#csvIn"); if(f) f.onchange=e=>{ const fl=e.target.files[0]; if(!fl)return; const r=new FileReader(); r.onload=()=>{ const lines=String(r.result).split("\n").slice(1).filter(Boolean); let add=0; lines.forEach((ln,i)=>{ const p=ln.split(",").map(x=>x.replace(/^"|"$/g,"")); if(p.length<3)return; const fn=p[0]||"Prénom"+i,ln2=p[1]||"Nom",cl=p[2]||"c7a"; S.students.push({id:"e"+Date.now()+i,code:"KL-2025-"+String(S.students.length+1).padStart(3,"0"),firstName:fn,lastName:ln2,sex:"M",birth:"2012-01-01",level:classById(cl)?.level||"7e AF",classId:cl,campus:"Delmas",status:"inscrit",guardians:[],siblings:[],address:"",year:S.year}); add++; }); save(); render(); toast(add+" importés"); }; r.readAsText(fl); }; }
KL.stuQ=v=>{stuQ=v; const i=$("#stuQ"); render(); const n=$("#stuQ"); if(n){n.focus(); n.setSelectionRange(n.value.length,n.value.length);}};
KL.stuCSV=()=>{ if(SERVER&&window.NORIA_TAB){ NORIA_TAB.exportStudents(); return; } if(!["direction","secretariat","comptable"].includes(S.role)){toast(t("noAccess"));return;} const rows=[["prenom","nom","classe","code","niveau","statut"],...S.students.map(s=>[s.firstName,s.lastName,s.classId,s.code,s.level,s.status])]; dl("eleves.csv","\uFEFF"+toCSV(rows),"text/csv"); logExport("CSV","eleves.csv ("+S.students.length+")"); toast(t("savedOk")); };
// Sans classe : on explique et on envoie vers la création des classes (direction) au lieu d'ouvrir une fiche impossible à classer.
KL.stuAdd=()=>{ if(!["direction","secretariat"].includes(S.role)){toast(t("noAccess"));return;}
  if(SERVER&&!S.classes.length){ toast(t("addNeedClass")); if(S.role==="direction"&&can("classes")) KL.go("classes"); return; }
  KL.stuModal(); };
KL.stuModal=id=>{ if(!["direction","secretariat"].includes(S.role)){toast(t("noAccess"));return;} 
  // Mode serveur (lot 2) : fiche enregistrée sur le serveur (création, motif, classe, responsables), module chargé à la demande.
  if(SERVER&&window.NORIA_ECO){ const sv=id?stuById(id):null; NORIA_ECO.load("src/eleves-fiche.js").then(()=>NORIA_ELV.open(sv?sv.serverId:null,S.classes)).catch(()=>toast(t("noAccess"))); return; }
  const s=id?stuById(id):{firstName:"",lastName:"",sex:"F",birth:"2013-05-01",level:"7e AF",classId:"c7a",campus:"Delmas",guardians:[{name:"",link:"Manman",phone:""}]};
  const dups=!id?S.students.filter(x=>x.firstName.toLowerCase()===String($("#stuQ")?.value||"").toLowerCase().slice(0,4)): [];
  $("#stuModal").innerHTML=`<div class="modal"><div class="sheet"><h3>${id?t("edit"):t("newStudent")}</h3>
  ${S.students.filter(x=>x.firstName===s.firstName&&x.lastName===s.lastName).length?`<div class="warnbox"> ${esc(t("dupWarn"))}</div>`:""}
  <div class="grid g2"><div class="fld"><label>${t("firstName")}</label><input id="f_fn" value="${esc(s.firstName)}"></div><div class="fld"><label>${t("lastName")}</label><input id="f_ln" value="${esc(s.lastName)}"></div>
  <div class="fld"><label>${t("sex")}</label><select id="f_sex"><option ${s.sex==="F"?"selected":""}>F</option><option ${s.sex==="M"?"selected":""}>M</option></select></div><div class="fld"><label>${t("birth")}</label><input id="f_bi" type="date" value="${esc(s.birth)}"></div>
  <div class="fld"><label>${t("class")}</label><select id="f_cl">${S.classes.map(c=>`<option value="${c.id}" ${s.classId===c.id?"selected":""}>${esc(c.name)} — ${esc(c.level)}</option>`).join("")}</select></div><div class="fld"><label>${t("guardians")} — nom</label><input id="f_g" value="${esc(s.guardians?.[0]?.name||"")}"></div></div>
  <div class="fld"><label>${t("phone")}</label><input id="f_ph" value="${esc(s.guardians?.[0]?.phone||"")}"></div>
  <div class="row"><button data-action="KL.stuSave" data-a0="s:${esc(id||"")}">${t("save")}</button><button class="ghost" data-action="vider" data-a0="s:#stuModal">${t("cancel")}</button></div></div></div>`; };
KL.stuSave=id=>{ if(!["direction","secretariat"].includes(S.role)){toast(t("noAccess"));return;} const g=v=>$(v).value.trim();
  const fn=g("#f_fn"),ln=g("#f_ln"); if(!fn||!ln){toast("!");return;}
  const dup=S.students.find(x=>x.firstName.toLowerCase()===fn.toLowerCase()&&x.lastName.toLowerCase()===ln.toLowerCase()&&x.id!==id);
  const cl=classById(g("#f_cl"));
  if(id){ const s=stuById(id); Object.assign(s,{firstName:fn,lastName:ln,sex:g("#f_sex"),birth:g("#f_bi"),classId:cl.id,level:cl.level}); s.guardians=[{name:g("#f_g"),link:"-",phone:g("#f_ph")}]; }
  else{ S.students.push({id:"e"+Date.now(),code:"KL-2025-"+String(S.students.length+1).padStart(3,"0"),firstName:fn,lastName:ln,sex:g("#f_sex"),birth:g("#f_bi"),level:cl.level,classId:cl.id,campus:cl.campus,status:"inscrit",guardians:[{name:g("#f_g"),link:"-",phone:g("#f_ph")}],siblings:[],address:"",year:S.year}); }
  save(); render(); toast((dup?" ":"")+t("createdOk")); };
KL.stuFile=id=>{ if(denyLeak("fiche",id)) return; const box=$("#stuModal"); if(!box) return; const s=stuById(id); const c=classById(s.classId); const d=feeDue(s);
  $("#stuModal").innerHTML=`<div class="modal"><div class="sheet"><div class="noprint row sp"><b>${t("studentFile")}</b><span class="row"><button data-action="print">${t("print")}</button><button class="ghost" data-action="vider" data-a0="s:#stuModal">${t("close")}</button></span></div>
  <h3>${esc(s.firstName)} ${esc(s.lastName)} <span class="mut small">${esc(s.code)}</span></h3>
  <div class="small">Classe: <b>${esc(c?.name)}</b> • ${esc(s.level)} • ${esc(s.campus)}<br>Né(e): ${esc(s.birth)} • ${esc(s.address)}<br>Responsable: ${esc(s.guardians[0]?.name||"—")} ${esc(s.guardians[0]?.phone||"")}<br>Solde frais: <b>${money(d.rest)}</b> (payé ${money(d.paid)} / ${money(d.due)})</div>
  <p class="small mut">Bileng FR/HT • Document généré par la maquette — sans valeur officielle MENFP.</p></div></div>`; };

/* ---------- CLASSES ---------- */
function vClasses(){
  if(SERVER&&window.NORIA_TAB) return NORIA_TAB.classes(S);
  const list=S.role==="enseignant"?S.classes.filter(c=>teacherClasses().includes(c.id)):S.classes;
  return `<h2 class="u6">${t("classes")}</h2><div class="u8 grid g2">
  ${list.map(c=>{const n=S.students.filter(s=>s.classId===c.id).length;const te=S.staff.find(x=>x.id===c.teacherId);
  return `<div class="card"><h3>${esc(c.name)} <span class="mut small">${esc(c.level)} • ${esc(c.campus)} • ${esc(c.room)}</span></h3><div class="small mut">Enseignant: ${esc(te?.name||"—")} • ${n} élèves</div>
  <div class="toolbar"><button class="soft" data-action="KL.attGo" data-a0="s:${esc(c.id)}">${t("rollCall")}</button><button class="ghost" data-action="KL.clList" data-a0="s:${esc(c.id)}">${t("classLists")} / ${t("print")}</button></div></div>`;}).join("")}</div>
  <div class="u3 card"><h3>${t("yearConfig")}</h3><div class="small">Année: <b>${esc(S.year)}</b> • Périodes: ${S.periods.join(", ")} • Niveaux: ${S.levels.join(", ")} • Barème: /${S.scale.max}, passage ${S.scale.pass}, arrondi ${S.scale.round}</div></div>`;
}
KL.clList=id=>{ if(SERVER&&window.NORIA_TAB){ const c=classById(id); if(c&&c.serverId) NORIA_TAB.exportStudents(c.serverId); return; } if(S.role==="enseignant"&&!teacherClasses().includes(id)){toast(t("noAccess"));return;} const c=classById(id); const rows=S.students.filter(s=>s.classId===id);
  dl(`liste-${c.name}.csv`,"\uFEFF"+toCSV([["code","prenom","nom","sexe"],...rows.map(s=>[s.code,s.firstName,s.lastName,s.sex])]),"text/csv"); logExport("CSV","liste "+c.name); toast(t("savedOk")); };

/* ---------- PRESENCES ---------- */
let attC="c7a", attD=today();
function teacherOwns(classId){ return teacherClasses().includes(classId); }
function clampAtt(){ if(S.role==="enseignant" && !teacherOwns(attC)) attC=teacherClasses()[0]||attC; }
function vAtt(){
  if(SERVER) return vAttServer();
  clampAtt();
  let list=S.classes; if(S.role==="enseignant") list=S.classes.filter(c=>teacherOwns(c.id));
  if(S.role==="parent"||S.role==="eleve"){ const kids=kidStudents();
    return `<h2 class="u6">${t("attendance")}</h2><p class="small mut">${esc(t("onlyLinked"))}</p>${kids.map(k=>{const c=classById(k.classId);const recs=Object.entries(S.attendance).filter(([k2,a])=>a.classId===k.classId&&a.records?.[k.id]).slice(-6);return `<div class="card"><h3>${esc(k.firstName)} ${esc(k.lastName)} — ${esc(c?.name)}</h3>${recs.map(([k2,a])=>`<div class="small">${k2.split("|")[1]} : <b>${a.records[k.id]}</b> <span class="mut">(${esc(a.sync)})</span></div>`).join("")||`<span class="mut small">${t("empty")}</span>`}</div>`;}).join("")}`; }
  const key=attC+"|"+attD; const sheet=S.attendance[key];
  const cls=classById(attC); const pupils=S.students.filter(s=>s.classId===attC);
  const states=["P","A","R","E"]; const lbl={P:t("present"),A:t("absent"),R:t("late"),E:t("excused")};
  return `<div class="row sp"><h2 class="u6">${t("attendance")}</h2><span class="badge b-pending">${sheet?syncWord(sheet.sync):t("local")}</span></div>
  ${S.online?"":`<div class="badbox small"> ${esc(t("offlineNote"))}</div>`}
  ${sheet?.sync==="conflict"?`<div class="warnbox small"> ${esc(t("conflictNote"))}<br>Locale: ${JSON.stringify(sheet.records)}<br>Précédente: ${JSON.stringify(sheet.prev||{})} <button class="soft" data-action="KL.attResolve" data-a0="s:${esc(key)}">${t("approve")}</button></div>`:""}
  <div class="toolbar"><select data-action-change="KL.attC" data-a0="v">${list.map(c=>`<option value="${c.id}" ${c.id===attC?"selected":""}>${esc(c.name)} — ${esc(c.level)}</option>`).join("")}</select><input type="date" value="${attD}" data-action-change="KL.attD" data-a0="v"><button class="ghost" data-action="KL.attAll">${t("markAllPresent")}</button><button data-action="KL.attSave">${t("save")} ${S.online?"":"()"}</button></div>
  <div class="card"><div class="u7"><table>${pupils.map(s=>{const v=sheet?.records?.[s.id]||"P";return `<tr><td><b>${esc(s.firstName)} ${esc(s.lastName)}</b><br><span class="mut small">${esc(s.code)}</span></td><td class="row">${states.map(st=>`<button class="attbtn ${v===st?(st==="P"?"on-P":st==="A"?"on-A":st==="R"?"on-R":"on-E"):""}" data-action="KL.attMark" data-a0="s:${esc(s.id)}" data-a1="s:${esc(st)}">${st} <span class="small">${lbl[st]}</span></button>`).join("")}</td></tr>`;}).join("")}</table></div></div>
  <div class="u3 card"><h3>${t("history")}</h3>${S.attLog.slice(0,8).map(l=>`<div class="u9 small">${esc(l.date)} — ${esc(l.by)} : ${esc(l.classId)} ${esc(l.day)} → ${esc(l.info)} <span class="badge b-pending">${esc(syncWord(l.sync))}</span></div>`).join("")||`<span class="mut small">${t("empty")}</span>`}</div>`;
}
function bAtt(){}
/* ---------- PRESENCES, mode serveur : feuille du serveur + file hors ligne (src/offline.js) ---------- */
const DAYRE=/^\d{4}-\d{2}-\d{2}$/;
const ST2SV={P:"present",A:"absent",R:"retard",E:"excuse"}, SV2ST={present:"P",absent:"A",retard:"R",excuse:"E"};
let SATT={key:null,sheet:{},pending:{},fresh:false,loading:false,draft:{}};
const KIDATT={};
async function loadSAtt(){
  const c=classById(attC); const off=window.NORIA_OFF; if(!c||!off) return;
  const key=attC+"|"+attD; SATT.loading=true;
  const [r,pending]=await Promise.all([off.loadSheet(c.serverId,attD),off.pendingFor(c.serverId,attD)]);
  if(key!==attC+"|"+attD){ SATT.loading=false; if(ROUTE==="attendance") render(); return; } // jour ou classe changés entre-temps
  SATT={key,sheet:r.sheet,pending,fresh:r.fresh,loading:false,draft:SATT.key===key?SATT.draft:{}};
  if(ROUTE==="attendance") render();
}
function srvStatus(s){ const sid=s.serverId; return SATT.draft[s.id]||(SATT.pending[sid]&&SV2ST[SATT.pending[sid]])||(SATT.sheet[sid]&&SV2ST[SATT.sheet[sid].status])||"P"; }
function vAttServer(){
  const ht=S.lang==="ht";
  if(S.role==="parent"||S.role==="eleve"){
    const kids=kidStudents();
    kids.forEach(k=>{ if(!KIDATT[k.id]){ KIDATT[k.id]={rows:null}; fetch(`/api/students/${k.serverId}/attendance`,{credentials:"same-origin",cache:"no-store"})
      .then(r=>r.ok?r.json():[]).then(rows=>{ KIDATT[k.id].rows=rows; window.NORIA_OFF&&NORIA_OFF.putCache("kid:"+k.id,rows); if(ROUTE==="attendance") render(); })
      .catch(async()=>{ KIDATT[k.id].rows=(window.NORIA_OFF&&await NORIA_OFF.getCache("kid:"+k.id))||[]; if(ROUTE==="attendance") render(); }); } });
    const lbl={present:t("present"),absent:t("absent"),retard:t("late"),excuse:t("excused")};
    return `<h2 class="u6">${t("attendance")}</h2><p class="small mut">${esc(t("onlyLinked"))}</p>${kids.map(k=>{const c=classById(k.classId);const rows=KIDATT[k.id]&&KIDATT[k.id].rows;
      return `<div class="card"><h3>${esc(k.firstName)} ${esc(k.lastName)} — ${esc(c?.name||"")}</h3>${rows==null?`<span class="mut small">…</span>`:rows.slice(0,10).map(r=>`<div class="small">${esc(r.day)} : <b>${esc(lbl[r.status]||r.status)}</b></div>`).join("")||`<span class="mut small">${t("empty")}</span>`}</div>`;}).join("")}`;
  }
  let list=S.classes; if(S.role==="enseignant") list=S.classes.filter(c=>teacherOwns(c.id));
  if(!list.some(c=>c.id===attC)) attC=list[0]?.id||"";
  const cls=classById(attC);
  if(!cls) return `<h2 class="u6">${t("attendance")}</h2><p class="mut">${t("empty")}</p>`;
  const key=attC+"|"+attD; if(SATT.key!==key&&!SATT.loading) loadSAtt();
  const ready=SATT.key===key;
  const pupils=S.students.filter(s=>s.classId===attC);
  const states=["P","A","R","E"]; const lbl={P:t("present"),A:t("absent"),R:t("late"),E:t("excused")};
  const off=window.NORIA_OFF; const online=off?off.online():navigator.onLine;
  const nPend=Object.keys(SATT.pending).length, nDraft=Object.keys(SATT.draft).length;
  const conflicts=off?off.takeConflicts().filter(c=>c.class_id===cls.serverId&&c.day===attD):[];
  const rowState=s=>{ const sid=s.serverId; if(SATT.draft[s.id]) return ["draft",ht?"pa anrejistre":"non enregistré"]; if(SATT.pending[sid]) return ["wait",ht?"ap tann":"en attente d'envoi"];
    if(SATT.sheet[sid]) return ["ok",(ht?"sou sèvè a":"sur le serveur")+" · v"+SATT.sheet[sid].version]; return ["none",ht?"poko antre":"pas encore saisi"]; };
  const name=id=>{ const p=S.students.find(x=>x.serverId===id); return p?p.firstName+" "+p.lastName:"#"+id; };
  return `<div class="row sp"><h2 class="u6">${t("attendance")}</h2><span class="badge ${nPend?"b-pending":"b-paid"}">${nPend?(ht?`${nPend} ap tann`:`${nPend} en attente`):(ready&&SATT.fresh?(ht?"Ajou":"À jour"):(ht?"Kopi sou aparèy la":"Copie de l'appareil"))}</span></div>
  ${online?"":`<div class="badbox small" id="attOffline">${ht?"San entènèt : apèl la anrejistre sou aparèy sa a epi l ap pati otomatikman lè rezo a tounen.":"Hors ligne : l'appel est enregistré sur cet appareil et sera envoyé automatiquement au retour du réseau."}</div>`}
  ${conflicts.length?`<div class="warnbox small" id="attConflicts"><b>${ht?"Konfli":"Conflit"}</b> — ${ht?"fich la te chanje sou sèvè a anvan antre ou a rive ; sèvè a kenbe valè li. Pou korije, chwazi ankò epi bay yon motif.":"la fiche avait changé sur le serveur avant l'arrivée de votre saisie ; le serveur garde sa valeur (conflit journalisé). Pour corriger, choisissez à nouveau et donnez un motif."}
    <ul>${conflicts.map(c=>`<li>${esc(name(c.student_id))} : ${ht?"ou te mete":"vous aviez mis"} « ${esc(lbl[SV2ST[c.client_status]]||c.client_status)} », ${ht?"sèvè a kenbe":"le serveur garde"} « ${esc(lbl[SV2ST[c.status]]||c.status)} »</li>`).join("")}</ul>
    <button class="ghost" data-action="KL.attConflictsSeen">${ht?"Mwen konprann":"Compris"}</button></div>`:""}
  <div class="toolbar"><select data-action-change="KL.attC" data-a0="v" aria-label="${t("classes")}">${list.map(c=>`<option value="${esc(c.id)}" ${c.id===attC?"selected":""}>${esc(c.name)} — ${esc(c.level)}</option>`).join("")}</select><input type="date" value="${esc(attD)}" data-action-change="KL.attD" data-a0="v" aria-label="Date"><button class="ghost" data-action="KL.attAll">${t("markAllPresent")}</button></div>
  <div class="card"><div class="u7"><table>${pupils.map(s=>{const v=srvStatus(s);const [k,txt]=rowState(s);return `<tr data-sid="${esc(s.serverId)}"><td><b>${esc(s.firstName)} ${esc(s.lastName)}</b><br><span class="mut small">${esc(s.code)}</span> <span class="att-st att-${k} small">${esc(txt)}</span></td><td class="row">${states.map(st=>`<button class="attbtn ${v===st?(st==="P"?"on-P":st==="A"?"on-A":st==="R"?"on-R":"on-E"):""}" aria-pressed="${v===st}" data-action="KL.attMark" data-a0="s:${esc(s.id)}" data-a1="s:${esc(st)}">${st} <span class="small">${lbl[st]}</span></button>`).join("")}</td></tr>`;}).join("")}</table></div>
  <div class="u8 toolbar"><label class="u10 small">${ht?"Motif (obligatwa pou korije antre yon lòt moun)":"Motif (obligatoire pour corriger la saisie d'une autre personne)"}<input id="attReason" maxlength="300" class="u11" autocomplete="off"></label><button id="attSaveBtn" data-action="KL.attSave">${t("save")}${nDraft?` (${nDraft})`:""}</button></div></div>
  <p class="small mut">${ht?"Règ konfli : si fich la chanje sou sèvè a depi dènye fwa aparèy la te wè l, valè sèvè a rete, epi konfli a anrejistre nan jounal la.":"Règle de conflit : si la fiche a changé sur le serveur depuis la dernière version vue par cet appareil, la valeur du serveur est conservée et le conflit est inscrit au journal."}</p>`;
}
function srvMark(sid,st){ if(!["direction","secretariat","enseignant"].includes(S.role)){toast(t("noAccess"));return;} if(S.role==="enseignant"&&!teacherOwns(attC)){toast(t("noAccess"));return;} SATT.draft[sid]=st; render(); }
function srvAll(){ if(!["direction","secretariat","enseignant"].includes(S.role)){toast(t("noAccess"));return;} S.students.filter(s=>s.classId===attC).forEach(s=>{ SATT.draft[s.id]="P"; }); render(); }
async function srvSave(){
  if(!["direction","secretariat","enseignant"].includes(S.role)){toast(t("noAccess"));return;}
  const cls=classById(attC); const off=window.NORIA_OFF; if(!cls||!off) return;
  const reasonEl=document.getElementById("attReason"); const reason=reasonEl?reasonEl.value.trim():"";
  const ops=[];
  S.students.filter(s=>s.classId===attC).forEach(s=>{
    const want=ST2SV[srvStatus(s)]; const cur=SATT.sheet[s.serverId]; const pend=SATT.pending[s.serverId];
    if(!SATT.draft[s.id]&&(pend||cur)) return; // rien de nouveau pour cet élève
    if(cur&&cur.status===want&&!pend) return;
    ops.push({class_id:cls.serverId,student_id:s.serverId,day:attD,status:want,base_version:cur?cur.version:0,reason:reason||undefined});
  });
  SATT.draft={};
  if(!ops.length){ toast(S.lang==="ht"?"Anyen pou anrejistre.":"Rien à enregistrer."); render(); return; }
  const wasOnline=off.online();
  await off.enqueue(ops);
  toast(wasOnline?(S.lang==="ht"?`${ops.length} antre ap voye…`:`${ops.length} saisie(s) en cours d'envoi…`):(S.lang==="ht"?`${ops.length} antre anrejistre sou aparèy la ; y ap pati lè rezo a tounen.`:`${ops.length} saisie(s) enregistrée(s) sur l'appareil ; envoi au retour du réseau.`));
  SATT.key=null; render();
}
KL.attConflictsSeen=()=>{ window.NORIA_OFF&&NORIA_OFF.clearConflicts(); render(); };
let attRefresh=null;
function onOfflineChange(){
  if(!SERVER) return;
  const ref=window.NORIA_OFF.takeRefused(); if(ref.length) toast((S.lang==="ht"?"Refize pa sèvè a : ":"Refusé par le serveur : ")+ref.map(r=>r.error).filter(Boolean).slice(0,2).join(" ; "));
  clearTimeout(attRefresh); attRefresh=setTimeout(()=>{ if(ROUTE==="attendance"){ SATT.key=null; render(); } },150);
}
KL.attGo=id=>{ if(S.role==="enseignant"&&!teacherOwns(id)){toast(t("noAccess"));return;} attC=id;ROUTE="attendance";render();};
KL.attC=v=>{ if(S.role==="enseignant"&&!teacherOwns(v)){toast(t("noAccess"));return;} attC=v;render();}; KL.attD=v=>{ if(DAYRE.test(v)) attD=v; render();};
KL.attMark=(sid,st)=>{ if(SERVER) return srvMark(sid,st); if(["parent","eleve","comptable","bibliothecaire"].includes(S.role)){toast(t("noAccess"));return;} if(S.role==="enseignant"&&!teacherOwns(attC)){toast(t("noAccess"));return;} const key=attC+"|"+attD; S.attendance[key]=S.attendance[key]||{classId:attC,day:attD,records:{},sync:"local"}; S.attendance[key].records[sid]=st; save(); render(); };
KL.attAll=()=>{ if(SERVER) return srvAll(); if(["parent","eleve","comptable","bibliothecaire"].includes(S.role)){toast(t("noAccess"));return;} if(S.role==="enseignant"&&!teacherOwns(attC)){toast(t("noAccess"));return;} const key=attC+"|"+attD; const rec={}; S.students.filter(s=>s.classId===attC).forEach(s=>rec[s.id]="P"); S.attendance[key]={classId:attC,day:attD,records:rec,sync:S.online?"synced":"local"}; save(); render(); };
KL.attSave=()=>{ if(SERVER) return srvSave(); if(["parent","eleve","comptable","bibliothecaire"].includes(S.role)){toast(t("noAccess"));return;} if(S.role==="enseignant"&&!teacherOwns(attC)){toast(t("noAccess"));return;} const key=attC+"|"+attD; let sh=S.attendance[key];
  if(!sh){ const rec={}; S.students.filter(s=>s.classId===attC).forEach(s=>rec[s.id]="P"); sh={classId:attC,day:attD,records:rec}; }
  if(!S.online){ if(sh.sync==="pending"){ sh.prev=Object.assign({},sh.records); sh.sync="conflict"; } else sh.sync="pending";
    S.attendance[key]=sh; S.queue.push({kind:"attendance",key,at:Date.now()});
  } else { sh.sync="synced"; S.attendance[key]=sh; }
  S.attLog.unshift({date:new Date().toLocaleString(),by:S.role,classId:attC,day:attD,info:Object.values(sh.records).filter(x=>x!=="P").length+" non-présents",sync:sh.sync});
  save(); render(); toast(t("attDone")+(S.online?"":" — "+t("pending"))); };
KL.attResolve=key=>{ if(!["direction","secretariat","enseignant"].includes(S.role)){toast(t("noAccess"));return;} S.attendance[key].sync="synced"; S.attendance[key].prev=null; S.attLog.unshift({date:new Date().toLocaleString(),by:S.role,classId:attC,day:attD,info:"conflit résolu",sync:"synced"}); save(); render(); toast(t("savedOk")); };

/* ---------- ACADEMIQUE ---------- */
let acEv="ev1";
function vAcc(){ return window.NORIA_SCO?NORIA_SCO.accounts(S):""; }
function vAcad(){
  if(SERVER&&window.NORIA_SCO) return NORIA_SCO.acad(S);
  if(S.role==="parent"||S.role==="eleve"){ const kids=kidStudents();
    return `<h2 class="u6">${t("reportCard")}</h2>${kids.map(k=>`<div class="u8 card"><h3>${esc(k.firstName)} ${esc(k.lastName)}</h3>${S.evals.filter(e=>e.status==="published"&&e.classId===k.classId).map(e=>`<div class="small">${esc(e.subject)} — ${esc(e.title)} : <b>${S.grades[e.id]?.[k.id]??"—"}/${e.max}</b></div>`).join("")||`<span class="mut small">${t("draft")} — ${t("noAccess")}</span>`}<div class="toolbar"><button class="ghost" data-action="KL.bulletin" data-a0="s:${esc(k.id)}">${t("reportCard")} / ${t("print")}</button></div></div>`).join("")}`; }
  const scopeEvs = S.role==="enseignant" ? S.evals.filter(e=>teacherClasses().includes(e.classId)) : S.evals;
  if(!scopeEvs.find(e=>e.id===acEv)) acEv = scopeEvs[0]?scopeEvs[0].id:acEv;
  const ev=S.evals.find(e=>e.id===acEv)||scopeEvs[0];
  if(!ev) return `<div class="badbox">${esc(t("empty"))}</div>`;
  const pupils=S.students.filter(s=>s.classId===ev.classId);
  const isDir = S.role==="direction";
  const stBadge = ev.status==="published"?`<span class="badge b-published">${t("published")}</span>`:ev.status==="submitted"?`<span class="badge b-pending">✓ ${S.lang==="ht"?"Voye":"Soumis"} — ${S.lang==="ht"?"ap tann direksyon":"en vérification"}</span>`:`<span class="badge b-draft">${t("draft")}</span>`;
  const editable = ev.status==="draft"&&(S.role==="enseignant"||isDir);
  const hist = (S.gradeHist||[]).filter(h=>h.ev===ev.id);
  return `<div class="row sp"><h2 class="u6">${t("academic")}</h2><span class="row"><select data-action-change="KL.acEv" data-a0="v">${scopeEvs.map(e=>`<option value="${e.id}" ${e.id===acEv?"selected":""}>${esc(e.title)} — ${esc(e.subject)} (${e.status})</option>`).join("")}</select><button class="ghost" data-action="KL.evModal">${t("newEval")}</button></span></div>
  <div class="card"><div class="row sp"><span><b>${esc(ev.title)}</b> <span class="mut small">${esc(ev.subject)} • /${ev.max} • ${esc(ev.date)} • </span>${stBadge}</span>
  <span class="row">${ev.status==="draft"?`${(S.role==="enseignant"||isDir)?`<button class="soft" data-action="KL.evSubmit" data-a0="s:${esc(ev.id)}">${S.lang==="ht"?"Voye bay direksyon":"Soumettre à la direction"}</button>`:""}${isDir?`<button data-action="KL.evPub" data-a0="s:${esc(ev.id)}">${t("publish")}</button>`:""}`:ev.status==="submitted"?`${isDir?`<button data-action="KL.evPub" data-a0="s:${esc(ev.id)}">${t("publish")}</button><button class="ghost" data-action="KL.evReturn" data-a0="s:${esc(ev.id)}">${S.lang==="ht"?"Remete l an bouyon":"Renvoyer en brouillon"}</button>`:`<span class="mut small">${S.lang==="ht"?"Ap tann direksyon":"En attente de la direction"}</span>`}`:`<span class="badge b-lock"> ${t("lock")}</span>`}<button class="ghost" data-action="KL.bulletinClass" data-a0="s:${esc(ev.classId)}">Aperçu relevés</button></span></div>
  <div class="u12"><table><tr><th>Élève</th><th>${t("score")} / ${ev.max}</th><th>Appréciation</th>${isDir&&ev.status==="published"?`<th></th>`:""}</tr>
  ${pupils.map(s=>{const g=S.grades[ev.id]?.[s.id]??"";const dis=editable?"":"disabled";return `<tr><td>${esc(s.firstName)} ${esc(s.lastName)}</td><td><input type="number" min="0" max="${ev.max}" value="${g}" ${dis} class="u13" data-action-change="KL.grade" data-a0="s:${esc(ev.id)}" data-a1="s:${esc(s.id)}" data-a2="v"></td><td class="small mut">${g===""?"—":g>=ev.max/2?"Bien":"À encourager"}</td>${isDir&&ev.status==="published"?`<td><button class="ghost" data-action="KL.corrModal" data-a0="s:${esc(ev.id)}" data-a1="s:${esc(s.id)}">${S.lang==="ht"?"Korije":"Corriger"}</button></td>`:""}</tr>`;}).join("")}</table></div>
  <p class="small mut">Préparé par le professeur, vérifié puis publié par la direction. Après publication, seule la direction corrige (motif + historique). Arrondi ${esc(S.scale.round)}.</p>
  ${isDir&&hist.length?`<details class="small"><summary>Historique des corrections (${hist.length})</summary>${hist.map(h=>{const s=stuById(h.sid);return `<div>• ${esc(h.at)} — ${esc(s?s.firstName+" "+s.lastName:h.sid)} : ${esc(h.prev)} → <b>${esc(h.next)}</b> — ${esc(h.motif)} (${esc(h.by)})</div>`;}).join("")}</details>`:""}</div>`;
}
function bAcad(){}
function leakOk(kind,sid){
  if(S.role==="parent") return S.currentUser.parentKids.includes(sid);
  if(S.role==="eleve") return S.currentUser.studentId===sid;
  if(S.role==="enseignant"){ const s=stuById(sid); return !!(s&&teacherClasses().includes(s.classId)); }
  if(S.role==="bibliothecaire") return false;
  if(S.role==="comptable") return kind==="recu";
  return true;
}
function denyLeak(kind,sid){ if(!leakOk(kind,sid)){ toast(t("noAccess")); return true; } return false; }
function anTargets(){ if(S.role==="enseignant") return teacherClasses().map(id=>`<option>${esc(classById(id)?.name||id)}</option>`).join(""); return `<option>Toute l'école</option><option>Campus Delmas</option><option>Campus Pétion-Ville</option><option>7e A</option><option>8e A</option>`; }
function canPublish(){ return ["direction","secretariat","enseignant"].includes(S.role); }
KL.acEv=v=>{ if(S.role==="enseignant"){ const e=S.evals.find(x=>x.id===v); if(!e||!teacherClasses().includes(e.classId)){ toast(t("noAccess")); return; } } acEv=v;render();};
KL.grade=(ev,sid,v)=>{ const e=S.evals.find(x=>x.id===ev); if(!e) return;
  if(e.status!=="draft"){ toast(S.lang==="ht"?"Nòt kadnase — mande direksyon":"Note verrouillée — voir la direction pour correction"); return; }
  if(S.role==="enseignant"&&!teacherClasses().includes(e.classId)){ toast(t("noAccess")); return; }
  if(!(S.role==="enseignant"||S.role==="direction")){ toast(t("noAccess")); return; }
  v=Math.max(0,Math.min(e.max||100,+v||0)); S.grades[ev]=S.grades[ev]||{}; S.grades[ev][sid]=v; if(!S.online) S.queue.push({kind:"grade",key:ev+sid,at:Date.now()}); save(); toast(t("savedOk")); };
KL.evSubmit=id=>{ const e=S.evals.find(x=>x.id===id); if(!e||e.status!=="draft") return;
  if(S.role==="enseignant"&&!teacherClasses().includes(e.classId)){ toast(t("noAccess")); return; }
  if(!(S.role==="enseignant"||S.role==="direction")){ toast(t("noAccess")); return; }
  e.status="submitted"; save(); render(); toast(t("savedOk")); };
KL.evReturn=id=>{ if(S.role!=="direction"){ toast(t("noAccess")); return; } const e=S.evals.find(x=>x.id===id); if(e&&e.status==="submitted"){ e.status="draft"; save(); render(); } };
KL.evPub=id=>{ if(S.role!=="direction"){ toast(t("noAccess")); return; } const e=S.evals.find(x=>x.id===id); if(!e) return; e.status="published"; save(); render(); toast(t("publishOk")); };
KL.corrModal=(ev,sid)=>{ if(S.role!=="direction") return; const cur=(S.grades[ev]||{})[sid]??""; const s=stuById(sid);
  openPrint((S.lang==="ht"?"Korije nòt":"Corriger la note")+` — ${esc(s.firstName)} ${esc(s.lastName)}`,`<div class="fld"><label>Valeur actuelle : <b>${esc(cur)}</b></label><input id="cg_v" type="number" min="0" max="100" value="${esc(cur)}"></div><div class="fld"><label>${t("motif")} (obligatoire)</label><input id="cg_m" placeholder="Erreur de saisie…"></div><div class="row noprint"><button data-action="KL.corrSave" data-a0="s:${esc(ev)}" data-a1="s:${esc(sid)}">${t("save")}</button></div><p class="small mut">Après publication, seule la direction corrige — motif et historique conservés.</p>`); };
KL.corrSave=(ev,sid)=>{ if(S.role!=="direction") return; const motif=(document.querySelector("#cg_m").value||"").trim(); if(!motif){ toast("!"); return; }
  const ee=S.evals.find(x=>x.id===ev); const nv=Math.max(0,Math.min(ee?(ee.max||100):100,+document.querySelector("#cg_v").value||0)); S.gradeHist=S.gradeHist||[];
  S.gradeHist.unshift({ev,sid,prev:(S.grades[ev]||{})[sid]??"",next:nv,motif,by:S.role,at:new Date().toLocaleString()});
  S.grades[ev]=S.grades[ev]||{}; S.grades[ev][sid]=nv; save(); document.querySelectorAll(".modal").forEach(m=>m.remove()); render(); toast(t("savedOk")); };
KL.evModal=()=>{ if(!(S.role==="direction"||S.role==="enseignant")){toast(t("noAccess"));return;} let cid=attC; if(S.role==="enseignant"&&!teacherOwns(cid)) cid=teacherClasses()[0]||""; if(S.role==="enseignant"&&!teacherOwns(cid)){toast(t("noAccess"));return;} const id="ev"+Date.now(); S.evals.push({id,classId:cid,subject:"Français / Kreyòl",title:"Contrôle "+(S.evals.length+1),max:100,date:today(),status:"draft"}); S.grades[id]={}; acEv=id; save(); render(); };
KL.bulletin=sid=>{ if(denyLeak("bulletin",sid)) return; const s=stuById(sid); const evs=S.evals.filter(e=>e.classId===s.classId&&e.status==="published");
  const rows=evs.map(e=>`<tr><td>${esc(e.subject)}</td><td>${esc(e.title)}</td><td><b>${S.grades[e.id]?.[sid]??"—"}/${e.max}</b></td></tr>`).join("");
  const avg=evs.length?(evs.reduce((a,e)=>a+(+S.grades[e.id]?.[sid]||0),0)/evs.length).toFixed(1):"—";
  openPrint(`${t("reportCard")} — ${esc(s.firstName)} ${esc(s.lastName)}`,`<p>Classe ${esc(classById(s.classId)?.name)} • Année ${esc(S.year)} • ${esc(s.code)}</p><table><tr><th>${t("subject")}</th><th>${t("eval")}</th><th>${t("score")}</th></tr>${rows}</table><p><b>${t("average")}: ${avg}</b></p><p class="small">Bilten / Relevé bilingue — document de maquette, sans valeur officielle.</p>`); };
KL.bulletinClass=cid=>{ if(S.role==="enseignant"&&!teacherClasses().includes(cid)){toast(t("noAccess"));return;} if(["parent","eleve","comptable","bibliothecaire","secretariat"].includes(S.role)){toast(t("noAccess"));return;} const rows=S.students.filter(s=>s.classId===cid); const evs=S.evals.filter(e=>e.classId===cid&&e.status==="published");
  openPrint("Aperçu relevés — "+classById(cid)?.name,`<table><tr><th>Élève</th>${evs.map(e=>`<th>${esc(e.title)}</th>`).join("")}<th>${t("average")}</th></tr>${rows.map(s=>{const gs=evs.map(e=>+S.grades[e.id]?.[s.id]||0);const a=evs.length?(gs.reduce((x,y)=>x+y,0)/evs.length).toFixed(1):"—";return `<tr><td>${esc(s.firstName)} ${esc(s.lastName)}</td>${gs.map(g=>`<td>${g}</td>`).join("")}<td><b>${a}</b></td></tr>`;}).join("")}</table>`); };

/* ---------- COMMS ---------- */
function vComms(){
  if(SERVER&&window.NORIA_SCO) return NORIA_SCO.comms(S);
  const canPub=["direction","secretariat","enseignant"].includes(S.role);
  return `<div class="row sp"><h2 class="u6">${t("comms")}</h2>${canPub?`<button data-action="KL.anModal">${t("newAnnounce")}</button>`:""}</div>
  <div class="u8 grid g2"><div>${S.announces.map(a=>`<div class="u14 card"><h3>${esc(a.title)}</h3><div class="small mut">${esc(a.target)} • ${esc(a.channel)} • ${esc(a.date)} • <span class="badge b-sent">✓ ${a.ok} / ✕ ${a.fail}</span></div><p>${esc(a.text)}</p></div>`).join("")}</div>
  <div><div class="card"><h3>${t("meetings")}</h3>${S.meetings.map(m=>`<div class="u4 small"><b>${esc(m.title)}</b><br>${esc(m.date)} • ${esc(m.place)} • ${m.confirmed}/${m.invited} </div>`).join("")}
  ${canPub?`<div class="toolbar"><button class="ghost" data-action="KL.mtAdd">${t("add")}</button></div>`:""}</div>
  <div class="u8 card"><h3>${t("requests")}</h3><p class="small mut">${S.role==="parent"?t("updateContact"):t("history")}</p><button class="ghost" data-action="KL.req">${S.role==="parent"?t("updateContact"):t("view")}</button></div></div></div>
  <p class="small mut">${esc(t("readAck"))}</p><div id="anModal"></div>`;
}
function bComms(){}
KL.anModal=()=>{ if(!canPublish()){toast(t("noAccess"));return;} $("#anModal").innerHTML=`<div class="modal"><div class="sheet"><h3>${t("newAnnounce")}</h3><div class="fld"><label>${t("title")}</label><input id="a_t"></div><div class="grid g2"><div class="fld"><label>${t("target")}</label><select id="a_c">${anTargets()}</select></div><div class="fld"><label>${t("channel")}</label><select id="a_ch"><option>Papier + WhatsApp</option><option>SMS + Papier</option><option>Courriel</option><option>Papier</option></select></div></div><div class="fld"><label>Message (FR/HT)</label><textarea id="a_x" rows="3"></textarea></div><div class="row"><button data-action="KL.anSave">${t("publishNow")}</button><button class="ghost" data-action="vider" data-a0="s:#anModal">${t("cancel")}</button></div></div></div>`; };
KL.anSave=()=>{ if(!canPublish()){toast(t("noAccess"));return;} const v=id=>$("#"+id).value; if(!v("a_t"))return; S.announces.unshift({id:"a"+Date.now(),title:v("a_t"),target:v("a_c"),channel:v("a_ch"),date:today(),text:v("a_x")||"—",status:"sent",ok:Math.floor(150+Math.random()*150),fail:Math.floor(Math.random()*9)}); if(!S.online)S.queue.push({kind:"announce",key:"a"+Date.now(),at:Date.now()}); save(); render(); toast(t("savedOk")); };
KL.mtAdd=()=>{ if(!canPublish()){toast(t("noAccess"));return;} S.meetings.push({id:"m"+Date.now(),title:"Réunion parents — "+today(),date:today()+" 10:00",place:"Salle polyvalente",invited:30,confirmed:0}); save(); render(); };
KL.req=()=>toast(t("requestSent"));

/* ---------- FINANCES ---------- */
function vFin(){
  if(SERVER&&window.NORIA_GES) return NORIA_GES.fin(S);
  if(S.role==="parent"){ const kids=kidStudents();
    return `<h2 class="u6">${t("finance")}</h2>${kids.map(k=>{const d=feeDue(k);const ps=S.payments.filter(p=>p.studentId===k.id);return `<div class="u8 card"><h3>${esc(k.firstName)} ${esc(k.lastName)} — ${t("balance")}: <b>${money(d.rest)}</b></h3><div class="small mut">${t("paid")}: ${money(d.paid)} / ${money(d.due)}</div>${ps.map(p=>`<div class="small"> ${esc(p.date)} — ${money(p.amount)} (${esc(p.method)}, ${esc(p.ref)}) <button class="ghost" data-action="KL.receipt" data-a0="s:${esc(p.id)}">PDF</button></div>`).join("")}</div>`;}).join("")}<p class="small mut"> ${esc(t("noCard"))}</p>`; }
  if(!["direction","comptable"].includes(S.role)) return `<div class="badbox">${esc(t("noAccess"))}</div>`;
  const unp=S.students.map(s=>({s,d:feeDue(s)})).filter(x=>x.d.rest>0).slice(0,20);
  return `<div class="row sp"><h2 class="u6">${t("finance")}</h2><button data-action="KL.payModal">${t("newPayment")}</button></div>
  <p class="small mut"> ${esc(t("noCard"))}</p>
  <div class="grid g2"><div class="card"><h3>${t("feeConfig")}</h3>${Object.entries(S.fees).map(([k,f])=>`<div class="u9 small">${esc(k)} : <b>${money(f.tuition)}</b> <span class="mut">(${f.tranches.map(money).join(" + ")})</span></div>`).join("")}</div>
  <div class="card"><h3>${t("unpaid")} (${S.students.filter(s=>feeDue(s).rest>0).length})</h3>${unp.map(x=>`<div class="u9 small row sp"><span>${esc(x.s.firstName)} ${esc(x.s.lastName)} <span class="mut">${esc(x.s.code)}</span></span><b>${money(x.d.rest)}</b></div>`).join("")}</div></div>
  <div class="u3 card"><h3>${t("payments")} (${S.payments.length})</h3><div class="u7"><table><tr><th>${t("receipt")}</th><th>Élève</th><th>${t("amount")}</th><th>${t("method")}</th><th>${t("dueDate")}</th><th></th></tr>
  ${S.payments.slice().reverse().slice(0,15).map(p=>{const s=stuById(p.studentId);return `<tr><td class="small">${esc(p.ref)}</td><td>${esc(s?.firstName||"")} ${esc(s?.lastName||"")}</td><td><b>${money(p.amount)}</b></td><td class="small">${esc(p.method)}</td><td class="small">${esc(p.date)}</td><td><button class="ghost" data-action="KL.receipt" data-a0="s:${esc(p.id)}">${t("receipt")}</button></td></tr>`;}).join("")}</table></div></div><div id="payModal"></div>`;
}
function bFin(){}
KL.payModal=()=>{ if(!["direction","comptable"].includes(S.role)){toast(t("noAccess"));return;} $("#payModal").innerHTML=`<div class="modal"><div class="sheet"><h3>${t("newPayment")}</h3><div class="fld"><label>Élève</label><select id="p_s">${S.students.slice(0,40).map(s=>`<option value="${s.id}">${esc(s.firstName)} ${esc(s.lastName)} — ${esc(s.code)} (reste ${money(feeDue(s).rest)})</option>`).join("")}</select></div><div class="grid g2"><div class="fld"><label>${t("amount")} (G)</label><input id="p_a" type="number" value="8000"></div><div class="fld"><label>${t("method")}</label><select id="p_m"><option>Espèces</option><option>Chèque</option><option>Virement</option></select></div></div><div class="fld"><label>${t("reference")}</label><input id="p_r" value="REC-${String(S.paySeq).padStart(4,"0")}"></div><div class="row"><button data-action="KL.paySave">${t("save")}</button><button class="ghost" data-action="vider" data-a0="s:#payModal">${t("cancel")}</button></div></div></div>`; };
KL.paySave=()=>{ if(!["direction","comptable"].includes(S.role)){toast(t("noAccess"));return;} const sid=$("#p_s").value,am=+$("#p_a").value||0,m=$("#p_m").value,r=$("#p_r").value||("REC-"+S.paySeq);
  const id="p"+Date.now(); S.payments.push({id,studentId:sid,amount:am,method:m,ref:r,date:today(),by:S.role}); S.paySeq++; if(!S.online)S.queue.push({kind:"payment",key:id,at:Date.now()}); save(); document.querySelector("#payModal").innerHTML=""; render(); toast(t("payOk")); KL.receipt(id); };
KL.receipt=id=>{ const p=S.payments.find(x=>x.id===id); if(!p) return; if(denyLeak("recu",p.studentId)) return; const s=stuById(p.studentId); const d=feeDue(s);
  openPrint(`${t("receipt")} ${esc(p.ref)}`,`<div class="receipt"><h3>${esc(S.school.name)} — ${t("receipt")} ${esc(p.ref)}</h3><p>Élève: <b>${esc(s.firstName)} ${esc(s.lastName)}</b> (${esc(s.code)})<br>Montant: <b>${money(p.amount)}</b> • ${esc(p.method)} • ${esc(p.date)}<br>Payé total: ${money(d.paid)} • Reste: <b>${money(d.rest)}</b><br><span class="small mut">Reçu généré localement — paiement manuel vérifié par ${esc(p.by)}. Aucune donnée bancaire conservée.</span></p></div>`); };

/* ---------- BIBLIO ---------- */
function vLib(){
  if(SERVER&&window.NORIA_GES) return NORIA_GES.lib(S);
  const loanScope = (S.role==="parent"||S.role==="eleve") ? kidStudents().map(s=>s.id) : null;
  const loans = loanScope ? S.loans.filter(l=>loanScope.includes(l.studentId)) : S.loans;
  return `<div class="row sp"><h2 class="u6">${t("library")}</h2>${["direction","bibliothecaire"].includes(S.role)?`<button data-action="KL.bkModal">${t("newBook")}</button>`:""}</div>
  <div class="u8 grid g2"><div class="card"><h3>${t("catalog")} (${S.books.length})</h3>
  ${S.books.map(b=>`<div class="u15 row sp"><span><b>${esc(b.title)}</b><br><span class="mut small">${esc(b.author)} • ${esc(b.ref)} • </span><span class="badge ${b.available>0?"b-available":"b-borrowed"}">${b.available}/${b.copies} ${t("available")}</span></span><span class="row">${["direction","bibliothecaire"].includes(S.role)?`<button class="soft" data-action="KL.loan" data-a0="s:${esc(b.id)}" ${b.available<=0?"disabled":""}>${t("borrow")}</button>`:`<button class="ghost" data-action="KL.reserve" data-a0="s:${esc(b.id)}">${t("reserve")}</button>`}</span></div>`).join("")}</div>
  <div class="card"><h3>${t("loans")} (${loans.filter(l=>!l.back).length})</h3>${loans.slice().reverse().slice(0,12).map(l=>{const b=S.books.find(x=>x.id===l.bookId);const s=stuById(l.studentId);const late=!l.back&&l.due<today();return `<div class="u4 small"> <b>${esc(b?.title)}</b> → ${esc(s?.firstName)} ${esc(s?.lastName)} <span class="mut">(${esc(l.out)} → ${esc(l.due)})</span> ${late?`<span class="badge b-conflict">${t("delays")}</span>`:l.back?`<span class="badge b-synced">✓ ${esc(l.back)}</span>`:`<span class="badge b-borrowed">${t("borrowed")}</span>`} ${!l.back&&!l.lost&&["direction","bibliothecaire"].includes(S.role)?`<button class="ghost" data-action="KL.back" data-a0="s:${esc(l.id)}">${t("returnBtn")}</button>${!l.back?` <button class="ghost" data-action="KL.remind" data-a0="s:${esc(l.id)}">${S.lang==="ht"?"Make rapèl":"Marquer un rappel"}</button> <button class="ghost" data-action="KL.loanExt" data-a0="s:${esc(l.id)}">+7 j</button> <button class="ghost" data-action="KL.loanLost" data-a0="s:${esc(l.id)}">Perdu</button>`:""}${remHtml(l)}`:`${l.lost?` <span class="badge b-conflict">perdu</span>`:""}${remHtml(l)}`}</div>`;}).join("")||`<span class="mut small">${t("empty")}</span>`}</div></div>
  <div id="bkModal"></div>`;
}
function bLib(){}
function remHtml(l){ const r=l.reminded; if(!r) return ""; if(typeof r==="string") return ` <span class="badge b-pending"> ${esc(r)}</span>`;
  const b=r.st==="remis"?"b-synced":r.st==="echec"?"b-conflict":"b-pending"; return ` <span class="badge ${b}"> ${esc(r.date)} • ${esc(r.canal)} • ${esc(r.st)}</span>`; }
KL.bkModal=()=>{ $("#bkModal").innerHTML=`<div class="modal"><div class="sheet"><h3>${t("newBook")}</h3><div class="fld"><label>${t("bookTitle")}</label><input id="b_t"></div><div class="fld"><label>${t("author")}</label><input id="b_a"></div><div class="fld"><label>${t("copies")}</label><input id="b_c" type="number" value="3"></div><div class="row"><button data-action="KL.bkSave">${t("save")}</button><button class="ghost" data-action="vider" data-a0="s:#bkModal">${t("cancel")}</button></div></div></div>`; };
KL.bkSave=()=>{ if(!["direction","bibliothecaire"].includes(S.role)){toast(t("noAccess"));return;} const n=($("#b_t").value||"Livre").trim(); S.books.push({id:"bk"+Date.now(),title:n,author:$("#b_a").value||"—",copies:+$("#b_c").value||1,available:+$("#b_c").value||1,ref:"LOC-"+S.books.length}); save(); render(); toast(t("savedOk")); };
KL.loanFor=(bid,sid)=>{ if(!["direction","bibliothecaire"].includes(S.role)){ toast(t("noAccess")); return false; }
  const b=S.books.find(x=>x.id===bid); if(!b||b.available<=0) return false;
  const lim = S.bibLimit||1;
  if(S.loans.filter(l=>l.studentId===sid&&!l.back).length>=lim){ toast((S.lang==="ht"?"Limit : ":"Limite : ")+lim+(S.lang==="ht"?" liv (lekòl la ka chanje sa)":" livre(s) — réglable par l'école")); return false; }
  b.available--; const dd=new Date(); dd.setDate(dd.getDate()+(S.loanDays||14)); S.loans.push({id:"l"+Date.now(),bookId:bid,studentId:sid,out:today(),due:dd.toISOString().slice(0,10),back:null,reminded:null}); if(!S.online)S.queue.push({kind:"loan",key:bid+Date.now(),at:Date.now()}); save(); render(); toast(t("loanOk")); return true; };
KL.loan=bid=>{ const who = S.role==="parent" ? S.currentUser.parentKids[0] : S.role==="eleve" ? S.currentUser.studentId : S.students[0].id; return KL.loanFor(bid, who); };
KL.back=lid=>{ if(!["direction","bibliothecaire"].includes(S.role)){toast(t("noAccess"));return;} const l=S.loans.find(x=>x.id===lid); l.back=today(); const b=S.books.find(x=>x.id===l.bookId); b.available=Math.min(b.copies,b.available+1); save(); render(); toast(t("returnOk")); };
KL.remind=lid=>{ if(!["direction","bibliothecaire"].includes(S.role)){toast(t("noAccess"));return;} const l=S.loans.find(x=>x.id===lid); if(!l||l.back) return; l.reminded=today(); save(); render(); toast(t("savedOk")); };
KL.reserve=bid=>toast(t("requestSent"));

/* ---------- RAPPORTS ---------- */
function vRep(){
  if(SERVER&&window.NORIA_TAB) return NORIA_TAB.rep(S);
  const finOk=["direction","comptable"].includes(S.role);
  const classes=S.role==="enseignant"?S.classes.filter(c=>teacherOwns(c.id)):S.classes;
  const byClass=classes.map(c=>{const st=S.students.filter(s=>s.classId===c.id);const keys=Object.entries(S.attendance).filter(([k,a])=>a.classId===c.id);const all=keys.flatMap(([k,a])=>Object.values(a.records));const r=all.length?Math.round(all.filter(x=>x==="P").length/all.length*100):100;return {c,n:st.length,r};});
  const coll=S.payments.reduce((a,p)=>a+ +p.amount,0);
  return `<h2 class="u6">${t("reports")}</h2><div class="u8 grid g2">
  <div class="card"><h3>${t("enrol")} / ${t("absByClass")}</h3>${byClass.map(x=>`<div class="u9 small">${esc(x.c.name)} : <b>${x.n}</b> élèves • ${x.r}% ${t("present")}</div>`).join("")}</div>
  ${finOk?`<div class="card"><h3>${t("feeStatus")}</h3><div class="small">${t("feesCollected")}: <b>${money(coll)}</b><br>${t("unpaid")}: <b>${S.students.filter(s=>feeDue(s).rest>0).length}</b> élèves</div><div class="toolbar"><button class="ghost" data-action="KL.csvPay">${t("export")} CSV</button></div></div>`:`<div class="card"><h3>${t("feeStatus")}</h3><p class="small mut"> ${S.lang==="ht"?"Rezève pou direksyon ak kontabilite.":"Réservé à la direction et à la comptabilité."}</p></div>`}
  <div class="card"><h3>${t("avgByClass")}</h3>${classes.map(c=>{const pe=S.evals.filter(e=>e.classId===c.id&&e.status==="published");const vs=pe.flatMap(e=>Object.values(S.grades[e.id]||{}));const m=vs.length?(vs.reduce((a,b)=>a+(+b||0),0)/vs.length).toFixed(1):"—";return `<div class="small">${esc(c.name)} : <b>${m}</b>${vs.length?"":" <span class='mut'>("+(S.lang==="ht"?"okenn nòt pibliye":"aucune note publiée")+")</span>"}</div>`;}).join("")}</div>
  <div class="card"><h3>${t("exportLog")}</h3>${S.exportLog.slice(0,8).map(e=>`<div class="small">${esc(e.date)} — ${esc(e.by)} — ${esc(e.kind)} : ${esc(e.detail)}</div>`).join("")||`<span class="mut small">${t("empty")}</span>`}<div class="toolbar"><button class="ghost" data-action="KL.csvStu">${t("students")} CSV</button>${S.role==="direction"?`<button class="ghost" data-action="KL.allJSON">${t("exportAll")}</button>`:""}</div></div></div>
  <p class="small mut">${esc(t("menfpNote"))}</p>`;
}
KL.csvPay=()=>{ if(SERVER&&window.NORIA_TAB){ NORIA_TAB.exportFinance(); return; } if(!["direction","comptable"].includes(S.role)){toast(t("noAccess"));return;} dl("paiements.csv","\uFEFF"+toCSV([["recu","eleve","montant","mode","date"],...S.payments.map(p=>{const s=stuById(p.studentId);return [p.ref,(s?.firstName||"")+" "+(s?.lastName||""),p.amount,p.method,p.date];})]),"text/csv"); logExport("CSV","paiements"); };
KL.csvStu=()=>KL.stuCSV();
KL.allJSON=()=>{ if(S.role!=="direction"){toast(t("noAccess"));return;} dl("klirline-export.json",JSON.stringify(S,null,2),"application/json"); logExport("JSON","export complet"); toast(t("savedOk")); };

/* ---------- PARAMETRES ---------- */
function vSet(){
  if(SERVER&&window.NORIA_TAB) return NORIA_TAB.settings(S);
  const mat=[["direction","Tout établissement"],["secretariat","Dossiers nécessaires"],["enseignant","Classes attribuées"],["comptable","Finances uniquement"],["bibliothecaire","Bibliothèque"],["parent","Enfants reliés"],["eleve","Ses infos"]];
  return `<h2 class="u6">${t("settings")}</h2><div class="u8 grid g2">
  <div class="card"><h3>${t("yearConfig")}</h3><div class="fld"><label>${t("schoolYear")}</label><select data-action-change="KL.setYear" data-a0="v">${S.years.map(y=>`<option ${y===S.year?"selected":""}>${y}</option>`).join("")}</select></div><div class="small mut">Périodes: ${S.periods.join(", ")} • Passage: ${S.scale.pass}/${S.scale.max}</div>
  <div class="toolbar"><button class="ghost" data-action="print">${t("printCal")}</button></div></div>
  <div class="card"><h3>${t("calendar")}</h3>${S.calendar.map(k=>`<div class="u9 small row sp"><span><b>${esc(k.name)}</b> <span class="mut">${esc(k.start)} → ${esc(k.end)} • ${t(k.type)||k.type}</span></span>${["direction"].includes(S.role)?`<button class="ghost" data-action="KL.calDel" data-a0="s:${esc(k.id)}">Supprimer</button>`:""}</div>`).join("")}
  ${["direction"].includes(S.role)?`<div class="toolbar"><input id="calN" placeholder="${t("eventName")}" class="u16"><input id="calS" type="date" value="${today()}"><button data-action="KL.calAdd">${t("addEvent")}</button></div>`:""}</div>
  <div class="card"><h3>${t("users")}</h3><table>${mat.map(m=>`<tr><td><b>${m[0]}</b></td><td class="small">${m[1]}</td></tr>`).join("")}</table><p class="small mut">Matrice visée pour le futur serveur. Dans cette démonstration, le menu de profil ne protège aucun dossier : tout reste sur cet appareil.</p></div>
  <div class="card"><h3> ${t("library")} — réglage d'école</h3><div class="small">Limite de livres simultanés par élève : <b>${S.bibLimit||1}</b> <span class="mut">(initial : 1, modifiable)</span><br>Durée d'un prêt : <b>${S.loanDays||14}</b> jours <span class="mut">(échéance = sortie + durée)</span></div>${["direction"].includes(S.role)?`<div class="toolbar"><input id="bibLim" type="number" min="1" max="10" value="${S.bibLimit||1}" class="u17"><input id="loanDays" type="number" min="1" max="90" value="${S.loanDays||14}" class="u17"><button data-action="KL.setBibLimit">${t("save")}</button></div>`:""}</div>
  <div class="card"><h3> Langues</h3><div class="row"><button class="${S.lang==="fr"?"":"ghost"}" data-action="KL.lang" data-a0="s:fr">Français</button><button class="${S.lang==="ht"?"":"ghost"}" data-action="KL.lang" data-a0="s:ht">Kreyòl</button></div><p class="small mut">Interface, erreurs, reçus et relevés bilingues.</p><h3 class="u3"> ${t("danger")}</h3><div class="toolbar">${S.role==="direction"?`<button class="ghost" data-action="KL.allJSON">${t("exportAll")}</button>`:""}<button class="warn" data-action="KL.reset">${t("demoReset")}</button></div></div></div>`;
}
function bSet(){}
KL.calAdd=()=>{ if(S.role!=="direction"){toast(t("noAccess"));return;} const n=$("#calN").value||"Événement"; S.calendar.push({id:"k"+Date.now(),name:n,start:$("#calS").value||today(),end:$("#calS").value||today(),type:"meeting"}); save(); render(); };
KL.calDel=id=>{ if(S.role!=="direction"){toast(t("noAccess"));return;} S.calendar=S.calendar.filter(k=>k.id!==id); save(); render(); };
KL.setYear=y=>{ if(S.role!=="direction"){toast(t("noAccess"));return;} S.year=y; save(); render(); };
KL.setBibLimit=()=>{ if(S.role!=="direction") return; S.bibLimit=Math.max(1,Math.min(10,+document.querySelector("#bibLim").value||1)); S.loanDays=Math.max(1,Math.min(90,+document.querySelector("#loanDays").value||14)); save(); render(); toast(t("savedOk")); };
KL.reset=()=>{ if(!confirm("Réinitialiser la démo ?"))return; try{localStorage.removeItem(LS);localStorage.removeItem("klirline_v1");}catch(e){} load(); ROUTE="dashboard"; render(); };

/* ---------- misc ---------- */
function openPrint(title,html){ const w=document.createElement("div"); w.innerHTML=`<div class="modal"><div class="sheet"><div class="noprint row sp"><b>${esc(title)}</b><span class="row"><button data-action="print">${t("print")}</button><button class="ghost" data-action="retirer" data-a0="s:.modal">${t("close")}</button></span></div><div>${html}</div></div></div>`; document.body.appendChild(w); }
KL.go=m=>{ROUTE=m;render();};
KL.refreshNav=function(){ renderShell(); };
KL.lang=l=>{S.lang=l;save();render();};
KL.role=r=>{ if(SERVER){ toast(S.lang==="ht"?"Wòl la soti nan sèvè a.":"Le rôle vient du serveur."); return; } S.role=r;ROUTE="dashboard";save();render();};
const ROLE_MAP={direction:"direction",secretariat:"secretariat",enseignant:"enseignant",comptabilite:"comptable",bibliotheque:"bibliothecaire",parent:"parent",eleve:"eleve"};
const ROLE_ORDER=["direction","secretariat","enseignant","comptabilite","bibliotheque","parent","eleve"];
// Reçoit les données du serveur et les met en mémoire (jamais dans localStorage).
function stuFromServer(x,byId){ const c=byId[x.class_id]; return {id:"s"+x.id,serverId:x.id,code:x.code,firstName:x.first_name,lastName:x.last_name,sex:x.sex||"",birth:x.birth_date||"",level:c?c.level:"",classId:c?c.id:"",campus:c?c.campus:"",status:"inscrit",guardians:[],siblings:[],address:"",year:S.year}; }
// Remplace la liste des élèves (après un import) sans changer d'écran.
KL.refresh=()=>render();
KL.setStudents=list=>{ if(!S||!Array.isArray(list)) return; const byId=Object.fromEntries(S.classes.filter(c=>c.serverId).map(c=>[c.serverId,c])); S.students=list.map(x=>stuFromServer(x,byId)); };
KL.applyServer=d=>{
  if(!S) load();
  const cls=d.classes.map(c=>({id:"c"+c.id,serverId:c.id,name:c.name,level:c.level,campus:c.campus,teacherId:null,room:c.room||"—"}));
  const byId=Object.fromEntries(cls.map(c=>[c.serverId,c]));
  const stu=d.students.map(x=>stuFromServer(x,byId));
  const role=ROLE_ORDER.find(r=>d.me.roles.includes(r))||"eleve";
  SERVER={me:d.me}; if(window.NORIA_SCO) NORIA_SCO.reset(); if(window.NORIA_GES) NORIA_GES.reset(); if(window.NORIA_TAB) NORIA_TAB.reset();
  // Lot 1 : aucune donnée de démonstration après connexion (paiements, prêts, annonces, présences locales, file d'attente).
  Object.assign(S,{payments:[],loans:[],announces:[],queue:[],attendance:{},staff:[],calendar:[]});
  S.role=ROLE_MAP[role]; S.students=stu; S.classes=cls;
  S.currentUser=Object.assign({},S.currentUser,{name:d.me.name,parentKids:stu.map(x=>x.id),studentId:stu[0]?.id||null});
  ROUTE="dashboard"; render();
};
KL.serverMode=()=>!!SERVER;
KL.can=m=>can(m); // utilisé par tableau.js (boutons « prochaine action » selon les droits)
// Après une modification de la structure (structure.js) : relit les classes actives du serveur.
KL.reloadClasses=async()=>{ if(!SERVER) return; try{ const r=await fetch("/api/classes",{credentials:"same-origin",cache:"no-store"}); if(!r.ok) return; const d=await r.json();
  const old=Object.fromEntries(S.classes.map(c=>[c.serverId,c])); S.classes=d.map(c=>Object.assign(old[c.id]||{},{id:"c"+c.id,serverId:c.id,name:c.name,level:c.level,campus:c.campus,teacherId:null,room:c.room||"—"})); }catch(e){} };
if(window.NORIA_OFF) NORIA_OFF.onChange(onOfflineChange);
// En mode serveur, les modules additionnels lisent l'état en mémoire (rôle et élèves du serveur) au lieu de localStorage.
KL.serverState=()=>SERVER?S:null;
KL.conn=()=>{S.online=!S.online;save();render();toast(S.online?t("online"):t("offlineNote"));};
KL.sync=()=>{ if(!S.online){toast(t("offline"));return;} const n=S.queue.length; S.queue=[]; Object.values(S.attendance).forEach(a=>{if(a.sync==="pending")a.sync="synced";}); save(); render(); toast(t("syncedOk")+(n?` (${n})`:"")); };
function boot(){ if(window.NORIA_SCO) NORIA_SCO.bind(()=>{ if(SERVER) render(); }); if(window.NORIA_GES) NORIA_GES.bind(()=>{ if(SERVER) render(); }); if(window.NORIA_TAB) NORIA_TAB.bind(()=>{ if(SERVER) render(); }); try{ load(); render(); }catch(e){ console.error(e); } }
if(document.readyState!=="loading") boot(); else document.addEventListener("DOMContentLoaded",boot);
window.KL=KL;
})();

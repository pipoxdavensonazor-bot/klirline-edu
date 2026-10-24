/* NORIA — lot 1 : après connexion, aucun chiffre de démonstration. Tableau de bord par rôle, rapports et paramètres
   calculés sur l'API (/api/tableau-de-bord, /api/rapports, /api/announcements) ; exports CSV produits et journalisés
   par le serveur (/api/export/…) ; états vides avec la prochaine action utile. Le mode démo (sans serveur) est inchangé.
   La gestion de la structure (classes, niveaux, périodes, matières, enseignants) est chargée à la demande (structure.js). */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{hello:"Aujourd'hui",students:"Élèves",classes:"Classes",rollToday:"Appel du jour",att30:"Présence (30 jours)",collected:"Encaissé",balance:"Reste à encaisser",loans:"Prêts en cours",late:"en retard",
    start:"Commencez par créer vos classes",startHelp:"L'assistant prépare l'année scolaire, les trimestres, les niveaux (modèle haïtien modifiable), les classes et les matières. Vous pourrez tout modifier ensuite.",
    openWizard:"Ouvrir l'assistant",steps:"Mise en route de l'école",stYear:"Année scolaire et trimestres",stLevels:"Niveaux",stClasses:"Classes",stSubjects:"Matières",stTeachers:"Enseignants affectés à leurs classes",stStudents:"Élèves importés",
    go:"Ouvrir",done:"Fait",todo:"À faire",toDo:"À faire maintenant",noRoll:n=>`${n} classe(s) sans appel aujourd'hui`,toPublish:n=>`${n} évaluation(s) soumise(s) à publier`,unassigned:n=>`${n} enseignant(s) sans classe`,noClass:n=>`${n} élève(s) sans classe`,
    allGood:"Rien d'urgent pour l'instant.",ann:"Dernières annonces",noAnn:"Aucune annonce publiée.",annGo:"Communications",myClasses:"Mes classes",roll:"Faire l'appel",grades:"Notes",drafts:"Évaluations en brouillon",
    noTeach:"Aucune classe ne vous est encore attribuée.",noTeachHelp:"La direction vous affecte vos classes et matières dans « Classes → Enseignants ». Elles apparaîtront ici.",
    kids:"Mes enfants",noKids:"Aucun enfant n'est encore lié à votre compte.",noKidsHelp:"L'école relie votre compte à votre enfant (invitation ou import de la liste des élèves). Contactez le secrétariat.",
    abs30:"absences (30 j)",lates30:"retards (30 j)",pubGrades:"notes publiées",bal:"Solde",att:"Présences",fin:"Finances",lib:"Bibliothèque",cls:"Classe",noCls:"classe non attribuée",
    me:"Mon espace",unpaid:n=>`${n} élève(s) avec un solde dû`,noFees:"Aucun frais enregistré pour l'instant.",noFeesHelp:"Ajoutez les frais de scolarité de chaque élève dans Finances.",
    titles:"Titres au catalogue",noBooks:"Catalogue vide : ajoutez vos livres dans Bibliothèque.",loading:"Chargement…",off:"Hors ligne : dernière copie connue.",err:"Données indisponibles pour l'instant.",
    rep:"Rapports",period:(a,b)=>`Période : du ${a} au ${b}`,byClass:"Par classe",enrol:"Élèves",rate:"Présence",absences:"Absences",avg:"Moyenne (notes publiées)",noData:"—",
    noRepCls:"Aucune classe : créez d'abord vos classes.",finRep:"Frais et paiements",due:"Total dû",paid:"Encaissé",method:"Paiements de la période",libRep:"Bibliothèque",
    exp:"Exports (produits et journalisés par le serveur)",expStu:"Élèves (CSV)",expFin:"Finances (CSV)",expLog:"Journal des exports",noExp:"Aucun export pour l'instant.",refused:"refusé",
    exported:"Fichier téléchargé (export journalisé).",needNet:"Réseau nécessaire pour cette action.",net:"Réseau indisponible.",refusedMsg:"Refusé : ",
    m:{especes:"Espèces",moncash:"MonCash",natcash:"NatCash",virement:"Virement"},
    set:"Paramètres",langT:"Langue",langH:"Interface en français ou en kreyòl (préférence de cet appareil).",structT:"Structure de l'école",structH:"Année scolaire, trimestres, niveaux, classes, matières et enseignants.",
    structGo:"Gérer la structure",calT:"Calendrier",calH:"Les événements de l'école se publient dans Communications (visibles par les familles concernées).",
    libT:"Bibliothèque",libH:"Durée d'un prêt : 14 jours ; 3 prêts en cours au plus par élève. Valeurs fixées par le serveur (réglage par école prévu plus tard).",
    rolesT:"Droits par rôle",rolesH:"Information : ces règles sont appliquées par le serveur, quel que soit l'appareil.",
    roles:[["Direction","toute l'école"],["Secrétariat","dossiers des élèves, présences, comptes"],["Enseignant","ses classes affectées"],["Comptabilité","finances seulement"],["Bibliothèque","catalogue et prêts"],["Parent","ses enfants reliés"],["Élève","ses propres informations"]],
    importGo:"Importer des élèves",noStu:"Aucun élève pour l'instant.",noStuHelp:"Ajoutez un élève avec « Ajouter un élève », ou importez la liste de la classe (Excel ou CSV).",classesGo:"Créer les classes",
    noClasses:"Aucune classe pour l'instant.",noClassesHelp:"La direction crée les classes dans « Classes ».",info:"information"},
  ht:{hello:"Jodi a",students:"Elèv",classes:"Klas",rollToday:"Apèl jodi a",att30:"Prezans (30 jou)",collected:"Lajan ki rantre",balance:"Sa ki rete pou rantre",loans:"Liv ki prete",late:"an reta",
    start:"Kòmanse pa kreye klas ou yo",startHelp:"Asistan an prepare ane lekòl la, trimès yo, nivo yo (modèl ayisyen ou ka chanje), klas yo ak matyè yo. W ap ka chanje tout bagay apre.",
    openWizard:"Louvri asistan an",steps:"Mete lekòl la sou pye",stYear:"Ane lekòl ak trimès",stLevels:"Nivo",stClasses:"Klas",stSubjects:"Matyè",stTeachers:"Pwofesè ki gen klas yo",stStudents:"Elèv ki enpòte",
    go:"Louvri",done:"Fini",todo:"Pou fè",toDo:"Pou fè kounye a",noRoll:n=>`${n} klas ki poko fè apèl jodi a`,toPublish:n=>`${n} evalyasyon ki tann pou pibliye`,unassigned:n=>`${n} pwofesè ki pa gen klas`,noClass:n=>`${n} elèv ki pa gen klas`,
    allGood:"Pa gen anyen ki prese kounye a.",ann:"Dènye anons yo",noAnn:"Poko gen anons.",annGo:"Kominikasyon",myClasses:"Klas mwen yo",roll:"Fè apèl",grades:"Nòt",drafts:"Evalyasyon ki an bouyon",
    noTeach:"Poko gen klas ki ba ou.",noTeachHelp:"Direksyon an ba ou klas ak matyè ou nan « Klas → Pwofesè ». Y ap parèt la a.",
    kids:"Pitit mwen yo",noKids:"Poko gen pitit ki lye ak kont ou.",noKidsHelp:"Lekòl la lye kont ou ak pitit ou (envitasyon oswa enpòtasyon lis elèv yo). Kontakte sekretarya a.",
    abs30:"absans (30 j)",lates30:"reta (30 j)",pubGrades:"nòt ki pibliye",bal:"Sa ki rete",att:"Prezans",fin:"Finans",lib:"Bibliyotèk",cls:"Klas",noCls:"poko gen klas",
    me:"Espas mwen",unpaid:n=>`${n} elèv ki dwe lajan`,noFees:"Poko gen frè ki anrejistre.",noFeesHelp:"Ajoute frè lekòl chak elèv nan Finans.",
    titles:"Tit nan katalòg la",noBooks:"Katalòg la vid : ajoute liv ou yo nan Bibliyotèk.",loading:"Ap chaje…",off:"San entènèt : se dènye kopi nou te genyen an.",err:"Done yo pa disponib kounye a.",
    rep:"Rapò",period:(a,b)=>`Peryòd : depi ${a} rive ${b}`,byClass:"Pa klas",enrol:"Elèv",rate:"Prezans",absences:"Absans",avg:"Mwayèn (nòt ki pibliye)",noData:"—",
    noRepCls:"Pa gen klas : kreye klas ou yo anvan.",finRep:"Frè ak peman",due:"Total pou peye",paid:"Lajan ki rantre",method:"Peman nan peryòd la",libRep:"Bibliyotèk",
    exp:"Ekspòtasyon (sèvè a fè yo epi li note yo)",expStu:"Elèv (CSV)",expFin:"Finans (CSV)",expLog:"Jounal ekspòtasyon",noExp:"Poko gen ekspòtasyon.",refused:"refize",
    exported:"Fichye a telechaje (ekspòtasyon an note).",needNet:"Fò gen rezo pou aksyon sa a.",net:"Rezo a pa disponib.",refusedMsg:"Refize : ",
    m:{especes:"Lajan kach",moncash:"MonCash",natcash:"NatCash",virement:"Virman"},
    set:"Paramèt",langT:"Lang",langH:"Entèfas an fransè oswa an kreyòl (preferans aparèy sa a).",structT:"Estrikti lekòl la",structH:"Ane lekòl, trimès, nivo, klas, matyè ak pwofesè.",
    structGo:"Jere estrikti a",calT:"Kalandriye",calH:"Evènman lekòl la pibliye nan Kominikasyon (fanmi ki konsène yo wè yo).",
    libT:"Bibliyotèk",libH:"Yon prè dire 14 jou ; 3 prè an menm tan pou chak elèv. Se sèvè a ki fikse valè sa yo (y ap ka chanje pa lekòl pita).",
    rolesT:"Dwa chak wòl",rolesH:"Enfòmasyon : se sèvè a ki aplike règ sa yo, kèlkeswa aparèy la.",
    roles:[["Direksyon","tout lekòl la"],["Sekretarya","dosye elèv, prezans, kont"],["Pwofesè","klas yo ba li"],["Kontablite","finans sèlman"],["Bibliyotèk","katalòg ak prè"],["Paran","pitit ki lye ak li"],["Elèv","pwòp enfòmasyon li"]],
    importGo:"Enpòte elèv",noStu:"Poko gen elèv.",noStuHelp:"Ajoute yon elèv ak « Ajoute yon elèv », oswa enpòte lis klas la (Excel oswa CSV).",classesGo:"Kreye klas yo",
    noClasses:"Poko gen klas.",noClassesHelp:"Direksyon an kreye klas yo nan « Klas ».",info:"enfòmasyon"},
};
const t=k=>T[lang()][k];
const C={}; // cache des GET : {v, at}
let S=null, rerender=()=>{};
const has=(...r)=>S&&r.includes(S.role);
const toast=m=>{ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),3500); };
function get(path,maxAge){
  const e=C[path]; const fresh=e&&(Date.now()-e.at)<(maxAge||20000);
  if(!e||(!fresh&&!e.busy)){
    C[path]=Object.assign(e||{v:undefined},{busy:true,at:e?e.at:0});
    (async()=>{
      let v=null;
      if(navigator.onLine){ try{ const r=await fetch(path,{credentials:"same-origin",cache:"no-store"}); if(r.ok){ v=await r.json(); window.NORIA_OFF&&NORIA_OFF.putCache("tab:"+path,v); } else v={__err:r.status}; }catch(x){} }
      if(v==null&&window.NORIA_OFF){ const c=await NORIA_OFF.getCache("tab:"+path); if(c!=null) v=Array.isArray(c)?Object.assign(c.slice(),{__stale:1}):{...c,__stale:1}; }
      C[path]={v:v==null?{__err:0}:v,at:Date.now(),busy:false}; rerender();
    })();
  }
  return C[path].v;
}
const ok=v=>v!==undefined&&v!==null&&!v.__err;
const money=n=>Number(n||0).toLocaleString("fr-FR",{maximumFractionDigits:2}).replace(/\u202f|,/g," ")+" HTG";
const kpi=(n,l,cls)=>`<div class="card${cls?" "+cls:""}"><div class="kpi">${esc(n)}</div><div class="kpi-sub">${esc(l)}</div></div>`;
const go=(m,l,cls)=>`<button class="${cls||"ghost"}" data-action="KL.go" data-a0="s:${esc(m)}">${esc(l)}</button>`;
const wait=()=>`<p class="mut small">${esc(t("loading"))}</p>`;
const stale=v=>v&&v.__stale?`<p class="small mut">${esc(t("off"))}</p>`:"";
const can=m=>!!(window.KL&&KL.can&&KL.can(m));

function annCard(){
  const an=get("/api/announcements");
  const list=ok(an)?an.slice(0,3):null;
  return `<div class="card"><h3>${esc(t("ann"))}</h3>${list==null?wait():list.length?list.map(a=>`<div class="u14"><b>${esc(a.title)}</b> <span class="small mut">· ${esc(String(a.created_at||"").slice(0,10))}</span><div class="small">${esc(String(a.body||"").slice(0,160))}</div></div>`).join(""):`<p class="small mut">${esc(t("noAnn"))}</p>`}
    ${can("comms")?`<div class="toolbar">${go("comms",t("annGo"))}</div>`:""}</div>`;
}
function checklist(s){
  const it=(okv,label,m,btn)=>`<li class="tab-step ${okv?"is-done":"is-todo"}"><span class="badge ${okv?"b-paid":"b-pending"}">${esc(okv?t("done"):t("todo"))}</span> ${esc(label)}${!okv&&m&&can(m)?` ${go(m,btn||t("go"),"soft")}`:""}</li>`;
  return `<div class="card"><h3>${esc(t("steps"))}</h3><ul class="tab-steps">
    ${it(s.year&&s.terms>0,t("stYear")+(s.year?` (${s.year})`:""),"classes")}${it(s.levels>0,t("stLevels"),"classes")}${it(s.classes>0,t("stClasses"),"classes")}
    ${it(s.subjects>0,t("stSubjects"),"classes")}${it(s.teachers>0&&s.unassigned_teachers===0,t("stTeachers"),s.teachers?"classes":"accounts")}${it(s.students>0,t("stStudents"),"importEleves",t("importGo"))}</ul></div>`;
}
function dash(state){
  S=state;
  const d=get("/api/tableau-de-bord");
  if(d===undefined) return wait();
  if(!ok(d)) return `<div class="badbox">${esc(t("err"))}</div>`;
  let h=stale(d);
  if(d.structure){ // direction, secrétariat
    const s=d.structure;
    if(!s.classes){
      h+=`<section class="card tab-start"><h2 class="u6">${esc(t("start"))}</h2><p>${esc(t("startHelp"))}</p>${can("classes")?`<div class="toolbar">${go("classes",t("openWizard"),"")}</div>`:""}</section><div class="u3 grid g2">${checklist(s)}${annCard()}</div>`;
      return h;
    }
    const a=d.attendance||{};
    h+=`<div class="grid g4">${kpi(s.students,t("students"))}${kpi(s.classes,t("classes"))}${kpi(`${a.done_today||0} / ${a.classes||0}`,t("rollToday"))}${kpi(a.rate==null?"—":a.rate+" %",t("att30"))}</div>`;
    if(d.finance||d.library) h+=`<div class="u3 grid g4">${d.finance?kpi(money(d.finance.paid_htg),t("collected"))+kpi(money(d.finance.balance_htg),t("balance")):""}${d.library?kpi(`${d.library.open_loans}`,t("loans")+(d.library.late_loans?` · ${d.library.late_loans} ${t("late")}`:"")):""}</div>`;
    const todo=[];
    const noRoll=(d.classes||[]).filter(c=>!c.done_today&&c.students>0);
    if(noRoll.length) todo.push(`${esc(t("noRoll")(noRoll.length))} <span class="small mut">(${noRoll.slice(0,6).map(c=>esc(c.name)).join(", ")}${noRoll.length>6?"…":""})</span> ${go("attendance",t("roll"),"soft")}`);
    if(d.to_publish) todo.push(`${esc(t("toPublish")(d.to_publish))} ${go("academic",t("grades"),"soft")}`);
    if(s.unassigned_teachers) todo.push(`${esc(t("unassigned")(s.unassigned_teachers))} ${go("classes",t("go"),"soft")}`);
    if(s.students_without_class) todo.push(`${esc(t("noClass")(s.students_without_class))}`);
    h+=`<div class="u3 grid g2"><div class="card"><h3>${esc(t("toDo"))}</h3>${todo.length?`<ul class="tab-todo">${todo.map(x=>`<li>${x}</li>`).join("")}</ul>`:`<p class="small mut">${esc(t("allGood"))}</p>`}</div>${annCard()}</div>`;
    if(!s.students||!s.subjects||!s.terms||s.unassigned_teachers||!s.teachers) h+=`<div class="u3">${checklist(s)}</div>`;
    return h;
  }
  if(has("enseignant")){
    const cl=d.classes||[];
    if(!cl.length) return h+`<section class="card tab-start"><h2 class="u6">${esc(t("noTeach"))}</h2><p>${esc(t("noTeachHelp"))}</p></section><div class="u3">${annCard()}</div>`;
    const a=d.attendance||{};
    h+=`<div class="grid g3">${kpi(cl.length,t("myClasses"))}${kpi(`${a.done_today||0} / ${a.classes||0}`,t("rollToday"))}${kpi(d.drafts||0,t("drafts"))}</div>`;
    h+=`<div class="u3 grid g2"><div class="card"><h3>${esc(t("myClasses"))}</h3>${cl.map(c=>`<div class="row sp u14"><span><b>${esc(c.name)}</b> <span class="small mut">${esc(c.level||"")}${c.room?" · "+esc(c.room):""} · ${c.students} ${esc(t("students").toLowerCase())}</span></span>
      <span class="row">${c.done_today?`<span class="badge b-paid">${esc(t("done"))}</span>`:""}<button class="soft" data-action="KL.attGo" data-a0="s:c${Number(c.id)}">${esc(t("roll"))}</button>${go("academic",t("grades"))}</span></div>`).join("")}</div>${annCard()}</div>`;
    return h;
  }
  if(d.kids){
    if(!d.kids.length) return h+`<section class="card tab-start"><h2 class="u6">${esc(t("noKids"))}</h2><p>${esc(t("noKidsHelp"))}</p></section><div class="u3">${annCard()}</div>`;
    const parent=has("parent");
    h+=`<h2 class="u6">${esc(parent?t("kids"):t("me"))}</h2><div class="u8 grid g3">${d.kids.map(k=>`<div class="card"><h3>${esc(k.first_name)} ${esc(k.last_name)} <span class="small mut">${esc(k.code)}</span></h3>
      <div class="small mut">${esc(t("cls"))} : ${esc(k.class||t("noCls"))}</div>
      <div class="small u8">${k.absences_30d} ${esc(t("abs30"))} · ${k.lates_30d} ${esc(t("lates30"))} · ${k.published_grades} ${esc(t("pubGrades"))}</div>
      ${k.balance_htg!=null&&k.balance_htg>0?`<div class="u8"><span class="badge b-unpaid">${esc(t("bal"))} : ${esc(money(k.balance_htg))}</span></div>`:""}
      <div class="toolbar">${can("attendance")?go("attendance",t("att")):""}${go("academic",t("grades"))}${parent&&can("finance")?go("finance",t("fin")):""}</div></div>`).join("")}</div><div class="u3">${annCard()}</div>`;
    return h;
  }
  // Comptabilité, bibliothèque.
  let blocks="";
  if(d.finance){ const f=d.finance;
    blocks+=f.fees?`<div class="grid g3">${kpi(money(f.due_htg),t("due"))}${kpi(money(f.paid_htg),t("collected"))}${kpi(money(f.balance_htg),t("balance"))}</div><div class="card u3"><p>${esc(t("unpaid")(f.unpaid_students))}</p><div class="toolbar">${go("finance",t("fin"),"")}</div></div>`
      :`<section class="card tab-start"><h2 class="u6">${esc(t("noFees"))}</h2><p>${esc(t("noFeesHelp"))}</p><div class="toolbar">${go("finance",t("fin"),"")}</div></section>`; }
  if(d.library){ const l=d.library;
    blocks+=l.titles?`<div class="u3 grid g3">${kpi(l.titles,t("titles"))}${kpi(l.open_loans,t("loans"))}${kpi(l.late_loans,t("late"))}</div><div class="toolbar">${go("library",t("lib"),"")}</div>`
      :`<section class="card tab-start u3"><h2 class="u6">${esc(t("noBooks"))}</h2><div class="toolbar">${go("library",t("lib"),"")}</div></section>`; }
  return h+blocks+`<div class="u3">${annCard()}</div>`;
}

/* ---------- rapports ---------- */
function rep(state){
  S=state;
  const r=get("/api/rapports");
  if(r===undefined) return `<h2 class="u6">${esc(t("rep"))}</h2>`+wait();
  if(!ok(r)) return `<h2 class="u6">${esc(t("rep"))}</h2><div class="badbox">${esc(t("err"))}</div>`;
  let h=`<h2 class="u6">${esc(t("rep"))}</h2><p class="small mut">${esc(t("period")(r.from,r.to))}${r.year?` · ${esc(r.year)}`:""}</p>${stale(r)}<div class="u8 grid g2">`;
  if(r.classes) h+=`<div class="card tab-wide"><h3>${esc(t("byClass"))}</h3>${r.classes.length?`<div class="u7"><table><tr><th>${esc(t("cls"))}</th><th>${esc(t("enrol"))}</th><th>${esc(t("rate"))}</th><th>${esc(t("absences"))}</th><th>${esc(t("avg"))}</th></tr>
    ${r.classes.map(c=>`<tr><td><b>${esc(c.name)}</b> <span class="small mut">${esc(c.level||"")}</span></td><td>${c.students}</td><td>${c.attendance_rate==null?esc(t("noData")):c.attendance_rate+" %"}</td><td>${c.absences}</td><td>${c.average_pct==null?esc(t("noData")):String(c.average_pct).replace(".",",")+" %"}</td></tr>`).join("")}</table></div>`
    :`<p class="small mut">${esc(t("noRepCls"))}</p>${can("classes")&&has("direction")?`<div class="toolbar">${go("classes",t("classesGo"),"soft")}</div>`:""}`}</div>`;
  if(r.finance){ const f=r.finance;
    h+=`<div class="card"><h3>${esc(t("finRep"))}</h3>${f.fees?`<div class="small">${esc(t("due"))} : <b>${esc(money(f.due_htg))}</b><br>${esc(t("paid"))} : <b>${esc(money(f.paid_htg))}</b><br>${esc(t("balance"))} : <b>${esc(money(f.balance_htg))}</b><br>${esc(t("unpaid")(f.unpaid_students))}</div>
      ${f.by_method.length?`<h3 class="u3">${esc(t("method"))}</h3>${f.by_method.map(m=>`<div class="small">${esc(t("m")[m.method]||m.method)} : <b>${esc(money(m.amount_htg))}</b> (${m.count})</div>`).join("")}`:""}`:`<p class="small mut">${esc(t("noFees"))}</p>`}</div>`; }
  if(r.library){ const l=r.library; h+=`<div class="card"><h3>${esc(t("libRep"))}</h3>${l.titles?`<div class="small">${esc(t("titles"))} : <b>${l.titles}</b><br>${esc(t("loans"))} : <b>${l.open_loans}</b> (${l.late_loans} ${esc(t("late"))})</div>`:`<p class="small mut">${esc(t("noBooks"))}</p>`}</div>`; }
  const ce=r.can_export||{};
  if(ce.students||ce.finance||r.exports){
    h+=`<div class="card"><h3>${esc(t("exp"))}</h3><div class="toolbar">${ce.students?`<button class="ghost" data-action="NORIA_TAB.exportStudents">${esc(t("expStu"))}</button>`:""}${ce.finance?`<button class="ghost" data-action="NORIA_TAB.exportFinance">${esc(t("expFin"))}</button>`:""}</div>
      ${r.exports?`<h3 class="u3">${esc(t("expLog"))}</h3>${r.exports.length?r.exports.map(e=>`<div class="small">${esc(String(e.created_at).slice(0,16).replace("T"," "))} — ${esc(e.actor||"?")} — ${esc(e.action)}${e.outcome==="refuse"?` <span class="badge b-unpaid">${esc(t("refused"))}</span>`:""}</div>`).join(""):`<p class="small mut">${esc(t("noExp"))}</p>`}`:""}</div>`;
  }
  return h+`</div>`;
}

/* ---------- paramètres (mode serveur : seulement ce qui a un effet) ---------- */
function settings(state){
  S=state; const L=lang();
  return `<h2 class="u6">${esc(t("set"))}</h2><div class="u8 grid g2">
  <div class="card"><h3>${esc(t("langT"))}</h3><p class="small mut">${esc(t("langH"))}</p><div class="row"><button class="${L==="fr"?"":"ghost"}" data-action="KL.lang" data-a0="s:fr">Français</button><button class="${L==="ht"?"":"ghost"}" data-action="KL.lang" data-a0="s:ht">Kreyòl</button></div></div>
  ${can("classes")&&has("direction","secretariat")?`<div class="card"><h3>${esc(t("structT"))}</h3><p class="small mut">${esc(t("structH"))}</p><div class="toolbar">${go("classes",t("structGo"),"soft")}</div></div>`:""}
  ${can("comms")?`<div class="card"><h3>${esc(t("calT"))}</h3><p class="small mut">${esc(t("calH"))}</p><div class="toolbar">${go("comms",t("annGo"))}</div></div>`:""}
  ${can("library")?`<div class="card"><h3>${esc(t("libT"))} <span class="badge b-pending">${esc(t("info"))}</span></h3><p class="small mut">${esc(t("libH"))}</p></div>`:""}
  <div class="card"><h3>${esc(t("rolesT"))} <span class="badge b-pending">${esc(t("info"))}</span></h3><p class="small mut">${esc(t("rolesH"))}</p><table>${t("roles").map(([a,b])=>`<tr><td><b>${esc(a)}</b></td><td class="small">${esc(b)}</td></tr>`).join("")}</table></div></div>`;
}

/* ---------- classes : gestion (structure.js, à la demande) ou liste de l'enseignant ---------- */
function classes(state){
  S=state;
  if(has("direction","secretariat")){
    setTimeout(async()=>{ const el=document.getElementById("strView"); if(!el) return;
      try{ await NORIA_ECO.load("src/structure.js"); if(document.getElementById("strView")===el) NORIA_STR.mount(el,S); }
      catch(e){ el.innerHTML=`<div class="badbox">${esc(t("err"))}</div>`; } },0);
    return `<div id="strView"><p class="mut">${esc(t("loading"))}</p></div>`;
  }
  const d=get("/api/tableau-de-bord"); const cl=ok(d)?(d.classes||[]):null;
  if(cl==null) return `<h2 class="u6">${esc(t("classes"))}</h2>`+wait();
  if(!cl.length) return `<h2 class="u6">${esc(t("classes"))}</h2><section class="card tab-start u8"><h2 class="u6">${esc(t("noTeach"))}</h2><p>${esc(t("noTeachHelp"))}</p></section>`;
  return `<h2 class="u6">${esc(t("myClasses"))}</h2><div class="u8 grid g2">${cl.map(c=>`<div class="card"><h3>${esc(c.name)} <span class="small mut">${esc(c.level||"")}${c.room?" · "+esc(c.room):""}</span></h3><div class="small mut">${c.students} ${esc(t("students").toLowerCase())}</div>
    <div class="toolbar"><button class="soft" data-action="KL.attGo" data-a0="s:c${Number(c.id)}">${esc(t("roll"))}</button>${go("academic",t("grades"))}<button class="ghost" data-action="NORIA_TAB.exportStudents" data-a0="n:${Number(c.id)}">${esc(t("expStu"))}</button></div></div>`).join("")}</div>`;
}
function emptyStudents(){
  return `<section class="card tab-start u8"><h2 class="u6">${esc(t("noStu"))}</h2><p>${esc(t("noStuHelp"))}</p><div class="toolbar">${can("classes")&&has("direction")?go("classes",t("classesGo"),"soft"):""}${can("importEleves")?go("importEleves",t("importGo"),""):""}</div></section>`;
}
function noClasses(){
  return `<section class="card tab-start u8"><h2 class="u6">${esc(has("enseignant")?t("noTeach"):t("noClasses"))}</h2><p>${esc(has("enseignant")?t("noTeachHelp"):t("noClassesHelp"))}</p>${has("direction")&&can("classes")?`<div class="toolbar">${go("classes",t("classesGo"),"soft")}</div>`:""}</section>`;
}

/* ---------- exports : fichier produit et journalisé par le serveur ---------- */
async function download(url,name){
  if(!navigator.onLine){ toast(t("needNet")); return; }
  try{
    const r=await fetch(url,{credentials:"same-origin",cache:"no-store"});
    if(!r.ok){ let m=String(r.status); try{ m=(await r.json()).error||m; }catch(x){} toast(t("refusedMsg")+m); return; }
    const b=await r.blob(); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000); toast(t("exported")); delete C["/api/rapports"];
  }catch(e){ toast(t("net")); }
}
const exportStudents=classId=>download(`/api/export/students${classId?`?classId=${Number(classId)}`:""}`,classId?`eleves-classe-${Number(classId)}.csv`:"eleves.csv");
const exportFinance=()=>download("/api/export/finance","finances.csv");

window.NORIA_TAB={dash,rep,settings,classes,emptyStudents,noClasses,exportStudents,exportFinance,t,
  bind:f=>{ rerender=f; }, reset:()=>{ Object.keys(C).forEach(k=>delete C[k]); }, invalidate:()=>{ Object.keys(C).forEach(k=>delete C[k]); }};
})();

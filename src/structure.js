/* NORIA — lot 0 : structure de l'école (mode serveur, chargé à la demande depuis « Classes »).
   Direction : assistant de démarrage (modèle haïtien modifiable, idempotent côté serveur), années et trimestres, niveaux,
   classes (salle), matières par niveau (coefficient), affectation des enseignants. Secrétariat : lecture seule.
   Tout passe par /api/structure (droits, RLS et journal côté serveur). Aucune donnée gardée dans le navigateur. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{title:"Structure de l'école",tabs:{classes:"Classes",levels:"Niveaux",years:"Année et trimestres",subjects:"Matières",teachers:"Enseignants",bulletins:"Bulletins",wizard:"Assistant"},
    ro:"Lecture seule : seule la direction modifie la structure.",loading:"Chargement…",err:"Refusé : ",net:"Réseau indisponible.",needNet:"Réseau nécessaire pour modifier la structure.",saved:"Enregistré.",
    noYear:"Aucune année scolaire.",yearLbl:"Année de travail",cur:"courante",arch:"archivée",archived:"Archivés",restore:"Restaurer",archive:"Archiver",edit:"Modifier",save:"Enregistrer",cancel:"Annuler",del:"Supprimer",add:"Ajouter",
    confirmArch:"Archiver cet élément ? Il disparaîtra des listes, sans rien effacer.",confirmDel:"Supprimer cette période ?",
    name:"Nom",level:"Niveau",room:"Salle",roomPh:"ex. Salle 12",students:"élèves",teachers:"Enseignants",none:"—",newClass:"Nouvelle classe",noClasses:"Aucune classe pour cette année.",noLevelsFirst:"Créez d'abord un niveau (onglet Niveaux) ou utilisez l'assistant.",
    cycle:"Cycle",cycles:{"":"Autre","prescolaire":"Préscolaire","fondamental-1":"Fondamental — 1er cycle","fondamental-2":"Fondamental — 2e cycle","fondamental-3":"Fondamental — 3e cycle","secondaire":"Nouveau secondaire"},
    newLevel:"Nouveau niveau",classesN:n=>`${n} classe(s)`,years:"Années scolaires",newYear:"Nouvelle année (AAAA-AAAA)",makeCur:"Rendre courante",curNew:"Devient l'année courante",
    terms:"Trimestres / périodes",start:"Début",end:"Fin",evals:n=>`${n} évaluation(s)`,newTerm:"Nouvelle période",noTerms:"Aucune période : ajoutez les trimestres.",
    subjects:"Matières",allLevels:"Toutes les classes",coef:"Coefficient",newSubject:"Nouvelle matière",filter:"Afficher",noSubjects:"Aucune matière.",
    noTeachers:"Aucun enseignant n'a encore de compte.",noTeachersHelp:"Invitez vos enseignants dans « Comptes » (rôle Enseignant). Une fois l'invitation acceptée, affectez-les ici à leurs classes.",pending:n=>`${n} invitation(s) d'enseignant en attente.`,
    accounts:"Comptes",assign:"Affecter",cls:"Classe",subject:"Matière",anySubject:"Toutes les matières (titulaire)",noAssign:"Aucune classe affectée.",remove:"Retirer",
    wz:"Assistant de démarrage",wzHelp:"Préparez l'année en quelques étapes. Rien n'est créé avant la dernière étape ; relancer l'assistant ne crée jamais de doublon.",
    step:(i,n)=>`Étape ${i} sur ${n}`,s1:"Année scolaire et trimestres",s2:"Niveaux",s3:"Classes",s4:"Matières",s5:"Vérifier et créer",next:"Suivant",back:"Retour",create:"Créer la structure",
    yearHelp:"Format AAAA-AAAA. Les dates des trimestres sont modifiables (indicatives).",model:"Modèle indicatif (MENFP) : à vérifier et adapter à votre école.",
    otherLevels:"Autres niveaux (un par ligne, facultatif)",countHelp:"Nombre de classes par niveau (0 = aucune). Plusieurs classes : A, B, C…",
    subjOn:"Créer les matières du modèle pour chaque niveau choisi (coefficients MENFP au 3e cycle, 1 ailleurs ; modifiables ensuite)",subjPreview:"Matières proposées",
    sum:{year:"Année",terms:"Périodes",levels:"Niveaux",classes:"Classes",subjects:"Matières"},
    result:(c,e)=>`Créés : ${c.classes} classe(s), ${c.levels} niveau(x), ${c.subjects} matière(s), ${c.terms} période(s)${e.classes+e.levels+e.subjects+e.terms?` — déjà présents : ${e.classes+e.levels+e.subjects+e.terms}`:""}.`,
    next1:"Étapes suivantes",nx:["Invitez vos enseignants (Comptes), puis affectez-les à leurs classes (onglet Enseignants).","Importez la liste des élèves (Import des élèves).","Vérifiez les dates des trimestres et les coefficients."],
    openWz:"Ouvrir l'assistant",wzAgain:"Compléter avec l'assistant",startT:"Commencez par créer vos classes",startHelp:"L'assistant crée l'année, les trimestres, les niveaux, les classes et les matières en une fois."},
  ht:{title:"Estrikti lekòl la",tabs:{classes:"Klas",levels:"Nivo",years:"Ane ak trimès",subjects:"Matyè",teachers:"Pwofesè",bulletins:"Bilten",wizard:"Asistan"},
    ro:"Lekti sèlman : se direksyon an sèlman ki chanje estrikti a.",loading:"Ap chaje…",err:"Refize : ",net:"Rezo a pa disponib.",needNet:"Fò gen rezo pou chanje estrikti a.",saved:"Anrejistre.",
    noYear:"Pa gen ane lekòl.",yearLbl:"Ane n ap travay la",cur:"kounye a",arch:"achive",archived:"Achive",restore:"Remete",archive:"Achive",edit:"Chanje",save:"Anrejistre",cancel:"Anile",del:"Efase",add:"Ajoute",
    confirmArch:"Achive eleman sa a ? L ap disparèt nan lis yo, san anyen pa efase.",confirmDel:"Efase peryòd sa a ?",
    name:"Non",level:"Nivo",room:"Sal",roomPh:"egz. Sal 12",students:"elèv",teachers:"Pwofesè",none:"—",newClass:"Nouvo klas",noClasses:"Pa gen klas pou ane sa a.",noLevelsFirst:"Kreye yon nivo anvan (onglè Nivo) oswa sèvi ak asistan an.",
    cycle:"Sik",cycles:{"":"Lòt","prescolaire":"Prekolè","fondamental-1":"Fondamantal — 1ye sik","fondamental-2":"Fondamantal — 2yèm sik","fondamental-3":"Fondamantal — 3yèm sik","secondaire":"Nouvo segondè"},
    newLevel:"Nouvo nivo",classesN:n=>`${n} klas`,years:"Ane lekòl",newYear:"Nouvo ane (AAAA-AAAA)",makeCur:"Fè l ane kounye a",curNew:"Vin ane kounye a",
    terms:"Trimès / peryòd",start:"Kòmansman",end:"Fen",evals:n=>`${n} evalyasyon`,newTerm:"Nouvo peryòd",noTerms:"Pa gen peryòd : ajoute trimès yo.",
    subjects:"Matyè",allLevels:"Tout klas yo",coef:"Koefisyan",newSubject:"Nouvo matyè",filter:"Montre",noSubjects:"Pa gen matyè.",
    noTeachers:"Poko gen pwofesè ki gen kont.",noTeachersHelp:"Envite pwofesè ou yo nan « Kont » (wòl Pwofesè). Lè yo aksepte envitasyon an, ba yo klas yo isit la.",pending:n=>`${n} envitasyon pwofesè ap tann.`,
    accounts:"Kont",assign:"Bay klas",cls:"Klas",subject:"Matyè",anySubject:"Tout matyè (titilè)",noAssign:"Pa gen klas ki ba li.",remove:"Retire",
    wz:"Asistan pou kòmanse",wzHelp:"Prepare ane a an kèk etap. Anyen pa kreye anvan dènye etap la ; si ou relanse asistan an, li p ap janm kreye an doub.",
    step:(i,n)=>`Etap ${i} sou ${n}`,s1:"Ane lekòl ak trimès",s2:"Nivo",s3:"Klas",s4:"Matyè",s5:"Verifye epi kreye",next:"Apre",back:"Tounen",create:"Kreye estrikti a",
    yearHelp:"Fòma AAAA-AAAA. Ou ka chanje dat trimès yo (se endikasyon).",model:"Modèl endikatif (MENFP) : verifye l epi adapte l pou lekòl ou.",
    otherLevels:"Lòt nivo (youn pa liy, si genyen)",countHelp:"Konbyen klas pou chak nivo (0 = okenn). Plizyè klas : A, B, C…",
    subjOn:"Kreye matyè modèl la pou chak nivo ou chwazi (koefisyan MENFP nan 3yèm sik, 1 lòt kote ; ou ka chanje yo apre)",subjPreview:"Matyè yo pwopoze",
    sum:{year:"Ane",terms:"Peryòd",levels:"Nivo",classes:"Klas",subjects:"Matyè"},
    result:(c,e)=>`Kreye : ${c.classes} klas, ${c.levels} nivo, ${c.subjects} matyè, ${c.terms} peryòd${e.classes+e.levels+e.subjects+e.terms?` — te la deja : ${e.classes+e.levels+e.subjects+e.terms}`:""}.`,
    next1:"Pwochen etap yo",nx:["Envite pwofesè ou yo (Kont), epi ba yo klas yo (onglè Pwofesè).","Enpòte lis elèv yo (Enpòtasyon elèv).","Verifye dat trimès yo ak koefisyan yo."],
    openWz:"Louvri asistan an",wzAgain:"Konplete ak asistan an",startT:"Kòmanse pa kreye klas ou yo",startHelp:"Asistan an kreye ane a, trimès yo, nivo yo, klas yo ak matyè yo yon sèl kou."},
};
const t=k=>T[lang()][k];
let EL=null, S=null;
const ST={tab:null,data:null,model:null,edit:null,filter:"",wiz:null,msg:""};
const toast=m=>{ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),3500); };
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let body=null; try{ body=await r.json(); }catch(e){} return {status:r.status,body};
}
async function write(method,path,body,okMsg){
  if(!navigator.onLine){ toast(t("needNet")); return null; }
  let r; try{ r=await api(path,{method,body:body?JSON.stringify(body):undefined}); }catch(e){ toast(t("net")); return null; }
  if(r.status!==200){ toast(t("err")+((r.body&&r.body.error)||r.status)); return null; }
  if(okMsg!==false) toast(okMsg||t("saved"));
  return r.body;
}
async function load(){
  const r=await api("/api/structure").catch(()=>null);
  if(!r||r.status!==200){ ST.data={__err:r?r.status:0}; draw(); return; }
  ST.data=r.body;
  if(!ST.tab) ST.tab=(r.body.can_manage&&(!r.body.year||!r.body.classes.some(c=>!c.archived_at&&c.school_year_id===r.body.year.id)))?"wizard":"classes";
  draw();
}
// Après une modification : relit la structure et les classes de l'application (menus, appel, notes).
async function refresh(){ await load(); if(window.KL&&KL.reloadClasses) KL.reloadClasses(); if(window.NORIA_TAB) NORIA_TAB.invalidate(); }
function mount(el,state){ EL=el; S=state; ST.edit=null; if(ST.data&&!ST.data.__err) draw(); else EL.innerHTML=`<p class="mut">${esc(t("loading"))}</p>`; load(); }
function draw(){
  if(!EL||!EL.isConnected) return;
  const d=ST.data;
  if(!d) { EL.innerHTML=`<p class="mut">${esc(t("loading"))}</p>`; return; }
  if(d.__err!==undefined){ EL.innerHTML=`<div class="badbox">${esc(t("err"))}${esc(d.__err)}</div>`; return; }
  const tabs=["classes","levels","years","subjects","teachers"].concat(d.can_bulletins?["bulletins"]:[]).concat(d.can_manage?["wizard"]:[]);
  EL.innerHTML=`<div class="row sp"><h2 class="u6">${esc(t("title"))}</h2>${d.year?`<span class="badge b-paid">${esc(t("yearLbl"))} : ${esc(d.year.label)}</span>`:`<span class="badge b-pending">${esc(t("noYear"))}</span>`}</div>
    ${d.can_manage?"":`<p class="small mut">${esc(t("ro"))}</p>`}
    <div class="str-tabs" role="tablist">${tabs.map(k=>`<button type="button" role="tab" class="${ST.tab===k?"on":"ghost"}" aria-selected="${ST.tab===k}" data-action="NORIA_STR.tab" data-a0="s:${k}">${esc(t("tabs")[k])}</button>`).join("")}</div>
    <div class="str-body">${({classes:vClasses,levels:vLevels,years:vYears,subjects:vSubjects,teachers:vTeachers,bulletins:vBulletins,wizard:vWizard}[ST.tab]||vClasses)(d)}</div>`;
}
function vBulletins(){
  setTimeout(()=>{ const el=document.getElementById("strBul"); if(!el) return;
    (window.NORIA_ECO?NORIA_ECO.load("src/bulletins-menfp.js"):Promise.reject()).then(()=>{ if(el.isConnected) NORIA_BUL.render(el,ST.data); }).catch(()=>{ el.innerHTML=`<div class="badbox">${esc(t("err"))}</div>`; }); },0);
  return `<div id="strBul"><p class="mut">${esc(t("loading"))}</p></div>`;
}
const M=()=>ST.data&&ST.data.can_manage;
const yid=()=>ST.data.year&&ST.data.year.id;
const lvName=id=>{ const l=ST.data.levels.find(x=>x.id===id); return l?l.name:""; };
const opts=(items,cur)=>items.map(([v,l])=>`<option value="${esc(v)}"${String(v)===String(cur)?" selected":""}>${esc(l)}</option>`).join("");
const activeLevels=()=>ST.data.levels.filter(l=>!l.archived_at);
const btn=(fn,arg,label,cls)=>`<button type="button" class="${cls||"ghost"}" data-action="NORIA_STR.${fn}" data-a0="${esc(arg)}">${esc(label)}</button>`;

/* ---------- classes ---------- */
function vClasses(d){
  if(!d.year) return startCard();
  const list=d.classes.filter(c=>c.school_year_id===d.year.id);
  const act=list.filter(c=>!c.archived_at), arch=list.filter(c=>c.archived_at);
  const teachersOf=cid=>{ const ids=[...new Set(d.assignments.filter(a=>a.class_id===cid).map(a=>a.teacher_user_id))]; return ids.map(i=>(d.teachers.find(x=>x.id===i)||{}).name).filter(Boolean).join(", "); };
  const lv=activeLevels();
  let h="";
  if(M()) h+=lv.length?`<details class="card str-new"${act.length?"":" open"}><summary>${esc(t("newClass"))}</summary><form class="str-form" data-action-submit="NORIA_STR.addClass" data-a0="t">
    <label class="fld">${esc(t("level"))}<select name="level" required>${opts(lv.map(l=>[l.id,l.name]))}</select></label>
    <label class="fld">${esc(t("name"))}<input name="name" required maxlength="60" placeholder="7e AF A"></label>
    <label class="fld">${esc(t("room"))}<input name="room" maxlength="40" placeholder="${esc(t("roomPh"))}"></label><button type="submit">${esc(t("add"))}</button></form></details>`
    :`<div class="warnbox small">${esc(t("noLevelsFirst"))}</div>`;
  if(!act.length) h+=`<p class="mut u8">${esc(t("noClasses"))}</p>`+(M()?`<div class="toolbar">${btn("tab","s:wizard",t("openWz"),"")}</div>`:"");
  else h+=`<div class="card u8"><div class="u7"><table class="str-table"><tr><th>${esc(t("name"))}</th><th>${esc(t("level"))}</th><th>${esc(t("room"))}</th><th>${esc(t("students"))}</th><th>${esc(t("teachers"))}</th>${M()?"<th></th>":""}</tr>
    ${act.map(c=>ST.edit==="c"+c.id?`<tr><td colspan="${M()?6:5}"><form class="str-form" data-action-submit="NORIA_STR.saveClass" data-a0="t" data-a1="n:${c.id}">
      <label class="fld">${esc(t("name"))}<input name="name" required maxlength="60" value="${esc(c.name)}"></label>
      <label class="fld">${esc(t("level"))}<select name="level">${opts(lv.map(l=>[l.id,l.name]),c.level_id)}</select></label>
      <label class="fld">${esc(t("room"))}<input name="room" maxlength="40" value="${esc(c.room||"")}"></label>
      <button type="submit">${esc(t("save"))}</button>${btn("edit","s:",t("cancel"))}</form></td></tr>`
      :`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.level)}</td><td>${esc(c.room||t("none"))}</td><td>${Number(c.students)}</td><td class="small">${esc(teachersOf(c.id)||t("none"))}</td>
      ${M()?`<td class="row">${btn("edit","s:c"+c.id,t("edit"))}${btn("archClass","n:"+c.id,t("archive"))}</td>`:""}</tr>`).join("")}</table></div></div>`;
  if(arch.length) h+=`<details class="u8"><summary class="small">${esc(t("archived"))} (${arch.length})</summary>${arch.map(c=>`<div class="row sp small u14"><span>${esc(c.name)} · ${esc(c.level)}</span>${M()?btn("unarchClass","n:"+c.id,t("restore")):""}</div>`).join("")}</details>`;
  return h;
}
function startCard(){ return `<section class="card tab-start"><h2 class="u6">${esc(t("startT"))}</h2><p>${esc(t("startHelp"))}</p>${M()?`<div class="toolbar">${btn("tab","s:wizard",t("openWz"),"")}</div>`:""}</section>`; }
async function addClass(f){ if(await write("POST","/api/structure/classes",{level_id:Number(f.level.value),name:f.name.value,room:f.room.value})) refresh(); }
async function saveClass(f,id){ if(await write("PATCH",`/api/structure/classes/${id}`,{name:f.name.value,room:f.room.value,level_id:Number(f.level.value)})){ ST.edit=null; refresh(); } }
async function archClass(id){ if(!confirm(t("confirmArch"))) return; if(await write("PATCH",`/api/structure/classes/${id}`,{archived:true})) refresh(); }
async function unarchClass(id){ if(await write("PATCH",`/api/structure/classes/${id}`,{archived:false})) refresh(); }

/* ---------- niveaux ---------- */
function vLevels(d){
  const cy=t("cycles"); const act=d.levels.filter(l=>!l.archived_at), arch=d.levels.filter(l=>l.archived_at);
  const nCls=id=>d.classes.filter(c=>c.level_id===id&&!c.archived_at).length;
  let h=M()?`<details class="card str-new"><summary>${esc(t("newLevel"))}</summary><form class="str-form" data-action-submit="NORIA_STR.addLevel" data-a0="t">
    <label class="fld">${esc(t("name"))}<input name="name" required maxlength="60" placeholder="7e AF"></label>
    <label class="fld">${esc(t("cycle"))}<select name="cycle">${opts(Object.entries(cy))}</select></label><button type="submit">${esc(t("add"))}</button></form></details>`:"";
  h+=act.length?`<div class="card u8">${act.map(l=>ST.edit==="l"+l.id?`<form class="str-form u14" data-action-submit="NORIA_STR.saveLevel" data-a0="t" data-a1="n:${l.id}">
      <label class="fld">${esc(t("name"))}<input name="name" required maxlength="60" value="${esc(l.name)}"></label>
      <label class="fld">${esc(t("cycle"))}<select name="cycle">${opts(Object.entries(cy),l.cycle||"")}</select></label><button type="submit">${esc(t("save"))}</button>${btn("edit","s:",t("cancel"))}</form>`
    :`<div class="row sp u14"><span><b>${esc(l.name)}</b> <span class="small mut">${esc(cy[l.cycle||""]||l.cycle||"")} · ${esc(t("classesN")(nCls(l.id)))}</span></span>${M()?`<span class="row">${btn("edit","s:l"+l.id,t("edit"))}${btn("archLevel","n:"+l.id,t("archive"))}</span>`:""}</div>`).join("")}</div>`
    :startCard();
  if(arch.length) h+=`<details class="u8"><summary class="small">${esc(t("archived"))} (${arch.length})</summary>${arch.map(l=>`<div class="row sp small u14"><span>${esc(l.name)}</span>${M()?btn("unarchLevel","n:"+l.id,t("restore")):""}</div>`).join("")}</details>`;
  return h;
}
async function addLevel(f){ if(await write("POST","/api/structure/niveaux",{name:f.name.value,cycle:f.cycle.value||null})) refresh(); }
async function saveLevel(f,id){ if(await write("PATCH",`/api/structure/niveaux/${id}`,{name:f.name.value,cycle:f.cycle.value||null})){ ST.edit=null; refresh(); } }
async function archLevel(id){ if(!confirm(t("confirmArch"))) return; if(await write("PATCH",`/api/structure/niveaux/${id}`,{archived:true})) refresh(); }
async function unarchLevel(id){ if(await write("PATCH",`/api/structure/niveaux/${id}`,{archived:false})) refresh(); }

/* ---------- années et périodes ---------- */
function vYears(d){
  let h=`<div class="grid g2"><div class="card"><h3>${esc(t("years"))}</h3>${d.years.map(y=>`<div class="row sp u14"><span><b>${esc(y.label)}</b> ${Number(y.is_current)===1?`<span class="badge b-paid">${esc(t("cur"))}</span>`:""}${y.archived_at?` <span class="badge b-pending">${esc(t("arch"))}</span>`:""}</span>
    ${M()?`<span class="row">${!y.archived_at&&Number(y.is_current)!==1?btn("curYear","n:"+y.id,t("makeCur")):""}${Number(y.is_current)===1?"":y.archived_at?btn("unarchYear","n:"+y.id,t("restore")):btn("archYear","n:"+y.id,t("archive"))}</span>`:""}</div>`).join("")||`<p class="small mut">${esc(t("noYear"))}</p>`}
    ${M()?`<form class="str-form u8" data-action-submit="NORIA_STR.addYear" data-a0="t"><label class="fld">${esc(t("newYear"))}<input name="label" required pattern="\\d{4}-\\d{4}" placeholder="2027-2028"></label>
      <label class="small"><input type="checkbox" name="cur"> ${esc(t("curNew"))}</label><button type="submit">${esc(t("add"))}</button></form>`:""}</div>`;
  const terms=d.year?d.terms.filter(x=>x.school_year_id===d.year.id):[];
  h+=`<div class="card"><h3>${esc(t("terms"))}${d.year?` — ${esc(d.year.label)}`:""}</h3>${!d.year?`<p class="small mut">${esc(t("noYear"))}</p>`:terms.length?terms.map(x=>M()?`<form class="str-form u14" data-action-submit="NORIA_STR.saveTerm" data-a0="t" data-a1="n:${x.id}">
      <label class="fld">${esc(t("name"))}<input name="name" required maxlength="60" value="${esc(x.name)}"></label>
      <label class="fld">${esc(t("start"))}<input name="start" type="date" required value="${esc(x.starts_on)}"></label>
      <label class="fld">${esc(t("end"))}<input name="end" type="date" required value="${esc(x.ends_on)}"></label>
      <button type="submit" class="soft">${esc(t("save"))}</button>${Number(x.evaluations)?`<span class="small mut">${esc(t("evals")(x.evaluations))}</span>`:btn("delTerm","n:"+x.id,t("del"))}</form>`
      :`<div class="small u14"><b>${esc(x.name)}</b> : ${esc(x.starts_on)} → ${esc(x.ends_on)}</div>`).join(""):`<p class="small mut">${esc(t("noTerms"))}</p>`}
    ${M()&&d.year?`<details class="u8"><summary class="small">${esc(t("newTerm"))}</summary><form class="str-form" data-action-submit="NORIA_STR.addTerm" data-a0="t">
      <label class="fld">${esc(t("name"))}<input name="name" required maxlength="60" placeholder="Trimestre 4"></label>
      <label class="fld">${esc(t("start"))}<input name="start" type="date" required></label><label class="fld">${esc(t("end"))}<input name="end" type="date" required></label><button type="submit">${esc(t("add"))}</button></form></details>`:""}</div></div>`;
  return h;
}
async function addYear(f){ if(await write("POST","/api/structure/annees",{label:f.label.value.trim(),current:f.cur.checked})) refresh(); }
async function curYear(id){ if(await write("PATCH",`/api/structure/annees/${id}`,{current:true})) refresh(); }
async function archYear(id){ if(!confirm(t("confirmArch"))) return; if(await write("PATCH",`/api/structure/annees/${id}`,{archived:true})) refresh(); }
async function unarchYear(id){ if(await write("PATCH",`/api/structure/annees/${id}`,{archived:false})) refresh(); }
async function addTerm(f){ if(await write("POST","/api/structure/periodes",{name:f.name.value,starts_on:f.start.value,ends_on:f.end.value})) refresh(); }
async function saveTerm(f,id){ if(await write("PATCH",`/api/structure/periodes/${id}`,{name:f.name.value,starts_on:f.start.value,ends_on:f.end.value})) refresh(); }
async function delTerm(id){ if(!confirm(t("confirmDel"))) return; if(await write("DELETE",`/api/structure/periodes/${id}`)) refresh(); }

/* ---------- matières ---------- */
function vSubjects(d){
  if(!d.year) return startCard();
  const lv=activeLevels();
  const all=d.subjects.filter(s=>s.school_year_id===d.year.id&&!s.archived_at);
  const f=ST.filter;
  const list=all.filter(s=>f===""?true:f==="0"?s.level_id==null:String(s.level_id)===f);
  const lvOpts=[["",t("allLevels")]].concat(lv.map(l=>[l.id,l.name]));
  let h=`<div class="toolbar"><label class="small">${esc(t("filter"))} <select data-action-change="NORIA_STR.setFilter" data-a0="v">${opts([["","—"],["0",t("allLevels")]].concat(lv.map(l=>[String(l.id),l.name])),f)}</select></label></div>`;
  if(M()) h+=`<details class="card str-new"><summary>${esc(t("newSubject"))}</summary><form class="str-form" data-action-submit="NORIA_STR.addSubject" data-a0="t">
    <label class="fld">${esc(t("name"))}<input name="name" required maxlength="80"></label><label class="fld">${esc(t("level"))}<select name="level">${opts(lvOpts,f&&f!=="0"?f:"")}</select></label>
    <label class="fld">${esc(t("coef"))}<input name="coef" type="number" min="0.1" max="20" step="0.1" value="1" required></label><button type="submit">${esc(t("add"))}</button></form></details>`;
  h+=list.length?`<div class="card u8">${list.map(s=>M()?`<form class="str-form u14" data-action-submit="NORIA_STR.saveSubject" data-a0="t" data-a1="n:${s.id}">
      <label class="fld str-grow">${esc(s.level_id?lvName(s.level_id):t("allLevels"))}<input name="name" required maxlength="80" value="${esc(s.name)}"></label>
      <label class="fld">${esc(t("coef"))}<input name="coef" type="number" min="0.1" max="20" step="0.1" value="${esc(s.coefficient)}" required></label>
      <button type="submit" class="soft">${esc(t("save"))}</button>${btn("archSubject","n:"+s.id,t("archive"))}</form>`
    :`<div class="row sp small u14"><span><b>${esc(s.name)}</b> · ${esc(s.level_id?lvName(s.level_id):t("allLevels"))}</span><span>${esc(t("coef"))} ${esc(s.coefficient)}</span></div>`).join("")}</div>`:`<p class="mut u8">${esc(t("noSubjects"))}</p>`;
  return h;
}
function setFilter(v){ ST.filter=v; draw(); }
async function addSubject(f){ if(await write("POST","/api/structure/matieres",{name:f.name.value,level_id:f.level.value?Number(f.level.value):null,coefficient:f.coef.value})) refresh(); }
async function saveSubject(f,id){ if(await write("PATCH",`/api/structure/matieres/${id}`,{name:f.name.value,coefficient:f.coef.value})) refresh(); }
async function archSubject(id){ if(!confirm(t("confirmArch"))) return; if(await write("PATCH",`/api/structure/matieres/${id}`,{archived:true})) refresh(); }

/* ---------- enseignants ---------- */
function vTeachers(d){
  const pend=d.pending_teacher_invitations?`<p class="small mut">${esc(t("pending")(d.pending_teacher_invitations))}</p>`:"";
  if(!d.teachers.length) return `<section class="card tab-start"><h2 class="u6">${esc(t("noTeachers"))}</h2><p>${esc(t("noTeachersHelp"))}</p>${pend}${M()?`<div class="toolbar"><button data-action="KL.go" data-a0="s:accounts">${esc(t("accounts"))}</button></div>`:""}</section>`;
  const cls=d.year?d.classes.filter(c=>c.school_year_id===d.year.id&&!c.archived_at):[];
  const subj=d.year?d.subjects.filter(s=>s.school_year_id===d.year.id&&!s.archived_at):[];
  const cName=id=>(d.classes.find(c=>c.id===id)||{}).name||"#"+id, sName=id=>(d.subjects.find(s=>s.id===id)||{}).name||"";
  return pend+`<div class="grid g2">${d.teachers.map(te=>{ const as=d.assignments.filter(a=>a.teacher_user_id===te.id);
    return `<div class="card"><h3>${esc(te.name)}</h3>${as.length?as.map(a=>`<div class="row sp small u14"><span>${esc(cName(a.class_id))}${a.subject_id?` — ${esc(sName(a.subject_id))}`:` — <span class="mut">${esc(t("anySubject"))}</span>`}</span>${M()?btn("unassign","n:"+a.id,t("remove")):""}</div>`).join(""):`<p class="small mut">${esc(t("noAssign"))}</p>`}
    ${M()&&cls.length?`<form class="str-form u8" data-action-submit="NORIA_STR.assign" data-a0="t" data-a1="n:${te.id}">
      <label class="fld">${esc(t("cls"))}<select name="cls" required>${opts(cls.map(c=>[c.id,c.name]))}</select></label>
      <label class="fld">${esc(t("subject"))}<select name="subj"><option value="">${esc(t("anySubject"))}</option>${opts(subj.map(s=>[s.id,s.name+(s.level_id?` (${lvName(s.level_id)})`:"")]))}</select></label>
      <button type="submit">${esc(t("assign"))}</button></form>`:""}</div>`; }).join("")}</div>`;
}
async function assign(f,teacher){ if(await write("POST","/api/structure/affectations",{teacher_user_id:teacher,class_id:Number(f.cls.value),subject_id:f.subj.value?Number(f.subj.value):null})) refresh(); }
async function unassign(id){ if(await write("DELETE",`/api/structure/affectations/${id}`)) refresh(); }

/* ---------- assistant ---------- */
const LETTERS="ABCDEFGHIJKL";
async function wizStart(){
  const y=ST.data.year&&!ST.data.classes.some(c=>c.school_year_id===ST.data.year.id)?ST.data.year.label:"";
  const r=await api(`/api/structure/modele${y?`?annee=${encodeURIComponent(y)}`:""}`).catch(()=>null);
  if(!r||r.status!==200){ toast(t("net")); return; }
  const m=r.body; ST.model=m;
  const levels={}; m.cycles.forEach(c=>c.levels.forEach(l=>{ levels[l.name]=c.on; }));
  const counts={}; m.cycles.forEach(c=>c.levels.forEach(l=>{ counts[l.name]=1; }));
  ST.wiz={step:1,year:m.year,terms:m.terms.map(x=>({...x})),levels,custom:[],counts,subjects:true,result:null};
  draw();
}
function chosen(){ const w=ST.wiz, m=ST.model; const out=[];
  m.cycles.forEach(c=>c.levels.forEach(l=>{ if(w.levels[l.name]) out.push({name:l.name,cycle:c.id,position:l.position,subjects:l.subjects,coefs:l.coefficients||{}}); }));
  w.custom.forEach((n,i)=>out.push({name:n,cycle:null,position:1000+i*10,subjects:[]})); return out; }
function classNames(level,n){ return n<=0?[]:n===1?[level]:Array.from({length:Math.min(n,12)},(_,i)=>`${level} ${LETTERS[i]}`); }
function body(){ const w=ST.wiz, lv=chosen();
  return { year:w.year, current:true, terms:w.terms,
    levels:lv.map(l=>({name:l.name,cycle:l.cycle,position:l.position})),
    classes:lv.flatMap(l=>classNames(l.name,Number(w.counts[l.name]??1)).map(n=>({name:n,level:l.name}))),
    subjects:w.subjects?lv.flatMap(l=>l.subjects.map(s=>({name:s,level:l.name,coefficient:(l.coefs&&l.coefs[s])||1}))):[] }; }
function vWizard(d){
  if(!M()) return `<p class="small mut">${esc(t("ro"))}</p>`;
  const w=ST.wiz;
  if(!w) { setTimeout(wizStart,0); return `<div class="card"><h3>${esc(t("wz"))}</h3><p class="small">${esc(t("wzHelp"))}</p><p class="mut">${esc(t("loading"))}</p></div>`; }
  if(w.result) return `<div class="card str-wiz"><h3>${esc(t("wz"))}</h3><div class="notice">${esc(t("result")(w.result.created,w.result.existing))}</div><h3>${esc(t("next1"))}</h3><ol class="small">${t("nx").map(x=>`<li>${esc(x)}</li>`).join("")}</ol>
    <div class="toolbar"><button data-action="NORIA_STR.tab" data-a0="s:classes">${esc(t("tabs").classes)}</button><button class="ghost" data-action="NORIA_STR.tab" data-a0="s:teachers">${esc(t("tabs").teachers)}</button><button class="ghost" data-action="KL.go" data-a0="s:importEleves">${esc(lang()==="ht"?"Enpòte elèv":"Importer des élèves")}</button></div></div>`;
  const N=5, head=`<h3>${esc(t("wz"))} — ${esc(t("step")(w.step,N))} : ${esc(t("s"+w.step))}</h3><ol class="str-steps">${[1,2,3,4,5].map(i=>`<li class="${i===w.step?"on":i<w.step?"done":""}">${esc(t("s"+i))}</li>`).join("")}</ol>`;
  const nav=(last)=>`<div class="toolbar">${w.step>1?`<button type="button" class="ghost" data-action="NORIA_STR.wizBack">${esc(t("back"))}</button>`:""}<button type="submit">${esc(last?t("create"):t("next"))}</button></div>`;
  let f="";
  if(w.step===1) f=`<p class="small mut">${esc(t("wzHelp"))}</p><label class="fld">${esc(t("sum").year)}<input name="year" required pattern="\\d{4}-\\d{4}" value="${esc(w.year)}"></label><p class="small mut">${esc(t("yearHelp"))}</p>
    ${w.terms.map((x,i)=>`<div class="str-form"><label class="fld">${esc(t("name"))}<input name="tn${i}" required maxlength="60" value="${esc(x.name)}"></label><label class="fld">${esc(t("start"))}<input name="ts${i}" type="date" required value="${esc(x.starts_on)}"></label><label class="fld">${esc(t("end"))}<input name="te${i}" type="date" required value="${esc(x.ends_on)}"></label></div>`).join("")}`;
  if(w.step===2) f=`<p class="small mut">${esc(t("model"))}</p>${ST.model.cycles.map(c=>`<fieldset class="str-cycle"><legend>${esc(lang()==="ht"?c.ht:c.fr)}</legend>${c.levels.map(l=>`<label class="str-chk"><input type="checkbox" name="lv" value="${esc(l.name)}"${w.levels[l.name]?" checked":""}> ${esc(l.name)}</label>`).join("")}</fieldset>`).join("")}
    <label class="fld">${esc(t("otherLevels"))}<textarea name="custom" rows="2" maxlength="600">${esc(w.custom.join("\n"))}</textarea></label>`;
  if(w.step===3) f=`<p class="small mut">${esc(t("countHelp"))}</p><div class="str-counts">${chosen().map((l,i)=>`<label class="fld"><span>${esc(l.name)}</span><input name="n${i}" type="number" min="0" max="12" value="${esc(w.counts[l.name]??1)}"></label>`).join("")}</div>
    <p class="small mut">${esc(body().classes.slice(0,12).map(c=>c.name).join(", "))}${body().classes.length>12?"…":""}</p>`;
  if(w.step===4){ const lv=chosen(); const groups={}; lv.forEach(l=>{ const k=l.subjects.map(s=>s+((l.coefs&&l.coefs[s]>1)?` (coef. ${l.coefs[s]})`:"")).join(", "); (groups[k]=groups[k]||[]).push(l.name); });
    f=`<label class="str-chk"><input type="checkbox" name="subj"${w.subjects?" checked":""}> ${esc(t("subjOn"))}</label><h3 class="u3">${esc(t("subjPreview"))}</h3>${Object.entries(groups).map(([s,ls])=>`<p class="small"><b>${esc(ls.join(", "))}</b> : ${esc(s||"—")}</p>`).join("")}<p class="small mut">${esc(t("model"))}</p>`; }
  if(w.step===5){ const b=body(); f=`<div class="grid g3">${[["year",b.year],["terms",b.terms.length],["levels",b.levels.length],["classes",b.classes.length],["subjects",b.subjects.length]].map(([k,v])=>`<div class="card"><div class="kpi">${esc(v)}</div><div class="kpi-sub">${esc(t("sum")[k])}</div></div>`).join("")}</div>
    <p class="small mut u8">${esc(t("wzHelp"))}</p>`; }
  return `<div class="card str-wiz">${head}<form data-action-submit="NORIA_STR.wizNext" data-a0="t">${f}${nav(w.step===N)}</form></div>`;
}
function wizNext(form){
  const w=ST.wiz;
  if(w.step===1){ w.year=form.year.value.trim(); w.terms=w.terms.map((x,i)=>({name:form["tn"+i].value,starts_on:form["ts"+i].value,ends_on:form["te"+i].value})); }
  if(w.step===2){ const on=new Set([...form.querySelectorAll('input[name="lv"]')].filter(i=>i.checked).map(i=>i.value)); Object.keys(w.levels).forEach(k=>{ w.levels[k]=on.has(k); });
    w.custom=[...new Set(form.custom.value.split(/\n+/).map(s=>s.trim().replace(/\s+/g," ")).filter(Boolean))].slice(0,20); w.custom.forEach(n=>{ if(w.counts[n]==null) w.counts[n]=1; }); }
  if(w.step===3){ chosen().forEach((l,i)=>{ const v=Number(form["n"+i].value); w.counts[l.name]=Number.isInteger(v)&&v>=0?Math.min(v,12):1; }); }
  if(w.step===4){ w.subjects=form.subj.checked; }
  if(w.step===5) return wizCreate();
  w.step++; draw();
}
function wizBack(){ if(ST.wiz&&ST.wiz.step>1){ ST.wiz.step--; draw(); } }
async function wizCreate(){
  const r=await write("POST","/api/structure/assistant",body(),false);
  if(!r) return;
  ST.wiz.result=r; await refresh(); ST.tab="wizard"; draw();
}
function tab(k){ ST.tab=k; ST.edit=null; if(k==="wizard"&&ST.wiz&&ST.wiz.result) ST.wiz=null; draw(); }
function edit(k){ ST.edit=k||null; draw(); }

window.NORIA_STR={mount,tab,edit,addClass,saveClass,archClass,unarchClass,addLevel,saveLevel,archLevel,unarchLevel,addYear,curYear,archYear,unarchYear,addTerm,saveTerm,delTerm,
  setFilter,addSubject,saveSubject,archSubject,assign,unassign,wizNext,wizBack};
})();

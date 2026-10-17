/* NORIA — portail du ministère de l'Éducation nationale (bloc 6, PROTOTYPE). Page séparée (/ministere), chargée
   seulement quand NORIA_MINISTERE=1. Connexion par code à 6 chiffres. Agrégats par défaut ; une liste nominative
   exige un motif (journalisé côté ministère et côté école). Aucun script ni style en ligne (CSP stricte). */
(function(){
"use strict";
const {esc}=window.NORIA_U;
const $=id=>document.getElementById(id);
const LS="noria_min_lang";
let L=(()=>{ try{ return localStorage.getItem(LS)==="ht"?"ht":"fr"; }catch(e){ return "fr"; } })();
const T={
 fr:{title:"Portail du ministère",sub:"Ministère de l'Éducation nationale",proto:"Prototype : données fictives, accès réservé aux comptes créés par l'administration NORIA.",
  login:"Connexion",ident:"E-mail ou téléphone du compte",send:"Recevoir un code",code:"Code à 6 chiffres",enter:"Se connecter",sent:"Si ce compte existe, un code vient d'être envoyé (valable 10 min).",
  bad:"Code invalide ou expiré.",many:"Trop de tentatives, réessayez plus tard.",net:"Réseau indisponible.",back:"Retour",logout:"Déconnexion",
  tabs:{ensemble:"Vue d'ensemble",declarations:"Déclarations",transferts:"Transferts",verifier:"Vérifier un document",journal:"Mon journal"},
  schools:"Écoles",students:"Élèves",girls:"filles",boys:"garçons",classes:"Classes",success:"Réussite",decl:"Déclarations reçues",staff:"Personnel",
  year:"Année scolaire",dept:"Département",commune:"Commune",all:"Tous",allf:"Toutes",search:"Rechercher une école",status:"Déclaration",
  st:{aucune:"Non envoyée",envoyee:"À examiner",recue:"Reçue",correction_demandee:"Correction demandée",remplacee:"Remplacée"},
  none:"Aucun résultat.",agg:"Chiffres agrégés. Le détail nominatif n'apparaît que sur demande motivée, inscrite au journal du ministère et à celui de l'école.",
  byClass:"Par classe",admis:"Admis",redouble:"Redoublent",echec:"Échec",nodec:"Sans décision",rate:"Taux",total:"Total",level:"Niveau",
  nominal:"Liste nominative",motif:"Motif de la consultation (obligatoire)",motifHelp:"Ce motif est inscrit au journal du ministère et à celui de l'école.",confirm:"Confirmer",cancel:"Annuler",
  laur:"Lauréats publiés",noLaur:"Aucun lauréat publié pour cette année.",hist:"Historique des déclarations",noHist:"Aucune déclaration reçue.",
  roles:{direction:"Direction",secretariat:"Secrétariat",enseignant:"Enseignants",comptabilite:"Comptabilité",bibliotheque:"Bibliothèque"},
  open:"Ouvrir",pdf:"PDF signé",ack:"Accuser réception",corr:"Demander une correction",note:"Note pour l'école",noteReq:"Précisez la correction demandée",
  sig:"Signature de l'école",sigOk:"Signature Ed25519 valide : le dossier n'a pas été modifié depuis l'envoi.",sigKo:"Signature invalide : dossier modifié ou clé inconnue.",
  sentBy:"Envoyée par",sentOn:"le",version:"Version",events:"Historique",ev:{envoi:"Envoi par l'école",accuse:"Accusé de réception",correction:"Correction demandée",remplacement:"Remplacée par une nouvelle version"},
  eff:"Effectifs",res:"Résultats",pers:"Personnel",laureats:"Lauréats",trOff:"Étape ministère des transferts désactivée (NORIA_TRANSFERT_MINISTERE=0).",trNone:"Aucun transfert en attente.",
  approve:"Approuver",refuse:"Refuser",trWhy:"Motif (obligatoire pour un refus)",from:"De",to:"Vers",approved:"Approuvé par l'origine le",expires:"Expire le",
  verify:"Vérifier",verHelp:"Code imprimé sous le QR (relevé, badge, certificat de transfert, bulletin, reçu) ou lien complet du QR.",photo:"Photo du QR code",reading:"Lecture du QR…",noQr:"QR code illisible : saisissez le code.",
  authentic:"Document authentique",invalid:"Document modifié ou annulé",unknown:"Aucun document ne correspond à ce code.",done:"Enregistré.",err:"Erreur : ",
  ident2:"Identité",birth:"Naissance",sex:"Sexe",code2:"Code élève",decision:"Décision",dated:"Le",account:"Compte",action:"Action",detail:"Détail",
  student:"Fiche élève",notSent:"Non transmis : notes, santé, famille, contacts, finances, présences.",lang:"HT"},
 ht:{title:"Pòtay ministè a",sub:"Ministè Edikasyon Nasyonal",proto:"Pwototip : done fiktif, se sèlman kont administrasyon NORIA kreye ki ka antre.",
  login:"Koneksyon",ident:"Imèl oswa telefòn kont lan",send:"Resevwa yon kòd",code:"Kòd 6 chif",enter:"Konekte",sent:"Si kont sa a egziste, yon kòd fèk pati (li bon pou 10 minit).",
  bad:"Kòd la pa bon oswa li ekspire.",many:"Twòp esè, eseye ankò pita.",net:"Rezo a pa disponib.",back:"Retounen",logout:"Dekonekte",
  tabs:{ensemble:"Vi jeneral",declarations:"Deklarasyon",transferts:"Transfè",verifier:"Verifye yon dokiman",journal:"Jounal mwen"},
  schools:"Lekòl",students:"Elèv",girls:"tifi",boys:"ti gason",classes:"Klas",success:"Reyisit",decl:"Deklarasyon resevwa",staff:"Pèsonèl",
  year:"Ane lekòl",dept:"Depatman",commune:"Komin",all:"Tout",allf:"Tout",search:"Chèche yon lekòl",status:"Deklarasyon",
  st:{aucune:"Pa voye",envoyee:"Pou egzamine",recue:"Resevwa",correction_demandee:"Yo mande korije",remplacee:"Ranplase"},
  none:"Pa gen rezilta.",agg:"Chif total sèlman. Non elèv yo parèt sèlman sou demann ak yon rezon, ki ekri nan jounal ministè a ak jounal lekòl la.",
  byClass:"Pa klas",admis:"Pase",redouble:"Double",echec:"Echwe",nodec:"San desizyon",rate:"To",total:"Total",level:"Nivo",
  nominal:"Lis ak non elèv",motif:"Rezon konsiltasyon an (obligatwa)",motifHelp:"Rezon sa a ekri nan jounal ministè a ak jounal lekòl la.",confirm:"Konfime",cancel:"Anile",
  laur:"Laureya pibliye",noLaur:"Pa gen laureya pibliye pou ane sa a.",hist:"Istwa deklarasyon yo",noHist:"Pa gen deklarasyon resevwa.",
  roles:{direction:"Direksyon",secretariat:"Sekretarya",enseignant:"Pwofesè",comptabilite:"Kontablite",bibliotheque:"Bibliyotèk"},
  open:"Louvri",pdf:"PDF siyen",ack:"Konfime resepsyon",corr:"Mande korije",note:"Nòt pou lekòl la",noteReq:"Di sa ki pou korije",
  sig:"Siyati lekòl la",sigOk:"Siyati Ed25519 bon : dosye a pa chanje depi li voye.",sigKo:"Siyati a pa bon : dosye a chanje oswa kle a enkoni.",
  sentBy:"Voye pa",sentOn:"le",version:"Vèsyon",events:"Istwa",ev:{envoi:"Lekòl la voye l",accuse:"Resepsyon konfime",correction:"Yo mande korije",remplacement:"Ranplase pa yon nouvo vèsyon"},
  eff:"Efektif",res:"Rezilta",pers:"Pèsonèl",laureats:"Laureya",trOff:"Etap ministè pou transfè yo dezaktive (NORIA_TRANSFERT_MINISTERE=0).",trNone:"Pa gen transfè k ap tann.",
  approve:"Apwouve",refuse:"Refize",trWhy:"Rezon (obligatwa pou yon refi)",from:"Soti",to:"Ale",approved:"Lekòl orijin apwouve le",expires:"Ekspire le",
  verify:"Verifye",verHelp:"Kòd ki enprime anba QR la (relve, badj, sètifika transfè, bilten, resi) oswa tout lyen QR la.",photo:"Foto QR kòd la",reading:"N ap li QR la…",noQr:"Nou pa ka li QR la : tape kòd la.",
  authentic:"Dokiman otantik",invalid:"Dokiman chanje oswa anile",unknown:"Pa gen dokiman ki koresponn ak kòd sa a.",done:"Anrejistre.",err:"Erè : ",
  ident2:"Idantite",birth:"Nesans",sex:"Sèks",code2:"Kòd elèv",decision:"Desizyon",dated:"Le",account:"Kont",action:"Aksyon",detail:"Detay",
  student:"Fich elèv",notSent:"Pa transmèt : nòt, sante, fanmi, kontak, finans, prezans.",lang:"FR"}
};
const t=k=>T[L][k];
let ME=null, IDENT="", TAB="ensemble", F={annee:"",departement:"",commune:"",q:"",statut:""}, PENDING=null;

async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let body=null; try{ body=await r.json(); }catch(e){}
  return {status:r.status,body};
}
const post=(p,b)=>api(p,{method:"POST",body:JSON.stringify(b||{})});
const root=()=>$("minRoot");
function toast(m){ const d=document.createElement("div"); d.className="toast"; d.setAttribute("role","status"); d.textContent=m; document.body.appendChild(d); setTimeout(()=>d.remove(),3200); }
const pct=v=>v==null?"—":(Math.round(v*1000)/10).toLocaleString(L==="ht"?"fr-HT":"fr-FR")+" %";
const wcls=v=>"w"+(v==null?0:Math.min(100,Math.max(0,Math.round(v*10)*10)));
const num=n=>Number(n||0).toLocaleString("fr-FR");
const day=s=>esc(String(s||"").replace("T"," ").slice(0,16));
const badge=s=>`<span class="badge b-${esc(s||"aucune")}">${esc(t("st")[s||"aucune"]||s)}</span>`;
const mark=(e,cls="")=>`<span class="mark ${cls}" aria-hidden="true">${e.logo?`<img src="${esc(e.logo)}" alt="">`:esc(e.initiales||"?")}</span>`;
document.documentElement.lang=L==="ht"?"ht":"fr";

/* ---------- Connexion ---------- */
function loginView(step){
  root().innerHTML=`<div class="login"><div class="seal">MENFP</div><h1 class="center">${esc(t("title"))}</h1><p class="center mut small">${esc(t("sub"))}</p>
   <p class="box warn small">${esc(t("proto"))}</p>
   <div class="card">${step==="code"?`<form data-action-submit="NORIA_MIN.verify" novalidate><p class="small mut">${esc(t("sent"))}</p>
     <label>${esc(t("code"))}<input id="mCode" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label>
     <p id="mErr" class="small" role="alert"></p><div class="actions"><button type="submit">${esc(t("enter"))}</button><button type="button" class="ghost" data-action="NORIA_MIN.start">${esc(t("back"))}</button></div></form>`
   :`<form data-action-submit="NORIA_MIN.askCode" novalidate><label>${esc(t("ident"))}<input id="mIdent" autocomplete="username" value="${esc(IDENT)}" required></label>
     <p id="mErr" class="small" role="alert"></p><button type="submit">${esc(t("send"))}</button></form>`}</div>
   <p class="center"><button type="button" class="ghost" data-action="NORIA_MIN.lang">${esc(t("lang"))}</button></p></div>`;
  const f=$(step==="code"?"mCode":"mIdent"); if(f) f.focus();
}
async function askCode(){
  IDENT=$("mIdent").value.trim(); if(!IDENT) return;
  const r=await post("/api/ministere/login/code",{identifier:IDENT,lang:L}).catch(()=>null);
  if(!r){ $("mErr").textContent=t("net"); return; }
  if(r.status===429){ $("mErr").textContent=t("many"); return; }
  loginView("code");
}
async function verify(){
  const r=await post("/api/ministere/login",{identifier:IDENT,code:$("mCode").value.trim()}).catch(()=>null);
  if(!r){ $("mErr").textContent=t("net"); return; }
  if(r.status!==200){ $("mErr").textContent=r.status===429?t("many"):t("bad"); return; }
  start();
}
async function logout(){ await post("/api/ministere/logout").catch(()=>null); ME=null; loginView(); }

/* ---------- Coquille ---------- */
function shell(){
  const tabs=t("tabs");
  root().innerHTML=`<header class="m-top"><span class="seal" aria-hidden="true">MENFP</span><span class="ttl">${esc(t("title"))}<small>${esc(ME.nom)}${ME.titre?" · "+esc(ME.titre):""}</small></span>
    <button type="button" data-action="NORIA_MIN.lang">${esc(t("lang"))}</button><button type="button" data-action="NORIA_MIN.logout">${esc(t("logout"))}</button></header>
    <div class="m-proto">${esc(t("proto"))}</div>
    <nav class="m-nav" aria-label="${esc(t("title"))}">${Object.keys(tabs).map(k=>`<button type="button" class="${TAB===k?"on":""}" aria-current="${TAB===k?"page":"false"}" data-action="NORIA_MIN.go" data-a0="s:${k}">${esc(tabs[k])}</button>`).join("")}</nav>
    <main id="minMain" tabindex="-1"><p class="m-wait">…</p></main>`;
}
async function start(){
  const r=await api("/api/ministere/me").catch(()=>null);
  if(!r||r.status!==200) return loginView();
  ME=r.body; route();
}
function route(){
  const h=decodeURIComponent(location.hash.slice(1));
  const [k,v]=h.split("=");
  TAB=["ensemble","declarations","transferts","verifier","journal"].includes(k)?k:(k==="ecole"?"ensemble":k==="declaration"?"declarations":"ensemble");
  shell();
  if(k==="ecole"&&v) return ecole(Number(v),F.annee);
  if(k==="declaration"&&v) return declaration(Number(v));
  return ({ensemble,declarations,transferts,verifier,journal})[TAB]();
}
function go(k){ if(location.hash==="#"+k) route(); else location.hash=k; }
const main=()=>$("minMain");
const fail=r=>{ if(r&&r.status===401){ loginView(); return true; } if(!r||r.status!==200){ main().innerHTML=`<div class="box bad">${esc(t("err"))}${esc((r&&r.body&&r.body.error)||t("net"))}</div>`; return true; } return false; };

/* ---------- Vue d'ensemble ---------- */
async function ensemble(){
  const qs=new URLSearchParams(Object.entries(F).filter(([,v])=>v)).toString();
  const r=await api("/api/ministere/ecoles"+(qs?"?"+qs:"")).catch(()=>null);
  if(fail(r)) return;
  const d=r.body, s=d.totaux; F.annee=d.annee||"";
  const opt=(v,lab,cur)=>`<option value="${esc(v)}"${v===cur?" selected":""}>${esc(lab)}</option>`;
  main().innerHTML=`<h1>${esc(t("tabs").ensemble)} · ${esc(d.annee||"")}</h1>
   <div class="kpis"><div class="kpi"><b>${num(s.ecoles)}</b><span>${esc(t("schools"))}</span></div><div class="kpi"><b>${num(s.effectif)}</b><span>${esc(t("students"))} · ${num(s.filles)} ${esc(t("girls"))} / ${num(s.garcons)} ${esc(t("boys"))}</span></div>
    <div class="kpi"><b>${num(s.classes)}</b><span>${esc(t("classes"))}</span></div><div class="kpi"><b>${pct(s.taux)}</b><span>${esc(t("success"))}</span><div class="bar"><i class="${wcls(s.taux)}"></i></div></div>
    <div class="kpi"><b>${num(s.declarations)} / ${num(s.ecoles)}</b><span>${esc(t("decl"))} · ${num(s.recues)} ${esc(t("st").recue.toLowerCase())}</span></div></div>
   <form class="card filters" data-action-submit="NORIA_MIN.filter" data-action-change="NORIA_MIN.filter" data-a0="e">
    <label>${esc(t("year"))}<select name="annee">${d.annees.map(a=>opt(a,a,d.annee)).join("")}</select></label>
    <label>${esc(t("dept"))}<select name="departement">${opt("",t("all"),F.departement)}${d.departements.map(x=>opt(x.id,x.nom,F.departement)).join("")}</select></label>
    <label>${esc(t("commune"))}<select name="commune">${opt("",t("allf"),F.commune)}${d.communes.map(c=>opt(c,c,F.commune)).join("")}</select></label>
    <label>${esc(t("status"))}<select name="statut">${opt("",t("all"),F.statut)}${["aucune","envoyee","recue","correction_demandee"].map(k=>opt(k,t("st")[k],F.statut)).join("")}</select></label>
    <label class="wide">${esc(t("search"))}<input name="q" type="search" value="${esc(F.q)}" enterkeyhint="search"></label></form>
   <p class="small mut">${esc(t("agg"))}</p>
   <div class="list">${d.ecoles.map(e=>`<button type="button" class="school" data-action="NORIA_MIN.go" data-a0="s:ecole=${e.id}">${mark(e)}
     <span><span class="row sp"><span class="nm">${esc(e.nom)}</span>${badge(e.declaration&&e.declaration.statut)}</span>
     <span class="small mut">${esc([e.commune,(d.departements.find(x=>x.id===e.departement)||{}).nom].filter(Boolean).join(", ")||"—")}</span>
     <span class="stats"><span><b>${num(e.effectif)}</b> ${esc(t("students").toLowerCase())}</span><span>${num(e.filles)} F · ${num(e.garcons)} G</span><span><b>${num(e.classes)}</b> ${esc(t("classes").toLowerCase())}</span><span>${esc(t("success"))} <b>${pct(e.taux)}</b></span></span>
     <span class="bar"><i class="${wcls(e.taux)}"></i></span></span></button>`).join("")||`<p class="mut">${esc(t("none"))}</p>`}</div>`;
}
let FT=null;
function filter(ev){
  const f=ev&&ev.target&&ev.target.closest?ev.target.closest("form"):null; if(!f) return;
  const nf={annee:f.annee.value,departement:f.departement.value,commune:f.commune.value,q:f.q.value.trim(),statut:f.statut.value};
  if(nf.departement!==F.departement) nf.commune="";
  const typing=ev.type==="change"&&ev.target.name==="q";
  F=nf; clearTimeout(FT); FT=setTimeout(ensemble,typing?250:0);
}

/* ---------- Fiche école ---------- */
async function ecole(id,annee){
  const r=await api(`/api/ministere/ecoles/${id}${annee?"?annee="+encodeURIComponent(annee):""}`).catch(()=>null);
  if(fail(r)) return;
  const d=r.body, e=d.ecole, s=d.totaux;
  main().innerHTML=`<p><button type="button" class="link" data-action="NORIA_MIN.go" data-a0="s:ensemble">← ${esc(t("tabs").ensemble)}</button></p>
   <div class="card"><div class="row">${mark(e,"lg")}<div><h1>${esc(e.nom)}</h1><p class="small mut">${esc([e.adresse,e.commune,e.departement_nom].filter(Boolean).join(" · "))}</p>
    <p class="small mut">${esc([e.email,e.telephone].filter(Boolean).join(" · "))}</p></div></div>
    ${d.annees.length>1?`<label>${esc(t("year"))}<select data-action-change="NORIA_MIN.year" data-a0="n:${e.id}" data-a1="v">${d.annees.map(a=>`<option${a===d.annee?" selected":""}>${esc(a)}</option>`).join("")}</select></label>`:`<p class="small">${esc(t("year"))} : <b>${esc(d.annee||"—")}</b></p>`}</div>
   <div class="kpis"><div class="kpi"><b>${num(s.total)}</b><span>${esc(t("students"))} · ${num(s.filles)} F / ${num(s.garcons)} G</span></div><div class="kpi"><b>${num(d.classes.length)}</b><span>${esc(t("classes"))}</span></div>
    <div class="kpi"><b>${pct(s.taux)}</b><span>${esc(t("success"))}</span><div class="bar"><i class="${wcls(s.taux)}"></i></div></div><div class="kpi"><b>${num(d.personnel.total)}</b><span>${esc(t("staff"))}</span></div>
    <div class="kpi"><b>${d.declarations[0]?badge(d.declarations[0].statut):badge("")}</b><span>${esc(t("status"))}</span></div></div>
   <div class="card"><h2>${esc(t("byClass"))}</h2><p class="small mut">${esc(t("agg"))}</p><div class="scroll"><table class="tbl"><thead><tr><th>${esc(t("classes"))}</th><th class="n">${esc(t("students"))}</th><th class="n">F / G</th><th class="n">${esc(t("admis"))}</th><th class="n">${esc(t("redouble"))}</th><th class="n">${esc(t("echec"))}</th><th class="n">${esc(t("rate"))}</th><th></th></tr></thead><tbody>
    ${d.classes.map(c=>`<tr><td><b>${esc(c.classe)}</b><br><small class="mut">${esc(c.niveau||"")}</small></td><td class="n">${num(c.total)}</td><td class="n">${num(c.filles)} / ${num(c.garcons)}</td><td class="n">${num(c.admis)}</td><td class="n">${num(c.redouble)}</td><td class="n">${num(c.echec)}</td><td class="n">${pct(c.taux)}</td>
     <td><button type="button" class="ghost lk" data-action="NORIA_MIN.nominal" data-a0="n:${e.id}" data-a1="n:${c.id}" data-a2="s:${esc(c.classe)}">${esc(t("nominal"))}</button></td></tr>`).join("")}
    <tr class="tot"><td>${esc(t("total"))}</td><td class="n">${num(s.total)}</td><td class="n">${num(s.filles)} / ${num(s.garcons)}</td><td class="n">${num(s.admis)}</td><td class="n">${num(s.redouble)}</td><td class="n">${num(s.echec)}</td><td class="n">${pct(s.taux)}</td><td></td></tr></tbody></table></div></div>
   <div id="mNominal"></div>
   <div class="grid2"><div class="card"><h2>${esc(t("staff"))}</h2><dl class="kv">${Object.entries(d.personnel.par_role).map(([k,n])=>`<dt>${esc(t("roles")[k]||k)}</dt><dd>${num(n)}</dd>`).join("")||`<dt>—</dt><dd></dd>`}</dl></div>
    <div class="card"><h2>${esc(t("laur"))}</h2>${d.laureats.length?`<ul class="tl">${d.laureats.map(x=>`<li><b>${esc(x.nom)}</b> · ${esc(x.examen)} ${esc(x.annee)}${x.mention?" · "+esc(x.mention):""}</li>`).join("")}</ul>`:`<p class="mut small">${esc(t("noLaur"))}</p>`}</div></div>
   <div class="card"><h2>${esc(t("hist"))}</h2>${d.declarations.length?`<table class="tbl"><tbody>${d.declarations.map(x=>`<tr><td>${esc(x.annee)} · v${x.version}</td><td>${badge(x.statut)}</td><td class="small mut">${day(x.envoyee_le)}</td><td><button type="button" class="ghost lk" data-action="NORIA_MIN.go" data-a0="s:declaration=${x.id}">${esc(t("open"))}</button></td></tr>`).join("")}</tbody></table>`:`<p class="mut small">${esc(t("noHist"))}</p>`}</div>`;
}
function year(id,v){ F.annee=v; ecole(id,v); }

/* ---------- Motif (consultation nominative) ---------- */
function ask(title,cb,label=t("motif"),help=t("motifHelp"),min=5){
  PENDING={cb,min};
  const d=document.createElement("div"); d.className="dlg"; d.id="mDlg"; d.setAttribute("role","dialog"); d.setAttribute("aria-modal","true"); d.setAttribute("aria-labelledby","mDlgT");
  d.innerHTML=`<div><h2 id="mDlgT">${esc(title)}</h2><form data-action-submit="NORIA_MIN.askOk" novalidate><label>${esc(label)}<textarea id="mMotif" rows="3" maxlength="300" required></textarea></label>
   <p class="small mut">${esc(help)}</p><p id="mDlgErr" class="small" role="alert"></p><div class="actions"><button type="submit">${esc(t("confirm"))}</button><button type="button" class="ghost" data-action="NORIA_MIN.askClose">${esc(t("cancel"))}</button></div></form></div>`;
  document.body.appendChild(d); $("mMotif").focus();
}
function askClose(){ PENDING=null; const d=$("mDlg"); if(d) d.remove(); }
async function askOk(){
  const v=$("mMotif").value.trim(); if(!PENDING) return;
  if(v.length<PENDING.min){ $("mDlgErr").textContent=t("motif"); return; }
  const cb=PENDING.cb; askClose(); await cb(v);
}
function nominal(sid,cid,nom){
  ask(`${t("nominal")} · ${nom}`,async(motif)=>{
    const r=await post(`/api/ministere/ecoles/${sid}/classes/${cid}/eleves`,{motif}).catch(()=>null);
    const el=$("mNominal"); if(!el) return;
    if(!r||r.status!==200){ el.innerHTML=`<div class="box bad">${esc(t("err"))}${esc((r&&r.body&&r.body.error)||t("net"))}</div>`; return; }
    const d=r.body;
    el.innerHTML=`<div class="card"><div class="row sp"><h2>${esc(t("nominal"))} · ${esc(d.classe)} (${esc(d.annee)})</h2><button type="button" class="ghost" data-action="vider" data-a0="s:#mNominal">×</button></div>
     <p class="box info small">${esc(t("motif").replace(/ \(.*\)/,""))} : ${esc(d.motif)}</p><div class="scroll"><table class="tbl"><thead><tr><th>${esc(t("code2"))}</th><th>${esc(t("ident2"))}</th><th>${esc(t("birth"))}</th><th>${esc(t("sex"))}</th><th>${esc(t("decision"))}</th><th></th></tr></thead><tbody>
     ${d.eleves.map(x=>`<tr><td>${esc(x.code)}</td><td><b>${esc(x.nom)}</b> ${esc(x.prenom)}</td><td>${esc(x.naissance||"—")}</td><td>${esc(x.sexe||"—")}</td><td>${esc(x.decision||"—")}</td><td><button type="button" class="ghost lk" data-action="NORIA_MIN.student" data-a0="n:${x.id}" data-a1="s:${esc(x.prenom+" "+x.nom)}">${esc(t("open"))}</button></td></tr>`).join("")}</tbody></table></div></div>`;
    el.scrollIntoView({behavior:"smooth",block:"start"});
  });
}
function student(id,nom){
  ask(`${t("student")} · ${nom}`,async(motif)=>{
    const r=await post(`/api/ministere/eleves/${id}`,{motif}).catch(()=>null);
    const el=$("mNominal"); if(!el) return;
    if(!r||r.status!==200){ toast(t("err")+((r&&r.body&&r.body.error)||t("net"))); return; }
    const d=r.body, e=d.eleve;
    el.insertAdjacentHTML("afterbegin",`<div class="card"><div class="row sp"><h2>${esc(t("student"))} · ${esc(e.prenom)} ${esc(e.nom)}</h2><button type="button" class="ghost" data-action="retirer" data-a0="s:.card">×</button></div>
     <dl class="kv"><dt>${esc(t("code2"))}</dt><dd>${esc(e.code)}</dd><dt>${esc(t("birth"))}</dt><dd>${esc(e.naissance||"—")}</dd><dt>${esc(t("sex"))}</dt><dd>${esc(e.sexe||"—")}</dd><dt>${esc(t("schools"))}</dt><dd>${esc(e.ecole)}</dd></dl>
     <h3>${esc(t("classes"))}</h3><ul class="tl">${d.classes.map(c=>`<li>${esc(c.annee)} · ${esc(c.classe)} <small class="mut">${esc(c.status)}</small></li>`).join("")}</ul>
     <h3>${esc(t("decision"))}</h3><ul class="tl">${d.decisions.map(c=>`<li>${esc(c.annee)} · ${esc(c.decision)}</li>`).join("")||"<li>—</li>"}</ul><p class="small mut">${esc(t("notSent"))}</p></div>`);
  });
}

/* ---------- Déclarations ---------- */
async function declarations(){
  const r=await api("/api/ministere/declarations").catch(()=>null);
  if(fail(r)) return;
  const list=r.body.declarations;
  main().innerHTML=`<h1>${esc(t("tabs").declarations)}</h1><div class="list">${list.map(x=>`<button type="button" class="school" data-action="NORIA_MIN.go" data-a0="s:declaration=${x.id}"><span class="mark">${esc(x.annee.slice(2,4)+"/"+x.annee.slice(-2))}</span>
    <span><span class="row sp"><span class="nm">${esc(x.ecole)}</span>${badge(x.statut)}</span><span class="small mut">${esc(x.annee)} · ${esc(t("version"))} ${x.version} · ${day(x.envoyee_le)}</span><span class="small mut">${esc(t("sentBy"))} ${esc(x.signataire||"—")}</span></span></button>`).join("")||`<p class="mut">${esc(t("noHist"))}</p>`}</div>`;
}
async function declaration(id){
  const r=await api(`/api/ministere/declarations/${id}`).catch(()=>null);
  if(fail(r)) return;
  const d=r.body, x=d.dossier, e=x.effectifs, s=x.resultats;
  main().innerHTML=`<p><button type="button" class="link" data-action="NORIA_MIN.go" data-a0="s:declarations">← ${esc(t("tabs").declarations)}</button></p>
   <div class="card"><div class="row sp"><h1>${esc(d.ecole)}</h1>${badge(d.statut)}</div><p class="small mut">${esc(t("year"))} ${esc(d.annee)} · ${esc(t("version"))} ${d.version} · ${esc(t("sentBy"))} ${esc(d.signataire||"—")} ${esc(t("sentOn"))} ${day(d.envoyee_le)}</p>
    <div class="box ${d.signature.valide?"ok":"bad"}"><b>${esc(t("sig"))}</b> · ${esc(d.signature.valide?t("sigOk"):t("sigKo"))}<br><small>Ed25519 · ${esc(d.signature.cle)} · SHA-256 ${esc(String(d.signature.empreinte).slice(0,16))}…</small></div>
    ${d.note_ministere?`<p class="box info small">${esc(t("note"))} : ${esc(d.note_ministere)}</p>`:""}
    <div class="actions"><a class="lk" href="/api/ministere/declarations/${d.id}/pdf" download><button type="button" class="ghost" tabindex="-1">${esc(t("pdf"))}</button></a>
    ${d.statut==="envoyee"?`<button type="button" class="ok" data-action="NORIA_MIN.ack" data-a0="n:${d.id}">${esc(t("ack"))}</button><button type="button" class="bad" data-action="NORIA_MIN.corr" data-a0="n:${d.id}">${esc(t("corr"))}</button>`:""}</div></div>
   <div class="kpis"><div class="kpi"><b>${num(e.total)}</b><span>${esc(t("students"))} · ${num(e.filles)} F / ${num(e.garcons)} G</span></div><div class="kpi"><b>${num(e.classes.length)}</b><span>${esc(t("classes"))}</span></div>
    <div class="kpi"><b>${pct(s.taux_reussite)}</b><span>${esc(t("success"))}</span></div><div class="kpi"><b>${num(x.personnel.total)}</b><span>${esc(t("staff"))}</span></div><div class="kpi"><b>${num(x.laureats.length)}</b><span>${esc(t("laureats"))}</span></div></div>
   <div class="card"><h2>${esc(t("eff"))} & ${esc(t("res").toLowerCase())}</h2><div class="scroll"><table class="tbl"><thead><tr><th>${esc(t("classes"))}</th><th class="n">${esc(t("students"))}</th><th class="n">F / G</th><th class="n">${esc(t("admis"))}</th><th class="n">${esc(t("redouble"))}</th><th class="n">${esc(t("echec"))}</th><th class="n">${esc(t("nodec"))}</th><th class="n">${esc(t("rate"))}</th></tr></thead><tbody>
    ${e.classes.map((c,i)=>{ const q=s.classes[i]||{}; return `<tr><td><b>${esc(c.classe)}</b><br><small class="mut">${esc(c.niveau||"")}</small></td><td class="n">${num(c.total)}</td><td class="n">${num(c.filles)} / ${num(c.garcons)}</td><td class="n">${num(q.admis)}</td><td class="n">${num(q.redouble)}</td><td class="n">${num(q.echec)}</td><td class="n">${num(q.sans_decision)}</td><td class="n">${pct(q.taux)}</td></tr>`; }).join("")}
    <tr class="tot"><td>${esc(t("total"))}</td><td class="n">${num(e.total)}</td><td class="n">${num(e.filles)} / ${num(e.garcons)}</td><td class="n">${num(s.admis)}</td><td class="n">${num(s.redouble)}</td><td class="n">${num(s.echec)}</td><td class="n">${num(s.sans_decision)}</td><td class="n">${pct(s.taux_reussite)}</td></tr></tbody></table></div></div>
   <div class="grid2"><div class="card"><h2>${esc(t("pers"))}</h2><dl class="kv">${Object.entries(x.personnel.par_role).map(([k,n])=>`<dt>${esc(t("roles")[k]||k)}</dt><dd>${num(n)}</dd>`).join("")}</dl>
     <ul class="tl">${x.personnel.liste.map(p=>`<li>${esc(p.nom)} <small class="mut">${esc(p.roles.map(k=>t("roles")[k]||k).join(", "))}</small></li>`).join("")}</ul></div>
    <div class="card"><h2>${esc(t("laureats"))}</h2>${x.laureats.length?`<ul class="tl">${x.laureats.map(l=>`<li><b>${esc(l.nom)}</b> · ${esc(l.examen)} ${esc(l.annee)}${l.mention?" · "+esc(l.mention):""}</li>`).join("")}</ul>`:`<p class="mut small">${esc(t("noLaur"))}</p>`}
     <h2>${esc(t("events"))}</h2><ul class="tl">${d.evenements.map(v=>`<li class="${esc(v.actor)}">${day(v.created_at)} · ${esc(t("ev")[v.kind]||v.kind)}${v.note?` : <i>${esc(v.note)}</i>`:""}</li>`).join("")}</ul></div></div>`;
}
async function decide(id,op,note){
  const r=await post(`/api/ministere/declarations/${id}/${op}`,{note}).catch(()=>null);
  toast(r&&r.status===200?t("done"):t("err")+((r&&r.body&&r.body.error)||t("net"))); declaration(id);
}
function ack(id){ ask(t("ack"),n=>decide(id,"accuser",n),t("note"),"",0); }
function corr(id){ ask(t("corr"),n=>decide(id,"correction",n),t("noteReq"),"",5); }

/* ---------- Transferts ---------- */
async function transferts(){
  const r=await api("/api/ministere/transferts").catch(()=>null);
  if(fail(r)) return;
  const d=r.body;
  main().innerHTML=`<h1>${esc(t("tabs").transferts)}</h1>${!d.actif?`<p class="box info">${esc(t("trOff"))}</p>`:d.transferts.length?`<div class="list">${d.transferts.map(x=>`<div class="card"><p class="nm"><b>${esc(x.eleve)}</b> <small class="mut">${esc(x.code_eleve)}</small></p>
    <dl class="kv"><dt>${esc(t("from"))}</dt><dd>${esc(x.ecole_origine)}</dd><dt>${esc(t("to"))}</dt><dd>${esc(x.ecole_accueil)}</dd><dt>${esc(t("approved"))}</dt><dd>${day(x.approuve_le)}</dd><dt>${esc(t("expires"))}</dt><dd>${day(x.expire_le)}</dd></dl>
    <div class="actions"><button type="button" class="ok" data-action="NORIA_MIN.tr" data-a0="n:${x.id}" data-a1="s:approuver">${esc(t("approve"))}</button><button type="button" class="bad" data-action="NORIA_MIN.tr" data-a0="n:${x.id}" data-a1="s:refuser">${esc(t("refuse"))}</button></div></div>`).join("")}</div>`:`<p class="mut">${esc(t("trNone"))}</p>`}`;
}
function tr(id,decision){
  ask(decision==="approuver"?t("approve"):t("refuse"),async(motif)=>{
    const r=await post(`/api/ministere/transferts/${id}`,{decision,motif}).catch(()=>null);
    toast(r&&r.status===200?t("done"):t("err")+((r&&r.body&&r.body.error)||t("net"))); transferts();
  },t("trWhy"),"",decision==="refuser"?3:0);
}

/* ---------- Vérification ---------- */
function verifier(){
  main().innerHTML=`<h1>${esc(t("tabs").verifier)}</h1><div class="card"><form data-action-submit="NORIA_MIN.check" novalidate><label>${esc(t("verHelp"))}<input id="mVal" autocomplete="off" autocapitalize="characters" required></label>
   <div class="actions"><button type="submit">${esc(t("verify"))}</button><label class="ghost-file"><span class="sr">${esc(t("photo"))}</span><input type="file" accept="image/*" capture="environment" data-action-change="NORIA_MIN.photo" data-a0="t"></label></div></form>
   <p id="mVerMsg" class="small mut" role="status"></p></div><div id="mVerRes"></div>`;
}
async function check(val){
  const v=typeof val==="string"?val:$("mVal").value.trim(); if(!v) return;
  const r=await post("/api/ministere/verifier",{valeur:v}).catch(()=>null);
  const el=$("mVerRes"); if(!el) return;
  if(!r||r.status!==200){ el.innerHTML=`<div class="box bad">${esc(t("err"))}${esc((r&&r.body&&r.body.error)||t("net"))}</div>`; return; }
  const d=r.body;
  if(!d.trouve){ el.innerHTML=`<div class="box bad">${esc(t("unknown"))}</div>`; return; }
  const ok=d.authentique&&d.statut!=="annule"&&d.statut!=="modifie"&&d.statut!=="revoque";
  const rows=[["Type",d.document||d.type],["École",d.ecole],["Élève",d.eleve],["Période",d.periode||d.annee],["Émis le",d.emis_le],["Statut",d.statut],["Motif",d.motif],["Signature",d.signature?`${d.signature.algo} · ${d.signature.cle} · ${d.signature.valide?"✓":"✗"}`:null],["Ministère",d.ministere?`${d.ministere.algo} · ${d.ministere.cle} · ${d.ministere.valide?"✓":"✗"}`:null]].filter(x=>x[1]);
  el.innerHTML=`<div class="card"><div class="box ${ok?"ok":"bad"}"><b>${esc(ok?t("authentic"):t("invalid"))}</b></div><dl class="kv">${rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>`;
}
function loadDecoder(){ return window.NORIA_QR?Promise.resolve(window.NORIA_QR):new Promise((ok,ko)=>{ const s=document.createElement("script"); s.src="src/qr-decode.js"; s.onload=()=>ok(window.NORIA_QR); s.onerror=ko; document.head.appendChild(s); }); }
async function photo(input){
  const f=input.files&&input.files[0]; if(!f) return; const msg=$("mVerMsg"); msg.textContent=t("reading");
  try{
    const bmp=await createImageBitmap(f); let val=null;
    if("BarcodeDetector" in window){ try{ const bd=new window.BarcodeDetector({formats:["qr_code"]}); const r=await bd.detect(bmp); if(r&&r[0]) val=r[0].rawValue; }catch(e){} }
    if(!val){ const q=await loadDecoder(); const k=Math.min(1,900/Math.max(bmp.width,bmp.height)); const c=document.createElement("canvas"); c.width=Math.round(bmp.width*k); c.height=Math.round(bmp.height*k);
      const g=c.getContext("2d",{willReadFrequently:true}); g.drawImage(bmp,0,0,c.width,c.height); try{ val=q.decode(g.getImageData(0,0,c.width,c.height)); }catch(e){} }
    if(!val){ msg.textContent=t("noQr"); return; }
    msg.textContent=""; $("mVal").value=val; check(val);
  }catch(e){ msg.textContent=t("noQr"); }
  finally{ input.value=""; }
}

/* ---------- Journal ---------- */
async function journal(){
  const r=await api("/api/ministere/journal").catch(()=>null);
  if(fail(r)) return;
  main().innerHTML=`<h1>${esc(t("tabs").journal)}</h1><div class="card scroll"><table class="tbl"><thead><tr><th>${esc(t("dated"))}</th><th>${esc(t("action"))}</th><th>${esc(t("detail"))}</th></tr></thead><tbody>
   ${r.body.journal.map(x=>`<tr><td class="small">${day(x.created_at)}</td><td>${esc(x.action.replace("ministere.",""))}</td><td class="small">${esc(x.detail||"")}${x.outcome!=="ok"?` <span class="badge b-correction_demandee">${esc(x.outcome)}</span>`:""}</td></tr>`).join("")}</tbody></table></div>`;
}

function lang(){ L=L==="fr"?"ht":"fr"; try{ localStorage.setItem(LS,L); }catch(e){} document.documentElement.lang=L; if(ME) route(); else loginView(); }
window.NORIA_MIN=Object.freeze({askCode,verify,start:()=>loginView(),logout,go,filter,year,nominal,student,askOk,askClose,ack,corr,tr,check,photo,lang});
window.addEventListener("hashchange",()=>{ if(ME) route(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&$("mDlg")) askClose(); });
start();
})();

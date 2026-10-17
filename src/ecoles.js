/* NORIA — socle multi-écoles (mode serveur) : écran d'accueil aux couleurs de l'école (logo ou initiales, nom, devise,
   coordonnées), sélecteur d'école dans l'en-tête (personne membre de plusieurs écoles), sélecteur d'enfant pour les
   parents (enfants de plusieurs écoles). Le profil de l'école et l'import des élèves (direction, secrétariat) sont
   chargés à la demande (ecoles-gestion.js), comme l'administration de la plateforme (admin.js) : premier chargement léger. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{school:"École",switchSchool:"Changer d'école",kids:"Mes enfants",kidsHelp:"Choisissez un enfant : l'affichage se limite à lui.",all:"Tous",wait:"Chargement…",net:"Réseau nécessaire pour cette action.",
    welcome:"Bienvenue",active:"École active",code:"Code élève",loadErr:"Module indisponible hors ligne."},
  ht:{school:"Lekòl",switchSchool:"Chanje lekòl",kids:"Pitit mwen yo",kidsHelp:"Chwazi yon pitit : se li sèlman ki ap parèt.",all:"Tout",wait:"Ap chaje…",net:"Fò gen rezo pou aksyon sa a.",
    welcome:"Byenveni",active:"Lekòl ki aktif la",code:"Kòd elèv",loadErr:"Modil sa a pa disponib san entènèt."},
};
const t=k=>T[lang()][k];
let C={me:null,schools:[],kids:[],kid:null};
const KEY="noria_enfant";

async function post(path,body){
  const r=await fetch(path,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json","x-noria":"1"},body:JSON.stringify(body||{})});
  let b=null; try{ b=await r.json(); }catch(e){} return {status:r.status,body:b};
}
// Logo de l'école (servi par l'API, même origine) ou, à défaut, ses initiales.
function mark(s,cls){
  if(s&&s.logo) return `<img class="eco-logo ${cls||""}" src="${esc(s.logo)}" alt="" width="56" height="56">`;
  return `<span class="eco-ini ${cls||""}" aria-hidden="true">${esc((s&&s.initials)||"?")}</span>`;
}
function kidKey(k){ return k.school_id+":"+k.student_id; }
function selectedKid(kids,schoolId){
  let v=""; try{ v=sessionStorage.getItem(KEY)||""; }catch(e){}
  const k=kids.find(x=>kidKey(x)===v);
  return k&&k.school_id===schoolId?k:null;
}
// Contexte reçu de login.js après /api/me (aussi rejoué hors ligne depuis la copie locale).
function set(ctx){ C=Object.assign({me:null,schools:[],kids:[],kid:null},ctx||{}); headerSwitch(); }

function banner(){
  const me=C.me; if(!me||!me.school) return "";
  const s=me.school, info=[s.address,s.phone,s.email].filter(Boolean).map(esc).join(" · ");
  return `<section class="eco-banner" aria-label="${esc(t("school"))}">${mark(s,"eco-lg")}<div class="eco-txt"><p class="eco-hello small">${esc(t("welcome"))}, ${esc(me.name)}</p><h2 class="eco-name">${esc(s.name)}</h2>
    ${s.motto?`<p class="eco-motto">« ${esc(s.motto)} »</p>`:""}${info?`<p class="eco-info small">${info}</p>`:""}</div></section>${kidBar()}`;
}
// Sélecteur d'enfant (parent) : avatar aux initiales, nom, initiales de l'école ; « Tous » = enfants de l'école active.
function kidBar(){
  const kids=C.kids||[]; if(kids.length<2) return "";
  const cur=C.kid;
  const chip=(k,i)=>`<button type="button" class="eco-kid${cur&&kidKey(cur)===kidKey(k)?" on":""}" data-action="NORIA_ECO.pickKid" data-a0="n:${i}" aria-pressed="${cur&&kidKey(cur)===kidKey(k)?"true":"false"}"><span class="eco-av" aria-hidden="true">${esc(k.initials)}</span><span class="eco-kn"><b>${esc(k.first_name)} ${esc(k.last_name)}</b><small>${esc(k.school_initials)} · ${esc(k.code)}</small></span></button>`;
  return `<div class="eco-kids" role="group" aria-label="${esc(t("kids"))}"><p class="small mut">${esc(t("kidsHelp"))}</p><div class="eco-kidrow">
    <button type="button" class="eco-kid${cur?"":" on"}" data-action="NORIA_ECO.pickKid" data-a0="n:-1" aria-pressed="${cur?"false":"true"}"><span class="eco-av" aria-hidden="true">★</span><span class="eco-kn"><b>${esc(t("all"))}</b><small>${esc(C.me.school.initials||"")}</small></span></button>
    ${kids.map(chip).join("")}</div></div>`;
}
// Sélecteur d'école dans l'en-tête (puce utilisateur), si la personne a plusieurs écoles.
function headerSwitch(){
  const chip=document.getElementById("userChip"); if(!chip) return;
  let w=document.getElementById("ecoSwitch");
  const list=C.schools||[];
  if(list.length<2){ if(w) w.remove(); return; }
  if(!w){ w=document.createElement("label"); w.id="ecoSwitch"; w.className="eco-switch"; chip.insertBefore(w,chip.firstChild); }
  w.innerHTML=`<span class="sr-only">${esc(t("switchSchool"))}</span><select id="ecoSel" data-action-change="NORIA_ECO.switchSchool" data-a0="v" title="${esc(t("switchSchool"))}">${list.map(s=>`<option value="${s.school_id}"${s.active?" selected":""}>${esc(s.initials)} · ${esc(s.name)}</option>`).join("")}</select>`;
}
let restart=()=>location.reload();
async function switchSchool(id){
  id=Number(id); if(!id||(C.me&&C.me.schoolId===id)) return;
  if(!navigator.onLine){ toast(t("net")); headerSwitch(); return; }
  const r=await post("/api/session/ecole",{school_id:id}).catch(()=>null);
  if(!r||r.status!==200){ toast(t("net")); headerSwitch(); return; }
  if(window.NORIA_OFF) await NORIA_OFF.clearCache();
  await restart();
}
async function pickKid(i){
  const k=(C.kids||[])[i];
  try{ if(k) sessionStorage.setItem(KEY,kidKey(k)); else sessionStorage.removeItem(KEY); }catch(e){}
  if(k&&C.me&&k.school_id!==C.me.schoolId) return switchSchool(k.school_id);
  await restart();
}
function toast(m){ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),3500); }

// Chargement à la demande (même origine, conforme à la CSP script-src 'self').
const loaded={};
function load(src){
  if(!loaded[src]) loaded[src]=new Promise((ok,ko)=>{ const s=document.createElement("script"); s.src=src; s.onload=ok; s.onerror=()=>{ delete loaded[src]; ko(new Error(src)); }; document.head.appendChild(s); });
  return loaded[src];
}
// Vues « Profil de l'école » et « Import des élèves ».
function view(m){
  setTimeout(async()=>{
    const el=document.getElementById("ecoView"); if(!el) return;
    // Bloc 2 (recherche et scan, badges, relevés) : module séparé, lui aussi chargé à la demande.
    // Bloc 4 (transferts entre écoles) et bloc 5 (propositions pour le portail public) : idem.
    // Bloc 6 (déclaration annuelle au ministère) : idem.
    // Bloc 7 (adresses e-mail des élèves) : deux modules, direction et élève/parent.
    const b2=m==="scan"||m==="badges"||m==="releves", b4=m==="transferts", b5=m==="portail", b6=m==="declaration", b7=m==="emails", b7m=m==="monemail";
    try{ await load(b7?"src/emails-eleves.js":b7m?"src/mon-email.js":b6?"src/declaration.js":b5?"src/portail-ecole.js":b4?"src/transferts.js":b2?"src/badges.js":"src/ecoles-gestion.js"); if(document.getElementById("ecoView")===el) (b7?window.NORIA_EMAILS:b7m?window.NORIA_MYMAIL:b6?window.NORIA_DECL:b5?window.NORIA_PORT:b4?window.NORIA_TRF:b2?window.NORIA_BAD:window.NORIA_ECOG).render(m,el,C); }
    catch(e){ el.innerHTML=`<div class="badbox">${esc(t("loadErr"))}</div>`; }
  },0);
  return `<div id="ecoView" data-view="${esc(m)}"><p class="mut">${esc(t("wait"))}</p></div>`;
}

window.NORIA_ECO=Object.freeze({set,banner,mark,selectedKid,switchSchool,pickKid,view,load,ctx:()=>C,onRestart:fn=>{restart=fn;}});
})();

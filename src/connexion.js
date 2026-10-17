/* NORIA — « Connexion et appareils » (tous les comptes) et « Codes d'activation » (direction, secrétariat). Bloc 9 :
   codes de connexion gratuits. Chargé à la demande par ecoles.js (CSP script-src 'self', aucun style ni script en ligne).
   - Appareils de confiance (30 jours) : liste, révocation d'un appareil ou de tous.
   - Telegram : lien profond pour relier le compte au bot NORIA (codes reçus gratuitement), retrait de la liaison.
   - Codes d'activation : lot par classe (élèves ou parents), liste imprimable affichée UNE fois, suivi et annulation. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{devTitle:"Appareils de confiance",devHelp:"Sur ces appareils, NORIA se rouvre sans nouveau code pendant 30 jours. Retirez un appareil perdu, vendu ou partagé.",devNone:"Aucun appareil de confiance. Cochez « Faire confiance à cet appareil » à la connexion.",
    devThis:"cet appareil",devSince:"Depuis le",devLast:"Dernier usage",devUntil:"Jusqu'au",revoke:"Retirer",revokeAll:"Retirer tous les appareils",revoked:"Appareil retiré.",
    tgTitle:"Codes par Telegram (gratuit)",tgOn:"Votre compte est relié au bot NORIA : choisissez « Telegram » à la connexion pour recevoir le code.",tgOff:"Reliez votre compte une fois : ensuite, vos codes arrivent gratuitement dans Telegram.",
    tgLink:"Relier Telegram",tgOpen:"Ouvrir Telegram et appuyer sur « Démarrer »",tgWait:n=>`Lien valable ${n} minutes, une seule fois. Revenez ensuite ici.`,tgCheck:"J'ai appuyé sur « Démarrer »",tgUnlink:"Retirer la liaison Telegram",tgDone:"Liaison retirée.",
    waTitle:"Connexion par WhatsApp (gratuit)",waHelp:"À la connexion, choisissez « WhatsApp » : NORIA affiche un code que vous envoyez depuis le WhatsApp du téléphone de votre compte. Aucun frais.",
    net:"Réseau nécessaire pour cette action.",err:"Action impossible.",
    acTitle:"Codes d'activation imprimés",acHelp:"Pour les élèves et parents sans e-mail ni messagerie : un code par compte, à usage unique. Imprimez la liste et remettez chaque code en main propre. Un nouveau code annule le précédent.",
    acRole:"Pour",acEleve:"Élèves",acParent:"Parents",acClass:"Classe",acAll:"Toutes les classes",acDays:"Validité (jours, 90 au plus)",acGen:"Générer les codes",acPrint:"Imprimer la liste",acOnce:"Ces codes ne seront plus affichés : imprimez-les maintenant.",
    acCardHow:"Sur noriaedu.com/app, choisissez « J'ai un code de mon école », puis saisissez l'école et ce code.",acSchool:"École",acCode:"Code",acStudent:"Élève",acUntil:"Valable jusqu'au",acList:"Codes déjà émis",
    acState:"État",acValid:"valable",acUsed:"utilisé",acRevoked:"annulé",acExpired:"expiré",acCancel:"Annuler",acNone:"Aucun code émis.",acName:"Compte",acDate:"Émis le",acBy:"Par"},
  ht:{devTitle:"Aparèy konfyans",devHelp:"Sou aparèy sa yo, NORIA ap louvri san nouvo kòd pandan 30 jou. Retire yon aparèy ki pèdi, ki vann oswa plizyè moun itilize.",devNone:"Pa gen aparèy konfyans. Make « Fè aparèy sa a konfyans » lè w ap konekte.",
    devThis:"aparèy sa a",devSince:"Depi",devLast:"Dènye fwa",devUntil:"Jiska",revoke:"Retire",revokeAll:"Retire tout aparèy yo",revoked:"Aparèy la retire.",
    tgTitle:"Kòd pa Telegram (gratis)",tgOn:"Kont ou konekte ak bot NORIA a : chwazi « Telegram » lè w ap konekte pou w resevwa kòd la.",tgOff:"Konekte kont ou yon sèl fwa : apre sa, kòd ou yo ap rive gratis nan Telegram.",
    tgLink:"Konekte Telegram",tgOpen:"Louvri Telegram epi peze « Demarrer / Start »",tgWait:n=>`Lyen an bon pou ${n} minit, yon sèl fwa. Apre sa, retounen la a.`,tgCheck:"Mwen peze « Start »",tgUnlink:"Retire koneksyon Telegram nan",tgDone:"Koneksyon an retire.",
    waTitle:"Koneksyon ak WhatsApp (gratis)",waHelp:"Lè w ap konekte, chwazi « WhatsApp » : NORIA ap montre yon kòd pou w voye depi WhatsApp telefòn kont ou a. Pa gen frè.",
    net:"Fò gen rezo pou aksyon sa a.",err:"Aksyon sa a pa posib.",
    acTitle:"Kòd aktivasyon enprime",acHelp:"Pou elèv ak paran ki pa gen imèl ni mesajri : yon kòd pou chak kont, yon sèl fwa. Enprime lis la epi remèt chak kòd an men moun nan. Yon nouvo kòd anile ansyen an.",
    acRole:"Pou",acEleve:"Elèv",acParent:"Paran",acClass:"Klas",acAll:"Tout klas yo",acDays:"Valab (jou, 90 maksimòm)",acGen:"Kreye kòd yo",acPrint:"Enprime lis la",acOnce:"Kòd sa yo p ap parèt ankò : enprime yo kounye a.",
    acCardHow:"Sou noriaedu.com/app, chwazi « Mwen gen yon kòd lekòl mwen ban mwen », epi antre lekòl la ak kòd sa a.",acSchool:"Lekòl",acCode:"Kòd",acStudent:"Elèv",acUntil:"Bon jiska",acList:"Kòd ki deja bay",
    acState:"Eta",acValid:"valab",acUsed:"itilize",acRevoked:"anile",acExpired:"ekspire",acCancel:"Anile",acNone:"Pa gen kòd ki bay.",acName:"Kont",acDate:"Bay le",acBy:"Pa"},
};
const t=k=>(T[lang()]||T.fr)[k];
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.json(); }catch(e){} return {status:r.status,body:b};
}
const post=(p,b)=>api(p,{method:"POST",body:JSON.stringify(b||{})});
const day=v=>v?new Date(v).toLocaleDateString(lang()==="ht"?"fr-HT":"fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"—";
function toast(m){ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),3500); }

/* ---------- Connexion et appareils ---------- */
async function renderConnexion(el){
  const [dev,tg,cf]=await Promise.all([api("/api/me/appareils").catch(()=>null),api("/api/me/telegram").catch(()=>null),api("/api/config").catch(()=>null)]);
  if(!dev){ el.innerHTML=`<div class="badbox">${esc(t("net"))}</div>`; return; }
  const list=dev.status===200?dev.body:[];
  const canaux=(cf&&cf.status===200&&cf.body&&cf.body.canaux)||{};
  el.innerHTML=`<section class="card cnx-sec"><h2>${esc(t("devTitle"))}</h2><p class="small mut">${esc(t("devHelp"))}</p>
    ${list.length?`<ul class="cnx-list">${list.map(d=>`<li><b>${esc(d.label)}</b>${d.actuel?` <span class="cnx-tag">${esc(t("devThis"))}</span>`:""}
      <span class="small mut">${esc(t("devSince"))} ${esc(day(d.created_at))} · ${esc(t("devLast"))} ${esc(day(d.last_used_at))} · ${esc(t("devUntil"))} ${esc(day(d.expires_at))}</span>
      <button type="button" class="ghost cnx-rev" data-id="${Number(d.id)}">${esc(t("revoke"))}</button></li>`).join("")}</ul>
      <button type="button" class="ghost" id="cnxRevAll">${esc(t("revokeAll"))}</button>`:`<p class="small">${esc(t("devNone"))}</p>`}</section>
    ${tg&&tg.status===200?`<section class="card cnx-sec"><h2>${esc(t("tgTitle"))}</h2><p class="small">${esc(t(tg.body.relie?"tgOn":"tgOff"))}</p>
      <div id="cnxTg">${tg.body.relie?`<button type="button" class="ghost" id="cnxTgOff">${esc(t("tgUnlink"))}</button>`:`<button type="button" class="btn" id="cnxTgOn">${esc(t("tgLink"))}</button>`}</div></section>`:""}
    ${canaux.whatsapp?`<section class="card cnx-sec"><h2>${esc(t("waTitle"))}</h2><p class="small">${esc(t("waHelp"))}</p></section>`:""}`;
  el.querySelectorAll(".cnx-rev").forEach(b=>b.addEventListener("click",async()=>{ b.disabled=true;
    const r=await post(`/api/me/appareils/${b.dataset.id}/revoquer`).catch(()=>null);
    toast(!r?t("net"):r.status===200?t("revoked"):t("err")); renderConnexion(el); }));
  const all=el.querySelector("#cnxRevAll");
  if(all) all.addEventListener("click",async()=>{ all.disabled=true; const r=await post("/api/me/appareils/revoquer-tout").catch(()=>null); toast(!r?t("net"):r.status===200?t("revoked"):t("err")); renderConnexion(el); });
  const on=el.querySelector("#cnxTgOn");
  if(on) on.addEventListener("click",async()=>{ on.disabled=true;
    const r=await post("/api/me/telegram/lien").catch(()=>null);
    if(!r||r.status!==200){ on.disabled=false; toast(!r?t("net"):t("err")); return; }
    const box=el.querySelector("#cnxTg");
    box.innerHTML=`<a class="btn" href="${esc(r.body.url)}" target="_blank" rel="noopener noreferrer">${esc(t("tgOpen"))}</a><p class="small mut">${esc(t("tgWait")(r.body.minutes))}</p>
      <button type="button" class="ghost" id="cnxTgChk">${esc(t("tgCheck"))}</button>`;
    box.querySelector("#cnxTgChk").addEventListener("click",()=>renderConnexion(el)); });
  const offb=el.querySelector("#cnxTgOff");
  if(offb) offb.addEventListener("click",async()=>{ offb.disabled=true; const r=await post("/api/me/telegram/delier").catch(()=>null); toast(!r?t("net"):r.status===200?t("tgDone"):t("err")); renderConnexion(el); });
}

/* ---------- Codes d'activation (direction, secrétariat) ---------- */
function listHtml(rows){
  return `<h2>${esc(t("acList"))}</h2>${rows.length?`<div class="tablewrap"><table class="cnx-table"><thead><tr><th>${esc(t("acName"))}</th><th>${esc(t("acStudent"))}</th><th>${esc(t("acRole"))}</th><th>${esc(t("acDate"))}</th><th>${esc(t("acUntil"))}</th><th>${esc(t("acState"))}</th><th></th></tr></thead><tbody>
      ${rows.map(r=>{ const st=stateOf(r); return `<tr><td>${esc(r.name)}</td><td>${esc(r.student||"")} <span class="mut small">${esc(r.student_code||"")}</span></td><td>${esc(t(r.role==="eleve"?"acEleve":"acParent"))}</td>
        <td>${esc(day(r.created_at))}</td><td>${esc(day(r.expires_at))}</td><td>${esc(t(st))}</td><td>${st==="acValid"?`<button type="button" class="ghost cnx-cancel" data-id="${Number(r.id)}">${esc(t("acCancel"))}</button>`:""}</td></tr>`; }).join("")}
      </tbody></table></div>`:`<p class="small">${esc(t("acNone"))}</p>`}`;
}
function bindList(el){
  el.querySelectorAll(".cnx-cancel").forEach(b=>b.addEventListener("click",async()=>{ b.disabled=true; const r=await post(`/api/codes-activation/${b.dataset.id}/annuler`).catch(()=>null); if(!r||r.status!==200) toast(!r?t("net"):t("err")); refreshList(el); }));
}
async function refreshList(el){
  const ls=await api("/api/codes-activation").catch(()=>null); const sec=el.querySelector("#cnxListSec");
  if(ls&&ls.status===200&&sec){ sec.innerHTML=listHtml(ls.body); bindList(el); }
}
function stateOf(r){ if(r.used_at) return "acUsed"; if(r.revoked_at) return "acRevoked"; if(new Date(r.expires_at)<new Date()) return "acExpired"; return "acValid"; }
function sheet(res){
  // Feuille imprimable : une carte par code (nom, élève, classe, école, code, mode d'emploi, échéance).
  return `<div class="cnx-sheet" id="cnxSheet"><p class="cnx-once small">${esc(t("acOnce"))}</p>
    <button type="button" class="btn" id="cnxPrint">${esc(t("acPrint"))}</button>
    <div class="cnx-cards">${res.codes.map(c=>`<div class="cnx-card"><p class="cnx-card-school">${esc(res.school.name)} · <span class="mut">${esc(res.school.slug)}</span></p>
      <p><b>${esc(c.name)}</b></p><p class="small">${esc(t("acStudent"))} : ${esc(c.student)} (${esc(c.student_code)})${c.class?` · ${esc(c.class)}`:""}</p>
      <p class="cnx-code">${esc(c.code)}</p><p class="small">${esc(t("acCardHow"))}</p>
      <p class="small mut">${esc(t("acSchool"))} : ${esc(res.school.slug)} · ${esc(t("acUntil"))} ${esc(day(res.expiresAt))}</p></div>`).join("")}</div></div>`;
}
async function renderCodes(el){
  const [cl,ls]=await Promise.all([api("/api/classes").catch(()=>null),api("/api/codes-activation").catch(()=>null)]);
  if(!cl||!ls){ el.innerHTML=`<div class="badbox">${esc(t("net"))}</div>`; return; }
  if(ls.status!==200){ el.innerHTML=`<div class="badbox">${esc(t("err"))}</div>`; return; }
  const classes=cl.status===200?cl.body:[], rows=ls.body;
  el.innerHTML=`<section class="card cnx-sec"><h2>${esc(t("acTitle"))}</h2><p class="small mut">${esc(t("acHelp"))}</p>
    <form id="cnxGen" class="cnx-gen" novalidate>
      <label class="fld">${esc(t("acRole"))}<select id="cnxRole"><option value="eleve">${esc(t("acEleve"))}</option><option value="parent">${esc(t("acParent"))}</option></select></label>
      <label class="fld">${esc(t("acClass"))}<select id="cnxClass"><option value="">${esc(t("acAll"))}</option>${classes.map(c=>`<option value="${Number(c.id)}">${esc(c.name)}</option>`).join("")}</select></label>
      <label class="fld">${esc(t("acDays"))}<input id="cnxDays" type="number" min="1" max="90" value="30" inputmode="numeric"></label>
      <button type="submit" class="btn">${esc(t("acGen"))}</button></form><p id="cnxErr" class="login-err" role="alert"></p><div id="cnxOut"></div></section>
    <section class="card cnx-sec" id="cnxListSec">${listHtml(rows)}</section>`;
  bindList(el);
  el.querySelector("#cnxGen").addEventListener("submit",async e=>{ e.preventDefault();
    const err=el.querySelector("#cnxErr"); err.textContent="";
    const btn=el.querySelector("#cnxGen button"); btn.disabled=true;
    const cls=el.querySelector("#cnxClass").value;
    const r=await post("/api/codes-activation",{role:el.querySelector("#cnxRole").value,class_id:cls?Number(cls):undefined,days:Number(el.querySelector("#cnxDays").value)||30}).catch(()=>null);
    btn.disabled=false;
    if(!r||r.status!==200){ err.textContent=!r?t("net"):(r.body&&r.body.error)||t("err"); return; }
    const out=el.querySelector("#cnxOut"); out.innerHTML=sheet(r.body);
    refreshList(el);
    out.querySelector("#cnxPrint").addEventListener("click",()=>{ document.body.classList.add("cnx-printing"); window.print(); setTimeout(()=>document.body.classList.remove("cnx-printing"),500); });
  });
}
window.addEventListener("afterprint",()=>document.body.classList.remove("cnx-printing"));

function render(m,el){ el.innerHTML=`<p class="mut">…</p>`; return m==="codesActivation"?renderCodes(el):renderConnexion(el); }
window.NORIA_CNX=Object.freeze({render});
})();

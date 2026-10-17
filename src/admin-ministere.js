/* NORIA — Ministère / Ministè (super-admin, bloc 6, prototype). Chargé à la demande par admin.js, visible seulement
   quand NORIA_MINISTERE=1. Création des comptes du ministère (connexion par code à 6 chiffres sur /ministere),
   désactivation / réactivation avec motif, journal de toutes leurs consultations. CSP stricte. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const $=id=>document.getElementById(id);
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{title:"Comptes du ministère",help:"Les agents du ministère se connectent sur /ministere avec un code à 6 chiffres reçu par SMS (téléphone) ou e-mail. Lecture seule, agrégats par défaut ; toute consultation nominative exige un motif et apparaît aussi dans le journal de l'école.",
    open:"Ouvrir le portail du ministère",email:"E-mail",name:"Nom complet",phone:"Téléphone (facultatif, pour le code par SMS)",titleF:"Fonction (facultatif)",reason:"Motif",create:"Créer le compte",
    active:"Actif",off:"Désactivé",disable:"Désactiver",enable:"Réactiver",last:"Dernière connexion",consult:"actions journalisées",never:"jamais",journal:"Journal des consultations",
    none:"Aucun compte.",done:"Enregistré.",err:"Refusé : ",net:"Réseau indisponible.",trOn:"Étape ministère des transferts active : décision signée par un compte du ministère.",trOff:"Étape ministère des transferts désactivée (NORIA_TRANSFERT_MINISTERE=0)."},
  ht:{title:"Kont ministè a",help:"Ajan ministè yo konekte sou /ministere ak yon kòd 6 chif yo resevwa pa SMS (telefòn) oswa imèl. Se lekti sèlman, chif total pa defo ; chak konsiltasyon ak non elèv mande yon rezon epi li parèt tou nan jounal lekòl la.",
    open:"Louvri pòtay ministè a",email:"Imèl",name:"Non konplè",phone:"Telefòn (si ou vle, pou kòd pa SMS)",titleF:"Fonksyon (si ou vle)",reason:"Rezon",create:"Kreye kont lan",
    active:"Aktif",off:"Dezaktive",disable:"Dezaktive",enable:"Reaktive",last:"Dènye koneksyon",consult:"aksyon nan jounal",never:"janm",journal:"Jounal konsiltasyon yo",
    none:"Pa gen kont.",done:"Anrejistre.",err:"Refize : ",net:"Rezo a pa disponib.",trOn:"Etap ministè pou transfè yo aktif : yon kont ministè siyen desizyon an.",trOff:"Etap ministè pou transfè yo dezaktive (NORIA_TRANSFERT_MINISTERE=0)."}
};
const t=k=>T[lang()][k];
let EL=null;
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let body=null; try{ body=await r.json(); }catch(e){}
  return {status:r.status,body};
}
const post=(p,b)=>api(p,{method:"POST",body:JSON.stringify(b||{})}).catch(()=>null);
function toast(m){ const c=$("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
const dt=s=>esc(String(s||"").replace("T"," ").slice(0,16));

async function render(el){
  EL=el;
  const [a,j]=await Promise.all([api("/api/admin/ministere/comptes").catch(()=>null),api("/api/admin/ministere/journal").catch(()=>null)]);
  if(!EL.isConnected) return;
  if(!a||a.status!==200){ EL.innerHTML=`<div class="badbox">${esc((a&&a.body&&a.body.error)||t("net"))}</div>`; return; }
  const list=a.body.comptes, jr=(j&&j.status===200)?j.body.journal:[];
  EL.innerHTML=`<div class="card"><div class="row sp"><h3>${esc(t("title"))}</h3><a href="/ministere" target="_blank" rel="noopener">${esc(t("open"))}</a></div><p class="small mut">${esc(t("help"))}</p>
    <p class="small ${a.body.transferts?"":"mut"}">${esc(a.body.transferts?t("trOn"):t("trOff"))}</p>
    <form id="admMinNew" class="adm-new" data-action-submit="NORIA_ADM_MIN.create" novalidate>
     <label class="fld">${esc(t("email"))}<input name="email" type="email" required></label><label class="fld">${esc(t("name"))}<input name="name" required></label>
     <label class="fld">${esc(t("phone"))}<input name="phone" inputmode="tel"></label><label class="fld">${esc(t("titleF"))}<input name="title"></label>
     <label class="fld">${esc(t("reason"))}<input name="reason" required></label><button type="submit">${esc(t("create"))}</button></form></div>
   <div class="adm-list">${list.map(m=>`<div class="card adm-school ${m.state==="actif"?"":"adm-off"}"><div class="row sp"><span><b>${esc(m.display_name)}</b>${m.title?` · ${esc(m.title)}`:""}<br><small class="mut">${esc(m.email)}${m.phone?" · "+esc(m.phone):""}</small><br>
     <small class="mut">${esc(t("last"))} : ${m.derniere_connexion?dt(m.derniere_connexion):esc(t("never"))} · ${Number(m.consultations)} ${esc(t("consult"))}</small></span>
     <span class="badge ${m.state==="actif"?"b-paid":"b-unpaid"}">${esc(m.state==="actif"?t("active"):t("off"))}</span></div>${m.state_reason?`<p class="small mut">${esc(m.state_reason)}</p>`:""}
     <form class="adm-act" data-action-submit="NORIA_ADM_MIN.toggle" data-a0="n:${m.id}" data-a1="s:${m.state==="actif"?"desactiver":"reactiver"}" data-a2="e"><input name="reason" required placeholder="${esc(t("reason"))}" aria-label="${esc(t("reason"))}"><button type="submit" class="${m.state==="actif"?"danger":""}">${esc(m.state==="actif"?t("disable"):t("enable"))}</button></form></div>`).join("")||`<p class="mut">${esc(t("none"))}</p>`}</div>
   <div class="card"><h3>${esc(t("journal"))}</h3><table class="adm-tab">${jr.slice(0,150).map(x=>`<tr class="${x.outcome==="ok"?"":"adm-warn"}"><td><small>${dt(x.created_at)}</small></td><td>${esc(x.display_name)}</td><td>${esc(x.action.replace("ministere.",""))}</td><td><small>${esc(x.ecole||"")}</small></td><td><small>${esc(x.detail||"")}</small></td></tr>`).join("")}</table></div>`;
}
async function create(){
  const f=$("admMinNew");
  const b={email:f.email.value.trim(),name:f.name.value.trim(),phone:f.phone.value.trim(),title:f.title.value.trim(),reason:f.reason.value.trim()};
  const r=await post("/api/admin/ministere/comptes",b);
  toast(r&&r.status===200?t("done"):t("err")+((r&&r.body&&r.body.error)||t("net"))); if(r&&r.status===200) render(EL);
}
async function toggle(id,op,ev){
  const form=ev&&ev.target&&ev.target.closest?ev.target.closest("form"):null;
  const r=await post(`/api/admin/ministere/comptes/${id}/${op}`,{reason:form?form.reason.value.trim():""});
  toast(r&&r.status===200?t("done"):t("err")+((r&&r.body&&r.body.error)||t("net"))); if(r&&r.status===200) render(EL);
}
window.NORIA_ADM_MIN=Object.freeze({render,create,toggle});
})();

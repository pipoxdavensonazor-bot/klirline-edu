/* NORIA — administration de la plateforme (super-admin), ouverte par /#admin. Chargée à la demande.
   Connexion : mot de passe puis code à 6 chiffres (2FA obligatoire). Tableau de bord : écoles (créer, suspendre,
   réactiver avec motif), comptes, journal global, état du serveur, connexions échouées, emplacement « Assistant sécurité ». */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{title:"Administration de la plateforme",login:"Connexion administrateur",email:"E-mail",pw:"Mot de passe",next:"Continuer",code:"Code à 6 chiffres",codeSent:"Un code vient d'être envoyé (SMS ou e-mail). Valable 10 minutes.",verify:"Valider",
    bad:"Identifiants invalides.",badCode:"Code invalide ou expiré.",many:"Trop de tentatives. Réessayez plus tard.",net:"Serveur injoignable.",logout:"Se déconnecter",back:"Retour à NORIA",
    tabs:{ecoles:"Écoles",comptes:"Comptes",journal:"Journal global",etat:"État du serveur",echecs:"Connexions échouées",assistant:"Assistant sécurité"},
    readOnly:"Lecture seule par défaut : chaque consultation est journalisée. Les seules modifications possibles sont la création, la suspension et la réactivation d'une école, avec un motif.",
    slug:"Identifiant (ex. college-saint-pierre)",name:"Nom",initials:"Initiales (facultatif)",reason:"Motif (obligatoire)",create:"Créer l'école",suspend:"Suspendre",reactivate:"Réactiver",
    active:"Active",suspended:"Suspendue",students:"élèves",accounts:"comptes",search:"Rechercher (nom ou e-mail)",noPw:"sans mot de passe",
    dbSize:"Taille de la base",backups:"Sauvegardes",noBackup:"Dossier de sauvegarde non configuré (BACKUP_DIR).",last:"Dernière",migrations:"Migrations",uptime:"En service depuis",memory:"Mémoire",sessions:"Sessions ouvertes",ok:"OK",ko:"En panne",
    attempts:"Tentatives refusées (15 min)",schoolFails:"Écoles (7 derniers jours)",adminFails:"Administration",none:"Rien à signaler.",
    soon:"Emplacement réservé : l'assistant sécurité arrive au bloc 3 (analyse des connexions, recommandations).",done:"Enregistré.",err:"Refusé : "},
  ht:{title:"Administrasyon platfòm nan",login:"Koneksyon administratè",email:"Imèl",pw:"Modpas",next:"Kontinye",code:"Kòd 6 chif",codeSent:"Yon kòd fèk pati (SMS oswa imèl). Li bon pou 10 minit.",verify:"Valide",
    bad:"Idantifyan yo pa bon.",badCode:"Kòd la pa bon oswa li ekspire.",many:"Twòp eseye. Eseye pita.",net:"Sèvè a pa reponn.",logout:"Dekonekte",back:"Retounen nan NORIA",
    tabs:{ecoles:"Lekòl yo",comptes:"Kont yo",journal:"Jounal jeneral",etat:"Eta sèvè a",echecs:"Koneksyon ki echwe",assistant:"Asistan sekirite"},
    readOnly:"Pa defo se lekti sèlman : chak konsiltasyon anrejistre nan jounal la. Sèl chanjman ki posib : kreye, sispann ak reaktive yon lekòl, ak yon rezon.",
    slug:"Idantifyan (egz. college-saint-pierre)",name:"Non",initials:"Inisyal (si ou vle)",reason:"Rezon (obligatwa)",create:"Kreye lekòl la",suspend:"Sispann",reactivate:"Reaktive",
    active:"Aktif",suspended:"Sispann",students:"elèv",accounts:"kont",search:"Chèche (non oswa imèl)",noPw:"san modpas",
    dbSize:"Gwosè baz done a",backups:"Sovgad",noBackup:"Dosye sovgad la pa konfigire (BACKUP_DIR).",last:"Dènye",migrations:"Migrasyon",uptime:"Ap mache depi",memory:"Memwa",sessions:"Sesyon ki louvri",ok:"OK",ko:"An pann",
    attempts:"Eseye ki refize (15 min)",schoolFails:"Lekòl yo (7 dènye jou)",adminFails:"Administrasyon",none:"Pa gen anyen pou siyale.",
    soon:"Plas sa a rezève : asistan sekirite a ap vini nan blòk 3 (analiz koneksyon, rekòmandasyon).",done:"Anrejistre.",err:"Refize : "},
};
const t=k=>T[lang()][k];
let TAB="ecoles", Q="", TICKET=null;
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.json(); }catch(e){} return {status:r.status,body:b};
}
const post=(p,b)=>api(p,{method:"POST",body:JSON.stringify(b||{})});
function root(){
  let el=document.getElementById("admApp");
  if(!el){ el=document.createElement("div"); el.id="admApp"; el.className="adm-app"; document.body.appendChild(el);
    [".topbar",".layout",".site-foot","#mnvBar","#mnav"].forEach(s=>{ const n=document.querySelector(s); if(n){ n.inert=true; n.hidden=true; } }); document.body.classList.add("adm-open"); }
  return el;
}
const langBtns=()=>`<div class="login-lang"><button type="button" data-action="NORIA_ADM.lang" data-a0="s:fr" aria-pressed="${lang()==="fr"}">FR</button><button type="button" data-action="NORIA_ADM.lang" data-a0="s:ht" aria-pressed="${lang()==="ht"}">HT</button></div>`;
function setLang(l){ const s=document.getElementById("langSel"); if(s) s.value=l; document.documentElement.lang=l==="ht"?"ht":"fr"; if(TICKET===null&&!document.getElementById("admDash")) loginView(); else if(TICKET) codeView(); else dash(); }

function loginView(){
  TICKET=null;
  root().innerHTML=`<div class="login-card adm-card"><img class="login-logo" src="src/noria-logo.png" alt="NORIA" width="160" height="60"><h1>${esc(t("login"))}</h1>
    <form id="admLogin" data-action-submit="NORIA_ADM.submitPw" novalidate><label class="fld">${esc(t("email"))}<input id="admEmail" type="email" autocomplete="username" required></label>
    <label class="fld">${esc(t("pw"))}<input id="admPw" type="password" autocomplete="current-password" required></label><p id="admErr" class="login-err" role="alert"></p>
    <button type="submit" class="login-main">${esc(t("next"))}</button></form><a class="login-link" href="/">${esc(t("back"))}</a>${langBtns()}</div>`;
}
async function submitPw(){
  const err=document.getElementById("admErr"); err.textContent="";
  const r=await post("/api/admin/login",{email:document.getElementById("admEmail").value,password:document.getElementById("admPw").value}).catch(()=>null);
  if(!r){ err.textContent=t("net"); return; }
  if(r.status!==200){ err.textContent=r.status===429?t("many"):t("bad"); return; }
  TICKET=r.body.ticket; codeView();
}
function codeView(){
  root().innerHTML=`<div class="login-card adm-card"><h1>${esc(t("login"))}</h1><p class="login-ok">${esc(t("codeSent"))}</p>
    <form id="admCode" data-action-submit="NORIA_ADM.submitCode" novalidate><label class="fld">${esc(t("code"))}<input id="admOtp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></label>
    <p id="admErr" class="login-err" role="alert"></p><button type="submit" class="login-main">${esc(t("verify"))}</button></form>${langBtns()}</div>`;
}
async function submitCode(){
  const err=document.getElementById("admErr");
  const r=await post("/api/admin/login/code",{ticket:TICKET,code:document.getElementById("admOtp").value}).catch(()=>null);
  if(!r){ err.textContent=t("net"); return; }
  if(r.status!==200){ err.textContent=r.status===429?t("many"):t("badCode"); return; }
  TICKET=false; dash();
}
const fmtB=n=>n==null?"—":n>1048576?(n/1048576).toFixed(1)+" Mo":Math.ceil(n/1024)+" Ko";
const dt=s=>esc(String(s||"").replace("T"," ").slice(0,16));
async function panel(){
  if(TAB==="assistant") return `<div class="card adm-soon" id="admAssistant"><h3>${esc(t("tabs").assistant)}</h3><p class="mut">${esc(t("soon"))}</p></div>`;
  const path={ecoles:"/api/admin/ecoles",comptes:"/api/admin/comptes?q="+encodeURIComponent(Q),journal:"/api/admin/journal",etat:"/api/admin/etat",echecs:"/api/admin/echecs"}[TAB];
  const r=await api(path).catch(()=>null);
  if(!r) return `<div class="badbox">${esc(t("net"))}</div>`;
  if(r.status===401){ loginView(); return null; }
  const d=r.body;
  if(TAB==="ecoles") return `<div class="card"><form id="admNew" class="adm-new" data-action-submit="NORIA_ADM.create" novalidate>
      <label class="fld">${esc(t("slug"))}<input name="slug" required pattern="[a-z0-9-]+"></label><label class="fld">${esc(t("name"))}<input name="name" required></label>
      <label class="fld">${esc(t("initials"))}<input name="initials" maxlength="6"></label><label class="fld">${esc(t("reason"))}<input name="reason" required></label>
      <button type="submit">${esc(t("create"))}</button></form></div>
    <div class="adm-list">${d.map(s=>`<div class="card adm-school ${s.status==="active"?"":"adm-off"}"><div class="row sp"><span class="row">${NORIA_ECO.mark({initials:s.initials||"?"},"eco-sm")}<span><b>${esc(s.name)}</b><br><small class="mut">${esc(s.slug)} · ${Number(s.students)} ${esc(t("students"))} · ${Number(s.accounts)} ${esc(t("accounts"))}</small></span></span>
      <span class="badge ${s.status==="active"?"b-paid":"b-unpaid"}">${esc(s.status==="active"?t("active"):t("suspended"))}</span></div>
      ${s.status_reason?`<p class="small mut">${esc(s.status_reason)}</p>`:""}
      <form class="adm-act" data-action-submit="NORIA_ADM.toggle" data-a0="n:${s.id}" data-a1="s:${s.status==="active"?"suspendre":"reactiver"}" data-a2="e:"><input name="reason" required placeholder="${esc(t("reason"))}" aria-label="${esc(t("reason"))}"><button type="submit" class="${s.status==="active"?"danger":""}">${esc(s.status==="active"?t("suspend"):t("reactivate"))}</button></form></div>`).join("")}</div>`;
  if(TAB==="comptes") return `<form class="row" data-action-submit="NORIA_ADM.search"><input id="admQ" value="${esc(Q)}" placeholder="${esc(t("search"))}" aria-label="${esc(t("search"))}"><button type="submit">OK</button></form>
    <div class="card"><table class="adm-tab">${d.map(p=>`<tr><td><b>${esc(p.display_name)}</b><br><small>${esc(p.email)}${p.has_password?"":" · "+esc(t("noPw"))}</small></td><td>${p.ecoles.map(e=>`<div>${esc(e.school)} <small class="mut">${esc(e.roles.join(", "))} · ${esc(e.state)}</small></div>`).join("")}</td></tr>`).join("")||`<tr><td>${esc(t("none"))}</td></tr>`}</table></div>`;
  if(TAB==="journal") return `<div class="card"><table class="adm-tab">${[...d.plateforme.map(x=>({at:x.created_at,who:"admin",what:x.action,on:x.target,why:x.detail,out:x.outcome})),...d.ecoles.map(x=>({at:x.created_at,who:x.school,what:x.action,on:`${x.record_type} ${x.record_id||""}`,why:x.reason,out:x.outcome}))]
      .sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,200).map(x=>`<tr class="${x.out==="ok"?"":"adm-warn"}"><td><small>${dt(x.at)}</small></td><td>${esc(x.who)}</td><td>${esc(x.what)}</td><td><small>${esc(x.on||"")}</small></td><td><small>${esc(x.why||"")}</small></td></tr>`).join("")}</table></div>`;
  if(TAB==="etat") return `<div class="grid g4" id="admEtat"><div class="card"><div class="kpi ${d.healthz.ok?"adm-ok":"adm-ko"}">${esc(d.healthz.ok?t("ok"):t("ko"))}</div><div class="kpi-sub">healthz · ${esc(d.healthz.db)}</div></div>
      <div class="card"><div class="kpi">${fmtB(d.taille_base)}</div><div class="kpi-sub">${esc(t("dbSize"))}</div></div>
      <div class="card"><div class="kpi">${d.sauvegardes.configure?Number(d.sauvegardes.count||0):"—"}</div><div class="kpi-sub">${esc(t("backups"))}${d.sauvegardes.last?` · ${esc(t("last"))} ${dt(d.sauvegardes.last.at)}`:""}</div></div>
      <div class="card"><div class="kpi">${Number(d.compteurs.sessions)}</div><div class="kpi-sub">${esc(t("sessions"))}</div></div></div>
      ${d.sauvegardes.configure?"":`<p class="warnbox small">${esc(t("noBackup"))}</p>`}
      <div class="card small">${esc(t("migrations"))} : ${esc(d.migrations.join(", "))}<br>Node ${esc(d.serveur.node)} · ${esc(t("uptime"))} ${Math.round(d.serveur.uptime_s/60)} min · ${esc(t("memory"))} ${Number(d.serveur.memoire_mo)} Mo<br>
      ${Number(d.compteurs.ecoles)} ${esc(t("tabs").ecoles)} · ${Number(d.compteurs.personnes)} ${esc(t("accounts"))} · ${Number(d.compteurs.eleves)} ${esc(t("students"))}</div>`;
  return `<div class="grid g2"><div class="card"><div class="kpi">${Number(d.tentatives_15_min)}</div><div class="kpi-sub">${esc(t("attempts"))}</div></div></div>
    <div class="card"><h3>${esc(t("schoolFails"))}</h3><table class="adm-tab">${d.ecoles.map(x=>`<tr><td><small>${dt(x.created_at)}</small></td><td>${esc(x.school)}</td><td><small>${esc(x.reason||"")}</small></td></tr>`).join("")||`<tr><td>${esc(t("none"))}</td></tr>`}</table></div>
    <div class="card"><h3>${esc(t("adminFails"))}</h3><table class="adm-tab">${d.admin.map(x=>`<tr><td><small>${dt(x.created_at)}</small></td><td>${esc(x.target||"")}</td><td><small>${esc(x.detail||"")}</small></td></tr>`).join("")||`<tr><td>${esc(t("none"))}</td></tr>`}</table></div>`;
}
async function dash(){
  const me=await api("/api/admin/me").catch(()=>null);
  if(!me||me.status!==200) return loginView();
  const tabs=t("tabs");
  root().innerHTML=`<div id="admDash" class="adm-dash"><header class="adm-top"><img class="brand-mark" src="src/noria-logo.png" alt="NORIA" width="107" height="40"><h1>${esc(t("title"))}</h1><span class="adm-who small">${esc(me.body.name)}</span>
    <span class="row"><button type="button" class="ghost" data-action="NORIA_ADM.lang" data-a0="s:${lang()==="ht"?"fr":"ht"}">${lang()==="ht"?"FR":"HT"}</button><button type="button" class="ghost" data-action="NORIA_ADM.logout">${esc(t("logout"))}</button></span></header>
    <nav class="adm-tabs" aria-label="${esc(t("title"))}">${Object.keys(tabs).map(k=>`<button type="button" class="${TAB===k?"on":""}" aria-pressed="${TAB===k}" data-action="NORIA_ADM.tab" data-a0="s:${k}">${esc(tabs[k])}</button>`).join("")}</nav>
    <p class="small mut">${esc(t("readOnly"))}</p><section id="admPanel" aria-live="polite"><p class="mut">…</p></section></div>`;
  const h=await panel(); const el=document.getElementById("admPanel"); if(h!=null&&el) el.innerHTML=h;
}
async function create(f){
  const form=document.getElementById("admNew");
  const b={slug:form.slug.value.trim(),name:form.name.value.trim(),initials:form.initials.value.trim(),reason:form.reason.value.trim(),lang:lang()};
  const r=await post("/api/admin/ecoles",b).catch(()=>null);
  toast(r&&r.status===200?t("done"):t("err")+((r&&r.body&&r.body.error)||t("net"))); if(r&&r.status===200) dash();
}
async function toggle(id,op,ev){
  const form=ev&&ev.target&&ev.target.closest?ev.target.closest("form"):null;
  const reason=form?form.reason.value.trim():"";
  const r=await post(`/api/admin/ecoles/${id}/${op}`,{reason}).catch(()=>null);
  toast(r&&r.status===200?t("done"):t("err")+((r&&r.body&&r.body.error)||t("net"))); if(r&&r.status===200) dash();
}
function toast(m){ let c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),3500); }
async function logout(){ await post("/api/admin/logout",{}).catch(()=>null); loginView(); }
function start(){ document.documentElement.dataset.backend="server"; const c=document.getElementById("loginScreen"); if(c) c.hidden=true; dash(); }
window.NORIA_ADM=Object.freeze({start,submitPw,submitCode,tab:k=>{TAB=k;dash();},lang:setLang,create,toggle:(id,op,...r)=>toggle(id,op,r[r.length-1]),search:()=>{Q=document.getElementById("admQ").value;dash();},logout});
})();

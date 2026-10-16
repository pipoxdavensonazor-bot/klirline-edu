/* NORIA — connexion au serveur.
   Si /api/config répond, la maquette passe en « mode serveur » : connexion obligatoire, rôle imposé par le serveur,
   élèves et classes lus depuis l'API. Sinon (fichier ouvert sans serveur), la démonstration locale reste inchangée. */
(function(){
"use strict";
const T={
  fr:{title:"Connexion à NORIA",school:"École",ident:"E-mail ou téléphone",pw:"Mot de passe",login:"Se connecter",forgot:"Mot de passe oublié ?",
      back:"Retour à la connexion",send:"Recevoir un lien",sent:"Si ce compte existe, un message vient d'être envoyé.",soon:"Bientôt : connexion par code à 6 chiffres reçu par SMS.",
      bad:"Identifiants invalides.",many:"Trop de tentatives. Réessayez plus tard.",net:"Serveur injoignable. Vérifiez la connexion.",
      demo:"Serveur de démonstration — comptes et données fictifs.",demoAcc:"Comptes de démonstration",demoPw:"Mot de passe de démonstration",
      logout:"Se déconnecter",invTitle:"Activer votre compte",resTitle:"Nouveau mot de passe",newPw:"Nouveau mot de passe (10 caractères minimum)",
      save:"Enregistrer",done:"C'est fait. Connectez-vous.",invalid:"Lien invalide ou expiré.",short:"10 caractères minimum.",first:"Première connexion : un réseau est nécessaire.",
      pendingOut:n=>`${n} saisie(s) pas encore envoyée(s). Elles partiront à la prochaine connexion de ce compte. Se déconnecter quand même ?`,
      offOut:"Hors ligne : vous ne pourrez pas vous reconnecter avant le retour du réseau. Se déconnecter ?",
      roles:{direction:"Direction",secretariat:"Secrétariat",enseignant:"Enseignant",comptabilite:"Comptabilité",bibliotheque:"Bibliothèque",parent:"Parent",eleve:"Élève"}},
  ht:{title:"Konekte nan NORIA",school:"Lekòl",ident:"Imèl oswa telefòn",pw:"Modpas",login:"Konekte",forgot:"Ou bliye modpas ou ?",
      back:"Retounen nan koneksyon",send:"Resevwa yon lyen",sent:"Si kont sa a egziste, yon mesaj fèk pati.",soon:"Talè : koneksyon ak yon kòd 6 chif pa SMS.",
      bad:"Idantifyan yo pa bon.",many:"Twòp eseye. Eseye pita.",net:"Sèvè a pa reponn. Tcheke koneksyon an.",
      demo:"Sèvè demonstrasyon — kont ak done yo fiktif.",demoAcc:"Kont demonstrasyon",demoPw:"Modpas demonstrasyon",
      logout:"Dekonekte",invTitle:"Aktive kont ou",resTitle:"Nouvo modpas",newPw:"Nouvo modpas (10 karaktè minimòm)",
      save:"Anrejistre",done:"Fini. Konekte kounye a.",invalid:"Lyen an pa bon oswa li ekspire.",short:"10 karaktè minimòm.",first:"Premye koneksyon : fò gen rezo.",
      pendingOut:n=>`${n} antre poko pati. Y ap pati lè kont sa a rekonekte. Dekonekte kanmenm ?`,
      offOut:"San entènèt : ou p ap ka rekonekte toutotan rezo a pa tounen. Dekonekte ?",
      roles:{direction:"Direksyon",secretariat:"Sekretarya",enseignant:"Pwofesè",comptabilite:"Kontablite",bibliotheque:"Bibliyotèk",parent:"Paran",eleve:"Elèv"}},
};
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const t=k=>(T[lang()]||T.fr)[k];
const esc=window.NORIA_U.esc;
let CONFIG=null;

async function api(path,opts={}){
  const ctl=new AbortController(); const tm=setTimeout(()=>ctl.abort(),8000);
  try{
    const r=await fetch(path,{credentials:"same-origin",cache:"no-store",signal:ctl.signal,...opts,
      headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
    let body=null; try{ body=await r.json(); }catch(e){}
    return {status:r.status,body};
  } finally { clearTimeout(tm); }
}
const post=(p,b)=>api(p,{method:"POST",body:JSON.stringify(b)});

function background(on){ [".topbar",".layout",".site-foot","#mnvBar"].forEach(s=>{ const n=document.querySelector(s); if(n) n.inert=on; }); }

function screen(html){
  let el=document.getElementById("loginScreen");
  if(!el){ el=document.createElement("div"); el.id="loginScreen"; el.className="login-screen"; document.body.appendChild(el); }
  el.innerHTML=`<div class="login-card" role="dialog" aria-modal="true" aria-labelledby="loginTitle">
    <img class="login-logo" src="src/noria-logo.png" alt="NORIA" width="160" height="60">
    ${CONFIG&&CONFIG.demo?`<p class="login-demo">${esc(t("demo"))}</p>`:""}${html}
    <div class="login-lang"><button type="button" data-lang="fr" aria-pressed="${lang()==="fr"}">FR</button><button type="button" data-lang="ht" aria-pressed="${lang()==="ht"}">HT</button></div></div>`;
  el.hidden=false; document.body.classList.add("login-open"); background(true);
  el.querySelectorAll("[data-lang]").forEach(b=>b.addEventListener("click",()=>{ window.KL&&KL.lang(b.dataset.lang); const cur=el.dataset.view; views[cur]&&views[cur](); }));
  const first=el.querySelector("input,select"); if(first) setTimeout(()=>first.focus(),30);
  return el;
}
function closeScreen(){ const el=document.getElementById("loginScreen"); if(el){ el.hidden=true; el.innerHTML=""; } document.body.classList.remove("login-open"); background(false); }

function schoolField(){
  if(CONFIG.ecoles&&CONFIG.ecoles.length) return `<label class="fld">${esc(t("school"))}<select id="lgSchool" autocomplete="organization">${CONFIG.ecoles.map(e=>`<option value="${esc(e.slug)}">${esc(e.name)}</option>`).join("")}</select></label>`;
  const last=localStorage.getItem("noria_ecole")||"";
  return `<label class="fld">${esc(t("school"))}<input id="lgSchool" required autocomplete="organization" autocapitalize="none" spellcheck="false" value="${esc(last)}" placeholder="ecole-a"></label>`;
}

const views={
  login(){
    const el=screen(`<h1 id="loginTitle">${esc(t("title"))}</h1>
      <form id="lgForm" novalidate>${schoolField()}
        <label class="fld">${esc(t("ident"))}<input id="lgId" required autocomplete="username" autocapitalize="none" spellcheck="false" inputmode="email"></label>
        <label class="fld">${esc(t("pw"))}<input id="lgPw" type="password" required autocomplete="current-password"></label>
        <p id="lgErr" class="login-err" role="alert"></p>
        <button type="submit" class="login-main">${esc(t("login"))}</button>
      </form>
      <button type="button" class="login-link" id="lgForgot">${esc(t("forgot"))}</button>
      <p class="login-soon">${esc(t("soon"))}</p>
      ${CONFIG.demo?`<details class="login-demo-acc"><summary>${esc(t("demoAcc"))}</summary><p class="small">${esc(t("demoPw"))} : <code>demo-fictif-2026</code></p><div class="login-acc">${["direction","secretariat","prof1","compta","biblio","parent1","eleve1"].map(h=>`<button type="button" data-acc="${h}">${h}</button>`).join("")}</div></details>`:""}`);
    el.dataset.view="login";
    el.querySelector("#lgForgot").addEventListener("click",views.forgot);
    el.querySelectorAll("[data-acc]").forEach(b=>b.addEventListener("click",()=>{ const sc=el.querySelector("#lgSchool").value; el.querySelector("#lgId").value=`${b.dataset.acc}@${sc.replace(/^ecole-/,"")}.exemple.invalid`; el.querySelector("#lgPw").focus(); }));
    el.querySelector("#lgForm").addEventListener("submit",async e=>{
      e.preventDefault(); const err=el.querySelector("#lgErr"); err.textContent="";
      const btn=el.querySelector(".login-main"); btn.disabled=true;
      try{
        const school=el.querySelector("#lgSchool").value.trim();
        const r=await post("/api/login",{school,identifier:el.querySelector("#lgId").value,password:el.querySelector("#lgPw").value});
        if(r.status===200){ try{localStorage.setItem("noria_ecole",school);}catch(x){} closeScreen(); await start(); return; }
        err.textContent=r.status===429?t("many"):t("bad");
      }catch(x){ err.textContent=t("net"); }
      finally{ btn.disabled=false; }
    });
  },
  forgot(){
    const el=screen(`<h1 id="loginTitle">${esc(t("forgot"))}</h1><form id="rcForm" novalidate>${schoolField()}
      <label class="fld">${esc(t("ident"))}<input id="rcId" required autocomplete="username" autocapitalize="none" inputmode="email"></label>
      <p id="rcMsg" class="login-ok" role="status"></p><button type="submit" class="login-main">${esc(t("send"))}</button></form>
      <button type="button" class="login-link" id="rcBack">${esc(t("back"))}</button>`);
    el.dataset.view="forgot";
    el.querySelector("#rcBack").addEventListener("click",views.login);
    el.querySelector("#rcForm").addEventListener("submit",async e=>{ e.preventDefault();
      const r=await post("/api/recovery/request",{school:el.querySelector("#lgSchool").value.trim(),identifier:el.querySelector("#rcId").value}).catch(()=>null);
      el.querySelector("#rcMsg").textContent=!r?t("net"):r.status===429?t("many"):t("sent"); });
  },
  token(kind,token){
    const el=screen(`<h1 id="loginTitle">${esc(kind==="invitation"?t("invTitle"):t("resTitle"))}</h1><form id="tkForm" novalidate>
      <label class="fld">${esc(t("newPw"))}<input id="tkPw" type="password" required minlength="10" autocomplete="new-password"></label>
      <p id="tkMsg" class="login-err" role="alert"></p><button type="submit" class="login-main">${esc(t("save"))}</button></form>`);
    el.dataset.view="login";
    el.querySelector("#tkForm").addEventListener("submit",async e=>{ e.preventDefault();
      const pw=el.querySelector("#tkPw").value; const msg=el.querySelector("#tkMsg");
      if(pw.length<10){ msg.textContent=t("short"); return; }
      const r=await post(kind==="invitation"?"/api/invitations/accept":"/api/recovery/reset",{token,password:pw}).catch(()=>null);
      if(r&&r.status===200){ history.replaceState(null,"",location.pathname); views.login(); document.getElementById("lgErr").textContent=t("done"); }
      else msg.textContent=r?t("invalid"):t("net"); });
  },
};

function userChip(me){
  const top=document.querySelector(".topbar"); if(!top) return;
  let chip=document.getElementById("userChip");
  if(!chip){ chip=document.createElement("div"); chip.id="userChip"; chip.className="user-chip"; const rs=document.getElementById("roleSel"); top.insertBefore(chip,rs||top.firstChild); }
  const role=["direction","secretariat","enseignant","comptabilite","bibliotheque","parent","eleve"].find(r=>me.roles.includes(r));
  chip.innerHTML=`<span class="user-name"><b>${esc(me.name)}</b><span class="user-role">${esc((t("roles")||{})[role]||role||"")}${CONFIG.demo?" · démo":""}</span></span><button type="button" id="lgOut" class="user-out">${esc(t("logout"))}</button>`;
  chip.querySelector("#lgOut").addEventListener("click",async()=>{
    const off=window.NORIA_OFF; const n=off?off.state().pending:0;
    if(n&&!window.confirm(t("pendingOut")(n))) return;
    if(!navigator.onLine&&!window.confirm(t("offOut"))) return;
    await post("/api/logout",{}).catch(()=>null);
    if(off) await off.clearCache();
    location.reload(); });
}

async function start(){
  const me=await api("/api/me");
  if(me.status!==200) return views.login();
  const [st,cl]=await Promise.all([api("/api/students"),api("/api/classes")]);
  const data={me:me.body,students:st.status===200?st.body:[],classes:cl.status===200?cl.body:[],demo:!!CONFIG.demo};
  window.KL.applyServer(data);
  userChip(me.body);
  // Copie de lecture pour rouvrir sans réseau (noria_cache_v1) ; effacée à la déconnexion.
  if(window.NORIA_OFF){ await NORIA_OFF.putCache("session",data); NORIA_OFF.init(me.body); }
}

// Sans réseau : on rouvre la dernière session connue (lecture seule côté serveur, saisies mises en file).
async function startOffline(){
  const data=window.NORIA_OFF?await NORIA_OFF.getCache("session"):null;
  document.documentElement.dataset.backend="server";
  if(!data){ CONFIG={demo:false,methods:["password"]}; views.login(); const e=document.getElementById("lgErr"); if(e) e.textContent=t("net")+" "+t("first"); return; }
  CONFIG={demo:data.demo,methods:["password"],offline:true};
  if(CONFIG.demo) document.documentElement.dataset.demo="1";
  window.KL.applyServer(data);
  userChip(data.me);
  NORIA_OFF.init(data.me);
}

function serverFooter(){
  const f=document.querySelector(".site-foot"); if(!f) return;
  f.innerHTML=lang()==="ht"
    ?"NORIA se yon pwodui <strong>Klirline Inc.</strong><br>Sèvè demonstrasyon : done fiktif. Elèv, klas ak prezans soti nan sèvè a ; lòt modil yo rete sou aparèy sa a."
    :"NORIA est un produit de <strong>Klirline Inc.</strong><br>Serveur de démonstration : données fictives. Élèves, classes et présences viennent du serveur ; les autres modules restent sur cet appareil.";
}

async function init(){
  if(!document.querySelector('meta[name="noria-server"]')) return; // fichiers statiques seuls : démonstration locale
  if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
  if(!navigator.onLine){ serverFooter(); return startOffline(); } // pas de requête inutile sans réseau
  try{
    const r=await api("/api/config");
    if(r.status!==200||!r.body||!Array.isArray(r.body.methods)) return; // pas de serveur : démonstration locale
    CONFIG=r.body;
  }catch(e){ serverFooter(); return startOffline(); }
  document.documentElement.dataset.backend="server";
  if(CONFIG.demo) document.documentElement.dataset.demo="1";
  serverFooter();
  const m=location.hash.match(/^#(invitation|recuperation)=([\w-]{20,})$/);
  if(m) return views.token(m[1],m[2]);
  if(!CONFIG.session){ if(window.NORIA_OFF) await NORIA_OFF.clearCache(); return views.login(); }
  try{ await start(); }catch(e){ views.login(); }
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();

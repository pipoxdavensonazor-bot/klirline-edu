/* NORIA — connexion au serveur.
   Si /api/config répond, la maquette passe en « mode serveur » : connexion obligatoire, rôle imposé par le serveur,
   élèves et classes lus depuis l'API. Sinon (fichier ouvert sans serveur), la démonstration locale reste inchangée. */
(function(){
"use strict";
const T={
  fr:{title:"Connexion à NORIA",school:"École",ident:"E-mail ou téléphone",pw:"Mot de passe",login:"Se connecter",forgot:"Mot de passe oublié ?",
      back:"Retour à la connexion",send:"Recevoir un lien",sent:"Si ce compte existe, un message vient d'être envoyé.",useCode:"Recevoir un code par SMS ou e-mail",usePw:"Se connecter avec le mot de passe",codeTitle:"Connexion par code",getCode:"Recevoir le code",codeHelp:"Nous envoyons un code à 6 chiffres au téléphone ou à l'e-mail du compte.",enterTitle:"Saisir le code",code:"Code à 6 chiffres",codeSent:(m)=>`Si ce compte existe, un code vient d'être envoyé. Il est valable ${m} minutes et ne sert qu'une fois.`,codeTo:"Envoyé à",verify:"Valider",resend:"Renvoyer le code",resendIn:n=>`Renvoyer le code dans ${n} s`,resent:"Nouveau code demandé. L'ancien ne marche plus.",badCode:"Code invalide ou expiré. Après 5 essais, demandez un nouveau code.",digits:"Saisissez les 6 chiffres.",change:"Changer d'identifiant",
      bad:"Identifiants invalides.",many:"Trop de tentatives. Réessayez plus tard.",net:"Serveur injoignable. Vérifiez la connexion.",
      demo:"Serveur de démonstration — comptes et données fictifs.",demoAcc:"Comptes de démonstration",demoPw:"Mot de passe de démonstration",
      logout:"Se déconnecter",invTitle:"Activer votre compte",resTitle:"Nouveau mot de passe",newPw:"Nouveau mot de passe (10 caractères minimum)",
      save:"Enregistrer",done:"C'est fait. Connectez-vous.",invalid:"Lien invalide ou expiré.",short:"10 caractères minimum.",first:"Première connexion : un réseau est nécessaire.",
      pendingOut:n=>`${n} saisie(s) pas encore envoyée(s). Elles partiront à la prochaine connexion de ce compte. Se déconnecter quand même ?`,
      offOut:"Hors ligne : vous ne pourrez pas vous reconnecter avant le retour du réseau. Se déconnecter ?",
      rOk:"Reçu authentique",rRev:"Reçu annulé",rNo:"Reçu n°",rAmt:"Montant",rNote:"Cette page confirme l'école, l'élève, le numéro et le montant du reçu. Aucune autre donnée n'est affichée.",vTitle:"Vérification d'un bulletin ou d'un reçu",vOk:"Bulletin authentique",vRev:"Bulletin annulé",vBad:"Code inconnu : ce document n'a pas été émis par NORIA.",vSchool:"École",vStudent:"Élève",vTerm:"Période",vDate:"Émis le",vWhy:"Motif",vNote:"Cette page confirme seulement l'école, l'élève et la période. Les notes ne sont jamais affichées ici.",bOk:"Badge valide",bExp:"Badge expiré",bRev:"Badge révoqué",bYear:"Année scolaire",bNote:"Cette page confirme seulement l'école, le prénom, l'année et le statut du badge. Aucune photo n'est affichée.",tOk:"Relevé de notes officiel authentique",tRev:"Relevé annulé",tMod:"Relevé modifié : signature invalide",tDoc:"Document",tFile:"Contrôler le fichier PDF reçu",tAuth:"✓ Fichier authentique : identique au document signé.",tAlt:"✕ Fichier modifié : il ne correspond pas au document signé.",tNote:"Cette page confirme l'école, l'élève, le type de document, la date et le statut. Les notes ne sont jamais affichées ici.",
      anySchool:"Toutes mes écoles",schoolOpt:"École (facultatif si vous n'en avez qu'une)",chooseTitle:"Choisissez une école",chooseHelp:"Votre compte est relié à plusieurs écoles. Vous pourrez changer d'école dans l'en-tête.",
      invBy:"vous invite à rejoindre NORIA",invAs:"Rôle",invHello:"Bonjour",existing:"Vous avez déjà un compte NORIA : saisissez votre mot de passe actuel pour relier cette école.",
      roles:{direction:"Direction",secretariat:"Secrétariat",enseignant:"Enseignant",comptabilite:"Comptabilité",bibliotheque:"Bibliothèque",parent:"Parent",eleve:"Élève"}},
  ht:{title:"Konekte nan NORIA",school:"Lekòl",ident:"Imèl oswa telefòn",pw:"Modpas",login:"Konekte",forgot:"Ou bliye modpas ou ?",
      back:"Retounen nan koneksyon",send:"Resevwa yon lyen",sent:"Si kont sa a egziste, yon mesaj fèk pati.",useCode:"Resevwa yon kòd pa SMS oswa imèl",usePw:"Konekte ak modpas",codeTitle:"Koneksyon ak kòd",getCode:"Resevwa kòd la",codeHelp:"N ap voye yon kòd 6 chif sou telefòn oswa imèl kont la.",enterTitle:"Antre kòd la",code:"Kòd 6 chif",codeSent:(m)=>`Si kont sa a egziste, yon kòd fèk pati. Li bon pou ${m} minit epi li sèvi yon sèl fwa.`,codeTo:"Voye bay",verify:"Valide",resend:"Voye kòd la ankò",resendIn:n=>`Voye kòd la ankò nan ${n} s`,resent:"Nouvo kòd mande. Ansyen an pa mache ankò.",badCode:"Kòd la pa bon oswa li ekspire. Apre 5 eseye, mande yon nouvo kòd.",digits:"Antre 6 chif yo.",change:"Chanje idantifyan",
      bad:"Idantifyan yo pa bon.",many:"Twòp eseye. Eseye pita.",net:"Sèvè a pa reponn. Tcheke koneksyon an.",
      demo:"Sèvè demonstrasyon — kont ak done yo fiktif.",demoAcc:"Kont demonstrasyon",demoPw:"Modpas demonstrasyon",
      logout:"Dekonekte",invTitle:"Aktive kont ou",resTitle:"Nouvo modpas",newPw:"Nouvo modpas (10 karaktè minimòm)",
      save:"Anrejistre",done:"Fini. Konekte kounye a.",invalid:"Lyen an pa bon oswa li ekspire.",short:"10 karaktè minimòm.",first:"Premye koneksyon : fò gen rezo.",
      pendingOut:n=>`${n} antre poko pati. Y ap pati lè kont sa a rekonekte. Dekonekte kanmenm ?`,
      offOut:"San entènèt : ou p ap ka rekonekte toutotan rezo a pa tounen. Dekonekte ?",
      rOk:"Resi otantik",rRev:"Resi anile",rNo:"Resi nimewo",rAmt:"Montan",rNote:"Paj sa a konfime lekòl la, elèv la, nimewo ak montan resi a sèlman. Okenn lòt enfòmasyon pa parèt.",vTitle:"Verifikasyon bilten oswa resi",vOk:"Bilten otantik",vRev:"Bilten anile",vBad:"Kòd sa a enkoni : se pa NORIA ki bay dokiman sa a.",vSchool:"Lekòl",vStudent:"Elèv",vTerm:"Peryòd",vDate:"Bay le",vWhy:"Rezon",vNote:"Paj sa a konfime lekòl la, elèv la ak peryòd la sèlman. Nòt yo pa janm parèt la.",bOk:"Badj valab",bExp:"Badj ekspire",bRev:"Badj revoke",bYear:"Ane lekòl",bNote:"Paj sa a konfime lekòl la, prenon an, ane a ak eta badj la sèlman. Okenn foto pa parèt.",tOk:"Relve nòt ofisyèl otantik",tRev:"Relve anile",tMod:"Relve a chanje : siyati a pa bon",tDoc:"Dokiman",tFile:"Kontwole fichye PDF ou resevwa a",tAuth:"✓ Fichye otantik : li menm jan ak dokiman ki siyen an.",tAlt:"✕ Fichye a chanje : li pa koresponn ak dokiman ki siyen an.",tNote:"Paj sa a konfime lekòl la, elèv la, kalite dokiman an, dat la ak eta a. Nòt yo pa janm parèt la.",
      anySchool:"Tout lekòl mwen yo",schoolOpt:"Lekòl (ou pa oblije mete l si se yon sèl ou genyen)",chooseTitle:"Chwazi yon lekòl",chooseHelp:"Kont ou konekte ak plizyè lekòl. W ap ka chanje lekòl nan antèt la.",
      invBy:"envite w antre nan NORIA",invAs:"Wòl",invHello:"Bonjou",existing:"Ou gen yon kont NORIA deja : antre modpas ou genyen kounye a pou konekte lekòl sa a.",
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
  el.querySelectorAll("[data-lang]").forEach(b=>b.addEventListener("click",()=>{ window.KL&&KL.lang(b.dataset.lang); const cur=el.dataset.view; if(cur==="verify") views.verify(views.verify.code); else if(cur==="enterView") views.enter({...views.enter.st,note:null}); else views[cur]&&views[cur](); }));
  const first=el.querySelector("input,select"); if(first) setTimeout(()=>first.focus(),30);
  return el;
}
function closeScreen(){ const el=document.getElementById("loginScreen"); if(el){ el.hidden=true; el.innerHTML=""; } document.body.classList.remove("login-open"); background(false); }

function schoolField(){
  // Identité globale : l'école est facultative (« Toutes mes écoles ») ; avec plusieurs écoles, un choix suit la connexion.
  if(CONFIG.ecoles&&CONFIG.ecoles.length) return `<label class="fld">${esc(t("school"))}<select id="lgSchool" autocomplete="organization">${CONFIG.ecoles.map(e=>`<option value="${esc(e.slug)}">${esc(e.name)}</option>`).join("")}<option value="">${esc(t("anySchool"))}</option></select></label>`;
  let last=""; try{ last=localStorage.getItem("noria_ecole")||""; }catch(e){}
  return `<label class="fld">${esc(t("schoolOpt"))}<input id="lgSchool" autocomplete="organization" autocapitalize="none" spellcheck="false" value="${esc(last)}" placeholder="ecole-a"></label>`;
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
      ${(CONFIG.methods||[]).includes("code6")?`<button type="button" class="login-alt" id="lgCode">${esc(t("useCode"))}</button>`:""}
      <button type="button" class="login-link" id="lgForgot">${esc(t("forgot"))}</button>
      ${CONFIG.demo?`<details class="login-demo-acc"><summary>${esc(t("demoAcc"))}</summary><p class="small">${esc(t("demoPw"))} : <code>demo-fictif-2026</code></p><div class="login-acc">${["direction","secretariat","prof1","compta","biblio","parent1","eleve1"].map(h=>`<button type="button" data-acc="${h}">${h}</button>`).join("")}</div></details>`:""}`);
    el.dataset.view="login";
    el.querySelector("#lgForgot").addEventListener("click",views.forgot);
    const lc=el.querySelector("#lgCode"); if(lc) lc.addEventListener("click",()=>views.code());
    el.querySelectorAll("[data-acc]").forEach(b=>b.addEventListener("click",()=>{ const sc=el.querySelector("#lgSchool").value||"ecole-a"; el.querySelector("#lgId").value=`${b.dataset.acc}@${sc.replace(/^ecole-/,"")}.exemple.invalid`; el.querySelector("#lgPw").focus(); }));
    el.querySelector("#lgForm").addEventListener("submit",async e=>{
      e.preventDefault(); const err=el.querySelector("#lgErr"); err.textContent="";
      const btn=el.querySelector(".login-main"); btn.disabled=true;
      try{
        const school=el.querySelector("#lgSchool").value.trim();
        const r=await post("/api/login",{school,identifier:el.querySelector("#lgId").value,password:el.querySelector("#lgPw").value});
        if(r.status===200){ try{localStorage.setItem("noria_ecole",school);}catch(x){} return afterLogin(r.body); }
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
      const r=await post("/api/recovery/request",{school:el.querySelector("#lgSchool").value.trim(),identifier:el.querySelector("#rcId").value,lang:lang()}).catch(()=>null);
      el.querySelector("#rcMsg").textContent=!r?t("net"):r.status===429?t("many"):t("sent"); });
  },
  // Code à 6 chiffres : 1) école + identifiant → envoi ; 2) saisie du code (renvoi après le délai indiqué par le serveur).
  code(pre){
    const el=screen(`<h1 id="loginTitle">${esc(t("codeTitle"))}</h1><p class="small mut">${esc(t("codeHelp"))}</p><form id="cdForm" novalidate>${schoolField()}
      <label class="fld">${esc(t("ident"))}<input id="cdId" required autocomplete="username" autocapitalize="none" spellcheck="false" inputmode="tel" value="${esc(pre&&pre.identifier||"")}"></label>
      <p id="cdErr" class="login-err" role="alert"></p><button type="submit" class="login-main">${esc(t("getCode"))}</button></form>
      <button type="button" class="login-link" id="cdBack">${esc(t("usePw"))}</button>`);
    el.dataset.view="code";
    if(pre&&pre.school){ const s=el.querySelector("#lgSchool"); if(s) s.value=pre.school; }
    el.querySelector("#cdBack").addEventListener("click",views.login);
    el.querySelector("#cdForm").addEventListener("submit",async e=>{ e.preventDefault();
      const school=el.querySelector("#lgSchool").value.trim(), identifier=el.querySelector("#cdId").value.trim(); const err=el.querySelector("#cdErr");
      if(!identifier){ err.textContent=t("bad"); return; }
      const btn=el.querySelector(".login-main"); btn.disabled=true;
      const r=await post("/api/login/code",{school,identifier,lang:lang()}).catch(()=>null); btn.disabled=false;
      if(!r){ err.textContent=t("net"); return; } if(r.status===429){ err.textContent=t("many"); return; }
      views.enter({school,identifier,minutes:(r.body&&r.body.minutes)||10,resendIn:(r.body&&r.body.resendIn)||60});
    });
  },
  enter(st){
    views.enter.st=st;
    const el=screen(`<h1 id="loginTitle">${esc(t("enterTitle"))}</h1>
      <p class="login-ok" id="cdSent" role="status">${esc(st.note||t("codeSent")(st.minutes))}</p><p class="small mut">${esc(t("codeTo"))} : <b>${esc(st.identifier)}</b></p>
      <form id="otpForm" novalidate><label class="fld">${esc(t("code"))}<input id="otpCode" class="otp-in" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="••••••" aria-describedby="cdSent"></label>
      <p id="otpErr" class="login-err" role="alert"></p><button type="submit" class="login-main">${esc(t("verify"))}</button></form>
      <button type="button" class="login-alt" id="otpResend" disabled></button>
      <button type="button" class="login-link" id="otpChange">${esc(t("change"))}</button>`);
    el.dataset.view="enterView";
    const inp=el.querySelector("#otpCode"), rs=el.querySelector("#otpResend");
    inp.addEventListener("input",()=>{ inp.value=inp.value.replace(/\D/g,"").slice(0,6); if(inp.value.length===6) el.querySelector("#otpForm").requestSubmit(); });
    clearInterval(views.enter.tm); if(!st.until) st.until=Date.now()+st.resendIn*1000; const tick=()=>{ if(!document.body.contains(rs)){ clearInterval(views.enter.tm); return; } const left=Math.ceil((st.until-Date.now())/1000); rs.disabled=left>0; rs.textContent=left>0?t("resendIn")(left):t("resend"); };
    tick(); views.enter.tm=setInterval(tick,1000);
    rs.addEventListener("click",async()=>{ rs.disabled=true;
      const r=await post("/api/login/code",{school:st.school,identifier:st.identifier,lang:lang()}).catch(()=>null);
      if(!r){ el.querySelector("#otpErr").textContent=t("net"); rs.disabled=false; return; }
      if(r.status===429){ el.querySelector("#otpErr").textContent=t("many"); return; }
      views.enter({...st,note:t("resent"),until:0,resendIn:(r.body&&r.body.resendIn)||60}); });
    el.querySelector("#otpChange").addEventListener("click",()=>{ clearInterval(views.enter.tm); views.code(st); });
    let busy=false;
    el.querySelector("#otpForm").addEventListener("submit",async e=>{ e.preventDefault(); if(busy) return;
      const err=el.querySelector("#otpErr"); const code=inp.value;
      if(!/^\d{6}$/.test(code)){ err.textContent=t("digits"); return; }
      busy=true; const btn=el.querySelector(".login-main"); btn.disabled=true;
      try{
        const r=await post("/api/login",{school:st.school,identifier:st.identifier,method:"code",code});
        if(r.status===200){ clearInterval(views.enter.tm); try{localStorage.setItem("noria_ecole",st.school);}catch(x){} return afterLogin(r.body); }
        err.textContent=r.status===429?t("many"):t("badCode"); inp.value=""; inp.focus();
      }catch(x){ err.textContent=t("net"); }
      finally{ busy=false; btn.disabled=false; }
    });
  },
  async verify(code){
    const el=screen(`<h1 id="loginTitle">${esc(t("vTitle"))}</h1><p class="small">…</p>`); el.dataset.view="verify"; views.verify.code=code;
    const r=await api("/api/verifier/"+encodeURIComponent(code)).catch(()=>null);
    let h;
    if(!r) h=`<p class="login-err">${esc(t("net"))}</p>`;
    else if(r.status===429) h=`<p class="login-err">${esc(t("many"))}</p>`;
    else if(r.status!==200) h=`<p class="verif-bad" id="verifRes">✕ ${esc(t("vBad"))}</p>`;
    else if(r.body.type==="badge"||r.body.type==="releve"){ const v=r.body, bd=v.type==="badge", okk=v.statut==="valide";
      const lbl=bd?{valide:"bOk",expire:"bExp",revoque:"bRev"}[v.statut]:{valide:"tOk",annule:"tRev",modifie:"tMod"}[v.statut];
      h=`<p class="${okk?"verif-ok":"verif-bad"}" id="verifRes">${okk?"✓ ":"✕ "}${esc(t(lbl))}</p><dl class="verif-dl"><dt>${esc(t("vSchool"))}</dt><dd>${esc(v.ecole)}</dd><dt>${esc(t("vStudent"))}</dt><dd>${esc(v.eleve)}</dd>
      ${bd?`<dt>${esc(t("bYear"))}</dt><dd>${esc(v.annee)}</dd>`:`<dt>${esc(t("tDoc"))}</dt><dd>${esc(v.document)}</dd><dt>${esc(t("vDate"))}</dt><dd>${esc(v.emis_le)}</dd>`}${v.motif?`<dt>${esc(t("vWhy"))}</dt><dd>${esc(v.motif)}</dd>`:""}</dl>
      ${bd?"":`<label class="small">${esc(t("tFile"))}<input type="file" id="vFile" accept="application/pdf"></label><p id="vFileRes" role="status"></p>`}`; }
    else { const v=r.body; const okk=v.statut==="valide"; const rec=v.type==="recu";
      h=`<p class="${okk?"verif-ok":"verif-bad"}" id="verifRes">${okk?"✓ "+esc(t(rec?"rOk":"vOk")):"✕ "+esc(t(rec?"rRev":"vRev"))}</p><dl class="verif-dl">
      <dt>${esc(t("vSchool"))}</dt><dd>${esc(v.ecole)}</dd><dt>${esc(t("vStudent"))}</dt><dd>${esc(v.eleve)}</dd>${rec?`<dt>${esc(t("rNo"))}</dt><dd>${esc(v.numero)}</dd><dt>${esc(t("rAmt"))}</dt><dd>${esc(v.montant)}</dd>`:`<dt>${esc(t("vTerm"))}</dt><dd>${esc(v.periode)}</dd>`}<dt>${esc(t("vDate"))}</dt><dd>${esc(String(v.emis_le).slice(0,10))}</dd>
      ${v.motif?`<dt>${esc(t("vWhy"))}</dt><dd>${esc(v.motif)}</dd>`:""}</dl>`; }
    const box=screen(`<h1 id="loginTitle">${esc(t("vTitle"))}</h1><p class="small mut">${esc(code)}</p>${h}<p class="small">${esc(t({recu:"rNote",badge:"bNote",releve:"tNote"}[r&&r.body&&r.body.type]||"vNote"))}</p><button type="button" class="login-main" id="vBack">${esc(t("back"))}</button>`);
    box.dataset.view="verify";
    // Relevé : le fichier présenté est-il celui qui a été signé (Ed25519 sur son empreinte SHA-256) ?
    const vf=box.querySelector("#vFile");
    if(vf) vf.addEventListener("change",async()=>{ const f=vf.files[0], out=box.querySelector("#vFileRes"); if(!f) return;
      const buf=await f.arrayBuffer(); let body;
      if(crypto.subtle){ const d=new Uint8Array(await crypto.subtle.digest("SHA-256",buf)); body={sha256:[...d].map(x=>x.toString(16).padStart(2,"0")).join("")}; }
      else { let b=""; new Uint8Array(buf).forEach(x=>{ b+=String.fromCharCode(x); }); body={pdf:btoa(b)}; }
      const x=await post("/api/verifier/"+encodeURIComponent(code)+"/fichier",body).catch(()=>null);
      out.className=x&&x.status===200&&x.body.resultat==="authentique"?"verif-ok":"verif-bad";
      out.textContent=!x||x.status!==200?t("net"):x.body.resultat==="authentique"?t("tAuth"):t("tAlt"); });
    box.querySelector("#vBack").addEventListener("click",()=>{ history.replaceState(null,"",location.pathname); location.reload(); });
  },
  // Choix de l'école après connexion (personne membre de plusieurs écoles).
  async choose(){
    const r=await api("/api/me/ecoles").catch(()=>null);
    const list=r&&r.status===200?r.body:[];
    if(list.length<2){ closeScreen(); return start(); }
    const M=window.NORIA_ECO;
    const el=screen(`<h1 id="loginTitle">${esc(t("chooseTitle"))}</h1><p class="small mut">${esc(t("chooseHelp"))}</p>
      <div class="eco-choose">${list.map(e=>`<button type="button" class="eco-pick" data-id="${e.school_id}">${M?M.mark(e,"eco-sm"):""}<span><b>${esc(e.name)}</b><small>${esc(e.initials)}</small></span></button>`).join("")}</div>`);
    el.dataset.view="choose";
    el.querySelectorAll(".eco-pick").forEach(b=>b.addEventListener("click",async()=>{
      const id=Number(b.dataset.id), cur=list.find(x=>x.active);
      b.disabled=true;
      if(!cur||cur.school_id!==id){ const s=await post("/api/session/ecole",{school_id:id}).catch(()=>null); if(!s||s.status!==200){ b.disabled=false; return; } }
      closeScreen(); await start(); }));
  },
  async token(kind,token){
    // Page d'arrivée d'une invitation : logo (ou initiales) et nom de l'école qui invite.
    let head="";
    if(kind==="invitation"){
      const i=await post("/api/invitations/info",{token}).catch(()=>null);
      if(i&&i.status===200){ const M=window.NORIA_ECO, v=i.body;
        head=`<div class="eco-inv">${M?M.mark(v.school,"eco-lg"):""}<p><b>${esc(v.school.name)}</b> ${esc(t("invBy"))}</p><p class="small mut">${esc(t("invHello"))} ${esc(v.name)} · ${esc(t("invAs"))} : ${esc((t("roles")||{})[v.role]||v.role)}</p></div>`; }
      else head=`<p class="login-err">${esc(t("invalid"))}</p>`;
    }
    const el=screen(`${head}<h1 id="loginTitle">${esc(kind==="invitation"?t("invTitle"):t("resTitle"))}</h1><form id="tkForm" novalidate>
      <label class="fld">${esc(t("newPw"))}<input id="tkPw" type="password" required minlength="10" autocomplete="new-password"></label>
      <p id="tkMsg" class="login-err" role="alert"></p><button type="submit" class="login-main">${esc(t("save"))}</button></form>`);
    el.dataset.view="tokenView"; views.tokenView=()=>views.token(kind,token);
    el.querySelector("#tkForm").addEventListener("submit",async e=>{ e.preventDefault();
      const pw=el.querySelector("#tkPw").value; const msg=el.querySelector("#tkMsg");
      if(pw.length<10){ msg.textContent=t("short"); return; }
      const r=await post(kind==="invitation"?"/api/invitations/accept":"/api/recovery/reset",{token,password:pw}).catch(()=>null);
      if(r&&r.status===200){ history.replaceState(null,"",location.pathname); views.login(); document.getElementById("lgErr").textContent=t("done"); }
      else msg.textContent=!r?t("net"):r.status===401?t("existing"):t("invalid"); });
  },
};

async function afterLogin(body){
  if(body&&body.choisir) return views.choose();
  closeScreen(); await start();
}

function userChip(me){
  const top=document.querySelector(".topbar"); if(!top) return;
  let chip=document.getElementById("userChip");
  if(!chip){ chip=document.createElement("div"); chip.id="userChip"; chip.className="user-chip"; const rs=document.getElementById("roleSel"); top.insertBefore(chip,rs||top.firstChild); }
  const role=["direction","secretariat","enseignant","comptabilite","bibliotheque","parent","eleve"].find(r=>me.roles.includes(r));
  chip.innerHTML=`<span class="user-name"><b>${esc(me.name)}</b><span class="user-role">${esc((t("roles")||{})[role]||role||"")}${me.school&&me.school.initials?" · "+esc(me.school.initials):""}${CONFIG.demo?" · démo":""}</span></span><button type="button" id="lgOut" class="user-out">${esc(t("logout"))}</button>`;
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
  // Seulement les listes que le rôle peut lire (évite des refus 403 inutiles, par ex. pour la comptabilité).
  const R=me.body.roles||[], any=(...x)=>x.some(r=>R.includes(r)), none={status:204,body:[]};
  const [st,cl,ec,kd]=await Promise.all([any("direction","secretariat","enseignant","parent","eleve")?api("/api/students"):none,any("direction","secretariat","enseignant","bibliotheque")?api("/api/classes"):none,
    api("/api/me/ecoles"),R.includes("parent")?api("/api/me/enfants"):none]);
  // Écoles de la personne (sélecteur d'en-tête) ; enfants du parent dans toutes ses écoles (sélecteur) : l'enfant choisi
  // filtre l'interface.
  const schools=ec.status===200?ec.body.filter(x=>x.name):[], kids=kd.status===200?kd.body:[];
  const kid=window.NORIA_ECO?NORIA_ECO.selectedKid(kids,me.body.schoolId):null;
  let students=st.status===200?st.body:[];
  if(kid) students=students.filter(x=>x.id===kid.student_id);
  const data={me:me.body,students,classes:cl.status===200?cl.body:[],demo:!!CONFIG.demo,eco:{me:me.body,schools,kids,kid}};
  if(window.NORIA_ECO) NORIA_ECO.set(data.eco);
  window.KL.applyServer(data);
  userChip(me.body);
  if(window.NORIA_ECO) NORIA_ECO.set(data.eco);
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
  if(window.NORIA_ECO) NORIA_ECO.set(data.eco);
  window.KL.applyServer(data);
  userChip(data.me);
  if(window.NORIA_ECO) NORIA_ECO.set(data.eco);
  NORIA_OFF.init(data.me);
}

function serverFooter(){
  const f=document.querySelector(".site-foot"); if(!f) return;
  f.innerHTML=lang()==="ht"
    ?"NORIA se yon pwodui <strong>Klirline Inc.</strong><br>Sèvè demonstrasyon : done fiktif. Elèv, klas, prezans, nòt, bilten, anons ak kalandriye soti nan sèvè a ; lòt modil yo rete sou aparèy sa a."
    :"NORIA est un produit de <strong>Klirline Inc.</strong><br>Serveur de démonstration : données fictives. Élèves, classes, présences, notes, bulletins, annonces et calendrier viennent du serveur ; les autres modules restent sur cet appareil.";
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
  // Administration de la plateforme : interface séparée, chargée à la demande.
  if(location.hash==="#admin"&&window.NORIA_ECO){ try{ await NORIA_ECO.load("src/admin.js"); return window.NORIA_ADM.start(); }catch(e){ return views.login(); } }
  if(window.NORIA_ECO) NORIA_ECO.onRestart(async()=>{ try{ await start(); }catch(e){ location.reload(); } });
  const vm=location.hash.match(/^#verifier=([A-Za-z0-9-]{4,40})$/);
  if(vm) return views.verify(vm[1]);
  const m=location.hash.match(/^#(invitation|recuperation)=([\w-]{20,})$/);
  if(m) return views.token(m[1],m[2]);
  if(!CONFIG.session){ if(window.NORIA_OFF) await NORIA_OFF.clearCache(); return views.login(); }
  try{ await start(); }catch(e){ views.login(); }
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();

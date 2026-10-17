/* NORIA — bloc 7, chargé à la demande : espace élève / parent pour l'adresse e-mail NORIA. Affiche l'adresse, son
   état, la destination personnelle vérifiée ; permet de la changer (lien ou code à 6 chiffres) et, pour un parent
   d'élève mineur, de donner ou retirer son accord. Les adresses ne sont jamais publiées. CSP stricte. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const $=id=>document.getElementById(id);
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{title:"Adresse e-mail NORIA",help:"Adresse professionnelle donnée par l'école. Les messages reçus sont transférés vers une adresse personnelle que vous avez vérifiée. Elle n'apparaît sur aucune page publique.",
    none:"Aucune adresse pour le moment : l'école ne l'a pas encore créée.",copy:"Copier",copied:"Adresse copiée.",
    st:{en_attente:"En attente",active:"Active",suspendue:"Suspendue",redirigee:"Redirigée (transfert d'école)"},
    why:{en_attente:"Pas encore active. Il reste à faire :",active:"Active : les messages arrivent sur la destination ci-dessous.",suspendue:"Suspendue par l'école : plus aucun message n'est transféré.",redirigee:"Vous avez changé d'école : les messages sont encore transférés jusqu'au"},
    stepConsent:"accord d'un parent (élève mineur)",stepDest:"adresse personnelle vérifiée",done:"fait",
    consentT:"Accord parental",consentP:"Votre enfant est mineur : rien n'est transféré sans votre accord. Vous pourrez le retirer à tout moment.",consentOk:"J'autorise le transfert des messages de cette adresse vers l'adresse vérifiée.",give:"Donner mon accord",withdraw:"Retirer mon accord",given:"Accord donné le",waitParent:"Un parent doit donner son accord depuis son espace NORIA.",
    dest:"Destination",noDest:"Aucune destination vérifiée.",owner:{eleve:"adresse de l'élève",parent:"adresse d'un parent"},verified:"vérifiée le",
    change:"Changer la destination",set:"Choisir une destination",email:"Adresse personnelle",mine:"Mon adresse (parent)",kid:"L'adresse de mon enfant",send:"Envoyer le code",
    sent:m=>`Code envoyé à ${m}. Saisissez-le ci-dessous, ou cliquez sur le lien reçu.`,code:"Code reçu (6 chiffres)",check:"Vérifier",ok:"Destination vérifiée.",pending:m=>`Vérification en attente pour ${m}.`,
    privacy:"Confidentialité : la direction ne voit qu'une version masquée de la destination ; l'ancienne destination est prévenue de tout changement.",
    fwd:n=>`${n} message(s) transféré(s)`,net:"Réseau nécessaire pour cette action.",err:"Refusé : ",fin:"Désactivation prévue le"},
  ht:{title:"Adrès imel NORIA",help:"Adrès pwofesyonèl lekòl la bay. Mesaj ki rive ap transfere bay yon adrès pèsonèl ou verifye. Li pa parèt sou okenn paj piblik.",
    none:"Pa gen adrès pou kounye a : lekòl la poko kreye l.",copy:"Kopye",copied:"Adrès la kopye.",
    st:{en_attente:"Ap tann",active:"Aktif",suspendue:"Sispann",redirigee:"Redirije (chanje lekòl)"},
    why:{en_attente:"Li poko aktif. Sa ki rete pou fè :",active:"Aktif : mesaj yo ap rive sou destinasyon ki anba a.",suspendue:"Lekòl la sispann li : pa gen mesaj k ap transfere ankò.",redirigee:"Ou chanje lekòl : mesaj yo ap toujou transfere jiska"},
    stepConsent:"dakò yon paran (elèv minè)",stepDest:"adrès pèsonèl verifye",done:"fèt",
    consentT:"Dakò paran",consentP:"Pitit ou a minè : anyen p ap transfere san dakò ou. Ou ka retire l nenpòt ki lè.",consentOk:"Mwen otorize transfè mesaj adrès sa a bay adrès ki verifye a.",give:"Bay dakò mwen",withdraw:"Retire dakò mwen",given:"Dakò bay le",waitParent:"Yon paran dwe bay dakò li nan espas NORIA li.",
    dest:"Destinasyon",noDest:"Pa gen destinasyon ki verifye.",owner:{eleve:"adrès elèv la",parent:"adrès yon paran"},verified:"verifye le",
    change:"Chanje destinasyon an",set:"Chwazi yon destinasyon",email:"Adrès pèsonèl",mine:"Adrès mwen (paran)",kid:"Adrès pitit mwen",send:"Voye kòd la",
    sent:m=>`Kòd la voye bay ${m}. Tape l anba a, oswa klike sou lyen ou resevwa a.`,code:"Kòd ou resevwa (6 chif)",check:"Verifye",ok:"Destinasyon an verifye.",pending:m=>`Verifikasyon ap tann pou ${m}.`,
    privacy:"Konfidansyalite : direksyon an wè sèlman yon vèsyon kache destinasyon an ; ansyen destinasyon an resevwa yon avi pou chak chanjman.",
    fwd:n=>`${n} mesaj transfere`,net:"Bezwen rezo pou aksyon sa a.",err:"Refize : ",fin:"Dezaktivasyon prevwa le"},
};
const t=k=>T[lang()][k];
(function css(){ if(document.getElementById("emCss")) return; const l=document.createElement("link"); l.id="emCss"; l.rel="stylesheet"; l.href="src/emails-eleves.css"; document.head.appendChild(l); })();
let EL=null, C={}, LIST=[];
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let body=null; try{ body=await r.json(); }catch(e){}
  return {status:r.status,body};
}
function toast(m){ const c=$("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
const BADGE={en_attente:"b-pending",active:"b-paid",suspendue:"b-unpaid",redirigee:"b-excused"};
const day=s=>esc(String(s||"").replace("T"," ").slice(0,10));
const fail=r=>toast(t("err")+((r&&r.body&&r.body.error)||t("net")));

async function render(m,el,ctx){
  EL=el; C=ctx||{};
  const r=await api("/api/emails/moi").catch(()=>null);
  if(!EL.isConnected) return;
  if(!r||r.status!==200){ EL.innerHTML=`<div class="badbox">${esc((r&&r.body&&r.body.error)||t("net"))}</div>`; return; }
  LIST=r.body.adresses; draw();
}
function draw(){
  EL.innerHTML=`<div class="card"><h3>${esc(t("title"))}</h3><p class="small mut">${esc(t("help"))}</p></div>`+
    (LIST.length?LIST.map(card).join(""):`<div class="card"><p class="small mut">${esc(t("none"))}</p></div>`)+
    `<p class="small mut">${esc(t("privacy"))}</p>`;
}
function card(a){
  const needConsent=a.mineur&&!a.consentement, needDest=!a.destination;
  const v=a.verification_en_cours;
  return `<div class="card"><div class="row sp"><b>${esc(a.eleve)}</b><span class="badge ${BADGE[a.statut]||""}">${esc(t("st")[a.statut]||a.statut)}</span></div>
   <p class="em-addr">${esc(a.adresse)}</p><p><button type="button" class="ghost small" data-action="NORIA_MYMAIL.copy" data-a0="s:${esc(a.adresse)}">${esc(t("copy"))}</button>${a.transferts?` <span class="small mut">${esc(t("fwd")(a.transferts))}</span>`:""}</p>
   <p class="small">${esc(t("why")[a.statut]||"")}${a.statut==="redirigee"?` <b>${day(a.fin_prevue)}</b>.`:""}</p>
   ${a.statut==="en_attente"?`<ol class="em-steps small">${a.mineur?`<li>${esc(t("stepConsent"))}${a.consentement?` — <span class="em-ok">${esc(t("done"))}</span>`:""}</li>`:""}<li>${esc(t("stepDest"))}${needDest?"":` — <span class="em-ok">${esc(t("done"))}</span>`}</li></ol>`:""}
   ${a.fin_prevue&&a.statut!=="redirigee"?`<p class="small warnbox">${esc(t("fin"))} ${day(a.fin_prevue)}.</p>`:""}
   ${a.mineur?consentHtml(a,needConsent):""}
   <h4>${esc(t("dest"))}</h4>
   ${a.destination?`<p class="small"><b>${esc(a.destination.email)}</b> · ${esc(t("owner")[a.destination.proprietaire])} · ${esc(t("verified"))} ${day(a.destination.verifiee_le)}</p>`:`<p class="small mut">${esc(t("noDest"))}</p>`}
   ${v?`<div class="small warnbox">${esc(t("pending")(v.email))}</div><form class="row" data-action-submit="NORIA_MYMAIL.code" data-a0="n:${a.id}"><label class="small">${esc(t("code"))}<input id="emCode${a.id}" class="em-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><button type="submit">${esc(t("check"))}</button></form>`:""}
   ${a.peut_changer&&a.statut!=="desactivee"?`<form class="em-form" data-action-submit="NORIA_MYMAIL.dest" data-a0="n:${a.id}"><label class="small">${esc(a.destination?t("change"):t("set"))}<input id="emDest${a.id}" type="email" autocomplete="email" maxlength="254" placeholder="nom@exemple.com" required></label>
     ${a.moi==="parent"?`<div class="em-owner small"><label><input type="radio" name="emOwn${a.id}" value="parent" checked> ${esc(t("mine"))}</label><label><input type="radio" name="emOwn${a.id}" value="eleve"> ${esc(t("kid"))}</label></div>`:""}
     <p><button type="submit" class="ghost">${esc(t("send"))}</button></p></form>`:""}</div>`;
}
function consentHtml(a,need){
  if(a.peut_consentir) return need
    ?`<form class="warnbox small" data-action-submit="NORIA_MYMAIL.consent" data-a0="n:${a.id}" data-a1="n:1"><b>${esc(t("consentT"))}</b><p>${esc(t("consentP"))}</p><label class="row"><input type="checkbox" required> ${esc(t("consentOk"))}</label><p><button type="submit">${esc(t("give"))}</button></p></form>`
    :`<p class="small">${esc(t("given"))} ${day(a.consentement.le)} · <button type="button" class="ghost small" data-action="NORIA_MYMAIL.consent" data-a0="n:${a.id}" data-a1="n:0">${esc(t("withdraw"))}</button></p>`;
  return need?`<p class="small warnbox">${esc(t("waitParent"))}</p>`:"";
}
async function copy(s){ try{ await navigator.clipboard.writeText(s); toast(t("copied")); }catch(e){ toast(s); } }
async function post(path,body,msg){
  const r=await api(path,{method:"POST",body:JSON.stringify(body)}).catch(()=>null);
  if(r&&r.status===200){ toast(typeof msg==="function"?msg(r.body):msg); await render("monemail",EL,C); } else fail(r);
}
function dest(id){
  const own=document.querySelector(`input[name="emOwn${id}"]:checked`);
  return post(`/api/emails/${id}/destination`,{email:$("emDest"+id).value.trim(),proprietaire:own?own.value:undefined},b=>t("sent")(b.destination));
}
const code=id=>post(`/api/emails/${id}/destination/code`,{code:$("emCode"+id).value.trim()},t("ok"));
const consent=(id,yes)=>post(`/api/emails/${id}/consentement`,{accord:!!yes},yes?t("give"):t("withdraw"));
window.NORIA_MYMAIL=Object.freeze({render,copy,dest,code,consent});
})();

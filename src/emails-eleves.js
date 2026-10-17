/* NORIA — bloc 7, chargé à la demande : adresses e-mail professionnelles des élèves, côté direction (écriture) et
   secrétariat (lecture). Réglages (sous-domaine, préfixe), création en masse après aperçu, suivi et cycle de vie
   (suspension, consentement écrit, fin de scolarité, journal). Les destinations personnelles restent masquées.
   Visible seulement quand le serveur active la fonction (NORIA_EMAIL_ELEVES=1). CSP stricte. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const $=id=>document.getElementById(id);
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{title:"Adresses e-mail des élèves",help:"Chaque élève peut recevoir une adresse professionnelle tirée de son code élève. Les messages reçus sont transférés vers une adresse personnelle vérifiée (élève, ou parent pour un mineur). Rien n'est transféré pour un mineur sans l'accord d'un parent.",
    domain:"Domaine",noDomain:"Domaine non configuré : définissez NORIA_EMAIL_DOMAINE sur le serveur avant de créer des adresses.",provider:"Fournisseur",sim:"simulé (aucun message réel)",delay:"Désactivation après la fin de scolarité",days:n=>`${n} jours`,
    settings:"Réglages de l'école",sub:"Sous-domaine (facultatif)",pre:"Préfixe (facultatif)",save:"Enregistrer",saved:"Réglages enregistrés.",settingsNote:"Les adresses déjà créées ne changent jamais. Avec un sous-domaine ou un préfixe, l'adresse ne suit pas l'élève en cas de transfert.",
    bulk:"Création en masse",cls:"Classe",all:"Toute l'école",preview:"Aperçu",none:"Aucun élève sans adresse dans cette sélection.",student:"Élève",address:"Adresse proposée",addr:"Adresse",note:"Remarque",
    minor:"mineur : accord parental requis",collision:"suffixe ajouté (adresse déjà prise)",create:n=>`Créer ${n} adresse(s)`,created:n=>`${n} adresse(s) créée(s), en attente de destination vérifiée.`,stale:"L'aperçu a changé : relancez l'aperçu.",
    list:"Adresses",empty:"Aucune adresse pour le moment.",status:"Statut",dest:"Destination",consent:"Accord parental",end:"Fin prévue",actions:"Actions",
    st:{en_attente:"En attente",active:"Active",suspendue:"Suspendue",redirigee:"Redirigée",desactivee:"Désactivée"},
    owner:{eleve:"élève",parent:"parent"},noDest:"aucune",pending:"vérification en cours",yes:"oui",no:"non",notNeeded:"majeur",
    manage:"Gérer",journal:"Journal",suspend:"Suspendre",motif:"Motif",resume:"Reprendre",written:"Accord écrit du parent",parentName:"Nom du parent signataire",record:"Enregistrer l'accord",
    endNow:"Programmer la fin de scolarité",endDays:"Délai (jours)",cancelEnd:"Annuler la fin prévue",close:"Fermer",done:"Enregistré.",
    ev:{creation:"Création",activation:"Activation",mise_en_attente:"Mise en attente",suspension:"Suspension",reprise:"Reprise",consentement:"Accord parental",consentement_retire:"Accord retiré",destination_demandee:"Destination demandée",destination_verifiee:"Destination vérifiée",fin_programmee:"Fin programmée",fin_annulee:"Fin annulée",desactivation:"Désactivation",redirection:"Redirection (transfert)",transfert_sortant:"Transfert (départ)",transfert_entrant:"Transfert (arrivée)",fournisseur_echec:"Erreur du fournisseur"},
    readOnly:"Lecture seule : seule la direction modifie les adresses.",noAccess:"Réservé à la direction et au secrétariat.",net:"Réseau nécessaire pour cette action.",err:"Refusé : ",fwd:n=>`${n} message(s) transféré(s)`},
  ht:{title:"Adrès imel elèv yo",help:"Chak elèv ka resevwa yon adrès pwofesyonèl ki soti nan kòd elèv li. Mesaj li resevwa ap transfere bay yon adrès pèsonèl ki verifye (elèv la, oswa paran pou yon minè). Anyen p ap transfere pou yon minè san dakò yon paran.",
    domain:"Domèn",noDomain:"Domèn nan pa konfigire : mete NORIA_EMAIL_DOMAINE sou sèvè a anvan ou kreye adrès.",provider:"Founisè",sim:"similasyon (pa gen vrè mesaj)",delay:"Dezaktivasyon apre elèv la fin lekòl",days:n=>`${n} jou`,
    settings:"Reglaj lekòl la",sub:"Sou-domèn (si ou vle)",pre:"Prefiks (si ou vle)",save:"Anrejistre",saved:"Reglaj yo anrejistre.",settingsNote:"Adrès ki deja kreye yo pa janm chanje. Avèk yon sou-domèn oswa yon prefiks, adrès la pa swiv elèv la si li transfere.",
    bulk:"Kreyasyon an mas",cls:"Klas",all:"Tout lekòl la",preview:"Apèsi",none:"Pa gen elèv san adrès nan seleksyon sa a.",student:"Elèv",address:"Adrès pwopoze",addr:"Adrès",note:"Remak",
    minor:"minè : bezwen dakò paran",collision:"sifiks ajoute (adrès la te pran deja)",create:n=>`Kreye ${n} adrès`,created:n=>`${n} adrès kreye, y ap tann yon destinasyon verifye.`,stale:"Apèsi a chanje : refè apèsi a.",
    list:"Adrès yo",empty:"Pa gen adrès pou kounye a.",status:"Estati",dest:"Destinasyon",consent:"Dakò paran",end:"Fen prevwa",actions:"Aksyon",
    st:{en_attente:"Ap tann",active:"Aktif",suspendue:"Sispann",redirigee:"Redirije",desactivee:"Dezaktive"},
    owner:{eleve:"elèv",parent:"paran"},noDest:"okenn",pending:"verifikasyon ap fèt",yes:"wi",no:"non",notNeeded:"majè",
    manage:"Jere",journal:"Jounal",suspend:"Sispann",motif:"Rezon",resume:"Rekòmanse",written:"Dakò paran an sou papye",parentName:"Non paran ki siyen an",record:"Anrejistre dakò a",
    endNow:"Pwograme fen lekòl la",endDays:"Delè (jou)",cancelEnd:"Anile fen prevwa a",close:"Fèmen",done:"Anrejistre.",
    ev:{creation:"Kreyasyon",activation:"Aktivasyon",mise_en_attente:"Mete an atant",suspension:"Sispansyon",reprise:"Rekòmansman",consentement:"Dakò paran",consentement_retire:"Dakò retire",destination_demandee:"Destinasyon mande",destination_verifiee:"Destinasyon verifye",fin_programmee:"Fen pwograme",fin_annulee:"Fen anile",desactivation:"Dezaktivasyon",redirection:"Redireksyon (transfè)",transfert_sortant:"Transfè (depa)",transfert_entrant:"Transfè (arive)",fournisseur_echec:"Erè founisè a"},
    readOnly:"Lekti sèlman : se direksyon an sèl ki chanje adrès yo.",noAccess:"Se pou direksyon ak sekretarya sèlman.",net:"Bezwen rezo pou aksyon sa a.",err:"Refize : ",fwd:n=>`${n} mesaj transfere`},
};
const t=k=>T[lang()][k];
(function css(){ if(document.getElementById("emCss")) return; const l=document.createElement("link"); l.id="emCss"; l.rel="stylesheet"; l.href=NORIA_U.v("src/emails-eleves.css"); document.head.appendChild(l); })();
let EL=null, C={}, D=null, PREV=null, SEL="", OPEN=null, JOUR={};
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let body=null; try{ body=await r.json(); }catch(e){}
  return {status:r.status,body};
}
function toast(m){ const c=$("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
const BADGE={en_attente:"b-pending",active:"b-paid",suspendue:"b-unpaid",redirigee:"b-excused",desactivee:"b-excused"};
const badge=s=>`<span class="badge ${BADGE[s]||""}">${esc(t("st")[s]||s)}</span>`;
const roles=()=>(C.me&&C.me.roles)||[];
const day=s=>esc(String(s||"").replace("T"," ").slice(0,10));
const fail=r=>toast(t("err")+((r&&r.body&&r.body.error)||t("net")));

async function render(m,el,ctx){
  EL=el; C=ctx||{};
  if(!roles().includes("direction")&&!roles().includes("secretariat")){ EL.innerHTML=`<div class="badbox">${esc(t("noAccess"))}</div>`; return; }
  const r=await api("/api/emails").catch(()=>null);
  if(!EL.isConnected) return;
  if(!r||r.status!==200){ EL.innerHTML=`<div class="badbox">${esc((r&&r.body&&r.body.error)||t("net"))}</div>`; return; }
  D=r.body; draw();
}
function draw(){
  const d=D, w=d.ecriture;
  const stats=Object.entries(d.stats||{}).map(([k,n])=>`${badge(k)} <b>${n}</b>`).join(" ");
  EL.innerHTML=`<div class="card"><h3>${esc(t("title"))}</h3><p class="small mut">${esc(t("help"))}</p>
    ${d.domaine?`<p class="small">${esc(t("domain"))} : <b>@${esc(d.domaine)}</b> · ${esc(t("provider"))} : <b>${esc(d.fournisseur.routage)}</b>${d.simule?` <span class="mut">(${esc(t("sim"))})</span>`:""} · ${esc(t("delay"))} : ${esc(t("days")(d.delai_jours))}</p>`:`<div class="warnbox small">${esc(t("noDomain"))}</div>`}
    ${w?"":`<p class="small mut">${esc(t("readOnly"))}</p>`}</div>
   ${w?`<div class="grid g2"><form class="card em-form" data-action-submit="NORIA_EMAILS.save"><h3>${esc(t("settings"))}</h3>
     <label class="small">${esc(t("sub"))}<input id="emSub" maxlength="30" value="${esc(d.reglages.sous_domaine||"")}" placeholder="lycee-exemple" autocomplete="off"></label>
     <label class="small">${esc(t("pre"))}<input id="emPre" maxlength="20" value="${esc(d.reglages.prefixe||"")}" placeholder="lex" autocomplete="off"></label>
     <p class="small mut">${esc(t("settingsNote"))}</p><p><button type="submit" class="ghost">${esc(t("save"))}</button></p></form>
    <form class="card em-form" data-action-submit="NORIA_EMAILS.preview"><h3>${esc(t("bulk"))}</h3>
     <label class="small">${esc(t("cls"))}<select id="emCls"><option value="">${esc(t("all"))}</option>${d.classes.map(c=>`<option value="${c.id}"${String(c.id)===SEL?" selected":""}>${esc(c.nom)} (${c.eleves})</option>`).join("")}</select></label>
     <p><button type="submit"${d.domaine?"":" disabled"}>${esc(t("preview"))}</button></p></form></div>`:""}
   <div id="emPrev">${PREV?prevHtml():""}</div>
   <div class="card"><div class="row sp"><h3>${esc(t("list"))}</h3><span class="small">${stats}</span></div>
    ${d.adresses.length?`<div class="em-tw"><table><thead><tr><th>${esc(t("student"))}</th><th>${esc(t("addr"))}</th><th>${esc(t("status"))}</th><th>${esc(t("dest"))}</th><th>${esc(t("consent"))}</th><th>${esc(t("end"))}</th><th></th></tr></thead><tbody>
     ${d.adresses.map(a=>`<tr><td><b>${esc(a.eleve)}</b><br><small class="mut">${esc(a.code)}</small></td><td><code>${esc(a.adresse)}</code>${a.transferts?`<br><small class="mut">${esc(t("fwd")(a.transferts))}</small>`:""}</td><td>${badge(a.statut)}</td>
      <td class="small">${a.destination?`${esc(a.destination.masque)} <span class="mut">(${esc(t("owner")[a.destination.proprietaire])})</span>`:a.verification_en_cours?`<span class="mut">${esc(t("pending"))}</span>`:`<span class="mut">${esc(t("noDest"))}</span>`}</td>
      <td class="small">${a.mineur?(a.consentement?esc(t("yes")):`<b>${esc(t("no"))}</b>`):`<span class="mut">${esc(t("notNeeded"))}</span>`}</td><td class="small">${a.fin_prevue?day(a.fin_prevue):"—"}</td>
      <td><button type="button" class="ghost small" data-action="NORIA_EMAILS.open" data-a0="n:${a.id}">${esc(w?t("manage"):t("journal"))}</button></td></tr>
      ${OPEN===a.id?`<tr><td colspan="7">${panel(a,w)}</td></tr>`:""}`).join("")}</tbody></table></div>`:`<p class="small mut">${esc(t("empty"))}</p>`}</div>`;
}
function prevHtml(){
  const p=PREV;
  if(!p.propositions.length) return `<div class="card"><p class="small mut">${esc(t("none"))}</p></div>`;
  return `<div class="card"><h3>${esc(t("preview"))} · @${esc(p.domaine)}</h3><div class="em-tw"><table><thead><tr><th>${esc(t("student"))}</th><th>${esc(t("cls"))}</th><th>${esc(t("address"))}</th><th>${esc(t("note"))}</th></tr></thead><tbody>
   ${p.propositions.map(x=>`<tr><td><b>${esc(x.eleve)}</b><br><small class="mut">${esc(x.code)}</small></td><td>${esc(x.classe)}</td><td><code>${esc(x.adresse)}</code></td><td class="small">${[x.mineur?t("minor"):"",x.collision?t("collision"):""].filter(Boolean).map(esc).join(" · ")}</td></tr>`).join("")}</tbody></table></div>
   <p><button type="button" data-action="NORIA_EMAILS.create">${esc(t("create")(p.propositions.length))}</button></p></div>`;
}
function panel(a,w){
  const ev=JOUR[a.id];
  const j=ev?`<div class="small"><b>${esc(t("journal"))}</b>${ev.map(v=>`<div>${day(v.created_at)} · ${esc(t("ev")[v.kind]||v.kind)}${v.detail?` — <span class="mut">${esc(v.detail)}</span>`:""}</div>`).join("")}</div>`:`<p class="small mut">…</p>`;
  if(!w||a.statut==="desactivee") return j;
  return `<div class="grid g2"><div>${a.statut==="suspendue"?`<p><button type="button" class="ghost" data-action="NORIA_EMAILS.act" data-a0="n:${a.id}" data-a1="s:reprendre">${esc(t("resume"))}</button></p>`
     :a.statut!=="redirigee"?`<form data-action-submit="NORIA_EMAILS.suspend" data-a0="n:${a.id}" class="row"><input id="emMot${a.id}" placeholder="${esc(t("motif"))}" maxlength="200" required><button type="submit" class="ghost">${esc(t("suspend"))}</button></form>`:""}
    ${a.mineur&&!a.consentement?`<form data-action-submit="NORIA_EMAILS.consent" data-a0="n:${a.id}"><label class="small">${esc(t("written"))}<input id="emPar${a.id}" placeholder="${esc(t("parentName"))}" maxlength="120" required></label><button type="submit" class="ghost">${esc(t("record"))}</button></form>`:""}
    ${a.statut!=="redirigee"?(a.fin_prevue?`<p><button type="button" class="ghost" data-action="NORIA_EMAILS.act" data-a0="n:${a.id}" data-a1="s:annuler-fin">${esc(t("cancelEnd"))}</button></p>`
     :`<form data-action-submit="NORIA_EMAILS.end" data-a0="n:${a.id}" class="row"><label class="small">${esc(t("endDays"))}<input id="emEnd${a.id}" type="number" min="0" max="365" value="${D.delai_jours}"></label><button type="submit" class="ghost">${esc(t("endNow"))}</button></form>`):""}</div>
   <div>${j}</div></div>`;
}
async function open(id){
  OPEN=OPEN===id?null:id; draw();
  if(OPEN&&!JOUR[id]){ const r=await api(`/api/emails/${id}/journal`).catch(()=>null); if(r&&r.status===200){ JOUR[id]=r.body.evenements; if(OPEN===id) draw(); } }
}
async function save(){
  const r=await api("/api/emails/reglages",{method:"PUT",body:JSON.stringify({sous_domaine:$("emSub").value.trim()||null,prefixe:$("emPre").value.trim()||null})}).catch(()=>null);
  if(r&&r.status===200){ toast(t("saved")); PREV=null; render("emails",EL,C); } else fail(r);
}
function sel(){ const v=$("emCls")?$("emCls").value:""; SEL=v; return v?{class_id:Number(v)}:{tout:true}; }
async function preview(){
  const r=await api("/api/emails/apercu",{method:"POST",body:JSON.stringify(sel())}).catch(()=>null);
  if(r&&r.status===200){ PREV={...r.body,sel:sel()}; $("emPrev").innerHTML=prevHtml(); } else fail(r);
}
async function create(){
  if(!PREV) return;
  const r=await api("/api/emails/creer",{method:"POST",body:JSON.stringify({...PREV.sel,empreinte:PREV.empreinte,confirmer:true})}).catch(()=>null);
  if(r&&r.status===200){ toast(t("created")(r.body.creees)); PREV=null; render("emails",EL,C); }
  else if(r&&r.status===409){ toast(t("stale")); preview(); } else fail(r);
}
async function post(id,path,body){
  const r=await api(`/api/emails/${id}/${path}`,{method:"POST",body:JSON.stringify(body||{})}).catch(()=>null);
  if(r&&r.status===200){ toast(t("done")); delete JOUR[id]; await render("emails",EL,C); if(OPEN===id){ OPEN=null; open(id); } } else fail(r);
}
const act=(id,a)=>post(id,a,{});
const suspend=id=>post(id,"suspendre",{motif:$("emMot"+id).value.trim()});
const consent=id=>post(id,"consentement",{accord:true,parent:$("emPar"+id).value.trim()});
const end=id=>post(id,"fin",{jours:Number($("emEnd"+id).value)});
window.NORIA_EMAILS=Object.freeze({render,open,save,preview,create,act,suspend,consent,end});
})();

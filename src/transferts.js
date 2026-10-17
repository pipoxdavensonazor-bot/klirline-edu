/* NORIA — bloc 4, chargé à la demande : lien entre écoles (direction, secrétariat). Vérification d'un élève (code +
   date de naissance, résultat minimal), demande de transfert avec consentement du parent (case et nom, ou code envoyé
   au parent rattaché), examen par l'école d'origine (approbation signée ou refus motivé), certificat, dossier reçu,
   signalements et décisions de fin d'année. CSP stricte : data-action, classes CSS, aucun style en ligne. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{title:"Transferts entre écoles",help:"Vérifiez un élève qui s'inscrit, demandez son dossier à son ancienne école et suivez chaque étape.",
    tabs:{verifier:"Vérifier un élève",envoyes:"Demandes envoyées",recus:"Demandes reçues",signalements:"Signalements",decisions:"Décisions de fin d'année"},
    code:"Code élève",birth:"Date de naissance",check:"Vérifier",birthReq:"La date de naissance est obligatoire.",none:"Aucun élève ne correspond à ce code et à cette date de naissance.",
    school:"École",current:"école actuelle",last:"dernière école",status:"Statut",cls:"Dernière classe",decision:"Décision de fin d'année",flags:"Signalements de l'ancienne école",noFlag:"Aucun signalement.",
    prev:"École précédente",busy:"Un transfert est déjà en cours pour cet élève.",same:"Cet élève est déjà dans votre école.",minimal:"Résultat minimal : aucune note n'est communiquée entre écoles.",
    st:{inscrit:"Inscrit",sorti:"Sorti",transfere:"Transféré"},dec:{admis:"Admis",redouble:"Redouble",echec:"Échec"},
    cat:{disciplinaire:"Dossier disciplinaire",dette:"Dette financière",document_manquant:"Document manquant",autre:"Autre motif"},
    ask:"Demander le transfert du dossier",consent:"Consentement du parent",byCase:"Le parent a donné son accord (case et nom)",byOtp:"Envoyer un code au parent rattaché à l'ancienne école",
    parent:"Nom du parent ou tuteur",agree:"Je confirme que ce parent a donné son accord pour le transfert du dossier.",toCls:"Classe d'accueil (facultatif)",noCls:"À choisir plus tard",motive:"Motif (facultatif)",
    send:"Envoyer la demande",sent:"Demande envoyée.",codeSent:d=>`Code envoyé au parent (${d}).`,
    rs:{demande:"Demandé",consentement:"Consentement du parent",approuve_origine:"Approuvé par l'origine",approuve_ministere:"Approuvé par le ministère",transfere:"Transféré",refuse:"Refusé",annule:"Annulé"},
    from:"De",to:"Vers",created:"Demande du",expires:"Expire le",consentBy:"Consentement",signed:"Signé par",key:"clé",ministry:"En attente de l'autorisation du ministère",
    otpCode:"Code reçu par le parent",validate:"Valider le code",resend:"Renvoyer le code",cancel:"Annuler la demande",cancelWhy:"Motif de l'annulation",
    approve:"Approuver et signer",approveHelp:"La signature de la direction et la signature électronique de l'école seront apposées sur la demande, puis le dossier sera copié vers l'école d'accueil.",
    refuse:"Refuser",refuseWhy:"Motif du refus",confirm:"Confirmer",cert:"Certificat de transfert",dossier:"Dossier reçu",reason:"Motif",noReq:"Aucune demande.",pending:"À traiter",history:"Historique",
    done:"Dossier transféré.",flagT:"Poser un signalement",flagHelp:"Visible par les autres écoles (catégorie et date) ; le texte court n'est visible que par les directions.",
    cat0:"Catégorie",date:"Date",text:"Texte court (200 caractères)",flagBtn:"Enregistrer le signalement",lift:"Lever",liftWhy:"Motif de la levée",lifted:"Levé le",active:"Actif",
    pickCls:"Classe",save:"Enregistrer",saved:"Enregistré.",noStu:"Aucun élève dans cette classe.",student:"Élève",
    dosT:"Dossier antérieur",classes:"Classes",notes:"Notes publiées",releves:"Relevés émis",sigOk:"Signature d'origine valide",sigKo:"Signature d'origine invalide",dl:"Télécharger",empty:"Rien à afficher.",back:"Retour",
    subject:"Matière",eval:"Évaluation",score:"Note",period:"Période",year:"Année",
    err:"Refusé : ",net:"Réseau nécessaire pour cette action.",wait:"Chargement…",noAccess:"Accès réservé à la direction et au secrétariat."},
  ht:{title:"Transfè ant lekòl",help:"Verifye yon elèv k ap enskri, mande ansyen lekòl li dosye a epi swiv chak etap.",
    tabs:{verifier:"Verifye yon elèv",envoyes:"Demann nou voye",recus:"Demann nou resevwa",signalements:"Siyalman",decisions:"Desizyon fen ane"},
    code:"Kòd elèv",birth:"Dat nesans",check:"Verifye",birthReq:"Dat nesans lan obligatwa.",none:"Pa gen okenn elèv ki koresponn ak kòd sa a ak dat nesans sa a.",
    school:"Lekòl",current:"lekòl kounye a",last:"dènye lekòl",status:"Eta",cls:"Dènye klas",decision:"Desizyon fen ane",flags:"Siyalman ansyen lekòl la",noFlag:"Pa gen siyalman.",
    prev:"Lekòl anvan an",busy:"Gen yon transfè k ap fèt deja pou elèv sa a.",same:"Elèv sa a deja nan lekòl ou.",minimal:"Ti rezilta sèlman : lekòl yo pa pataje okenn nòt.",
    st:{inscrit:"Enskri",sorti:"Soti",transfere:"Transfere"},dec:{admis:"Pase",redouble:"Double",echec:"Echwe"},
    cat:{disciplinaire:"Dosye disiplin",dette:"Dèt lajan",document_manquant:"Dokiman ki manke",autre:"Lòt rezon"},
    ask:"Mande transfè dosye a",consent:"Konsantman paran an",byCase:"Paran an dakò (bwat ak non)",byOtp:"Voye yon kòd bay paran ki anrejistre nan ansyen lekòl la",
    parent:"Non paran an oswa responsab la",agree:"Mwen konfime paran sa a dakò pou nou transfere dosye a.",toCls:"Klas kote l ap antre (si ou vle)",noCls:"N ap chwazi pita",motive:"Rezon (si ou vle)",
    send:"Voye demann lan",sent:"Demann lan ale.",codeSent:d=>`Kòd la ale bay paran an (${d}).`,
    rs:{demande:"Mande",consentement:"Paran an dakò",approuve_origine:"Lekòl orijin nan apwouve",approuve_ministere:"Ministè a apwouve",transfere:"Transfere",refuse:"Refize",annule:"Anile"},
    from:"Soti",to:"Ale",created:"Demann",expires:"Ap ekspire",consentBy:"Konsantman",signed:"Siyen pa",key:"kle",ministry:"N ap tann otorizasyon ministè a",
    otpCode:"Kòd paran an resevwa",validate:"Valide kòd la",resend:"Voye kòd la ankò",cancel:"Anile demann lan",cancelWhy:"Rezon anilasyon an",
    approve:"Apwouve epi siyen",approveHelp:"N ap mete siyati direksyon an ak siyati elektwonik lekòl la sou demann lan, epi n ap kopye dosye a bay lekòl k ap resevwa l la.",
    refuse:"Refize",refuseWhy:"Rezon refi a",confirm:"Konfime",cert:"Sètifika transfè",dossier:"Dosye nou resevwa",reason:"Rezon",noReq:"Pa gen demann.",pending:"Pou trete",history:"Istorik",
    done:"Dosye a transfere.",flagT:"Mete yon siyalman",flagHelp:"Lòt lekòl yo wè kategori a ak dat la ; se direksyon yo sèlman ki wè ti tèks la.",
    cat0:"Kategori",date:"Dat",text:"Ti tèks (200 karaktè)",flagBtn:"Anrejistre siyalman an",lift:"Leve",liftWhy:"Rezon pou leve l",lifted:"Leve",active:"Aktif",
    pickCls:"Klas",save:"Anrejistre",saved:"Anrejistre.",noStu:"Pa gen elèv nan klas sa a.",student:"Elèv",
    dosT:"Dosye anvan an",classes:"Klas",notes:"Nòt ki pibliye",releves:"Relve ki soti",sigOk:"Siyati orijin nan valab",sigKo:"Siyati orijin nan pa valab",dl:"Telechaje",empty:"Pa gen anyen pou montre.",back:"Retounen",
    subject:"Matyè",eval:"Evalyasyon",score:"Nòt",period:"Peryòd",year:"Ane",
    err:"Refize : ",net:"Fò gen rezo pou aksyon sa a.",wait:"Ap chaje…",noAccess:"Se direksyon ak sekretarya sèlman ki gen aksè."},
};
const t=k=>T[lang()][k];
let EL=null, C={}, TAB="verifier", LAST=null, CLASSES=null, ITEMS=[];
const roles=()=>(C.me&&C.me.roles)||[];
const has=(...r)=>r.some(x=>roles().includes(x));
(function css(){ if(document.getElementById("trfCss")) return; const l=document.createElement("link"); l.id="trfCss"; l.rel="stylesheet"; l.href=NORIA_U.v("src/transferts.css"); document.head.appendChild(l); })();
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.clone().json(); }catch(e){} return {status:r.status,body:b,res:r};
}
const post=(p,b,m)=>api(p,{method:m||"POST",body:JSON.stringify(b||{})}).catch(()=>null);
const get=p=>api(p).catch(()=>null);
const $=id=>document.getElementById(id);
function toast(m){ const c=$("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
const fail=r=>toast(!r?t("net"):t("err")+((r.body&&r.body.error)||r.status));
const chip=(s,l)=>`<span class="tr-chip tr-${esc(s)}">${esc(l)}</span>`;
async function download(path){
  const r=await api(path).catch(()=>null); if(!r||r.status!==200) return fail(r);
  const cd=r.res.headers.get("content-disposition")||""; const m=cd.match(/filename="([^"]+)"/);
  const blob=await r.res.blob(); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=m?m[1]:"document.pdf";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}
const today=()=>{ const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10); }; // date locale

function shell(){
  const tabs=Object.keys(T.fr.tabs).filter(k=>k!=="decisions"||has("direction","secretariat"));
  EL.innerHTML=`<h2 class="u6">${esc(t("title"))}</h2><p class="small mut">${esc(t("help"))}</p>
    <div class="tr-tabs" role="tablist">${tabs.map(k=>`<button type="button" role="tab" id="trTab-${k}" class="${k===TAB?"on":"ghost"}" aria-selected="${k===TAB}" data-action="NORIA_TRF.tab" data-a0="s:${k}">${esc(t("tabs")[k])}<span class="tr-n" id="trN-${k}"></span></button>`).join("")}</div>
    <div id="trBody"><p class="mut">${esc(t("wait"))}</p></div>`;
}
function tab(k){ TAB=k; render("transferts",EL,C); }

/* ---------- Vérifier un élève ---------- */
function verifier(){
  $("trBody").innerHTML=`<form id="trSearch" class="card tr-grid" data-action-submit="NORIA_TRF.search" novalidate>
    <label class="fld">${esc(t("code"))}<input id="trCode" autocomplete="off" autocapitalize="characters" maxlength="31" required></label>
    <label class="fld">${esc(t("birth"))}<input id="trBirth" type="date" max="${today()}" required></label>
    <button type="submit">${esc(t("check"))}</button><p class="small mut tr-full">${esc(t("minimal"))}</p></form><div id="trRes" aria-live="polite"></div>`;
}
async function search(){
  const code=$("trCode").value.trim(), birth=$("trBirth").value, box=$("trRes");
  if(!code) return $("trCode").focus();
  if(!birth){ box.innerHTML=`<p class="badbox">${esc(t("birthReq"))}</p>`; return $("trBirth").focus(); }
  const r=await post("/api/transferts/recherche",{code,birth_date:birth}); if(!r||r.status!==200) return fail(r);
  LAST={code,birth,...r.body}; const x=r.body;
  if(!x.existe){ box.innerHTML=`<div class="card tr-none">${esc(t("none"))}</div>`; return; }
  const flags=x.signalements.length?`<ul class="tr-flags">${x.signalements.map(f=>`<li>${chip("flag",t("cat")[f.categorie]||f.categorie)} <small>${esc(f.date)} · ${esc(f.ecole)}</small>${f.texte?`<p class="small">${esc(f.texte)}</p>`:""}</li>`).join("")}</ul>`:`<p class="small mut">${esc(t("noFlag"))}</p>`;
  const can=!x.meme_ecole&&!x.transfert_en_cours&&x.statut!=="transfere";
  box.innerHTML=`<div class="card tr-res" id="trCard"><div class="row sp"><h3>${esc(x.eleve.prenom)} ${esc(x.eleve.nom)}</h3>${chip(x.statut,t("st")[x.statut])}</div>
    <dl class="tr-dl"><dt>${esc(t("school"))}</dt><dd>${esc(x.ecole.nom)} <small class="mut">(${esc(t(x.ecole.actuelle?"current":"last"))})</small></dd>
    <dt>${esc(t("cls"))}</dt><dd>${esc(x.derniere_classe||"—")}${x.annee?` · ${esc(x.annee)}`:""}</dd>
    <dt>${esc(t("decision"))}</dt><dd>${x.decision?`${esc(t("dec")[x.decision.valeur]||x.decision.valeur)} · ${esc(x.decision.annee)}`:"—"}</dd>
    ${x.precedente?`<dt>${esc(t("prev"))}</dt><dd>${esc(x.precedente.ecole)} · ${esc(x.precedente.date)}</dd>`:""}</dl>
    <h4>${esc(t("flags"))}</h4>${flags}
    ${x.meme_ecole?`<p class="small mut">${esc(t("same"))}</p>`:""}${x.transfert_en_cours?`<p class="small">${esc(t("busy"))}</p>`:""}
    ${can?`<button type="button" id="trAskBtn" data-action="NORIA_TRF.askForm">${esc(t("ask"))}</button>`:""}<div id="trAsk"></div></div>`;
}
async function askForm(){
  if(!CLASSES){ const r=await get("/api/classes"); CLASSES=r&&r.status===200?r.body:[]; }
  const b=$("trAskBtn"); if(b) b.remove();
  $("trAsk").innerHTML=`<form id="trReq" class="tr-grid tr-ask" data-action-submit="NORIA_TRF.ask" novalidate><h4 class="tr-full">${esc(t("consent"))}</h4>
    <label class="tr-radio tr-full"><input type="radio" name="trMode" id="trModeCase" value="case" checked data-action-change="NORIA_TRF.mode" data-a0="s:case"> ${esc(t("byCase"))}</label>
    <label class="tr-radio tr-full"><input type="radio" name="trMode" id="trModeOtp" value="otp" data-action-change="NORIA_TRF.mode" data-a0="s:otp"> ${esc(t("byOtp"))}</label>
    <div id="trCaseBox" class="tr-full tr-grid"><label class="fld">${esc(t("parent"))}<input id="trParent" maxlength="120" autocomplete="off"></label>
      <label class="tr-check tr-full"><input type="checkbox" id="trAgree"> ${esc(t("agree"))}</label></div>
    <label class="fld">${esc(t("toCls"))}<select id="trCls"><option value="">${esc(t("noCls"))}</option>${CLASSES.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
    <label class="fld">${esc(t("motive"))}<input id="trWhy" maxlength="300"></label><button type="submit">${esc(t("send"))}</button></form>`;
}
function mode(m){ const b=$("trCaseBox"); if(b) b.hidden=m!=="case"; }
async function ask(){
  if(!LAST) return;
  const m=$("trModeOtp").checked?"otp":"case";
  const body={code:LAST.code,birth_date:LAST.birth,motif:$("trWhy").value,consentement:m==="otp"?{mode:"otp"}:{mode:"case",parent:$("trParent").value,accord:$("trAgree").checked}};
  if($("trCls").value) body.class_id=Number($("trCls").value);
  const r=await post("/api/transferts",body); if(!r||r.status!==200) return fail(r);
  toast(r.body.code_envoye?t("codeSent")(r.body.code_envoye.destinataire):t("sent")); TAB="envoyes"; render("transferts",EL,C);
}

/* ---------- Demandes envoyées / reçues ---------- */
async function lists(){
  const r=await get("/api/transferts"); const box=$("trBody"); if(!box) return;
  if(!r||r.status!==200){ box.innerHTML=`<div class="badbox">${esc(t("net"))}</div>`; return; }
  ITEMS=r.body.items;
  const recu=ITEMS.filter(x=>x.sens==="recu"&&x.statut==="consentement").length, env=ITEMS.filter(x=>x.sens==="envoye"&&x.statut==="demande").length;
  const n=(k,v)=>{ const e=$("trN-"+k); if(e) e.textContent=v?` ${v}`:""; }; n("recus",recu); n("envoyes",env);
  if(TAB!=="envoyes"&&TAB!=="recus") return;
  const mine=ITEMS.filter(x=>x.sens===(TAB==="recus"?"recu":"envoye"));
  const open=mine.filter(x=>!["transfere","refuse","annule"].includes(x.statut)), done=mine.filter(x=>["transfere","refuse","annule"].includes(x.statut));
  box.innerHTML=!mine.length?`<p class="mut">${esc(t("noReq"))}</p>`:`${open.length?`<div class="card"><h3>${esc(t("pending"))} (${open.length})</h3><ul class="tr-reqs">${open.map(item).join("")}</ul></div>`:""}
    ${done.length?`<div class="card"><h3>${esc(t("history"))}</h3><ul class="tr-reqs">${done.map(item).join("")}</ul></div>`:""}`;
}
function item(x){
  const dir=has("direction"), acc=x.sens==="envoye", c=x.consentement||{};
  const acts=[];
  if(acc&&x.statut==="demande"&&c.mode==="otp") acts.push(`<form class="tr-mini" data-action-submit="NORIA_TRF.consent" data-a0="n:${x.id}" novalidate><label class="fld">${esc(t("otpCode"))}<input id="trOtp${x.id}" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label><button type="submit">${esc(t("validate"))}</button><button type="button" class="ghost" data-action="NORIA_TRF.resend" data-a0="n:${x.id}">${esc(t("resend"))}</button></form>`);
  if(acc&&["demande","consentement","approuve_origine"].includes(x.statut)) acts.push(`<button type="button" class="ghost" data-action="NORIA_TRF.reasonForm" data-a0="n:${x.id}" data-a1="s:annuler">${esc(t("cancel"))}</button>`);
  if(!acc&&dir&&x.statut==="consentement") acts.push(`<p class="small mut">${esc(t("approveHelp"))}</p><button type="button" id="trApprove${x.id}" data-action="NORIA_TRF.approve" data-a0="n:${x.id}">${esc(t("approve"))}</button><button type="button" class="ghost" data-action="NORIA_TRF.reasonForm" data-a0="n:${x.id}" data-a1="s:refuser">${esc(t("refuse"))}</button>`);
  if(x.statut==="transfere") acts.push(`<button type="button" data-action="NORIA_TRF.cert" data-a0="n:${x.id}">${esc(t("cert"))}</button>`);
  if(x.statut==="transfere"&&acc&&x.eleve_id) acts.push(`<button type="button" class="ghost" data-action="NORIA_TRF.dossier" data-a0="n:${x.eleve_id}">${esc(t("dossier"))}</button>`);
  return `<li class="tr-req" id="trq${x.id}"><div class="row sp"><span><b>${esc(x.eleve)}</b> <small>${esc(x.code_eleve)}</small></span>${chip(x.statut,t("rs")[x.statut])}</div>
    <p class="small">${esc(t("from"))} <b>${esc(x.ecole_origine)}</b> ${esc(t("to").toLowerCase())} <b>${esc(x.ecole_accueil)}</b>${x.classe_accueil?` (${esc(x.classe_accueil)})`:""}</p>
    <p class="small mut">${esc(t("created"))} ${esc(x.cree_le)}${x.expire_le?` · ${esc(t("expires"))} ${esc(String(x.expire_le).slice(0,10))}`:""}${c.le?` · ${esc(t("consentBy"))} : ${esc(c.parent||c.destinataire||"")}`:""}${x.motif?` · ${esc(t("reason"))} : ${esc(x.motif)}`:""}</p>
    ${x.approuve_le?`<p class="small mut">${esc(t("signed"))} ${esc(x.signataire||"")} · ${esc(String(x.approuve_le).slice(0,10))} · ${esc(t("key"))} <code>${esc(x.cle||"")}</code></p>`:""}
    ${x.statut==="approuve_origine"&&x.ministere?`<p class="small">${esc(t("ministry"))}</p>`:""}
    ${x.motif_refus?`<p class="small"><b>${esc(t("reason"))} :</b> ${esc(x.motif_refus)}</p>`:""}${x.motif_annulation&&x.statut==="annule"?`<p class="small"><b>${esc(t("reason"))} :</b> ${esc(x.motif_annulation)}</p>`:""}
    ${x.certificat?`<p class="small mut">${esc(t("cert"))} : <code>${esc(x.certificat)}</code></p>`:""}
    <div class="row tr-acts">${acts.join("")}</div><div id="trf${x.id}"></div></li>`;
}
function reasonForm(id,what){
  const box=$("trf"+id); if(!box) return;
  box.innerHTML=`<form class="tr-mini" data-action-submit="NORIA_TRF.decide" data-a0="n:${id}" data-a1="s:${what}" novalidate><label class="fld">${esc(t(what==="refuser"?"refuseWhy":"cancelWhy"))}<input id="trWhy${id}" maxlength="300" required></label><button type="submit">${esc(t("confirm"))}</button></form>`;
  const i=$("trWhy"+id); if(i) i.focus();
}
async function decide(id,what){ const r=await post(`/api/transferts/${id}/${what}`,{motif:($("trWhy"+id)||{}).value||""}); if(!r||r.status!==200) return fail(r); lists(); }
async function consent(id){ const r=await post(`/api/transferts/${id}/consentement`,{code:($("trOtp"+id)||{}).value||""}); if(!r||r.status!==200) return fail(r); toast(t("saved")); lists(); }
async function resend(id){ const r=await post(`/api/transferts/${id}/code`,{}); if(!r||r.status!==200) return fail(r); toast(t("codeSent")(r.body.destinataire)); }
async function approve(id){
  const b=$("trApprove"+id); if(b) b.disabled=true;
  const r=await post(`/api/transferts/${id}/approuver`,{}); if(!r||r.status!==200){ if(b) b.disabled=false; return fail(r); }
  toast(r.body.statut==="transfere"?t("done"):t("rs").approuve_origine); lists();
}
function cert(id){ download(`/api/transferts/${id}/certificat`); }

/* ---------- Dossier reçu ---------- */
async function dossier(id){
  const r=await get(`/api/students/${id}/historique`); const box=$("trBody"); if(!box) return; if(!r||r.status!==200) return fail(r);
  const d=r.body; const sec=(h,rows)=>`<h4>${esc(h)}</h4>${rows||`<p class="small mut">${esc(t("empty"))}</p>`}`;
  box.innerHTML=`<div class="card" id="trDossier"><div class="row sp"><h3>${esc(t("dosT"))}</h3><button type="button" class="ghost" data-action="NORIA_TRF.tab" data-a0="s:envoyes">${esc(t("back"))}</button></div>
    ${sec(t("classes"),d.classes.length&&`<ul class="tr-flags">${d.classes.map(c=>`<li>${esc(c.libelle)} · ${esc(c.annee)} <small class="mut">${esc(c.ecole)}</small></li>`).join("")}</ul>`)}
    ${sec(t("decision"),d.decisions.length&&`<ul class="tr-flags">${d.decisions.map(c=>`<li>${esc(t("dec")[c.libelle]||c.libelle)} · ${esc(c.annee)} <small class="mut">${esc(c.ecole)}</small></li>`).join("")}</ul>`)}
    ${sec(t("notes"),d.notes.length&&`<div class="tr-wrap"><table class="tr-tab"><thead><tr><th>${esc(t("year"))}</th><th>${esc(t("period"))}</th><th>${esc(t("subject"))}</th><th>${esc(t("eval"))}</th><th>${esc(t("score"))}</th></tr></thead><tbody>${d.notes.map(n=>`<tr><td>${esc(n.annee)}</td><td>${esc(n.periode)}</td><td>${esc(n.libelle)}</td><td>${esc(n.evaluation)}</td><td>${n.note==null?esc(n.mention||"—"):`${esc(n.note)}/${esc(n.sur)}`}</td></tr>`).join("")}</tbody></table></div>`)}
    ${sec(t("releves"),d.releves.length&&`<ul class="tr-flags">${d.releves.map(x=>`<li>${esc(x.libelle)} <code>${esc(x.code)}</code> ${chip(x.signature_valide?"transfere":"refuse",t(x.signature_valide?"sigOk":"sigKo"))} <button type="button" class="ghost" data-action="NORIA_TRF.relPdf" data-a0="n:${x.id}">${esc(t("dl"))}</button></li>`).join("")}</ul>`)}</div>`;
}
function relPdf(id){ download(`/api/historique/${id}/pdf`); }

/* ---------- Signalements ---------- */
async function flags(){
  const r=await get("/api/signalements"); const box=$("trBody"); if(!box) return; if(!r||r.status!==200){ box.innerHTML=`<div class="badbox">${esc(t("net"))}</div>`; return; }
  const dir=has("direction");
  box.innerHTML=`${dir?`<form id="trFlag" class="card tr-grid" data-action-submit="NORIA_TRF.flag" novalidate><h3 class="tr-full">${esc(t("flagT"))}</h3><p class="small mut tr-full">${esc(t("flagHelp"))}</p>
    <label class="fld">${esc(t("code"))}<input id="trFCode" maxlength="31" autocapitalize="characters" required></label>
    <label class="fld">${esc(t("cat0"))}<select id="trFCat">${Object.keys(T.fr.cat).map(k=>`<option value="${k}">${esc(t("cat")[k])}</option>`).join("")}</select></label>
    <label class="fld">${esc(t("date"))}<input id="trFDate" type="date" max="${today()}" value="${today()}"></label>
    <label class="fld tr-full">${esc(t("text"))}<input id="trFText" maxlength="200"></label><button type="submit">${esc(t("flagBtn"))}</button></form>`:""}
    <div class="card">${r.body.length?`<ul class="tr-reqs">${r.body.map(f=>`<li class="tr-req"><div class="row sp"><span><b>${esc(f.eleve)}</b> <small>${esc(f.code)}</small></span>${f.actif?chip("flag",t("active")):chip("transfere",`${t("lifted")} ${f.leve_le}`)}</div>
      <p class="small">${esc(t("cat")[f.categorie]||f.categorie)} · ${esc(f.date)} · ${esc(f.par)}</p>${f.texte?`<p class="small">${esc(f.texte)}</p>`:""}${f.motif_levee?`<p class="small mut">${esc(f.motif_levee)}</p>`:""}
      ${dir&&f.actif?`<form class="tr-mini" data-action-submit="NORIA_TRF.lift" data-a0="n:${f.id}" novalidate><label class="fld">${esc(t("liftWhy"))}<input id="trL${f.id}" maxlength="200" required></label><button type="submit" class="ghost">${esc(t("lift"))}</button></form>`:""}</li>`).join("")}</ul>`:`<p class="mut">${esc(t("noFlag"))}</p>`}</div>`;
}
async function flag(){
  const r=await post("/api/signalements",{code:$("trFCode").value,categorie:$("trFCat").value,date:$("trFDate").value,texte:$("trFText").value}); if(!r||r.status!==200) return fail(r);
  toast(t("saved")); flags();
}
async function lift(id){ const r=await post(`/api/signalements/${id}/lever`,{motif:($("trL"+id)||{}).value||""}); if(!r||r.status!==200) return fail(r); flags(); }

/* ---------- Décisions de fin d'année ---------- */
async function decisions(){
  if(!CLASSES){ const r=await get("/api/classes"); CLASSES=r&&r.status===200?r.body:[]; }
  $("trBody").innerHTML=`<div class="card"><label class="fld">${esc(t("pickCls"))}<select id="trDCls" data-action-change="NORIA_TRF.decList" data-a0="v">${CLASSES.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label><div id="trDList"></div></div>`;
  if(CLASSES.length) decList(CLASSES[0].id);
}
async function decList(id){
  const r=await get(`/api/decisions?class_id=${encodeURIComponent(id)}`); const box=$("trDList"); if(!box) return; if(!r||r.status!==200) return fail(r);
  const d=r.body, dir=has("direction");
  box.innerHTML=!d.eleves.length?`<p class="mut">${esc(t("noStu"))}</p>`:`<p class="small mut">${esc(d.classe)} · ${esc(d.annee)}</p><div class="tr-wrap"><table class="tr-tab"><thead><tr><th>${esc(t("student"))}</th><th>${esc(t("decision"))}</th></tr></thead><tbody>${d.eleves.map(e=>`<tr><td>${esc(e.eleve)} <small class="mut">${esc(e.code)}</small></td><td>${dir
    ?`<select id="trDec${e.id}" aria-label="${esc(t("decision"))} ${esc(e.eleve)}" data-action-change="NORIA_TRF.setDec" data-a0="n:${e.id}" data-a1="n:${d.school_year_id}" data-a2="v"><option value="">—</option>${Object.keys(T.fr.dec).map(k=>`<option value="${k}"${e.decision===k?" selected":""}>${esc(t("dec")[k])}</option>`).join("")}</select>`
    :esc(e.decision?t("dec")[e.decision]:"—")}</td></tr>`).join("")}</tbody></table></div>`;
}
async function setDec(id,year,v){ if(!v) return; const r=await post(`/api/students/${id}/decision`,{school_year_id:year,decision:v},"PUT"); if(!r||r.status!==200) return fail(r); toast(t("saved")); }

function render(m,el,ctx){
  EL=el; C=ctx||{};
  if(!has("direction","secretariat")){ EL.innerHTML=`<div class="badbox">${esc(t("noAccess"))}</div>`; return; }
  shell();
  if(TAB==="verifier") verifier(); else if(TAB==="signalements") flags(); else if(TAB==="decisions") decisions();
  lists();
}
window.NORIA_TRF=Object.freeze({render,tab,search,askForm,mode,ask,reasonForm,decide,consent,resend,approve,cert,dossier,relPdf,flag,lift,decList,setDec});
})();

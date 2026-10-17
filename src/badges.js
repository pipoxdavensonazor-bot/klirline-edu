/* NORIA — bloc 2, chargé à la demande : recherche rapide et scan (direction, secrétariat, bibliothèque), vérification
   d'un badge (direction), badges par année scolaire (génération, PDF CR80, planches A4, révocation et réédition),
   photo de l'élève (recadrage carré, JPEG ≤ 40 Ko), relevés de notes officiels (demande, décision, téléchargement,
   notifications ; signature du directeur et sceau). Scan : BarcodeDetector si disponible, sinon src/qr-decode.js
   (chargé à la demande) ; saisie manuelle du code toujours possible. CSP stricte : data-action, classes CSS. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{scanT:"Recherche et scan",scanHelp:"Tapez un nom ou un code élève, ou scannez un badge.",search:"Rechercher un élève (nom, code)",scan:"Scanner",verify:"Vérifier un badge",
    manual:"Saisir le code (code élève ou code du badge)",open:"Ouvrir",none:"Aucun élève trouvé.",close:"Fermer",camera:"Placez le QR du badge dans le cadre.",noCam:"Caméra indisponible : importez une photo du QR ou saisissez le code.",
    fromImg:"Importer une photo du QR",reading:"Lecture…",notQr:"Aucun QR lisible sur l'image.",unknown:"Badge ou code inconnu dans cette école.",
    st:{valide:"VALIDE",expire:"EXPIRÉ",revoque:"RÉVOQUÉ",inconnu:"INCONNU",code:"Code saisi"},compare:"Comparez la photo et le nom avec la personne.",
    cls:"Classe",code:"Code élève",born:"Naissance",parents:"Parents",loans:"Prêts en cours",noLoans:"Aucun prêt en cours.",late:"en retard",due:"retour le",
    lend:"Prêter un livre",book:"Livre",lendBtn:"Prêter",lent:"Prêt enregistré.",badge:"Badge",year:"Année",expires:"Expire le",reason:"Motif",
    photo:"Photo",photoHelp:"Recadrée en carré et compressée (40 Ko au plus) avant l'envoi.",photoSaved:"Photo enregistrée.",noPhoto:"Pas de photo",
    badgesT:"Badges élèves",badgesHelp:"Un badge par élève et par année scolaire. Il expire à la fin de l'année ; la génération de l'année suivante marque les anciens expirés.",
    allCls:"Toutes les classes",gen:"Générer les badges",genDone:(c,k,e)=>`${c} badge(s) créé(s), ${k} déjà valide(s), ${e} ancien(s) expiré(s).`,
    sheet:n=>`Planche A4 (${n})`,pdf:"PDF",revoke:"Révoquer",revokeHelp:"Badge perdu ou volé : il devient RÉVOQUÉ partout.",reissue:"Rééditer un nouveau badge",confirm:"Confirmer",
    revoked:"Badge révoqué.",reissued:"Badge révoqué et nouveau badge édité.",name:"Élève",status:"Statut",actions:"Actions",noBadge:"Aucun badge pour ce choix.",pickCls:"Choisissez une classe pour la planche.",
    relT:"Relevés de notes",relHelp:"Relevé officiel signé par la direction, vérifiable par QR code.",ask:"Demander un relevé",student:"Élève",kind:"Type",
    period:"Une période",wholeYear:"Toute l'année",term:"Période",motive:"Motif (facultatif)",send:"Envoyer la demande",sent:"Demande envoyée.",
    rs:{demande:"Demandé",approuve:"Approuvé",refuse:"Refusé",emis:"Émis",annule:"Annulé"},dl:"Télécharger",withdraw:"Retirer",approve:"Approuver et émettre",refuseB:"Refuser",cancel:"Annuler le relevé",
    refuseWhy:"Motif du refus",cancelWhy:"Motif de l'annulation",pending:"Demandes à traiter",others:"Historique",noReq:"Aucune demande.",issued:"Relevé émis et déposé dans le portail.",
    sigT:"Signature du directeur et sceau",sigHelp:"La signature est téléversée une seule fois ; le sceau figure dans le profil de l'école. Les deux apparaissent sur les relevés.",
    sigName:"Nom du signataire",sigFile:"Image de la signature",sealFile:"Sceau ou cachet de l'école",sigOk:"Signature enregistrée",sigNo:"Aucune signature : téléversez-la avant d'approuver.",sealOk:"Sceau enregistré",sealNo:"Aucun sceau",
    saved:"Enregistré.",save:"Enregistrer",key:"Clé de signature Ed25519",notif:"Notifications",markRead:"Marquer comme lues",noNotif:"Aucune notification.",by:"par",
    err:"Refusé : ",net:"Réseau nécessaire pour cette action.",wait:"Chargement…",tooBig:"Image trop lourde même réduite.",badImg:"Image illisible.",noAccess:"Accès non autorisé pour ce rôle."},
  ht:{scanT:"Chèche ak eskane",scanHelp:"Tape yon non oswa yon kòd elèv, oswa eskane yon badj.",search:"Chèche yon elèv (non, kòd)",scan:"Eskane",verify:"Verifye yon badj",
    manual:"Antre kòd la (kòd elèv oswa kòd badj la)",open:"Louvri",none:"Nou pa jwenn okenn elèv.",close:"Fèmen",camera:"Mete QR badj la nan kad la.",noCam:"Kamera a pa disponib : enpòte yon foto QR la oswa antre kòd la.",
    fromImg:"Enpòte yon foto QR la",reading:"Ap li…",notQr:"Pa gen QR nou ka li sou imaj la.",unknown:"Badj oswa kòd sa a pa konnen nan lekòl la.",
    st:{valide:"VALAB",expire:"EKSPIRE",revoque:"REVOKE",inconnu:"PA KONNEN",code:"Kòd antre"},compare:"Konpare foto a ak non an ak moun nan.",
    cls:"Klas",code:"Kòd elèv",born:"Dat nesans",parents:"Paran",loans:"Prè ki an kou",noLoans:"Pa gen prè an kou.",late:"an reta",due:"pou remèt",
    lend:"Prete yon liv",book:"Liv",lendBtn:"Prete",lent:"Prè a anrejistre.",badge:"Badj",year:"Ane",expires:"Ap ekspire",reason:"Rezon",
    photo:"Foto",photoHelp:"Nou koupe l kare epi nou konprese l (40 Ko maksimòm) anvan nou voye l.",photoSaved:"Foto a anrejistre.",noPhoto:"Pa gen foto",
    badgesT:"Badj elèv",badgesHelp:"Yon badj pou chak elèv chak ane lekòl. Li ekspire nan fen ane a ; lè nou jenere ane apre a, ansyen yo vin ekspire.",
    allCls:"Tout klas yo",gen:"Jenere badj yo",genDone:(c,k,e)=>`${c} badj kreye, ${k} ki te deja valab, ${e} ansyen ki ekspire.`,
    sheet:n=>`Fèy A4 (${n})`,pdf:"PDF",revoke:"Revoke",revokeHelp:"Badj pèdi oswa vòlè : li vin REVOKE toupatou.",reissue:"Fè yon nouvo badj",confirm:"Konfime",
    revoked:"Badj la revoke.",reissued:"Badj la revoke epi nou fè yon nouvo.",name:"Elèv",status:"Eta",actions:"Aksyon",noBadge:"Pa gen badj pou chwa sa a.",pickCls:"Chwazi yon klas pou fèy la.",
    relT:"Relve nòt",relHelp:"Relve ofisyèl direksyon an siyen, ou ka verifye l ak QR kòd.",ask:"Mande yon relve",student:"Elèv",kind:"Kalite",
    period:"Yon peryòd",wholeYear:"Tout ane a",term:"Peryòd",motive:"Rezon (si ou vle)",send:"Voye demann lan",sent:"Demann lan voye.",
    rs:{demande:"Mande",approuve:"Apwouve",refuse:"Refize",emis:"Emèt",annule:"Anile"},dl:"Telechaje",withdraw:"Retire",approve:"Apwouve epi emèt",refuseB:"Refize",cancel:"Anile relve a",
    refuseWhy:"Rezon refi a",cancelWhy:"Rezon anilasyon an",pending:"Demann pou trete",others:"Istorik",noReq:"Pa gen demann.",issued:"Relve a emèt epi li nan pòtay la.",
    sigT:"Siyati direktè a ak so lekòl la",sigHelp:"Ou voye siyati a yon sèl fwa ; so a nan pwofil lekòl la. Toulède parèt sou relve yo.",
    sigName:"Non moun k ap siyen an",sigFile:"Imaj siyati a",sealFile:"So oswa koupon lekòl la",sigOk:"Siyati a anrejistre",sigNo:"Pa gen siyati : voye l anvan ou apwouve.",sealOk:"So a anrejistre",sealNo:"Pa gen so",
    saved:"Anrejistre.",save:"Anrejistre",key:"Kle siyati Ed25519",notif:"Notifikasyon",markRead:"Make yo li",noNotif:"Pa gen notifikasyon.",by:"pa",
    err:"Refize : ",net:"Fò gen rezo pou aksyon sa a.",wait:"Ap chaje…",tooBig:"Imaj la twò lou menm apre li redui.",badImg:"Nou pa ka li imaj la.",noAccess:"Wòl sa a pa gen aksè."},
};
const t=k=>T[lang()][k];
let EL=null, C={}, MODE="scan", SCAN=null, FICHE=null, BOOKS=null, YEARS=null, CLASSES=null, TERMS=null;
const roles=()=>(C.me&&C.me.roles)||[];
const has=(...r)=>r.some(x=>roles().includes(x));

// Feuille de style du module (même origine, CSP style-src 'self'), ajoutée une fois.
(function css(){ if(document.getElementById("badCss")) return; const l=document.createElement("link"); l.id="badCss"; l.rel="stylesheet"; l.href=NORIA_U.v("src/badges.css"); document.head.appendChild(l); })();

async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.clone().json(); }catch(e){} return {status:r.status,body:b,res:r};
}
const post=(p,b,m)=>api(p,{method:m||"POST",body:JSON.stringify(b||{})}).catch(()=>null);
const get=p=>api(p).catch(()=>null);
function toast(m){ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
const fail=r=>toast(!r?t("net"):t("err")+((r.body&&r.body.error)||r.status));
const $=id=>document.getElementById(id);
async function download(path){
  const r=await api(path).catch(()=>null);
  if(!r||r.status!==200) return fail(r);
  const cd=r.res.headers.get("content-disposition")||""; const m=cd.match(/filename="([^"]+)"/);
  const blob=await r.res.blob(); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=m?m[1]:"document.pdf";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}
const chip=(s,lbl)=>`<span class="b2-chip b2-${esc(s)}">${esc(lbl)}</span>`;
const avatar=(e,cls)=>e.photo?`<img class="b2-ph ${cls||""}" src="${esc(e.photo)}" alt="${esc(t("photo"))} ${esc(e.first_name)}" width="96" height="96">`:`<span class="b2-ph b2-noph ${cls||""}" aria-label="${esc(t("noPhoto"))}">${esc(((e.first_name||"?")[0]+(e.last_name||"?")[0]).toUpperCase())}</span>`;

/* ---------- Recherche et scan ---------- */
function scanView(){
  if(!has("direction","secretariat","bibliotheque")){ EL.innerHTML=`<div class="badbox">${esc(t("noAccess"))}</div>`; return; }
  EL.innerHTML=`<h2 class="u6">${esc(t("scanT"))}</h2><p class="small mut">${esc(t("scanHelp"))}</p>
  <div class="card b2-bar"><label class="fld b2-grow">${esc(t("search"))}<input id="bSearch" type="search" autocomplete="off" maxlength="60" data-action-input="NORIA_BAD.search" data-a0="v"></label>
    <div class="row"><button type="button" id="bScanBtn" data-action="NORIA_BAD.openScan" data-a0="s:fiche">${esc(t("scan"))}</button>
    ${has("direction")?`<button type="button" id="bVerifyBtn" class="ghost" data-action="NORIA_BAD.openScan" data-a0="s:verif">${esc(t("verify"))}</button>`:""}</div>
    <form id="bManual" class="row b2-grow" data-action-submit="NORIA_BAD.manual" novalidate><label class="fld b2-grow">${esc(t("manual"))}<input id="bCode" autocomplete="off" maxlength="300" autocapitalize="characters"></label><button type="submit" class="ghost">${esc(t("open"))}</button></form></div>
  <div id="bResults" class="b2-results" aria-live="polite"></div><div id="bOut"></div>`;
}
let qTimer=null, qSeq=0;
function search(v){
  clearTimeout(qTimer);
  qTimer=setTimeout(async()=>{
    const q=String(v||"").trim(); const box=$("bResults"); if(!box) return;
    if(q.length<2){ box.innerHTML=""; return; }
    const n=++qSeq; const r=await get("/api/recherche?q="+encodeURIComponent(q));
    if(n!==qSeq||!$("bResults")) return;
    if(!r||r.status!==200){ box.innerHTML=`<p class="badbox">${esc(t("net"))}</p>`; return; }
    box.innerHTML=r.body.length?`<ul class="b2-list">${r.body.map(e=>`<li><button type="button" class="b2-hit" data-action="NORIA_BAD.openCard" data-a0="n:${e.id}">${avatar(e,"b2-sm")}<span><b>${esc(e.first_name)} ${esc(e.last_name)}</b><small>${esc(e.code)}${e.class_name?" · "+esc(e.class_name):""}</small></span></button></li>`).join("")}</ul>`
      :`<p class="mut small">${esc(t("none"))}</p>`;
  },180);
}
async function openCard(id){
  const r=await get("/api/fiche/"+id); if(!r||r.status!==200) return fail(r);
  showCard({statut:null,eleve:r.body});
}
async function manual(){
  const v=($("bCode")||{}).value||""; if(!v.trim()) return;
  await handle(MODE_SCAN||"fiche",v);
}
let MODE_SCAN="fiche";
async function handle(mode,value){
  if(mode==="verif"){
    const r=await post("/api/badges/verifier",{valeur:value}); if(!r||r.status!==200) return fail(r);
    return showVerify(r.body);
  }
  const r=await post("/api/scan",{valeur:value}); if(!r||r.status!==200) return fail(r);
  if(r.body.statut==="inconnu"){ $("bOut").innerHTML=`<div class="card b2-res b2-r-inconnu" id="bFiche"><p class="b2-big">${chip("inconnu",t("st").inconnu)}</p><p>${esc(t("unknown"))}</p></div>`; return; }
  showCard(r.body);
}
function showVerify(v){
  const s=v.statut, e=v.eleve;
  $("bOut").innerHTML=`<div class="card b2-res b2-r-${esc(s)}" id="bVerif" role="status"><p class="b2-big">${chip(s,t("st")[s])}</p>
    ${e?`<div class="b2-who">${avatar(e,"b2-lg")}<div><h3>${esc(e.first_name)} ${esc(e.last_name)}</h3><p class="small">${esc(t("code"))} : <b>${esc(e.code)}</b><br>${esc(t("cls"))} : ${esc(v.badge.class_name||"-")}<br>${esc(t("year"))} : ${esc(v.badge.year)} · ${esc(t("expires"))} ${esc(v.badge.expires_on)}</p>
    ${v.badge.revoked_reason?`<p class="small"><b>${esc(t("reason"))} :</b> ${esc(v.badge.revoked_reason)}</p>`:""}<p class="small mut">${esc(t("compare"))}</p></div></div>`:`<p>${esc(t("unknown"))}</p>`}</div>`;
}
function showCard(res){
  const e=res.eleve; FICHE=e;
  const b=res.badge, s=res.statut;
  const badgeLine=b?`<p>${chip(s,t("st")[s])} <span class="small">${esc(t("badge"))} ${esc(b.year)} · ${esc(t("expires"))} ${esc(b.expires_on)}</span></p>`
    :(e.current_badge?`<p class="small">${chip(e.current_badge.status,t("st")[e.current_badge.status])} ${esc(t("badge"))} ${esc(e.current_badge.year)}</p>`:"");
  const staff=has("direction","secretariat");
  const loans=e.loans?`<h4>${esc(t("loans"))}</h4>${e.loans.length?`<ul class="b2-loans">${e.loans.map(l=>`<li class="${l.late?"b2-late":""}">${esc(l.title)} <small>${esc(t("due"))} ${esc(l.due_on)}${l.late?" · "+esc(t("late")):""}</small></li>`).join("")}</ul>`:`<p class="small mut">${esc(t("noLoans"))}</p>`}
    <form id="bLend" class="row" data-action-submit="NORIA_BAD.lend" novalidate><label class="fld b2-grow">${esc(t("book"))}<select id="bBook"><option value="">${esc(t("wait"))}</option></select></label><button type="submit">${esc(t("lendBtn"))}</button></form>`:"";
  $("bOut").innerHTML=`<div class="card b2-res" id="bFiche"><div class="b2-who">${avatar(e,"b2-lg")}<div><h3>${esc(e.first_name)} ${esc(e.last_name)}</h3>
    <p class="small">${esc(t("code"))} : <b>${esc(e.code)}</b><br>${esc(t("cls"))} : ${esc(e.class_name||"-")}${e.birth_date?`<br>${esc(t("born"))} : ${esc(e.birth_date)}`:""}</p>${badgeLine}</div></div>
    ${e.parents&&e.parents.length?`<h4>${esc(t("parents"))}</h4><ul class="b2-loans">${e.parents.map(p=>`<li>${esc(p.name)}${p.phone?` <small>${esc(p.phone)}</small>`:""}</li>`).join("")}</ul>`:""}
    ${loans}
    ${staff?`<h4>${esc(t("photo"))}</h4><p class="small mut">${esc(t("photoHelp"))}</p><input type="file" id="bPhoto" accept="image/jpeg,image/png,image/webp" data-action-change="NORIA_BAD.pickPhoto" data-a0="t"><p id="bPhMsg" class="small" role="status"></p>`:""}</div>`;
  if(e.loans) fillBooks();
}
async function fillBooks(){
  if(!BOOKS){ const r=await get("/api/books"); BOOKS=r&&r.status===200?r.body:[]; }
  const s=$("bBook"); if(!s) return;
  const av=BOOKS.filter(b=>b.available>0);
  s.innerHTML=`<option value="">—</option>`+av.map(b=>`<option value="${b.id}">${esc(b.title)} (${b.available})</option>`).join("");
}
async function lend(){
  const id=Number(($("bBook")||{}).value); if(!id||!FICHE) return;
  const r=await post("/api/loans",{book_id:id,student_id:FICHE.id}); if(!r||r.status!==200) return fail(r);
  toast(t("lent")); BOOKS=null; openCard(FICHE.id);
}

/* ---------- Scanner (caméra, image importée) ---------- */
function openScan(mode){
  MODE_SCAN=mode; closeScan();
  const d=document.createElement("div"); d.id="bScan"; d.className="b2-scan"; d.setAttribute("role","dialog"); d.setAttribute("aria-modal","true"); d.setAttribute("aria-label",mode==="verif"?t("verify"):t("scan"));
  d.innerHTML=`<div class="b2-scanbox"><div class="row sp"><b>${esc(mode==="verif"?t("verify"):t("scan"))}</b><button type="button" class="ghost" data-action="NORIA_BAD.closeScan">${esc(t("close"))}</button></div>
    <div class="b2-view"><video id="bVideo" playsinline muted></video><span class="b2-frame" aria-hidden="true"></span></div>
    <p id="bScanMsg" class="small" role="status">${esc(t("camera"))}</p>
    <label class="fld">${esc(t("fromImg"))}<input type="file" id="bScanFile" accept="image/*" data-action-change="NORIA_BAD.scanFile" data-a0="t"></label>
    <form class="row" data-action-submit="NORIA_BAD.scanManual" novalidate><label class="fld b2-grow">${esc(t("manual"))}<input id="bScanCode" autocomplete="off" maxlength="300"></label><button type="submit" class="ghost">${esc(t("open"))}</button></form></div>`;
  document.body.appendChild(d);
  startCamera();
}
function closeScan(){
  if(SCAN){ SCAN.stop=true; clearTimeout(SCAN.timer); if(SCAN.stream) SCAN.stream.getTracks().forEach(x=>x.stop()); SCAN=null; }
  const d=$("bScan"); if(d) d.remove();
}
function loadDecoder(){ return window.NORIA_QR?Promise.resolve(window.NORIA_QR):NORIA_ECO.load("src/qr-decode.js").then(()=>window.NORIA_QR); }
async function detector(){
  if("BarcodeDetector" in window){ try{ const f=await window.BarcodeDetector.getSupportedFormats(); if(f.includes("qr_code")) return new window.BarcodeDetector({formats:["qr_code"]}); }catch(e){} }
  return null;
}
// Décodage d'une source (vidéo, image) : BarcodeDetector, sinon décodeur JS sur les pixels d'un canevas.
async function decode(src,w,h){
  const bd=await detector();
  if(bd){ try{ const r=await bd.detect(src); if(r&&r[0]) return r[0].rawValue; }catch(e){} }
  const q=await loadDecoder();
  const k=Math.min(1,900/Math.max(w,h)); const cw=Math.round(w*k), ch=Math.round(h*k);
  const c=document.createElement("canvas"); c.width=cw; c.height=ch; const g=c.getContext("2d",{willReadFrequently:true}); g.drawImage(src,0,0,cw,ch);
  try{ return q.decode(g.getImageData(0,0,cw,ch)); }catch(e){ return null; }
}
async function startCamera(){
  const v=$("bVideo"), msg=$("bScanMsg");
  SCAN={stop:false};
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ msg.textContent=t("noCam"); return; }
  try{ SCAN.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false}); }
  catch(e){ if(msg) msg.textContent=t("noCam"); return; }
  if(!SCAN||SCAN.stop){ SCAN&&SCAN.stream&&SCAN.stream.getTracks().forEach(x=>x.stop()); return; }
  v.srcObject=SCAN.stream; await v.play().catch(()=>{});
  const loop=async()=>{
    if(!SCAN||SCAN.stop) return;
    if(v.videoWidth){ const val=await decode(v,v.videoWidth,v.videoHeight); if(val&&SCAN&&!SCAN.stop){ const m=MODE_SCAN; closeScan(); return handle(m,val); } }
    if(SCAN) SCAN.timer=setTimeout(loop,250);
  };
  loop();
}
// Photo du QR (ou simulation du scan) : lecture en data: (la CSP img-src n'autorise pas blob:).
function readDataUrl(file){ return new Promise((ok,ko)=>{ if(file.size>8*1024*1024) return ko(new Error(t("tooBig"))); const r=new FileReader(); r.onload=()=>ok(String(r.result)); r.onerror=()=>ko(new Error(t("badImg"))); r.readAsDataURL(file); }); }
function loadImg(url){ return new Promise((ok,ko)=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=()=>ko(new Error(t("badImg"))); i.src=url; }); }
async function scanFile(input){
  const f=input.files&&input.files[0]; if(!f) return; const msg=$("bScanMsg"); msg.textContent=t("reading");
  try{ const img=await loadImg(await readDataUrl(f)); const val=await decode(img,img.naturalWidth,img.naturalHeight);
    if(!val){ msg.textContent=t("notQr"); return; } const m=MODE_SCAN; closeScan(); await handle(m,val); }
  catch(e){ msg.textContent=e.message||t("badImg"); }
}
async function scanManual(){ const v=($("bScanCode")||{}).value||""; if(!v.trim()) return; const m=MODE_SCAN; closeScan(); await handle(m,v); }

/* ---------- Images : photo carrée ≤ 40 Ko, signature et sceau ≤ 48 Ko ---------- */
function jpeg(img,{square,max,limit}){
  const w0=img.naturalWidth, h0=img.naturalHeight; let sx=0, sy=0, sw=w0, sh=h0;
  if(square){ const s=Math.min(w0,h0); sx=(w0-s)/2; sy=(h0-s)/2; sw=sh=s; }
  for(const size of [max,Math.round(max*0.8),Math.round(max*0.64)]){
    const k=Math.min(1,size/Math.max(sw,sh)); const w=Math.max(16,Math.round(sw*k)), h=Math.max(16,Math.round(sh*k));
    const c=document.createElement("canvas"); c.width=w; c.height=h; const g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,w,h); g.drawImage(img,sx,sy,sw,sh,0,0,w,h);
    for(const q of [0.85,0.75,0.62,0.5,0.4]){ const b64=c.toDataURL("image/jpeg",q).split(",")[1]; if(b64.length*3/4<=limit) return b64; }
  }
  throw new Error(t("tooBig"));
}
async function pickPhoto(input){
  const f=input.files&&input.files[0]; if(!f||!FICHE) return; const msg=$("bPhMsg");
  try{
    const img=await loadImg(await readDataUrl(f)); const photo=jpeg(img,{square:true,max:240,limit:40*1024});
    const r=await post(`/api/students/${FICHE.id}/photo`,{photo},"PUT"); if(!r||r.status!==200){ msg.textContent=!r?t("net"):t("err")+((r.body&&r.body.error)||r.status); return; }
    toast(t("photoSaved")); openCard(FICHE.id);
  }catch(e){ msg.textContent=e.message; }
}

/* ---------- Badges ---------- */
async function badgesView(){
  if(!has("direction","secretariat")){ EL.innerHTML=`<div class="badbox">${esc(t("noAccess"))}</div>`; return; }
  if(!YEARS){ const r=await get("/api/annees"); YEARS=r&&r.status===200?r.body:[]; }
  if(!CLASSES){ const r=await get("/api/classes"); CLASSES=r&&r.status===200?r.body:[]; }
  const cur=(YEARS.find(y=>y.current)||YEARS[YEARS.length-1]||{}).id;
  EL.innerHTML=`<h2 class="u6">${esc(t("badgesT"))}</h2><p class="small mut">${esc(t("badgesHelp"))}</p>
  <div class="card b2-bar"><label class="fld">${esc(t("year"))}<select id="bYear" data-action-change="NORIA_BAD.listBadges">${YEARS.map(y=>`<option value="${y.id}"${y.id===cur?" selected":""}>${esc(y.label)} · ${esc(t("expires"))} ${esc(y.ends_on)}</option>`).join("")}</select></label>
    <label class="fld">${esc(t("cls"))}<select id="bCls" data-action-change="NORIA_BAD.listBadges"><option value="">${esc(t("allCls"))}</option>${CLASSES.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
    <div class="row"><button type="button" id="bGen" data-action="NORIA_BAD.generate">${esc(t("gen"))}</button>
    <button type="button" class="ghost" data-action="NORIA_BAD.sheet" data-a0="n:10">${esc(t("sheet")(10))}</button><button type="button" class="ghost" data-action="NORIA_BAD.sheet" data-a0="n:8">${esc(t("sheet")(8))}</button></div></div>
  <div id="bList"><p class="mut">${esc(t("wait"))}</p></div>`;
  listBadges();
}
async function listBadges(){
  const y=($("bYear")||{}).value, c=($("bCls")||{}).value;
  const r=await get(`/api/badges?school_year_id=${encodeURIComponent(y||"")}${c?"&class_id="+encodeURIComponent(c):""}`.replace("school_year_id=&",""));
  const box=$("bList"); if(!box) return;
  if(!r||r.status!==200){ box.innerHTML=`<div class="badbox">${esc(t("net"))}</div>`; return; }
  if(!r.body.length){ box.innerHTML=`<p class="mut">${esc(t("noBadge"))}</p>`; return; }
  box.innerHTML=`<div class="card b2-wrap"><table class="b2-tab"><thead><tr><th>${esc(t("name"))}</th><th>${esc(t("code"))}</th><th>${esc(t("cls"))}</th><th>${esc(t("year"))}</th><th>${esc(t("status"))}</th><th>${esc(t("actions"))}</th></tr></thead><tbody>
  ${r.body.map(b=>`<tr><td class="b2-tn">${esc(b.first_name)} ${esc(b.last_name)}${b.has_photo?"":` <small class="mut">(${esc(t("noPhoto"))})</small>`}</td><td data-l="${esc(t("code"))}">${esc(b.code)}</td><td data-l="${esc(t("cls"))}">${esc(b.class_name||"-")}</td><td data-l="${esc(t("year"))}">${esc(b.year)}</td>
    <td data-l="${esc(t("status"))}">${chip(b.status,t("st")[b.status])}${b.revoked_reason?`<br><small>${esc(b.revoked_reason)}</small>`:""}</td>
    <td class="b2-ta">${b.status==="valide"?`<div class="row"><button type="button" class="ghost" data-action="NORIA_BAD.badgePdf" data-a0="n:${b.id}">${esc(t("pdf"))}</button><button type="button" class="ghost" data-action="NORIA_BAD.revokeForm" data-a0="n:${b.id}">${esc(t("revoke"))}</button></div><div id="bRev${b.id}"></div>`:""}</td></tr>`).join("")}</tbody></table></div>`;
}
async function generate(){
  const y=($("bYear")||{}).value, c=($("bCls")||{}).value; const btn=$("bGen"); if(btn) btn.disabled=true;
  const r=await post("/api/badges/generer",{school_year_id:y?Number(y):undefined,class_id:c?Number(c):undefined});
  if(btn) btn.disabled=false;
  if(!r||r.status!==200) return fail(r);
  toast(t("genDone")(r.body.created,r.body.kept,r.body.expired)); listBadges();
}
function sheet(n){ const c=($("bCls")||{}).value; if(!c) return toast(t("pickCls")); download(`/api/badges/planche?class_id=${encodeURIComponent(c)}&par=${n}`); }
function badgePdf(id){ download(`/api/badges/${id}/pdf`); }
function revokeForm(id){
  const box=$("bRev"+id); if(!box) return;
  box.innerHTML=`<form class="b2-mini" data-action-submit="NORIA_BAD.revoke" data-a0="n:${id}" novalidate><p class="small mut">${esc(t("revokeHelp"))}</p><label class="fld">${esc(t("reason"))}<input id="bRevWhy${id}" maxlength="200" required></label>
    <label class="b2-check"><input type="checkbox" id="bRevNew${id}" checked> ${esc(t("reissue"))}</label><button type="submit">${esc(t("confirm"))}</button></form>`;
}
async function revoke(id){
  const why=($("bRevWhy"+id)||{}).value||"", again=!!($("bRevNew"+id)||{}).checked;
  const r=await post(`/api/badges/${id}/revoquer`,{motif:why,reediter:again}); if(!r||r.status!==200) return fail(r);
  toast(again?t("reissued"):t("revoked")); listBadges();
}

/* ---------- Relevés ---------- */
async function relevesView(){
  if(!has("direction","secretariat","parent","eleve")){ EL.innerHTML=`<div class="badbox">${esc(t("noAccess"))}</div>`; return; }
  EL.innerHTML=`<h2 class="u6">${esc(t("relT"))}</h2><p class="small mut">${esc(t("relHelp"))}</p><div id="rNotif"></div><div id="rSig"></div><div id="rAsk"></div><div id="rList"><p class="mut">${esc(t("wait"))}</p></div>`;
  notifs();
  if(has("direction")) sigPanel();
  if(has("parent","eleve")) askForm();
  listReleves();
}
async function notifs(){
  const r=await get("/api/notifications"); const box=$("rNotif"); if(!box||!r||r.status!==200) return;
  const L=lang(); const unread=r.body.filter(n=>!n.read_at).length;
  if(!r.body.length){ box.innerHTML=""; return; }
  box.innerHTML=`<div class="card b2-notif"><div class="row sp"><h3>${esc(t("notif"))}${unread?` <span class="b2-count">${unread}</span>`:""}</h3>${unread?`<button type="button" class="ghost" data-action="NORIA_BAD.markRead">${esc(t("markRead"))}</button>`:""}</div>
    <ul class="b2-loans">${r.body.slice(0,8).map(n=>`<li class="${n.read_at?"":"b2-unread"}">${esc(L==="ht"?n.title_ht:n.title_fr)} <small class="mut">${esc(String(n.created_at).slice(0,16))}</small></li>`).join("")}</ul></div>`;
}
async function markRead(){ await post("/api/notifications/lues"); notifs(); }
async function sigPanel(){
  const r=await get("/api/ecole/signature"); const box=$("rSig"); if(!box||!r||r.status!==200) return;
  const s=r.body;
  box.innerHTML=`<div class="card"><h3>${esc(t("sigT"))}</h3><p class="small mut">${esc(t("sigHelp"))}</p>
    <p>${s.signature?chip("valide",t("sigOk"))+` <small>${esc(s.signature_name||"")} · ${esc(String(s.signature_at||"").slice(0,10))}</small>`:chip("revoque",t("sigNo"))} ${s.seal?chip("valide",t("sealOk")):chip("expire",t("sealNo"))}</p>
    ${s.key_id?`<p class="small mut">${esc(t("key"))} : <code>${esc(s.key_id)}</code></p>`:""}
    <div class="b2-sig">${s.signature?`<img id="rSigImg" class="b2-sigimg" src="/api/ecole/signature/image?v=${encodeURIComponent(s.signature_at||"")}" alt="${esc(t("sigFile"))}">`:""}${s.seal?`<img class="b2-sigimg" src="/api/ecole/sceau/image?v=${Date.now()}" alt="${esc(t("sealFile"))}">`:""}</div>
    <form id="rSigForm" class="b2-grid2" data-action-submit="NORIA_BAD.saveSig" novalidate><label class="fld">${esc(t("sigName"))}<input id="rSigName" maxlength="120" value="${esc(s.signature_name||"")}"></label>
      <label class="fld">${esc(t("sigFile"))}<input type="file" id="rSigFile" accept="image/jpeg,image/png,image/webp"></label>
      <label class="fld">${esc(t("sealFile"))}<input type="file" id="rSealFile" accept="image/jpeg,image/png,image/webp"></label><button type="submit">${esc(t("save"))}</button></form><p id="rSigMsg" class="small" role="status"></p></div>`;
}
async function saveSig(){
  const msg=$("rSigMsg"); const fs=$("rSigFile").files[0], fl=$("rSealFile").files[0], name=$("rSigName").value;
  try{
    if(fs){ const img=await loadImg(await readDataUrl(fs)); const r=await post("/api/ecole/signature",{image:jpeg(img,{max:600,limit:48*1024}),name},"PUT"); if(!r||r.status!==200){ msg.textContent=!r?t("net"):t("err")+((r.body&&r.body.error)||r.status); return; } }
    if(fl){ const img=await loadImg(await readDataUrl(fl)); const r=await post("/api/ecole/sceau",{image:jpeg(img,{max:400,limit:48*1024})},"PUT"); if(!r||r.status!==200){ msg.textContent=!r?t("net"):t("err")+((r.body&&r.body.error)||r.status); return; } }
    toast(t("saved")); sigPanel();
  }catch(e){ msg.textContent=e.message; }
}
async function askForm(){
  const [st,tm,yr]=await Promise.all([get("/api/students"),TERMS?null:get("/api/terms"),YEARS?null:get("/api/annees")]);
  if(tm&&tm.status===200) TERMS=tm.body; if(yr&&yr.status===200) YEARS=yr.body;
  const kids=st&&st.status===200?st.body:[]; const box=$("rAsk"); if(!box) return;
  box.innerHTML=`<form id="rForm" class="card b2-grid2" data-action-submit="NORIA_BAD.ask" novalidate><h3 class="b2-full">${esc(t("ask"))}</h3>
    <label class="fld">${esc(t("student"))}<select id="rStu">${kids.map(k=>`<option value="${k.id}">${esc(k.first_name)} ${esc(k.last_name)} (${esc(k.code)})</option>`).join("")}</select></label>
    <label class="fld">${esc(t("kind"))}<select id="rKind" data-action-change="NORIA_BAD.kind" data-a0="v"><option value="periode">${esc(t("period"))}</option><option value="annee">${esc(t("wholeYear"))}</option></select></label>
    <label class="fld" id="rTermL">${esc(t("term"))}<select id="rTerm">${(TERMS||[]).map(x=>`<option value="${x.id}">${esc(x.name)} · ${esc(x.year)}</option>`).join("")}</select></label>
    <label class="fld" id="rYearL" hidden>${esc(t("year"))}<select id="rYear">${(YEARS||[]).map(y=>`<option value="${y.id}"${y.current?" selected":""}>${esc(y.label)}</option>`).join("")}</select></label>
    <label class="fld b2-full">${esc(t("motive"))}<input id="rWhy" maxlength="300"></label><button type="submit">${esc(t("send"))}</button></form>`;
}
function kind(v){ $("rTermL").hidden=v!=="periode"; $("rYearL").hidden=v==="periode"; }
async function ask(){
  const k=$("rKind").value; const body={student_id:Number($("rStu").value),motif:$("rWhy").value};
  if(k==="periode") body.term_id=Number($("rTerm").value); else body.school_year_id=Number($("rYear").value);
  const r=await post("/api/releves",body); if(!r||r.status!==200) return fail(r);
  toast(t("sent")); $("rWhy").value=""; listReleves();
}
async function listReleves(){
  const r=await get("/api/releves"); const box=$("rList"); if(!box) return;
  if(!r||r.status!==200){ box.innerHTML=`<div class="badbox">${esc(t("net"))}</div>`; return; }
  const dir=has("direction");
  const item=x=>`<li class="b2-req" id="rq${x.id}"><div class="row sp"><span><b>${esc(x.student)}</b> <small>${esc(x.student_code)}</small><br><span class="small">${esc(x.label)}</span></span>${chip(x.status,t("rs")[x.status])}</div>
    <p class="small mut">${esc(x.created_at)} · ${esc(t("by"))} ${esc(x.requested_by)}${x.motive?` · ${esc(t("motive").replace(/ \(.*\)/,""))} : ${esc(x.motive)}`:""}${x.code?` · <code>${esc(x.code)}</code>`:""}</p>
    ${x.decision_reason?`<p class="small"><b>${esc(t("reason"))} :</b> ${esc(x.decision_reason)}</p>`:""}${x.cancel_reason&&x.status==="annule"?`<p class="small"><b>${esc(t("reason"))} :</b> ${esc(x.cancel_reason)}</p>`:""}
    <div class="row">${x.status==="emis"?`<button type="button" data-action="NORIA_BAD.relPdf" data-a0="n:${x.id}">${esc(t("dl"))}</button>`:""}
    ${dir&&x.status==="demande"?`<button type="button" data-action="NORIA_BAD.approve" data-a0="n:${x.id}">${esc(t("approve"))}</button><button type="button" class="ghost" data-action="NORIA_BAD.reasonForm" data-a0="n:${x.id}" data-a1="s:refuser">${esc(t("refuseB"))}</button>`:""}
    ${dir&&x.status==="emis"?`<button type="button" class="ghost" data-action="NORIA_BAD.reasonForm" data-a0="n:${x.id}" data-a1="s:annuler">${esc(t("cancel"))}</button>`:""}
    ${!dir&&x.status==="demande"&&x.mine?`<button type="button" class="ghost" data-action="NORIA_BAD.withdraw" data-a0="n:${x.id}">${esc(t("withdraw"))}</button>`:""}</div><div id="rf${x.id}"></div></li>`;
  const pend=r.body.filter(x=>x.status==="demande"), rest=r.body.filter(x=>x.status!=="demande");
  box.innerHTML=!r.body.length?`<p class="mut">${esc(t("noReq"))}</p>`:`${pend.length?`<div class="card"><h3>${esc(t("pending"))} (${pend.length})</h3><ul class="b2-reqs">${pend.map(item).join("")}</ul></div>`:""}
    ${rest.length?`<div class="card"><h3>${esc(t("others"))}</h3><ul class="b2-reqs">${rest.map(item).join("")}</ul></div>`:""}`;
}
function relPdf(id){ download(`/api/releves/${id}/pdf`); }
async function approve(id){
  const r=await post(`/api/releves/${id}/approuver`); if(!r||r.status!==200) return fail(r);
  toast(t("issued")); listReleves();
}
function reasonForm(id,what){
  const box=$("rf"+id); if(!box) return;
  box.innerHTML=`<form class="b2-mini" data-action-submit="NORIA_BAD.decide" data-a0="n:${id}" data-a1="s:${what}" novalidate><label class="fld">${esc(t(what==="refuser"?"refuseWhy":"cancelWhy"))}<input id="rWhy${id}" maxlength="300" required></label><button type="submit">${esc(t("confirm"))}</button></form>`;
}
async function decide(id,what){
  const r=await post(`/api/releves/${id}/${what}`,{motif:($("rWhy"+id)||{}).value||""}); if(!r||r.status!==200) return fail(r);
  listReleves();
}
async function withdraw(id){ const r=await post(`/api/releves/${id}/annuler`,{}); if(!r||r.status!==200) return fail(r); listReleves(); }

function render(m,el,ctx){
  EL=el; C=ctx||{}; MODE=m; closeScan();
  if(m==="scan") scanView(); else if(m==="badges") badgesView(); else relevesView();
}
window.NORIA_BAD=Object.freeze({render,search,openCard,manual,openScan,closeScan,scanFile,scanManual,lend,pickPhoto,listBadges,generate,sheet,badgePdf,revokeForm,revoke,
  markRead,saveSig,kind,ask,relPdf,approve,reasonForm,decide,withdraw,_handle:handle});
})();

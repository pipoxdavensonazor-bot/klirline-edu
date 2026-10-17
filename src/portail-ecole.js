/* NORIA — bloc 5, chargé à la demande : la direction propose des contenus pour le portail public (événement, article,
   témoignage, lauréat) ; chaque proposition est relue par le super-admin avant publication. École partenaire : accord
   pour apparaître sur le portail avec une vignette du logo. Images redimensionnées et compressées ici (WebP, sinon
   JPEG ; 80 Ko au plus, vignette 16 Ko). CSP stricte : data-action, classes CSS, aucun style en ligne. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const DEPS=["artibonite","centre","grand-anse","nippes","nord","nord-est","nord-ouest","ouest","sud","sud-est"];
const CATS=["examens","concours","culture","sport","science","autre"];
const T={
  fr:{title:"Portail public",help:"Proposez un événement, un article, un témoignage ou un lauréat de votre école. L'équipe NORIA relit chaque proposition avant de la publier sur le portail public.",
    tabs:{proposer:"Proposer",mes:"Mes propositions",partenaire:"École partenaire"},
    kind:"Type de contenu",kinds:{evenement:"Événement",article:"Article",temoignage:"Témoignage",laureat:"Lauréat"},
    titleFr:"Titre (français)",titleHt:"Titre (kreyòl, facultatif)",bodyFr:"Texte (français)",bodyHt:"Texte (kreyòl, facultatif)",
    cat:"Catégorie",cats:{examens:"Examens officiels",concours:"Concours",culture:"Culture",sport:"Sport",science:"Sciences",autre:"Autre"},
    date:"Date",end:"Date de fin (facultatif)",place:"Lieu",dep:"Département",none:"—",author:"Auteur (facultatif)",
    deps:{artibonite:"Artibonite",centre:"Centre","grand-anse":"Grand'Anse",nippes:"Nippes",nord:"Nord","nord-est":"Nord-Est","nord-ouest":"Nord-Ouest",ouest:"Ouest",sud:"Sud","sud-est":"Sud-Est"},
    person:"Nom du lauréat",year:"Année",exam:"Examen ou concours (ex. : 9e AF, Bac, concours d'entrée)",examType:"Type",examen:"Examen",concours:"Concours",mention:"Mention (facultatif)",
    minorQ:"Le lauréat est-il mineur (moins de 18 ans) ?",yes:"Oui",no:"Non",minorReq:"Indiquez si le lauréat est mineur.",
    consentHelp:"Lauréat mineur : sans les deux consentements, seules ses initiales seront publiées, sans photo.",
    cSchool:"L'école consent à la publication du nom et de la photo.",cParent:"Le parent ou tuteur a donné son accord écrit.",parent:"Nom du parent ou tuteur qui consent",
    image:"Image ou photo (facultatif)",imageHelp:"Redimensionnée et compressée sur cet appareil avant l'envoi (80 Ko au plus).",remove:"Retirer l'image",
    send:"Envoyer pour relecture",sent:"Proposition envoyée : elle sera publiée après relecture.",
    st:{en_attente:"En attente de relecture",publie:"Publié",refuse:"Refusé",retire:"Retiré",depublie:"Dépublié"},
    reason:"Motif",withdraw:"Retirer",withdrawn:"Proposition retirée.",empty:"Aucune proposition pour le moment.",sentOn:"Envoyé le",view:"Voir sur le portail",
    partnerT:"Apparaître sur le portail public",partnerHelp:"Votre école figure dans la liste des écoles partenaires (nom et logo seulement). Vous pouvez arrêter à tout moment.",
    partnerOn:"Notre école accepte d'apparaître sur le portail public.",logo:"Logo (vignette, facultatif)",logoHelp:"Réduit à 256 px et 16 Ko sur cet appareil.",save:"Enregistrer",saved:"Enregistré.",
    since:"Partenaire depuis le",logoOk:"Logo enregistré.",limit:n=>`Au plus ${n} propositions par heure.`,
    tooBig:"Image trop lourde, même compressée.",badImg:"Image illisible.",err:"Refusé : ",net:"Réseau nécessaire pour cette action.",wait:"Chargement…",noAccess:"Réservé à la direction de l'école."},
  ht:{title:"Pòtay piblik",help:"Pwopoze yon evènman, yon atik, yon temwayaj oswa yon laureya lekòl ou. Ekip NORIA a li chak pwopozisyon anvan li parèt sou pòtay piblik la.",
    tabs:{proposer:"Pwopoze",mes:"Pwopozisyon mwen yo",partenaire:"Lekòl patnè"},
    kind:"Kalite kontni",kinds:{evenement:"Evènman",article:"Atik",temoignage:"Temwayaj",laureat:"Laureya"},
    titleFr:"Tit (franse)",titleHt:"Tit (kreyòl, si ou vle)",bodyFr:"Tèks (franse)",bodyHt:"Tèks (kreyòl, si ou vle)",
    cat:"Kategori",cats:{examens:"Egzamen ofisyèl",concours:"Konkou",culture:"Kilti",sport:"Espò",science:"Syans",autre:"Lòt"},
    date:"Dat",end:"Dat fen (si ou vle)",place:"Kote",dep:"Depatman",none:"—",author:"Otè (si ou vle)",
    deps:{artibonite:"Latibonit",centre:"Sant","grand-anse":"Grandans",nippes:"Nip",nord:"Nò","nord-est":"Nòdès","nord-ouest":"Nòdwès",ouest:"Lwès",sud:"Sid","sud-est":"Sidès"},
    person:"Non laureya a",year:"Ane",exam:"Egzamen oswa konkou (egz. : 9yèm AF, Bak, konkou antre)",examType:"Kalite",examen:"Egzamen",concours:"Konkou",mention:"Mansyon (si ou vle)",
    minorQ:"Èske laureya a minè (mwens pase 18 an) ?",yes:"Wi",no:"Non",minorReq:"Di si laureya a minè.",
    consentHelp:"Laureya minè : si pa gen de konsantman yo, se inisyal li sèlman ki ap parèt, san foto.",
    cSchool:"Lekòl la dakò pou non an ak foto a parèt.",cParent:"Paran an oswa responsab la bay dakò li alekri.",parent:"Non paran an oswa responsab ki dakò a",
    image:"Imaj oswa foto (si ou vle)",imageHelp:"Aparèy sa a ap redimansyone l epi konprese l anvan li ale (80 Ko pi plis).",remove:"Retire imaj la",
    send:"Voye pou yo li l",sent:"Pwopozisyon an ale : l ap parèt apre yo fin li l.",
    st:{en_attente:"Ap tann lekti",publie:"Pibliye",refuse:"Refize",retire:"Retire",depublie:"Retire sou pòtay la"},
    reason:"Rezon",withdraw:"Retire",withdrawn:"Pwopozisyon an retire.",empty:"Poko gen pwopozisyon.",sentOn:"Voye",view:"Gade l sou pòtay la",
    partnerT:"Parèt sou pòtay piblik la",partnerHelp:"Lekòl ou ap parèt nan lis lekòl patnè yo (non ak logo sèlman). Ou ka sispann nenpòt ki lè.",
    partnerOn:"Lekòl nou an dakò pou l parèt sou pòtay piblik la.",logo:"Logo (ti imaj, si ou vle)",logoHelp:"Aparèy sa a ap redui l a 256 px ak 16 Ko.",save:"Anrejistre",saved:"Anrejistre.",
    since:"Patnè depi",logoOk:"Logo a anrejistre.",limit:n=>`Pa plis pase ${n} pwopozisyon pa èdtan.`,
    tooBig:"Imaj la twò lou, menm lè li konprese.",badImg:"Nou pa ka li imaj la.",err:"Refize : ",net:"Fò gen rezo pou aksyon sa a.",wait:"Ap chaje…",noAccess:"Se direksyon lekòl la sèlman ki gen aksè."},
};
const t=k=>T[lang()][k];
let EL=null, C={}, TAB="proposer", KIND="evenement", IMG=null, LOGO=null, DATA=null;
const roles=()=>(C.me&&C.me.roles)||[];
(function css(){ if(document.getElementById("portCss")) return; const l=document.createElement("link"); l.id="portCss"; l.rel="stylesheet"; l.href="src/portail-gestion.css"; document.head.appendChild(l); })();
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.json(); }catch(e){} return {status:r.status,body:b};
}
const post=(p,b,m)=>api(p,{method:m||"POST",body:JSON.stringify(b||{})}).catch(()=>null);
const get=p=>api(p).catch(()=>null);
const $=id=>document.getElementById(id);
function toast(m){ const c=$("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
const fail=r=>toast(!r?t("net"):t("err")+((r.body&&r.body.error)||r.status));
const val=id=>{ const e=$(id); return e?e.value.trim():""; };

/* ---------- Images : redimension et compression sur l'appareil ---------- */
// Lecture en data: (la CSP img-src n'autorise pas blob:). WebP si le navigateur sait l'encoder, sinon JPEG.
function readDataUrl(file){ return new Promise((ok,ko)=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=ko; r.readAsDataURL(file); }); }
function loadImg(url){ return new Promise((ok,ko)=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=()=>ko(new Error(t("badImg"))); i.src=url; }); }
function encode(img,maxSide,maxBytes){
  let side=maxSide;
  for(let pass=0;pass<4;pass++){
    const k=Math.min(1,side/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.max(16,Math.round(img.naturalWidth*k)), h=Math.max(16,Math.round(img.naturalHeight*k));
    const c=document.createElement("canvas"); c.width=w; c.height=h; const g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,w,h); g.drawImage(img,0,0,w,h);
    for(const type of ["image/webp","image/jpeg"]){
      for(const q of [0.82,0.72,0.62,0.5,0.4]){
        const url=c.toDataURL(type,q); if(!url.startsWith("data:"+type)) break; // encodeur absent : format suivant
        const b64=url.split(",")[1]; if(b64.length*3/4<=maxBytes) return {data:b64,url,w,h,bytes:Math.round(b64.length*3/4)};
      }
    }
    side=Math.round(side*0.75);
  }
  throw new Error(t("tooBig"));
}
async function shrink(file,{full=1200,thumb=360,logo=false}={}){
  const img=await loadImg(await readDataUrl(file));
  if(logo) return encode(img,256,16*1024);
  const f=encode(img,full,80*1024); return {...f,thumb:f.bytes>16*1024?encode(img,thumb,16*1024).data:null};
}

/* ---------- Gabarit ---------- */
function shell(){
  EL.innerHTML=`<h2 class="u6">${esc(t("title"))}</h2><p class="small mut">${esc(t("help"))}</p>
    <div class="pt-tabs" role="tablist">${Object.keys(T.fr.tabs).map(k=>`<button type="button" role="tab" class="${k===TAB?"on":"ghost"}" aria-selected="${k===TAB}" data-action="NORIA_PORT.tab" data-a0="s:${k}">${esc(t("tabs")[k])}</button>`).join("")}</div>
    <div id="ptBody"><p class="mut">${esc(t("wait"))}</p></div>`;
}
function tab(k){ TAB=k; render("portail",EL,C); }
const opt=(v,l,cur)=>`<option value="${esc(v)}"${String(cur||"")===String(v)?" selected":""}>${esc(l)}</option>`;
const fld=(id,label,inner)=>`<label class="fld" for="${id}">${esc(label)}${inner}</label>`;
const input=(id,label,attrs="")=>fld(id,label,`<input id="${id}" ${attrs}>`);
const area=(id,label,max)=>fld(id,label,`<textarea id="${id}" rows="5" maxlength="${max}"></textarea>`);
const depSel=()=>fld("ptDep",t("dep"),`<select id="ptDep">${opt("",t("none"))}${DEPS.map(d=>opt(d,t("deps")[d])).join("")}</select>`);

function form(){
  const k=KIND, y=new Date().getFullYear();
  let f="";
  if(k==="evenement") f=`${input("ptTitleFr",t("titleFr"),'maxlength="140" required')}${input("ptTitleHt",t("titleHt"),'maxlength="140"')}
    ${fld("ptCat",t("cat"),`<select id="ptCat">${CATS.map(c=>opt(c,t("cats")[c])).join("")}</select>`)}${input("ptDate",t("date"),'type="date" required')}${input("ptEnd",t("end"),'type="date"')}
    ${input("ptPlace",t("place"),'maxlength="120" required')}${depSel()}<div class="pt-full">${area("ptBodyFr",t("bodyFr"),4000)}</div><div class="pt-full">${area("ptBodyHt",t("bodyHt"),4000)}</div>`;
  else if(k==="article"||k==="temoignage") f=`${input("ptTitleFr",t("titleFr"),'maxlength="140" required')}${input("ptTitleHt",t("titleHt"),'maxlength="140"')}
    ${input("ptAuthor",t("author"),'maxlength="80"')}<div class="pt-full">${area("ptBodyFr",t("bodyFr"),4000)}</div><div class="pt-full">${area("ptBodyHt",t("bodyHt"),4000)}</div>`;
  else f=`${input("ptPerson",t("person"),'maxlength="80" required autocomplete="off"')}${input("ptYear",t("year"),`type="number" min="1990" max="${y+1}" value="${y}" required`)}
    ${input("ptExam",t("exam"),'maxlength="80" required')}${fld("ptExamType",t("examType"),`<select id="ptExamType">${opt("examen",t("examen"))}${opt("concours",t("concours"))}</select>`)}
    ${input("ptMention",t("mention"),'maxlength="40"')}${depSel()}
    <fieldset class="pt-full pt-minor"><legend>${esc(t("minorQ"))}</legend>
      <label class="pt-check"><input type="radio" name="ptMinor" id="ptMinorYes" value="1" data-action-change="NORIA_PORT.minor" data-a0="n:1"> ${esc(t("yes"))}</label>
      <label class="pt-check"><input type="radio" name="ptMinor" id="ptMinorNo" value="0" data-action-change="NORIA_PORT.minor" data-a0="n:0"> ${esc(t("no"))}</label>
      <div id="ptConsent" class="pt-consent" hidden><p class="small">${esc(t("consentHelp"))}</p>
        <label class="pt-check"><input type="checkbox" id="ptCSchool"> ${esc(t("cSchool"))}</label>
        <label class="pt-check"><input type="checkbox" id="ptCParent" data-action-change="NORIA_PORT.parentBox"> ${esc(t("cParent"))}</label>
        <div id="ptParentBox" hidden>${input("ptParent",t("parent"),'maxlength="80" autocomplete="off"')}</div></div></fieldset>`;
  return `<form id="ptForm" class="card pt-grid" data-action-submit="NORIA_PORT.send" novalidate>
    ${fld("ptKind",t("kind"),`<select id="ptKind" data-action-change="NORIA_PORT.kind" data-a0="v">${Object.keys(T.fr.kinds).map(x=>opt(x,t("kinds")[x],k)).join("")}</select>`)}
    ${f}
    <div class="pt-full pt-img">${fld("ptFile",t("image"),`<input id="ptFile" type="file" accept="image/*" data-action-change="NORIA_PORT.pick" data-a0="t">`)}<p class="small mut">${esc(t("imageHelp"))}</p>
      <div id="ptPrev">${IMG?prevHtml():""}</div></div>
    <p class="small mut pt-full">${esc(t("limit")((DATA&&DATA.limite_heure)||30))}</p>
    <button type="submit" id="ptSend">${esc(t("send"))}</button></form>`;
}
const prevHtml=()=>`<img class="pt-prev" src="${esc(IMG.url)}" alt="" width="${IMG.w}" height="${IMG.h}"><span class="small mut">${IMG.w}×${IMG.h} · ${Math.ceil(IMG.bytes/1024)} Ko</span> <button type="button" class="ghost" data-action="NORIA_PORT.unpick">${esc(t("remove"))}</button>`;
function kind(v){ KIND=v; IMG=null; $("ptBody").innerHTML=form(); }
function minor(v){ const b=$("ptConsent"); if(b) b.hidden=!v; }
function parentBox(){ const b=$("ptParentBox"); if(b) b.hidden=!$("ptCParent").checked; }
async function pick(el){
  const f=el.files&&el.files[0]; if(!f) return;
  try{ IMG=await shrink(f); $("ptPrev").innerHTML=prevHtml(); }catch(e){ IMG=null; el.value=""; toast(e.message); }
}
function unpick(){ IMG=null; const f=$("ptFile"); if(f) f.value=""; $("ptPrev").innerHTML=""; }
async function send(){
  const b={kind:KIND};
  if(KIND==="laureat"){
    const yes=$("ptMinorYes").checked, no=$("ptMinorNo").checked;
    if(!yes&&!no){ toast(t("minorReq")); return $("ptMinorYes").focus(); }
    Object.assign(b,{person_name:val("ptPerson"),year:Number(val("ptYear")),exam:val("ptExam"),exam_type:val("ptExamType"),mention:val("ptMention"),department:val("ptDep")||null,minor:yes});
    if(yes) Object.assign(b,{consent_school:$("ptCSchool").checked,consent_parent:$("ptCParent").checked,consent_parent_name:val("ptParent")});
  } else {
    Object.assign(b,{title_fr:val("ptTitleFr"),title_ht:val("ptTitleHt"),body_fr:val("ptBodyFr"),body_ht:val("ptBodyHt")});
    if(KIND==="evenement") Object.assign(b,{category:val("ptCat"),event_date:val("ptDate"),event_end:val("ptEnd")||null,place:val("ptPlace"),department:val("ptDep")||null});
    else b.author=val("ptAuthor");
  }
  if(IMG) b.image={data:IMG.data,thumb:IMG.thumb||undefined};
  const btn=$("ptSend"); if(btn) btn.disabled=true;
  const r=await post("/api/portail/propositions",b); if(btn) btn.disabled=false;
  if(!r||r.status!==200) return fail(r);
  toast(t("sent")); IMG=null; TAB="mes"; render("portail",EL,C);
}

/* ---------- Mes propositions ---------- */
function mine(){
  const list=(DATA&&DATA.propositions)||[];
  const name=p=>p.kind==="laureat"?`${p.person_name} · ${p.exam} ${p.year}`:(p.title_fr||p.title_ht);
  const link=p=>p.status!=="publie"?"":p.kind==="evenement"?`/evenements/${p.id}`:(p.kind==="article"||p.kind==="temoignage")?`/communaute/${p.id}`:"/laureats";
  $("ptBody").innerHTML=!list.length?`<p class="mut">${esc(t("empty"))}</p>`:`<ul class="pt-list">${list.map(p=>`<li class="card pt-item">
    <div class="row sp"><strong>${esc(name(p))}</strong><span class="pt-chip pt-${esc(p.status)}">${esc(t("st")[p.status]||p.status)}</span></div>
    <p class="small mut">${esc(t("kinds")[p.kind])} · ${esc(t("sentOn"))} ${esc(String(p.created_at||"").slice(0,10))}</p>
    ${p.moderation_reason?`<p class="small"><b>${esc(t("reason"))} :</b> ${esc(p.moderation_reason)}</p>`:""}
    <div class="row pt-acts">${p.status==="en_attente"?`<button type="button" class="ghost" data-action="NORIA_PORT.withdraw" data-a0="n:${p.id}">${esc(t("withdraw"))}</button>`:""}
    ${link(p)?`<a href="${esc(link(p))}" target="_blank" rel="noopener">${esc(t("view"))}</a>`:""}</div></li>`).join("")}</ul>`;
}
async function withdraw(id){ const r=await post(`/api/portail/propositions/${id}/retirer`); if(!r||r.status!==200) return fail(r); toast(t("withdrawn")); render("portail",EL,C); }

/* ---------- École partenaire ---------- */
function partner(){
  const p=(DATA&&DATA.partenaire)||{};
  $("ptBody").innerHTML=`<form class="card pt-grid" data-action-submit="NORIA_PORT.savePartner" novalidate><h3 class="pt-full">${esc(t("partnerT"))}</h3><p class="small mut pt-full">${esc(t("partnerHelp"))}</p>
    <label class="pt-check pt-full"><input type="checkbox" id="ptPartner"${p.actif?" checked":""}> ${esc(t("partnerOn"))}</label>
    ${p.depuis?`<p class="small mut pt-full">${esc(t("since"))} ${esc(String(p.depuis).slice(0,10))}</p>`:""}
    <div class="pt-full">${fld("ptLogo",t("logo"),`<input id="ptLogo" type="file" accept="image/*" data-action-change="NORIA_PORT.pickLogo" data-a0="t">`)}<p class="small mut">${esc(t("logoHelp"))}${p.logo?` · ${esc(t("logoOk"))}`:""}</p><div id="ptLogoPrev"></div></div>
    <button type="submit">${esc(t("save"))}</button></form>`;
}
async function pickLogo(el){
  const f=el.files&&el.files[0]; if(!f) return;
  try{ LOGO=await shrink(f,{logo:true}); $("ptLogoPrev").innerHTML=`<img class="pt-logo" src="${esc(LOGO.url)}" alt="" width="${LOGO.w}" height="${LOGO.h}"> <span class="small mut">${Math.ceil(LOGO.bytes/1024)} Ko</span>`; }
  catch(e){ LOGO=null; el.value=""; toast(e.message); }
}
async function savePartner(){
  const b={actif:$("ptPartner").checked}; if(LOGO) b.logo=LOGO.data;
  const r=await post("/api/portail/partenaire",b,"PUT"); if(!r||r.status!==200) return fail(r);
  LOGO=null; toast(t("saved")); render("portail",EL,C);
}

async function render(m,el,ctx){
  EL=el; C=ctx||{};
  if(!roles().includes("direction")){ EL.innerHTML=`<div class="badbox">${esc(t("noAccess"))}</div>`; return; }
  shell();
  if(TAB==="proposer"&&DATA){ $("ptBody").innerHTML=form(); }
  const r=await get("/api/portail/propositions"); if(!$("ptBody")) return;
  if(!r||r.status!==200){ $("ptBody").innerHTML=`<div class="badbox">${esc(r&&r.body&&r.body.error||t("net"))}</div>`; return; }
  DATA=r.body;
  if(TAB==="proposer"){ if(!$("ptForm")) $("ptBody").innerHTML=form(); } else if(TAB==="mes") mine(); else partner();
}
window.NORIA_PORT=Object.freeze({render,tab,kind,minor,parentBox,pick,unpick,send,withdraw,pickLogo,savePartner,shrink});
})();

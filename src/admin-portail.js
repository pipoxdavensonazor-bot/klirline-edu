/* NORIA — Portail public / Pòtay piblik (super-admin, bloc 5). Chargé à la demande par admin.js.
   File de modération (publier, refuser ou dépublier avec motif, mettre à la une), création directe de contenus,
   annonces et encarts sponsorisés (dates, activation, clics), écoles partenaires. Tout est journalisé côté serveur.
   CSP stricte : data-action, classes CSS, aucun style en ligne. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const DEPS=["artibonite","centre","grand-anse","nippes","nord","nord-est","nord-ouest","ouest","sud","sud-est"];
const CATS=["examens","concours","culture","sport","science","autre"];
const T={
  fr:{title:"Portail public",open:"Ouvrir le portail",tabs:{moderation:"Modération",creer:"Créer un contenu",annonces:"Annonces",partenaires:"Écoles partenaires"},
    pending:"en attente",adsOn:"annonces en cours",partners:"écoles partenaires",status:"Statut",type:"Type",all:"Tous",
    st:{en_attente:"En attente",publie:"Publié",refuse:"Refusé",retire:"Retiré par l'école",depublie:"Dépublié"},
    kinds:{evenement:"Événement",article:"Article",temoignage:"Témoignage",laureat:"Lauréat"},
    cats:{examens:"Examens officiels",concours:"Concours",culture:"Culture",sport:"Sport",science:"Sciences",autre:"Autre"},
    platform:"Plateforme NORIA",school:"École",date:"Date",place:"Lieu",dep:"Département",cat:"Catégorie",author:"Auteur",exam:"Examen / concours",year:"Année",mention:"Mention",
    minor:"Mineur",consent:"Consentements",cSchool:"école",cParent:"parent",publicName:"Nom publié",yes:"oui",no:"non",masked:"initiales seules (consentement incomplet)",
    sent:"Proposé le",reasonL:"Motif",reasonReq:"Motif (obligatoire pour refuser ou dépublier)",publish:"Publier",refuse:"Refuser",unpublish:"Dépublier",feature:"Mettre à la une",unfeature:"Retirer de la une",
    featured:"À la une",empty:"Rien dans cette file.",done:"Enregistré.",err:"Refusé : ",net:"Serveur injoignable.",
    kind:"Type de contenu",titleFr:"Titre (français)",titleHt:"Titre (kreyòl)",bodyFr:"Texte (français)",bodyHt:"Texte (kreyòl)",end:"Date de fin",person:"Nom du lauréat",schoolName:"École du lauréat",
    examType:"Type",examen:"Examen",concours:"Concours",isMinor:"Lauréat mineur",parent:"Nom du parent qui consent",draft:"Garder en attente (brouillon)",image:"Image (facultatif)",create:"Créer et publier",
    sponsored:"Encart sponsorisé",sponsor:"Annonceur",textFr:"Texte (français)",textHt:"Texte (kreyòl)",url:"Lien https (facultatif)",starts:"Début",ends:"Fin",newAd:"Nouvelle annonce",
    adSt:{cours:"En cours",avenir:"À venir",fini:"Terminée",off:"Désactivée"},clicks:"clics",clicks30:"sur 30 jours",activate:"Activer",deactivate:"Désactiver",official:"Annonce officielle",
    noAds:"Aucune annonce.",noPartners:"Aucune école partenaire.",since:"depuis le",logo:"logo",suspended:"suspendue",sp:"Sponsorisé",tz:"heure d'Haïti"},
  ht:{title:"Pòtay piblik",open:"Louvri pòtay la",tabs:{moderation:"Moderasyon",creer:"Kreye yon kontni",annonces:"Anons",partenaires:"Lekòl patnè"},
    pending:"ap tann",adsOn:"anons k ap pase",partners:"lekòl patnè",status:"Eta",type:"Kalite",all:"Tout",
    st:{en_attente:"Ap tann",publie:"Pibliye",refuse:"Refize",retire:"Lekòl la retire l",depublie:"Retire sou pòtay la"},
    kinds:{evenement:"Evènman",article:"Atik",temoignage:"Temwayaj",laureat:"Laureya"},
    cats:{examens:"Egzamen ofisyèl",concours:"Konkou",culture:"Kilti",sport:"Espò",science:"Syans",autre:"Lòt"},
    platform:"Platfòm NORIA",school:"Lekòl",date:"Dat",place:"Kote",dep:"Depatman",cat:"Kategori",author:"Otè",exam:"Egzamen / konkou",year:"Ane",mention:"Mansyon",
    minor:"Minè",consent:"Konsantman",cSchool:"lekòl",cParent:"paran",publicName:"Non ki parèt",yes:"wi",no:"non",masked:"inisyal sèlman (konsantman pa konplè)",
    sent:"Pwopoze",reasonL:"Rezon",reasonReq:"Rezon (obligatwa pou refize oswa retire)",publish:"Pibliye",refuse:"Refize",unpublish:"Retire sou pòtay la",feature:"Mete an vedèt",unfeature:"Retire an vedèt",
    featured:"An vedèt",empty:"Pa gen anyen nan lis sa a.",done:"Anrejistre.",err:"Refize : ",net:"Sèvè a pa reponn.",
    kind:"Kalite kontni",titleFr:"Tit (franse)",titleHt:"Tit (kreyòl)",bodyFr:"Tèks (franse)",bodyHt:"Tèks (kreyòl)",end:"Dat fen",person:"Non laureya a",schoolName:"Lekòl laureya a",
    examType:"Kalite",examen:"Egzamen",concours:"Konkou",isMinor:"Laureya minè",parent:"Non paran ki dakò a",draft:"Kite l ap tann (bouyon)",image:"Imaj (si ou vle)",create:"Kreye epi pibliye",
    sponsored:"Espas sponsorize",sponsor:"Moun ki peye anons lan",textFr:"Tèks (franse)",textHt:"Tèks (kreyòl)",url:"Lyen https (si ou vle)",starts:"Kòmansman",ends:"Fen",newAd:"Nouvo anons",
    adSt:{cours:"K ap pase",avenir:"K ap vini",fini:"Fini",off:"Dezaktive"},clicks:"klik",clicks30:"sou 30 jou",activate:"Aktive",deactivate:"Dezaktive",official:"Anons ofisyèl",
    noAds:"Pa gen anons.",noPartners:"Pa gen lekòl patnè.",since:"depi",logo:"logo",suspended:"sispann",sp:"Sponsorize",tz:"lè Ayiti"},
};
const t=k=>T[lang()][k];
let EL=null, TAB="moderation", ST="en_attente", KIND="", NEWKIND="evenement", IMG=null;
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.json(); }catch(e){} return {status:r.status,body:b};
}
const post=(p,b,m)=>api(p,{method:m||"POST",body:JSON.stringify(b||{})}).catch(()=>null);
const $=id=>document.getElementById(id);
const val=id=>{ const e=$(id); return e?e.value.trim():""; };
function toast(m){ const c=$("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
const res=r=>{ toast(r&&r.status===200?t("done"):t("err")+((r&&r.body&&r.body.error)||t("net"))); return r&&r.status===200; };
const chip=(c,l)=>`<span class="pt-chip pt-${esc(c)}">${esc(l)}</span>`;
const opt=(v,l,cur)=>`<option value="${esc(v)}"${String(cur||"")===String(v)?" selected":""}>${esc(l)}</option>`;
const fld=(id,label,inner)=>`<label class="fld" for="${id}">${esc(label)}${inner}</label>`;
const input=(id,label,attrs="")=>fld(id,label,`<input id="${id}" ${attrs}>`);
const area=(id,label,max)=>fld(id,label,`<textarea id="${id}" rows="4" maxlength="${max}"></textarea>`);
// Dates affichées à l'heure d'Haïti ; le serveur stocke en UTC.
const hDate=(s,time)=>{ const d=new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(s||""))?s:String(s||"").replace(" ","T")+"Z"); if(isNaN(d)) return String(s||"");
  const o={}; new Intl.DateTimeFormat("en-GB",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:"America/Port-au-Prince"}).formatToParts(d).forEach(x=>{o[x.type]=x.value;});
  return `${o.year}-${o.month}-${o.day}`+(time?` ${o.hour}:${o.minute}`:""); };
const today=()=>new Date().toLocaleDateString("en-CA",{timeZone:"America/Port-au-Prince"});
(function css(){ if(document.getElementById("portCss")) return; const l=document.createElement("link"); l.id="portCss"; l.rel="stylesheet"; l.href="src/portail-gestion.css"; document.head.appendChild(l); })();

async function render(el){
  EL=el||EL;
  const s=await api("/api/admin/portail/resume").catch(()=>null);
  const d=s&&s.status===200?s.body:{en_attente:0,annonces_en_cours:0,partenaires:0};
  EL.innerHTML=`<div class="row sp"><h2>${esc(t("title"))}</h2><a href="/" target="_blank" rel="noopener">${esc(t("open"))} ↗</a></div>
    <div class="pt-stats"><span><b>${Number(d.en_attente)}</b> ${esc(t("pending"))}</span><span><b>${Number(d.annonces_en_cours)}</b> ${esc(t("adsOn"))}</span><span><b>${Number(d.partenaires)}</b> ${esc(t("partners"))}</span></div>
    <div class="pt-tabs" role="tablist">${Object.keys(T.fr.tabs).map(k=>`<button type="button" role="tab" class="${k===TAB?"on":"ghost"}" aria-selected="${k===TAB}" data-action="NORIA_PORT_ADM.tab" data-a0="s:${k}">${esc(t("tabs")[k])}</button>`).join("")}</div>
    <div id="paBody"><p class="mut">…</p></div>`;
  if(TAB==="moderation") return moderation(); if(TAB==="creer") return createForm(); if(TAB==="annonces") return ads(); return partners();
}
function tab(k){ TAB=k; IMG=null; render(); }

/* ---------- Modération ---------- */
async function moderation(){
  const q=new URLSearchParams(); if(ST) q.set("statut",ST); if(KIND) q.set("type",KIND);
  const r=await api(`/api/admin/portail/elements?${q}`).catch(()=>null); const box=$("paBody"); if(!box) return;
  if(!r||r.status!==200){ box.innerHTML=`<div class="badbox">${esc(t("net"))}</div>`; return; }
  const filters=`<div class="pt-filters">${fld("paSt",t("status"),`<select id="paSt" data-action-change="NORIA_PORT_ADM.filter" data-a0="s:st" data-a1="v">${opt("",t("all"),ST)}${Object.keys(T.fr.st).map(k=>opt(k,t("st")[k],ST)).join("")}</select>`)}
    ${fld("paKind",t("type"),`<select id="paKind" data-action-change="NORIA_PORT_ADM.filter" data-a0="s:kind" data-a1="v">${opt("",t("all"),KIND)}${Object.keys(T.fr.kinds).map(k=>opt(k,t("kinds")[k],KIND)).join("")}</select>`)}</div>`;
  box.innerHTML=filters+(r.body.length?`<ul class="pt-list">${r.body.map(item).join("")}</ul>`:`<p class="mut">${esc(t("empty"))}</p>`);
}
function filter(k,v){ if(k==="st") ST=v; else KIND=v; moderation(); }
function item(p){
  const kv=[];
  const add=(k,v)=>{ if(v!=null&&v!=="") kv.push(`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`); };
  add(t("school"),p.school||t("platform")); if(p.school_status==="suspendue") add(t("status"),t("suspended"));
  if(p.kind==="evenement"){ add(t("cat"),t("cats")[p.category]); add(t("date"),p.event_end?`${p.event_date} → ${p.event_end}`:p.event_date); add(t("place"),p.place); }
  if(p.kind==="laureat"){ add(t("person"),p.person_name); add(t("exam"),`${p.exam} (${p.exam_type}) · ${p.year}`); add(t("mention"),p.mention); add(t("schoolName"),p.school_name);
    add(t("minor"),p.minor?t("yes"):t("no"));
    if(p.minor) add(t("consent"),`${t("cSchool")} : ${p.consent_school?t("yes"):t("no")} · ${t("cParent")} : ${p.consent_parent?`${t("yes")} (${p.consent_parent_name||""}, ${hDate(p.consent_at)})`:t("no")}`);
    add(t("publicName"),p.public_name+(p.public_name!==p.person_name?` — ${t("masked")}`:"")); }
  if(p.department) add(t("dep"),p.department);
  if(p.author) add(t("author"),p.author);
  add(t("sent"),`${hDate(p.created_at,true)} (${t("tz")})`);
  if(p.moderation_reason) add(t("reasonL"),p.moderation_reason);
  const title=p.kind==="laureat"?p.person_name:(p.title_fr||p.title_ht);
  const body=[p.body_fr,p.body_ht].filter(Boolean).join("\n\n— — —\n\n");
  const acts=[];
  if(["en_attente","depublie","refuse"].includes(p.status)) acts.push(`<button type="button" data-action="NORIA_PORT_ADM.act" data-a0="n:${p.id}" data-a1="s:publier">${esc(t("publish"))}</button>`);
  if(p.status==="en_attente") acts.push(`<button type="button" class="ghost" data-action="NORIA_PORT_ADM.act" data-a0="n:${p.id}" data-a1="s:refuser">${esc(t("refuse"))}</button>`);
  if(p.status==="publie") acts.push(`<button type="button" class="ghost" data-action="NORIA_PORT_ADM.act" data-a0="n:${p.id}" data-a1="s:depublier">${esc(t("unpublish"))}</button>`);
  acts.push(`<button type="button" class="ghost" data-action="NORIA_PORT_ADM.feature" data-a0="n:${p.id}" data-a1="n:${p.featured?0:1}">${esc(p.featured?t("unfeature"):t("feature"))}</button>`);
  return `<li class="card pt-item">${p.image_id?`<img class="pt-thumb" src="/api/admin/portail/images/${Number(p.image_id)}-v" alt="" width="96" height="72" loading="lazy">`:""}
    <div class="row sp"><strong>${esc(t("kinds")[p.kind])} · ${esc(title)}</strong><span>${p.featured?chip("on",t("featured"))+" ":""}${chip(p.status,t("st")[p.status])}</span></div>
    ${p.title_ht&&p.title_fr?`<p class="small mut" lang="ht">${esc(p.title_ht)}</p>`:""}
    <dl class="pt-kv">${kv.join("")}</dl>${body?`<div class="pt-body">${esc(body)}</div>`:""}
    <div class="pt-mod"><input id="paWhy${p.id}" maxlength="300" placeholder="${esc(t("reasonReq"))}" aria-label="${esc(t("reasonReq"))}"><div class="row pt-acts">${acts.join("")}</div></div></li>`;
}
async function act(id,op){ const r=await post(`/api/admin/portail/elements/${id}/${op}`,{reason:val("paWhy"+id)}); if(res(r)) render(); }
async function feature(id,on){ const r=await post(`/api/admin/portail/elements/${id}/une`,{featured:!!on}); if(res(r)) moderation(); }

/* ---------- Création ---------- */
const depSel=()=>fld("paDep",t("dep"),`<select id="paDep">${opt("","—")}${DEPS.map(d=>opt(d,d)).join("")}</select>`);
function createForm(){
  const k=NEWKIND, y=new Date().getFullYear(); let f="";
  if(k==="evenement") f=`${input("paTitleFr",t("titleFr"),'maxlength="140"')}${input("paTitleHt",t("titleHt"),'maxlength="140"')}${fld("paCat",t("cat"),`<select id="paCat">${CATS.map(c=>opt(c,t("cats")[c])).join("")}</select>`)}
    ${input("paDate",t("date"),'type="date"')}${input("paEnd",t("end"),'type="date"')}${input("paPlace",t("place"),'maxlength="120"')}${depSel()}<div class="pt-full">${area("paBodyFr",t("bodyFr"),4000)}</div><div class="pt-full">${area("paBodyHt",t("bodyHt"),4000)}</div>`;
  else if(k==="laureat") f=`${input("paPerson",t("person"),'maxlength="80"')}${input("paYear",t("year"),`type="number" min="1990" max="${y+1}" value="${y}"`)}${input("paExam",t("exam"),'maxlength="80"')}
    ${fld("paExamType",t("examType"),`<select id="paExamType">${opt("examen",t("examen"))}${opt("concours",t("concours"))}</select>`)}${input("paMention",t("mention"),'maxlength="40"')}${input("paSchoolName",t("schoolName"),'maxlength="120"')}${depSel()}
    <label class="pt-check pt-full"><input type="checkbox" id="paMinor"> ${esc(t("isMinor"))}</label><label class="pt-check"><input type="checkbox" id="paCSchool"> ${esc(t("consent"))} : ${esc(t("cSchool"))}</label>
    <label class="pt-check"><input type="checkbox" id="paCParent"> ${esc(t("consent"))} : ${esc(t("cParent"))}</label>${input("paParent",t("parent"),'maxlength="80"')}`;
  else f=`${input("paTitleFr",t("titleFr"),'maxlength="140"')}${input("paTitleHt",t("titleHt"),'maxlength="140"')}${input("paAuthor",t("author"),'maxlength="80"')}<div class="pt-full">${area("paBodyFr",t("bodyFr"),4000)}</div><div class="pt-full">${area("paBodyHt",t("bodyHt"),4000)}</div>`;
  $("paBody").innerHTML=`<form class="card pt-grid" data-action-submit="NORIA_PORT_ADM.create" novalidate>${fld("paNewKind",t("kind"),`<select id="paNewKind" data-action-change="NORIA_PORT_ADM.newKind" data-a0="v">${Object.keys(T.fr.kinds).map(x=>opt(x,t("kinds")[x],k)).join("")}</select>`)}
    ${f}<div class="pt-full">${fld("paFile",t("image"),`<input id="paFile" type="file" accept="image/*" data-action-change="NORIA_PORT_ADM.pick" data-a0="t">`)}<div id="paPrev"></div></div>
    <label class="pt-check pt-full"><input type="checkbox" id="paDraft"> ${esc(t("draft"))}</label><button type="submit">${esc(t("create"))}</button></form>`;
}
function newKind(v){ NEWKIND=v; IMG=null; createForm(); }
async function shrinker(){ if(!window.NORIA_PORT) await window.NORIA_ECO.load("src/portail-ecole.js"); return window.NORIA_PORT.shrink; }
async function pick(el,box="paPrev"){
  const f=el.files&&el.files[0]; if(!f) return;
  try{ IMG=await (await shrinker())(f); $(box).innerHTML=`<img class="pt-prev" src="${esc(IMG.url)}" alt="" width="${IMG.w}" height="${IMG.h}"><span class="small mut">${IMG.w}×${IMG.h} · ${Math.ceil(IMG.bytes/1024)} Ko</span>`; }
  catch(e){ IMG=null; el.value=""; toast(e.message); }
}
async function create(){
  const k=NEWKIND; const b={kind:k,brouillon:$("paDraft").checked};
  if(k==="laureat") Object.assign(b,{person_name:val("paPerson"),year:Number(val("paYear")),exam:val("paExam"),exam_type:val("paExamType"),mention:val("paMention"),school_name:val("paSchoolName"),department:val("paDep")||null,
    minor:$("paMinor").checked,consent_school:$("paCSchool").checked,consent_parent:$("paCParent").checked,consent_parent_name:val("paParent")});
  else { Object.assign(b,{title_fr:val("paTitleFr"),title_ht:val("paTitleHt"),body_fr:val("paBodyFr"),body_ht:val("paBodyHt")});
    if(k==="evenement") Object.assign(b,{category:val("paCat"),event_date:val("paDate"),event_end:val("paEnd")||null,place:val("paPlace"),department:val("paDep")||null}); else b.author=val("paAuthor"); }
  if(IMG) b.image={data:IMG.data,thumb:IMG.thumb||undefined};
  const r=await post("/api/admin/portail/elements",b); if(res(r)){ IMG=null; TAB="moderation"; ST=b.brouillon?"en_attente":"publie"; render(); }
}

/* ---------- Annonces ---------- */
async function ads(){
  const r=await api("/api/admin/portail/annonces").catch(()=>null); const box=$("paBody"); if(!box) return;
  if(!r||r.status!==200){ box.innerHTML=`<div class="badbox">${esc(t("net"))}</div>`; return; }
  const d=today();
  const state=a=>!a.active?"off":a.starts_on>d?"avenir":a.ends_on<d?"fini":"cours";
  const cls={cours:"on",avenir:"en_attente",fini:"retire",off:"off"};
  const list=r.body.length?`<ul class="pt-list">${r.body.map(a=>`<li class="card pt-item"><div class="row sp"><strong>${esc(a.title_fr||a.title_ht)}</strong><span>${a.sponsored?chip("sp",t("sp"))+" ":chip("publie",t("official"))+" "}${chip(cls[state(a)],t("adSt")[state(a)])}</span></div>
    <p class="small mut">${a.sponsor?`${esc(a.sponsor)} · `:""}${esc(a.starts_on)} → ${esc(a.ends_on)}${a.url?` · ${esc(a.url)}`:""}</p>
    <p class="small"><b>${Number(a.clics)}</b> ${esc(t("clicks"))} (${Number(a.clics_30j)} ${esc(t("clicks30"))})</p>
    <div class="row pt-acts"><button type="button" class="ghost" data-action="NORIA_PORT_ADM.toggleAd" data-a0="n:${a.id}" data-a1="s:${a.active?"desactiver":"activer"}">${esc(a.active?t("deactivate"):t("activate"))}</button></div></li>`).join("")}</ul>`:`<p class="mut">${esc(t("noAds"))}</p>`;
  box.innerHTML=`<form class="card pt-grid" data-action-submit="NORIA_PORT_ADM.createAd" novalidate><h3 class="pt-full">${esc(t("newAd"))}</h3>
    <label class="pt-check pt-full"><input type="checkbox" id="paSp" checked> ${esc(t("sponsored"))}</label>${input("paSponsor",t("sponsor"),'maxlength="80"')}
    ${input("paATitleFr",t("titleFr"),'maxlength="140"')}${input("paATitleHt",t("titleHt"),'maxlength="140"')}<div class="pt-full">${area("paATextFr",t("textFr"),600)}</div><div class="pt-full">${area("paATextHt",t("textHt"),600)}</div>
    ${input("paUrl",t("url"),'type="url" maxlength="300" placeholder="https://"')}${input("paStart",t("starts"),`type="date" value="${d}"`)}${input("paEndAd",t("ends"),'type="date"')}
    <div class="pt-full">${fld("paAFile",t("image"),`<input id="paAFile" type="file" accept="image/*" data-action-change="NORIA_PORT_ADM.pickAd" data-a0="t">`)}<div id="paAPrev"></div></div>
    <button type="submit">${esc(t("newAd"))}</button></form>${list}`;
}
const pickAd=el=>pick(el,"paAPrev");
async function createAd(){
  const b={sponsored:$("paSp").checked,sponsor:val("paSponsor"),title_fr:val("paATitleFr"),title_ht:val("paATitleHt"),text_fr:val("paATextFr"),text_ht:val("paATextHt"),url:val("paUrl"),starts_on:val("paStart"),ends_on:val("paEndAd")};
  if(IMG) b.image={data:IMG.data,thumb:IMG.thumb||undefined};
  const r=await post("/api/admin/portail/annonces",b); if(res(r)){ IMG=null; render(); }
}
async function toggleAd(id,op){ const r=await post(`/api/admin/portail/annonces/${id}/${op}`); if(res(r)) render(); }

/* ---------- Partenaires ---------- */
async function partners(){
  const r=await api("/api/admin/portail/partenaires").catch(()=>null); const box=$("paBody"); if(!box) return;
  if(!r||r.status!==200){ box.innerHTML=`<div class="badbox">${esc(t("net"))}</div>`; return; }
  box.innerHTML=r.body.length?`<ul class="pt-list">${r.body.map(s=>`<li class="card pt-item"><div class="row sp"><strong>${s.logo?`<img class="pt-logo" src="/api/admin/portail/images/${Number(s.logo)}" alt="" width="64" height="64"> `:""}${esc(s.name)}</strong>${chip(s.status==="active"?"on":"off",s.status==="active"?"active":t("suspended"))}</div>
    <p class="small mut">${esc(s.slug)} · ${esc(t("since"))} ${esc(hDate(s.portal_partner_at))}</p></li>`).join("")}</ul>`:`<p class="mut">${esc(t("noPartners"))}</p>`;
}

window.NORIA_PORT_ADM=Object.freeze({render,tab,filter,act,feature,newKind,pick,create,pickAd,createAd,toggleAd});
})();

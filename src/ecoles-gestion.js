/* NORIA — profil de l'école (direction) et import de la liste des élèves (direction, secrétariat). Chargé à la demande.
   Logo : redimensionné dans le navigateur (256 px au plus, JPEG ≤ 48 Ko) avant l'envoi ; le serveur revérifie.
   Import : .xlsx ou .csv, aperçu avec lignes en erreur surlignées et motifs, puis validation en une seule transaction. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{profile:"Profil de l'école",profileHelp:"Ces informations figurent en en-tête de tous les documents PDF (bulletins, reçus) et sur les invitations.",
    name:"Nom de l'école",initials:"Initiales (2 à 6 lettres, utilisées dans le code élève)",address:"Adresse",email:"E-mail",phone:"Téléphone",motto:"Devise",dept:"Département",commune:"Commune",deptNone:"—",
    deps:{artibonite:"Artibonite",centre:"Centre","grand-anse":"Grand'Anse",nippes:"Nippes",nord:"Nord","nord-est":"Nord-Est","nord-ouest":"Nord-Ouest",ouest:"Ouest",sud:"Sud","sud-est":"Sud-Est"},
    logo:"Logo",logoHelp:"JPEG ou PNG ; il est réduit automatiquement (256 px, 48 Ko au plus).",noLogo:"Aucun logo : les initiales sont utilisées.",removeLogo:"Retirer le logo",
    save:"Enregistrer",saved:"Profil enregistré.",err:"Refusé : ",net:"Réseau nécessaire pour cette action.",tooBig:"Image trop lourde même réduite.",badImg:"Image illisible.",
    noAccess:"Accès réservé à la direction.",preview:"Aperçu de l'en-tête",
    imp:"Import de la liste des élèves",impHelp:"Formats .xlsx ou .csv (600 Ko, 2 000 lignes au plus). Les colonnes en rouge du modèle sont obligatoires ; le code élève est créé automatiquement.",
    model:"Télécharger le modèle (.xlsx)",file:"Fichier à importer",analyse:"Aperçu",line:"Ligne",errors:"Motif",ok:"OK",
    summary:(t,v,i)=>`${t} ligne(s) : ${v} valide(s), ${i} en erreur.`,fix:"Corrigez les lignes en rouge dans le fichier, puis relancez l'aperçu. Rien n'est importé tant qu'une ligne est en erreur.",
    validate:n=>`Importer ${n} élève(s)`,done:(c,l,i)=>`${c} élève(s) importé(s). ${l} parent(s) relié(s) à un compte existant, ${i} invitation(s) envoyée(s).`,codes:"Codes élèves créés",
    cols:{last_name:"Nom",first_name:"Prénom",birth_date:"Naissance",sex:"Sexe",class:"Classe",parent_name:"Parent",parent_phone:"Téléphone",parent_email:"E-mail"},wait:"Analyse…",choose:"Choisissez un fichier."},
  ht:{profile:"Pwofil lekòl la",profileHelp:"Enfòmasyon sa yo parèt anlè tout dokiman PDF (bilten, resi) ak sou envitasyon yo.",
    name:"Non lekòl la",initials:"Inisyal (2 a 6 lèt, yo sèvi nan kòd elèv la)",address:"Adrès",email:"Imèl",phone:"Telefòn",motto:"Deviz",dept:"Depatman",commune:"Komin",deptNone:"—",
    deps:{artibonite:"Latibonit",centre:"Sant","grand-anse":"Grandans",nippes:"Nip",nord:"Nò","nord-est":"Nòdès","nord-ouest":"Nòdwès",ouest:"Lwès",sud:"Sid","sud-est":"Sidès"},
    logo:"Logo",logoHelp:"JPEG oswa PNG ; li ap redui otomatikman (256 px, 48 Ko maksimòm).",noLogo:"Pa gen logo : se inisyal yo k ap parèt.",removeLogo:"Retire logo a",
    save:"Anrejistre",saved:"Pwofil la anrejistre.",err:"Refize : ",net:"Fò gen rezo pou aksyon sa a.",tooBig:"Imaj la twò lou menm apre li redui.",badImg:"Nou pa ka li imaj la.",
    noAccess:"Se direksyon an sèlman ki gen aksè.",preview:"Apèsi antèt la",
    imp:"Enpòte lis elèv yo",impHelp:"Fòma .xlsx oswa .csv (600 Ko, 2 000 liy maksimòm). Kolòn ki an wouj nan modèl la obligatwa ; NORIA kreye kòd elèv la otomatikman.",
    model:"Telechaje modèl la (.xlsx)",file:"Fichye pou enpòte",analyse:"Apèsi",line:"Liy",errors:"Rezon",ok:"OK",
    summary:(t,v,i)=>`${t} liy : ${v} bon, ${i} gen erè.`,fix:"Korije liy ki an wouj yo nan fichye a, epi refè apèsi a. Anyen p ap enpòte toutotan gen yon liy ki gen erè.",
    validate:n=>`Enpòte ${n} elèv`,done:(c,l,i)=>`${c} elèv enpòte. ${l} paran konekte ak yon kont ki te egziste, ${i} envitasyon voye.`,codes:"Kòd elèv ki kreye",
    cols:{last_name:"Non",first_name:"Prenon",birth_date:"Dat nesans",sex:"Sèks",class:"Klas",parent_name:"Paran",parent_phone:"Telefòn",parent_email:"Imèl"},wait:"Ap analize…",choose:"Chwazi yon fichye."},
};
const t=k=>T[lang()][k];
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.clone().json(); }catch(e){} return {status:r.status,body:b,res:r};
}
function toast(m){ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
let EL=null, CTX=null, P=null, LOGO=undefined, IMP=null;

/* ---------- Profil ---------- */
async function profile(){
  const role=(CTX.me&&CTX.me.roles)||[];
  if(!role.includes("direction")){ EL.innerHTML=`<div class="badbox">${esc(t("noAccess"))}</div>`; return; }
  if(!P){ const r=await api("/api/ecole").catch(()=>null); if(!r||r.status!==200){ EL.innerHTML=`<div class="badbox">${esc(t("net"))}</div>`; return; } P=r.body; }
  const v=k=>esc(P[k]||"");
  const logo=LOGO!==undefined?(LOGO?{logo:"data:image/jpeg;base64,"+LOGO}:{}):P;
  EL.innerHTML=`<h2 class="u6">${esc(t("profile"))}</h2><p class="small mut">${esc(t("profileHelp"))}</p>
  <div class="card eco-head-prev" aria-label="${esc(t("preview"))}">${NORIA_ECO.mark({logo:logo.logo,initials:P.initials},"eco-lg")}<div><b class="eco-name">${v("name")}</b><div class="small">${v("address")}</div><div class="small">${[P.email,P.phone].filter(Boolean).map(esc).join(" · ")}</div>${P.motto?`<div class="small mut">« ${v("motto")} »</div>`:""}</div></div>
  <form id="ecoForm" class="card eco-form" data-action-submit="NORIA_ECOG.saveProfile" novalidate>
    <label class="fld">${esc(t("name"))}<input name="name" required maxlength="120" value="${v("name")}"></label>
    <label class="fld">${esc(t("initials"))}<input name="initials" maxlength="6" value="${v("initials")}" autocapitalize="characters"></label>
    <label class="fld">${esc(t("address"))}<input name="address" maxlength="240" value="${v("address")}"></label>
    <div class="eco-2"><label class="fld">${esc(t("email"))}<input name="email" type="email" maxlength="190" value="${v("email")}"></label>
    <label class="fld">${esc(t("phone"))}<input name="phone" type="tel" maxlength="40" value="${v("phone")}"></label></div>
    <label class="fld">${esc(t("motto"))}<input name="motto" maxlength="160" value="${v("motto")}"></label>
    ${MIN()?`<div class="eco-2"><label class="fld">${esc(t("dept"))}<select name="department"><option value="">${esc(t("deptNone"))}</option>${Object.entries(t("deps")).map(([k,l])=>`<option value="${k}"${P.department===k?" selected":""}>${esc(l)}</option>`).join("")}</select></label>
    <label class="fld">${esc(t("commune"))}<input name="commune" maxlength="80" value="${v("commune")}"></label></div>`:""}
    <fieldset class="eco-logo-f"><legend>${esc(t("logo"))}</legend><p class="small mut">${esc(t("logoHelp"))}</p>
      <input type="file" id="ecoLogo" accept="image/jpeg,image/png,image/webp" data-action-change="NORIA_ECOG.pickLogo" data-a0="t">
      ${logo.logo?`<button type="button" class="ghost" data-action="NORIA_ECOG.dropLogo">${esc(t("removeLogo"))}</button>`:`<p class="small">${esc(t("noLogo"))}</p>`}</fieldset>
    <p id="ecoMsg" class="small" role="status"></p><button type="submit">${esc(t("save"))}</button></form>`;
}
// Redimensionne (256 px max, fond blanc pour les PNG transparents) et compresse en JPEG jusqu'à 48 Ko.
// (lecture en data: — la CSP img-src n'autorise pas blob:)
function shrink(file){
  return readDataUrl(file).then(url=>new Promise((ok,ko)=>{
    const img=new Image();
    img.onload=()=>{
      const k=Math.min(1,256/Math.max(img.naturalWidth,img.naturalHeight)); const w=Math.max(16,Math.round(img.naturalWidth*k)), h=Math.max(16,Math.round(img.naturalHeight*k));
      const c=document.createElement("canvas"); c.width=w; c.height=h; const g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,w,h); g.drawImage(img,0,0,w,h);
      for(const q of [0.85,0.75,0.6,0.45]){ const b64=c.toDataURL("image/jpeg",q).split(",")[1]; if(b64.length*3/4<=48*1024) return ok(b64); }
      ko(new Error(t("tooBig"))); };
    img.onerror=()=>ko(new Error(t("badImg")));
    img.src=url;
  }));
}
function readDataUrl(file){ return new Promise((ok,ko)=>{ if(file.size>8*1024*1024) return ko(new Error(t("tooBig"))); const r=new FileReader(); r.onload=()=>ok(String(r.result)); r.onerror=()=>ko(new Error(t("badImg"))); r.readAsDataURL(file); }); }
// Bloc 6 : localisation (département, commune) demandée seulement quand le portail du ministère est actif.
const MIN=()=>document.documentElement.dataset.ministere==="1";
function formVals(){ const f=document.getElementById("ecoForm"); const o={}; ["name","initials","address","email","phone","motto"].concat(MIN()?["department","commune"]:[]).forEach(k=>{ o[k]=f[k].value; }); return o; }
async function pickLogo(input){
  const f=input.files&&input.files[0]; if(!f) return;
  try{ const keep=formVals(); LOGO=await shrink(f); Object.assign(P,keep); profile(); }
  catch(e){ const m=document.getElementById("ecoMsg"); if(m) m.textContent=e.message; }
}
function dropLogo(){ Object.assign(P,formVals()); LOGO=null; profile(); }
async function saveProfile(){
  const msg=document.getElementById("ecoMsg");
  if(!navigator.onLine){ msg.textContent=t("net"); return; }
  const body=formVals(); if(LOGO!==undefined) body.logo=LOGO;
  const r=await api("/api/ecole",{method:"PUT",body:JSON.stringify(body)}).catch(()=>null);
  if(!r){ msg.textContent=t("net"); return; }
  if(r.status!==200){ msg.textContent=t("err")+((r.body&&r.body.error)||r.status); return; }
  P=r.body; LOGO=undefined;
  if(CTX.me){ CTX.me.school=Object.assign({},CTX.me.school,P); }
  profile(); toast(t("saved"));
}

/* ---------- Import ---------- */
function importView(){
  const role=(CTX.me&&CTX.me.roles)||[];
  if(!role.some(r=>r==="direction"||r==="secretariat")){ EL.innerHTML=`<div class="badbox">${esc(t("noAccess"))}</div>`; return; }
  EL.innerHTML=`<h2 class="u6">${esc(t("imp"))}</h2><p class="small mut">${esc(t("impHelp"))}</p>
  <div class="card"><p><button type="button" class="ghost" data-action="NORIA_ECOG.model">${esc(t("model"))}</button></p>
  <form id="impForm" data-action-submit="NORIA_ECOG.analyse" novalidate><label class="fld">${esc(t("file"))}<input type="file" id="impFile" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"></label>
  <button type="submit">${esc(t("analyse"))}</button></form><p id="impMsg" class="small" role="status"></p></div><div id="impOut"></div>`;
  if(IMP&&IMP.preview) showPreview();
}
async function model(){
  const r=await api("/api/import/eleves/modele").catch(()=>null);
  if(!r||r.status!==200){ toast(t("net")); return; }
  const blob=await r.res.blob(); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="modele-import-eleves.xlsx"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}
function readB64(file){ return readDataUrl(file).then(u=>u.split(",")[1]||""); }
async function analyse(){
  const f=document.getElementById("impFile").files[0], msg=document.getElementById("impMsg");
  if(!f){ msg.textContent=t("choose"); return; }
  if(f.size>600*1024){ msg.textContent=t("err")+"600 Ko"; return; }
  msg.textContent=t("wait");
  const content=await readB64(f);
  const r=await api("/api/import/eleves/apercu",{method:"POST",body:JSON.stringify({filename:f.name,content})}).catch(()=>null);
  if(!r){ msg.textContent=t("net"); return; }
  if(r.status!==200){ msg.textContent=t("err")+((r.body&&r.body.error)||r.status); IMP=null; document.getElementById("impOut").innerHTML=""; return; }
  msg.textContent=""; IMP={file:{filename:f.name,content},preview:r.body}; showPreview();
}
function showPreview(){
  const p=IMP.preview, L=lang(), cols=p.columns;
  const rows=p.rows.map(r=>`<tr class="${r.errors.length?"imp-bad":"imp-ok"}"><td>${r.line}</td>${cols.map(c=>`<td class="${r.errors.some(e=>e.col===c.key)?"imp-cell-bad":""}">${esc(r.values[c.key])}</td>`).join("")}<td>${r.errors.length?r.errors.map(e=>esc(e[L])).join("<br>"):esc(t("ok"))}</td></tr>`).join("");
  document.getElementById("impOut").innerHTML=`<div class="card"><p id="impSum" class="${p.invalid?"imp-sum-bad":"imp-sum-ok"}"><b>${esc(t("summary")(p.total,p.valid,p.invalid))}</b></p>
    ${p.invalid?`<p class="small">${esc(t("fix"))}</p>`:`<button type="button" id="impGo" data-action="NORIA_ECOG.commit">${esc(t("validate")(p.valid))}</button>`}
    <div class="u7 imp-wrap"><table class="imp-tab"><tr><th>${esc(t("line"))}</th>${cols.map(c=>`<th class="${c.required?"imp-req":""}">${esc(t("cols")[c.key])}${c.required?" *":""}</th>`).join("")}<th>${esc(t("errors"))}</th></tr>${rows}</table></div></div>`;
}
async function commit(){
  const b=document.getElementById("impGo"); if(b) b.disabled=true;
  const r=await api("/api/import/eleves",{method:"POST",body:JSON.stringify({...IMP.file,lang:lang()})}).catch(()=>null);
  if(!r||r.status!==200){ toast(t("err")+((r&&r.body&&r.body.error)||t("net"))); if(b) b.disabled=false; return; }
  const x=r.body; IMP=null;
  const st=await api("/api/students").catch(()=>null); if(st&&st.status===200&&window.KL&&KL.setStudents) KL.setStudents(st.body);
  document.getElementById("impOut").innerHTML=`<div class="card"><p class="imp-sum-ok" id="impDone"><b>${esc(t("done")(x.created,x.linked,x.invited))}</b></p><h3>${esc(t("codes"))}</h3><ul class="imp-codes">${x.codes.map(c=>`<li><span class="mut">${esc(t("line"))} ${c.line}</span> <code>${esc(c.code)}</code></li>`).join("")}</ul></div>`;
}

function render(m,el,ctx){ EL=el; CTX=ctx||{}; if(m==="ecole") profile(); else importView(); }
window.NORIA_ECOG=Object.freeze({render,saveProfile,pickLogo,dropLogo,model,analyse,commit});
})();

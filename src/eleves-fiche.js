/* NORIA — Lot 2 : fiche élève en mode serveur (direction, secrétariat). Chargé à la demande par app.js.
   Créer un élève (identité, classe, responsables), le modifier (motif obligatoire), changer sa classe, gérer ses
   responsables (tuteurs). Tout est enregistré sur le serveur et journalisé ; CSP stricte (délégation data-action). */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{photo:"Photo (facultatif, pour la carte d’élève)",phFile:"Choisir une photo",phCam:"Prendre une photo",phHelp:"Recadrée en portrait et compressée sur cet appareil ; aucune donnée de localisation gardée. Privée : jamais publiée.",phSaved:"Photo enregistrée.",phReady:"Photo prête : elle sera enregistrée avec la fiche.",phBad:"Image illisible ou trop grande.",newStu:"Nouvel élève",edit:"Modifier l'élève",fn:"Prénom",ln:"Nom",sex:"Sexe",none:"—",birth:"Date de naissance",cls:"Classe",health:"Santé (allergies, traitement)",family:"Remarques famille",
    reason:"Motif de la modification (journalisé)",reasonNew:"Motif (facultatif)",reasonPh:"ex. correction de l'orthographe du nom",save:"Enregistrer",cancel:"Fermer",
    guard:"Responsables",gName:"Nom du responsable",gRel:"Lien",gPhone:"Téléphone",gEmail:"E-mail",gPickup:"Peut récupérer l'enfant",gPrimary:"Principal",add:"Ajouter ce responsable",
    noGuard:"Aucun responsable enregistré.",del:"Retirer",delReason:"Motif du retrait",make:"Rendre principal",
    rel:{mere:"Mère",pere:"Père",tuteur:"Tuteur / tutrice",grand_parent:"Grand-parent",frere_soeur:"Frère / sœur",autre:"Autre"},
    created:c=>`Élève créé : code ${c}.`,saved:"Fiche enregistrée.",moved:"Classe changée.",err:"Refusé : ",net:"Réseau nécessaire pour cette action.",
    dup:"Un élève porte déjà ce nom et cette date de naissance. Enregistrer quand même ?",confirm:"Oui, c'est un autre élève",need:"Prénom, nom et classe sont obligatoires.",
    needReason:"Indiquez le motif de la modification (3 caractères au moins).",help:"Le code élève est créé automatiquement. Le premier responsable est le contact principal.",loading:"Chargement…",archived:"Dossier archivé (élève transféré) : lecture seule."},
  ht:{photo:"Foto (si ou vle, pou kat elèv la)",phFile:"Chwazi yon foto",phCam:"Pran yon foto",phHelp:"Nou koupe l an pòtrè epi nou konprese l sou aparèy sa a ; nou pa kenbe done lokalizasyon. Prive : yo pa janm pibliye l.",phSaved:"Foto a anrejistre.",phReady:"Foto a pare : l ap anrejistre ak fich la.",phBad:"Imaj la pa ka li oswa li twò gwo.",newStu:"Nouvo elèv",edit:"Modifye elèv la",fn:"Prenon",ln:"Non",sex:"Sèks",none:"—",birth:"Dat nesans",cls:"Klas",health:"Sante (alèji, tretman)",family:"Remak sou fanmi an",
    reason:"Rezon modifikasyon an (n ap note l)",reasonNew:"Rezon (si ou vle)",reasonPh:"egz. korije òtograf non an",save:"Anrejistre",cancel:"Fèmen",
    guard:"Responsab yo",gName:"Non responsab la",gRel:"Lyen",gPhone:"Telefòn",gEmail:"Imèl",gPickup:"Ka vin chèche timoun nan",gPrimary:"Prensipal",add:"Ajoute responsab sa a",
    noGuard:"Pa gen responsab anrejistre.",del:"Retire",delReason:"Rezon ou retire l",make:"Fè l prensipal",
    rel:{mere:"Manman",pere:"Papa",tuteur:"Titè / titris",grand_parent:"Granparan",frere_soeur:"Frè / sè",autre:"Lòt"},
    created:c=>`Elèv la kreye : kòd ${c}.`,saved:"Fich la anrejistre.",moved:"Klas la chanje.",err:"Refize : ",net:"Fò gen rezo pou aksyon sa a.",
    dup:"Gen yon elèv ki deja gen non sa a ak dat nesans sa a. Anrejistre kanmenm ?",confirm:"Wi, se yon lòt elèv",need:"Prenon, non ak klas obligatwa.",
    needReason:"Ekri rezon modifikasyon an (omwen 3 karaktè).",help:"NORIA kreye kòd elèv la otomatikman. Premye responsab la se kontak prensipal la.",loading:"Ap chaje…",archived:"Dosye achive (elèv transfere) : lekti sèlman."}
};
const t=k=>T[lang()][k];
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.json(); }catch(e){} return {status:r.status,body:b};
}
const send=(m,p,b)=>api(p,{method:m,body:JSON.stringify(b||{})}).catch(()=>null);
function toast(m){ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
const box=()=>document.getElementById("stuModal");
const errOf=r=>t("err")+((r&&r.body&&r.body.error)||t("net"));
let CL=[], CUR=null, G=[];
const RELS=["mere","pere","tuteur","grand_parent","frere_soeur","autre"];
const relSel=(name,v)=>`<select name="${name}">${RELS.map(k=>`<option value="${k}"${v===k?" selected":""}>${esc(t("rel")[k])}</option>`).join("")}</select>`;

function guardRow(i){ return `<fieldset class="elv-g"><legend>${esc(t("guard"))} ${i+1}</legend><div class="grid g2">
  <label class="fld">${esc(t("gName"))}<input name="g${i}_name" maxlength="80"></label><label class="fld">${esc(t("gRel"))}${relSel(`g${i}_rel`,i?"pere":"mere")}</label>
  <label class="fld">${esc(t("gPhone"))}<input name="g${i}_phone" type="tel" maxlength="30" inputmode="tel"></label><label class="fld">${esc(t("gEmail"))}<input name="g${i}_email" type="email" maxlength="190"></label></div>
  <label class="chk"><input type="checkbox" name="g${i}_pickup" checked> ${esc(t("gPickup"))}</label></fieldset>`; }

function guardList(){
  const ro=CUR&&CUR.status==="transfere";
  return `<h4>${esc(t("guard"))}</h4>${G.length?`<ul class="elv-gl">${G.map(g=>`<li><b>${esc(g.name)}</b> <span class="mut">${esc(t("rel")[g.relation]||g.relation)}</span>${Number(g.is_primary)?` <span class="badge b-paid">${esc(t("gPrimary"))}</span>`:""}
    <br><small>${[g.phone,g.email].filter(Boolean).map(esc).join(" · ")||"—"}${Number(g.can_pickup)?` · ${esc(t("gPickup"))}`:""}</small>
    ${ro?"":`<span class="row">${Number(g.is_primary)?"":`<button type="button" class="ghost small" data-action="NORIA_ELV.primary" data-a0="n:${g.id}">${esc(t("make"))}</button>`}<button type="button" class="ghost small danger" data-action="NORIA_ELV.drop" data-a0="n:${g.id}">${esc(t("del"))}</button></span>`}</li>`).join("")}</ul>`:`<p class="small mut">${esc(t("noGuard"))}</p>`}
  ${ro?"":`<form id="elvGAdd" class="card elv-gadd" data-action-submit="NORIA_ELV.addGuard" novalidate>${guardRow(0).replace(/<legend>[^<]*<\/legend>/,"")}<button type="submit">${esc(t("add"))}</button></form>`}`;
}

function form(){
  const s=CUR||{}; const ed=!!CUR; const ro=ed&&s.status==="transfere";
  const v=k=>esc(s[k]||"");
  return `<div class="modal"><div class="sheet elv-sheet" role="dialog" aria-modal="true" aria-labelledby="elvH"><h3 id="elvH">${esc(ed?t("edit"):t("newStu"))}${ed?` <small class="mut">${esc(s.code)}</small>`:""}</h3>
  ${ro?`<div class="warnbox">${esc(t("archived"))}</div>`:`<p class="small mut">${esc(t("help"))}</p>`}
  <form id="elvForm" data-action-submit="NORIA_ELV.save" novalidate><fieldset ${ro?"disabled":""}>
  <div class="grid g2"><label class="fld">${esc(t("fn"))} *<input name="first_name" required maxlength="60" value="${v("first_name")}" autocomplete="off"></label>
  <label class="fld">${esc(t("ln"))} *<input name="last_name" required maxlength="60" value="${v("last_name")}" autocomplete="off"></label>
  <label class="fld">${esc(t("sex"))}<select name="sex"><option value="">${esc(t("none"))}</option><option${s.sex==="F"?" selected":""}>F</option><option${s.sex==="M"?" selected":""}>M</option></select></label>
  <label class="fld">${esc(t("birth"))}<input name="birth_date" type="date" value="${v("birth_date")}"></label>
  <label class="fld">${esc(t("cls"))} *<select name="class_id" required><option value="">${esc(t("none"))}</option>${CL.map(c=>`<option value="${c.serverId}"${Number(s.class_id)===c.serverId?" selected":""}>${esc(c.name)}${c.level?" — "+esc(c.level):""}</option>`).join("")}</select></label></div>
  <label class="fld">${esc(t("health"))}<textarea name="health_notes" rows="2" maxlength="500">${v("health_notes")}</textarea></label>
  <label class="fld">${esc(t("family"))}<textarea name="family_notes" rows="2" maxlength="500">${v("family_notes")}</textarea></label>
  <div class="elv-photo"><span id="elvPhPrev" class="elv-ph" aria-hidden="true">${esc(((s.first_name||"?")[0]+(s.last_name||"?")[0]).toUpperCase())}</span><div><p class="u6">${esc(t("photo"))}</p>
  <div class="row"><label class="btn ghost elv-file">${esc(t("phFile"))}<input type="file" id="elvPh" accept="image/jpeg,image/png,image/webp" data-action-change="NORIA_ELV.pickPhoto" data-a0="t"></label><label class="btn ghost elv-file">${esc(t("phCam"))}<input type="file" id="elvPhCam" accept="image/*" capture="user" data-action-change="NORIA_ELV.pickPhoto" data-a0="t"></label></div>
  <p class="small mut" id="elvPhMsg">${esc(t("phHelp"))}</p></div></div>
  ${ed?"":guardRow(0)+guardRow(1)}
  <label class="fld">${esc(ed?t("reason"):t("reasonNew"))}${ed?" *":""}<input name="reason" maxlength="300" placeholder="${esc(t("reasonPh"))}"${ed?" required":""}></label>
  <div id="elvDup"></div>
  <div class="row"><button type="submit">${esc(t("save"))}</button><button type="button" class="ghost" data-action="vider" data-a0="s:#stuModal">${esc(t("cancel"))}</button></div></fieldset></form>
  ${ed?`<div id="elvG">${guardList()}</div>`:""}</div></div>`;
}
function paint(){ const b=box(); if(b) b.innerHTML=form(); if(CUR) showPhoto(CUR.id); const f=document.querySelector("#elvForm input[name=first_name]"); if(f) f.focus(); }

// Photo : portrait 3:4 (300×400 au plus), JPEG ≤ 60 Ko, compressée ici ; le serveur vérifie et retire les métadonnées.
let PH=null;
const readUrl=f=>new Promise((ok,ko)=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=ko; r.readAsDataURL(f); });
const loadImg=u=>new Promise((ok,ko)=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=()=>ko(new Error(t("phBad"))); i.src=u; });
function portrait(img){
  const w0=img.naturalWidth, h0=img.naturalHeight; let sw=w0, sh=Math.round(w0*4/3); if(sh>h0){ sh=h0; sw=Math.round(h0*3/4); }
  for(const W of [300,240,192]){ const H=W*4/3; const c=document.createElement("canvas"); c.width=W; c.height=H; const g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,W,H); g.drawImage(img,(w0-sw)/2,Math.max(0,(h0-sh)/2),sw,sh,0,0,W,H);
    for(const q of [0.82,0.72,0.6,0.5]){ const b64=c.toDataURL("image/jpeg",q).split(",")[1]; if(b64.length*3/4<=60*1024) return b64; } }
  throw new Error(t("phBad"));
}
function preview(url){ const p=document.getElementById("elvPhPrev"); if(!p) return; const i=document.createElement("img"); i.className="elv-ph"; i.id="elvPhPrev"; i.alt=t("photo"); i.width=90; i.height=120; i.src=url; p.replaceWith(i); }
async function showPhoto(id){ try{ const r=await fetch(`/api/students/${Number(id)}/photo`,{credentials:"same-origin",cache:"no-store"}); if(r.status!==200) return; preview(await readUrl(await r.blob())); }catch(e){} }
const putPhoto=id=>send("PUT",`/api/students/${Number(id)}/photo`,{photo:PH});
async function pickPhoto(input){
  const f=input&&input.files&&input.files[0]; const msg=document.getElementById("elvPhMsg"); if(!f) return;
  try{ PH=portrait(await loadImg(await readUrl(f))); }catch(e){ PH=null; if(msg) msg.textContent=e.message; return; }
  preview("data:image/jpeg;base64,"+PH);
  if(!CUR){ if(msg) msg.textContent=t("phReady"); return; }
  const r=await putPhoto(CUR.id); if(!r||r.status!==200){ if(msg) msg.textContent=errOf(r); return; } PH=null; toast(t("phSaved"));
}
async function open(serverId,classes){
  CL=(classes||[]).filter(c=>c.serverId); CUR=null; G=[]; PH=null;
  const b=box(); if(!b) return;
  if(serverId){
    b.innerHTML=`<div class="modal"><div class="sheet"><p class="mut">${esc(t("loading"))}</p></div></div>`;
    const [s,g]=await Promise.all([api(`/api/students/${Number(serverId)}`).catch(()=>null),api(`/api/students/${Number(serverId)}/tuteurs`).catch(()=>null)]);
    if(!s||s.status!==200){ b.innerHTML=""; toast(errOf(s)); return; }
    CUR=s.body; G=g&&g.status===200?g.body:[];
  }
  paint();
}
async function refresh(){
  const st=await api("/api/students").catch(()=>null);
  if(st&&st.status===200&&window.KL&&KL.setStudents){ KL.setStudents(st.body); if(KL.refresh) KL.refresh(); }
}
const val=(f,n)=>(f.elements[n]?String(f.elements[n].value||"").trim():"");
async function save(ev,confirmDup){
  const f=document.getElementById("elvForm"); if(!f) return;
  const o={first_name:val(f,"first_name"),last_name:val(f,"last_name"),sex:val(f,"sex")||null,birth_date:val(f,"birth_date")||null,health_notes:val(f,"health_notes"),family_notes:val(f,"family_notes")};
  const cid=Number(val(f,"class_id")); const reason=val(f,"reason");
  if(!o.first_name||!o.last_name||!cid){ toast(t("need")); return; }
  if(!CUR){
    const guardians=[0,1].map(i=>({name:val(f,`g${i}_name`),relation:val(f,`g${i}_rel`),phone:val(f,`g${i}_phone`),email:val(f,`g${i}_email`),can_pickup:!!(f.elements[`g${i}_pickup`]||{}).checked})).filter(g=>g.name);
    const r=await send("POST","/api/students",{...o,class_id:cid,reason,guardians,confirm_duplicate:!!confirmDup});
    if(r&&r.status===409&&/doublon/.test((r.body&&r.body.error)||"")){ document.getElementById("elvDup").innerHTML=`<div class="warnbox"><p>${esc(t("dup"))}</p><button type="button" data-action="NORIA_ELV.saveDup">${esc(t("confirm"))}</button></div>`; return; }
    if(!r||r.status!==200){ toast(errOf(r)); return; }
    toast(t("created")(r.body.code)); if(PH){ const p=await putPhoto(r.body.id); if(!p||p.status!==200) toast(errOf(p)); else toast(t("phSaved")); PH=null; } await refresh(); return open(r.body.id,CL.length?CL:[]);
  }
  if(reason.length<3){ toast(t("needReason")); return; }
  const {sex,...fields}=o; // le sexe n'est pas modifiable par cette route (dossier officiel)
  const r=await send("PATCH",`/api/students/${CUR.id}`,{...fields,reason});
  if(!r||r.status!==200){ toast(errOf(r)); return; }
  if(cid!==Number(CUR.class_id)){
    const m=await send("PUT",`/api/students/${CUR.id}/classe`,{class_id:cid,reason});
    if(!m||m.status!==200){ toast(errOf(m)); return; }
    toast(t("moved"));
  } else toast(t("saved"));
  await refresh(); return open(CUR.id,CL);
}
async function addGuard(){
  const f=document.getElementById("elvGAdd"); if(!f||!CUR) return;
  const b={name:val(f,"g0_name"),relation:val(f,"g0_rel"),phone:val(f,"g0_phone"),email:val(f,"g0_email"),can_pickup:!!f.elements.g0_pickup.checked};
  const r=await send("POST",`/api/students/${CUR.id}/tuteurs`,b);
  if(!r||r.status!==200){ toast(errOf(r)); return; }
  G=(await api(`/api/students/${CUR.id}/tuteurs`)).body||[]; document.getElementById("elvG").innerHTML=guardList(); toast(t("saved"));
}
async function primary(gid){
  const r=await send("PATCH",`/api/tuteurs/${Number(gid)}`,{is_primary:true});
  if(!r||r.status!==200){ toast(errOf(r)); return; }
  G=(await api(`/api/students/${CUR.id}/tuteurs`)).body||[]; document.getElementById("elvG").innerHTML=guardList();
}
async function drop(gid){
  const reason=(window.prompt(t("delReason"))||"").trim(); if(reason.length<3){ if(reason) toast(t("needReason")); return; }
  const r=await send("DELETE",`/api/tuteurs/${Number(gid)}`,{reason});
  if(!r||r.status!==200){ toast(errOf(r)); return; }
  G=(await api(`/api/students/${CUR.id}/tuteurs`)).body||[]; document.getElementById("elvG").innerHTML=guardList();
}
window.NORIA_ELV=Object.freeze({open,pickPhoto,save:ev=>{ if(ev&&ev.preventDefault) ev.preventDefault(); return save(ev,false); },saveDup:()=>save(null,true),addGuard:ev=>{ if(ev&&ev.preventDefault) ev.preventDefault(); return addGuard(); },primary,drop});
})();

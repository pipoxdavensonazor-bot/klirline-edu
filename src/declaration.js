/* NORIA — bloc 6 (prototype), chargé à la demande : déclaration annuelle de fin d'année au ministère. La direction
   relit l'aperçu (effectifs, résultats, personnel, lauréats), puis envoie un dossier figé, signé par la clé Ed25519
   de l'école, avec un PDF à son en-tête. Nouvel envoi seulement si le ministère demande une correction.
   Visible seulement quand le serveur active le portail du ministère (NORIA_MINISTERE=1). CSP stricte. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const $=id=>document.getElementById(id);
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{title:"Déclaration au ministère",help:"En fin d'année, envoyez au ministère de l'Éducation nationale le dossier de votre école : effectifs, résultats de fin d'année, personnel et lauréats. Le dossier est figé et signé électroniquement par l'école (Ed25519), avec un PDF à votre en-tête.",
    year:"Année scolaire",preview:"Aperçu du dossier",students:"Élèves",girls:"filles",boys:"garçons",classes:"Classes",success:"Réussite",staff:"Personnel",laureats:"Lauréats",
    cls:"Classe",admis:"Admis",redouble:"Redoublent",echec:"Échec",nodec:"Sans décision",rate:"Taux",total:"Total",
    nodecWarn:n=>`${n} élève(s) sans décision de fin d'année : complétez les décisions (module Transferts → Décisions) avant l'envoi si possible.`,
    send:"Envoyer la déclaration au ministère",resend:"Envoyer la version corrigée",confirm:"Je certifie l'exactitude de ces informations et j'envoie la déclaration signée au ministère.",
    sent:"Déclaration envoyée et signée.",status:"Statut",st:{envoyee:"Envoyée, en attente du ministère",recue:"Reçue par le ministère",correction_demandee:"Correction demandée",remplacee:"Remplacée"},
    hist:"Historique",none:"Aucune déclaration envoyée.",version:"Version",pdf:"PDF",note:"Note du ministère",
    ev:{envoi:"Envoi",accuse:"Accusé de réception du ministère",correction:"Correction demandée par le ministère",remplacement:"Remplacée par une nouvelle version"},
    roles:{direction:"Direction",secretariat:"Secrétariat",enseignant:"Enseignants",comptabilite:"Comptabilité",bibliotheque:"Bibliothèque"},
    masked:"initiales (mineur sans double accord)",noLaur:"Aucun lauréat pour cette année.",noAccess:"Réservé à la direction et au secrétariat.",net:"Réseau nécessaire pour cette action.",err:"Refusé : ",sig:"Signature Ed25519, clé"},
  ht:{title:"Deklarasyon bay ministè",help:"Nan fen ane a, voye dosye lekòl ou a bay Ministè Edikasyon Nasyonal : efektif, rezilta fen ane, pèsonèl ak laureya. Dosye a fiks epi lekòl la siyen l elektwonikman (Ed25519), ak yon PDF ki gen antèt lekòl ou.",
    year:"Ane lekòl",preview:"Apèsi dosye a",students:"Elèv",girls:"tifi",boys:"ti gason",classes:"Klas",success:"Reyisit",staff:"Pèsonèl",laureats:"Laureya",
    cls:"Klas",admis:"Pase",redouble:"Double",echec:"Echwe",nodec:"San desizyon",rate:"To",total:"Total",
    nodecWarn:n=>`${n} elèv pa gen desizyon fen ane : konplete desizyon yo (modil Transfè → Desizyon) anvan ou voye l si sa posib.`,
    send:"Voye deklarasyon an bay ministè a",resend:"Voye vèsyon ki korije a",confirm:"Mwen sètifye enfòmasyon sa yo egzat epi m ap voye deklarasyon siyen an bay ministè a.",
    sent:"Deklarasyon an voye epi li siyen.",status:"Estati",st:{envoyee:"Voye, n ap tann ministè a",recue:"Ministè a resevwa l",correction_demandee:"Yo mande korije",remplacee:"Ranplase"},
    hist:"Istwa",none:"Pa gen deklarasyon ki voye.",version:"Vèsyon",pdf:"PDF",note:"Nòt ministè a",
    ev:{envoi:"Voye",accuse:"Ministè a konfime resepsyon",correction:"Ministè a mande korije",remplacement:"Ranplase pa yon nouvo vèsyon"},
    roles:{direction:"Direksyon",secretariat:"Sekretarya",enseignant:"Pwofesè",comptabilite:"Kontablite",bibliotheque:"Bibliyotèk"},
    masked:"inisyal (minè san de akò)",noLaur:"Pa gen laureya pou ane sa a.",noAccess:"Se pou direksyon ak sekretarya sèlman.",net:"Fò gen rezo pou aksyon sa a.",err:"Refize : ",sig:"Siyati Ed25519, kle"}
};
const t=k=>T[lang()][k];
let EL=null, C={}, YEAR=null;
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let body=null; try{ body=await r.json(); }catch(e){}
  return {status:r.status,body};
}
function toast(m){ const c=$("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
const pct=v=>v==null?"—":(Math.round(v*1000)/10).toLocaleString("fr-FR")+" %";
const day=s=>esc(String(s||"").replace("T"," ").slice(0,16));
const BADGE={envoyee:"b-pending",recue:"b-paid",correction_demandee:"b-unpaid",remplacee:"b-excused"};
const badge=s=>`<span class="badge ${BADGE[s]||""}">${esc(t("st")[s]||s)}</span>`;
const roles=()=>(C.me&&C.me.roles)||[];

async function render(m,el,ctx){
  EL=el; C=ctx||{};
  if(!roles().includes("direction")&&!roles().includes("secretariat")){ EL.innerHTML=`<div class="badbox">${esc(t("noAccess"))}</div>`; return; }
  const r=await api("/api/declarations"+(YEAR?"?annee="+YEAR:"")).catch(()=>null);
  if(!EL.isConnected) return;
  if(!r||r.status!==200){ EL.innerHTML=`<div class="badbox">${esc((r&&r.body&&r.body.error)||t("net"))}</div>`; return; }
  const d=r.body, p=d.apercu, e=p.effectifs, s=p.resultats; YEAR=d.annee.id;
  const resend=d.active&&d.active.statut==="correction_demandee";
  EL.innerHTML=`<div class="card"><div class="row sp"><h3>${esc(t("title"))}</h3>${d.active?badge(d.active.statut):""}</div><p class="small mut">${esc(t("help"))}</p>
    <label class="small">${esc(t("year"))} <select data-action-change="NORIA_DECL.year" data-a0="v">${d.annees.map(y=>`<option value="${y.id}"${Number(y.id)===Number(d.annee.id)?" selected":""}>${esc(y.label)}</option>`).join("")}</select></label>
    ${d.active&&d.active.note_ministere?`<div class="${resend?"badbox":"warnbox"} small"><b>${esc(t("note"))}</b> : ${esc(d.active.note_ministere)}</div>`:""}</div>
   <h3>${esc(t("preview"))} · ${esc(p.annee)}</h3>
   <div class="grid g4"><div class="card"><div class="kpi">${e.total}</div><div class="kpi-sub">${esc(t("students"))} · ${e.filles} ${esc(t("girls"))} / ${e.garcons} ${esc(t("boys"))}</div></div>
    <div class="card"><div class="kpi">${e.classes.length}</div><div class="kpi-sub">${esc(t("classes"))}</div></div>
    <div class="card"><div class="kpi">${pct(s.taux_reussite)}</div><div class="kpi-sub">${esc(t("success"))}</div></div>
    <div class="card"><div class="kpi">${p.personnel.total}</div><div class="kpi-sub">${esc(t("staff"))}</div></div></div>
   ${s.sans_decision?`<div class="warnbox small">${esc(t("nodecWarn")(s.sans_decision))}</div>`:""}
   <div class="card"><table><thead><tr><th>${esc(t("cls"))}</th><th>${esc(t("students"))}</th><th>F / G</th><th>${esc(t("admis"))}</th><th>${esc(t("redouble"))}</th><th>${esc(t("echec"))}</th><th>${esc(t("nodec"))}</th><th>${esc(t("rate"))}</th></tr></thead><tbody>
    ${e.classes.map((c,i)=>{ const q=s.classes[i]||{}; return `<tr><td><b>${esc(c.classe)}</b></td><td>${c.total}</td><td>${c.filles} / ${c.garcons}</td><td>${q.admis}</td><td>${q.redouble}</td><td>${q.echec}</td><td>${q.sans_decision}</td><td>${pct(q.taux)}</td></tr>`; }).join("")}
    <tr><td><b>${esc(t("total"))}</b></td><td><b>${e.total}</b></td><td>${e.filles} / ${e.garcons}</td><td>${s.admis}</td><td>${s.redouble}</td><td>${s.echec}</td><td>${s.sans_decision}</td><td><b>${pct(s.taux_reussite)}</b></td></tr></tbody></table></div>
   <div class="grid g2"><div class="card"><h3>${esc(t("staff"))}</h3><p class="small">${Object.entries(p.personnel.par_role).map(([k,n])=>`${esc(t("roles")[k]||k)} : <b>${n}</b>`).join(" · ")}</p>
     <p class="small mut">${p.personnel.liste.map(x=>esc(x.nom)).join(", ")}</p></div>
    <div class="card"><h3>${esc(t("laureats"))}</h3>${p.laureats.length?p.laureats.map(l=>`<div class="small"><b>${esc(l.nom)}</b> · ${esc(l.examen)} ${esc(l.annee)}${l.mention?" · "+esc(l.mention):""}${l.masque?` <span class="mut">(${esc(t("masked"))})</span>`:""}</div>`).join(""):`<p class="small mut">${esc(t("noLaur"))}</p>`}</div></div>
   ${d.peut_envoyer?`<form class="card" data-action-submit="NORIA_DECL.send" data-a0="n:${d.annee.id}"><label class="row small"><input type="checkbox" id="declOk" required> ${esc(t("confirm"))}</label>
     <p><button type="submit">${esc(resend?t("resend"):t("send"))}</button></p></form>`:d.raison?`<p class="small mut">${esc(d.raison)}</p>`:""}
   <div class="card"><h3>${esc(t("hist"))}</h3>${d.historique.length?`<table><tbody>${d.historique.map(h=>`<tr><td>${esc(h.annee)} · ${esc(t("version"))} ${h.version}<br><small class="mut">${esc(t("sig"))} ${esc(h.cle)}</small></td><td>${badge(h.statut)}</td>
     <td class="small">${h.evenements.map(v=>`<div>${day(v.created_at)} · ${esc(t("ev")[v.kind]||v.kind)}${v.note?` : <i>${esc(v.note)}</i>`:""}</div>`).join("")}</td><td><a href="/api/declarations/${h.id}/pdf" download>${esc(t("pdf"))}</a></td></tr>`).join("")}</tbody></table>`:`<p class="small mut">${esc(t("none"))}</p>`}</div>`;
}
function year(v){ YEAR=Number(v)||null; render("declaration",EL,C); }
async function send(yearId){
  if(!$("declOk")||!$("declOk").checked) return;
  const r=await api("/api/declarations",{method:"POST",body:JSON.stringify({school_year_id:yearId,confirmer:true})}).catch(()=>null);
  toast(r&&r.status===200?t("sent"):t("err")+((r&&r.body&&r.body.error)||t("net")));
  render("declaration",EL,C);
}
window.NORIA_DECL=Object.freeze({render,year,send});
})();

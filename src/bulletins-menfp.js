/* Bulletins au format haïtien (MENFP) : tableau de classe (moyennes, rang, mention, décision), PDF imprimable,
   règles propres à l'école (direction) et appréciations du préscolaire. Chargé à la demande par l'onglet « Bulletins ». */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>(window.S&&S.lang==="ht")?"ht":"fr";
const I={
  fr:{cls:"Classe",per:"Période",annual:"Bilan annuel",show:"Afficher",pdf:"Imprimer les bulletins (PDF)",pdfOne:"PDF",rules:"Règles du bulletin",
    rulesHelp:"Valeurs par défaut de type MENFP. Les seuils marqués « à confirmer » varient selon les écoles : adaptez-les à votre règlement.",
    echelle:"Échelle (sur)",pass:"Moyenne de passage",cond:"Seuil « admis sous condition »",auto:"Promotion automatique (niveaux, un par ligne)",
    ment:"Mentions (seuil = libellé, une par ligne)",rank:"Afficher le rang",sign:"Signatures (une par ligne)",save:"Enregistrer les règles",reset:"Revenir aux valeurs par défaut",
    student:"Élève",avg:"Moyenne",rk:"Rang",mention:"Mention",dec:"Décision",pts:"Points",stats:"Statistiques de la classe",effectif:"Effectif",classes:"Classés",
    mcl:"Moyenne de la classe",hi:"Plus forte",lo:"Plus faible",admis:"Admis",uncertain:"à confirmer",saved:"Enregistré.",err:"Erreur : ",none:"Aucune classe.",
    pres:"Préscolaire : appréciations (pas de note chiffrée).",domain:"Domaine",level:"Appréciation",comment:"Commentaire",saveAp:"Enregistrer",exa:"ex aequo"},
  ht:{cls:"Klas",per:"Peryòd",annual:"Bilan ane a",show:"Afiche",pdf:"Enprime bilten yo (PDF)",pdfOne:"PDF",rules:"Règ bilten an",
    rulesHelp:"Valè pa defo tankou MENFP. Sèy ki make « pou konfime » chanje selon lekòl : ajiste yo dapre règleman lekòl ou.",
    echelle:"Echèl (sou)",pass:"Mwayèn pou pase",cond:"Sèy « pase sou kondisyon »",auto:"Pwomosyon otomatik (nivo, youn pa liy)",
    ment:"Mansyon (sèy = non, youn pa liy)",rank:"Montre ran",sign:"Siyati (youn pa liy)",save:"Anrejistre règ yo",reset:"Remete valè pa defo",
    student:"Elèv",avg:"Mwayèn",rk:"Ran",mention:"Mansyon",dec:"Desizyon",pts:"Pwen",stats:"Estatistik klas la",effectif:"Kantite",classes:"Klase",
    mcl:"Mwayèn klas la",hi:"Pi fò",lo:"Pi fèb",admis:"Pase",uncertain:"pou konfime",saved:"Anrejistre.",err:"Erè : ",none:"Pa gen klas.",
    pres:"Prèskolè : apresyasyon (pa gen nòt).",domain:"Domèn",level:"Apresyasyon",comment:"Kòmantè",saveAp:"Anrejistre",exa:"egalite"}};
const t=k=>I[lang()][k];
const B={el:null,d:null,cls:null,term:"annuel",res:null,rules:null};
async function api(path,opts={}){ const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}}); let body=null; try{ body=await r.json(); }catch(e){} return {status:r.status,body}; }
const toast=m=>{ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),3500); };
const n=v=>v==null?"—":String(v).replace(".",",");

async function render(el,d){
  B.el=el; B.d=d;
  const list=(d.classes||[]).filter(c=>!c.archived_at&&d.year&&c.school_year_id===d.year.id);
  if(!list.length){ el.innerHTML=`<p class="mut">${esc(t("none"))}</p>`; return; }
  if(!B.cls||!list.some(c=>c.id===B.cls)) B.cls=list[0].id;
  const rr=await api("/api/bulletins/regles"); B.rules=rr.body||null;
  await loadRes(); draw();
}
async function loadRes(){ const r=await api(`/api/bulletins/classes/${B.cls}?term_id=${encodeURIComponent(B.term)}`); B.res=r.status===200?r.body:{__err:(r.body&&r.body.error)||r.status}; }
function draw(){
  const d=B.d, el=B.el; if(!el||!el.isConnected) return;
  const list=d.classes.filter(c=>!c.archived_at&&c.school_year_id===d.year.id);
  const terms=(B.res&&B.res.terms)||[];
  let h=`<form class="str-form row" data-action-submit="NORIA_BUL.pick" data-a0="t">
    <label>${esc(t("cls"))} <select name="cls">${list.map(c=>`<option value="${c.id}"${c.id===B.cls?" selected":""}>${esc(c.name)}</option>`).join("")}</select></label>
    <label>${esc(t("per"))} <select name="term"><option value="annuel">${esc(t("annual"))}</option>${terms.map(x=>`<option value="${x.id}"${String(x.id)===String(B.term)?" selected":""}>${esc(x.name)}</option>`).join("")}</select></label>
    <button type="submit">${esc(t("show"))}</button>
    <button type="button" class="soft" data-action="NORIA_BUL.pdf" data-a0="s:">${esc(t("pdf"))}</button></form>`;
  const r=B.res;
  if(r&&r.__err!==undefined) h+=`<div class="badbox">${esc(t("err"))}${esc(r.__err)}</div>`;
  else if(r&&r.mode==="appreciations") h+=vPres(r);
  else if(r) h+=vNotes(r);
  if(B.rules) h+=vRules(B.rules);
  el.innerHTML=h;
}
function vNotes(r){
  const E=r.rules.echelle;
  const subj=(r.students[0]&&r.students[0].subjects)||[];
  let h=`<h3 class="u6">${esc(r.class.name)} — ${esc(r.period.name)} <span class="small mut">(${esc(r.class.level)} · ${esc(r.class.year)} · /${E})</span></h3>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(t("student"))}</th>${subj.map(s=>`<th title="coef. ${s.coefficient}">${esc(s.name)}<br><span class="small mut">×${n(s.coefficient)}</span></th>`).join("")}
  <th>${esc(t("pts"))}</th><th>${esc(t("avg"))}</th>${r.rules.rang?`<th>${esc(t("rk"))}</th>`:""}<th>${esc(t("mention"))}</th>${r.period.id==="annuel"?`<th>${esc(t("dec"))}</th>`:""}<th></th></tr></thead><tbody>`;
  for(const s of r.students){
    h+=`<tr><td>${esc(s.name)}<br><span class="small mut">${esc(s.code||"")}</span></td>${s.subjects.map(x=>`<td>${n(x.average)}</td>`).join("")}
    <td>${s.total_points==null?"—":`${n(s.total_points)} / ${n(s.total_max)}`}</td><td><b>${n(s.average)}</b></td>
    ${r.rules.rang?`<td>${s.rank==null?"—":s.rank+(s.rank===1?"er":"e")}${s.ex_aequo?` <span class="small mut">${esc(t("exa"))}</span>`:""}</td>`:""}
    <td>${esc(s.mention||"—")}</td>${r.period.id==="annuel"?`<td><span class="badge ${s.decision&&/admis|promotion/.test(s.decision.code)?"b-paid":s.decision&&s.decision.code==="redouble"?"b-unpaid":"b-pending"}">${esc(s.decision?s.decision.label:"—")}</span></td>`:""}
    <td><button type="button" class="ghost" data-action="NORIA_BUL.pdf" data-a0="s:${s.id}">${esc(t("pdfOne"))}</button></td></tr>`;
  }
  const st=r.stats||{};
  h+=`</tbody></table></div><p class="small"><b>${esc(t("stats"))}</b> : ${esc(t("effectif"))} ${r.effectif} · ${esc(t("classes"))} ${st.classes} · ${esc(t("mcl"))} ${n(st.moyenne_classe)} · ${esc(t("hi"))} ${n(st.plus_forte)} · ${esc(t("lo"))} ${n(st.plus_faible)}${r.period.id==="annuel"?` · ${esc(t("admis"))} ${st.admis}`:""}</p>`;
  return h;
}
function vPres(r){
  const R=r.rules, doms=R.domaines_prescolaire, lv=R.appreciations;
  let h=`<h3 class="u6">${esc(r.class.name)} — ${esc(r.period.name)}</h3><p class="small mut">${esc(t("pres"))}</p>`;
  const term=r.period.id==="annuel"?null:r.period.id;
  for(const s of r.students){
    const cur=Object.fromEntries((s.appreciations||[]).filter(a=>!term||a.term_id===term).map(a=>[a.domain,a]));
    h+=`<form class="card str-form" data-action-submit="NORIA_BUL.saveAp" data-a0="t"><input type="hidden" name="sid" value="${s.id}"><h4>${esc(s.name)} <button type="button" class="ghost" data-action="NORIA_BUL.pdf" data-a0="s:${s.id}">${esc(t("pdfOne"))}</button></h4>
    <table class="tbl"><thead><tr><th>${esc(t("domain"))}</th><th>${esc(t("level"))}</th><th>${esc(t("comment"))}</th></tr></thead><tbody>
    ${doms.map((dm,i)=>`<tr><td>${esc(dm)}<input type="hidden" name="d${i}" value="${esc(dm)}"></td><td><select name="l${i}"${term?"":" disabled"}><option value=""></option>${lv.map(x=>`<option${cur[dm]&&cur[dm].level===x?" selected":""}>${esc(x)}</option>`).join("")}</select></td>
    <td><input name="c${i}" maxlength="300" value="${esc((cur[dm]&&cur[dm].comment)||"")}"${term?"":" disabled"}></td></tr>`).join("")}</tbody></table>
    ${term?`<button type="submit">${esc(t("saveAp"))}</button>`:""}</form>`;
  }
  return h;
}
function vRules(x){
  const R=x.rules, ed=x.can_edit, dis=ed?"":" disabled";
  return `<details class="card u6"><summary><b>${esc(t("rules"))}</b></summary><p class="small mut">${esc(t("rulesHelp"))}</p>
  <form class="str-form" data-action-submit="NORIA_BUL.saveRules" data-a0="t">
  <label>${esc(t("echelle"))} <input name="echelle" type="number" min="1" max="100" value="${R.echelle}"${dis}></label>
  <label>${esc(t("pass"))} <span class="badge b-pending">${esc(t("uncertain"))}</span> <input name="pass" type="number" step="0.01" value="${R.moyenne_passage}"${dis}></label>
  <label>${esc(t("cond"))} <span class="badge b-pending">${esc(t("uncertain"))}</span> <input name="cond" type="number" step="0.01" value="${R.seuil_condition}"${dis}></label>
  <label><input name="rang" type="checkbox"${R.rang?" checked":""}${dis}> ${esc(t("rank"))}</label>
  <label>${esc(t("ment"))} <span class="badge b-pending">${esc(t("uncertain"))}</span><textarea name="ment" rows="6"${dis}>${esc(R.mentions.map(m=>`${m.min} = ${m.label}`).join("\n"))}</textarea></label>
  <label>${esc(t("auto"))}<textarea name="auto" rows="3"${dis}>${esc(R.promotion_automatique.join("\n"))}</textarea></label>
  <label>${esc(t("sign"))}<textarea name="sign" rows="3"${dis}>${esc(R.signatures.join("\n"))}</textarea></label>
  ${ed?`<div class="toolbar"><button type="submit">${esc(t("save"))}</button><button type="button" class="ghost" data-action="NORIA_BUL.resetRules" data-a0="s:">${esc(t("reset"))}</button></div>`:""}</form></details>`;
}
async function pick(f){ B.cls=Number(f.cls.value); B.term=f.term.value; await loadRes(); draw(); }
async function pdf(sid){
  const q=`term_id=${encodeURIComponent(B.term)}${sid?`&student_id=${encodeURIComponent(sid)}`:""}`;
  const r=await fetch(`/api/bulletins/classes/${B.cls}/pdf?${q}`,{credentials:"same-origin",headers:{"x-noria":"1"}});
  if(!r.ok){ let e=r.status; try{ e=(await r.json()).error||e; }catch(x){} toast(t("err")+e); return; }
  const url=URL.createObjectURL(await r.blob()); const a=document.createElement("a"); a.href=url; a.download=`bulletins-${B.cls}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function put(body){ const r=await api("/api/bulletins/regles",{method:"PUT",body:JSON.stringify(body)}); if(r.status!==200){ toast(t("err")+((r.body&&r.body.error)||r.status)); return; } toast(t("saved")); B.rules.rules=r.body.rules; await loadRes(); draw(); }
function saveRules(f){
  const lines=v=>v.split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const mentions=lines(f.ment.value).map(l=>{ const m=l.match(/^([\d.,]+)\s*=\s*(.+)$/); return m?{min:Number(m[1].replace(",",".")),label:m[2].trim()}:null; }).filter(Boolean);
  return put({rules:{...B.rules.rules,echelle:Number(f.echelle.value),moyenne_passage:Number(f.pass.value),seuil_condition:Number(f.cond.value),rang:f.rang.checked,mentions,promotion_automatique:lines(f.auto.value),signatures:lines(f.sign.value)}});
}
function resetRules(){ return put({reset:true}); }
async function saveAp(f){
  const items=[]; for(let i=0;f["d"+i];i++){ const lv=f["l"+i].value; if(lv) items.push({domain:f["d"+i].value,level:lv,comment:f["c"+i].value}); }
  const r=await api("/api/bulletins/appreciations",{method:"POST",body:JSON.stringify({student_id:Number(f.sid.value),term_id:Number(B.term),items})});
  if(r.status!==200){ toast(t("err")+((r.body&&r.body.error)||r.status)); return; } toast(t("saved")); await loadRes(); draw();
}
window.NORIA_BUL={render,pick,pdf,saveRules,resetRules,saveAp};
})();

/* NORIA — Assistant sécurité / Asistan sekirite (super-admin, bloc 3). Chargé à la demande par admin.js.
   L'assistant détecte, explique et propose ; il n'agit jamais seul : chaque action est préparée, puis confirmée ici
   (nouveau code à 6 chiffres pour les actions critiques) et inscrite au journal. CSP stricte : data-action, classes CSS. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{title:"Assistant sécurité",score:"Score de santé",lastRun:"Dernière analyse",never:"pas encore lancée",run:"Analyser maintenant",running:"Analyse en cours…",
    crit:"critiques",warn:"attention",info:"info",sev:{critique:"Critique",attention:"Attention",info:"Info"},st:{ouverte:"Ouvertes",traitee:"Traitées",faux_positif:"Faux positifs"},
    allSev:"Toutes gravités",sevLabel:"Gravité",tz:"heure d'Haïti",alerts:"Alertes",history:"Historique des actions",none:"Aucune alerte pour ce filtre.",noHist:"Aucune action pour le moment.",
    detail:"Détail",back:"Retour à la liste",evidence:"Preuves",reco:"Recommandation",actions:"Actions proposées",seen:"vue",times:"fois",last:"dernière fois",
    ask:"Questions guidées",q:{pourquoi:"Pourquoi cette alerte ?",quoi:"Que faire ?",risque:"Est-ce grave ?",faux:"Est-ce un faux positif ?"},
    rule:"L'assistant ne fait rien seul : chaque action demande votre confirmation, les actions critiques un nouveau code, et tout est journalisé.",
    confirmTitle:"Confirmer l'action",critical:"Action critique : saisissez le code à 6 chiffres qui vient d'être envoyé",reason:"Motif",reasonReq:"Motif (obligatoire)",code:"Code à 6 chiffres",
    confirm:"Je confirme",cancel:"Annuler",done:"Action effectuée : ",err:"Refusé : ",net:"Serveur injoignable.",undo:"Annuler l'action",undone:"annulée",otp:"code",irr:"irréversible",
    when:"Date",what:"Action",target:"Cible",by:"Par",critTag:"critique",llmOff:"Réponses issues du guide intégré (aucun service externe)."},
  ht:{title:"Asistan sekirite",score:"Nòt sante",lastRun:"Dènye analiz",never:"poko lanse",run:"Analize kounye a",running:"Analiz ap fèt…",
    crit:"kritik",warn:"atansyon",info:"enfo",sev:{critique:"Kritik",attention:"Atansyon",info:"Enfo"},st:{ouverte:"Ouvè",traitee:"Trete",faux_positif:"Fo alèt"},
    allSev:"Tout gravite",sevLabel:"Gravite",tz:"lè Ayiti",alerts:"Alèt yo",history:"Istorik aksyon yo",none:"Pa gen alèt pou filt sa a.",noHist:"Poko gen aksyon.",
    detail:"Detay",back:"Retounen nan lis la",evidence:"Prèv",reco:"Rekòmandasyon",actions:"Aksyon pwopoze",seen:"wè",times:"fwa",last:"dènye fwa",
    ask:"Kesyon gide",q:{pourquoi:"Poukisa alèt sa a ?",quoi:"Kisa pou m fè ?",risque:"Èske li grav ?",faux:"Èske se yon fo alèt ?"},
    rule:"Asistan an pa fè anyen pou kont li : chak aksyon mande konfimasyon w, aksyon kritik yo mande yon nouvo kòd, epi tout bagay anrejistre nan jounal la.",
    confirmTitle:"Konfime aksyon an",critical:"Aksyon kritik : tape kòd 6 chif ki fèk voye a",reason:"Rezon",reasonReq:"Rezon (obligatwa)",code:"Kòd 6 chif",
    confirm:"Mwen konfime",cancel:"Anile",done:"Aksyon an fèt : ",err:"Refize : ",net:"Sèvè a pa reponn.",undo:"Anile aksyon an",undone:"anile",otp:"kòd",irr:"pa ka anile",
    when:"Dat",what:"Aksyon",target:"Sib",by:"Pa",critTag:"kritik",llmOff:"Repons yo soti nan gid entegre a (okenn sèvis deyò)."},
};
const t=k=>T[lang()][k];
let EL=null, VIEW="list", SEV="", ST="ouverte", CUR=null, PENDING=null, ANSWER=null, DATA=null;
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.json(); }catch(e){} return {status:r.status,body:b};
}
const post=(p,b)=>api(p,{method:"POST",body:JSON.stringify(b||{})});
// Dates affichées à l'heure d'Haïti (comme les preuves) ; le serveur stocke en UTC.
const dt=s=>{ const d=new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(s||""))?s:String(s||"").replace(" ","T")+"Z"); if(isNaN(d)) return esc(String(s||""));
  const o={}; new Intl.DateTimeFormat("en-GB",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:"America/Port-au-Prince"}).formatToParts(d).forEach(x=>{o[x.type]=x.value;});
  return esc(`${o.year}-${o.month}-${o.day} ${o.hour}:${o.minute}`); };
const L=o=>o?(o[lang()]||o.fr||""):"";
function toast(m){ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
const sevBadge=g=>`<span class="sec-sev sec-${esc(g)}">${esc(t("sev")[g]||g)}</span>`;

async function render(el){ EL=el||EL; if(!EL) return; await draw(); }
async function draw(){
  if(!EL) return;
  if(VIEW==="history") return drawHistory();
  if(VIEW==="detail"&&CUR) return drawDetail();
  const q=new URLSearchParams({statut:ST}); if(SEV) q.set("gravite",SEV);
  const r=await api("/api/admin/securite?"+q).catch(()=>null);
  if(!r){ EL.innerHTML=`<div class="badbox">${esc(t("net"))}</div>`; return; }
  if(r.status===401){ window.NORIA_ADM.start(); return; }
  DATA=r.body; const d=DATA;
  const cls=d.score>=80?"sec-good":d.score>=50?"sec-mid":"sec-bad";
  EL.innerHTML=`<div id="secApp" class="sec-app">${head(d,cls)}
    <div class="sec-filters"><label class="fld">${esc(t("sevLabel"))}<select id="secSev" data-action-change="NORIA_SEC.filter" data-a0="s:sev" data-a1="v:">
      <option value="">${esc(t("allSev"))}</option>${["critique","attention","info"].map(g=>`<option value="${g}"${SEV===g?" selected":""}>${esc(t("sev")[g])}</option>`).join("")}</select></label>
      <label class="fld">${esc(t("alerts"))}<select id="secSt" data-action-change="NORIA_SEC.filter" data-a0="s:st" data-a1="v:">${Object.keys(t("st")).map(s=>`<option value="${s}"${ST===s?" selected":""}>${esc(t("st")[s])}</option>`).join("")}</select></label></div>
    <div class="sec-list">${d.alertes.length?d.alertes.map(a=>`<article class="card sec-alert sec-b-${esc(a.gravite)}" data-alerte="${a.id}">
      <div class="row sp">${sevBadge(a.gravite)}<small class="mut">${esc(t("seen"))} ${Number(a.occurrences)} ${esc(t("times"))} · ${esc(t("last"))} ${dt(a.derniere)}</small></div>
      <h4>${esc(L(a.titre))}</h4><p class="small">${esc(L(a.explication))}</p>
      <button type="button" class="ghost" data-action="NORIA_SEC.open" data-a0="n:${a.id}">${esc(t("detail"))}</button></article>`).join(""):`<p class="card mut">${esc(t("none"))}</p>`}</div></div>`;
}
function head(d,cls){
  const lr=d&&d.derniere_analyse;
  return `<div class="sec-head"><div class="card sec-scorebox"><div id="secScore" class="sec-score ${cls||""}">${d?Number(d.score):"—"}</div><div class="kpi-sub">${esc(t("score"))} /100</div></div>
    <div class="card sec-counts"><span class="sec-sev sec-critique">${d?Number(d.critique):0} ${esc(t("crit"))}</span><span class="sec-sev sec-attention">${d?Number(d.attention):0} ${esc(t("warn"))}</span><span class="sec-sev sec-info">${d?Number(d.info):0} ${esc(t("info"))}</span>
      <p class="small mut">${esc(t("lastRun"))} : ${lr?dt(lr.at)+" ("+esc(t("tz"))+")":esc(t("never"))}</p></div>
    <div class="sec-tools"><button type="button" id="secRun" data-action="NORIA_SEC.run">${esc(t("run"))}</button>
      <button type="button" class="ghost${VIEW==="history"?" on":""}" data-action="NORIA_SEC.view" data-a0="s:${VIEW==="history"?"list":"history"}">${esc(VIEW==="history"?t("alerts"):t("history"))}</button></div></div>
    <p class="small sec-rule">${esc(t("rule"))}</p>`;
}
async function drawDetail(){
  const r=await api(`/api/admin/securite/alertes/${CUR}`).catch(()=>null);
  if(!r||r.status!==200){ VIEW="list"; return draw(); }
  const a=r.body;
  EL.innerHTML=`<div id="secApp" class="sec-app"><button type="button" class="ghost" data-action="NORIA_SEC.view" data-a0="s:list">← ${esc(t("back"))}</button>
    <article id="secDetail" class="card sec-alert sec-b-${esc(a.gravite)}"><div class="row sp">${sevBadge(a.gravite)}<small class="mut">n° ${a.id} · ${esc(t("st")[a.statut]||a.statut)} · ${dt(a.premiere)} → ${dt(a.derniere)}</small></div>
      <h3>${esc(L(a.titre))}</h3><p>${esc(L(a.explication))}</p>
      <h4>${esc(t("evidence"))}</h4><ul class="sec-evidence">${a.preuves.map(p=>`<li><code>${esc(p)}</code></li>`).join("")}</ul>
      <h4>${esc(t("reco"))}</h4><p>${esc(L(a.recommandation))}</p>
      ${a.statut==="ouverte"?`<h4>${esc(t("actions"))}</h4><div class="sec-actions">${a.actions.map(x=>`<button type="button" class="${x.critique?"sec-crit-btn":""}" data-action="NORIA_SEC.prepare" data-a0="j:${esc(JSON.stringify({alert_id:a.id,index:x.index}))}">${esc(L(x.libelle))}${x.critique?` · ${esc(t("critTag"))}`:""}</button>`).join("")}
        <button type="button" class="ghost" data-action="NORIA_SEC.prepare" data-a0="j:${esc(JSON.stringify({alert_id:a.id,type:"alerte.traiter"}))}">${esc(lang()==="ht"?"Make l trete":"Marquer comme traitée")}</button>
        <button type="button" class="ghost" data-action="NORIA_SEC.prepare" data-a0="j:${esc(JSON.stringify({alert_id:a.id,type:"alerte.faux_positif"}))}">${esc(lang()==="ht"?"Fo alèt":"Faux positif")}</button></div>`:""}
      <div id="secConfirm">${confirmBox()}</div></article>
    <div class="card sec-guide"><h4>${esc(t("ask"))}</h4><div class="sec-q">${Object.keys(t("q")).map(k=>`<button type="button" class="ghost" data-action="NORIA_SEC.ask" data-a0="s:${k}">${esc(t("q")[k])}</button>`).join("")}</div>
      <p id="secAnswer" class="sec-answer" aria-live="polite">${ANSWER?esc(ANSWER):""}</p><p class="small mut">${esc(t("llmOff"))}</p></div></div>`;
}
function confirmBox(){
  if(!PENDING) return "";
  const p=PENDING, sus=p.type==="ecole.suspendre";
  return `<form id="secConfirmForm" class="sec-confirm" data-action-submit="NORIA_SEC.confirm"><h4>${esc(t("confirmTitle"))} : ${esc(L(p.libelle))}</h4><p>${esc(L(p.resume))}</p>
    ${p.critique?`<p class="warnbox small">${esc(t("critical"))} (${esc(p.canal||"")}).</p><label class="fld">${esc(t("code"))}<input id="secCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></label>`:""}
    <label class="fld">${esc(sus?t("reasonReq"):t("reason"))}<input id="secReason" maxlength="300"${sus?" required minlength=\"3\"":""}></label>
    <div class="row"><button type="submit" id="secOk">${esc(t("confirm"))}</button><button type="button" class="ghost" data-action="NORIA_SEC.dismiss">${esc(t("cancel"))}</button></div></form>`;
}
async function drawHistory(){
  const r=await api("/api/admin/securite/actions").catch(()=>null);
  if(!r||r.status!==200){ EL.innerHTML=`<div class="badbox">${esc(t("net"))}</div>`; return; }
  EL.innerHTML=`<div id="secApp" class="sec-app">${head(DATA,DATA?(DATA.score>=80?"sec-good":DATA.score>=50?"sec-mid":"sec-bad"):"")}<div class="card" id="secHistory"><h3>${esc(t("history"))}</h3>
    ${r.body.length?`<table class="adm-tab"><tr><th>${esc(t("when"))}</th><th>${esc(t("what"))}</th><th>${esc(t("target"))}</th><th>${esc(t("by"))}</th><th></th></tr>${r.body.map(x=>`<tr class="${x.annulee?"sec-undone":""}"><td><small>${dt(x.date)}</small></td><td>${esc(L(x.libelle))}${x.otp?` <span class="sec-sev sec-info">${esc(t("otp"))}</span>`:""}${x.annulee?` <span class="sec-sev sec-attention">${esc(t("undone"))}</span>`:""}${x.motif?`<br><small class="mut">${esc(x.motif)}</small>`:""}</td><td><small>${esc(x.cible||"")}</small></td><td><small>${esc(x.admin||"")}</small></td>
      <td>${x.annulable?`<button type="button" class="ghost" data-action="NORIA_SEC.prepare" data-a0="j:${esc(JSON.stringify({type:"annuler",params:{action_id:x.id}}))}">${esc(t("undo"))}</button>`:(x.type==="annuler"||x.annulee?"":`<small class="mut">${esc(t("irr"))}</small>`)}</td></tr>`).join("")}</table>`:`<p class="mut">${esc(t("noHist"))}</p>`}
    <div id="secConfirm">${confirmBox()}</div></div></div>`;
}
async function run(){
  const b=document.getElementById("secRun"); if(b){ b.disabled=true; b.textContent=t("running"); }
  const r=await post("/api/admin/securite/analyser",{}).catch(()=>null);
  if(!r||r.status!==200) toast(t("err")+((r&&r.body&&r.body.error)||t("net")));
  await draw();
}
async function prepare(spec){
  const r=await post("/api/admin/securite/actions/preparer",spec).catch(()=>null);
  if(!r||r.status!==200){ toast(t("err")+((r&&r.body&&r.body.error)||t("net"))); return; }
  PENDING=r.body;
  const box=document.getElementById("secConfirm"); if(box){ box.innerHTML=confirmBox(); box.scrollIntoView({block:"nearest"}); const c=document.getElementById("secCode"); if(c) c.focus(); }
}
async function confirm(){
  if(!PENDING) return;
  const c=document.getElementById("secCode"), m=document.getElementById("secReason");
  const r=await post("/api/admin/securite/actions/confirmer",{token:PENDING.token,confirmer:true,reason:m?m.value.trim():"",...(c?{code:c.value}:{})}).catch(()=>null);
  if(!r||r.status!==200){ toast(t("err")+((r&&r.body&&r.body.error)||t("net"))); if(r&&r.status===400){ PENDING=null; const box=document.getElementById("secConfirm"); if(box) box.innerHTML=""; } return; }
  PENDING=null; toast(t("done")+r.body.resultat);
  const box=document.getElementById("secConfirm"); if(box) box.innerHTML=`<p class="okbox small" id="secDone">${esc(t("done")+r.body.resultat)}</p>`;
  if(VIEW==="history") await draw();
}
async function ask(q){
  const r=await api(`/api/admin/securite/guide?alerte=${CUR}&q=${encodeURIComponent(q)}&lang=${lang()}`).catch(()=>null);
  ANSWER=r&&r.status===200?r.body.reponse:t("net");
  const el=document.getElementById("secAnswer"); if(el) el.textContent=ANSWER;
}
(function css(){ if(document.getElementById("secCss")) return; const l=document.createElement("link"); l.id="secCss"; l.rel="stylesheet"; l.href=NORIA_U.v("src/admin-securite.css"); document.head.appendChild(l); })();
window.NORIA_SEC=Object.freeze({render,run,prepare,confirm,ask,
  open:id=>{CUR=id;VIEW="detail";PENDING=null;ANSWER=null;draw();},
  view:v=>{VIEW=v;PENDING=null;ANSWER=null;draw();},
  filter:(k,v)=>{ if(k==="sev") SEV=v; else ST=v; draw(); },
  dismiss:()=>{PENDING=null; const b=document.getElementById("secConfirm"); if(b) b.innerHTML="";}});
})();

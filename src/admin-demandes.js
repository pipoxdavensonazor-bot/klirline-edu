/* NORIA — Demandes d'inscription des écoles / Demann enskripsyon lekòl yo (super-admin, bloc 8). Chargé à la demande
   par admin.js. Accepter : l'école est créée (département, commune) et la direction reçoit une invitation par e-mail.
   Refuser : motif obligatoire, envoyé au demandeur. Toutes les actions sont journalisées. CSP stricte. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const $=id=>document.getElementById(id);
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const DEP={artibonite:"Artibonite",centre:"Centre","grand-anse":"Grand’Anse",nippes:"Nippes",nord:"Nord","nord-est":"Nord-Est","nord-ouest":"Nord-Ouest",ouest:"Ouest",sud:"Sud","sud-est":"Sud-Est"};
const T={
  fr:{title:"Demandes d'inscription",help:"Demandes déposées sur le portail public (/inscrire-ecole), adresse e-mail vérifiée par code. Accepter crée l'école et envoie une invitation « direction » au demandeur ; refuser lui envoie le motif.",
    all:"Toutes",en_attente:"En attente",acceptee:"Acceptée",refusee:"Refusée",none:"Aucune demande.",director:"Direction",students:"élèves (approx.)",msg:"Message",
    slug:"Identifiant de l'école",accept:"Accepter et inviter la direction",refuse:"Refuser",reason:"Motif du refus (envoyé au demandeur)",done:"Enregistré.",err:"Refusé : ",net:"Réseau indisponible.",
    school:"École créée",invSent:"Invitation",received:"Reçue le",decided:"Décision"},
  ht:{title:"Demann enskripsyon",help:"Demann ki depoze sou pòtay piblik la (/inscrire-ecole), adrès imèl verifye ak kòd. Aksepte kreye lekòl la epi voye yon envitasyon « direksyon » bay moun ki fè demann lan ; refize voye rezon an ba li.",
    all:"Tout",en_attente:"Ap tann",acceptee:"Aksepte",refusee:"Refize",none:"Pa gen demann.",director:"Direksyon",students:"elèv (apeprè)",msg:"Mesaj",
    slug:"Idantifyan lekòl la",accept:"Aksepte epi envite direksyon an",refuse:"Refize",reason:"Rezon refi a (n ap voye l bay moun nan)",done:"Anrejistre.",err:"Refize : ",net:"Rezo a pa disponib.",
    school:"Lekòl kreye",invSent:"Envitasyon",received:"Resevwa",decided:"Desizyon"}
};
const t=k=>T[lang()][k];
let EL=null, FILTER="en_attente";
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let body=null; try{ body=await r.json(); }catch(e){}
  return {status:r.status,body};
}
const post=(p,b)=>api(p,{method:"POST",body:JSON.stringify(b||{})}).catch(()=>null);
function toast(m){ const c=$("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
const dt=s=>esc(String(s||"").replace("T"," ").slice(0,16));
const badge=s=>`<span class="badge ${s==="acceptee"?"b-paid":s==="refusee"?"b-unpaid":""}">${esc(t(s))}</span>`;

async function render(el){
  EL=el;
  const r=await api("/api/admin/demandes"+(FILTER?"?statut="+FILTER:"")).catch(()=>null);
  if(!EL.isConnected) return;
  if(!r||r.status!==200){ EL.innerHTML=`<div class="badbox">${esc((r&&r.body&&r.body.error)||t("net"))}</div>`; return; }
  const chips=["en_attente","acceptee","refusee",""].map(k=>`<button type="button" class="${FILTER===k?"on":""}" aria-pressed="${FILTER===k}" data-action="NORIA_ADM_DEM.filter" data-a0="s:${k}">${esc(k?t(k):t("all"))}</button>`).join("");
  EL.innerHTML=`<div class="card"><h3>${esc(t("title"))}</h3><p class="small mut">${esc(t("help"))}</p><nav class="adm-tabs">${chips}</nav></div>
  <div class="adm-list">${r.body.map(d=>`<div class="card adm-school"><div class="row sp"><span><b>${esc(d.school_name)}</b><br><small class="mut">${esc(DEP[d.department]||d.department)} · ${esc(d.commune)} · ${esc(t("received"))} ${dt(d.created_at)}</small></span>${badge(d.status)}</div>
    <p class="small">${esc(t("director"))} : <b>${esc(d.director_name)}</b> · ${esc(d.email)}${d.phone?" · "+esc(d.phone):""}${d.students_approx!=null?` · ${Number(d.students_approx)} ${esc(t("students"))}`:""}</p>
    ${d.message?`<p class="small mut">${esc(t("msg"))} : ${esc(d.message)}</p>`:""}
    ${d.status==="en_attente"?`<form class="adm-act" data-action-submit="NORIA_ADM_DEM.accept" data-a0="n:${d.id}" data-a1="e:"><label class="fld">${esc(t("slug"))}<input name="slug" value="${esc(d.suggested_slug)}" pattern="[a-z0-9\\-]+" required></label><button type="submit">${esc(t("accept"))}</button></form>
      <form class="adm-act" data-action-submit="NORIA_ADM_DEM.refuse" data-a0="n:${d.id}" data-a1="e:"><input name="reason" required minlength="3" maxlength="300" placeholder="${esc(t("reason"))}" aria-label="${esc(t("reason"))}"><button type="submit" class="danger">${esc(t("refuse"))}</button></form>`
    :`<p class="small mut">${esc(t("decided"))} ${dt(d.decided_at)}${d.decision_reason?" — "+esc(d.decision_reason):""}${d.school_slug?` · ${esc(t("school"))} : ${esc(d.school_slug)}`:""}</p>`}</div>`).join("")||`<div class="card"><p class="mut">${esc(t("none"))}</p></div>`}</div>`;
}
const formOf=ev=>ev&&ev.target&&ev.target.closest?ev.target.closest("form"):null;
async function accept(id,ev){
  const f=formOf(ev); const r=await post(`/api/admin/demandes/${id}/accepter`,{slug:f?f.slug.value.trim():undefined});
  toast(r&&r.status===200?`${t("done")} ${t("invSent")} : ${r.body.invitation.envoi}`:t("err")+((r&&r.body&&r.body.error)||t("net"))); if(r&&r.status===200) render(EL);
}
async function refuse(id,ev){
  const f=formOf(ev); const r=await post(`/api/admin/demandes/${id}/refuser`,{reason:f?f.reason.value.trim():""});
  toast(r&&r.status===200?t("done"):t("err")+((r&&r.body&&r.body.error)||t("net"))); if(r&&r.status===200) render(EL);
}
window.NORIA_ADM_DEM=Object.freeze({render,filter:k=>{FILTER=k;render(EL);},accept:(id,...r)=>accept(id,r[r.length-1]),refuse:(id,...r)=>refuse(id,r[r.length-1])});
})();

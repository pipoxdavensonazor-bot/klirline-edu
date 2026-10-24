/* NORIA — Facturation des écoles (super-admin). Chargé à la demande par admin.js.
   Formules (par élève/an ou forfait, HTG ou USD), abonnement par école (essai, grâce, lecture seule), factures numérotées
   + PDF, paiements manuels avec référence (MonCash, NatCash, virement, espèces), annulation motivée, rappels.
   Aucune suppression possible. Aucun paiement en ligne (voir docs/facturation.md). CSP stricte : data-action. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const METH={moncash:"MonCash",natcash:"NatCash",virement:"Virement",especes:"Espèces"};
const ST={a_payer:"À payer",payee:"Payée",en_retard:"En retard",annulee:"Annulée"};
const RO={facture_en_retard:"facture en retard",essai_termine:"essai terminé",essai:"essai",decision_plateforme:"décision NORIA"};
let EL=null, DATA=null, MSG="", BAD=false, FILTER="";
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.json(); }catch(e){} return {status:r.status,body:b};
}
const post=(p,b,m)=>api(p,{method:m||"POST",body:JSON.stringify(b||{})});
const val=(f,n)=>{ const e=f.elements[n]; return e?String(e.value||"").trim():""; };
function flash(r,ok){ BAD=r.status!==200; MSG=BAD?("Refusé : "+((r.body&&r.body.error)||r.status)):ok; }
async function load(){
  const [p,s,i]=await Promise.all([api("/api/admin/facturation/formules"),api("/api/admin/facturation/ecoles"),api("/api/admin/facturation/factures")]);
  DATA={plans:(p.body&&p.body.plans)||[],schools:(s.body&&s.body.schools)||[],invoices:(i.body&&i.body.invoices)||[],today:s.body&&s.body.today};
}
function badge(st){ return `<span class="fac-st fac-${esc(st)}">${esc(ST[st]||st)}</span>`; }
function view(){
  const d=DATA; const plansOpt=d.plans.filter(p=>p.active).map(p=>`<option value="${p.id}">${esc(p.name)} — ${esc(p.montant)}${p.kind==="par_eleve"?" / élève / an":" / an"}</option>`).join("");
  const sum=k=>d.invoices.filter(i=>i.statut===k).length;
  const inv=d.invoices.filter(i=>!FILTER||i.statut===FILTER);
  return `<div class="fac">
  ${MSG?`<div class="${BAD?"badbox":"okbox"}" role="status">${esc(MSG)}</div>`:""}
  <p class="mut">Aujourd'hui (heure d'Haïti) : ${esc(d.today||"")} · ${sum("a_payer")} à payer · <strong>${sum("en_retard")} en retard</strong> · ${sum("payee")} payée(s). Aucune donnée n'est jamais supprimée ; une école en retard passe en lecture seule après le délai de grâce.</p>
  <section class="card"><h3>Formules</h3>
    <table class="tbl"><thead><tr><th>Nom</th><th>Type</th><th>Prix</th><th>État</th><th></th></tr></thead><tbody>
    ${d.plans.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.kind==="par_eleve"?"par élève / an":"forfait / an"}</td><td>${esc(p.montant)}</td><td>${p.active?"active":"désactivée"}</td>
      <td><button type="button" class="btn-sm" data-action="NORIA_FAC.togglePlan" data-a0="n:${p.id}" data-a1="n:${p.active?0:1}">${p.active?"Désactiver":"Réactiver"}</button></td></tr>`).join("")||`<tr><td colspan="5" class="mut">Aucune formule.</td></tr>`}
    </tbody></table>
    <form class="fac-row" data-action-submit="NORIA_FAC.addPlan" data-a0="t" novalidate>
      <input name="name" placeholder="Nom (ex. Standard par élève)" required aria-label="Nom">
      <select name="kind" aria-label="Type"><option value="par_eleve">Par élève / an</option><option value="forfait">Forfait / an</option></select>
      <select name="currency" aria-label="Devise"><option>HTG</option><option>USD</option></select>
      <input name="amount" placeholder="Prix (ex. 1500)" inputmode="decimal" required aria-label="Prix">
      <button type="submit">Ajouter la formule</button></form></section>
  <section class="card"><h3>Écoles</h3>
    <table class="tbl"><thead><tr><th>École</th><th>Élèves</th><th>Formule</th><th>Essai / état</th><th>Dû</th><th>Abonnement</th><th>Facturer</th></tr></thead><tbody>
    ${d.schools.map(s=>{ const a=s.abonnement||{}; const etat=!a.configured?'<span class="mut">non configuré</span>':a.read_only?`<strong class="fac-ro">Lecture seule</strong> (${esc(RO[a.reason]||"")})`:a.in_trial?`Essai jusqu'au ${esc(a.trial_ends_on)}`:a.late_invoice?`Retard — lecture seule le ${esc(a.read_only_on)}`:"À jour";
      return `<tr><td>${esc(s.name)}</td><td>${Number(s.eleves)}</td><td>${a.plan?esc(a.plan.name):"—"}</td><td>${etat}</td><td>${esc(s.du||"—")}${s.en_retard?` <span class="fac-st fac-en_retard">${s.en_retard} en retard</span>`:""}</td>
      <td><form class="fac-row" data-action-submit="NORIA_FAC.saveSchool" data-a0="t" data-id="${s.id}" novalidate>
        <select name="plan_id" aria-label="Formule"><option value="">— formule —</option>${d.plans.map(p=>`<option value="${p.id}"${a.plan&&a.plan.id===p.id?" selected":""}>${esc(p.name)}</option>`).join("")}</select>
        <input name="trial_days" type="number" min="0" max="365" placeholder="Essai (jours)" aria-label="Essai gratuit (jours)">
        <input name="grace_days" type="number" min="0" max="365" value="${a.configured?Number(a.grace_days):30}" aria-label="Délai de grâce (jours)" title="Délai de grâce (jours)">
        <select name="read_only_mode" aria-label="Lecture seule">${["auto","jamais","force"].map(m=>`<option value="${m}"${(a.read_only_mode||"auto")===m?" selected":""}>${{auto:"Lecture seule auto",jamais:"Jamais (dérogation)",force:"Forcer"}[m]}</option>`).join("")}</select>
        <input name="billing_email" type="email" value="${esc(a.billing_email||"")}" placeholder="E-mail de facturation" aria-label="E-mail de facturation">
        <button type="submit" class="btn-sm">Enregistrer</button></form></td>
      <td><form class="fac-row" data-action-submit="NORIA_FAC.invoice" data-a0="t" data-id="${s.id}" novalidate>
        <input name="due_on" type="date" aria-label="Échéance" title="Échéance (30 jours par défaut)">
        <button type="submit" class="btn-sm"${a.plan?"":" disabled"}>Émettre la facture</button></form></td></tr>`; }).join("")}
    </tbody></table></section>
  <section class="card"><h3>Factures</h3>
    <div class="fac-row"><label>Statut <select data-action-change="NORIA_FAC.filter" data-a0="v"><option value="">Tous</option>${Object.keys(ST).map(k=>`<option value="${k}"${FILTER===k?" selected":""}>${ST[k]}</option>`).join("")}</select></label>
      <button type="button" data-action="NORIA_FAC.bulk">Relancer toutes les factures en retard</button></div>
    <table class="tbl"><thead><tr><th>N°</th><th>École</th><th>Émise</th><th>Échéance</th><th>Montant</th><th>Reste</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
    ${inv.map(i=>`<tr><td><a href="/api/admin/facturation/factures/${i.id}/pdf" target="_blank" rel="noopener">${esc(i.number)}</a></td><td>${esc(i.school)}</td><td>${esc(i.issued_on)}</td><td>${esc(i.due_on)}</td><td>${esc(i.montant)}</td>
      <td>${esc(window.NORIA_FAC.money(i.reste_cents,i.currency))}</td><td>${badge(i.statut)}${i.payments.length?`<div class="mut">${i.payments.map(p=>`${esc(p.method_label)} ${esc(p.reference)}`).join(", ")}</div>`:""}</td>
      <td>${i.status==="a_payer"?`<form class="fac-row" data-action-submit="NORIA_FAC.pay" data-a0="t" data-id="${i.id}" novalidate>
        <select name="method" aria-label="Mode">${Object.keys(METH).map(k=>`<option value="${k}">${METH[k]}</option>`).join("")}</select>
        <input name="reference" placeholder="Référence" required aria-label="Référence">
        <input name="amount" placeholder="Montant (tout)" inputmode="decimal" aria-label="Montant">
        <button type="submit" class="btn-sm">Paiement reçu</button></form>
        <button type="button" class="btn-sm" data-action="NORIA_FAC.remind" data-a0="n:${i.id}">Rappel</button>
        <button type="button" class="btn-sm" data-action="NORIA_FAC.cancel" data-a0="n:${i.id}">Annuler…</button>`:(i.cancel_reason?`<span class="mut">${esc(i.cancel_reason)}</span>`:"")}</td></tr>`).join("")||`<tr><td colspan="8" class="mut">Aucune facture.</td></tr>`}
    </tbody></table></section></div>`;
}
async function refresh(){ await load(); if(EL) EL.innerHTML=view(); }
window.NORIA_FAC={
  async render(el){ EL=el; MSG=""; try{ await refresh(); }catch(e){ el.innerHTML='<div class="badbox">Serveur injoignable.</div>'; } },
  money(c,cur){ const v=(Number(c)/100).toFixed(2).split("."); return v[0].replace(/\B(?=(\d{3})+(?!\d))/g," ")+","+v[1]+" "+cur; },
  async addPlan(f){ const r=await post("/api/admin/facturation/formules",{name:val(f,"name"),kind:val(f,"kind"),currency:val(f,"currency"),amount:val(f,"amount")}); flash(r,"Formule ajoutée."); refresh(); },
  async togglePlan(id,on){ const r=await post(`/api/admin/facturation/formules/${id}`,{active:!!on},"PATCH"); flash(r,on?"Formule réactivée.":"Formule désactivée."); refresh(); },
  async saveSchool(f){ const b={plan_id:val(f,"plan_id")||null,grace_days:Number(val(f,"grace_days")||30),read_only_mode:val(f,"read_only_mode"),billing_email:val(f,"billing_email")};
    if(val(f,"trial_days")) b.trial_days=Number(val(f,"trial_days"));
    const r=await post(`/api/admin/facturation/ecoles/${f.dataset.id}`,b,"PUT"); flash(r,"Abonnement enregistré."); refresh(); },
  async invoice(f){ const b={school_id:Number(f.dataset.id)}; if(val(f,"due_on")) b.due_on=val(f,"due_on");
    const r=await post("/api/admin/facturation/factures",b); flash(r,r.body&&r.body.number?`Facture ${r.body.number} émise (${r.body.montant}).`:""); refresh(); },
  async pay(f){ const r=await post(`/api/admin/facturation/factures/${f.dataset.id}/paiements`,{method:val(f,"method"),reference:val(f,"reference"),amount:val(f,"amount")||null});
    flash(r,r.body?`Paiement enregistré — facture ${ST[r.body.statut]||""}.`:""); refresh(); },
  async remind(id){ const r=await post(`/api/admin/facturation/factures/${id}/rappel`); flash(r,r.body?`Rappel envoyé : ${r.body.emails} e-mail(s), ${r.body.notifications} notification(s).`:""); refresh(); },
  async bulk(){ const r=await post("/api/admin/facturation/rappels"); flash(r,r.body?`${r.body.relances.length} facture(s) relancée(s).`:""); refresh(); },
  async cancel(id){ const why=window.prompt("Motif de l'annulation (obligatoire) :"); if(!why) return; const r=await post(`/api/admin/facturation/factures/${id}/annuler`,{reason:why}); flash(r,"Facture annulée."); refresh(); },
  filter(v){ FILTER=v; if(EL) EL.innerHTML=view(); }
};
(function css(){ if(document.getElementById("facCss")) return; const l=document.createElement("link"); l.id="facCss"; l.rel="stylesheet"; l.href=NORIA_U.v("src/admin-facturation.css"); document.head.appendChild(l); })();
})();

/* NORIA — page « Abonnement » de l'école (direction, secrétariat, comptabilité). Chargé à la demande par ecoles.js.
   Formule, essai gratuit, factures (PDF), paiements reçus, état « lecture seule ». Paiement : manuel (MonCash, NatCash,
   virement, espèces) avec la référence de la facture ; aucun paiement en ligne. CSP stricte. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const ht=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"; };
const T={
  fr:{title:"Abonnement",plan:"Formule",none:"Aucune formule attribuée pour le moment.",perSt:"par élève et par an",flat:"forfait annuel",students:"élèves actifs",
    trial:"Essai gratuit jusqu'au",ok:"Abonnement à jour.",late:"Facture en retard : lecture seule à partir du",ro:"Espace en LECTURE SEULE : les modifications sont bloquées jusqu'au règlement. Aucune donnée n'est supprimée ; consultation, impressions et exports restent possibles.",
    inv:"Factures",n:"N°",issued:"Émise le",due:"Échéance",amount:"Montant",rest:"Reste dû",status:"Statut",paid:"Paiements",noInv:"Aucune facture.",how:"Comment payer",
    st:{a_payer:"À payer",payee:"Payée",en_retard:"En retard",annulee:"Annulée"},notConf:"La facturation n'est pas encore activée pour votre école.",err:"Impossible de charger l'abonnement."},
  ht:{title:"Abònman",plan:"Fòmil",none:"Poko gen fòmil.",perSt:"pa elèv pa ane",flat:"forfè pa ane",students:"elèv aktif",
    trial:"Esè gratis jiska",ok:"Abònman an ajou.",late:"Fakti an reta : lekti sèlman apati",ro:"Espas la an LEKTI SÈLMAN : pa ka modifye anyen jiskaske nou peye. Pa gen okenn done ki efase ; ou ka toujou konsilte, enprime ak ekspòte.",
    inv:"Fakti yo",n:"Nimewo",issued:"Bay le",due:"Dat limit",amount:"Montan",rest:"Rès pou peye",status:"Estati",paid:"Peman",noInv:"Pa gen fakti.",how:"Kijan pou peye",
    st:{a_payer:"Pou peye",payee:"Peye",en_retard:"An reta",annulee:"Anile"},notConf:"Faktirasyon poko aktive pou lekòl ou a.",err:"Pa ka chaje abònman an."}
};
const t=k=>T[ht()?"ht":"fr"][k];
window.NORIA_ABO={
  async render(el){
    let d=null; try{ const r=await fetch("/api/abonnement",{credentials:"same-origin",cache:"no-store"}); d=r.ok?await r.json():null; }catch(e){}
    if(!d){ el.innerHTML=`<div class="badbox">${esc(t("err"))}</div>`; return; }
    const head=`<h2 class="u6">${esc(t("title"))}</h2>`;
    if(!d.configured&&!d.invoices.length){ el.innerHTML=head+`<div class="card"><p>${esc(t("notConf"))}</p></div>`; return; }
    const state=d.read_only?`<div class="badbox" role="alert"><strong>${esc(t("ro"))}</strong></div>`
      :d.late_invoice?`<div class="warnbox" role="alert">${esc(t("late"))} ${esc(d.read_only_on)} (${esc(d.late_invoice.number)}, ${esc(d.late_invoice.montant)}).</div>`
      :d.in_trial?`<div class="warnbox">${esc(t("trial"))} ${esc(d.trial_ends_on)}.</div>`:`<div class="okbox">${esc(t("ok"))}</div>`;
    const plan=d.plan?`<p><strong>${esc(d.plan.name)}</strong> — ${esc(d.plan.montant)} ${esc(d.plan.kind==="par_eleve"?t("perSt"):t("flat"))} · ${Number(d.students)} ${esc(t("students"))}</p>`:`<p class="mut">${esc(t("none"))}</p>`;
    const rows=d.invoices.map(i=>`<tr><td><a href="/api/abonnement/factures/${Number(i.id)}/pdf" target="_blank" rel="noopener">${esc(i.number)}</a><div class="small mut">${esc(i.label)}</div></td><td>${esc(i.issued_on)}</td><td>${esc(i.due_on)}</td><td>${esc(i.montant)}</td>
      <td>${esc((Number(i.reste_cents)/100).toFixed(2))} ${esc(i.currency)}</td><td><span class="badge ${i.statut==="payee"?"b-ok":i.statut==="en_retard"?"b-late":"b-pending"}">${esc(t("st")[i.statut]||i.statut)}</span></td>
      <td class="small">${i.payments.map(p=>`${esc(p.paid_on)} · ${esc(p.method_label)} · ${esc(p.reference)}`).join("<br>")||"—"}</td></tr>`).join("");
    el.innerHTML=head+state+`<div class="card"><h3>${esc(t("plan"))}</h3>${plan}</div>
      <div class="card"><h3>${esc(t("inv"))}</h3>${d.invoices.length?`<div class="tblwrap"><table><thead><tr><th>${esc(t("n"))}</th><th>${esc(t("issued"))}</th><th>${esc(t("due"))}</th><th>${esc(t("amount"))}</th><th>${esc(t("rest"))}</th><th>${esc(t("status"))}</th><th>${esc(t("paid"))}</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="mut">${esc(t("noInv"))}</p>`}</div>
      <div class="card"><h3>${esc(t("how"))}</h3><p class="small">${esc(d.payment_help)}</p><p class="small mut">${Object.values(d.methods).map(esc).join(" · ")}</p></div>`;
  }
};
})();

/* NORIA — bibliothèque et finances en mode serveur : catalogue, prêts et retours, frais, paiements (espèces, MonCash,
   NatCash, virement), reçus PDF vérifiables. Tout vient de l'API ; la dernière copie vue est gardée par NORIA_OFF. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const lang=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const T={
  fr:{lib:"Bibliothèque",cat:"Catalogue",search:"Rechercher un titre, un auteur, un ISBN",title:"Titre",author:"Auteur",isbn:"ISBN (facultatif)",copies:"Exemplaires",
    avail:n=>`${n} disponible(s)`,addBook:"Ajouter un livre",save:"Enregistrer",loans:"Prêts",newLoan:"Nouveau prêt",book:"Livre",student:"Élève",due:"Échéance",
    lend:"Prêter",ret:"Retour",late:n=>`En retard (${n} j)`,back:"Rendu",backLate:"Rendu en retard",cur:"En cours",lateF:"En retard",all:"Tous",noLoan:"Aucun prêt.",noBook:"Aucun livre au catalogue.",
    myLoans:"Mes prêts",kidLoans:"Prêts de mes enfants",loanedOn:"Prêté le",
    fin:"Finances",totDue:"Total dû",totPaid:"Encaissé",bal:"Solde",pay:"Enregistrer un paiement",amount:"Montant (HTG)",method:"Mode",ref:"Référence de transaction",refHelp:"Obligatoire pour MonCash, NatCash et virement. Saisie manuelle : non vérifiée en ligne.",
    date:"Date",label:"Objet (facultatif)",fee:"Ajouter des frais",feeLabel:"Libellé",dueOn:"Échéance (facultatif)",receipts:"Reçus",receipt:"Reçu",pdf:"PDF",cancel:"Annuler",cancelled:"Annulé",
    reason:"Motif de l'annulation (obligatoire) :",fees:"Frais",noPay:"Aucun paiement.",students:"Élèves",recent:"Derniers reçus",paidOk:n=>`Paiement enregistré : reçu ${n}.`,
    m:{especes:"Espèces",moncash:"MonCash",natcash:"NatCash",virement:"Virement bancaire"},unverified:"référence non vérifiée",
    noAccess:"Accès réservé à d'autres rôles.",off:"Hors ligne : dernière copie connue.",err:"Refusé : ",net:"Réseau indisponible.",needNet:"Réseau nécessaire pour cette action.",okSaved:"Enregistré.",wait:"Chargement…"},
  ht:{lib:"Bibliyotèk",cat:"Katalòg",search:"Chèche yon tit, yon otè, yon ISBN",title:"Tit",author:"Otè",isbn:"ISBN (si genyen)",copies:"Egzanplè",
    avail:n=>`${n} disponib`,addBook:"Ajoute yon liv",save:"Anrejistre",loans:"Pre",newLoan:"Nouvo pre",book:"Liv",student:"Elèv",due:"Dat pou remèt",
    lend:"Prete",ret:"Resevwa liv la",late:n=>`An reta (${n} jou)`,back:"Remèt",backLate:"Remèt an reta",cur:"Ki poko remèt",lateF:"An reta",all:"Tout",noLoan:"Pa gen pre.",noBook:"Pa gen liv nan katalòg la.",
    myLoans:"Liv mwen prete",kidLoans:"Liv pitit mwen yo prete",loanedOn:"Prete le",
    fin:"Finans",totDue:"Total pou peye",totPaid:"Lajan ki rantre",bal:"Sa ki rete pou peye",pay:"Anrejistre yon peman",amount:"Montan (HTG)",method:"Mòd peman",ref:"Nimewo tranzaksyon an",refHelp:"Obligatwa pou MonCash, NatCash ak transfè labank. Se lekòl la ki antre l alamen : li pa verifye sou entènèt.",
    date:"Dat",label:"Pou kisa (si genyen)",fee:"Ajoute frè",feeLabel:"Non frè a",dueOn:"Dat limit (si genyen)",receipts:"Resi",receipt:"Resi",pdf:"PDF",cancel:"Anile",cancelled:"Anile",
    reason:"Poukisa w ap anile l (obligatwa) :",fees:"Frè",noPay:"Pa gen peman.",students:"Elèv",recent:"Dènye resi yo",paidOk:n=>`Peman anrejistre : resi ${n}.`,
    m:{especes:"Kach",moncash:"MonCash",natcash:"NatCash",virement:"Transfè labank"},unverified:"referans pa verifye",
    noAccess:"Se lòt wòl ki gen aksè isit la.",off:"San entènèt : se dènye kopi nou te genyen an.",err:"Refize : ",net:"Rezo a pa disponib.",needNet:"Fò gen rezo pou aksyon sa a.",okSaved:"Anrejistre.",wait:"Ap chaje…"},
};
const t=k=>T[lang()][k];
const C={}; const ST={q:"",status:"en_cours"};
let S=null, rerender=()=>{};
const has=(...r)=>S&&r.includes(S.role);
const LIB_MGR=["direction","secretariat","bibliothecaire"], FIN_MGR=["direction","comptable"];
const today=()=>new Date().toLocaleDateString("en-CA");
const money=v=>Number(v||0).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}).replace(/\u202f|\u00a0/g," ")+" HTG";

async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let body=null; try{ body=await r.json(); }catch(e){}
  return {status:r.status,body};
}
const post=(p,b)=>api(p,{method:"POST",body:JSON.stringify(b||{})});
function toast(m){ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),3500); }
function get(path){
  if(path in C) return C[path];
  C[path]=undefined;
  (async()=>{
    let v=null;
    if(navigator.onLine){ try{ const r=await api(path); if(r.status===200){ v=r.body; window.NORIA_OFF&&NORIA_OFF.putCache("get:"+path,v); } else v={__err:r.status}; }catch(e){} }
    if(v==null&&window.NORIA_OFF){ v=await NORIA_OFF.getCache("get:"+path); if(v!=null) v=Array.isArray(v)?Object.assign(v.slice(),{__stale:1}):{...v,__stale:1}; }
    C[path]=v==null?{__err:0}:v; rerender();
  })();
  return undefined;
}
const ok=v=>v!==undefined&&v!==null&&!v.__err;
const wait=()=>`<p class="mut small">${esc(t("wait"))}</p>`;
function invalidate(...pre){ Object.keys(C).forEach(k=>{ if(pre.some(p=>k.startsWith(p))) delete C[k]; }); }
function failMsg(r){ return t("err")+((r&&r.body&&r.body.error)||(r?r.status:t("net"))); }
async function act(fn){ if(!navigator.onLine){ toast(t("needNet")); return null; } try{ return await fn(); }catch(e){ toast(t("net")); return null; } }
const stale=v=>v&&v.__stale?`<p class="small mut">${esc(t("off"))}</p>`:"";
const stuOpts=list=>list.map(s=>`<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)} — ${esc(s.code)}</option>`).join("");
const name=l=>`${esc(l.first_name)} ${esc(l.last_name)}`;
function loanBadge(l){
  if(l.late) return `<span class="badge b-conflict">${esc(t("late")(l.days_late))}</span>`;
  if(l.returned_on) return `<span class="badge ${l.returned_late?"b-pending":"b-synced"}">${esc(t(l.returned_late?"backLate":"back"))} ${esc(l.returned_on)}</span>`;
  return `<span class="badge b-pending">${esc(t("due"))} ${esc(l.due_on)}</span>`;
}

/* ---------- bibliothèque ---------- */
function lib(state){
  S=state; const mgr=has(...LIB_MGR);
  const books=get("/api/books"+(ST.q?`?q=${encodeURIComponent(ST.q)}`:""));
  let h=`<div class="row sp"><h2 class="u6">${esc(t("lib"))}</h2></div><div class="grid g2 u8"><div class="card"><h3>${esc(t("cat"))}</h3>
  <form class="toolbar" data-action-submit="NORIA_GES.search" data-a0="t"><input name="q" type="search" value="${esc(ST.q)}" aria-label="${esc(t("search"))}" placeholder="${esc(t("search"))}" class="ges-grow"><button class="ghost" type="submit">🔎</button></form>`;
  if(!ok(books)) h+=wait();
  else { h+=stale(books)+(books.length?`<ul class="ges-list">${books.map(b=>`<li class="row sp"><span><b>${esc(b.title)}</b><br><span class="small mut">${esc(b.author)}${b.isbn?" · ISBN "+esc(b.isbn):""}</span></span><span class="badge ${b.available>0?"b-available":"b-borrowed"}">${esc(t("avail")(b.available))} / ${b.copies}</span></li>`).join("")}</ul>`:`<p class="small mut">${esc(t("noBook"))}</p>`); }
  if(mgr) h+=`<details class="ges-new"><summary>${esc(t("addBook"))}</summary><form data-action-submit="NORIA_GES.addBook" data-a0="t">
    <label class="fld">${esc(t("title"))}<input name="title" required maxlength="200"></label>
    <label class="fld">${esc(t("author"))}<input name="author" required maxlength="140"></label>
    <div class="row"><label class="fld">${esc(t("isbn"))}<input name="isbn" inputmode="numeric" maxlength="20" pattern="[0-9Xx \\-]{10,17}"></label>
    <label class="fld">${esc(t("copies"))}<input name="copies" type="number" min="1" max="1000" value="1" required></label></div>
    <button type="submit">${esc(t("save"))}</button></form></details>`;
  h+=`</div><div class="card">`;
  if(mgr){
    const bw=get("/api/library/borrowers");
    h+=`<h3>${esc(t("newLoan"))}</h3>${ok(books)&&books.length&&ok(bw)?`<form data-action-submit="NORIA_GES.lend" data-a0="t">
      <label class="fld">${esc(t("book"))}<select name="book">${books.filter(b=>b.available>0).map(b=>`<option value="${b.id}">${esc(b.title)}</option>`).join("")}</select></label>
      <label class="fld">${esc(t("student"))}<select name="student">${stuOpts(bw)}</select></label>
      <label class="fld">${esc(t("due"))}<input name="due" type="date" min="${today()}"></label>
      <button type="submit">${esc(t("lend"))}</button></form>`:""}
      <div class="row sp u8"><h3>${esc(t("loans"))}</h3><select aria-label="${esc(t("loans"))}" data-action-change="NORIA_GES.status" data-a0="v">${[["en_cours","cur"],["retard","lateF"],["tous","all"]].map(([v,k])=>`<option value="${v}"${ST.status===v?" selected":""}>${esc(t(k))}</option>`).join("")}</select></div>`;
  } else h+=`<h3>${esc(t(has("parent")?"kidLoans":"myLoans"))}</h3>`;
  const loans=get(`/api/loans?status=${mgr?ST.status:"tous"}`);
  if(!ok(loans)) h+=loans&&loans.__err===403?`<p class="small mut">${esc(t("noAccess"))}</p>`:wait();
  else h+=stale(loans)+(loans.length?`<ul class="ges-list">${loans.map(l=>`<li class="row sp"><span><b>${esc(l.title)}</b> → ${name(l)}<br><span class="small mut">${esc(t("loanedOn"))} ${esc(l.loaned_on)} · ${esc(t("due"))} ${esc(l.due_on)}</span></span><span class="row">${loanBadge(l)}${mgr&&!l.returned_on?`<button class="soft" data-action="NORIA_GES.giveBack" data-a0="n:${l.id}">${esc(t("ret"))}</button>`:""}</span></li>`).join("")}</ul>`:`<p class="small mut">${esc(t("noLoan"))}</p>`);
  return h+`</div></div>`;
}
async function addBook(f){
  const r=await act(()=>post("/api/books",{title:f.title.value,author:f.author.value,isbn:f.isbn.value,copies:Number(f.copies.value)})); if(!r) return;
  if(r.status!==200){ toast(failMsg(r)); return; } toast(t("okSaved")); invalidate("/api/books"); rerender();
}
async function lend(f){
  const b={book_id:Number(f.book.value),student_id:Number(f.student.value)}; if(f.due.value) b.due_on=f.due.value;
  const r=await act(()=>post("/api/loans",b)); if(!r) return;
  if(r.status!==200){ toast(failMsg(r)); return; } toast(t("okSaved")); invalidate("/api/books","/api/loans"); rerender();
}
async function giveBack(id){
  const r=await act(()=>post(`/api/loans/${id}/retour`)); if(!r) return;
  if(r.status!==200){ toast(failMsg(r)); return; } invalidate("/api/books","/api/loans"); rerender();
}

/* ---------- finances ---------- */
function payRow(p,withStudent){
  return `<li class="row sp${p.cancelled_at?" ges-cancel":""}"><span><b>${esc(p.number)}</b> · ${esc(money(p.amount_htg))}${withStudent?` · ${name(p)}`:""}<br><span class="small mut">${esc(p.paid_on)} · ${esc(t("m")[p.method]||p.method)}${p.reference?" · "+esc(p.reference):""}${p.method!=="especes"&&p.provider_status!=="confirme"?" · "+esc(t("unverified")):""}${p.cancelled_at?" · "+esc(p.cancel_reason||""):""}</span></span>
  <span class="row">${p.cancelled_at?`<span class="badge b-conflict">${esc(t("cancelled"))}</span>`:""}<button class="soft" data-action="NORIA_GES.pdf" data-a0="n:${p.id}">${esc(t("pdf"))}</button>${!p.cancelled_at&&has("direction")?`<button class="ghost" data-action="NORIA_GES.cancel" data-a0="n:${p.id}">${esc(t("cancel"))}</button>`:""}</span></li>`;
}
function fin(state){
  S=state;
  if(has("parent")) return family();
  if(!has(...FIN_MGR)) return `<div class="badbox">${esc(t("noAccess"))}</div>`;
  const ov=get("/api/finance/overview");
  let h=`<div class="row sp"><h2 class="u6">${esc(t("fin"))}</h2></div>`;
  if(!ok(ov)) return h+wait();
  h+=stale(ov)+`<div class="grid g3"><div class="card"><div class="kpi">${esc(money(ov.totals.due_htg))}</div><div class="kpi-sub">${esc(t("totDue"))}</div></div>
  <div class="card"><div class="kpi">${esc(money(ov.totals.paid_htg))}</div><div class="kpi-sub">${esc(t("totPaid"))}</div></div>
  <div class="card"><div class="kpi">${esc(money(ov.totals.due_htg-ov.totals.paid_htg))}</div><div class="kpi-sub">${esc(t("bal"))}</div></div></div>
  <div class="grid g2 u8"><div class="card"><h3>${esc(t("pay"))}</h3><form id="gesPay" data-action-submit="NORIA_GES.pay" data-a0="t">
    <label class="fld">${esc(t("student"))}<select name="student">${stuOpts(ov.students)}</select></label>
    <div class="row"><label class="fld">${esc(t("amount"))}<input name="amount" inputmode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?"></label>
    <label class="fld">${esc(t("method"))}<select name="method" data-action-change="NORIA_GES.method" data-a0="t">${Object.entries(t("m")).map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join("")}</select></label></div>
    <label class="fld" id="gesRef" hidden>${esc(t("ref"))}<input name="ref" maxlength="64" autocomplete="off" spellcheck="false"></label>
    <p class="small mut" id="gesRefHelp" hidden>${esc(t("refHelp"))}</p>
    <div class="row"><label class="fld">${esc(t("date"))}<input name="date" type="date" max="${today()}" value="${today()}"></label>
    <label class="fld">${esc(t("label"))}<input name="label" maxlength="120"></label></div>
    <button type="submit">${esc(t("pay"))}</button></form>
    <details class="ges-new"><summary>${esc(t("fee"))}</summary><form data-action-submit="NORIA_GES.fee" data-a0="t">
    <label class="fld">${esc(t("student"))}<select name="student">${stuOpts(ov.students)}</select></label>
    <label class="fld">${esc(t("feeLabel"))}<input name="label" required maxlength="120"></label>
    <div class="row"><label class="fld">${esc(t("amount"))}<input name="amount" inputmode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?"></label>
    <label class="fld">${esc(t("dueOn"))}<input name="due" type="date"></label></div><button type="submit">${esc(t("save"))}</button></form></details></div>
  <div class="card"><h3>${esc(t("students"))}</h3><ul class="ges-list">${ov.students.map(s=>`<li class="row sp"><span>${name(s)} <span class="small mut">${esc(s.code)}</span></span><b class="${s.balance_htg>0?"ges-due":""}">${esc(money(s.balance_htg))}</b></li>`).join("")}</ul>
  <h3 class="u8">${esc(t("recent"))}</h3>${ov.recent.length?`<ul class="ges-list">${ov.recent.map(p=>payRow(p,true)).join("")}</ul>`:`<p class="small mut">${esc(t("noPay"))}</p>`}</div></div>`;
  return h;
}
function family(){
  let h=`<h2 class="u6">${esc(t("fin"))}</h2>`;
  for(const k of S.students){
    const a=get(`/api/students/${k.serverId}/account`);
    if(!ok(a)){ h+=`<div class="card u8"><h3>${esc(k.firstName)} ${esc(k.lastName)}</h3>${wait()}</div>`; continue; }
    h+=`<div class="card u8">${stale(a)}<h3>${esc(k.firstName)} ${esc(k.lastName)} — ${esc(t("bal"))} : <b>${esc(money(a.balance_htg))}</b></h3>
    <p class="small mut">${esc(t("totPaid"))} : ${esc(money(a.paid_htg))} / ${esc(money(a.due_htg))}</p>
    <h4>${esc(t("fees"))}</h4><ul class="ges-list">${a.fees.map(f=>`<li class="row sp"><span>${esc(f.label)}${f.due_on?` <span class="small mut">· ${esc(f.due_on)}</span>`:""}</span><span>${esc(money(f.amount_htg))}</span></li>`).join("")}</ul>
    <h4>${esc(t("receipts"))}</h4>${a.payments.length?`<ul class="ges-list">${a.payments.map(p=>payRow(p,false)).join("")}</ul>`:`<p class="small mut">${esc(t("noPay"))}</p>`}</div>`;
  }
  return h;
}
function method(sel){ const need=sel.value!=="especes"; const f=sel.form; f.querySelector("#gesRef").hidden=!need; f.querySelector("#gesRefHelp").hidden=!need; f.ref.required=need; }
async function pay(f){
  const b={student_id:Number(f.student.value),amount_htg:f.amount.value,method:f.method.value,paid_on:f.date.value||undefined,label:f.label.value||undefined};
  if(b.method!=="especes") b.reference=f.ref.value;
  const r=await act(()=>post("/api/payments",b)); if(!r) return;
  if(r.status!==200){ toast(failMsg(r)); return; }
  toast(t("paidOk")(r.body.number)); invalidate("/api/finance","/api/students/"); rerender();
}
async function fee(f){
  const r=await act(()=>post("/api/fees",{student_id:Number(f.student.value),label:f.label.value,amount_htg:f.amount.value,due_on:f.due.value||undefined})); if(!r) return;
  if(r.status!==200){ toast(failMsg(r)); return; } toast(t("okSaved")); invalidate("/api/finance","/api/students/"); rerender();
}
async function cancel(id){
  const reason=window.prompt(t("reason")); if(!reason||!reason.trim()) return;
  const r=await act(()=>post(`/api/payments/${id}/annuler`,{reason})); if(!r) return;
  if(r.status!==200){ toast(failMsg(r)); return; } invalidate("/api/finance","/api/students/"); rerender();
}
async function pdf(id){
  if(!navigator.onLine){ toast(t("needNet")); return; }
  const r=await fetch(`/api/payments/${id}/pdf`,{credentials:"same-origin",cache:"no-store"});
  if(!r.ok){ toast(t("err")+r.status); return; }
  const b=await r.blob(); const a=document.createElement("a"); a.href=URL.createObjectURL(b);
  a.download=((r.headers.get("content-disposition")||"").match(/filename="?([^";]+)/)||[])[1]||"recu.pdf"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
window.NORIA_GES={lib,fin,addBook,lend,giveBack,pay,fee,cancel,pdf,method,
  search:f=>{ ST.q=f.q.value.trim(); rerender(); }, status:v=>{ ST.status=v; rerender(); },
  bind:fn=>{ rerender=fn; }, reset:()=>{ Object.keys(C).forEach(k=>delete C[k]); }};
})();

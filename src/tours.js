/* Klirline — parcours guidés testables + confirmations (ADDITIF, après addons.js).
   3 parcours prioritaires (recherche) : faire l'appel, dossier d'un enfant, publier une annonce.
   + confirmations explicites (style ACORN) avant publication / encaissement / suppression. */
(function(){
"use strict";
const XD = window.KLXD;
const {esc,safeUrl}=window.NORIA_U;
const lang = ()=>{ const o=XD.readOld(); return (o&&o.lang)||"fr"; };
const L = o=>o[lang()]||o.fr;
function toast(m){ const c=document.querySelector("#toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),3400); }
function mut(fn){ const x=XD.loadX(); fn(x); XD.saveX(x); }
function findBtn(txt){ return [...document.querySelectorAll("#view button")].find(b=>(b.textContent||"").includes(txt)); }
const W = {
  next:{fr:"Suivant",ht:"Apre"}, prev:{fr:"Retour",ht:"Tounen"}, quit:{fr:"Quitter",ht:"Kite"},
  tours:{fr:"Parcours guidés",ht:"Pakou gide"},
  done:{fr:"Parcours terminé ✓ — merci !",ht:"Pakou fini ✓ — mèsi !"},
  notYet:{fr:"Pas encore — suivez l'instruction ci-dessus puis réessayez.",ht:"Poko — swiv enstriksyon ki anwo a epi eseye ankò."},
};

/* ---------- définition des 3 parcours ---------- */
const TOURS = [
{ id:"appel", roles:["direction","enseignant","secretariat"],
  title:{fr:"1. Faire l'appel",ht:"1. Fè apèl"},
  steps:[
    { run:()=>window.KL.go("dashboard"), wait:"#nav",
      t:{fr:"Départ : tableau de bord",ht:"Depa : tablo jeneral"},
      x:{fr:"Ouvrez le module Présences pour commencer l'appel du jour.",ht:"Louvri modil Prezans pou kòmanse apèl jodi a."} },
    { run:()=>window.KL.go("attendance"), wait:".attbtn",
      t:{fr:"Marquer les absences",ht:"Make absans yo"},
      x:{fr:"Cliquez sur « A » pour un élève absent (ou « R » retard, « E » excusé).",ht:"Klike sou « A » pou yon elèv absan (oswa « R » anreta, « E » eskize)."} },
    { t:{fr:"Enregistrer",ht:"Anrejistre"},
      x:{fr:"Cliquez sur « Enregistrer ». Hors ligne, la saisie part en file « en attente ».",ht:"Klike sou « Anrejistre ». Deyò liy, sa ou ekri a prale nan fil « ap tann » nan."},
      verify:{fr:"Appel bien enregistré dans l'historique.",ht:"Apèl byen anrejistre nan istwa a."},
      check:()=>{ const o=XD.readOld(); return o&&o.attLog&&o.attLog.length>0; } },
  ]},
{ id:"dossier", roles:["parent","direction","secretariat"],
  title:{fr:"2. Consulter le dossier d'un enfant",ht:"2. Gade dosye yon pitit"},
  steps:[
    { run:()=>window.KL.go("dashboard"), wait:"#view .card",
      t:{fr:"Choisir l'enfant",ht:"Chwazi pitit la"},
      x:{fr:"Chaque carte = un enfant relié à votre compte. Repérez présences, solde et relevés.",ht:"Chak kat = yon pitit ki lye ak kont ou. Gade prezans, sold ak bilten."} },
    { t:{fr:"Ouvrir le relevé",ht:"Louvri bilten an"},
      x:{fr:"Cliquez sur « Relevé / Imprimer » sur la carte de l'enfant.",ht:"Klike sou « Relevé / Imprimer » sou kat pitit la."},
      verify:{fr:"Relevé ouvert : seules les notes publiées sont visibles.",ht:"Bilten ouvri : se sèlman nòt ki pibliye yo ki parèt."},
      check:()=>!!document.querySelector(".modal") },
    { t:{fr:"Refermer",ht:"Fèmen"},
      x:{fr:"Fermez avec « Fermer ». Le parcours est terminé.",ht:"Fèmen ak « Fermer ». Pakou a fini."} },
  ]},
{ id:"annonce", roles:["direction","secretariat","enseignant"],
  title:{fr:"3. Publier une annonce",ht:"3. Pibliye yon anons"},
  steps:[
    { run:()=>window.KL.go("comms"), wait:"#view",
      t:{fr:"Ouvrir Communications",ht:"Louvri Kominikasyon"},
      x:{fr:"Cliquez sur « Nouvelle annonce ».",ht:"Klike sou « Nouvelle annonce »."},
      verify:{fr:"Boîte de rédaction ouverte.",ht:"Bwat redaksyon ouvri."},
      check:()=>!!document.querySelector("#anModal .modal") },
    { t:{fr:"Rédiger et publier",ht:"Ekri epi pibliye"},
      x:{fr:"Titre + message, cible et canal, puis « Publier ». L'annonce apparaît en tête avec son bilan d'envoi.",ht:"Tit + mesaj, sib ak kanal, apre « Publier ». Anons la parèt anlè ak bilan li."},
      verify:{fr:"Annonce publiée et visible dans le fil.",ht:"Anons pibliye epi vizib nan fil la."},
      check:(T)=>{ const o=XD.readOld(); return o&&o.announces.length>(T.startCount||0); } },
  ]},
];

/* ---------- moteur ---------- */
let T = null, tok = 0;
function clearHi(){ document.querySelectorAll("[data-tourhi]").forEach(e=>{ e.removeAttribute("data-tourhi"); }); const o=document.querySelector("#tourSheet"); if(o) o.remove(); }
function sheet(html){ clearHi(); const d=document.createElement("div"); d.id="tourSheet"; d.innerHTML=html; document.body.appendChild(d); }
function el(sel){ if(typeof sel==="function"){ try{ return sel(); }catch(e){ return null; } } return document.querySelector(sel); }
async function show(){
  if(!T) return; const my=++tok; const s=T.tour.steps[T.i];
  if(s.run){ try{ s.run(); }catch(e){} }
  let tgt=null;
  if(s.wait){ for(let k=0;k<26;k++){ if(tok!==my||!T) return; tgt=el(s.wait); if(tgt) break; await new Promise(r=>setTimeout(r,300)); } }
  if(tok!==my||!T) return;
  if(tgt){ tgt.setAttribute("data-tourhi","1"); try{ tgt.scrollIntoView({block:"center"}); }catch(e){} }
  const n=T.tour.steps.length;
  sheet(`<div class="u40">${esc(L(T.tour.title))} — étape ${T.i+1}/${n}</div>
    <div class="u41">${esc(L(s.t))}</div>
    <div class="u42">${esc(L(s.x))}</div>
    <div class="u43">
      ${T.i>0?`<button data-ta="prev" class="u44"> ${esc(W.prev[lang()]||W.prev.fr)}</button>`:""}
      ${T.i<n-1?`<button data-ta="next">${esc(W.next[lang()]||W.next.fr)} </button>`:`<button data-ta="finish">Terminer</button>`}
      <button data-ta="quit" class="u45">${esc(W.quit[lang()]||W.quit.fr)}</button>
    </div>`);
  d_actions();
}
function d_actions(){ const sh=document.querySelector("#tourSheet"); if(!sh) return; sh.querySelectorAll("[data-ta]").forEach(b=>b.onclick=()=>act(b.getAttribute("data-ta"))); }
function act(a){
  if(!T) return;
  if(a==="quit"){ T=null; tok++; clearHi(); return; }
  if(a==="prev"){ T.i=Math.max(0,T.i-1); show(); return; }
  if(a==="next"){ T.i++; show(); return; }
  if(a==="finish"){
    const s=T.tour.steps[T.i]; let ok=true;
    if(s.check){ try{ ok=!!s.check(T); }catch(e){ ok=false; } }
    if(ok){ mut(x=>{ x.toursDone=x.toursDone||{}; x.toursDone[T.tour.id]={at:new Date().toLocaleString()}; x.audit.unshift({at:new Date().toLocaleString(),by:(XD.readOld()||{}).role||"?",action:"parcours."+T.tour.id,detail:"parcours guidé terminé"}); XD.saveX(x); });
      sheet(`<div class="u46">✓ ${esc(W.done[lang()]||W.done.fr)}</div><div class="u8"><button data-ta="quit">OK</button></div>`); d_actions();
    } else { toast(W.notYet[lang()]||W.notYet.fr); }
    return;
  }
}
const KLX = window.KLX = window.KLX||{};
KLX.tour = id=>{
  const tour=TOURS.find(t=>t.id===id); if(!tour) return;
  const r=(XD.readOld()||{}).role||"direction";
  if(!tour.roles.includes(r)){ toast("noAccess"); return; }
  const o=XD.readOld();
  T={tour,i:0,startCount:o?o.announces.length:0}; show();
};
KLX.tourAct = act;
KLX.toursList = ()=>TOURS.filter(t=>t.roles.includes((XD.readOld()||{}).role||"direction")).map(t=>({id:t.id,title:L(t.title),done:(()=>{ try{ const x=XD.loadX(); return !!(x.toursDone&&x.toursDone[t.id]); }catch(e){ return false; } })()}));
window.KL_TOURS = TOURS;

/* ---------- confirmations explicites (ACORN : confirmer, expliquer les blocages) ---------- */
function confirmWrap(name, build){
  if(!window.KL||!window.KL[name]||window.KL[name].__xc) return;
  const orig=window.KL[name];
  const fn=function(...a){ const msg=build(a); if(msg && window.confirm(msg)!==true) return; return orig.apply(this,a); };
  fn.__xc=true; fn.__xw=orig.__xw; window.KL[name]=fn;
}
function cInit(){
  confirmWrap("evPub", a=>{
    const o=XD.readOld(); const e=o?o.evals.find(x=>x.id===a[0]):null; if(!e) return null;
    const n=Object.keys((o.grades||{})[e.id]||{}).length;
    const fr=`Publier « ${e.title} » (${e.subject}, ${e.classId}) ?\n${n} note(s) saisie(s). Visible aux parents après publication.`+(n===0?"\n Aucune note saisie — publier quand même ?":"");
    const ht=`Pibliye « ${e.title} » ?\n${n} nòt. Paran ap wè li apre piblikasyon.`+(n===0?"\n Okenn nòt — pibliye kanmenm ?":"");
    return lang()==="ht"?ht:fr;
  });
  confirmWrap("paySave", ()=>{
    const s=document.querySelector("#p_s"), m=document.querySelector("#p_a");
    if(!s||!m) return null;
    const o=XD.readOld(); const st=o?o.students.find(x=>x.id===s.value):null;
    const fr=`Encaisser ${m.value} G pour ${st?st.firstName+" "+st.lastName:"?"} (${s.selectedOptions? s.selectedOptions[0].textContent.slice(0,60):""}) ?`;
    return lang()==="ht"?`Touche ${m.value} G pou ${st?st.firstName+" "+st.lastName:"?"} ?`:fr;
  });
  confirmWrap("calDel", ()=>lang()==="ht"?"Efase evènman sa a ?":"Supprimer cet événement du calendrier ?");
}
if(document.readyState!=="loading") cInit(); else document.addEventListener("DOMContentLoaded",cInit);
})();

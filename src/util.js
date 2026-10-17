/* NORIA — utilitaires partagés de sécurité (chargé avant les autres scripts). */
(function(){
"use strict";
// Échappement HTML : texte et attributs entre guillemets doubles ou simples.
function esc(s){ return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
// Cellule CSV entre guillemets ; neutralise les formules de tableur (=, +, -, @, tabulation, retour chariot en tête).
function csvCell(v){ let s=String(v??""); if(/^[=+\-@\t\r]/.test(s)) s="'"+s; return '"'+s.replace(/"/g,'""')+'"'; }
function toCSV(rows){ return rows.map(r=>r.map(csvCell).join(",")).join("\n"); }
// N'accepte que les URL https: absolues. Renvoie "" sinon.
function safeUrl(u){ try{ const x=new URL(String(u??"").trim()); return x.protocol==="https:"?x.href:""; }catch(e){ return ""; } }

// Délégation (CSP stricte) : data-action[-change|-input|-submit]="KL.go", arguments data-a0… :
// s:texte n:nombre j:json v=valeur c=coché k=coché 1/0 t=élément e=événement (voir src/README.md).
const NS={KL:1,KLX:1,NORIA_SCO:1,NORIA_GES:1,NORIA_ECO:1,NORIA_ECOG:1,NORIA_ADM:1,NORIA_BAD:1};
const BUILTIN={print:()=>print(),vider:s=>{const m=document.querySelector(s); if(m) m.innerHTML="";},retirer:(s,el)=>{const m=el.closest(s); if(m) m.remove();}};
function arg(c,el,ev){ const v=c.slice(2); switch(c[0]){ case"s":return v; case"n":return Number(v); case"j":return JSON.parse(v); case"v":return el.value; case"c":return el.checked; case"k":return el.checked?1:0; case"t":return el; case"e":return ev; } }
function run(el,name,ev){ const a=[]; for(let i=0;el.hasAttribute("data-a"+i);i++) a.push(arg(el.getAttribute("data-a"+i),el,ev));
  if(BUILTIN[name]) return BUILTIN[name](a[0],el);
  const [ns,fn,x]=name.split("."), o=NS[ns]&&window[ns];
  if(!x&&o&&typeof o[fn]==="function") return o[fn](...a);
  console.warn("NORIA : action inconnue",name); }
// Phase de capture : reçoit aussi les événements qui ne remontent pas (new Event("input")). Comme les anciens gestionnaires
// en ligne, chaque ancêtre porteur de l'attribut est appelé (sauf s'il a été retiré du DOM).
["click","change","input","submit"].forEach(type=>{ const attr=type==="click"?"data-action":"data-action-"+type;
  document.addEventListener(type,ev=>{ for(let el=ev.target.closest?ev.target:ev.target.parentElement;el;el=el.parentElement){ const name=el.getAttribute(attr); if(!name) continue;
    if(type==="submit") ev.preventDefault();
    run(el,name,ev); if(!el.isConnected) break; } },true); });
window.NORIA_U = Object.freeze({ esc, safeUrl, csvCell, toCSV });
})();

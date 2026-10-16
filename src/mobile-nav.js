/* NORIA — navigation téléphone et tablette.
   Téléphone (< 700 px) : barre du bas avec 4 sections principales du rôle + « Plus » (panneau de toutes les sections).
   Tablette (700–1099 px) : bouton « Menu » dans l'en-tête, qui ouvre un tiroir latéral.
   Ordinateur (≥ 1100 px) : inchangé, le menu latéral #nav reste seul.
   La source reste #nav (construit par app.js et addons.js selon le rôle) : chaque entrée ici clique le bouton d'origine. */
(function(){
"use strict";
const PRIMARY = 4;
const phoneMQ = matchMedia("(max-width: 699px)");
const tabletMQ = matchMedia("(min-width: 700px) and (max-width: 1099px)");
const L = {
  fr: { more:"Plus", menu:"Menu", all:"Toutes les sections", close:"Fermer", bar:"Sections principales", current:"section actuelle" },
  ht: { more:"Plis", menu:"Meni", all:"Tout seksyon yo", close:"Fèmen", bar:"Seksyon prensipal yo", current:"seksyon kounye a" },
};
const lang = () => { const s=document.getElementById("langSel"); return s && s.value==="ht" ? "ht" : "fr"; };
const tr = k => (L[lang()]||L.fr)[k];
const el = (tag, attrs={}, text) => { const e=document.createElement(tag); for(const [k,v] of Object.entries(attrs)) e.setAttribute(k,v); if(text!=null) e.textContent=text; return e; };

let nav, bar, drawer, panel, list, title, closeBtn, menuBtn, moreBtn, opener=null, pushed=false, scheduled=false;

function items(){
  const out=[]; let group="";
  for(const n of nav.children){
    if(n.tagName==="SMALL"){ group=n.textContent.trim(); continue; }
    if(n.tagName==="BUTTON") out.push({ btn:n, label:n.textContent.replace(/\s+/g," ").trim(), group, on:n.classList.contains("on") });
  }
  return out;
}

function go(it){ close(false); it.btn.click(); }

function entry(it, cls){
  const b=el("button",{type:"button",class:cls});
  b.appendChild(el("span",{class:"mnv-label"},it.label));
  if(it.on){ b.classList.add("on"); b.setAttribute("aria-current","page"); }
  b.addEventListener("click",()=>go(it));
  return b;
}

function render(){
  scheduled=false;
  const all=items();
  const prim=all.slice(0,PRIMARY);
  // Barre du bas
  bar.setAttribute("aria-label",tr("bar"));
  bar.replaceChildren(...prim.map(it=>entry(it,"mnv-tab")));
  const activeHidden=all.slice(PRIMARY).some(it=>it.on);
  moreBtn.replaceChildren(el("span",{class:"mnv-dots","aria-hidden":"true"},"•••"),el("span",{class:"mnv-label"},tr("more")));
  moreBtn.classList.toggle("on",activeHidden);
  if(all.length>PRIMARY) bar.appendChild(moreBtn);
  // Panneau
  title.textContent=tr("all"); closeBtn.setAttribute("aria-label",tr("close")); closeBtn.textContent="×";
  menuBtn.replaceChildren(el("span",{class:"mnv-burger","aria-hidden":"true"}),el("span",{},tr("menu")));
  const frag=document.createDocumentFragment(); let g=null, ul=null;
  all.forEach(it=>{
    if(it.group!==g||!ul){ g=it.group; if(g) frag.appendChild(el("h3",{class:"mnv-group"},g)); ul=el("ul",{class:"mnv-list"}); frag.appendChild(ul); }
    const li=el("li"); li.appendChild(entry(it,"mnv-item")); ul.appendChild(li);
  });
  list.replaceChildren(frag);
}
const schedule=()=>{ if(!scheduled){ scheduled=true; requestAnimationFrame(render); } };

const background=()=>[document.querySelector(".topbar"),document.querySelector(".layout"),document.querySelector(".site-foot"),bar].filter(Boolean);
const focusables=()=>[...panel.querySelectorAll("button:not([disabled])")];

function open(from){
  if(!drawer.hidden) return;
  opener=from||document.activeElement;
  render();
  drawer.hidden=false;
  drawer.classList.toggle("side",tabletMQ.matches);
  document.body.classList.add("mnv-open");
  background().forEach(n=>n.inert=true);
  [moreBtn,menuBtn].forEach(b=>b.setAttribute("aria-expanded","true"));
  history.pushState({noriaMenu:1},""); pushed=true;
  requestAnimationFrame(()=>{ (panel.querySelector(".mnv-item.on")||closeBtn).focus(); });
}

function close(restore=true){
  if(drawer.hidden) return;
  drawer.hidden=true;
  document.body.classList.remove("mnv-open");
  background().forEach(n=>n.inert=false);
  [moreBtn,menuBtn].forEach(b=>b.setAttribute("aria-expanded","false"));
  if(pushed){ pushed=false; if(history.state&&history.state.noriaMenu) history.back(); }
  if(restore&&opener&&document.contains(opener)) opener.focus();
  opener=null;
}

function mode(){
  const m = phoneMQ.matches ? "phone" : tabletMQ.matches ? "tablet" : "desktop";
  document.documentElement.dataset.navMode=m;
  if(m==="desktop") close(false);
  drawer.classList.toggle("side",m==="tablet");
}

function keyboard(){
  // Clavier Android/iOS : la zone visible rétrécit ; on masque la barre du bas pour libérer la saisie.
  const vv=window.visualViewport; if(!vv) return;
  document.body.classList.toggle("kb-open", window.innerHeight - vv.height > 150);
}

function init(){
  nav=document.getElementById("nav"); if(!nav) return;
  bar=el("nav",{class:"mnv-bar",id:"mnvBar"});
  moreBtn=el("button",{type:"button",class:"mnv-tab mnv-more","aria-haspopup":"dialog","aria-expanded":"false","aria-controls":"mnvDrawer"});
  moreBtn.addEventListener("click",()=>open(moreBtn));
  menuBtn=el("button",{type:"button",class:"mnv-menu-btn","aria-haspopup":"dialog","aria-expanded":"false","aria-controls":"mnvDrawer"});
  menuBtn.addEventListener("click",()=>open(menuBtn));
  const top=document.querySelector(".topbar"); if(top) top.insertBefore(menuBtn,top.firstChild);

  drawer=el("div",{class:"mnv-drawer",id:"mnvDrawer"}); drawer.hidden=true;
  const backdrop=el("div",{class:"mnv-backdrop"}); backdrop.addEventListener("click",()=>close());
  panel=el("div",{class:"mnv-panel",role:"dialog","aria-modal":"true","aria-labelledby":"mnvTitle"});
  const head=el("div",{class:"mnv-head"});
  title=el("h2",{id:"mnvTitle"});
  closeBtn=el("button",{type:"button",class:"mnv-close"}); closeBtn.addEventListener("click",()=>close());
  head.append(title,closeBtn);
  list=el("div",{class:"mnv-scroll"});
  panel.append(head,list); drawer.append(backdrop,panel);
  document.body.append(bar,drawer);

  panel.addEventListener("keydown",e=>{
    if(e.key==="Escape"){ e.preventDefault(); close(); return; }
    if(e.key!=="Tab") return;
    const f=focusables(); if(!f.length) return;
    const first=f[0], last=f[f.length-1];
    if(e.shiftKey&&document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey&&document.activeElement===last){ e.preventDefault(); first.focus(); }
  });
  window.addEventListener("popstate",()=>{ if(pushed){ pushed=false; close(); } });
  new MutationObserver(schedule).observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
  const ls=document.getElementById("langSel"); if(ls) ls.addEventListener("change",schedule);
  phoneMQ.addEventListener("change",mode); tabletMQ.addEventListener("change",mode);
  if(window.visualViewport) visualViewport.addEventListener("resize",keyboard);
  mode(); render();
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();

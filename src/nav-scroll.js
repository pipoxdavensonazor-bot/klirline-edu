/* NORIA — navigation à onglets défilants sur téléphone et tablette :
   flèches et dégradés indiquent qu'il reste des onglets, l'onglet actif est ramené dans la vue. */
(function(){
"use strict";
function init(){
  const wrap=document.getElementById("navWrap"), nav=document.getElementById("nav");
  const prev=document.getElementById("navPrev"), next=document.getElementById("navNext");
  if(!wrap||!nav||!prev||!next) return;
  const horizontal=()=>getComputedStyle(nav).flexDirection==="row";
  function update(){
    const h=horizontal();
    const max=nav.scrollWidth-nav.clientWidth;
    const left=h&&nav.scrollLeft>8, right=h&&nav.scrollLeft<max-8;
    wrap.classList.toggle("can-left",left); wrap.classList.toggle("can-right",right);
    prev.hidden=!left; next.hidden=!right;
  }
  const step=dir=>nav.scrollBy({left:dir*Math.max(120,nav.clientWidth*0.7),behavior:"smooth"});
  prev.addEventListener("click",()=>step(-1)); next.addEventListener("click",()=>step(1));
  nav.addEventListener("scroll",update,{passive:true});
  window.addEventListener("resize",update);
  // La navigation est reconstruite à chaque rendu : on suit ses changements.
  let lastOn="";
  new MutationObserver(()=>{
    const on=nav.querySelector("button.on");
    const key=on?on.textContent:"";
    // Ne recentre que lorsque l'onglet actif change, et seulement s'il sort de la vue.
    if(horizontal()&&on&&key!==lastOn){
      const nr=nav.getBoundingClientRect(), br=on.getBoundingClientRect();
      if(br.left<nr.left+40||br.right>nr.right-40) nav.scrollLeft+=br.left-nr.left-48;
    }
    lastOn=key;
    update();
  }).observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
  update();
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();

// Vérifie la navigation sur 8 appareils émulés (téléphones, tablettes, ordinateur) : chaque section de chaque rôle
// doit être atteignable, cibles ≥ 44 px, fermeture Échap/fond/retour, pas de défilement horizontal, 0 erreur console.
// Usage : npm i puppeteer-core ; python3 -m http.server 8811 ; node scripts/verif-menu-appareils.js
const puppeteer=require('puppeteer-core');
const D=[["iphone-se",375,667,2,true],["iphone-14-pro",393,852,3,true],["pixel-7",412,915,2.625,true],["galaxy-s20",360,800,3,true],
 ["ipad-mini-portrait",768,1024,2,true],["ipad-mini-paysage",1024,768,2,true],["ipad-pro",1024,1366,2,true],["desktop",1280,800,1,false]];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--headless=new']});
 const report={};
 for(const [name,w,h,dpr,mob] of D){
  const p=await b.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('response',r=>{if(r.status()>=400)errs.push(r.status()+' '+r.url())});
  await p.setViewport({width:w,height:h,deviceScaleFactor:dpr,isMobile:mob,hasTouch:mob});
  await p.goto('http://127.0.0.1:8811/index.html',{waitUntil:'networkidle0'}); await p.evaluate(()=>localStorage.clear()); await p.reload({waitUntil:'networkidle0'});
  const modeName=await p.evaluate(()=>document.documentElement.dataset.navMode);
  const roles=await p.$$eval('#roleSel option',o=>o.map(x=>x.value)); const r={mode:modeName,roles:{},issues:[]};
  for(const role of roles){
   await p.select('#roleSel',role); await sleep(120);
   const labels=await p.$$eval('#nav > button',x=>x.map(b=>b.textContent.replace(/\s+/g,' ').trim()));
   let ok=0; const miss=[];
   for(const lab of labels){
    const res=await p.evaluate(async(lab,mode)=>{
      const S=ms=>new Promise(r=>setTimeout(r,ms));
      const find=sel=>[...document.querySelectorAll(sel)].find(b=>b.textContent.replace(/\s+/g,' ').trim()===lab&&b.offsetParent!==null);
      let t;
      if(mode==='desktop') t=find('#nav > button');
      else if(mode==='phone'){ t=find('#mnvBar .mnv-tab:not(.mnv-more)'); if(!t){ const m=document.querySelector('.mnv-more'); if(!m||m.offsetParent===null) return 'no-more'; m.click(); await S(60); t=find('.mnv-item'); } }
      else { const mb=document.querySelector('.mnv-menu-btn'); if(!mb||mb.offsetParent===null) return 'no-menu'; mb.click(); await S(60); t=find('.mnv-item'); }
      if(!t) return 'introuvable';
      const rc=t.getBoundingClientRect(); if(rc.height<44||rc.width<44) return 'cible '+Math.round(rc.width)+'x'+Math.round(rc.height);
      t.click(); await S(80);
      const src=[...document.querySelectorAll('#nav > button')].find(b=>b.textContent.replace(/\s+/g,' ').trim()===lab);
      if(!document.getElementById('mnvDrawer').hidden) return 'tiroir resté ouvert';
      if(document.documentElement.scrollWidth>innerWidth+1) return 'défilement horizontal';
      return src&&src.classList.contains('on')?'ok':'non active';
    },lab,modeName);
    if(res==='ok') ok++; else miss.push(lab+': '+res);
   }
   r.roles[role]=`${ok}/${labels.length}`; if(miss.length) r.issues.push(role+' → '+miss.join('; '));
  }
  // Fermetures : Échap, fond, retour ; focus rendu
  if(modeName!=='desktop'){
   await p.select('#roleSel','direction'); await sleep(150);
   const opener=modeName==='phone'?'.mnv-more':'.mnv-menu-btn';
   const isOpen=()=>p.evaluate(()=>!document.getElementById('mnvDrawer').hidden);
   await p.click(opener); await sleep(80); const a1=await isOpen(); await p.keyboard.press('Escape'); await sleep(80);
   const focusBack=await p.evaluate(s=>document.activeElement===document.querySelector(s),opener);
   r.escape=a1&&!(await isOpen())&&focusBack;
   await p.click(opener); await sleep(80); await p.mouse.click(w-5, modeName==='phone'?40:h/2); await sleep(80); r.fond=!(await isOpen());
   await p.click(opener); await sleep(80); await p.goBack().catch(()=>{}); await sleep(200); r.retour=!(await isOpen());
   r.ariaModal=await p.evaluate(()=>document.querySelector('.mnv-panel').getAttribute('aria-modal')==='true');
  }
  await p.select('#roleSel','direction'); await p.evaluate(()=>window.scrollTo(0,0)); await sleep(200);
  await p.screenshot({path:`/workspace/menu-${name}.png`});
  if(modeName!=='desktop'){ await p.click(modeName==='phone'?'.mnv-more':'.mnv-menu-btn'); await sleep(300); await p.screenshot({path:`/workspace/menu-${name}-plus.png`}); await p.keyboard.press('Escape'); }
  // Kreyòl
  await p.select('#langSel','ht'); await sleep(150);
  r.ht=await p.evaluate(m=>m==='desktop'?'-':m==='phone'?document.querySelector('.mnv-more').textContent:document.querySelector('.mnv-menu-btn').textContent,modeName);
  r.overflowX=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  r.errors=errs; report[name]=r; await p.close();
 }
 console.log(JSON.stringify(report,null,1)); await b.close();
})();

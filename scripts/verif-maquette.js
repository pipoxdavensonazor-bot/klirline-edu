// Vérification de la maquette dans Chrome headless : parcourt toutes les vues de tous les profils,
// puis injecte une ressource malveillante (URL javascript:, apostrophes) et vérifie qu'elle est neutralisée.
// Usage : npm i puppeteer-core ; python3 -m http.server 8811 ; node scripts/verif-maquette.js http://127.0.0.1:8811/index.html
const puppeteer=require('puppeteer-core');
(async()=>{
 const url=process.argv[2];
 const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--headless=new']});
 const p=await b.newPage(); const errs=[]; let dialogs=[];
 p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text())});
 p.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
 await p.goto(url,{waitUntil:'networkidle0'});
 const roles=await p.$$eval('#roleSel option',o=>o.map(x=>x.value)); let views=0;
 for(const r of roles){ await p.select('#roleSel',r); await new Promise(z=>setTimeout(z,100));
   const n=await p.$$eval('#nav button, #nav a',x=>x.length);
   for(let i=0;i<n;i++){ await p.evaluate(i=>{const x=[...document.querySelectorAll('#nav button, #nav a')][i]; x&&x.click();},i); await new Promise(z=>setTimeout(z,60)); views++; } }
 // Injection : ressource malveillante
 await p.evaluate(()=>{const k='klirline_ext_v1';const o=JSON.parse(localStorage.getItem(k));o.resources.unshift({id:"r'x",title:"T'</a><img src=x onerror=alert(9)>",org:"o",url:"javascript:alert(1)",verified:"2026-10-16",lang:"fr",levels:[],subjects:[],licence:"x",attrib:"x",access:"x",type:"ressource",fmt:"web",offline:false,size:"-",version:"web",status:"toCheck",note:"",hist:[]});localStorage.setItem(k,JSON.stringify(o));});
 await p.reload({waitUntil:'networkidle0'}); await p.select('#roleSel','direction');
 await p.evaluate(()=>window.KL&&KL.go&&KL.go('ext-biblio')); await new Promise(z=>setTimeout(z,300));
 const hrefs=await p.$$eval('a[href^="javascript:"]',x=>x.length);
 const btns=await p.$$eval(`[data-a0="s:r'x"]`,x=>x.length);
 const clickErr=errs.length;
 await p.evaluate(()=>{const x=document.querySelector(`[data-a0="s:r'x"]`); x&&x.click();}); await new Promise(z=>setTimeout(z,200));
 console.log(JSON.stringify({views,errors:errs.slice(0,8),errCount:errs.length,errsAfterClick:errs.length-clickErr,dialogs:dialogs.filter(d=>/^(1|9)$/.test(d)),javascriptHrefs:hrefs,escapedButtons:btns},null,1));
 await b.close();})();

/* NORIA — diffusion audio des réunions de parents (chargé à la demande par src/lot3.js).
   Direction : micro du téléphone → WHIP (WebRTC, Opus) vers /direct/whip/… (MediaMTX derrière Caddy) ; vu-mètre local,
   nombre d'auditeurs (sondage 10 s). Parents : liste HLS signée par NORIA, segments sur le domaine R2 ; Safari/iPhone
   lisent HLS nativement, les autres navigateurs chargent hls.js (src/vendor, ~120 Ko compressé, une seule fois).
   Données : AAC 32 kbit/s, ≈ 41 kbit/s avec l’enveloppe MPEG-TS mesurée ≈ 18 Mo par heure d’écoute. CSP stricte : aucun style ni gestionnaire en ligne.
   Prise de parole (audio seul, la direction seule ouvre un micro) : le parent lève la main (lot3), la direction clique
   « Donner la parole » ; la page du parent demande le micro et publie en WHIP (Opus mono ≈ 24 kbit/s) avec un jeton à
   usage unique. La direction lit cette voix en WHEP et la mélange à son micro (Web Audio) : les autres parents restent
   sur HLS. « Couper le micro » : le serveur révoque et expulse ; la direction cesse de mélanger. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const L=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const TX={
 fr:{title:"Diffusion audio",start:"Démarrer la diffusion",stop:"Arrêter",mic:"Niveau du micro",live:"En direct",off:"Diffusion arrêtée",
  starting:"Connexion…",listeners:n=>`${n} auditeur${n>1?"s":""} en ce moment`,micErr:"Micro refusé ou indisponible : autorisez le micro pour NORIA.",
  netErr:"Connexion au serveur de diffusion impossible.",notConf:"Diffusion intégrée non configurée sur ce serveur.",
  listen:"Écouter la réunion",wait:"La diffusion n'a pas encore commencé. Cette page se met à jour seule.",data:"≈ 18 Mo par heure (audio léger).",
  lost:"Son interrompu : nouvelle tentative…",hint:"Gardez l'écran allumé et le téléphone branché pendant la réunion.",
  floor:"Prise de parole",hands:"Mains levées",noHands:"Aucune main levée.",give:"Donner la parole",cut:"Couper le micro",
  speaking:"Parle (à l'antenne)",pending:"En attente du micro…",maxNote:n=>`Au plus ${n} parent${n>1?"s":""} au micro à la fois.`,
  pAucune:"Pour parler, levez la main : la direction vous donnera la parole.",pMain:"✋ Main levée — en attente. La direction vous donnera la parole.",
  pAsk:"La direction vous donne la parole : autorisez le micro…",pTalk:"🎙 Vous avez la parole — tout le monde vous entend (avec quelques secondes de retard).",
  pTalkNote:"Le son de la réunion est en pause pendant que vous parlez.",pStopTalk:"Arrêter de parler",pCut:"🔇 Micro coupé.",
  pFail:"Micro indisponible : levez la main à nouveau si vous voulez parler.",cutDone:"Micro coupé."},
 ht:{title:"Difizyon son",start:"Kòmanse difizyon an",stop:"Rete",mic:"Nivo mikwo a",live:"An dirèk",off:"Difizyon an rete",
  starting:"Koneksyon…",listeners:n=>`${n} moun ap koute kounye a`,micErr:"Mikwo a refize oswa li pa disponib : otorize mikwo a pou NORIA.",
  netErr:"Pa ka konekte ak sèvè difizyon an.",notConf:"Difizyon entegre a pa konfigire sou sèvè sa a.",
  listen:"Koute reyinyon an",wait:"Difizyon an poko kòmanse. Paj sa a ap mete l ajou poukont li.",data:"≈ 18 Mo pa èdtan (son lejè).",
  lost:"Son an koupe : n ap eseye ankò…",hint:"Kite ekran an limen epi telefòn nan branche pandan reyinyon an.",
  floor:"Pran lapawòl",hands:"Men ki leve",noHands:"Pèsonn pa leve men.",give:"Bay lapawòl",cut:"Koupe mikwo a",
  speaking:"Ap pale (an dirèk)",pending:"N ap tann mikwo a…",maxNote:n=>`${n} paran pou pi plis nan mikwo a an menm tan.`,
  pAucune:"Pou pale, leve men ou : direksyon an ap ba ou lapawòl.",pMain:"✋ Men leve — n ap tann. Direksyon an ap ba ou lapawòl.",
  pAsk:"Direksyon an ba ou lapawòl : otorize mikwo a…",pTalk:"🎙 Ou gen lapawòl — tout moun ap tande ou (ak kèk segonn reta).",
  pTalkNote:"Son reyinyon an an poz pandan w ap pale.",pStopTalk:"Sispann pale",pCut:"🔇 Mikwo koupe.",
  pFail:"Mikwo a pa disponib : leve men ou ankò si ou vle pale.",cutDone:"Mikwo koupe."}
};
const t=k=>TX[L()][k];
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.json(); }catch(e){} return {status:r.status,body:b};
}
let EL=null, MID=0, TIMER=0, RAF=0, PC=null, STREAM=null, ACTX=null, HLS=null, AUD=null;
// Direction : MIX = sortie du mélange (micro + voix des orateurs) envoyée en WHIP ; SPK = orateurs lus en WHEP.
let MIX=null, MIC=null, AN=null; const SPK=new Map();
// Parent : PPC/PSTREAM = sa propre publication quand la direction lui a donné la parole ; PT = sondage de /parole.
let PPC=null, PSTREAM=null, PT=0, PSTATE="aucune", PBUSY=false, PFAIL=false;
const alive=()=>EL&&EL.isConnected;
// La page de la réunion se redessine souvent (questions ouvertes/fermées, statut…) : on ne coupe le micro ou l'écoute
// que si la carte n'a pas été remontée peu après (on a vraiment quitté la réunion).
function gone(){ setTimeout(()=>{ if(!alive()){ const m=MID; release(); if(PPC) speakStop(m,false); if(HLS){ HLS.destroy(); HLS=null; } AUD=null; } },1500); }
function stopTimers(){ clearTimeout(TIMER); TIMER=0; clearTimeout(PT); PT=0; }

/* ---------- direction ---------- */
function director(state){
  EL.innerHTML=`<h3>${esc(t("title"))}</h3>
  <div class="toolbar">${state.active&&PC?`<span class="badge b-present" id="dxLive">● ${esc(t("live"))}</span><button class="soft" data-action="NORIA_DIRECT.stop" data-a0="n:${MID}">${esc(t("stop"))}</button>`
    :`<button id="dxStart" data-action="NORIA_DIRECT.start" data-a0="n:${MID}">${esc(t("start"))}</button>`}</div>
  <label class="fld small">${esc(t("mic"))}<meter id="dxMeter" min="0" max="1" low="0.15" high="0.85" optimum="0.5" value="0"></meter></label>
  <p class="small" id="dxCount">${esc(t("listeners")(state.auditeurs||0))}</p><div id="dxFloor"></div><p class="small mut">${esc(t("hint"))}</p>`;
  floor(state);
}
// Tableau de prise de parole : orateurs (Couper le micro) puis mains levées (Donner la parole).
function floor(state){
  const box=document.getElementById("dxFloor"); if(!box) return;
  if(!(state.active&&PC)){ box.innerHTML=""; return; }
  const ora=state.orateurs||[], mains=state.mains||[], max=state.parole_max||1, full=ora.length>=max;
  box.innerHTML=`<h4>${esc(t("floor"))}</h4>
  ${ora.map(o=>`<div class="row sp small" data-orateur="${o.uid}"><span><b>${esc(o.nom)}</b> <span class="badge ${o.etat==="parle"?"b-present":"b-borrowed"}">${esc(t(o.etat==="parle"?"speaking":"pending"))}</span></span><button class="warn" data-action="NORIA_DIRECT.cut" data-a0="n:${o.uid}">${esc(t("cut"))}</button></div>`).join("")}
  <h4>${esc(t("hands"))} (${mains.length})</h4>
  ${mains.map(h=>`<div class="row sp small" data-main="${h.uid}"><span>✋ <b>${esc(h.nom)}</b></span><button class="soft" data-action="NORIA_DIRECT.give" data-a0="n:${h.uid}" ${full?"disabled":""}>${esc(t("give"))}</button></div>`).join("")||`<p class="small mut">${esc(t("noHands"))}</p>`}
  <p class="small mut">${esc(t("maxNote")(max))}</p>`;
  sync(ora);
}
// WHEP : la direction lit chaque orateur « parle » et l'ajoute au mélange ; retire ceux qui ne sont plus listés.
function sync(ora){
  const want=new Map(ora.filter(o=>o.etat==="parle").map(o=>[o.chemin,o]));
  for(const [k,sp] of SPK) if(!want.has(k)) drop(k);
  for(const [k,o] of want) if(!SPK.has(k)) listenSpeaker(o);
}
function drop(k){ const sp=SPK.get(k); if(!sp) return; SPK.delete(k);
  try{ sp.pc.close(); }catch(e){} try{ sp.src&&sp.src.disconnect(); }catch(e){} if(sp.el){ sp.el.srcObject=null; sp.el.remove(); } }
async function listenSpeaker(o){
  if(!ACTX||!MIX) return;
  const sp={pc:new RTCPeerConnection({bundlePolicy:"max-bundle"}),src:null,el:null}; SPK.set(o.chemin,sp);
  try{
    sp.pc.addTransceiver("audio",{direction:"recvonly"});
    sp.pc.addEventListener("track",ev=>{ if(SPK.get(o.chemin)!==sp) return;
      const st=ev.streams[0]||new MediaStream([ev.track]);
      // Chrome ne sort le son d'un flux WebRTC dans Web Audio que s'il est aussi attaché à un élément média (muet ici).
      sp.el=document.createElement("audio"); sp.el.muted=true; sp.el.srcObject=st; sp.el.hidden=true; document.body.appendChild(sp.el); sp.el.play().catch(()=>{});
      sp.src=ACTX.createMediaStreamSource(st); sp.src.connect(MIX); sp.src.connect(ACTX.destination); });
    await sp.pc.setLocalDescription(await sp.pc.createOffer()); await iceDone(sp.pc);
    const w=await fetch(o.whep,{method:"POST",headers:{"content-type":"application/sdp",authorization:"Bearer "+o.jeton},body:sp.pc.localDescription.sdp});
    if(w.status!==201) throw new Error("whep "+w.status);
    await sp.pc.setRemoteDescription({type:"answer",sdp:await w.text()});
    sp.pc.addEventListener("connectionstatechange",()=>{ if(["failed","closed"].includes(sp.pc.connectionState)) drop(o.chemin); });
  }catch(e){ drop(o.chemin); } // nouvel essai au prochain sondage
}
async function give(uid){
  const r=await api(`/api/reunions-parents/${MID}/parole/${uid}/donner`,{method:"POST",body:"{}"}).catch(()=>null);
  if(!r||r.status!==200) toast((r&&r.body&&r.body.error)||t("netErr")); refresh();
}
async function cut(uid){
  const r=await api(`/api/reunions-parents/${MID}/parole/${uid}/couper`,{method:"POST",body:"{}"}).catch(()=>null);
  if(r&&r.status===200){ const row=document.querySelector(`[data-orateur="${uid}"]`); toast(t("cutDone")); if(row) row.remove(); }
  else toast((r&&r.body&&r.body.error)||t("netErr"));
  refresh();
}
function meter(){
  cancelAnimationFrame(RAF); RAF=0; const an=AN; if(!an) return;
  try{ const buf=new Uint8Array(an.fftSize);
    const loop=()=>{ if(!alive()) return; an.getByteTimeDomainData(buf); let s=0; for(const v of buf){ const x=(v-128)/128; s+=x*x; }
      const m=document.getElementById("dxMeter"); if(m) m.value=Math.min(1,Math.sqrt(s/buf.length)*4); RAF=requestAnimationFrame(loop); };
    loop(); }catch(e){}
}
function iceDone(pc){ return new Promise(ok=>{ if(pc.iceGatheringState==="complete") return ok(); const f=()=>{ if(pc.iceGatheringState==="complete"){ pc.removeEventListener("icegatheringstatechange",f); ok(); } }; pc.addEventListener("icegatheringstatechange",f); setTimeout(ok,2500); }); }
async function start(id){
  const b=document.getElementById("dxStart"); if(b){ b.disabled=true; b.textContent=t("starting"); }
  try{ STREAM=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},video:false}); }
  catch(e){ toast(t("micErr")); return refresh(); }
  // Mélange : micro → MIX (et vu-mètre) ; les voix des parents s'y ajoutent plus tard. MIX part en WHIP.
  try{ ACTX=new (window.AudioContext||window.webkitAudioContext)(); ACTX.resume().catch(()=>{}); MIX=ACTX.createMediaStreamDestination(); MIX.channelCount=1;
    MIC=ACTX.createMediaStreamSource(STREAM); MIC.connect(MIX); AN=ACTX.createAnalyser(); AN.fftSize=512; MIC.connect(AN); }
  catch(e){ release(); toast(t("micErr")); return refresh(); }
  const r=await api(`/api/reunions-parents/${id}/diffusion/demarrer`,{method:"POST",body:"{}"}).catch(()=>null);
  if(!r||r.status!==200){ release(); toast((r&&r.body&&r.body.error)||t("netErr")); return refresh(); }
  try{
    PC=new RTCPeerConnection({bundlePolicy:"max-bundle"});
    PC.addTransceiver(MIX.stream.getAudioTracks()[0],{direction:"sendonly",streams:[MIX.stream]});
    await PC.setLocalDescription(await PC.createOffer()); await iceDone(PC);
    const w=await fetch(r.body.whip,{method:"POST",headers:{"content-type":"application/sdp",authorization:"Bearer "+r.body.jeton},body:PC.localDescription.sdp});
    if(w.status!==201) throw new Error("whip "+w.status);
    await PC.setRemoteDescription({type:"answer",sdp:await w.text()});
    PC.addEventListener("connectionstatechange",()=>{ if(PC&&PC.connectionState==="failed") toast(t("netErr")); });
  }catch(e){ release(); toast(t("netErr")); await api(`/api/reunions-parents/${id}/diffusion/arreter`,{method:"POST",body:"{}"}).catch(()=>null); return refresh(); }
  refresh(); meter();
}
function release(){
  // Fermer la connexion WebRTC suffit : MediaMTX termine la session aussitôt (un DELETE WHIP arriverait après coup).
  if(PC){ try{ PC.close(); }catch(e){} PC=null; }
  for(const k of [...SPK.keys()]) drop(k);
  if(STREAM){ STREAM.getTracks().forEach(x=>x.stop()); STREAM=null; }
  if(ACTX){ ACTX.close().catch(()=>{}); ACTX=null; } MIX=null; MIC=null; AN=null;
  cancelAnimationFrame(RAF); RAF=0;
}
async function stop(id){ release(); await api(`/api/reunions-parents/${id}/diffusion/arreter`,{method:"POST",body:"{}"}).catch(()=>null); toast(t("off")); refresh(); }

/* ---------- parents ---------- */
async function play(liste){
  const a=document.getElementById("dxAudio"); if(!a) return;
  // hls.js d'abord dès que Media Source existe (Chrome, Firefox, Android, Safari ordinateur) : la lecture HLS native de
  // Chrome refuse l'audio AAC seul en MPEG-TS. Sans Media Source (iPhone) : lecture native de Safari.
  const mse=!!(window.MediaSource||window.ManagedMediaSource);
  if(!mse){ a.src=liste; return; }
  try{ if(!window.Hls) await window.NORIA_ECO.load("src/vendor/hls.light.min.js"); }catch(e){ a.src=liste; return; }
  if(!window.Hls||!window.Hls.isSupported()){ a.src=liste; return; }
  HLS=new window.Hls({enableWorker:false,liveSyncDurationCount:2,maxBufferLength:18,backBufferLength:12,manifestLoadingMaxRetry:6,levelLoadingMaxRetry:6,fragLoadingMaxRetry:6});
  const h=HLS;
  // Liste pas encore publiée (parent arrivé dans les premières secondes) ou réseau coupé : nouvel essai après 3 s.
  h.on(window.Hls.Events.ERROR,(_e,d)=>{ if(d.fatal){ const s=document.getElementById("dxState"); if(s) s.textContent=t("lost");
    if(d.type==="networkError") setTimeout(()=>{ if(HLS===h) h.loadSource(liste); },3000); else h.recoverMediaError(); } });
  h.on(window.Hls.Events.FRAG_BUFFERED,()=>{ const s=document.getElementById("dxState"); if(s&&s.textContent===t("lost")) s.textContent=t("data"); if(a.dataset.on==="1"&&a.paused&&!PPC) a.play().catch(()=>{}); });
  HLS.loadSource(liste); HLS.attachMedia(a);
}
function listener(state){
  if(state.active&&state.liste){
    if(AUD&&EL.contains(AUD)) return; // déjà en lecture
    const garde=AUD; EL.innerHTML=`<h3>${esc(t("listen"))}</h3><p class="small mut" id="dxState">${esc(t("data"))}</p><div id="dxParole" aria-live="polite"></div>`;
    // Page redessinée : même lecteur (retiré de la page, le navigateur l'a mis en pause ; on reprend sauf pause voulue).
    if(garde){ EL.insertBefore(garde,document.getElementById("dxState")); if(garde.dataset.on==="1") garde.play().catch(()=>{}); return; }
    AUD=document.createElement("audio"); AUD.id="dxAudio"; AUD.controls=true; AUD.preload="none"; EL.insertBefore(AUD,document.getElementById("dxState"));
    const A=AUD; A.addEventListener("playing",()=>{ A.dataset.on="1"; }); A.addEventListener("pause",()=>{ if(A.isConnected) A.dataset.on=""; });
    play(state.liste);
  } else { if(PPC) speakStop(MID,false); if(HLS){ HLS.destroy(); HLS=null; } AUD=null; EL.innerHTML=`<h3>${esc(t("listen"))}</h3><p class="mut">${esc(t(state.configuree===false?"notConf":"wait"))}</p>`; }
}

/* ---------- parent : prise de parole ---------- */
function paroleView(){
  const box=document.getElementById("dxParole"); if(!box) return;
  const st=PPC?"parle":PSTATE;
  const msg={aucune:"pAucune",main_levee:"pMain",accordee:"pAsk",parle:"pTalk",coupee:"pCut"}[st]||"pAucune";
  box.innerHTML=`<h4>${esc(t("floor"))}</h4><p class="small" id="dxParoleEtat" data-etat="${esc(st)}"><b>${esc(t(PFAIL&&st==="aucune"?"pFail":msg))}</b></p>
  ${st==="parle"?`<p class="small mut">${esc(t("pTalkNote"))}</p><meter id="dxPMeter" min="0" max="1" value="0"></meter> <button class="warn" id="dxPStop" data-action="NORIA_DIRECT.speakEnd">${esc(t("pStopTalk"))}</button>`:""}`;
}
// Opus de la voix du parent : mono, ≈ 24 kbit/s, FEC (pertes) et DTX (silence ≈ rien) — imposé dans la réponse SDP.
function opus24(sdp){
  const m=sdp.match(/a=rtpmap:(\d+) opus\/48000/i); if(!m) return sdp;
  const re=new RegExp(`a=fmtp:${m[1]} ([^\r\n]*)`);
  const extra="maxaveragebitrate=24000;stereo=0;sprop-stereo=0;useinbandfec=1;usedtx=1";
  if(re.test(sdp)) return sdp.replace(re,(_x,p)=>`a=fmtp:${m[1]} ${p.split(";").filter(x=>!/^(maxaveragebitrate|stereo|sprop-stereo|useinbandfec|usedtx)=/.test(x)).concat(extra).join(";")}`);
  return sdp.replace(m[0],`${m[0]}\r\na=fmtp:${m[1]} ${extra}`);
}
async function speakStart(g){
  if(PBUSY||PPC) return; PBUSY=true; PFAIL=false; paroleView();
  const id=MID;
  try{
    PSTREAM=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},video:false});
    const pc=new RTCPeerConnection({bundlePolicy:"max-bundle"});
    const tr=pc.addTransceiver(PSTREAM.getAudioTracks()[0],{direction:"sendonly",streams:[PSTREAM]});
    try{ const p=tr.sender.getParameters(); p.encodings=(p.encodings&&p.encodings.length?p.encodings:[{}]).map(e=>({...e,maxBitrate:24000})); await tr.sender.setParameters(p); }catch(e){}
    await pc.setLocalDescription(await pc.createOffer()); await iceDone(pc);
    const w=await fetch(g.whip,{method:"POST",headers:{"content-type":"application/sdp",authorization:"Bearer "+g.jeton},body:pc.localDescription.sdp});
    if(w.status!==201) throw new Error("whip "+w.status);
    await pc.setRemoteDescription({type:"answer",sdp:opus24(await w.text())});
    PPC=pc; pc.addEventListener("connectionstatechange",()=>{ if(PPC===pc&&["failed","closed"].includes(pc.connectionState)){ speakStop(id,true); PSTATE="aucune"; paroleView(); } });
    if(AUD){ AUD.dataset.avant=AUD.paused?"":"1"; AUD.pause(); } // sinon le parent s'entend avec 10 s de retard
  }catch(e){ PFAIL=true; if(PSTREAM){ PSTREAM.getTracks().forEach(x=>x.stop()); PSTREAM=null; } await api(`/api/reunions-parents/${id}/parole/arreter`,{method:"POST",body:"{}"}).catch(()=>null); PSTATE="aucune"; }
  PBUSY=false; paroleView(); pmeter();
}
function pmeter(){
  if(!PSTREAM||pmeter.on) return;
  try{ const ac=new (window.AudioContext||window.webkitAudioContext)(); const an=ac.createAnalyser(); an.fftSize=512; ac.createMediaStreamSource(PSTREAM).connect(an); const buf=new Uint8Array(512); pmeter.on=1;
    const loop=()=>{ if(!PSTREAM){ pmeter.on=0; ac.close().catch(()=>{}); return; } an.getByteTimeDomainData(buf); let s=0; for(const v of buf){ const x=(v-128)/128; s+=x*x; }
      const m=document.getElementById("dxPMeter"); if(m) m.value=Math.min(1,Math.sqrt(s/buf.length)*4); requestAnimationFrame(loop); };
    loop(); }catch(e){ pmeter.on=0; }
}
function speakStop(id,tell){
  if(PPC){ try{ PPC.close(); }catch(e){} PPC=null; }
  if(PSTREAM){ PSTREAM.getTracks().forEach(x=>x.stop()); PSTREAM=null; }
  if(AUD&&AUD.dataset.avant==="1"){ AUD.dataset.avant=""; AUD.play().catch(()=>{}); }
  if(tell) api(`/api/reunions-parents/${id}/parole/arreter`,{method:"POST",body:"{}"}).catch(()=>null);
}
async function speakEnd(){ speakStop(MID,true); PSTATE="aucune"; paroleView(); }
async function parole(){
  clearTimeout(PT); PT=0; if(!alive()||ROLE==="org") return;
  const r=await api(`/api/reunions-parents/${MID}/parole`).catch(()=>null); if(!alive()) return;
  const g=(r&&r.status===200&&r.body)||{etat:PSTATE};
  const prev=PSTATE; PSTATE=g.etat; void prev;
  if(g.etat==="accordee") speakStart(g);
  else if(g.etat==="parle"){ if(!PPC&&!PBUSY) speakStop(MID,true); } // page rechargée : on rend la parole proprement
  else if(PPC){ speakStop(MID,false); } // coupé par la direction (ou fin de diffusion)
  if(g.etat!=="aucune"||prev!=="aucune") PFAIL=PFAIL&&g.etat==="aucune";
  paroleView();
  if(document.getElementById("dxParole")) PT=setTimeout(parole,(["main_levee","accordee","parle"].includes(g.etat)||PPC)?3000:10000);
}
function poke(){ if(ROLE!=="org"&&alive()) parole(); }

let ROLE=null;
async function refresh(){
  stopTimers(); if(!alive()) return gone();
  const r=await api(`/api/reunions-parents/${MID}/diffusion`).catch(()=>null); if(!alive()) return gone();
  const s=(r&&r.status===200&&r.body)||{active:false};
  if(ROLE==="org"){ if(s.configuree===false){ EL.innerHTML=`<p class="small mut">${esc(t("notConf"))}</p>`; return; }
    if(document.getElementById("dxCount")&&(!!PC)===!!document.getElementById("dxLive")){ document.getElementById("dxCount").textContent=t("listeners")(s.auditeurs||0); floor(s); } else director(s); }
  else { listener(s); if(s.active&&s.liste) parole(); }
  if(s.configuree===false) return;
  // Direction en direct : 3 s (mains levées, orateurs) ; JSON de quelques centaines d'octets.
  TIMER=setTimeout(refresh,(ROLE==="org"?(PC?3:10):(s.active?60:15))*1000);
}
function mount(el,id,role){
  const same=id===MID&&role===ROLE;
  if(!same){ release(); if(HLS){ HLS.destroy(); HLS=null; } AUD=null; }
  if(!same&&PPC) speakStop(MID,true);
  EL=el; MID=id; ROLE=role; refresh().then(()=>{ if(same&&STREAM&&ROLE==="org") meter(); });
}
function toast(m){ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
window.addEventListener("pagehide",()=>{ release(); if(PPC) speakStop(MID,false); });
window.NORIA_DIRECT=Object.freeze({mount,start,stop,give,cut,speakEnd,poke});
})();

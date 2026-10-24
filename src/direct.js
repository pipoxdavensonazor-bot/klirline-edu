/* NORIA — diffusion audio des réunions de parents (chargé à la demande par src/lot3.js).
   Direction : micro du téléphone → WHIP (WebRTC, Opus) vers /direct/whip/… (MediaMTX derrière Caddy) ; vu-mètre local,
   nombre d'auditeurs (sondage 10 s). Parents : liste HLS signée par NORIA, segments sur le domaine R2 ; Safari/iPhone
   lisent HLS nativement, les autres navigateurs chargent hls.js (src/vendor, ~120 Ko compressé, une seule fois).
   Données : AAC 32 kbit/s, ≈ 41 kbit/s avec l’enveloppe MPEG-TS mesurée ≈ 18 Mo par heure d’écoute. CSP stricte : aucun style ni gestionnaire en ligne. */
(function(){
"use strict";
const esc=window.NORIA_U.esc;
const L=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const TX={
 fr:{title:"Diffusion audio",start:"Démarrer la diffusion",stop:"Arrêter",mic:"Niveau du micro",live:"En direct",off:"Diffusion arrêtée",
  starting:"Connexion…",listeners:n=>`${n} auditeur${n>1?"s":""} en ce moment`,micErr:"Micro refusé ou indisponible : autorisez le micro pour NORIA.",
  netErr:"Connexion au serveur de diffusion impossible.",notConf:"Diffusion intégrée non configurée sur ce serveur.",
  listen:"Écouter la réunion",wait:"La diffusion n'a pas encore commencé. Cette page se met à jour seule.",data:"≈ 18 Mo par heure (audio léger).",
  lost:"Son interrompu : nouvelle tentative…",hint:"Gardez l'écran allumé et le téléphone branché pendant la réunion."},
 ht:{title:"Difizyon son",start:"Kòmanse difizyon an",stop:"Rete",mic:"Nivo mikwo a",live:"An dirèk",off:"Difizyon an rete",
  starting:"Koneksyon…",listeners:n=>`${n} moun ap koute kounye a`,micErr:"Mikwo a refize oswa li pa disponib : otorize mikwo a pou NORIA.",
  netErr:"Pa ka konekte ak sèvè difizyon an.",notConf:"Difizyon entegre a pa konfigire sou sèvè sa a.",
  listen:"Koute reyinyon an",wait:"Difizyon an poko kòmanse. Paj sa a ap mete l ajou poukont li.",data:"≈ 18 Mo pa èdtan (son lejè).",
  lost:"Son an koupe : n ap eseye ankò…",hint:"Kite ekran an limen epi telefòn nan branche pandan reyinyon an."}
};
const t=k=>TX[L()][k];
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.json(); }catch(e){} return {status:r.status,body:b};
}
let EL=null, MID=0, TIMER=0, RAF=0, PC=null, STREAM=null, ACTX=null, HLS=null, AUD=null;
const alive=()=>EL&&EL.isConnected;
// La page de la réunion se redessine souvent (questions ouvertes/fermées, statut…) : on ne coupe le micro ou l'écoute
// que si la carte n'a pas été remontée peu après (on a vraiment quitté la réunion).
function gone(){ setTimeout(()=>{ if(!alive()){ release(); if(HLS){ HLS.destroy(); HLS=null; } AUD=null; } },1500); }
function stopTimers(){ clearTimeout(TIMER); TIMER=0; cancelAnimationFrame(RAF); RAF=0; }

/* ---------- direction ---------- */
function director(state){
  EL.innerHTML=`<h3>${esc(t("title"))}</h3>
  <div class="toolbar">${state.active&&PC?`<span class="badge b-present" id="dxLive">● ${esc(t("live"))}</span><button class="soft" data-action="NORIA_DIRECT.stop" data-a0="n:${MID}">${esc(t("stop"))}</button>`
    :`<button id="dxStart" data-action="NORIA_DIRECT.start" data-a0="n:${MID}">${esc(t("start"))}</button>`}</div>
  <label class="fld small">${esc(t("mic"))}<meter id="dxMeter" min="0" max="1" low="0.15" high="0.85" optimum="0.5" value="0"></meter></label>
  <p class="small" id="dxCount">${esc(t("listeners")(state.auditeurs||0))}</p><p class="small mut">${esc(t("hint"))}</p>`;
}
function meter(stream){
  try{ ACTX=new (window.AudioContext||window.webkitAudioContext)(); const src=ACTX.createMediaStreamSource(stream); const an=ACTX.createAnalyser(); an.fftSize=512; src.connect(an);
    const buf=new Uint8Array(an.fftSize);
    const loop=()=>{ if(!alive()) return; an.getByteTimeDomainData(buf); let s=0; for(const v of buf){ const x=(v-128)/128; s+=x*x; }
      const m=document.getElementById("dxMeter"); if(m) m.value=Math.min(1,Math.sqrt(s/buf.length)*4); RAF=requestAnimationFrame(loop); };
    loop(); }catch(e){}
}
function iceDone(pc){ return new Promise(ok=>{ if(pc.iceGatheringState==="complete") return ok(); const f=()=>{ if(pc.iceGatheringState==="complete"){ pc.removeEventListener("icegatheringstatechange",f); ok(); } }; pc.addEventListener("icegatheringstatechange",f); setTimeout(ok,2500); }); }
async function start(id){
  const b=document.getElementById("dxStart"); if(b){ b.disabled=true; b.textContent=t("starting"); }
  try{ STREAM=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},video:false}); }
  catch(e){ toast(t("micErr")); return refresh(); }
  const r=await api(`/api/reunions-parents/${id}/diffusion/demarrer`,{method:"POST",body:"{}"}).catch(()=>null);
  if(!r||r.status!==200){ release(); toast((r&&r.body&&r.body.error)||t("netErr")); return refresh(); }
  try{
    PC=new RTCPeerConnection({bundlePolicy:"max-bundle"});
    PC.addTransceiver(STREAM.getAudioTracks()[0],{direction:"sendonly",streams:[STREAM]});
    await PC.setLocalDescription(await PC.createOffer()); await iceDone(PC);
    const w=await fetch(r.body.whip,{method:"POST",headers:{"content-type":"application/sdp",authorization:"Bearer "+r.body.jeton},body:PC.localDescription.sdp});
    if(w.status!==201) throw new Error("whip "+w.status);
    await PC.setRemoteDescription({type:"answer",sdp:await w.text()});
    PC.addEventListener("connectionstatechange",()=>{ if(PC&&PC.connectionState==="failed") toast(t("netErr")); });
  }catch(e){ release(); toast(t("netErr")); await api(`/api/reunions-parents/${id}/diffusion/arreter`,{method:"POST",body:"{}"}).catch(()=>null); return refresh(); }
  refresh(); meter(STREAM);
}
function release(){
  // Fermer la connexion WebRTC suffit : MediaMTX termine la session aussitôt (un DELETE WHIP arriverait après coup).
  if(PC){ try{ PC.close(); }catch(e){} PC=null; }
  if(STREAM){ STREAM.getTracks().forEach(x=>x.stop()); STREAM=null; }
  if(ACTX){ ACTX.close().catch(()=>{}); ACTX=null; }
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
  HLS.on(window.Hls.Events.ERROR,(_e,d)=>{ if(d.fatal){ const s=document.getElementById("dxState"); if(s) s.textContent=t("lost"); if(d.type==="networkError") HLS.startLoad(); else HLS.recoverMediaError(); } });
  HLS.loadSource(liste); HLS.attachMedia(a);
}
function listener(state){
  if(state.active&&state.liste){
    if(AUD&&EL.contains(AUD)) return; // déjà en lecture
    const garde=AUD; EL.innerHTML=`<h3>${esc(t("listen"))}</h3><p class="small mut" id="dxState">${esc(t("data"))}</p>`;
    // Page redessinée : même lecteur (retiré de la page, le navigateur l'a mis en pause ; on reprend sauf pause voulue).
    if(garde){ EL.insertBefore(garde,EL.lastChild); if(garde.dataset.on==="1") garde.play().catch(()=>{}); return; }
    AUD=document.createElement("audio"); AUD.id="dxAudio"; AUD.controls=true; AUD.preload="none"; EL.insertBefore(AUD,EL.lastChild);
    const A=AUD; A.addEventListener("playing",()=>{ A.dataset.on="1"; }); A.addEventListener("pause",()=>{ if(A.isConnected) A.dataset.on=""; });
    play(state.liste);
  } else { if(HLS){ HLS.destroy(); HLS=null; } AUD=null; EL.innerHTML=`<h3>${esc(t("listen"))}</h3><p class="mut">${esc(t(state.configuree===false?"notConf":"wait"))}</p>`; }
}

let ROLE=null;
async function refresh(){
  stopTimers(); if(!alive()) return gone();
  const r=await api(`/api/reunions-parents/${MID}/diffusion`).catch(()=>null); if(!alive()) return gone();
  const s=(r&&r.status===200&&r.body)||{active:false};
  if(ROLE==="org"){ if(s.configuree===false){ EL.innerHTML=`<p class="small mut">${esc(t("notConf"))}</p>`; return; }
    if(document.getElementById("dxCount")&&(!!PC)===!!document.getElementById("dxLive")){ document.getElementById("dxCount").textContent=t("listeners")(s.auditeurs||0); } else director(s); }
  else listener(s);
  if(s.configuree===false) return;
  TIMER=setTimeout(refresh,(ROLE==="org"?10:(s.active?60:15))*1000);
}
function mount(el,id,role){
  const same=id===MID&&role===ROLE;
  if(!same){ release(); if(HLS){ HLS.destroy(); HLS=null; } AUD=null; }
  EL=el; MID=id; ROLE=role; refresh().then(()=>{ if(same&&STREAM&&ROLE==="org"){ if(ACTX){ ACTX.close().catch(()=>{}); ACTX=null; } meter(STREAM); } });
}
function toast(m){ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
window.addEventListener("pagehide",release);
window.NORIA_DIRECT=Object.freeze({mount,start,stop});
})();

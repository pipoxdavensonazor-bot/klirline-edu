/* NORIA — Lot 3 (mode serveur) : messagerie familles ↔ école, réunions de parents à grande audience, inscriptions en
   ligne (côté école), mon badge (codes-barres générés par le serveur NORIA, sans service extérieur).
   Données légères : listes sans corps de message, sondages espacés (10 s en direct, 60 s avant, pause onglet caché,
   recul ×2 en cas d'erreur). CSP stricte : aucun style ni gestionnaire en ligne. */
(function(){
"use strict";
const esc=window.NORIA_U.esc, safeUrl=window.NORIA_U.safeUrl;
const L=()=>{ const s=document.getElementById("langSel"); return s&&s.value==="ht"?"ht":"fr"; };
const TX={
 fr:{err:"Refusé : ",net:"Réseau nécessaire.",saved:"Enregistré.",refresh:"Actualiser",back:"← Retour",none:"Rien pour le moment.",
  msgT:"Messages avec l'école",msgIntro:"Écrivez à la direction ou au secrétariat. Réponse dans votre portail ; avis par Telegram ou e-mail si l'école l'a activé (sans le contenu du message).",
  msgStaff:"Réception des messages",msgStaffIntro:"Messages des parents et élèves de l'école. Ouvrir un fil le marque comme lu.",
  newMsg:"Nouveau message",subj:"Sujet",child:"Enfant concerné (facultatif)",body:"Message",att:"Pièce jointe (PDF, JPEG ou PNG, 200 Ko au plus)",send:"Envoyer",reply:"Répondre",
  unread:n=>`${n} non lu${n>1?"s":""}`,closed:"Clos",open:"Ouvert",closeT:"Clore le fil",reopen:"Rouvrir",seen:"Lu par l'école",seenFam:"Lu par la famille",you:"Vous",school:"École",
  all:"Tous",tooBig:"Pièce trop lourde (200 Ko au plus).",
  meetT:"Réunions de parents",meetIntro:"Grande audience : seuls les intervenants entrent dans la salle Jitsi ; les parents écoutent le flux audio (léger) et posent leurs questions ici.",
  newMeet:"Nouvelle réunion",title:"Titre",start:"Date et heure",cls:"Classe (vide = toute l'école)",mode:"Mode",audio:"Audio seul",video:"Vidéo basse définition",
  stream:"Lien du flux (https://… .m3u8, Icecast ou Owncast)",speakers:"Intervenants",create:"Créer",st:{prevue:"Prévue",en_cours:"En direct",terminee:"Terminée"},
  begin:"Démarrer",end:"Terminer",listen:"Écouter",openStream:"Ouvrir le flux",speakerRoom:"Salle des intervenants (Jitsi)",audioRoom:"Rejoindre en audio seul (Jitsi)",
  noStream:"Le flux n'est pas encore disponible.",expected:n=>`${n} parent${n>1?"s":""} attendu${n>1?"s":""}`,ask:"Poser une question",askBtn:"Envoyer la question",
  hand:"Lever la main",lower:"Baisser la main",handUp:"Votre main est levée.",answers:"Réponses",moderation:"Modération",questions:"Questions",hands:"Mains levées",
  answer:"Réponse",publish:"Publier la réponse",dismiss:"Écarter",present:(n,a)=>`${n} présent(s), ${a} actif(s)`,csv:"Présences (CSV)",qaOpen:"Questions ouvertes",qaClosed:"Questions fermées",
  candT:"Inscriptions en ligne",candIntro:"Ouvrez une campagne : le public dépose une demande sur la page de l'école (FR et Kreyòl). Vous acceptez, mettez en liste d'attente ou refusez ; l'acceptation crée l'élève.",
  campaign:"Campagne",openCamp:"Ouvrir les inscriptions",info:"Informations (pièces demandées, frais…)",levels:"Niveaux proposés (séparés par des virgules)",from:"Début",to:"Fin",
  closeCamp:"Fermer",reopenCamp:"Rouvrir",link:"Lien public",apps:"Demandes",cst:{recue:"Reçue",liste_attente:"Liste d'attente",acceptee:"Acceptée",refusee:"Refusée"},
  accept:"Accepter",wait:"Liste d'attente",refuse:"Refuser",note:"Note / motif",classFor:"Classe d'inscription",guardian:"Responsable",docs:"Pièces",view:"Voir",
  created:(c,e)=>`Élève créé : ${c}${e?` — adresse ${e}`:""}`,
  badgeT:"Mon badge",badgeIntro:"Carte d'élève avec code QR (vérification) et code-barres Code128 du code élève, générés par NORIA. Montrez-la à l'entrée ou à la bibliothèque.",
  code:"Code élève",valid:"Valable jusqu'au",pdf:"Télécharger le PDF",noBadge:"Pas encore de badge imprimé : voici votre code-barres provisoire.",email:"Adresse NORIA"},
 ht:{err:"Refize : ",net:"Fò gen rezo.",saved:"Anrejistre.",refresh:"Rafrechi",back:"← Retounen",none:"Anyen pou kounye a.",
  msgT:"Mesaj ak lekòl la",msgIntro:"Ekri direksyon an oswa sekretarya a. Repons lan ap nan pòtay ou ; avi pa Telegram oswa imèl si lekòl la aktive l (san kontni mesaj la).",
  msgStaff:"Resepsyon mesaj",msgStaffIntro:"Mesaj paran ak elèv lekòl la. Lè ou louvri yon fil, li make li.",
  newMsg:"Nouvo mesaj",subj:"Sijè",child:"Pitit ki konsène (si ou vle)",body:"Mesaj",att:"Dokiman (PDF, JPEG oswa PNG, 200 Ko pi plis)",send:"Voye",reply:"Reponn",
  unread:n=>`${n} pa li`,closed:"Fèmen",open:"Louvri",closeT:"Fèmen fil la",reopen:"Relouvri",seen:"Lekòl la li l",seenFam:"Fanmi an li l",you:"Ou",school:"Lekòl",
  all:"Tout",tooBig:"Dokiman an twò lou (200 Ko pi plis).",
  meetT:"Reyinyon paran",meetIntro:"Gwo odyans : se entèvenan yo sèlman ki antre nan sal Jitsi a ; paran yo koute son an (lejè) epi poze kesyon isit la.",
  newMeet:"Nouvo reyinyon",title:"Tit",start:"Dat ak lè",cls:"Klas (vid = tout lekòl la)",mode:"Mòd",audio:"Son sèlman",video:"Videyo ba kalite",
  stream:"Lyen difizyon an (https://… .m3u8, Icecast oswa Owncast)",speakers:"Entèvenan",create:"Kreye",st:{prevue:"Prevwa",en_cours:"An dirèk",terminee:"Fini"},
  begin:"Kòmanse",end:"Fini",listen:"Koute",openStream:"Louvri difizyon an",speakerRoom:"Sal entèvenan (Jitsi)",audioRoom:"Antre ak son sèlman (Jitsi)",
  noStream:"Difizyon an poko disponib.",expected:n=>`${n} paran ap tann`,ask:"Poze yon kesyon",askBtn:"Voye kesyon an",
  hand:"Leve men",lower:"Bese men",handUp:"Men ou leve.",answers:"Repons",moderation:"Moderasyon",questions:"Kesyon",hands:"Men leve",
  answer:"Repons",publish:"Pibliye repons lan",dismiss:"Mete sou kote",present:(n,a)=>`${n} prezan, ${a} aktif`,csv:"Prezans (CSV)",qaOpen:"Kesyon ouvè",qaClosed:"Kesyon fèmen",
  candT:"Enskripsyon sou entènèt",candIntro:"Louvri yon kanpay : piblik la depoze yon demann sou paj lekòl la (FR ak Kreyòl). Ou aksepte, mete sou lis datant oswa refize ; lè ou aksepte, elèv la kreye.",
  campaign:"Kanpay",openCamp:"Louvri enskripsyon",info:"Enfòmasyon (papye, frè…)",levels:"Nivo (separe ak vigil)",from:"Kòmansman",to:"Fen",
  closeCamp:"Fèmen",reopenCamp:"Relouvri",link:"Lyen piblik",apps:"Demann",cst:{recue:"Resevwa",liste_attente:"Lis datant",acceptee:"Aksepte",refusee:"Refize"},
  accept:"Aksepte",wait:"Lis datant",refuse:"Refize",note:"Nòt / rezon",classFor:"Klas",guardian:"Responsab",docs:"Dokiman",view:"Gade",
  created:(c,e)=>`Elèv kreye : ${c}${e?` — adrès ${e}`:""}`,
  badgeT:"Badj mwen",badgeIntro:"Kat elèv ak kòd QR (verifikasyon) ak kòd ba Code128 kòd elèv la, NORIA fè yo. Montre l nan pòtay la oswa nan bibliyotèk la.",
  code:"Kòd elèv",valid:"Bon jiska",pdf:"Telechaje PDF la",noBadge:"Badj ou poko enprime : men kòd ba pwovizwa ou.",email:"Adrès NORIA"}
};
const t=k=>TX[L()][k];
async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts,headers:{"content-type":"application/json","x-noria":"1",...(opts.headers||{})}});
  let b=null; try{ b=await r.json(); }catch(e){} return {status:r.status,body:b};
}
const send=(m,p,b)=>api(p,{method:m,body:JSON.stringify(b||{})}).catch(()=>null);
const get=p=>api(p).catch(()=>null);
function toast(m){ const c=document.getElementById("toasts"); if(!c) return; const d=document.createElement("div"); d.textContent=m; c.appendChild(d); setTimeout(()=>d.remove(),4000); }
const errOf=r=>t("err")+((r&&r.body&&r.body.error)||t("net"));
const fmt=iso=>{ try{ return new Date(iso).toLocaleString(L()==="ht"?"fr-HT":"fr-CA",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}); }catch(e){ return iso; } };
const fd=f=>Object.fromEntries(new FormData(f).entries());
let ROOT=null, VIEW=null, TIMER=null, CURMEET=null, SINCE=0, FAILS=0;
const alive=()=>ROOT&&ROOT.isConnected;
function stop(){ if(TIMER){ clearTimeout(TIMER); TIMER=null; } }
const head=(title,intro)=>`<div class="u8 card"><h2>${esc(title)}</h2><p class="small mut">${esc(intro)}</p></div>`;

/* ---------- messagerie ---------- */
let MSG=null, FILTER="";
async function messages(){
  const r=await get("/api/messagerie"+(FILTER?"?statut="+FILTER:""));
  if(!alive()) return;
  if(!r||r.status!==200){ ROOT.innerHTML=`<div class="badbox">${esc(errOf(r))}</div>`; return; }
  MSG=r.body; const s=MSG.ecole;
  ROOT.innerHTML=head(s?t("msgStaff"):t("msgT"),s?t("msgStaffIntro"):t("msgIntro"))+
  (!s?`<details class="u8 card" open><summary><b>${esc(t("newMsg"))}</b></summary><form id="l3New" data-action-submit="NORIA_L3.newThread" novalidate>
    <label class="fld">${esc(t("subj"))}<input name="sujet" maxlength="140" required></label>
    ${MSG.enfants.length?`<label class="fld">${esc(t("child"))}<select name="student_id"><option value=""></option>${MSG.enfants.map(e=>`<option value="${e.id}">${esc(e.first_name+" "+e.last_name)}</option>`).join("")}</select></label>`:""}
    <label class="fld">${esc(t("body"))}<textarea name="message" rows="4" maxlength="2000" required></textarea></label>
    <label class="fld">${esc(t("att"))}<input name="piece" type="file" accept="application/pdf,image/jpeg,image/png"></label>
    <button type="submit">${esc(t("send"))}</button></form></details>`:`<div class="u8 toolbar">${[["",t("all")],["ouvert",t("open")],["clos",t("closed")]].map(([k,l])=>`<button class="${FILTER===k?"":"soft"}" data-action="NORIA_L3.filter" data-a0="s:${k}">${esc(l)}</button>`).join("")}</div>`)+
  `<div class="u8 card"><table class="tbl"><tbody>${MSG.fils.length?MSG.fils.map(f=>`<tr><td><button class="link" data-action="NORIA_L3.thread" data-a0="n:${f.id}"><b>${esc(f.subject)}</b></button>${f.non_lus?` <span class="badge b-borrowed">${esc(t("unread")(f.non_lus))}</span>`:""}
    <div class="small mut">${s?esc(f.famille)+(f.el_prenom?" · "+esc(f.el_prenom+" "+f.el_nom):""):""}</div></td><td class="small">${esc(fmt(f.last_at))}</td><td>${f.status==="clos"?`<span class="badge b-pending">${esc(t("closed"))}</span>`:""}</td></tr>`).join(""):`<tr><td class="mut">${esc(t("none"))}</td></tr>`}</tbody></table></div>`;
}
function fileB64(file){ return new Promise((ok,ko)=>{ const r=new FileReader(); r.onload=()=>ok(String(r.result).split(",")[1]); r.onerror=ko; r.readAsDataURL(file); }); }
async function piece(form){
  const f=form.querySelector('input[type="file"]'); const file=f&&f.files&&f.files[0]; if(!file) return null;
  if(file.size>200*1024){ toast(t("tooBig")); throw new Error("big"); }
  return {nom:file.name,data:await fileB64(file)};
}
async function newThread(){
  const f=document.getElementById("l3New"); const b=fd(f); let p; try{ p=await piece(f); }catch(e){ return; }
  const r=await send("POST","/api/messagerie",{sujet:b.sujet,message:b.message,student_id:b.student_id?Number(b.student_id):undefined,piece:p||undefined});
  if(!r||r.status!==200) return toast(errOf(r));
  toast(t("saved")); thread(r.body.id);
}
async function thread(id){
  stop(); const r=await get("/api/messagerie/"+id); if(!alive()) return;
  if(!r||r.status!==200) return toast(errOf(r));
  const th=r.body, s=th.ecole;
  ROOT.innerHTML=`<div class="u8 toolbar"><button class="soft" data-action="NORIA_L3.go" data-a0="s:messages">${esc(t("back"))}</button></div>
  <div class="u8 card"><h2>${esc(th.sujet)}</h2><p class="small mut">${esc(th.famille||"")} · ${esc(th.statut==="clos"?t("closed"):t("open"))}</p>
  ${th.messages.map(m=>{ const mine=(m.side==="ecole")===s; return `<div class="card ${mine?"l3-mine":"l3-other"}"><div class="small mut">${esc(mine?t("you"):(m.side==="ecole"?t("school"):m.auteur))} · ${esc(fmt(m.created_at))}${mine&&m.id<=th.lu_jusqua?` · ✓ ${esc(s?t("seenFam"):t("seen"))}`:""}</div>
    <p class="l3-body">${esc(m.body)}</p>${m.att_name?`<a class="small" href="/api/messagerie/${th.id}/piece/${m.id}" download>📎 ${esc(m.att_name)} (${Math.ceil(m.att_size/1024)} Ko)</a>`:""}</div>`; }).join("")}
  ${th.statut!=="clos"?`<form id="l3Rep" data-action-submit="NORIA_L3.reply" data-a0="n:${th.id}" novalidate><label class="fld">${esc(t("reply"))}<textarea name="message" rows="3" maxlength="2000" required></textarea></label>
    <label class="fld">${esc(t("att"))}<input name="piece" type="file" accept="application/pdf,image/jpeg,image/png"></label><button type="submit">${esc(t("send"))}</button></form>`:""}
  ${s?`<div class="toolbar"><button class="soft" data-action="NORIA_L3.closeThread" data-a0="n:${th.id}" data-a1="s:${th.statut==="clos"?"rouvrir":"clore"}">${esc(th.statut==="clos"?t("reopen"):t("closeT"))}</button></div>`:""}</div>`;
}
async function reply(id){
  const f=document.getElementById("l3Rep"); let p; try{ p=await piece(f); }catch(e){ return; }
  const r=await send("POST",`/api/messagerie/${id}/repondre`,{message:fd(f).message,piece:p||undefined});
  if(!r||r.status!==200) return toast(errOf(r)); thread(id);
}
async function closeThread(id,act){ const r=await send("POST",`/api/messagerie/${id}/${act}`); if(!r||r.status!==200) return toast(errOf(r)); thread(id); }

/* ---------- réunions de parents ---------- */
let MEET=null;
async function meetings(){
  stop(); CURMEET=null;
  const r=await get("/api/reunions-parents"); if(!alive()) return;
  if(!r||r.status!==200){ ROOT.innerHTML=`<div class="badbox">${esc(errOf(r))}</div>`; return; }
  MEET=r.body; const st=t("st");
  ROOT.innerHTML=head(t("meetT"),t("meetIntro"))+
  (MEET.organisateur?`<details class="u8 card"><summary><b>${esc(t("newMeet"))}</b></summary><form id="l3Meet" data-action-submit="NORIA_L3.createMeet" novalidate><div class="grid g2">
    <label class="fld">${esc(t("title"))}<input name="titre" maxlength="140" required></label><label class="fld">${esc(t("start"))}<input name="debut" type="datetime-local" required></label>
    <label class="fld">${esc(t("cls"))}<select name="class_id"><option value=""></option>${MEET.classes.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
    <label class="fld">${esc(t("mode"))}<select name="mode"><option value="audio">${esc(t("audio"))}</option><option value="video_basse">${esc(t("video"))}</option></select></label>
    <label class="fld">${esc(t("stream"))}<input name="flux" type="url" placeholder="https://"></label><label class="fld">${esc(t("speakers"))}<input name="intervenants" maxlength="300"></label>
    </div><button type="submit">${esc(t("create"))}</button></form></details>`:"")+
  `<div class="u8 grid g2">${MEET.reunions.length?MEET.reunions.map(m=>`<div class="card"><h3>${esc(m.titre)}</h3><p class="small mut">${esc(fmt(m.debut))} · ${esc(m.classe||"")} ${esc(t("expected")(m.attendus))}</p>
    <span class="badge ${m.statut==="en_cours"?"b-present":m.statut==="terminee"?"b-pending":"b-borrowed"}">${esc(st[m.statut])}</span>
    <div class="toolbar"><button data-action="NORIA_L3.meeting" data-a0="n:${m.id}">${esc(m.statut==="en_cours"?t("listen"):t("view"))}</button></div></div>`).join(""):`<p class="mut">${esc(t("none"))}</p>`}</div>`;
}
async function createMeet(){
  const b=fd(document.getElementById("l3Meet"));
  const r=await send("POST","/api/reunions-parents",{titre:b.titre,debut:b.debut?new Date(b.debut).toISOString():"",class_id:b.class_id?Number(b.class_id):undefined,mode:b.mode,flux:b.flux||undefined,intervenants:b.intervenants||undefined});
  if(!r||r.status!==200) return toast(errOf(r)); toast(t("saved")); meeting(r.body.id);
}
async function meeting(id){
  stop(); SINCE=0; FAILS=0;
  const m=(MEET&&MEET.reunions.find(x=>x.id===id))||null;
  if(!m){ await meetings(); return; }
  CURMEET=m; const st=t("st"); const fx=m.flux&&safeUrl(m.flux);
  ROOT.innerHTML=`<div class="u8 toolbar"><button class="soft" data-action="NORIA_L3.go" data-a0="s:reunions">${esc(t("back"))}</button></div>
  <div class="u8 card"><h2>${esc(m.titre)}</h2><p class="small mut">${esc(fmt(m.debut))} · <span id="l3St">${esc(st[m.statut])}</span> · ${esc(t("expected")(m.attendus))}${m.intervenants?" · "+esc(m.intervenants):""}</p>
  ${m.salle_intervenants?`<p><a class="btn" href="${esc(m.salle_intervenants)}" target="_blank" rel="noopener">${esc(t("speakerRoom"))}</a></p>`:""}
  ${MEET.intervenant?"":(fx?`<audio controls preload="none" src="${esc(fx)}"></audio><p><a class="small" href="${esc(fx)}" target="_blank" rel="noopener">${esc(t("openStream"))}</a></p>`:m.salle_audio?`<p><a class="btn" href="${esc(m.salle_audio)}" target="_blank" rel="noopener">${esc(t("audioRoom"))}</a></p>`:`<p class="mut">${esc(t("noStream"))}</p>`)}
  ${MEET.organisateur?`<div class="toolbar">${m.statut!=="en_cours"?`<button data-action="NORIA_L3.meetSet" data-a0="n:${m.id}" data-a1="s:en_cours">${esc(t("begin"))}</button>`:""}${m.statut!=="terminee"?`<button class="soft" data-action="NORIA_L3.meetSet" data-a0="n:${m.id}" data-a1="s:terminee">${esc(t("end"))}</button>`:""}
    <button class="soft" data-action="NORIA_L3.meetQa" data-a0="n:${m.id}" data-a1="n:${m.questions_ouvertes?0:1}">${esc(m.questions_ouvertes?t("qaClosed"):t("qaOpen"))}</button><a class="btn btn-o" href="/api/reunions-parents/${m.id}/presences.csv" download>${esc(t("csv"))}</a></div>`:""}</div>
  ${MEET.intervenant?`<div class="u8 card"><h3>${esc(t("moderation"))}</h3><div id="l3Mod"><p class="mut">…</p></div></div>`
   :`<div class="u8 card"><h3>${esc(t("ask"))}</h3><form id="l3Q" data-action-submit="NORIA_L3.ask" data-a0="n:${m.id}" novalidate><textarea name="texte" rows="2" maxlength="500"></textarea><div class="toolbar"><button type="submit">${esc(t("askBtn"))}</button><button type="button" class="soft" id="l3Hand" data-action="NORIA_L3.hand" data-a0="n:${m.id}">${esc(t("hand"))}</button></div></form></div>`}
  <div class="u8 card"><h3>${esc(t("answers"))}</h3><div id="l3Ans"><p class="mut">${esc(t("none"))}</p></div></div>`;
  tick();
}
// Sondage espacé : l'intervalle vient du serveur ; onglet caché → pause ; erreurs → recul ×2 jusqu'à 5 min.
async function tick(){
  stop(); if(!alive()||!CURMEET) return;
  if(document.hidden){ TIMER=setTimeout(tick,15000); return; }
  const id=CURMEET.id;
  const r=await get(`/api/reunions-parents/${id}/etat?depuis=${SINCE}`);
  if(!alive()||!CURMEET||CURMEET.id!==id) return;
  let wait;
  if(!r||r.status!==200){ FAILS++; wait=Math.min(300,10*2**FAILS); }
  else { FAILS=0; const s=r.body;
    const box=document.getElementById("l3Ans");
    if(s.reponses.length){ if(SINCE===0) box.innerHTML=""; box.insertAdjacentHTML("beforeend",s.reponses.map(a=>`<div class="card"><p><b>${esc(a.body)}</b></p><p>${esc(a.answer)}</p></div>`).join("")); SINCE=s.reponses[s.reponses.length-1].id; }
    const h=document.getElementById("l3Hand"); if(h) h.textContent=s.main_levee?t("lower"):t("hand"), h.dataset.up=s.main_levee?"1":"";
    const stl=document.getElementById("l3St"); if(stl) stl.textContent=t("st")[s.statut];
    if(MEET.intervenant) await moderation(id);
    wait=s.prochain_sondage; if(!wait) return; }
  TIMER=setTimeout(tick,wait*1000);
}
async function moderation(id){
  const r=await get(`/api/reunions-parents/${id}/moderation`); const box=document.getElementById("l3Mod"); if(!box||!r||r.status!==200) return;
  const m=r.body;
  box.innerHTML=`<p class="small">${esc(t("present")(m.presents,m.actifs))}</p><h4>${esc(t("hands"))} (${m.mains.length})</h4>${m.mains.map(q=>`<div class="toolbar"><span>✋ ${esc(q.parent)}</span><button class="soft small" data-action="NORIA_L3.answerQ" data-a0="n:${id}" data-a1="n:${q.id}" data-a2="s:ecartee">${esc(t("lower"))}</button></div>`).join("")}
  <h4>${esc(t("questions"))} (${m.questions.length})</h4>${m.questions.map(q=>`<div class="card"><p><b>${esc(q.parent)}</b> : ${esc(q.body)}</p><input id="l3A${q.id}" maxlength="500" placeholder="${esc(t("answer"))}"><div class="toolbar"><button class="small" data-action="NORIA_L3.answerQ" data-a0="n:${id}" data-a1="n:${q.id}" data-a2="s:repondue">${esc(t("publish"))}</button><button class="soft small" data-action="NORIA_L3.answerQ" data-a0="n:${id}" data-a1="n:${q.id}" data-a2="s:ecartee">${esc(t("dismiss"))}</button></div></div>`).join("")}`;
}
async function answerQ(id,qid,statut){
  const i=document.getElementById("l3A"+qid);
  const r=await send("POST",`/api/reunions-parents/${id}/questions/${qid}`,{statut,reponse:i?i.value:undefined});
  if(!r||r.status!==200) return toast(errOf(r)); moderation(id);
}
async function ask(id){ const f=document.getElementById("l3Q"); const r=await send("POST",`/api/reunions-parents/${id}/question`,{texte:fd(f).texte}); if(!r||r.status!==200) return toast(errOf(r)); f.reset(); toast(t("saved")); }
async function hand(id){ const h=document.getElementById("l3Hand"); const up=h&&h.dataset.up==="1"; const r=await send("POST",`/api/reunions-parents/${id}/${up?"baisser":"main"}`); if(!r||r.status!==200) return toast(errOf(r)); if(h){ h.dataset.up=up?"":"1"; h.textContent=up?t("hand"):t("lower"); } if(!up) toast(t("handUp")); }
async function meetSet(id,statut){ const r=await send("PUT",`/api/reunions-parents/${id}`,{statut}); if(!r||r.status!==200) return toast(errOf(r)); await meetings(); meeting(id); }
async function meetQa(id,on){ const r=await send("PUT",`/api/reunions-parents/${id}`,{questions_ouvertes:!!on}); if(!r||r.status!==200) return toast(errOf(r)); await meetings(); meeting(id); }

/* ---------- inscriptions en ligne (école) ---------- */
let CAND=null;
async function candidatures(){
  const r=await get("/api/candidatures"); if(!alive()) return;
  if(!r||r.status!==200){ ROOT.innerHTML=`<div class="badbox">${esc(errOf(r))}</div>`; return; }
  CAND=r.body; const open=CAND.campagnes.find(c=>c.status==="ouverte"); const cs=t("cst");
  ROOT.innerHTML=head(t("candT"),t("candIntro"))+
  `<div class="u8 card"><h3>${esc(t("campaign"))}</h3>${open?`<p><b>${esc(open.title)}</b> · ${esc(open.opens_on)} → ${esc(open.closes_on)}</p><p class="small">${esc(t("link"))} : <a href="${esc(CAND.lien_fr)}" target="_blank" rel="noopener">${esc(location.origin+CAND.lien_fr)}</a> · <a href="${esc(CAND.lien_ht)}" target="_blank" rel="noopener">Kreyòl</a></p>
    <button class="soft" data-action="NORIA_L3.camp" data-a0="n:${open.id}" data-a1="s:fermer">${esc(t("closeCamp"))}</button>`
   :`<form id="l3Camp" data-action-submit="NORIA_L3.openCamp" novalidate><div class="grid g2"><label class="fld">${esc(t("title"))}<input name="titre" maxlength="140" value="${esc(L()==="ht"?"Enskripsyon ouvè":"Inscriptions ouvertes")}"></label>
    <label class="fld">${esc(t("levels"))}<input name="niveaux" maxlength="400"></label><label class="fld">${esc(t("from"))}<input name="debut" type="date"></label><label class="fld">${esc(t("to"))}<input name="fin" type="date" required></label></div>
    <label class="fld">${esc(t("info"))}<textarea name="info" rows="2" maxlength="2000"></textarea></label><button type="submit">${esc(t("openCamp"))}</button></form>`}</div>
  <div class="u8 card"><h3>${esc(t("apps"))} (${CAND.dossiers.length})</h3><table class="tbl"><thead><tr><th>Réf.</th><th>${esc(t("candT").split(" ")[0])}</th><th>${esc(t("guardian"))}</th><th></th><th></th></tr></thead><tbody>
  ${CAND.dossiers.map(d=>`<tr><td class="small">${esc(d.ref)}</td><td><b>${esc(d.first_name+" "+d.last_name)}</b><div class="small mut">${esc(d.level||"")} ${esc(d.birth_date||"")}</div></td><td class="small">${esc(d.guardian_name)}<br>${esc(d.guardian_phone||d.guardian_email||"")}</td>
    <td><span class="badge ${d.status==="acceptee"?"b-present":d.status==="refusee"?"b-pending":"b-borrowed"}">${esc(cs[d.status])}</span>${d.pieces?` 📎${d.pieces}`:""}</td><td><button class="soft small" data-action="NORIA_L3.app" data-a0="n:${d.id}">${esc(t("view"))}</button></td></tr>`).join("")||`<tr><td colspan="5" class="mut">${esc(t("none"))}</td></tr>`}</tbody></table></div>`;
}
async function openCamp(){ const r=await send("POST","/api/candidatures/campagnes",fd(document.getElementById("l3Camp"))); if(!r||r.status!==200) return toast(errOf(r)); toast(t("saved")); candidatures(); }
async function camp(id,act){ const r=await send("POST",`/api/candidatures/campagnes/${id}/${act}`); if(!r||r.status!==200) return toast(errOf(r)); candidatures(); }
async function app(id){
  const r=await get("/api/candidatures/"+id); if(!alive()) return; if(!r||r.status!==200) return toast(errOf(r));
  const a=r.body, cs=t("cst"), done=a.status==="acceptee"||a.status==="refusee";
  ROOT.innerHTML=`<div class="u8 toolbar"><button class="soft" data-action="NORIA_L3.go" data-a0="s:candidatures">${esc(t("back"))}</button></div>
  <div class="u8 card"><h2>${esc(a.first_name+" "+a.last_name)} <span class="badge b-borrowed">${esc(cs[a.status])}</span></h2><p class="small mut">${esc(a.ref)} · ${esc(fmt(a.created_at))} · ${esc(a.lang)}</p>
  <dl class="grid g2"><div><dt>Naissance</dt><dd>${esc(a.birth_date||"—")} ${esc(a.sex||"")}</dd></div><div><dt>Niveau</dt><dd>${esc(a.level||"—")}</dd></div><div><dt>École précédente</dt><dd>${esc(a.previous_school||"—")}</dd></div>
  <div><dt>${esc(t("guardian"))}</dt><dd>${esc(a.guardian_name)} (${esc(a.guardian_relation)}) · ${esc(a.guardian_phone||"")} ${esc(a.guardian_email||"")}</dd></div></dl>
  ${a.message?`<p class="l3-body">${esc(a.message)}</p>`:""}
  ${a.pieces.length?`<h3>${esc(t("docs"))}</h3><ul>${a.pieces.map(p=>`<li><a href="/api/candidatures/${a.id}/pieces/${p.id}?voir=1" target="_blank" rel="noopener">${esc(p.name)}</a> (${Math.ceil(p.size/1024)} Ko)</li>`).join("")}</ul>`:""}
  ${a.decision_note?`<p class="small">${esc(t("note"))} : ${esc(a.decision_note)}</p>`:""}
  ${done?"":`<form id="l3Dec" novalidate><div class="grid g2"><label class="fld">${esc(t("classFor"))}<select name="class_id">${CAND.classes.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label><label class="fld">${esc(t("note"))}<input name="note" maxlength="300"></label></div>
  <div class="toolbar"><button type="button" data-action="NORIA_L3.decide" data-a0="n:${a.id}" data-a1="s:accepter">${esc(t("accept"))}</button><button type="button" class="soft" data-action="NORIA_L3.decide" data-a0="n:${a.id}" data-a1="s:attente">${esc(t("wait"))}</button><button type="button" class="soft" data-action="NORIA_L3.decide" data-a0="n:${a.id}" data-a1="s:refuser">${esc(t("refuse"))}</button></div></form>`}</div>`;
}
async function decide(id,decision){
  const b=fd(document.getElementById("l3Dec"));
  const r=await send("POST",`/api/candidatures/${id}/decision`,{decision,class_id:Number(b.class_id),note:b.note});
  if(!r||r.status!==200) return toast(errOf(r));
  if(r.body.code) toast(t("created")(r.body.code,r.body.email)); else toast(t("saved"));
  app(id);
}

/* ---------- mon badge ---------- */
async function badge(){
  const r=await get("/api/badges/moi"); if(!alive()) return;
  if(!r||r.status!==200){ ROOT.innerHTML=`<div class="badbox">${esc(errOf(r))}</div>`; return; }
  const b=r.body;
  const ph=x=>x.photo?`<img class="l3-ph" src="${esc(x.photo)}" alt="" width="120" height="160">`:`<span class="l3-ph l3-noph" aria-hidden="true">${esc(((x.first_name||"?")[0]+(x.last_name||"?")[0]).toUpperCase())}</span>`;
  // Les SVG viennent du serveur NORIA (rectangles et texte échappé uniquement).
  ROOT.innerHTML=head(t("badgeT"),t("badgeIntro"))+`<div class="u8 grid g2">${b.badges.map(x=>`<div class="card l3-badge"><div class="l3-who">${ph(x)}<div><h3>${esc(x.first_name+" "+x.last_name)}</h3><p class="small mut">${esc(x.class_name||"")} · ${esc(x.year||"")}</p></div></div>
    <div class="l3-qr">${x.qr_svg}</div><div class="l3-bar">${x.code128_svg}</div><p><b>${esc(t("code"))} :</b> ${esc(x.code)}</p><p class="small">${esc(t("valid"))} ${esc(x.expires_on)}</p>
    ${x.email?`<p class="small">${esc(t("email"))} : ${esc(x.email)}</p>`:""}<a class="btn" href="/api/badges/moi/${x.id}/pdf" download>${esc(t("pdf"))}</a></div>`).join("")}
  ${b.sans_badge.map(x=>`<div class="card l3-badge"><div class="l3-who">${ph(x)}<div><h3>${esc(x.first_name+" "+x.last_name)}</h3><p class="small mut">${esc(t("noBadge"))}</p></div></div><div class="l3-bar">${x.code128_svg}</div><p><b>${esc(t("code"))} :</b> ${esc(x.code)}</p></div>`).join("")}</div>`;
}

const VIEWS={messages,reunions:meetings,candidatures,badge};
function render(el,view){ ROOT=el; stop(); VIEW=view; el.innerHTML='<p class="mut">…</p>'; (VIEWS[view]||messages)(); }
function go(view){ render(ROOT,view); }
document.addEventListener("visibilitychange",()=>{ if(!document.hidden&&CURMEET&&alive()) tick(); });
window.NORIA_L3=Object.freeze({render,go,filter:k=>{ FILTER=k; messages(); },thread,newThread,reply,closeThread,meeting,createMeet,meetSet,meetQa,ask,hand,answerQ,openCamp,camp,app,decide});
})();

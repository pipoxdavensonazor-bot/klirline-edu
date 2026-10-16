/* NORIA — utilitaires partagés de sécurité (chargé avant les autres scripts). */
(function(){
"use strict";
// Échappement HTML : texte et attributs entre guillemets doubles ou simples.
function esc(s){ return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
// Valeur placée dans une chaîne JS entre apostrophes, elle-même dans un attribut HTML (onclick="f('…')").
// Le navigateur décode les entités HTML avant d'exécuter le JS : on échappe donc d'abord pour JS
// (\xNN, qui survit au décodage HTML), puis pour HTML.
function jsa(s){ return esc(String(s??"").replace(/[\\'"<>&\n\r\u2028\u2029]/g,c=>{ const n=c.charCodeAt(0); return n>255?"\\u"+n.toString(16):"\\x"+n.toString(16).padStart(2,"0"); })); }
// N'accepte que les URL https: absolues. Renvoie "" sinon.
function safeUrl(u){ try{ const x=new URL(String(u??"").trim()); return x.protocol==="https:"?x.href:""; }catch(e){ return ""; } }
window.NORIA_U = Object.freeze({ esc, jsa, safeUrl });
})();

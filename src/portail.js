/* NORIA — portail public : seul script de la page (aucun traceur). Les anciens liens de l'application
   (/#verifier=…, /#invitation=…, /#recuperation=…, /#admin) et l'application installée (ouverte sur /) sont
   renvoyés vers /app, où ils fonctionnent comme avant. */
"use strict";
(function () {
  var h = location.hash;
  var installed = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  if ((h && h.length > 1 && h !== "#contenu") || (installed && location.pathname === "/")) location.replace("/app" + h);
})();
/* En-tête : « Mon compte » et « Se déconnecter » si un compte grand public est connecté (témoin noria_pub_in, sans
   valeur secrète ; la session elle-même reste dans un cookie HttpOnly). Jamais de lien vers les portails des écoles. */
(function () {
  if (/(?:^|;\s*)noria_pub_in=1(?:;|$)/.test(document.cookie)) document.documentElement.classList.add("pub-in");
})();

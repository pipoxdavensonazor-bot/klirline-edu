/* Klirline extensions — données (ADDITIF). Clé isolée klirline_ext_v1 ; lecture seule sur klirline_school_v1. */
(function(){
const LSX = "klirline_ext_v1";
const LSO = "klirline_school_v1";
function readOld(){ try{ const o = JSON.parse(localStorage.getItem(LSO)); if(o && o.v===1 && o.students) return o; }catch(e){} return null; }
function seedRes(){
  const R = (id,title,org,url,lang,levels,subjects,licence,access,type,fmt,off,note,costs,plus)=>({id,title,org,url,verified:"2026-10-01",lang,levels,subjects,licence,attrib:org,access,type,fmt,offline:off,size:"—",version:"web",status:"toCheck",note:note||"",costs:costs||null,...(plus||{}),hist:[{at:"2026-10-01",by:"seed",info:"fiche créée (source candidate PRD, à vérifier)"}]});
  return [
    R("r-pratic","PRATIC — plateforme de ressources éducatives","MENFP","https://www.menfp.gouv.ht/","fr",["7e AF","8e AF","9e AF","NS1","NS2"],["Toutes"],"Lien officiel — demander partenariat, aucun droit de copie supposé","ext_auth","portail","web",false,"Ne pas supposer d'API ni de droit de copie."),
    R("r-mit","Platfòm MIT-Ayiti — ressources en créole","MIT OpenCourseWare","https://ocw.mit.edu/courses/res-24-002-mit-haiti-initiative-inisyativ-mit-ayiti-spring-2023/","ht",["7e AF","8e AF","9e AF"],["Français / Kreyòl","Histoire-Géo"],"Vérifier conditions propres à chaque fichier","ext_auth","plans de leçon, livres illustrés","web+pdf",true,"Livres illustrés téléchargeables mentionnés ; vérifier fichier par fichier."),
    R("r-story","Storybooks Haiti — 40 histoires + audio","Storybooks / Global-ASP","https://global-asp.github.io/storybooks-haiti/","ht",["7e AF","8e AF"],["Français / Kreyòl"],"Ressource éducative libre — confirmer licence du format choisi","ext_adapt","contes audio+texte","web+audio",true,"Texte et audio en créole, français et autres langues d'Haïti."),
    R("r-lakou","Lakou Kajou — banque de ressources","Lakou Kajou","https://lakoukajou.ht/en/educators/educational-resource-bank/","ht",["7e AF","8e AF","9e AF"],["Toutes"],"Examiner conditions d'accès/export/réutilisation avec l'organisme","ext_auth","banque de ressources","web",false,"Distribuée notamment avec Kolibri."),
    R("r-nectar","NectarEduProfHaïti — formation enseignants","MENFP / Réseau Canopé","https://menfp.reseau-canope.fr/?lang=fr&redirect=0","fr",["NS1","NS2"],["Toutes"],"Lien externe par défaut, sauf autorisation explicite","ext_link","formation","web",false,"Piste formation des enseignants."),
    R("r-openstax","OpenStax K–12 Math","OpenStax","https://openstax.org/k12/math","fr",["7e AF","8e AF","9e AF"],["Mathématiques"],"Ouvert — vérifier alignement programme haïtien + langue + licence","ext_adapt","manuels","web+pdf",true,"Complément maths ; vérifier alignement."),
    R("r-futur","Haiti Futur — ressources éducatives","Haiti Futur","https://www.haitifutur.com/ressources/","fr",["7e AF","8e AF","9e AF","NS1"],["Toutes"],"Confirmer droits et compatibilité avant publication","ext_auth","ressources","web",false,"À examiner."),
    R("r-edulib","EDUlib — cours en ligne (HEC Montréal)","EDUlib","https://catalogue.edulib.org/fr/faq/","fr",["NS1","NS2"],["Toutes"],"Lien externe — vérifier conditions par cours ; cours gratuit ≠ certificat gratuit","ext_link","cours","web",false,"Certains certificats vérifiés peuvent être payants ou soumis à conditions.",{cours:"Gratuit (selon cours)",attest:"—",cert:"Payant possible"},{eval:"En ligne (selon cours)",badge:"—",ident:"Vérification d'identité possible pour certificat",issuer:"EDUlib / établissement partenaire",recog:"Reconnaissance déclarée par la source, à revalider — jamais un diplôme national",duree:"Variable selon cours",session:"Sessions datées (à vérifier)",age:"— (vérifier par cours)",prerequis:"Selon cours (à vérifier)"}),
    R("r-fun","FUN-MOOC — cours en ligne","France Université Numérique","https://www.fun-mooc.fr/fr/faq/","fr",["NS1","NS2"],["Toutes"],"Lien externe — vérifier conditions par cours ; cours gratuit ≠ certificat gratuit","ext_link","cours","web",false,"Formations gratuites ; certificats vérifiés parfois payants.",{cours:"Gratuit (selon cours)",attest:"—",cert:"Payant possible"},{eval:"En ligne (selon cours)",badge:"Badge éventuel selon cours",ident:"Vérification d'identité possible pour certificat",issuer:"FUN / établissement du cours",recog:"Reconnaissance déclarée par la source, à revalider — jamais un diplôme national",duree:"Variable selon cours",session:"Sessions datées (à vérifier)",age:"— (vérifier par cours)",prerequis:"Selon cours (à vérifier)"}),
    R("r-kolibri","Kolibri — apprentissage hors ligne (à évaluer)","Learning Equality","https://learningequality.org/kolibri/about-kolibri/","fr",["7e AF","8e AF","9e AF","NS1"],["Toutes"],"Évaluer comme partenaire/solution hors ligne — vérifier contenus, langues, adéquation Haïti avant toute promesse","ext_auth","plateforme hors-ligne","app",true,"Conçue pour fonctionner sans Internet ; contenus à valider.",null,{eval:"Quiz/exercices assignés (à valider)",badge:"—",ident:"—",issuer:"Learning Equality",recog:"Piste hors-ligne à évaluer : contenus, langues créole/français, licences, matériel, support",duree:"Parcours auto-rythmés",session:"En continu (hors-ligne)",age:"Tous niveaux (contenus à valider)",prerequis:"Matériel + contenus installés"}),
  ];
}
function defaults(){
  return {
    v:1, queue:[],
    homework:[{id:"hw-demo",classId:"c7a",subject:"Mathématiques",title:"Exercice : fractions équivalentes",instructions:"Écrivez deux fractions égales à 1/2 et expliquez en une phrase.",due:"2026-10-20",file:"",at:"2026-10-15 08:30",by:"enseignant",st:"synced",subs:[]}], movements:[], emergency:{}, sibX:[],
    attCorr:[], prefs:{}, avis:[],
    sched:[], channels:[
      {id:"papier",label:"Papier",cost:"Impression",consent:0},
      {id:"whatsapp",label:"WhatsApp",cost:"Données (~1 Mo/mois)",consent:0},
      {id:"sms",label:"SMS",cost:"~5 G/msg (opérateur)",consent:0},
      {id:"email",label:"Courriel",cost:"Données",consent:0}
    ], rsvp:{},
    schedules:{}, bourses:[], refunds:[],
    resources:seedRes(), lists:[], packs:[],
    users:[], actCodes:[], groups:[],
    calPub:{}, calHist:[], calProp:[], drafts:{},
    continuite:[], replans:[], classrooms:[],
    meetings:[{id:"m-demo",classId:"c7a",title:"Fractions au tableau",subject:"Mathématiques",date:"2026-10-15",time:"09:00",agenda:"Revoir le numérateur et le dénominateur. Un exercice au tableau, puis les questions dans la discussion de la classe.",by:"enseignant",status:"open",external:"",present:["e1"]}],
    threads:[{id:"th-demo",classId:"c7a",title:"Questions sur les fractions",posts:[
      {id:"p1",role:"enseignant",sid:"",text:"Déposez ici une question sur le cours. La direction peut masquer un message.",at:"2026-10-15 08:40",hidden:false},
      {id:"p2",role:"eleve",sid:"e1",text:"Est-ce que 1/2 et 2/4 représentent la même quantité ?",at:"2026-10-15 08:55",hidden:false}
    ]}],
    discParentWrite:false,
    portals:null,
    cfg:{ campuses:[], sections:{}, subjects:[], periods:[], scale:null },
    audit:[]
  };
}
function loadX(){
  try{ const o = JSON.parse(localStorage.getItem(LSX)); if(o && o.v===1) { const d = defaults(); for(const k of Object.keys(d)) if(o[k]===undefined) o[k]=d[k];
    // migration : ajoute les ressources candidates ajoutées après coup, sans toucher le reste
    const have = new Set((o.resources||[]).map(r=>r.id));
    defaults().resources.forEach(r=>{ if(!have.has(r.id)) o.resources.push(r); });
    // complète les fiches cours existantes (champs émetteur/évaluation/reconnaissance) sans toucher le reste
    defaults().resources.filter(r=>r.issuer).forEach(r=>{ const cur=(o.resources||[]).find(x=>x.id===r.id); if(cur){ ["eval","badge","ident","issuer","recog","duree","session","age","prerequis"].forEach(k=>{ if(cur[k]===undefined) cur[k]=r[k]; }); } });
    if(!Array.isArray(o.homework)) o.homework=[];
    if(!o.homework.some(h=>h&&h.id==="hw-demo")) o.homework.push(defaults().homework[0]);
    if(!Array.isArray(o.calProp)) o.calProp=[];
    if(!o.drafts||typeof o.drafts!=="object") o.drafts={};
    return o; } }catch(e){}
  const d = defaults(); try{ localStorage.setItem(LSX, JSON.stringify(d)); }catch(e2){}
  return d;
}
function saveX(x){ try{ localStorage.setItem(LSX, JSON.stringify(x)); }catch(e){} }
function uid(p){ return (p||"x")+Date.now().toString(36)+Math.floor(Math.random()*999); }
window.KLXD = { LSX, LSO, readOld, loadX, saveX, uid };
})();

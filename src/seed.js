/* Klirline seed — données synthétiques haïtiennes */
window.KL_SEED = function(){
  const firstM=["Jean","Pierre","Jacques","Luckson","Widson","Anderson","Ricardo","Jefferson","Stanley","Mackenson","Emmanuel","Junior","Roobens","Carl","Wendy"];
  const firstF=["Marie","Rose","Naïka","Wideline","Ketia","Lovely","Christina","Sabine","Micheline","Vanessa","Emmanuela","Claudia","Berline","Djenika","Ashley"];
  const last=["Jean-Baptiste","Pierre-Louis","Joseph","Saint-Fleur","Dorvil","Lubin","Charles","Augustin","Antoine","Célestin","Marcadieu","Bien-Aimé","Louissaint","Toussaint","Napoléon","Edouard","Florestal","Gédéon"];
  const subs=[
    {id:"fr",name:"Français / Kreyòl",coef:4},{id:"math",name:"Mathématiques",coef:4},
    {id:"svt",name:"SVT",coef:2},{id:"hist",name:"Histoire-Géo",coef:2},{id:"ang",name:"Anglais",coef:2},{id:"eps",name:"EPS",coef:1}
  ];
  const levels=["7e AF","8e AF","9e AF","NS1","NS2"];
  const classes=[
    {id:"c7a",level:"7e AF",name:"7e A",campus:"Delmas",teacherId:"t1",room:"Salle 3"},
    {id:"c8a",level:"8e AF",name:"8e A",campus:"Delmas",teacherId:"t1",room:"Salle 5"},
    {id:"c9a",level:"9e AF",name:"9e A",campus:"Pétion-Ville",teacherId:"t2",room:"Salle 2"},
    {id:"cns1",level:"NS1",name:"NS1 S",campus:"Delmas",teacherId:"t3",room:"Salle 8"},
  ];
  const rnd=(a,b)=>Math.floor(a+Math.random()*(b-a+1));
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const students=[];
  let n=0;
  classes.forEach(c=>{
    const count=c.id==="c7a"?14:c.id==="c8a"?12:10;
    for(let i=0;i<count;i++){
      n++;
      const girl=Math.random()<0.5;
      const fn=girl?pick(firstF):pick(firstM);
      const ln=pick(last);
      students.push({
        id:"e"+n, code:"KL-2025-"+String(n).padStart(3,"0"),
        firstName:fn,lastName:ln,sex:girl?"F":"M",
        birth:`${rnd(2008,2015)}-${String(rnd(1,12)).padStart(2,"0")}-${String(rnd(1,28)).padStart(2,"0")}`,
        level:c.level,classId:c.id,campus:c.campus,status:"inscrit",
        guardians:[{name:pick(firstF)+" "+ln,link:girl?"Manman":"Papa",phone:`+509 34${rnd(10,99)} ${rnd(10,99)} ${rnd(10,99)}`}],
        siblings:n%7===0?["e"+(n-1)]:[],address:pick(["Delmas 33","Pétion-Ville","Carrefour","Tabarre","Cité Soleil"]),
        year:"2025-2026",createdAt:"2025-09-12"
      });
    }
  });
  const staff=[
    {id:"d1",name:"Mme. Claire Étienne",role:"direction"},
    {id:"s1",name:"M. Jonas Paul",role:"secretariat"},
    {id:"t1",name:"M. Luckner Dorval",role:"enseignant",classes:["c7a","c8a"]},
    {id:"t2",name:"Mme. Nadia Sainvil",role:"enseignant",classes:["c9a"]},
    {id:"t3",name:"M. Gary Mésidor",role:"enseignant",classes:["cns1"]},
    {id:"f1",name:"Mme. Rosette Jean",role:"comptable"},
    {id:"b1",name:"M. Képler Aubourg",role:"bibliothecaire"},
  ];
  const fees={ "7e AF":{tuition:25000,tranches:[8000,8000,9000]}, "8e AF":{tuition:25000,tranches:[8000,8000,9000]}, "9e AF":{tuition:28000,tranches:[10000,9000,9000]}, "NS1":{tuition:32000,tranches:[11000,11000,10000]}, "NS2":{tuition:32000,tranches:[11000,11000,10000]} };
  const payments=[
    {id:"p1",studentId:"e1",amount:8000,method:"Espèces",ref:"REC-0001",date:"2025-10-02",by:"f1"},
    {id:"p2",studentId:"e3",amount:8000,method:"Chèque",ref:"REC-0002",date:"2025-10-03",by:"f1"},
    {id:"p3",studentId:"e5",amount:5000,method:"Virement",ref:"REC-0003",date:"2025-10-06",by:"f1"},
  ];
  // notes: 2 evals per subject for first class sample
  const evals=[
    {id:"ev1",classId:"c7a",subject:"Français / Kreyòl",title:"Contrôle 1",max:100,date:"2025-10-01",status:"published"},
    {id:"ev2",classId:"c7a",subject:"Mathématiques",title:"Contrôle 1",max:100,date:"2025-10-02",status:"draft"},
  ];
  const grades={};
  ["ev1","ev2"].forEach(evid=>{
    grades[evid]={};
    students.filter(s=>s.classId==="c7a").forEach(s=>{ grades[evid][s.id]=rnd(35,98); });
  });
  const books=[
    {id:"bk1",title:"Gouverneurs de la rosée",author:"J. Roumain",copies:4,available:2,ref:"LIT-001"},
    {id:"bk2",title:"Grammaire créole — initiation",author:"Collectif",copies:6,available:5,ref:"GRA-002"},
    {id:"bk3",title:"Mathématiques 7e AF",author:"MENFP (ressource ouverte)",copies:12,available:9,ref:"MAT-007"},
    {id:"bk4",title:"Histoire d'Haïti illustrée",author:"Éd. scolaire",copies:5,available:3,ref:"HIS-004"},
    {id:"bk5",title:"Le Petit Prince (Kreyòl)",author:"A. de Saint-Exupéry",copies:3,available:1,ref:"LIT-010"},
  ];
  const loans=[
    {id:"l1",bookId:"bk1",studentId:"e2",out:"2025-10-06",due:"2025-10-20",back:null},
    {id:"l2",bookId:"bk5",studentId:"e4",out:"2025-09-29",due:"2025-10-13",back:null},
  ];
  const announces=[
    {id:"a1",title:"Rentrée — horaires d'accueil",target:"Toute l'école",channel:"Papier + WhatsApp",date:"2025-09-08",text:"Accueil échelonné par niveau. Listes affichées au secrétariat.",status:"sent",ok:312,fail:8},
    {id:"a2",title:"Fermeture exceptionnelle — vendredi",target:"Campus Delmas",channel:"SMS + Papier",date:"2025-10-10",text:"En raison des circonstances, les cours sont suspendus vendredi. Devoirs en version papier disponibles au secrétariat.",status:"sent",ok:188,fail:5},
  ];
  const meetings=[{id:"m1",title:"Réunion parents 7e A",date:"2025-10-18 10:00",place:"Salle polyvalente",invited:28,confirmed:19}];
  const calendar=[
    {id:"k1",name:"Rentrée scolaire",start:"2025-09-09",end:"2025-09-09",type:"backYear"},
    {id:"k2",name:"1er contrôle",start:"2025-10-06",end:"2025-10-10",type:"control"},
    {id:"k3",name:"Congé",start:"2025-11-01",end:"2025-11-02",type:"holiday"},
    {id:"k4",name:"Recensement MENFP (à confirmer)",start:"2025-11-15",end:"2025-11-22",type:"census"},
    {id:"k5",name:"Examens 1er trimestre",start:"2025-12-15",end:"2025-12-19",type:"exam"},
  ];
  return {
    v:1, lang:"fr", role:"direction", online:true, schoolId:"college-klirline", year:"2025-2026",
    school:{id:"college-klirline",name:"Collège Klirline",campuses:["Delmas","Pétion-Ville"],phone:"+509 22 00 00 00"},
    years:["2024-2025","2025-2026"], periods:["T1","T2","T3"], scale:{pass:50,max:100,round:"0.5"},
    levels, classes, subjects:subs, students, staff, fees, payments, evals, grades, books, loans,
    announces, meetings, calendar,
    attendance:{}, attLog:[], paySeq:4, exportLog:[], queue:[], currentUser:{parentKids:["e1","e4"],studentId:"e1"},
    discounts:[{id:"d1",studentId:"e5",label:"Bourse mérite 20%",amount:5000,by:"d1"}]
  };
};

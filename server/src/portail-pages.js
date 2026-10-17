'use strict';
// Bloc 5 : pages du portail public, rendues côté serveur en HTML simple (aucun cadriciel, aucun script nécessaire à la
// lecture). Mobile d'abord, très léger : une feuille de style et un script de quelques centaines d'octets, polices du
// système, images en vignettes chargées à la demande. Cache en mémoire (60 s, invalidé à chaque publication) + ETag + gzip.
// Adresses : / (français) et /ht/… (kreyòl) ; /evenements, /laureats, /communaute, /annonces ; détails /evenements/<id>,
// /communaute/<id> ; /sitemap.xml, /robots.txt ; images /p/img/<id> (vignette : <id>-v) ; clics /p/clic/<id>.
// Aucun cookie n'est posé ni lu ; aucune donnée d'école privée : seuls les champs de publicItem() sont affichés.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const Pt = require('./portail');

// CSP du portail : plus stricte que celle de l'application (aucune connexion sortante, aucun cadre, aucun formulaire externe).
const PORTAL_CSP = ["default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self'", "base-uri 'none'",
  "form-action 'self'", "frame-ancestors 'none'"].join('; ');
const PAGES = ['', 'evenements', 'laureats', 'communaute', 'annonces'];
const PER = { evenements: 12, laureats: 30, communaute: 12 };
const CACHE_MS = 60e3, CACHE_MAX = 300;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const T = {
  fr: {
    locale: 'fr_HT', name: 'Français', site: 'NORIA', tagline: 'L’école haïtienne, ses réussites et sa communauté',
    nav: { '': 'Accueil', evenements: 'Événements', laureats: 'Lauréats', communaute: 'Communauté', annonces: 'Annonces' },
    login: 'Se connecter', loginTitle: 'Espace des écoles (connexion)', skip: 'Aller au contenu', langLabel: 'Langue', mainNav: 'Navigation du portail',
    heroTitle: 'NORIA, la gestion scolaire pensée pour Haïti',
    heroText: 'Les écoles partenaires gèrent élèves, notes, présences et échanges avec les familles, en français et en kreyòl, même avec une connexion faible. Ce portail public partage les événements nationaux, les lauréats et la vie des écoles.',
    ctaSchools: 'Espace des écoles', ctaEvents: 'Voir les événements',
    latestEvents: 'Derniers événements', allEvents: 'Tous les événements', featured: 'Lauréats à la une', allLaureates: 'Tous les lauréats',
    ads: 'Annonces', allAds: 'Toutes les annonces', partners: 'Écoles partenaires', partnersHelp: 'Écoles qui ont choisi d’apparaître sur le portail.',
    community: 'Communauté', communityHelp: 'Articles et témoignages des écoles, publiés après relecture par l’équipe NORIA.', allCommunity: 'Toute la communauté',
    sponsored: 'Sponsorisé', official: 'Annonce', by: 'Par', visit: 'Visiter le site', read: 'Lire la suite', back: 'Retour',
    sponsoredBy: (s) => `Encart payé par ${s}`, until: (d) => `Jusqu’au ${d}`,
    noEvents: 'Aucun événement publié pour le moment.', noLaureates: 'Aucun lauréat publié pour ces critères.', noCommunity: 'Aucun article publié pour le moment.',
    noAds: 'Aucune annonce en cours.', noPartners: 'Aucune école partenaire pour le moment.',
    upcoming: 'À venir', past: 'Événements passés', pastLink: 'Voir les événements passés', upcomingLink: 'Voir les événements à venir', allCats: 'Toutes',
    category: 'Catégorie', place: 'Lieu', date: 'Date', dateRange: (a, b) => `du ${a} au ${b}`,
    cat: { examens: 'Examens officiels', concours: 'Concours', culture: 'Culture', sport: 'Sport', science: 'Sciences', autre: 'Autre' },
    dep: { artibonite: 'Artibonite', centre: 'Centre', 'grand-anse': 'Grand’Anse', nippes: 'Nippes', nord: 'Nord', 'nord-est': 'Nord-Est', 'nord-ouest': 'Nord-Ouest', ouest: 'Ouest', sud: 'Sud', 'sud-est': 'Sud-Est' },
    year: 'Année', type: 'Examen ou concours', department: 'Département', all: 'Tous', filter: 'Afficher', examen: 'Examen', concours: 'Concours',
    mention: 'Mention', school: 'École', masked: 'Lauréat mineur : seules les initiales sont publiées, faute de consentement de l’école et du parent.',
    article: 'Article', temoignage: 'Témoignage', newer: 'Plus récents', older: 'Plus anciens', page: 'Page',
    months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    mshort: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    notFound: 'Page introuvable', notFoundText: 'Cette page n’existe pas ou n’est plus publiée.', home: 'Retour à l’accueil',
    footer: 'NORIA est un produit de Klirline Inc. Portail public : aucun compte, aucun cookie, aucun traceur.',
    footerSchools: 'Vous dirigez une école ? Connectez-vous à votre espace pour proposer un événement, un article ou un lauréat : chaque contenu est relu avant publication.',
    desc: {
      '': 'NORIA, gestion scolaire pour Haïti : événements nationaux, lauréats des examens et concours, vie des écoles partenaires, en français et en kreyòl.',
      evenements: 'Événements scolaires nationaux en Haïti : examens officiels, concours, culture, sport. Dates, lieux et descriptions.',
      laureats: 'Lauréats des examens officiels et des concours en Haïti, par année, examen et département.',
      communaute: 'Articles et témoignages des écoles partenaires de NORIA, publiés après modération.',
      annonces: 'Annonces et encarts sponsorisés du portail NORIA, clairement identifiés.',
    },
  },
  ht: {
    locale: 'ht_HT', name: 'Kreyòl', site: 'NORIA', tagline: 'Lekòl ayisyen an, siksè li ak kominote li',
    nav: { '': 'Akèy', evenements: 'Evènman', laureats: 'Laureya', communaute: 'Kominote', annonces: 'Anons' },
    login: 'Konekte', loginTitle: 'Espas lekòl yo (koneksyon)', skip: 'Ale nan kontni an', langLabel: 'Lang', mainNav: 'Navigasyon pòtay la',
    heroTitle: 'NORIA, jesyon lekòl ki fèt pou Ayiti',
    heroText: 'Lekòl patnè yo jere elèv, nòt, prezans ak echanj ak fanmi yo, an franse ak an kreyòl, menm lè koneksyon an fèb. Pòtay piblik sa a pataje evènman nasyonal yo, laureya yo ak lavi lekòl yo.',
    ctaSchools: 'Espas lekòl yo', ctaEvents: 'Gade evènman yo',
    latestEvents: 'Dènye evènman yo', allEvents: 'Tout evènman yo', featured: 'Laureya ki an vedèt', allLaureates: 'Tout laureya yo',
    ads: 'Anons', allAds: 'Tout anons yo', partners: 'Lekòl patnè yo', partnersHelp: 'Lekòl ki chwazi parèt sou pòtay la.',
    community: 'Kominote', communityHelp: 'Atik ak temwayaj lekòl yo, ekip NORIA a li yo anvan yo pibliye.', allCommunity: 'Tout kominote a',
    sponsored: 'Sponsorize', official: 'Anons', by: 'Pa', visit: 'Vizite sit la', read: 'Li rès la', back: 'Retounen',
    sponsoredBy: (s) => `Espas sa a peye pa ${s}`, until: (d) => `Jiska ${d}`,
    noEvents: 'Poko gen evènman ki pibliye.', noLaureates: 'Pa gen laureya ki pibliye pou kritè sa yo.', noCommunity: 'Poko gen atik ki pibliye.',
    noAds: 'Pa gen anons kounye a.', noPartners: 'Poko gen lekòl patnè.',
    upcoming: 'K ap vini', past: 'Evènman ki pase deja', pastLink: 'Gade evènman ki pase yo', upcomingLink: 'Gade evènman k ap vini yo', allCats: 'Tout',
    category: 'Kategori', place: 'Kote', date: 'Dat', dateRange: (a, b) => `soti ${a} rive ${b}`,
    cat: { examens: 'Egzamen ofisyèl', concours: 'Konkou', culture: 'Kilti', sport: 'Espò', science: 'Syans', autre: 'Lòt' },
    dep: { artibonite: 'Latibonit', centre: 'Sant', 'grand-anse': 'Grandans', nippes: 'Nip', nord: 'Nò', 'nord-est': 'Nòdès', 'nord-ouest': 'Nòdwès', ouest: 'Lwès', sud: 'Sid', 'sud-est': 'Sidès' },
    year: 'Ane', type: 'Egzamen oswa konkou', department: 'Depatman', all: 'Tout', filter: 'Montre', examen: 'Egzamen', concours: 'Konkou',
    mention: 'Mansyon', school: 'Lekòl', masked: 'Laureya minè : se inisyal yo sèlman ki parèt, paske lekòl la ak paran an pa bay konsantman yo.',
    article: 'Atik', temoignage: 'Temwayaj', newer: 'Pi resan', older: 'Pi ansyen', page: 'Paj',
    months: ['janvye', 'fevriye', 'mas', 'avril', 'me', 'jen', 'jiyè', 'out', 'septanm', 'oktòb', 'novanm', 'desanm'],
    mshort: ['jan', 'fev', 'mas', 'avr', 'me', 'jen', 'jiy', 'out', 'sept', 'okt', 'nov', 'des'],
    notFound: 'Nou pa jwenn paj la', notFoundText: 'Paj sa a pa egziste oswa li pa pibliye ankò.', home: 'Retounen nan akèy la',
    footer: 'NORIA se yon pwodui Klirline Inc. Pòtay piblik : pa gen kont, pa gen cookie, pa gen traseur.',
    footerSchools: 'Ou dirije yon lekòl ? Konekte nan espas ou pou pwopoze yon evènman, yon atik oswa yon laureya : ekip la li chak kontni anvan li pibliye.',
    desc: {
      '': 'NORIA, jesyon lekòl pou Ayiti : evènman nasyonal, laureya egzamen ak konkou, lavi lekòl patnè yo, an franse ak an kreyòl.',
      evenements: 'Evènman lekòl nasyonal ann Ayiti : egzamen ofisyèl, konkou, kilti, espò. Dat, kote ak deskripsyon.',
      laureats: 'Laureya egzamen ofisyèl ak konkou ann Ayiti, pa ane, egzamen ak depatman.',
      communaute: 'Atik ak temwayaj lekòl patnè NORIA yo, pibliye apre moderasyon.',
      annonces: 'Anons ak espas sponsorize pòtay NORIA a, byen idantifye.',
    },
  },
};

/* ---------- Outils d'affichage ---------- */
const pick = (o, base, L) => o[`${base}_${L}`] || o[`${base}_${L === 'fr' ? 'ht' : 'fr'}`] || '';
// Langue réelle du texte affiché (repli sur l'autre langue si la traduction manque) : attribut lang pour les lecteurs d'écran.
const langOf = (o, base, L) => (o[`${base}_${L}`] ? L : (L === 'fr' ? 'ht' : 'fr'));
const txt = (o, base, L, tag = 'span', cls = '') => {
  const v = pick(o, base, L); if (!v) return '';
  const l = langOf(o, base, L);
  return `<${tag}${cls ? ` class="${cls}"` : ''}${l !== L ? ` lang="${l}"` : ''}>${esc(v)}</${tag}>`;
};
const paras = (s) => String(s || '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
const excerpt = (s, n = 160) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t; };
function fmtDate(d, L) { if (!d) return ''; const [y, m, j] = d.split('-').map(Number); return `${j === 1 && L === 'fr' ? '1er' : j} ${T[L].months[m - 1]} ${y}`; }
function when(e, L) { return e.event_end && e.event_end !== e.event_date ? T[L].dateRange(fmtDate(e.event_date, L), fmtDate(e.event_end, L)) : fmtDate(e.event_date, L); }
const href = (L, p = '') => (L === 'ht' ? `/ht${p ? `/${p}` : ''}` : `/${p}`);
const img = (id, alt, cls, w, h, thumb = true, eager = false) => `<img class="${cls}" src="/p/img/${Number(id)}${thumb ? '-v' : ''}" alt="${esc(alt)}" width="${w}" height="${h}"${eager ? '' : ' loading="lazy"'} decoding="async">`;
const badge = (k, L) => `<span class="cat cat-${esc(k)}">${esc(T[L].cat[k] || k)}</span>`;
const dateBox = (d, L) => { const [y, m, j] = d.split('-').map(Number); return `<span class="dbox" aria-hidden="true"><b>${j}</b><span>${esc(T[L].mshort[m - 1])}</span><small>${y}</small></span>`; };
const qs = (o) => { const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== 1 || false)).toString(); return s ? `?${s}` : ''; };

/* ---------- Gabarit ---------- */
function layout({ L, page, title, desc, body, canonical, alt, base, image, type = 'website', assets, status = 200 }) {
  const t = T[L];
  const full = title ? `${title} · NORIA` : `NORIA — ${t.tagline}`;
  const abs = (p) => (base ? `${base}${p}` : p);
  const og = image ? abs(image) : abs('/src/icon-512.png');
  const other = L === 'fr' ? 'ht' : 'fr';
  const head = [
    '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(full)}</title>`, `<meta name="description" content="${esc(desc)}">`,
    status === 200 ? `<link rel="canonical" href="${esc(abs(canonical))}">` : '<meta name="robots" content="noindex">',
    ...(status === 200 && alt ? [`<link rel="alternate" hreflang="fr" href="${esc(abs(alt.fr))}">`, `<link rel="alternate" hreflang="ht" href="${esc(abs(alt.ht))}">`, `<link rel="alternate" hreflang="x-default" href="${esc(abs(alt.fr))}">`] : []),
    `<meta property="og:type" content="${type}">`, '<meta property="og:site_name" content="NORIA">', `<meta property="og:title" content="${esc(title || full)}">`,
    `<meta property="og:description" content="${esc(desc)}">`, `<meta property="og:url" content="${esc(abs(canonical))}">`, `<meta property="og:image" content="${esc(og)}">`,
    `<meta property="og:locale" content="${t.locale}">`, `<meta property="og:locale:alternate" content="${T[other].locale}">`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    '<meta name="theme-color" content="#0e1218">', '<link rel="icon" href="/src/favicon.svg" type="image/svg+xml">', '<link rel="apple-touch-icon" href="/src/icon-192.png">',
    `<link rel="stylesheet" href="/src/portail.css?v=${assets.css}">`, `<script src="/src/portail.js?v=${assets.js}"></script>`,
  ].join('');
  const nav = PAGES.map((p) => `<a href="${href(L, p)}"${p === page ? ' aria-current="page"' : ''}>${esc(t.nav[p])}</a>`).join('');
  const langs = ['fr', 'ht'].map((l) => `<a href="${esc(alt ? alt[l] : href(l))}" hreflang="${l}" lang="${l}"${l === L ? ' aria-current="true"' : ''} title="${esc(T[l].name)}">${l.toUpperCase()}</a>`).join('');
  return `<!doctype html><html lang="${L}"><head>${head}</head><body>
<a class="skip" href="#contenu">${esc(t.skip)}</a>
<header class="hd"><div class="wrap hd-in"><a class="brand" href="${href(L)}"><img src="/src/favicon.svg" alt="" width="32" height="32"><span>NORIA</span></a>
<nav class="lang" aria-label="${esc(t.langLabel)}">${langs}</nav><a class="btn btn-in" href="/app" title="${esc(t.loginTitle)}">${esc(t.login)}</a></div>
<nav class="nav" aria-label="${esc(t.mainNav)}"><div class="wrap nav-in">${nav}</div></nav></header>
<main id="contenu" class="wrap" tabindex="-1">${body}</main>
<footer class="ft"><div class="wrap"><p>${esc(t.footerSchools)} <a href="/app">${esc(t.ctaSchools)}</a></p><p class="mut">${esc(t.footer)}</p></div></footer>
</body></html>`;
}

/* ---------- Blocs ---------- */
function eventCard(e, L, { thumb = true } = {}) {
  const t = T[L];
  return `<article class="card ev">${dateBox(e.event_date, L)}<div class="ev-b">${badge(e.category, L)}
<h3><a href="${href(L, `evenements/${e.id}`)}">${esc(pick(e, 'title', L))}</a></h3>
<p class="meta"><span class="sr">${esc(t.date)} : </span>${esc(when(e, L))}${e.place ? ` · <span class="sr">${esc(t.place)} : </span>${esc(e.place)}` : ''}${e.department ? ` · ${esc(t.dep[e.department])}` : ''}</p>
${pick(e, 'body', L) ? `<p class="ex"${langOf(e, 'body', L) !== L ? ` lang="${langOf(e, 'body', L)}"` : ''}>${esc(excerpt(pick(e, 'body', L)))}</p>` : ''}</div>
${thumb && e.image ? img(e.image, '', 'ev-img', 160, 120) : ''}</article>`;
}
function laureateCard(p, L, { photo = true } = {}) {
  const t = T[L];
  const ini = p.masked ? p.name : p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return `<li class="card la">${photo && p.image ? img(p.image, p.name, 'la-img', 64, 64) : `<span class="av" aria-hidden="true">${esc(p.masked ? ini.replace(/[.\s]/g, '').slice(0, 3) : ini)}</span>`}
<div><p class="la-n">${esc(p.name)}${p.masked ? ' <abbr class="mask" title="' + esc(t.masked) + '">*</abbr>' : ''}</p>
<p class="meta">${esc(p.exam)} ${p.year ? `· ${p.year}` : ''}${p.mention ? ` · <span class="sr">${esc(t.mention)} : </span><b>${esc(p.mention)}</b>` : ''}</p>
<p class="meta">${p.school ? `${esc(p.school)} · ` : ''}${p.department ? esc(t.dep[p.department]) : ''}</p></div></li>`;
}
function adCard(a, L) {
  const t = T[L];
  const title = pick(a, 'title', L); const text = pick(a, 'text', L);
  return `<article class="card ad${a.sponsored ? ' ad-sp' : ''}"><p class="ad-k">${a.sponsored ? `<span class="tag-sp">${esc(t.sponsored)}</span> <span class="mut">${esc(t.sponsoredBy(a.sponsor))}</span>` : `<span class="tag-of">${esc(t.official)}</span>`}</p>
${a.image ? img(a.image, '', 'ad-img', 320, 180) : ''}<h3${langOf(a, 'title', L) !== L ? ` lang="${langOf(a, 'title', L)}"` : ''}>${esc(title)}</h3>
${text ? `<div class="ad-t"${langOf(a, 'text', L) !== L ? ` lang="${langOf(a, 'text', L)}"` : ''}>${paras(text)}</div>` : ''}
<p class="meta">${esc(t.until(fmtDate(a.ends_on, L)))}</p>
${a.link ? `<p><a class="btn btn-o" href="/p/clic/${Number(a.id)}" rel="${a.sponsored ? 'sponsored ' : ''}nofollow noopener">${esc(t.visit)}</a></p>` : ''}</article>`;
}
function postCard(p, L) {
  const t = T[L];
  return `<article class="card po">${p.image ? img(p.image, '', 'po-img', 160, 120) : ''}<div><p class="kind">${esc(t[p.kind])}${p.school ? ` · ${esc(p.school)}` : ''}</p>
<h3><a href="${href(L, `communaute/${p.id}`)}">${esc(pick(p, 'title', L))}</a></h3>
<p class="ex">${esc(excerpt(pick(p, 'body', L)))}</p>${p.author ? `<p class="meta">${esc(t.by)} ${esc(p.author)}</p>` : ''}</div></article>`;
}
const section = (id, title, inner, more) => `<section class="sec" aria-labelledby="${id}"><div class="sec-h"><h2 id="${id}">${esc(title)}</h2>${more || ''}</div>${inner}</section>`;
const more = (L, p, label) => `<a class="more" href="${href(L, p)}">${esc(label)} →</a>`;
const empty = (s) => `<p class="empty">${esc(s)}</p>`;
function pager(L, p, page, total, per, extra = {}) {
  const pages = Math.ceil(total / per); if (pages <= 1) return '';
  const t = T[L];
  return `<nav class="pager" aria-label="${esc(t.page)}">${page > 1 ? `<a href="${href(L, p)}${qs({ ...extra, page: page - 1 })}" rel="prev">← ${esc(t.newer)}</a>` : '<span></span>'}
<span>${esc(t.page)} ${page} / ${pages}</span>${page < pages ? `<a href="${href(L, p)}${qs({ ...extra, page: page + 1 })}" rel="next">${esc(t.older)} →</a>` : '<span></span>'}</nav>`;
}

/* ---------- Pages ---------- */
async function home(pub, L) {
  const t = T[L];
  const [events, featured, ads, partners, posts] = await Promise.all([pub.latestEvents(3), pub.featured(6), pub.ads({ n: 3 }), pub.partners(), pub.community({ per: 3 })]);
  const hero = `<section class="hero"><h1>${esc(t.heroTitle)}</h1><p>${esc(t.heroText)}</p>
<p class="cta"><a class="btn" href="/app">${esc(t.ctaSchools)}</a> <a class="btn btn-o" href="${href(L, 'evenements')}">${esc(t.ctaEvents)}</a></p></section>`;
  return {
    body: hero
      + section('s-ev', t.latestEvents, events.length ? `<div class="list">${events.map((e) => eventCard(e, L, { thumb: false })).join('')}</div>` : empty(t.noEvents), more(L, 'evenements', t.allEvents))
      + section('s-la', t.featured, featured.length ? `<ul class="grid la-g">${featured.map((p) => laureateCard(p, L, { photo: false })).join('')}</ul>` : empty(t.noLaureates), more(L, 'laureats', t.allLaureates))
      + section('s-ad', t.ads, ads.length ? `<div class="grid ad-g">${ads.map((a) => adCard({ ...a, image: null }, L)).join('')}</div>` : empty(t.noAds), more(L, 'annonces', t.allAds))
      + section('s-co', t.community, posts.list.length ? `<div class="list">${posts.list.map((p) => postCard({ ...p, image: null }, L)).join('')}</div>` : empty(t.noCommunity), more(L, 'communaute', t.allCommunity))
      + section('s-pa', t.partners, `<p class="mut">${esc(t.partnersHelp)}</p>${partners.length ? `<ul class="partners">${partners.map((s) => `<li>${s.logo ? img(s.logo, '', 'pa-logo', 48, 48, false) : `<span class="av" aria-hidden="true">${esc(s.name.split(/\s+/).filter((w) => w.length > 2).map((w) => w[0]).join('').slice(0, 3).toUpperCase())}</span>`}<span>${esc(s.name)}</span></li>`).join('')}</ul>` : empty(t.noPartners)}`),
  };
}
async function events(pub, L, q) {
  const t = T[L];
  const cat = Pt.CATEGORIES.includes(q.get('categorie')) ? q.get('categorie') : null;
  const past = q.get('passes') === '1';
  const page = Math.min(50, Math.max(1, Number.parseInt(q.get('page'), 10) || 1));
  const r = await pub.events({ category: cat, past, page, per: PER.evenements });
  const chips = [['', t.allCats], ...Pt.CATEGORIES.map((c) => [c, t.cat[c]])].map(([c, l]) => `<a class="chip" href="${href(L, 'evenements')}${qs({ categorie: c || null, passes: past ? '1' : null })}"${(cat || '') === c ? ' aria-current="true"' : ''}>${esc(l)}</a>`).join('');
  return {
    title: t.nav.evenements,
    body: `<h1>${esc(past ? t.past : t.nav.evenements)}</h1><nav class="chips" aria-label="${esc(t.category)}">${chips}</nav>
${r.list.length ? `<div class="list">${r.list.map((e) => eventCard(e, L)).join('')}</div>` : empty(t.noEvents)}
${pager(L, 'evenements', page, r.total, PER.evenements, { categorie: cat, passes: past ? '1' : null })}
<p><a class="more" href="${href(L, 'evenements')}${qs({ categorie: cat, passes: past ? null : '1' })}">${esc(past ? t.upcomingLink : t.pastLink)} →</a></p>`,
  };
}
async function eventDetail(pub, L, id) {
  const t = T[L]; const e = await pub.item(['evenement'], id); if (!e) return null;
  const title = pick(e, 'title', L);
  return {
    title, desc: excerpt(pick(e, 'body', L), 155) || T[L].desc.evenements, image: e.image ? `/p/img/${e.image}` : null, type: 'article',
    body: `<article class="detail"><p><a class="more" href="${href(L, 'evenements')}">← ${esc(t.back)}</a></p>${badge(e.category, L)}<h1${langOf(e, 'title', L) !== L ? ` lang="${langOf(e, 'title', L)}"` : ''}>${esc(title)}</h1>
<p class="meta"><b>${esc(t.date)} :</b> ${esc(when(e, L))}<br><b>${esc(t.place)} :</b> ${esc(e.place)}${e.department ? ` (${esc(t.dep[e.department])})` : ''}${e.school ? `<br><b>${esc(t.school)} :</b> ${esc(e.school)}` : ''}</p>
${e.image ? img(e.image, title, 'hero-img', 800, 450, false, true) : ''}<div class="prose"${langOf(e, 'body', L) !== L ? ` lang="${langOf(e, 'body', L)}"` : ''}>${paras(pick(e, 'body', L))}</div></article>`,
  };
}
async function laureates(pub, L, q) {
  const t = T[L];
  const years = await pub.years();
  const year = years.includes(Number(q.get('annee'))) ? Number(q.get('annee')) : null;
  const type = ['examen', 'concours'].includes(q.get('type')) ? q.get('type') : null;
  const dep = Pt.DEPARTMENTS.includes(q.get('departement')) ? q.get('departement') : null;
  const page = Math.min(100, Math.max(1, Number.parseInt(q.get('page'), 10) || 1));
  const r = await pub.laureates({ year, type, dep, page, per: PER.laureats });
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
  const form = `<form class="filters" method="get" action="${href(L, 'laureats')}">
<label>${esc(t.year)}<select name="annee">${opt('', t.all, year)}${years.map((y) => opt(y, y, year)).join('')}</select></label>
<label>${esc(t.type)}<select name="type">${opt('', t.all, type)}${opt('examen', t.examen, type)}${opt('concours', t.concours, type)}</select></label>
<label>${esc(t.department)}<select name="departement">${opt('', t.all, dep)}${Pt.DEPARTMENTS.map((d) => opt(d, t.dep[d], dep)).join('')}</select></label>
<button class="btn" type="submit">${esc(t.filter)}</button></form>`;
  // Regroupement par année puis par examen ou concours.
  const groups = new Map();
  for (const p of r.list) { const k = `${p.year}|${p.exam}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  const list = [...groups].map(([k, ps]) => { const [y, ex] = k.split('|'); return `<section class="lg"><h2>${esc(ex)} <span class="mut">${esc(y)}</span></h2><ul class="grid la-g">${ps.map((p) => laureateCard(p, L)).join('')}</ul></section>`; }).join('');
  return {
    title: t.nav.laureats,
    body: `<h1>${esc(t.nav.laureats)}</h1>${form}${r.list.length ? list : empty(t.noLaureates)}${r.list.some((p) => p.masked) ? `<p class="mut small">* ${esc(t.masked)}</p>` : ''}
${pager(L, 'laureats', page, r.total, PER.laureats, { annee: year, type, departement: dep })}`,
  };
}
async function community(pub, L, q) {
  const t = T[L];
  const page = Math.min(50, Math.max(1, Number.parseInt(q.get('page'), 10) || 1));
  const r = await pub.community({ page, per: PER.communaute });
  return { title: t.nav.communaute, body: `<h1>${esc(t.nav.communaute)}</h1><p class="mut">${esc(t.communityHelp)}</p>${r.list.length ? `<div class="list">${r.list.map((p) => postCard(p, L)).join('')}</div>` : empty(t.noCommunity)}${pager(L, 'communaute', page, r.total, PER.communaute)}` };
}
async function postDetail(pub, L, id) {
  const t = T[L]; const p = await pub.item(['article', 'temoignage'], id); if (!p) return null;
  const title = pick(p, 'title', L);
  return {
    title, desc: excerpt(pick(p, 'body', L), 155) || T[L].desc.communaute, image: p.image ? `/p/img/${p.image}` : null, type: 'article',
    body: `<article class="detail"><p><a class="more" href="${href(L, 'communaute')}">← ${esc(t.back)}</a></p><p class="kind">${esc(t[p.kind])}</p><h1${langOf(p, 'title', L) !== L ? ` lang="${langOf(p, 'title', L)}"` : ''}>${esc(title)}</h1>
<p class="meta">${p.school_logo ? img(p.school_logo, '', 'pa-logo', 32, 32, false) : ''}${p.school ? esc(p.school) : 'NORIA'}${p.author ? ` · ${esc(t.by)} ${esc(p.author)}` : ''}${p.published_at ? ` · ${esc(fmtDate(String(p.published_at).slice(0, 10), L))}` : ''}</p>
${p.image ? img(p.image, title, 'hero-img', 800, 450, false, true) : ''}<div class="prose"${langOf(p, 'body', L) !== L ? ` lang="${langOf(p, 'body', L)}"` : ''}>${paras(pick(p, 'body', L))}</div></article>`,
  };
}
async function ads(pub, L) {
  const t = T[L];
  const list = await pub.ads({ n: 40 });
  return { title: t.nav.annonces, body: `<h1>${esc(t.nav.annonces)}</h1>${list.length ? `<div class="grid ad-g">${list.map((a) => adCard(a, L)).join('')}</div>` : empty(t.noAds)}` };
}

/* ---------- Service HTTP ---------- */
function createPortal(db, { publicUrl = null, secureCookie = false, root = path.join(__dirname, '..', '..') } = {}) {
  const pub = Pt.createPublic(db);
  const cache = new Map();
  const assetHash = (f) => { try { return crypto.createHash('sha1').update(fs.readFileSync(path.join(root, 'src', f))).digest('hex').slice(0, 10); } catch { return '1'; } };
  let assets = null; let assetsAt = 0;
  const getAssets = () => { if (!assets || Date.now() - assetsAt > 60e3) { assets = { css: assetHash('portail.css'), js: assetHash('portail.js') }; assetsAt = Date.now(); } return assets; };
  const baseOf = (req) => {
    if (publicUrl) return publicUrl.replace(/\/$/, '');
    const h = req.headers.host || '';
    return /^[\w.:-]{1,253}$/.test(h) ? `${secureCookie ? 'https' : 'http'}://${h}` : '';
  };

  async function build(L, page, rest, q, base) {
    const t = T[L];
    let r = null; let canon = page;
    if (page === '' && !rest) r = await home(pub, L);
    else if (page === 'evenements' && !rest) r = await events(pub, L, q);
    else if (page === 'evenements' && /^\d{1,9}$/.test(rest)) { r = await eventDetail(pub, L, rest); canon = `evenements/${rest}`; }
    else if (page === 'laureats' && !rest) r = await laureates(pub, L, q);
    else if (page === 'communaute' && !rest) r = await community(pub, L, q);
    else if (page === 'communaute' && /^\d{1,9}$/.test(rest)) { r = await postDetail(pub, L, rest); canon = `communaute/${rest}`; }
    else if (page === 'annonces' && !rest) r = await ads(pub, L);
    if (!r) return notFoundPage(L, base);
    // Adresse canonique : sans paramètres de pagination ni filtres non reconnus ; les filtres reconnus restent.
    const keep = new URLSearchParams();
    for (const k of ['categorie', 'passes', 'annee', 'type', 'departement', 'page']) if (q.get(k) && /^[\w-]{1,20}$/.test(q.get(k))) keep.set(k, q.get(k));
    const suffix = keep.toString() ? `?${keep}` : '';
    const alt = { fr: href('fr', canon) + suffix, ht: href('ht', canon) + suffix };
    return { status: 200, html: layout({ L, page, title: r.title, desc: r.desc || t.desc[page], body: r.body, canonical: alt[L], alt, base, image: r.image, type: r.type, assets: getAssets() }) };
  }
  function notFoundPage(L, base) {
    const t = T[L];
    return { status: 404, html: layout({ L, page: null, title: t.notFound, desc: t.notFoundText, body: `<h1>${esc(t.notFound)}</h1><p>${esc(t.notFoundText)}</p><p><a class="btn" href="${href(L)}">${esc(t.home)}</a></p>`, canonical: href(L), alt: null, base, assets: getAssets(), status: 404 }) };
  }
  async function sitemap(base) {
    const rows = await pub.sitemap();
    const urls = PAGES.map((p) => ({ p, mod: null })).concat(rows.map((r) => ({ p: `${r.kind === 'evenement' ? 'evenements' : 'communaute'}/${r.id}`, mod: String(r.updated_at || r.published_at || '').slice(0, 10) })));
    const u = (p) => esc(`${base}${p === '' ? '/' : `/${p}`}`); const uh = (p) => esc(`${base}${href('ht', p)}`);
    const one = (loc, p, mod) => `<url><loc>${loc}</loc>${mod ? `<lastmod>${esc(mod)}</lastmod>` : ''}<xhtml:link rel="alternate" hreflang="fr" href="${u(p)}"/><xhtml:link rel="alternate" hreflang="ht" href="${uh(p)}"/></url>`;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.map(({ p, mod }) => one(u(p), p, mod) + one(uh(p), p, mod)).join('')}</urlset>\n`;
  }
  const robots = (base) => `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api/\nDisallow: /p/clic/\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ''}`;

  function write(req, res, baseHeaders, { status, body, type, cache: cc, extra = {} }) {
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const etag = `"${crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 16)}"`;
    const headers = { ...baseHeaders, 'content-type': type, 'cache-control': cc, etag, vary: 'Accept-Encoding', ...extra };
    if (type.startsWith('text/html')) { headers['content-security-policy'] = PORTAL_CSP; headers['permissions-policy'] = 'camera=(), microphone=(), geolocation=(), interest-cohort=()'; }
    else delete headers['content-security-policy'];
    if (status === 200 && req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && !type.startsWith('image/');
    const out = gz ? (body.gz || zlib.gzipSync(raw, { level: 9 })) : raw;
    if (gz) headers['content-encoding'] = 'gzip';
    headers['content-length'] = out.length;
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : out);
  }

  // Rend true si la requête a été servie. GET/HEAD seulement ; jamais /api/, /src/, /sw.js, /manifest.webmanifest, /app.
  async function serve(req, res, url, baseHeaders, ip) {
    const p = url.pathname;
    if (p === '/app/' || p === '/public' || p.startsWith('/public/')) {
      const to = p === '/app/' ? '/app' : (p.slice('/public'.length) || '/');
      res.writeHead(301, { ...baseHeaders, location: to + url.search, 'cache-control': 'public, max-age=86400' }); res.end(); return true;
    }
    if (p === '/robots.txt') { write(req, res, baseHeaders, { status: 200, body: robots(baseOf(req)), type: 'text/plain; charset=utf-8', cache: 'public, max-age=3600' }); return true; }
    if (p === '/sitemap.xml') { write(req, res, baseHeaders, { status: 200, body: await sitemap(baseOf(req)), type: 'application/xml; charset=utf-8', cache: 'public, max-age=3600' }); return true; }
    let m = p.match(/^\/p\/img\/(\d{1,9})(-v)?$/);
    if (m) {
      const im = await pub.image(m[1], !!m[2]);
      if (!im) return false;
      write(req, res, baseHeaders, { status: 200, body: im.buf, type: im.type, cache: 'public, max-age=86400', extra: { 'cross-origin-resource-policy': 'same-origin' } });
      return true;
    }
    m = p.match(/^\/p\/clic\/(\d{1,9})$/);
    if (m) {
      const to = await Pt.click(db, m[1], req, ip);
      res.writeHead(302, { ...baseHeaders, location: to || '/annonces', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' }); res.end(); return true;
    }
    m = p.match(/^\/(?:(ht)(?:\/|$))?([a-z]*)(?:\/([^/]*))?\/?$/);
    if (!m || !PAGES.includes(m[2]) || (p.length > 1 && p.endsWith('/') && p !== '/ht/')) return false;
    const L = m[1] ? 'ht' : 'fr'; const page = m[2]; const rest = m[3] || '';
    if (m[1] && p === '/ht/') { res.writeHead(301, { ...baseHeaders, location: `/ht${url.search}`, 'cache-control': 'public, max-age=86400' }); res.end(); return true; }
    const base = baseOf(req);
    const key = `${Pt.currentVersion()}|${Pt.haitiDay()}|${base}|${L}|${p}|${url.search.slice(0, 200)}`;
    let hit = cache.get(key);
    if (!hit || Date.now() - hit.at > CACHE_MS) {
      const r = await build(L, page, rest, url.searchParams, base);
      const raw = Buffer.from(r.html);
      hit = { at: Date.now(), status: r.status, raw, gz: zlib.gzipSync(raw, { level: 9 }) };
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(key, hit);
    }
    const body = hit.raw; body.gz = hit.gz;
    write(req, res, baseHeaders, { status: hit.status, body, type: 'text/html; charset=utf-8', cache: hit.status === 200 ? 'public, max-age=60, stale-while-revalidate=600' : 'no-cache', extra: { 'content-language': L } });
    return true;
  }
  // Page 404 du portail pour une adresse inconnue demandée par un navigateur.
  function notFound(req, res, url, baseHeaders) {
    const L = url.pathname.startsWith('/ht/') ? 'ht' : 'fr';
    const r = notFoundPage(L, baseOf(req));
    write(req, res, baseHeaders, { status: 404, body: r.html, type: 'text/html; charset=utf-8', cache: 'no-cache', extra: { 'content-language': L } });
  }
  return { serve, notFound, pub, T };
}

module.exports = { createPortal, PORTAL_CSP, T, esc };

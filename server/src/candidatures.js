'use strict';
// Lot 3 — Inscriptions en ligne. L'école publie une campagne « inscriptions ouvertes » (une annonce interne est créée
// en même temps) ; le public la voit sur /inscriptions et dépose un dossier sur /inscription/<école> (FR) ou
// /ht/inscription/<école> (Kreyòl) : élève, responsable, pièces facultatives (2 × 1 Mo, PDF/JPEG/PNG). Anti-abus :
// même origine, champ piège, jeton horodaté signé (envoi trop rapide ou trop vieux refusé), limiteur par IP et par
// téléphone/e-mail (celui du portail public : 8 par heure). Le déposant reçoit une référence ; il ne peut rien lire.
// L'école (direction, secrétariat) examine et décide dans son portail ; l'acceptation crée l'élève, son inscription
// dans la classe choisie et son responsable. Tables cloisonnées par école (RLS) ; le dépôt public passe par la
// connexion système en fixant school_id depuis la campagne, jamais depuis le formulaire.
const crypto = require('node:crypto');
const P = require('./policy');
const { HttpError, notFound, audit, refuse } = require('./common');
const Up = require('./televersement');
const I = require('./identite');
const emailsEleves = require('./emails-eleves');

const DOC_MAX = 1024 * 1024, DOCS = 2;
const RELS = ['mere', 'pere', 'tuteur', 'grand_parent', 'frere_soeur', 'autre'];
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const clean = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
const str = (v, max) => clean(v).slice(0, max);
const id = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
const iso = () => new Date().toISOString();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: process.env.NORIA_TZ || 'America/Port-au-Prince' });
const staff = (u) => P.has(u, 'direction', 'secretariat');
const normalizePhone = (v) => require('./app').normalizePhone(v); // chargement différé (dépendance circulaire)

// Jeton de formulaire : horodatage signé par une clé propre au processus (aucun secret stocké).
const FORM_KEY = crypto.randomBytes(32);
const formToken = (now = Date.now()) => { const t = String(now); return `${t}.${crypto.createHmac('sha256', FORM_KEY).update(t).digest('base64url').slice(0, 22)}`; };
function formAge(tok) {
  const [t, sig] = String(tok || '').split('.');
  if (!t || !sig) return null;
  const want = crypto.createHmac('sha256', FORM_KEY).update(t).digest('base64url').slice(0, 22);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  return Date.now() - Number(t);
}
const MIN_FILL_MS = 3000, MAX_FILL_MS = 3 * 3600e3;

async function openCampaignBySlug(db, slug) {
  return db.get(`SELECT c.*, s.name AS school_name, s.slug FROM enrolment_campaign c JOIN school s ON s.id = c.school_id
    WHERE s.slug = ? AND s.status = 'active' AND c.status = 'ouverte' AND c.opens_on <= ? AND c.closes_on >= ? ORDER BY c.id DESC LIMIT 1`, slug, today(), today());
}

/* ---------- Textes FR / Kreyòl ---------- */
const X = {
  fr: { list: 'Inscriptions ouvertes', listIntro: 'Écoles qui reçoivent des demandes d’inscription en ligne. La demande ne vaut pas admission : l’école vous contactera.',
    none: 'Aucune campagne d’inscription ouverte en ce moment.', until: (d) => `jusqu’au ${d}`, apply: 'Déposer une demande', levels: 'Niveaux',
    form: (s) => `Demande d’inscription — ${s}`, closed: 'Les inscriptions en ligne de cette école sont fermées.', student: 'Élève', first: 'Prénom', last: 'Nom',
    birth: 'Date de naissance', sex: 'Sexe', F: 'Fille', M: 'Garçon', level: 'Niveau souhaité', prev: 'École précédente', guardian: 'Responsable', gname: 'Nom du responsable',
    rel: 'Lien', rels: { mere: 'Mère', pere: 'Père', tuteur: 'Tuteur', grand_parent: 'Grand-parent', frere_soeur: 'Frère / sœur', autre: 'Autre' }, phone: 'Téléphone', email: 'E-mail',
    contactHelp: 'Téléphone ou e-mail obligatoire (l’école vous contactera).', docs: 'Pièces (facultatif)', docHelp: 'Acte de naissance, bulletin… PDF, JPEG ou PNG, 1 Mo au plus chacun.',
    message: 'Message à l’école (facultatif)', send: 'Envoyer la demande', choose: 'Choisir…', hp: 'Ne pas remplir ce champ', fix: 'Corrigez les points suivants :',
    errFirst: 'Prénom obligatoire.', errLast: 'Nom obligatoire.', errBirth: 'Date de naissance invalide.', errG: 'Nom du responsable obligatoire.', errRel: 'Lien du responsable obligatoire.',
    errContact: 'Téléphone ou e-mail obligatoire.', errPhone: 'Téléphone invalide.', errEmail: 'E-mail invalide.', errDoc: 'Pièce refusée (PDF, JPEG ou PNG, 1 Mo au plus).',
    errFast: 'Envoi refusé : rechargez la page et réessayez.', tooMany: 'Trop de demandes depuis cette connexion. Réessayez plus tard.',
    done: 'Demande envoyée', doneText: (r) => `Votre demande est enregistrée. Référence : ${r}. Gardez-la : l’école vous contactera.`, privacy: 'Vos données ne sont visibles que par l’école choisie.' },
  ht: { list: 'Enskripsyon ouvè', listIntro: 'Lekòl ki resevwa demann enskripsyon sou entènèt. Demann nan pa vle di admisyon : lekòl la ap kontakte w.',
    none: 'Pa gen kanpay enskripsyon ouvè kounye a.', until: (d) => `jiska ${d}`, apply: 'Fè yon demann', levels: 'Nivo',
    form: (s) => `Demann enskripsyon — ${s}`, closed: 'Enskripsyon sou entènèt lekòl sa a fèmen.', student: 'Elèv', first: 'Prenon', last: 'Non',
    birth: 'Dat nesans', sex: 'Sèks', F: 'Fi', M: 'Gason', level: 'Nivo ou vle', prev: 'Lekòl anvan', guardian: 'Responsab', gname: 'Non responsab la',
    rel: 'Relasyon', rels: { mere: 'Manman', pere: 'Papa', tuteur: 'Titè', grand_parent: 'Granparan', frere_soeur: 'Frè / sè', autre: 'Lòt' }, phone: 'Telefòn', email: 'Imèl',
    contactHelp: 'Telefòn oswa imèl obligatwa (lekòl la ap kontakte w).', docs: 'Dokiman (si ou vle)', docHelp: 'Batistè, kanè… PDF, JPEG oswa PNG, 1 Mo pi plis chak.',
    message: 'Mesaj pou lekòl la (si ou vle)', send: 'Voye demann nan', choose: 'Chwazi…', hp: 'Pa ranpli chan sa a', fix: 'Korije pwen sa yo :',
    errFirst: 'Prenon obligatwa.', errLast: 'Non obligatwa.', errBirth: 'Dat nesans pa bon.', errG: 'Non responsab la obligatwa.', errRel: 'Relasyon responsab la obligatwa.',
    errContact: 'Telefòn oswa imèl obligatwa.', errPhone: 'Telefòn pa bon.', errEmail: 'Imèl pa bon.', errDoc: 'Dokiman refize (PDF, JPEG oswa PNG, 1 Mo pi plis).',
    errFast: 'Nou pa ka pran demann nan : rechaje paj la epi eseye ankò.', tooMany: 'Twòp demann sou koneksyon sa a. Eseye pita.',
    done: 'Demann voye', doneText: (r) => `Demann ou anrejistre. Referans : ${r}. Kenbe l : lekòl la ap kontakte w.`, privacy: 'Se lekòl ou chwazi a sèlman ki ka wè done ou yo.' },
};

function readApplication(b, L) {
  const x = X[L]; const errs = [];
  const o = { first_name: str(b.first_name, 60), last_name: str(b.last_name, 60), birth_date: str(b.birth_date, 10) || null, sex: ['F', 'M'].includes(b.sex) ? b.sex : null,
    level: str(b.level, 60) || null, previous_school: str(b.previous_school, 120) || null, guardian_name: str(b.guardian_name, 80),
    guardian_relation: RELS.includes(b.guardian_relation) ? b.guardian_relation : null, guardian_phone: str(b.guardian_phone, 30) || null,
    guardian_email: str(b.guardian_email, 254).toLowerCase() || null, message: str(b.message, 1000) || null };
  if (!o.first_name) errs.push(x.errFirst);
  if (!o.last_name) errs.push(x.errLast);
  if (o.birth_date && (!DAY.test(o.birth_date) || Number.isNaN(Date.parse(o.birth_date)) || o.birth_date > today() || o.birth_date < '1990-01-01')) errs.push(x.errBirth);
  if (o.guardian_name.length < 2) errs.push(x.errG);
  if (!o.guardian_relation) errs.push(x.errRel);
  if (!o.guardian_phone && !o.guardian_email) errs.push(x.errContact);
  if (o.guardian_phone) { const p = normalizePhone(o.guardian_phone); if (!p) errs.push(x.errPhone); else o.guardian_phone = p; }
  if (o.guardian_email && !EMAIL_RE.test(o.guardian_email)) errs.push(x.errEmail);
  const docs = [];
  for (let i = 1; i <= DOCS; i++) {
    const f = (b.__files || {})[`doc${i}`];
    if (!f || !f.data || !f.data.length) continue;
    try { const c = Up.checkFile(f, { max: DOC_MAX }); docs.push({ ...c, data: f.data }); } catch { errs.push(x.errDoc); }
  }
  return { o, errs, docs };
}

/* ---------- Site public ---------- */
const PATHS = /^\/(?:ht\/)?(?:inscriptions|inscription\/([a-z0-9-]{2,60}))$/;
function createSite(db, { ctx, render, write, esc }) {
  const pre = (L) => (L === 'ht' ? '/ht' : '');
  const page = (req, res, baseHeaders, L, title, body, status = 200) => write(req, res, baseHeaders, { status, body: render({ L, title, body, req, status }), type: 'text/html; charset=utf-8',
    cache: 'no-store, private', extra: { 'content-language': L, 'x-robots-tag': 'noindex' } });
  const field = (name, label, { type = 'text', value = '', req = true, extra = '' } = {}) =>
    `<label class="fld"><span>${esc(label)}${req ? ' <span class="req" aria-hidden="true">*</span>' : ''}</span><input name="${name}" type="${type}" value="${esc(value || '')}"${req ? ' required' : ''}${extra}></label>`;
  function form(L, c, v = {}, errs = []) {
    const x = X[L];
    return `<h1>${esc(x.form(c.school_name))}</h1><p><strong>${esc(c.title)}</strong> — ${esc(x.until(c.closes_on))}</p>${c.info ? `<p>${esc(c.info)}</p>` : ''}
${errs.length ? `<div class="alert" role="alert"><p>${esc(x.fix)}</p><ul>${[...new Set(errs)].map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
<form class="pf card" method="post" action="${pre(L)}/inscription/${esc(c.slug)}" enctype="multipart/form-data" novalidate><input type="hidden" name="t" value="${formToken()}">
<fieldset class="fld"><legend>${esc(x.student)}</legend>
${field('first_name', x.first, { value: v.first_name, extra: ' maxlength="60" autocomplete="off"' })}${field('last_name', x.last, { value: v.last_name, extra: ' maxlength="60" autocomplete="off"' })}
${field('birth_date', x.birth, { type: 'date', value: v.birth_date, req: false })}
<label class="fld"><span>${esc(x.sex)}</span><select name="sex"><option value="">${esc(x.choose)}</option><option value="F"${v.sex === 'F' ? ' selected' : ''}>${esc(x.F)}</option><option value="M"${v.sex === 'M' ? ' selected' : ''}>${esc(x.M)}</option></select></label>
${c.levels ? `<label class="fld"><span>${esc(x.level)}</span><select name="level"><option value="">${esc(x.choose)}</option>${c.levels.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).map((l) => `<option${v.level === l ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : field('level', x.level, { value: v.level, req: false, extra: ' maxlength="60"' })}
${field('previous_school', x.prev, { value: v.previous_school, req: false, extra: ' maxlength="120"' })}</fieldset>
<fieldset class="fld"><legend>${esc(x.guardian)}</legend>
${field('guardian_name', x.gname, { value: v.guardian_name, extra: ' maxlength="80" autocomplete="name"' })}
<label class="fld"><span>${esc(x.rel)} <span class="req" aria-hidden="true">*</span></span><select name="guardian_relation" required><option value="">${esc(x.choose)}</option>${RELS.map((r) => `<option value="${r}"${v.guardian_relation === r ? ' selected' : ''}>${esc(x.rels[r])}</option>`).join('')}</select></label>
${field('guardian_phone', x.phone, { type: 'tel', value: v.guardian_phone, req: false, extra: ' maxlength="30" autocomplete="tel" inputmode="tel"' })}
${field('guardian_email', x.email, { type: 'email', value: v.guardian_email, req: false, extra: ' maxlength="254" autocomplete="email" inputmode="email"' })}
<small class="mut">${esc(x.contactHelp)}</small></fieldset>
<fieldset class="fld"><legend>${esc(x.docs)}</legend><input name="doc1" type="file" accept="application/pdf,image/jpeg,image/png"><input name="doc2" type="file" accept="application/pdf,image/jpeg,image/png"><small class="mut">${esc(x.docHelp)}</small></fieldset>
<label class="fld">${esc(x.message)}<textarea name="message" rows="3" maxlength="1000">${esc(v.message || '')}</textarea></label>
<label class="hp" aria-hidden="true">${esc(x.hp)}<input name="site_web" tabindex="-1" autocomplete="off"></label>
<button class="btn" type="submit">${esc(x.send)}</button></form><p class="mut">${esc(x.privacy)}</p>`;
  }
  async function get(req, res, url, baseHeaders) {
    const m = url.pathname.match(PATHS); if (!m) return false;
    const L = url.pathname.startsWith('/ht/') ? 'ht' : 'fr'; const x = X[L];
    if (!m[1]) {
      const rows = await db.all(`SELECT c.title, c.closes_on, c.levels, s.name AS school_name, s.slug FROM enrolment_campaign c JOIN school s ON s.id = c.school_id
        WHERE s.status = 'active' AND c.status = 'ouverte' AND c.opens_on <= ? AND c.closes_on >= ? ORDER BY c.closes_on, s.name LIMIT 200`, today(), today());
      const body = `<h1>${esc(x.list)}</h1><p>${esc(x.listIntro)}</p>${rows.length ? `<ul class="cards">${rows.map((r) => `<li class="card"><h2>${esc(r.school_name)}</h2><p>${esc(r.title)} — ${esc(x.until(r.closes_on))}</p>${r.levels ? `<p class="mut">${esc(x.levels)} : ${esc(r.levels)}</p>` : ''}<p><a class="btn" href="${pre(L)}/inscription/${esc(r.slug)}">${esc(x.apply)}</a></p></li>`).join('')}</ul>` : `<p class="mut">${esc(x.none)}</p>`}`;
      page(req, res, baseHeaders, L, x.list, body); return true;
    }
    const c = await openCampaignBySlug(db, m[1]);
    if (!c) { page(req, res, baseHeaders, L, x.list, `<h1>${esc(x.list)}</h1><div class="alert" role="alert"><p>${esc(x.closed)}</p></div><p><a class="btn btn-o" href="${pre(L)}/inscriptions">${esc(x.list)}</a></p>`, 404); return true; }
    page(req, res, baseHeaders, L, x.form(c.school_name), form(L, c)); return true;
  }
  const sameOrigin = (req) => {
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;
    const o = req.headers.origin; if (!o || o === 'null') return true;
    try { return new URL(o).host === req.headers.host; } catch { return false; }
  };
  async function post(req, res, url, baseHeaders, ip) {
    const m = url.pathname.match(PATHS); if (!m || !m[1]) return false;
    const L = url.pathname.startsWith('/ht/') ? 'ht' : 'fr'; const x = X[L];
    if (!sameOrigin(req)) throw new HttpError(403, 'origine refusée');
    const c = await openCampaignBySlug(db, m[1]);
    if (!c) { page(req, res, baseHeaders, L, x.list, `<h1>${esc(x.list)}</h1><div class="alert" role="alert"><p>${esc(x.closed)}</p></div>`, 404); return true; }
    const ct = String(req.headers['content-type'] || '');
    let b;
    if (/^multipart\/form-data/i.test(ct)) { const { fields, files } = Up.parseMultipart(await Up.readBody(req, DOCS * DOC_MAX + 64 * 1024), ct); b = { ...fields, __files: files }; }
    else { let raw = ''; for await (const ch of req) { raw += ch; if (raw.length > 20000) throw new HttpError(413, 'trop volumineux'); } b = Object.fromEntries(new URLSearchParams(raw)); }
    const ref = () => `INS-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    // Champ piège rempli : même réponse qu'un succès, rien n'est enregistré.
    if (b.site_web) { page(req, res, baseHeaders, L, x.done, `<h1>${esc(x.done)}</h1><div class="okbox" role="status"><p>${esc(x.doneText(ref()))}</p></div>`); return true; }
    const age = formAge(b.t);
    if (age == null || age < MIN_FILL_MS || age > MAX_FILL_MS) { page(req, res, baseHeaders, L, x.form(c.school_name), form(L, c, b, [x.errFast]), 400); return true; }
    const { o, errs, docs } = readApplication(b, L);
    if (errs.length) { page(req, res, baseHeaders, L, x.form(c.school_name), form(L, c, o, errs), 400); return true; }
    const lim = ctx.publicLimit;
    const keys = [`cand-ip:${ip}`, `cand:${o.guardian_phone || o.guardian_email}`];
    if (await lim.blocked(keys)) { page(req, res, baseHeaders, L, x.form(c.school_name), `<h1>${esc(x.form(c.school_name))}</h1><div class="alert" role="alert"><p>${esc(x.tooMany)}</p></div>`, 429); return true; }
    await lim.fail(keys);
    const r = ref();
    // school_id vient de la campagne (jamais du formulaire).
    const aid = await db.insert(`INSERT INTO enrolment_application (school_id, campaign_id, ref, first_name, last_name, birth_date, sex, level, previous_school, guardian_name, guardian_relation,
      guardian_phone, guardian_email, message, lang, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, c.school_id, c.id, r, o.first_name, o.last_name, o.birth_date, o.sex, o.level,
    o.previous_school, o.guardian_name, o.guardian_relation, o.guardian_phone, o.guardian_email, o.message, L, 'recue', iso());
    for (const d of docs) await db.insert('INSERT INTO enrolment_document (school_id, application_id, name, type, size, data, created_at) VALUES (?,?,?,?,?,?,?)', c.school_id, aid, d.filename, d.mime, d.data.length, d.data.toString('base64'), iso());
    page(req, res, baseHeaders, L, x.done, `<h1>${esc(x.done)}</h1><div class="okbox" role="status"><p>${esc(x.doneText(r))}</p></div><p><a class="btn btn-o" href="${pre(L) || '/'}">NORIA</a></p>`);
    return true;
  }
  return { get, post, handlesPost: (p) => { const m = p.match(PATHS); return !!(m && m[1]); } };
}

/* ---------- Routes de l'école ---------- */
async function campaignFor(db, u, cid) { const c = await db.get('SELECT * FROM enrolment_campaign WHERE id = ? AND school_id = ?', id(cid), u.school_id); if (!c) notFound(); return c; }
async function appFor(db, u, aid) { const a = await db.get('SELECT * FROM enrolment_application WHERE id = ? AND school_id = ?', id(aid), u.school_id); if (!a) notFound(); return a; }

const routes = [
  ['GET', /^\/api\/candidatures$/, async (db, req, u, _m, ctx) => {
    if (!staff(u)) await refuse(ctx, u, 'candidature.list', 'enrolment_application', null, 'rôle');
    const st = req.query.get('statut');
    const campagnes = await db.all('SELECT * FROM enrolment_campaign WHERE school_id = ? ORDER BY id DESC LIMIT 20', u.school_id);
    const dossiers = await db.all(`SELECT a.id, a.ref, a.first_name, a.last_name, a.birth_date, a.level, a.guardian_name, a.guardian_phone, a.guardian_email, a.status, a.created_at, a.campaign_id, a.student_id,
      (SELECT COUNT(*) FROM enrolment_document d WHERE d.school_id = a.school_id AND d.application_id = a.id) AS pieces
      FROM enrolment_application a WHERE a.school_id = ?${st ? ' AND a.status = ?' : ''} ORDER BY CASE a.status WHEN 'recue' THEN 0 WHEN 'liste_attente' THEN 1 ELSE 2 END, a.id DESC LIMIT 300`,
    u.school_id, ...(st ? [st] : []));
    const school = await db.get('SELECT slug FROM school WHERE id = ?', u.school_id);
    const classes = await db.all('SELECT id, name FROM class WHERE school_id = ? AND archived_at IS NULL ORDER BY name', u.school_id);
    return { slug: school.slug, lien_fr: `/inscription/${school.slug}`, lien_ht: `/ht/inscription/${school.slug}`, campagnes, dossiers: dossiers.map((d) => ({ ...d, pieces: Number(d.pieces) })), classes, ecriture: true };
  }],
  // Ouvrir les inscriptions : crée la campagne et l'annonce « inscriptions ouvertes » (une seule campagne ouverte).
  ['POST', /^\/api\/candidatures\/campagnes$/, async (db, req, u, _m, ctx) => {
    if (!P.has(u, 'direction')) await refuse(ctx, u, 'candidature.campaign', 'enrolment_campaign', null, 'rôle');
    const b = req.body || {};
    const title = str(b.titre, 140) || 'Inscriptions ouvertes';
    const from = str(b.debut, 10) || today(), to = str(b.fin, 10);
    if (!DAY.test(from) || !DAY.test(to) || to < from) throw new HttpError(400, 'dates invalides (début ≤ fin, AAAA-MM-JJ)');
    if (await db.get("SELECT id FROM enrolment_campaign WHERE school_id = ? AND status = 'ouverte'", u.school_id)) throw new HttpError(409, 'une campagne est déjà ouverte : fermez-la d’abord');
    const info = str(b.info, 2000) || null, levels = str(b.niveaux, 400) || null;
    const school = await db.get('SELECT slug FROM school WHERE id = ?', u.school_id);
    const ann = await db.insert("INSERT INTO announcement (school_id, title, body, audience, created_by) VALUES (?,?,?,'ecole',?)", u.school_id, title,
      `${info ? `${info}\n\n` : ''}Demandes en ligne du ${from} au ${to} : /inscription/${school.slug} (Kreyòl : /ht/inscription/${school.slug}).`, u.id);
    const cid = await db.insert('INSERT INTO enrolment_campaign (school_id, title, info, levels, opens_on, closes_on, status, announcement_id, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      u.school_id, title, info, levels, from, to, 'ouverte', ann, u.id, iso());
    await audit(db, u, 'candidature.campaign.open', 'enrolment_campaign', cid, `${from} → ${to}`);
    return { id: cid, lien: `/inscription/${school.slug}` };
  }],
  ['POST', /^\/api\/candidatures\/campagnes\/(\d+)\/(fermer|rouvrir)$/, async (db, req, u, [cid, act], ctx) => {
    if (!P.has(u, 'direction')) await refuse(ctx, u, `candidature.campaign.${act}`, 'enrolment_campaign', cid, 'rôle');
    const c = await campaignFor(db, u, cid);
    if (act === 'rouvrir' && await db.get("SELECT id FROM enrolment_campaign WHERE school_id = ? AND status = 'ouverte' AND id <> ?", u.school_id, c.id)) throw new HttpError(409, 'une autre campagne est ouverte');
    await db.run('UPDATE enrolment_campaign SET status = ? WHERE id = ? AND school_id = ?', act === 'fermer' ? 'fermee' : 'ouverte', c.id, u.school_id);
    await audit(db, u, `candidature.campaign.${act}`, 'enrolment_campaign', c.id, null);
    return { statut: act === 'fermer' ? 'fermee' : 'ouverte' };
  }],
  ['GET', /^\/api\/candidatures\/(\d+)$/, async (db, req, u, [aid], ctx) => {
    if (!staff(u)) await refuse(ctx, u, 'candidature.read', 'enrolment_application', aid, 'rôle');
    const a = await appFor(db, u, aid);
    const pieces = await db.all('SELECT id, name, type, size FROM enrolment_document WHERE school_id = ? AND application_id = ? ORDER BY id', u.school_id, a.id);
    return { ...a, pieces };
  }],
  ['GET', /^\/api\/candidatures\/(\d+)\/pieces\/(\d+)$/, async (db, req, u, [aid, did], ctx) => {
    if (!staff(u)) await refuse(ctx, u, 'candidature.piece', 'enrolment_document', did, 'rôle');
    const a = await appFor(db, u, aid);
    const d = await db.get('SELECT * FROM enrolment_document WHERE id = ? AND application_id = ? AND school_id = ?', id(did), a.id, u.school_id); if (!d) notFound();
    await audit(db, u, 'candidature.piece', 'enrolment_document', d.id, null);
    return { __file: Buffer.from(d.data, 'base64'), type: d.type, filename: d.name, inline: req.query.get('voir') === '1' };
  }],
  // Décision : accepter (crée l'élève + inscription + responsable ; e-mail automatique si activé), liste d'attente, refuser.
  ['POST', /^\/api\/candidatures\/(\d+)\/decision$/, async (db, req, u, [aid], ctx) => {
    if (!staff(u)) await refuse(ctx, u, 'candidature.decide', 'enrolment_application', aid, 'rôle');
    const a = await appFor(db, u, aid); const b = req.body || {};
    if (a.status === 'acceptee' || a.status === 'refusee') throw new HttpError(409, `dossier déjà traité (${a.status})`);
    const note = str(b.note, 300) || null;
    if (b.decision === 'refuser' || b.decision === 'attente') {
      const st = b.decision === 'refuser' ? 'refusee' : 'liste_attente';
      if (st === 'refusee' && !note) throw new HttpError(400, 'motif obligatoire pour un refus');
      await db.run('UPDATE enrolment_application SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ? AND school_id = ?', st, u.id, iso(), note, a.id, u.school_id);
      await audit(db, u, `candidature.${st}`, 'enrolment_application', a.id, note);
      return { statut: st };
    }
    if (b.decision !== 'accepter') throw new HttpError(400, 'décision : accepter, attente ou refuser');
    const cls = await db.get('SELECT id, name FROM class WHERE id = ? AND school_id = ? AND archived_at IS NULL', id(b.class_id), u.school_id); if (!cls) notFound();
    const school = await db.get('SELECT id, name, initials FROM school WHERE id = ?', u.school_id);
    const { sid, code } = await db.tx(async (t) => {
      const code = await I.reserveStudentCode(t, u.school_id, I.baseCode(a.first_name, a.last_name, a.birth_date, I.schoolInitials(school)));
      const sid = await t.insert('INSERT INTO student (school_id, code, first_name, last_name, birth_date, sex) VALUES (?,?,?,?,?,?)', u.school_id, code, a.first_name, a.last_name, a.birth_date, a.sex);
      await t.insert('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', u.school_id, sid, cls.id, `inscription en ligne ${a.ref}`);
      await t.insert('INSERT INTO student_guardian (school_id, student_id, name, relation, phone, email, is_primary, can_pickup, notes) VALUES (?,?,?,?,?,?,?,?,?)',
        u.school_id, sid, a.guardian_name, a.guardian_relation, a.guardian_phone, a.guardian_email, 1, 1, null);
      await t.run("UPDATE enrolment_application SET status = 'acceptee', decided_by = ?, decided_at = ?, decision_note = ?, student_id = ? WHERE id = ? AND school_id = ?", u.id, iso(), note, sid, a.id, u.school_id);
      await audit(t, u, 'candidature.acceptee', 'enrolment_application', a.id, `élève ${code}, classe ${cls.name}`);
      await audit(t, u, 'student.create', 'student', sid, `inscription en ligne ${a.ref} [classe ${cls.name}, 1 responsable(s)]`);
      return { sid, code };
    });
    const email = await emailsEleves.autoCreate(db, ctx, u, sid);
    return { statut: 'acceptee', student_id: sid, code, classe: cls.name, email };
  }],
];

module.exports = { routes, createSite, PATHS, formToken, X };

'use strict';
// Invitations aux réunions de parents : e-mail d'abord (adaptateur e-mail existant : Resend en production),
// sinon lien WhatsApp « wa.me » préparé pour que l'école l'envoie elle-même (aucune API WhatsApp payante).
// Les parents sans e-mail ni numéro utilisable sont listés : aucun échec silencieux.
const P = require('./policy');
const { HttpError, notFound, audit, refuse } = require('./common');

const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
const isOrganizer = (u) => P.has(u, 'direction', 'secretariat');

// Adresse réelle : forme simple, et pas les adresses techniques (…@telephone.invalid, comptes fictifs).
function validEmail(v) {
  const s = clean(v).toLowerCase();
  if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(s)) return null;
  if (/\.(invalid|test|example|local)$/.test(s)) return null;
  return s;
}
// Numéro pour wa.me (chiffres seuls, indicatif compris). Prudent :
//   - 8 chiffres commençant par 2 à 5 → numéro haïtien local, préfixé 509 ;
//   - 509 + 8 chiffres (avec ou sans +) → gardé ;
//   - +XXXXXXXXXX ou 00XXXXXXXXXX (10 à 15 chiffres) → numéro international gardé (diaspora) ;
//   - tout le reste → null (numéro invalide).
function waPhone(v) {
  const raw = clean(v); if (!raw) return null;
  if (!/^[+\d\s().-]+$/.test(raw)) return null;
  const intl = raw.startsWith('+') || raw.startsWith('00');
  let d = raw.replace(/\D/g, ''); if (raw.startsWith('00')) d = d.slice(2);
  if (!intl && /^[2-5]\d{7}$/.test(d)) return `509${d}`;
  if (/^509\d{8}$/.test(d)) return /^509[2-5]/.test(d) ? d : null;
  if (intl && /^[1-9]\d{9,14}$/.test(d) && !d.startsWith('509')) return d;
  return null;
}
const waLink = (phone, message) => `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

function fmtDate(isoStr) {
  const t = Date.parse(isoStr); if (Number.isNaN(t)) return '';
  try { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Port-au-Prince' }).format(new Date(t)) + ' (heure d’Haïti)'; }
  catch { return new Date(t).toISOString(); }
}
function linkBase(req, ctx) {
  if (ctx.publicUrl) return ctx.publicUrl.replace(/\/$/, '');
  if (/^[\w.:-]+$/.test(req.headers.host || '')) return `${ctx.secureCookie ? 'https' : 'http'}://${req.headers.host}`;
  return '';
}

async function parentsOf(db, m) {
  const base = `SELECT DISTINCT au.id, au.display_name, au.email, au.phone FROM app_user au`;
  return m.audience === 'ecole'
    ? db.all(`${base} JOIN user_role ur ON ur.user_id = au.id AND ur.school_id = au.school_id AND ur.role = 'parent'
        WHERE au.school_id = ? AND au.state <> 'desactive' ORDER BY au.display_name`, m.school_id)
    : db.all(`${base} JOIN parent_link pl ON pl.parent_user_id = au.id AND pl.school_id = au.school_id
        JOIN enrollment e ON e.student_id = pl.student_id AND e.school_id = pl.school_id AND e.status = 'actif'
        WHERE au.school_id = ? AND e.class_id = ? AND au.state <> 'desactive' ORDER BY au.display_name`, m.school_id, m.class_id);
}

// Trie les parents : e-mail, WhatsApp, sans contact (avec motif).
function classify(parents) {
  const email = [], whatsapp = [], sans = [];
  for (const p of parents) {
    const e = validEmail(p.email);
    if (e) { email.push({ ...p, email: e }); continue; }
    const w = waPhone(p.phone);
    if (w) whatsapp.push({ ...p, wa: w });
    else sans.push({ id: p.id, nom: p.display_name, telephone: clean(p.phone) || null, motif: clean(p.phone) ? 'numéro invalide' : 'ni e-mail ni téléphone' });
  }
  return { email, whatsapp, sans };
}

function messages(m, school, link) {
  const quand = fmtDate(m.starts_at);
  const qui = m.audience === 'classe' && m.class_name ? ` (classe ${m.class_name})` : '';
  const subject = `${school} — Réunion de parents : ${m.title}`;
  const text = `Bonjour,\n\n${school} vous invite à la réunion de parents « ${m.title} »${qui}.\n${quand ? `Date : ${quand}\n` : ''}\nPour participer, ouvrez ce lien (connexion à votre compte NORIA) :\n${link}\n\nÀ bientôt,\n${school}\n\n— Message envoyé par NORIA. Merci de ne pas répondre à cet e-mail.`;
  const wa = `${school} : réunion de parents « ${m.title} »${quand ? ` — ${quand}` : ''}. Lien : ${link}`;
  return { subject, text, wa };
}

async function pool(items, n, fn) {
  let i = 0; const run = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
}

async function load(db, u, mid) {
  const x = Number(mid); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide');
  const m = await db.get('SELECT pm.*, c.name AS class_name FROM parent_meeting pm LEFT JOIN class c ON c.id = pm.class_id AND c.school_id = pm.school_id WHERE pm.id = ? AND pm.school_id = ?', x, u.school_id);
  if (!m) notFound();
  return m;
}

const routes = [
  // Aperçu sans envoi : combien recevront un e-mail, un lien WhatsApp, et qui n'a aucun contact.
  ['GET', /^\/api\/reunions-parents\/(\d+)\/invitations$/, async (db, req, u, [mid], ctx) => {
    if (!isOrganizer(u)) await refuse(ctx, u, 'reunion_parents.invite_preview', 'parent_meeting', mid, 'rôle');
    const m = await load(db, u, mid);
    const c = classify(await parentsOf(db, m));
    return { email: c.email.length, whatsapp: c.whatsapp.length, sans_contact: c.sans.length };
  }],
  ['POST', /^\/api\/reunions-parents\/(\d+)\/inviter$/, async (db, req, u, [mid], ctx) => {
    if (!isOrganizer(u)) await refuse(ctx, u, 'reunion_parents.invite', 'parent_meeting', mid, 'rôle');
    const m = await load(db, u, mid);
    if (m.status === 'terminee') throw new HttpError(409, 'réunion terminée');
    const base = linkBase(req, ctx); if (!base) throw new HttpError(500, 'NORIA_PUBLIC_URL manquant : adresse publique nécessaire au lien');
    const link = `${base}/#reunion=${m.id}`;
    const school = clean((await db.get('SELECT name FROM school WHERE id = ?', u.school_id) || {}).name) || 'Votre école';
    const msg = messages(m, school, link);
    const c = classify(await parentsOf(db, m));
    const sendEmail = !(req.body && req.body.email === false);
    const envoyes = [], echecs = [];
    if (sendEmail) {
      const ad = ctx.notifier.adapter('email');
      await pool(c.email, 4, async (p) => {
        try { await ad.send({ to: p.email, subject: msg.subject, text: msg.text }); envoyes.push({ id: p.id, nom: p.display_name, email: p.email }); }
        catch (e) { echecs.push({ id: p.id, nom: p.display_name, email: p.email, erreur: String(e.message).slice(0, 200) }); }
      });
    }
    // Un e-mail en échec : on propose WhatsApp si le parent a un numéro valide, sinon il rejoint « sans contact ».
    const whatsapp = c.whatsapp.map((p) => ({ id: p.id, nom: p.display_name, telephone: `+${p.wa}`, lien: waLink(p.wa, msg.wa) }));
    for (const f of echecs) {
      const p = c.email.find((x) => x.id === f.id); const w = waPhone(p && p.phone);
      if (w) whatsapp.push({ id: f.id, nom: f.nom, telephone: `+${w}`, lien: waLink(w, msg.wa), apres_echec_email: true });
    }
    await audit(db, u, 'reunion_parents.invite', 'parent_meeting', m.id, `email ${envoyes.length}, echec ${echecs.length}, whatsapp ${whatsapp.length}, sans ${c.sans.length}`);
    return {
      lien: link, message_whatsapp: msg.wa, simule: !!(ctx.notifier.simulated && ctx.notifier.simulated.email),
      recap: { emails_envoyes: envoyes.length, emails_echec: echecs.length, whatsapp: whatsapp.length, sans_contact: c.sans.length },
      emails: envoyes, echecs, whatsapp, sans_contact: c.sans,
    };
  }],
];

module.exports = { routes, waPhone, validEmail, waLink, classify };

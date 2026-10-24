'use strict';
// Lot 3 — Messagerie école ↔ familles. Un fil relie une famille (parent ou élève) à l'accueil de l'école
// (direction, secrétariat). Lu / non lu par personne, petite pièce jointe (PDF, JPEG, PNG ≤ 200 Ko), fils clos.
// Faible consommation : la liste ne renvoie jamais les corps des messages ; GET /api/messagerie/non-lus ne renvoie
// qu'un nombre (sondage espacé côté client). Avis facultatifs (NORIA_MESSAGES_AVIS=1) par e-mail ou Telegram : le
// texte de l'avis ne contient JAMAIS le contenu du message, seulement « vous avez un nouveau message ».
// Les enseignants, la comptabilité et la bibliothèque n'y ont pas accès ; tout est cloisonné par école (RLS).
const P = require('./policy');
const { HttpError, notFound, audit, refuse } = require('./common');
const { sniff } = require('./televersement');
const telegram = require('./telegram');

const ATT_MAX = 200 * 1024;
const clean = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
function text(v, label, min, max) { const s = clean(v); if (s.length < min || s.length > max) throw new HttpError(400, `${label} : ${min} à ${max} caractères`); return s; }
const id = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
const iso = () => new Date().toISOString();
const isStaff = (u) => P.has(u, 'direction', 'secretariat');
const isFamily = (u) => !isStaff(u) && P.has(u, 'parent', 'eleve');

function attachment(p) {
  if (!p || !p.data) return null;
  const raw = String(p.data).replace(/^data:[^,]*,/, '');
  if (raw.length > Math.ceil(ATT_MAX * 4 / 3) + 8) throw new HttpError(413, 'pièce jointe : 200 Ko au plus');
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length || buf.length > ATT_MAX) throw new HttpError(413, 'pièce jointe : 200 Ko au plus');
  const type = sniff(buf);
  if (!type) throw new HttpError(400, 'pièce jointe : PDF, JPEG ou PNG seulement');
  const name = (clean(p.nom || p.name).replace(/[^\w.\- ]+/g, '_').slice(0, 120)) || 'piece-jointe';
  return { name, type, size: buf.length, data: buf.toString('base64') };
}

async function threadFor(db, u, tid) {
  const t = await db.get('SELECT * FROM school_thread WHERE id = ? AND school_id = ?', id(tid), u.school_id);
  if (!t) notFound();
  if (!isStaff(u) && t.family_user_id !== u.id) notFound(); // une famille ne voit que ses propres fils
  return t;
}
async function markRead(db, u, t) {
  const last = await db.get('SELECT MAX(id) AS m FROM school_message WHERE school_id = ? AND thread_id = ?', u.school_id, t.id);
  if (!last || !last.m) return;
  const had = await db.get('SELECT 1 AS x FROM school_thread_read WHERE thread_id = ? AND user_id = ?', t.id, u.id);
  if (had) await db.run('UPDATE school_thread_read SET last_message_id = ?, read_at = ? WHERE thread_id = ? AND user_id = ?', last.m, iso(), t.id, u.id);
  else await db.run('INSERT INTO school_thread_read (school_id, thread_id, user_id, last_message_id, read_at) VALUES (?,?,?,?,?)', u.school_id, t.id, u.id, last.m, iso());
}
// Non lus : pour l'école, messages venant des familles ; pour une famille, réponses de l'école.
function unreadSql(u) {
  const other = isStaff(u) ? 'famille' : 'ecole';
  return { sql: `(SELECT COUNT(*) FROM school_message m WHERE m.school_id = th.school_id AND m.thread_id = th.id AND m.side = '${other}'
      AND m.id > COALESCE((SELECT r.last_message_id FROM school_thread_read r WHERE r.thread_id = th.id AND r.user_id = ?), 0))`, params: [u.id] };
}

async function notifyFamily(ctx, t, schoolName) {
  const env = ctx.env || process.env;
  if (String(env.NORIA_MESSAGES_AVIS || '0') !== '1') return 'desactive';
  try {
    const fam = await ctx.db.get('SELECT id, email, person_id FROM app_user WHERE id = ? AND school_id = ?', t.family_user_id, t.school_id);
    if (!fam) return 'aucun';
    const msg = `${schoolName} vous a répondu dans NORIA (messagerie). Ouvrez votre portail pour lire le message.`;
    if (telegram.enabled(ctx)) { const chat = await telegram.chatFor(ctx.db, fam); if (chat) { await telegram.sendMessage(ctx, chat, msg); return 'telegram'; } }
    if (fam.email && fam.email.includes('@') && !/\.invalid$/.test(fam.email)) { await ctx.notifier.adapter('email').send({ to: fam.email, subject: 'NORIA — nouveau message de l’école', text: msg }); return 'email'; }
    return 'aucun';
  } catch (e) { console.error(`[messagerie] avis impossible : ${e.message}`); return 'echec'; }
}

const routes = [
  // Liste des fils (sans corps) + nombre de non-lus. École : tous les fils ; famille : les siens.
  ['GET', /^\/api\/messagerie$/, async (db, req, u, _m, ctx) => {
    if (!isStaff(u) && !isFamily(u)) await refuse(ctx, u, 'messagerie.list', 'school_thread', null, 'rôle');
    const un = unreadSql(u);
    const where = isStaff(u) ? 'th.school_id = ?' : 'th.school_id = ? AND th.family_user_id = ?';
    const params = isStaff(u) ? [u.school_id] : [u.school_id, u.id];
    const statut = ['ouvert', 'clos'].includes(req.query.get('statut')) ? req.query.get('statut') : null;
    const rows = await db.all(`SELECT th.id, th.subject, th.status, th.last_side, th.last_at, th.student_id, us.display_name AS famille,
        st.first_name AS el_prenom, st.last_name AS el_nom, ${un.sql} AS non_lus
      FROM school_thread th JOIN app_user us ON us.id = th.family_user_id AND us.school_id = th.school_id
      LEFT JOIN student st ON st.id = th.student_id AND st.school_id = th.school_id
      WHERE ${where}${statut ? ' AND th.status = ?' : ''} ORDER BY th.last_at DESC, th.id DESC LIMIT 200`, ...un.params, ...params, ...(statut ? [statut] : []));
    const enfants = isFamily(u) ? await (async () => { const sc = P.studentScope(u, 'st'); return db.all(`SELECT st.id, st.first_name, st.last_name FROM student st WHERE ${sc.sql} ORDER BY st.first_name`, ...sc.params); })() : [];
    return { ecole: isStaff(u), fils: rows.map((r) => ({ ...r, non_lus: Number(r.non_lus) })), enfants };
  }],
  // Badge « non lus » : un seul nombre, pour le sondage espacé (60 s puis 2, 4, 8 min sans changement).
  ['GET', /^\/api\/messagerie\/non-lus$/, async (db, req, u) => {
    if (!isStaff(u) && !isFamily(u)) return { non_lus: 0 };
    const un = unreadSql(u);
    const where = isStaff(u) ? 'th.school_id = ?' : 'th.school_id = ? AND th.family_user_id = ?';
    const r = await db.get(`SELECT COALESCE(SUM(${un.sql}), 0) AS n FROM school_thread th WHERE ${where} AND th.status = 'ouvert'`, ...un.params, u.school_id, ...(isStaff(u) ? [] : [u.id]));
    return { non_lus: Number(r.n) };
  }],
  // Nouveau fil : seulement une famille (parent ou élève), adressé à la direction / au secrétariat.
  ['POST', /^\/api\/messagerie$/, async (db, req, u, _m, ctx) => {
    if (!isFamily(u)) await refuse(ctx, u, 'messagerie.create', 'school_thread', null, 'rôle');
    const b = req.body || {};
    const subject = text(b.sujet, 'sujet', 1, 140), body = text(b.message, 'message', 1, 2000), att = attachment(b.piece);
    let sid = null;
    if (b.student_id) {
      const sc = P.studentScope(u, 'st');
      const st = await db.get(`SELECT st.id FROM student st WHERE st.id = ? AND ${sc.sql}`, id(b.student_id), ...sc.params);
      if (!st) notFound();
      sid = st.id;
    }
    const recent = await db.get('SELECT COUNT(*) AS n FROM school_thread WHERE school_id = ? AND family_user_id = ? AND created_at > ?', u.school_id, u.id, new Date(Date.now() - 3600e3).toISOString());
    if (Number(recent.n) >= 10) throw new HttpError(429, 'trop de nouveaux fils en une heure');
    const at = iso();
    const tid = await db.insert('INSERT INTO school_thread (school_id, subject, family_user_id, student_id, status, last_side, created_at, last_at) VALUES (?,?,?,?,?,?,?,?)',
      u.school_id, subject, u.id, sid, 'ouvert', 'famille', at, at);
    await db.insert('INSERT INTO school_message (school_id, thread_id, author_user_id, side, body, att_name, att_type, att_size, att_data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      u.school_id, tid, u.id, 'famille', body, att && att.name, att && att.type, att && att.size, att && att.data, at);
    await markRead(db, u, { id: tid });
    await audit(db, u, 'messagerie.create', 'school_thread', tid, att ? 'avec pièce jointe' : null);
    return { id: tid };
  }],
  // Lecture d'un fil (marque comme lu). Les pièces jointes ne sont pas incluses : téléchargement séparé.
  ['GET', /^\/api\/messagerie\/(\d+)$/, async (db, req, u, [tid], ctx) => {
    if (!isStaff(u) && !isFamily(u)) await refuse(ctx, u, 'messagerie.read', 'school_thread', tid, 'rôle');
    const t = await threadFor(db, u, tid);
    const msgs = await db.all(`SELECT m.id, m.side, m.body, m.att_name, m.att_type, m.att_size, m.created_at, us.display_name AS auteur
      FROM school_message m JOIN app_user us ON us.id = m.author_user_id AND us.school_id = m.school_id
      WHERE m.school_id = ? AND m.thread_id = ? ORDER BY m.id`, u.school_id, t.id);
    // Accusé de lecture de l'autre côté : dernier message lu par quelqu'un de l'autre côté.
    const otherRead = isStaff(u)
      ? await db.get('SELECT MAX(last_message_id) AS m FROM school_thread_read WHERE thread_id = ? AND user_id = ?', t.id, t.family_user_id)
      : await db.get('SELECT MAX(r.last_message_id) AS m FROM school_thread_read r WHERE r.thread_id = ? AND r.user_id <> ?', t.id, t.family_user_id);
    await markRead(db, u, t);
    const fam = await db.get('SELECT display_name FROM app_user WHERE id = ? AND school_id = ?', t.family_user_id, u.school_id);
    return { id: t.id, sujet: t.subject, statut: t.status, famille: fam && fam.display_name, student_id: t.student_id, ecole: isStaff(u),
      lu_jusqua: otherRead && otherRead.m ? Number(otherRead.m) : 0, messages: msgs };
  }],
  ['POST', /^\/api\/messagerie\/(\d+)\/repondre$/, async (db, req, u, [tid], ctx) => {
    if (!isStaff(u) && !isFamily(u)) await refuse(ctx, u, 'messagerie.reply', 'school_thread', tid, 'rôle');
    const t = await threadFor(db, u, tid);
    if (t.status === 'clos') throw new HttpError(409, 'fil clos : ouvrez un nouveau fil');
    const b = req.body || {};
    const body = text(b.message, 'message', 1, 2000), att = attachment(b.piece);
    const side = isStaff(u) ? 'ecole' : 'famille', at = iso();
    const mid = await db.insert('INSERT INTO school_message (school_id, thread_id, author_user_id, side, body, att_name, att_type, att_size, att_data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      u.school_id, t.id, u.id, side, body, att && att.name, att && att.type, att && att.size, att && att.data, at);
    await db.run('UPDATE school_thread SET last_side = ?, last_at = ? WHERE id = ? AND school_id = ?', side, at, t.id, u.school_id);
    await markRead(db, u, t);
    await audit(db, u, 'messagerie.reply', 'school_thread', t.id, side);
    let avis = null;
    if (side === 'ecole') { const s = await db.get('SELECT name FROM school WHERE id = ?', u.school_id); avis = await notifyFamily(ctx, t, s ? s.name : 'L’école'); }
    return { id: mid, avis };
  }],
  ['GET', /^\/api\/messagerie\/(\d+)\/piece\/(\d+)$/, async (db, req, u, [tid, mid], ctx) => {
    if (!isStaff(u) && !isFamily(u)) await refuse(ctx, u, 'messagerie.piece', 'school_message', mid, 'rôle');
    const t = await threadFor(db, u, tid);
    const m = await db.get('SELECT att_name, att_type, att_data FROM school_message WHERE id = ? AND thread_id = ? AND school_id = ?', id(mid), t.id, u.school_id);
    if (!m || !m.att_data) notFound();
    return { __file: Buffer.from(m.att_data, 'base64'), type: m.att_type, filename: m.att_name, inline: req.query.get('voir') === '1' };
  }],
  // Clore / rouvrir : l'école seulement.
  ['POST', /^\/api\/messagerie\/(\d+)\/(clore|rouvrir)$/, async (db, req, u, [tid, act], ctx) => {
    if (!isStaff(u)) await refuse(ctx, u, `messagerie.${act}`, 'school_thread', tid, 'rôle');
    const t = await threadFor(db, u, tid);
    await db.run('UPDATE school_thread SET status = ? WHERE id = ? AND school_id = ?', act === 'clore' ? 'clos' : 'ouvert', t.id, u.school_id);
    await audit(db, u, `messagerie.${act}`, 'school_thread', t.id, null);
    return { statut: act === 'clore' ? 'clos' : 'ouvert' };
  }],
];

module.exports = { routes, attachment, ATT_MAX };

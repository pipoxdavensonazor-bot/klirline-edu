'use strict';
// Routes de l'assistant sécurité (super-admin uniquement, montées dans plateforme.js) et exécution des actions.
// Deux temps obligatoires : POST …/actions/preparer (rien n'est modifié ; un code part pour les actions critiques),
// puis POST …/actions/confirmer { token, confirmer: true, code? }. Chaque action est inscrite dans security_action
// (ajout seul) et platform_audit ; une annulation est une nouvelle action « annuler » qui référence la première.
const crypto = require('node:crypto');
const auth = require('./auth');
const otp = require('./otp');
const { HttpError } = require('./common');
const { ACTIONS, maskIp, maskAccount } = require('./securite');

const PENDING_MIN = 10;
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const int = (v, what) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, `${what} invalide`); return x; };
const cleanReason = (r, required) => {
  const s = String(r || '').trim();
  if (required && (s.length < 3 || s.length > 300)) throw new HttpError(400, 'motif obligatoire (3 à 300 caractères)');
  return s.slice(0, 300) || null;
};

// Cible « compte » : identifiant de connexion (e-mail ou téléphone), p:<personne>, u:<adhésion>, user_id ou person_id.
async function resolvePerson(db, params) {
  let pid = null;
  if (params.person_id) pid = int(params.person_id, 'personne');
  else if (params.user_id) { const u = await db.get('SELECT id, person_id FROM app_user WHERE id = ?', int(params.user_id, 'compte')); if (!u) throw new HttpError(404, 'compte introuvable'); if (!u.person_id) return { userIds: [u.id], pid: null, label: `compte n° ${u.id}` }; pid = u.person_id; }
  else if (params.account) {
    const a = String(params.account);
    if (/^p:\d+$/.test(a)) pid = Number(a.slice(2));
    else if (/^u:\d+$/.test(a)) return resolvePerson(db, { user_id: a.slice(2) });
    else if (a.includes('@')) { const p = await db.get('SELECT id FROM person WHERE email = ?', a.toLowerCase()); pid = p && p.id; }
    else { const rows = await db.all("SELECT DISTINCT person_id FROM app_user WHERE phone = ? AND person_id IS NOT NULL", a.startsWith('+') ? a : `+509${a.replace(/\D/g, '').slice(-8)}`); pid = rows.length === 1 ? rows[0].person_id : null; }
  }
  if (!pid) throw new HttpError(404, 'compte introuvable (aucune personne ne correspond)');
  const p = await db.get('SELECT id, email, locked_at FROM person WHERE id = ?', pid);
  if (!p) throw new HttpError(404, 'compte introuvable');
  const userIds = (await db.all('SELECT id FROM app_user WHERE person_id = ?', pid)).map((r) => r.id);
  return { pid, userIds, locked: !!p.locked_at, label: `personne n° ${pid} (${maskAccount(p.email)})` };
}
async function killSessions(db, userIds) { let n = 0; for (const id of userIds) n += (await db.run('DELETE FROM session WHERE user_id = ?', id)).changes || 0; return n; }

// Vérifie les paramètres et décrit l'action, sans rien modifier.
async function describe(db, req, type, params) {
  const p = params || {};
  switch (type) {
    case 'ip.bloquer': {
      const ip = String(p.ip || '').trim().replace(/^::ffff:/, '');
      if (!/^[0-9a-fA-F:.]{3,45}$/.test(ip)) throw new HttpError(400, 'adresse IP invalide');
      if (ip === String(req.ip || '').replace(/^::ffff:/, '')) throw new HttpError(400, 'refusé : c’est votre propre adresse IP (vous perdriez l’accès)');
      const minutes = Math.min(Math.max(Number(p.minutes) || 60, 5), 10080);
      return { params: { ip, minutes }, target: ip, fr: `Bloquer l’adresse ${maskIp(ip)} pendant ${minutes} min (toutes les routes /api).`, ht: `Bloke adrès ${maskIp(ip)} pandan ${minutes} minit.` };
    }
    case 'compte.verrouiller': case 'compte.deverrouiller': case 'compte.deconnecter': case 'compte.reinitialiser': {
      const r = await resolvePerson(db, p);
      const what = { 'compte.verrouiller': ['Verrouiller', 'Fèmen'], 'compte.deverrouiller': ['Déverrouiller', 'Louvri'], 'compte.deconnecter': ['Déconnecter', 'Dekonekte'], 'compte.reinitialiser': ['Forcer la réinitialisation du mot de passe de', 'Fòse chanjman modpas'] }[type];
      return { params: r.pid ? { person_id: r.pid } : { user_id: r.userIds[0] }, target: r.pid ? `p:${r.pid}` : `u:${r.userIds[0]}`, fr: `${what[0]} ${r.label} — ${r.userIds.length} adhésion(s) d’école.`, ht: `${what[1]} ${r.label}.` };
    }
    case 'ecole.deconnecter': case 'ecole.suspendre': {
      const s = await db.get('SELECT id, slug, name, status FROM school WHERE id = ?', int(p.school_id, 'école'));
      if (!s) throw new HttpError(404, 'école introuvable');
      if (type === 'ecole.suspendre' && s.status === 'suspendue') throw new HttpError(409, 'école déjà suspendue');
      return { params: { school_id: s.id }, target: `ecole:${s.id}`, fr: `${type === 'ecole.suspendre' ? 'Suspendre' : 'Déconnecter tous les comptes de'} l’école ${s.name} (${s.slug}).`, ht: `${type === 'ecole.suspendre' ? 'Sispann' : 'Dekonekte tout kont'} lekòl ${s.name}.` };
    }
    case 'ministere.deconnecter': case 'ministere.desactiver': {
      const m = await db.get('SELECT id, email, display_name, state FROM ministry_account WHERE id = ?', int(p.ministry_id, 'compte du ministère'));
      if (!m) throw new HttpError(404, 'compte du ministère introuvable');
      if (type === 'ministere.desactiver' && m.state !== 'actif') throw new HttpError(409, 'compte du ministère déjà désactivé');
      const lbl = `compte du ministère n° ${m.id} (${maskAccount(m.email)})`;
      return { params: { ministry_id: m.id }, target: `min:${m.id}`, fr: `${type === 'ministere.desactiver' ? 'Désactiver (et déconnecter)' : 'Déconnecter'} le ${lbl}.`, ht: `${type === 'ministere.desactiver' ? 'Dezaktive' : 'Dekonekte'} kont ministè n° ${m.id}.` };
    }
    case 'alerte.traiter': case 'alerte.faux_positif': {
      const a = await db.get('SELECT id, status, title_fr FROM security_alert WHERE id = ?', int(p.alert_id, 'alerte'));
      if (!a) throw new HttpError(404, 'alerte introuvable');
      if (a.status !== 'ouverte') throw new HttpError(409, 'alerte déjà fermée');
      return { params: { alert_id: a.id }, target: `alerte:${a.id}`, fr: `Marquer l’alerte n° ${a.id} (« ${a.title_fr} ») comme ${type === 'alerte.traiter' ? 'traitée' : 'faux positif'}.`, ht: `Make alèt n° ${a.id} ${type === 'alerte.traiter' ? 'trete' : 'fo alèt'}.` };
    }
    case 'annuler': {
      const a = await db.get('SELECT * FROM security_action WHERE id = ?', int(p.action_id, 'action'));
      if (!a) throw new HttpError(404, 'action introuvable');
      if (!a.undo_data) throw new HttpError(409, 'cette action ne peut pas être annulée');
      if (await db.get('SELECT id FROM security_action WHERE undo_of = ?', a.id)) throw new HttpError(409, 'action déjà annulée');
      return { params: { action_id: a.id }, target: `action:${a.id}`, fr: `Annuler l’action n° ${a.id} (${a.type} sur ${a.target}).`, ht: `Anile aksyon n° ${a.id}.` };
    }
    default: throw new HttpError(400, 'action inconnue');
  }
}

// Exécution (après confirmation seulement). Renvoie les données d'annulation (null = irréversible).
async function execute(t, type, p, admin, reason) {
  switch (type) {
    case 'ip.bloquer': {
      const id = await t.insert('INSERT INTO ip_block (ip, until_at) VALUES (?,?)', p.ip, iso(p.minutes * 60e3));
      return { undo: { ip_block_id: id }, result: `IP bloquée jusqu’à ${iso(p.minutes * 60e3)}` };
    }
    case 'compte.verrouiller': case 'compte.deverrouiller': {
      const r = await resolvePerson(t, p);
      if (!r.pid) throw new HttpError(409, 'compte sans identité globale : à désactiver par l’école');
      const lock = type === 'compte.verrouiller';
      if (lock === r.locked) throw new HttpError(409, lock ? 'compte déjà verrouillé' : 'compte non verrouillé');
      await t.run('UPDATE person SET locked_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', lock ? iso() : null, r.pid);
      const n = lock ? await killSessions(t, r.userIds) : 0;
      return { undo: { person_id: r.pid, relock: !lock }, result: lock ? `compte verrouillé, ${n} session(s) fermée(s)` : 'compte déverrouillé' };
    }
    case 'compte.deconnecter': { const r = await resolvePerson(t, p); return { undo: null, result: `${await killSessions(t, r.userIds)} session(s) fermée(s)` }; }
    case 'compte.reinitialiser': {
      const r = await resolvePerson(t, p);
      if (r.pid) await t.run('UPDATE person SET password_hash = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', r.pid);
      for (const id of r.userIds) await t.run('UPDATE app_user SET password_hash = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', id);
      const n = await killSessions(t, r.userIds);
      return { undo: null, result: `mot de passe effacé, ${n} session(s) fermée(s) ; la personne passe par « mot de passe oublié » ou la connexion par code` };
    }
    case 'ecole.deconnecter': return { undo: null, result: `${(await t.run('DELETE FROM session WHERE school_id = ?', p.school_id)).changes || 0} session(s) fermée(s)` };
    case 'ecole.suspendre': {
      // Même effet que la route existante POST /api/admin/ecoles/:id/suspendre (statut, motif, déconnexion immédiate).
      await t.run("UPDATE school SET status = 'suspendue', status_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", reason, p.school_id);
      await t.run('DELETE FROM session WHERE school_id = ?', p.school_id);
      await t.run('INSERT INTO platform_audit (admin_id, action, target, detail, outcome) VALUES (?,?,?,?,?)', admin.id, 'admin.school.suspendre', String(p.school_id), `assistant sécurité — ${reason}`, 'ok');
      return { undo: { school_id: p.school_id }, result: 'école suspendue, sessions fermées' };
    }
    case 'ministere.deconnecter': return { undo: null, result: `${(await t.run('DELETE FROM ministry_session WHERE account_id = ?', p.ministry_id)).changes || 0} session(s) fermée(s)` };
    case 'ministere.desactiver': {
      await t.run("UPDATE ministry_account SET state = 'desactive', state_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", `assistant sécurité : ${reason || ''}`.slice(0, 300), p.ministry_id);
      const n = (await t.run('DELETE FROM ministry_session WHERE account_id = ?', p.ministry_id)).changes || 0;
      return { undo: { ministry_id: p.ministry_id }, result: `compte du ministère désactivé, ${n} session(s) fermée(s)` };
    }
    case 'alerte.traiter': case 'alerte.faux_positif':
      await t.run('UPDATE security_alert SET status = ?, closed_at = ?, closed_by = ? WHERE id = ?', type === 'alerte.traiter' ? 'traitee' : 'faux_positif', iso(), admin.id, p.alert_id);
      return { undo: { alert_id: p.alert_id }, result: 'alerte fermée' };
    case 'annuler': {
      const a = await t.get('SELECT * FROM security_action WHERE id = ?', p.action_id);
      const u = JSON.parse(a.undo_data);
      if (a.type === 'ip.bloquer') await t.run('UPDATE ip_block SET lifted_at = ? WHERE id = ?', iso(), u.ip_block_id);
      else if (a.type === 'compte.verrouiller' || a.type === 'compte.deverrouiller') await t.run('UPDATE person SET locked_at = ? WHERE id = ?', u.relock ? iso() : null, u.person_id);
      else if (a.type === 'ecole.suspendre') {
        await t.run("UPDATE school SET status = 'active', status_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", reason || 'annulation depuis l’assistant sécurité', u.school_id);
        await t.run('INSERT INTO platform_audit (admin_id, action, target, detail, outcome) VALUES (?,?,?,?,?)', admin.id, 'admin.school.reactiver', String(u.school_id), `assistant sécurité — annulation de l’action ${a.id}`, 'ok');
      } else if (a.type === 'ministere.desactiver') await t.run("UPDATE ministry_account SET state = 'actif', state_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", `réactivé : annulation de l’action ${a.id}`, u.ministry_id);
      else if (a.type.startsWith('alerte.')) await t.run("UPDATE security_alert SET status = 'ouverte', closed_at = NULL, closed_by = NULL WHERE id = ?", u.alert_id);
      else throw new HttpError(409, 'annulation impossible');
      return { undo: null, result: `action n° ${a.id} annulée` };
    }
    default: throw new HttpError(400, 'action inconnue');
  }
}

const alertOut = (a, lang) => ({
  id: a.id, regle: a.rule, gravite: a.severity, statut: a.status, occurrences: Number(a.hits), premiere: a.first_at, derniere: a.last_at, fermee: a.closed_at,
  titre: { fr: a.title_fr, ht: a.title_ht }, explication: { fr: a.explain_fr, ht: a.explain_ht }, recommandation: { fr: a.reco_fr, ht: a.reco_ht },
  preuves: JSON.parse(a.evidence || '[]'),
  // Les paramètres réels (IP complète, identifiant) restent côté serveur : l'interface désigne une action par son rang.
  actions: JSON.parse(a.actions || '[]').map((x, i) => ({ index: i, type: x.type, critique: !!x.critical, libelle: x.label })),
});

function routes({ log, dbSize, backups }) {
  const sec = (ctx) => { if (!ctx.sec) throw new HttpError(503, 'assistant sécurité indisponible'); return ctx.sec; };
  const opts = { dbSize: null, backups };
  return [
    ['GET', /^\/api\/admin\/securite$/, async (db, req, _a, _m, ctx) => {
      const g = req.query.get('gravite'), s = req.query.get('statut') || 'ouverte', r = req.query.get('regle');
      const where = []; const p = [];
      if (['info', 'attention', 'critique'].includes(g)) { where.push('severity = ?'); p.push(g); }
      if (['ouverte', 'traitee', 'faux_positif'].includes(s)) { where.push('status = ?'); p.push(s); }
      if (r && /^[a-z_0-9]{2,40}$/.test(r)) { where.push('rule = ?'); p.push(r); }
      const rows = await db.all(`SELECT * FROM security_alert ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY CASE severity WHEN 'critique' THEN 0 WHEN 'attention' THEN 1 ELSE 2 END, last_at DESC LIMIT 200`, ...p);
      return { ...(await sec(ctx).score()), derniere_analyse: sec(ctx).lastRun(), llm: sec(ctx).llmEnabled, alertes: rows.map(alertOut) };
    }, { auth: true }],
    // Alertes hors de l'application (pt67) : état des canaux, liaison Telegram du super-admin, message de test.
    ['GET', /^\/api\/admin\/alertes$/, async (_db, _req, a, _m, ctx) => sec(ctx).alertes.status(a.id), { auth: true }],
    ['POST', /^\/api\/admin\/alertes\/telegram\/lien$/, async (db, req, a, _m, ctx) => {
      const st = await sec(ctx).alertes.status(a.id); if (!st.telegram_actif) throw new HttpError(404, 'Telegram non configuré');
      const r = await sec(ctx).alertes.link(a.id); if (r.error) throw new HttpError(429, 'trop de liens demandés, réessayez dans une heure');
      await log(db, a, 'admin.alertes.telegram.lien', String(a.id), 'lien Telegram demandé (15 min)', 'ok', req.ip);
      return r;
    }, { auth: true, write: true }],
    ['POST', /^\/api\/admin\/alertes\/telegram\/existant$/, async (db, req, a, _m, ctx) => {
      if (!(await sec(ctx).alertes.useExisting(a.id))) throw new HttpError(404, 'aucune conversation Telegram déjà reliée à votre adresse');
      await log(db, a, 'admin.alertes.telegram.relier', String(a.id), 'conversation existante réutilisée', 'ok', req.ip);
      return { ok: true };
    }, { auth: true, write: true }],
    ['POST', /^\/api\/admin\/alertes\/telegram\/delier$/, async (db, req, a, _m, ctx) => {
      const n = await sec(ctx).alertes.unlink(a.id);
      await log(db, a, 'admin.alertes.telegram.delier', String(a.id), `${n} liaison(s) retirée(s)`, 'ok', req.ip);
      return { ok: true, retires: n };
    }, { auth: true, write: true }],
    ['POST', /^\/api\/admin\/alertes\/test$/, async (db, req, a, _m, ctx) => {
      const n = await db.get("SELECT COUNT(*) AS n FROM platform_audit WHERE action = 'admin.alertes.test' AND admin_id = ? AND created_at > ?", a.id, new Date(Date.now() - 3600e3).toISOString().replace('T', ' ').slice(0, 19));
      if (Number(n.n) >= 5) throw new HttpError(429, 'au plus 5 messages de test par heure');
      const r = await sec(ctx).alertes.deliver('NORIA : message de test des alertes', 'NORIA sécurité — test : ce canal recevra les alertes critiques tout de suite et un récapitulatif des alertes « attention ». Aucune action à faire.', { force: true });
      await log(db, a, 'admin.alertes.test', String(a.id), `test → ${r.channels.join(', ') || 'aucun canal'}`, r.sent ? 'ok' : 'echec', req.ip);
      return { ok: r.sent, canaux: r.channels };
    }, { auth: true, write: true }],
    ['GET', /^\/api\/admin\/securite\/alertes\/(\d+)$/, async (db, _req, _a, [id]) => {
      const a = await db.get('SELECT * FROM security_alert WHERE id = ?', Number(id)); if (!a) throw new HttpError(404, 'introuvable');
      return alertOut(a);
    }, { auth: true }],
    ['POST', /^\/api\/admin\/securite\/analyser$/, async (db, req, a, _m, ctx) => {
      const r = await sec(ctx).analyse({ ...opts, dbSize: () => dbSize(db) });
      await log(db, a, 'admin.securite.analyser', null, `${r.candidats} constat(s), ${r.nouvelles} nouvelle(s) alerte(s)`, 'ok', req.ip);
      return r;
    }, { auth: true, write: true }],
    ['GET', /^\/api\/admin\/securite\/guide$/, async (db, req, _a, _m, ctx) => {
      const id = req.query.get('alerte'); const q = String(req.query.get('q') || 'pourquoi');
      const al = id ? await db.get('SELECT * FROM security_alert WHERE id = ?', Number(id)) : null;
      if (id && !al) throw new HttpError(404, 'introuvable');
      return sec(ctx).guide(al, q, req.query.get('lang'), req.query.get('texte'));
    }, { auth: true, quiet: true }],
    ['GET', /^\/api\/admin\/securite\/actions$/, async (db) => {
      const rows = await db.all('SELECT a.*, p.email AS admin_email FROM security_action a LEFT JOIN platform_admin p ON p.id = a.admin_id ORDER BY a.id DESC LIMIT 200');
      const undone = new Set(rows.filter((r) => r.undo_of).map((r) => Number(r.undo_of)));
      return rows.map((r) => ({ id: r.id, type: r.type, cible: r.type === 'ip.bloquer' ? maskIp(r.target) : r.target, alerte: r.alert_id, motif: r.reason, otp: !!Number(r.otp), date: r.created_at, admin: r.admin_email,
        annulable: !!r.undo_data && !undone.has(Number(r.id)), annulee: undone.has(Number(r.id)), annule: r.undo_of, libelle: (ACTIONS[r.type] || ACTIONS.annuler).label }));
    }, { auth: true }],
    // Étape 1 : préparation. Rien n'est modifié. Action critique : un code à 6 chiffres part au super-admin.
    ['POST', /^\/api\/admin\/securite\/actions\/preparer$/, async (db, req, a, _m, ctx) => {
      const b = req.body || {};
      let type = b.type, params = b.params || {}, alertId = null;
      if (b.alert_id != null && b.index != null) {
        const al = await db.get('SELECT id, actions FROM security_alert WHERE id = ?', int(b.alert_id, 'alerte'));
        if (!al) throw new HttpError(404, 'alerte introuvable');
        const x = JSON.parse(al.actions || '[]')[Number(b.index)];
        if (!x) throw new HttpError(400, 'action inconnue pour cette alerte');
        ({ type, params } = x); alertId = al.id;
      } else if (b.alert_id != null) alertId = int(b.alert_id, 'alerte');
      if (!ACTIONS[type]) throw new HttpError(400, 'action inconnue');
      if (type.startsWith('alerte.') && alertId) params = { alert_id: alertId };
      const d = await describe(db, req, type, params);
      const critical = ACTIONS[type].critical;
      const reason = cleanReason(b.reason, false); // motif d'une suspension : exigé au plus tard à la confirmation
      const token = crypto.randomBytes(24).toString('base64url');
      let code = null, channel = null;
      if (critical) {
        code = otp.newCode();
        const ad = await db.get('SELECT email, phone FROM platform_admin WHERE id = ?', a.id);
        channel = ad.phone ? 'sms' : 'email';
        try { await ctx.notifier.adapter(channel).send({ to: ad.phone || ad.email, subject: 'NORIA : confirmation d’une action de sécurité', text: `NORIA administration : code ${code} pour confirmer « ${ACTIONS[type].label.fr} ». Valable ${PENDING_MIN} min. Ne le donnez à personne.` }); }
        catch { await log(db, a, 'admin.securite.preparer', type, `envoi ${channel} en échec`, 'echec', req.ip); throw new HttpError(503, 'envoi du code impossible'); }
      }
      await db.run(`INSERT INTO security_pending (token_hash, admin_id, type, params, alert_id, critical, code_hash, expires_at) VALUES (?,?,?,?,?,?,?,?)`,
        auth.sha256(token), a.id, type, JSON.stringify({ ...d.params, reason }), alertId, critical ? 1 : 0, code ? otp.hashCode(code, `secu${a.id}`) : null, iso(PENDING_MIN * 60e3));
      await log(db, a, 'admin.securite.preparer', type, `${d.fr}${critical ? ` (code envoyé par ${channel})` : ''}`, 'ok', req.ip);
      return { token, type, critique: critical, canal: channel, resume: { fr: d.fr, ht: d.ht }, libelle: ACTIONS[type].label, minutes: PENDING_MIN };
    }, { auth: true, write: true }],
    // Étape 2 : confirmation explicite (confirmer: true) + code pour les actions critiques.
    ['POST', /^\/api\/admin\/securite\/actions\/confirmer$/, async (db, req, a, _m, ctx) => {
      const b = req.body || {};
      const row = await db.get('SELECT * FROM security_pending WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?', auth.sha256(String(b.token || '')), iso());
      if (!row || Number(row.admin_id) !== Number(a.id)) { await log(db, a, 'admin.securite.confirmer', null, 'demande absente ou expirée', 'refuse', req.ip); throw new HttpError(400, 'demande absente ou expirée : préparez l’action à nouveau'); }
      if (b.confirmer !== true) throw new HttpError(400, 'confirmation explicite requise (confirmer: true)');
      let viaOtp = false;
      if (Number(row.critical)) {
        const take = await db.run('UPDATE security_pending SET attempts = attempts + 1 WHERE id = ? AND used_at IS NULL AND attempts < ?', row.id, otp.MAX_ATTEMPTS);
        const c = String(b.code || '').replace(/\s/g, '');
        if (!take.changes || !(/^\d{6}$/.test(c) & otp.checkCode(c, `secu${a.id}`, row.code_hash))) {
          await log(db, a, 'admin.securite.confirmer', row.type, take.changes ? 'code erroné' : 'essais épuisés', 'refuse', req.ip);
          throw new HttpError(401, 'code invalide ou expiré');
        }
        viaOtp = true;
      }
      if (!(await db.run('UPDATE security_pending SET used_at = ? WHERE id = ? AND used_at IS NULL', iso(), row.id)).changes) throw new HttpError(409, 'demande déjà utilisée');
      const params = JSON.parse(row.params); const reason = cleanReason(b.reason, false) || params.reason || null; delete params.reason;
      if (row.type === 'ecole.suspendre' && (!reason || reason.length < 3)) throw new HttpError(400, 'motif obligatoire (3 à 300 caractères)');
      const d = await describe(db, req, row.type, params); // revalidation (état changé entre-temps ?)
      const out = await db.tx(async (t) => {
        const r = await execute(t, row.type, d.params, a, reason || 'action de l’assistant sécurité');
        const aid = await t.insert('INSERT INTO security_action (admin_id, type, target, params, alert_id, reason, undo_data, undo_of, otp, ip) VALUES (?,?,?,?,?,?,?,?,?,?)',
          a.id, row.type, d.target, JSON.stringify(d.params), row.alert_id, reason, r.undo ? JSON.stringify(r.undo) : null, row.type === 'annuler' ? d.params.action_id : null, viaOtp ? 1 : 0, req.ip);
        if (r.undo && r.undo.ip_block_id) await t.run('UPDATE ip_block SET action_id = ? WHERE id = ?', aid, r.undo.ip_block_id);
        await log(t, a, `admin.securite.${row.type}`, d.target, `${d.fr} → ${r.result}${reason ? ` — ${reason}` : ''}`, 'ok', req.ip);
        return { r, aid };
      });
      if (row.type === 'ip.bloquer' || (row.type === 'annuler')) ctx.sec && ctx.sec.refreshBlocks();
      return { ok: true, id: out.aid, type: row.type, resultat: out.r.result, annulable: !!out.r.undo };
    }, { auth: true, write: true }],
  ];
}

module.exports = { routes, describe, execute, resolvePerson };

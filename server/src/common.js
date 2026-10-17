'use strict';
// Outils partagés par les routes : erreurs HTTP, refus, journal d'audit.

function audit(db, u, action, recordType, recordId, reason, outcome = 'ok') {
  return db.run(`INSERT INTO audit_log (school_id, actor_user_id, action, record_type, record_id, reason, outcome)
    VALUES (?,?,?,?,?,?,?)`, u.school_id, u.id, action, recordType, recordId == null ? null : String(recordId), reason || null, outcome);
}
// Refus journalisé hors de la transaction de la requête : il reste écrit même si la requête échoue ensuite.
async function refuse(ctx, u, action, recordType, recordId, reason) {
  await ctx.db.asSchool(u.school_id, (t) => audit(t, u, action, recordType, recordId, reason, 'refuse'));
  forbid();
}

class HttpError extends Error { constructor(status, msg, headers) { super(msg); this.status = status; this.headers = headers || {}; } }
const forbid = () => { throw new HttpError(403, 'accès refusé'); };
// Hors périmètre : 404, pour ne pas révéler l'existence du dossier.
const notFound = () => { throw new HttpError(404, 'introuvable'); };

const isUnique = (e) => e && (e.code === '23505' || /UNIQUE constraint/.test(e.message));

module.exports = { HttpError, forbid, notFound, audit, refuse, isUnique };

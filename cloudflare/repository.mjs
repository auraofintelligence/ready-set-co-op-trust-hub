export const PARTICIPANT_STATUSES = Object.freeze([
  'interest', 'contacted', 'pilot_partner', 'founding_interest', 'withdrawn',
]);

function rows(result) {
  return result?.results ?? [];
}

export function participantFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    submissionId: row.submission_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    organisation: row.organisation,
    participantType: row.participant_type,
    authorityConfirmed: Boolean(row.authority_confirmed),
    interests: JSON.parse(row.interests_json),
    offer: row.offer,
    consentContact: Boolean(row.consent_contact),
    consentVersion: row.consent_version,
    consentFutureHandover: Boolean(row.consent_future_handover),
    initialOperatingEntityId: row.initial_operating_entity_id,
    currentOperatingEntityId: row.current_operating_entity_id,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function auditFromRow(row) {
  return {
    id: row.id,
    participantId: row.participant_id,
    entityId: row.entity_id,
    eventType: row.event_type,
    actor: row.actor,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    notesChanged: Boolean(row.notes_changed),
    createdAt: row.created_at,
  };
}

// Uses only the common D1/SQLite prepared-statement interface. All values,
// including search strings and IDs, are bound parameters.
export function createRepository(db) {
  return {
    async consumeRateLimit(bucketHash, now, expiresAt) {
      const result = await db.batch([
        db.prepare('DELETE FROM intake_rate_limits WHERE expires_at <= ?').bind(now),
        db.prepare(`INSERT INTO intake_rate_limits (bucket_hash, hits, expires_at)
          VALUES (?, 1, ?)
          ON CONFLICT(bucket_hash) DO UPDATE SET hits = hits + 1
          RETURNING hits`).bind(bucketHash, expiresAt),
      ]);
      return rows(result[1])[0]?.hits ?? 0;
    },

    async createIntake(data, now) {
      const id = crypto.randomUUID();
      // The unique submission ID makes retries safe. The audit SELECT is gated
      // on this attempt's newly generated ID, so a retry cannot duplicate it.
      await db.batch([
        db.prepare(`INSERT INTO participants (
          id, submission_id, name, email, phone, organisation, participant_type,
          authority_confirmed, interests_json, offer, consent_contact,
          consent_version, consent_future_handover, initial_operating_entity_id,
          current_operating_entity_id, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'sbt', 'sbt', 'interest', '', ?, ?)
          ON CONFLICT(submission_id) DO NOTHING`).bind(
          id, data.submissionId, data.name, data.email, data.phone, data.organisation,
          data.participantType, Number(data.authorityConfirmed), JSON.stringify(data.interests),
          data.offer, data.consentVersion, Number(data.consentFutureHandover), now, now,
        ),
        db.prepare(`INSERT INTO audit_events
          (id, participant_id, entity_id, event_type, actor, previous_status, new_status, notes_changed, created_at)
          SELECT ?, id, initial_operating_entity_id, 'intake_received', 'public_intake', NULL, status, 0, ?
          FROM participants WHERE id = ?`).bind(crypto.randomUUID(), now, id),
      ]);
      const saved = await db.prepare('SELECT * FROM participants WHERE submission_id = ?')
        .bind(data.submissionId).first();
      if (!saved) throw new Error('Intake persistence failed');
      const created = saved.id === id;
      const original = participantFromRow(saved);
      // The submission ID identifies one immutable consent/intake snapshot.
      // Retry normalisation matches validation (trimmed fields, lower-case
      // email, explicit optional defaults); interest order has no meaning.
      const comparable = value => JSON.stringify({
        submissionId: value.submissionId,
        name: value.name,
        email: value.email,
        phone: value.phone,
        organisation: value.organisation,
        participantType: value.participantType,
        authorityConfirmed: value.authorityConfirmed,
        interests: [...value.interests].sort(),
        offer: value.offer,
        consentVersion: value.consentVersion,
        consentFutureHandover: value.consentFutureHandover,
      });
      return { reference: saved.id, created, conflict: !created && comparable(original) !== comparable(data) };
    },

    async listParticipants({ page, pageSize, status, search }) {
      const where = [];
      const values = [];
      if (status) {
        where.push('status = ?');
        values.push(status);
      }
      if (search) {
        // instr treats SQL wildcards as literal text, unlike LIKE.
        where.push(`(instr(lower(name), lower(?)) > 0 OR instr(lower(email), lower(?)) > 0
          OR instr(lower(organisation), lower(?)) > 0)`);
        values.push(search, search, search);
      }
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const result = await db.batch([
        db.prepare(`SELECT * FROM participants${clause} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`)
          .bind(...values, pageSize, (page - 1) * pageSize),
        db.prepare(`SELECT COUNT(*) AS total FROM participants${clause}`).bind(...values),
      ]);
      return {
        participants: rows(result[0]).map(participantFromRow),
        total: rows(result[1])[0]?.total ?? 0,
        page,
        pageSize,
      };
    },

    async reviewParticipant(id, { status, notes, expectedUpdatedAt }, actor, now) {
      const eventId = crypto.randomUUID();
      // Snapshot and update share a transaction, preserving the real prior
      // status even if two reviewers act at the same time.
      const result = await db.batch([
        db.prepare(`INSERT INTO audit_events
          (id, participant_id, entity_id, event_type, actor, previous_status, new_status, notes_changed, created_at)
          SELECT ?, id, current_operating_entity_id, 'review_updated', ?, status, ?,
            CASE WHEN ? IS NULL OR notes = ? THEN 0 ELSE 1 END, ?
          FROM participants WHERE id = ? AND (? IS NULL OR updated_at = ?)
            AND (status <> ? OR (? IS NOT NULL AND notes <> ?))`)
          .bind(eventId, actor, status, notes ?? null, notes ?? null, now, id,
            expectedUpdatedAt ?? null, expectedUpdatedAt ?? null, status, notes ?? null, notes ?? null),
        db.prepare(`UPDATE participants SET status = ?, notes = COALESCE(?, notes),
          updated_at = CASE WHEN updated_at >= ?
            THEN strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds') ELSE ? END
          WHERE id = ? AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`)
          .bind(status, notes ?? null, now, now, id, eventId),
        db.prepare('SELECT * FROM participants WHERE id = ?').bind(id),
        db.prepare('SELECT id FROM audit_events WHERE id = ?').bind(eventId),
      ]);
      const participant = participantFromRow(rows(result[2])[0]);
      const conflict = Boolean(participant && expectedUpdatedAt &&
        participant.updatedAt !== expectedUpdatedAt && !rows(result[3]).length);
      return { participant, conflict };
    },

    async exportAll(now) {
      // All three SELECTs share one transaction/snapshot on D1 and local SQLite.
      const result = await db.batch([
        db.prepare('SELECT * FROM operating_entities ORDER BY id'),
        db.prepare('SELECT * FROM participants ORDER BY created_at, id'),
        // rowid preserves append order when several events share a timestamp.
        db.prepare('SELECT * FROM audit_events ORDER BY rowid'),
      ]);
      return {
        schemaVersion: 1,
        exportedAt: now,
        entities: rows(result[0]).map(row => ({
          id: row.id, legalName: row.legal_name, abn: row.abn,
          legalStatus: row.legal_status, description: row.description,
        })),
        participants: rows(result[1]).map(participantFromRow),
        auditEvents: rows(result[2]).map(auditFromRow),
      };
    },
  };
}

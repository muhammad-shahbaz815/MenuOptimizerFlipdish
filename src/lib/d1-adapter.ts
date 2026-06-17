import type { Adapter, AdapterAccount, AdapterSession, AdapterUser, VerificationToken } from 'next-auth/adapters';
import { getDb, nowIso } from '@/lib/db';

const mapUser = (row: Record<string, unknown>): AdapterUser => ({
  id: String(row.id),
  name: row.name ? String(row.name) : null,
  email: String(row.email),
  emailVerified: row.emailVerified ? new Date(String(row.emailVerified)) : null,
  image: row.image ? String(row.image) : null,
});

const mapSession = (row: Record<string, unknown>): AdapterSession => ({
  sessionToken: String(row.sessionToken),
  userId: String(row.userId),
  expires: new Date(String(row.expires)),
});

const _mapAccount = (row: Record<string, unknown>): AdapterAccount => ({
  userId: String(row.userId),
  type: row.type as AdapterAccount['type'],
  provider: String(row.provider),
  providerAccountId: String(row.providerAccountId),
  refresh_token: row.refresh_token ? String(row.refresh_token) : undefined,
  access_token: row.access_token ? String(row.access_token) : undefined,
  expires_at: row.expires_at ? Number(row.expires_at) : undefined,
  token_type: row.token_type ? (String(row.token_type).toLowerCase() as Lowercase<string>) : undefined,
  scope: row.scope ? String(row.scope) : undefined,
  id_token: row.id_token ? String(row.id_token) : undefined,
  session_state: row.session_state ? String(row.session_state) : undefined,
});

export const D1Adapter = (): Adapter => {
  const db = () => getDb();

  return {
    async createUser(user: AdapterUser) {
      const id = crypto.randomUUID();
      const createdAt = nowIso();
      await db()
        .prepare(
          `INSERT INTO User
           (id, name, email, emailVerified, image, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          user.name ?? null,
          user.email,
          user.emailVerified ? user.emailVerified.toISOString() : null,
          user.image ?? null,
          createdAt,
          createdAt,
        )
        .run();
      return { ...user, id };
    },

    async getUser(id) {
      const { results } = await db().prepare('SELECT * FROM User WHERE id = ?').bind(id).all();
      const row = results?.[0];
      return row ? mapUser(row as Record<string, unknown>) : null;
    },

    async getUserByEmail(email) {
      const { results } = await db().prepare('SELECT * FROM User WHERE email = ?').bind(email).all();
      const row = results?.[0];
      return row ? mapUser(row as Record<string, unknown>) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const { results } = await db()
        .prepare(
          `SELECT u.* FROM User u
           INNER JOIN Account a ON a.userId = u.id
           WHERE a.provider = ? AND a.providerAccountId = ?`,
        )
        .bind(provider, providerAccountId)
        .all();
      const row = results?.[0];
      return row ? mapUser(row as Record<string, unknown>) : null;
    },

    async updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, 'id'>) {
      if (!user.id) {
        throw new Error('Missing user id.');
      }
      const updatedAt = nowIso();
      await db()
        .prepare(
          `UPDATE User
           SET name = ?, email = ?, emailVerified = ?, image = ?, updatedAt = ?
           WHERE id = ?`,
        )
        .bind(
          user.name ?? null,
          user.email ?? null,
          user.emailVerified ? user.emailVerified.toISOString() : null,
          user.image ?? null,
          updatedAt,
          user.id,
        )
        .run();
      const updated = await db().prepare('SELECT * FROM User WHERE id = ?').bind(user.id).all();
      const row = updated.results?.[0];
      return row ? mapUser(row as Record<string, unknown>) : (user as AdapterUser);
    },

    async deleteUser(id) {
      const existing = await db().prepare('SELECT * FROM User WHERE id = ?').bind(id).all();
      const row = existing.results?.[0];
      await db().prepare('DELETE FROM User WHERE id = ?').bind(id).run();
      return row ? mapUser(row as Record<string, unknown>) : null;
    },

    async linkAccount(account: AdapterAccount) {
      const id = crypto.randomUUID();
      const createdAt = nowIso();
      await db()
        .prepare(
          `INSERT INTO Account
           (id, userId, type, provider, providerAccountId, refresh_token, access_token, expires_at,
            token_type, scope, id_token, session_state, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          account.userId,
          account.type,
          account.provider,
          account.providerAccountId,
          account.refresh_token ?? null,
          account.access_token ?? null,
          account.expires_at ?? null,
          account.token_type ?? null,
          account.scope ?? null,
          account.id_token ?? null,
          account.session_state ?? null,
          createdAt,
          createdAt,
        )
        .run();
      return account;
    },

    async unlinkAccount({ provider, providerAccountId }: { provider: string; providerAccountId: string }) {
      await db().prepare('DELETE FROM Account WHERE provider = ? AND providerAccountId = ?').bind(provider, providerAccountId).run();
    },

    async createSession(session: AdapterSession) {
      const id = crypto.randomUUID();
      const createdAt = nowIso();
      await db()
        .prepare(
          `INSERT INTO Session
           (id, sessionToken, userId, expires, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, session.sessionToken, session.userId, session.expires.toISOString(), createdAt, createdAt)
        .run();
      return session;
    },

    async getSessionAndUser(sessionToken) {
      const { results } = await db()
        .prepare(
          `SELECT s.sessionToken, s.userId, s.expires,
                  u.id as user_id, u.name as user_name, u.email as user_email,
                  u.emailVerified as user_emailVerified, u.image as user_image
           FROM Session s
           INNER JOIN User u ON u.id = s.userId
           WHERE s.sessionToken = ?`,
        )
        .bind(sessionToken)
        .all();
      const row = results?.[0] as Record<string, unknown> | undefined;
      if (!row) {
        return null;
      }
      return {
        session: mapSession(row),
        user: mapUser({
          id: row.user_id,
          name: row.user_name,
          email: row.user_email,
          emailVerified: row.user_emailVerified,
          image: row.user_image,
        }),
      };
    },

    async updateSession(session: Partial<AdapterSession> & Pick<AdapterSession, 'sessionToken'>) {
      const updatedAt = nowIso();
      await db()
        .prepare(
          `UPDATE Session
           SET userId = ?, expires = ?, updatedAt = ?
           WHERE sessionToken = ?`,
        )
        .bind(session.userId ?? null, session.expires ? session.expires.toISOString() : null, updatedAt, session.sessionToken)
        .run();
      const { results } = await db().prepare('SELECT * FROM Session WHERE sessionToken = ?').bind(session.sessionToken).all();
      const row = results?.[0];
      return row ? mapSession(row as Record<string, unknown>) : null;
    },

    async deleteSession(sessionToken) {
      const { results } = await db().prepare('SELECT * FROM Session WHERE sessionToken = ?').bind(sessionToken).all();
      const row = results?.[0];
      await db().prepare('DELETE FROM Session WHERE sessionToken = ?').bind(sessionToken).run();
      return row ? mapSession(row as Record<string, unknown>) : null;
    },

    async createVerificationToken(token: VerificationToken) {
      await db()
        .prepare(
          `INSERT INTO VerificationToken
           (identifier, token, expires)
           VALUES (?, ?, ?)`,
        )
        .bind(token.identifier, token.token, token.expires.toISOString())
        .run();
      return token;
    },

    async useVerificationToken(params) {
      const { results } = await db()
        .prepare('SELECT * FROM VerificationToken WHERE identifier = ? AND token = ?')
        .bind(params.identifier, params.token)
        .all();
      const row = results?.[0] as Record<string, unknown> | undefined;
      if (!row) {
        return null;
      }
      await db().prepare('DELETE FROM VerificationToken WHERE identifier = ? AND token = ?').bind(params.identifier, params.token).run();
      return {
        identifier: String(row.identifier),
        token: String(row.token),
        expires: new Date(String(row.expires)),
      } as VerificationToken;
    },
  };
};

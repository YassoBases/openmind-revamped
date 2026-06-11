/**
 * Lightweight device auth: onboarding returns { studentId, token }; the token
 * (random 256-bit, stored hashed) rides every request as a Bearer header.
 * Nickname-only accounts — no email, no password (minors).
 */
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Store, StudentRow } from './store/types.js';

export function newToken(): { token: string; hash: string } {
  const token = 'emt_' + randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

declare module 'fastify' {
  interface FastifyRequest {
    student?: StudentRow;
  }
}

export function makeAuthHook(store: Store) {
  return async function authHook(req: FastifyRequest, reply: FastifyReply) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'missing bearer token', requestId: req.id },
      });
    }
    const student = await store.getStudentByToken(hashToken(header.slice(7)));
    if (!student) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'invalid token', requestId: req.id },
      });
    }
    req.student = student;
  };
}

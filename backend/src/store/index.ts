import { config } from '../config.js';
import { MemoryStore } from './memory.js';
import { createPrismaStore } from './prisma.js';
import type { Store } from './types.js';

export type { Store } from './types.js';
export type { GameRow, StudentRow, PlaySessionRow, GameStatus } from './types.js';

export async function createStore(logger: { warn: (msg: string) => void; info: (msg: string) => void }): Promise<Store> {
  if (config.databaseUrl) {
    try {
      const store = await createPrismaStore();
      if (await store.ping()) {
        logger.info('[store] Postgres connected (Prisma)');
        return store;
      }
      logger.warn('[store] DATABASE_URL set but unreachable — falling back to in-memory store');
    } catch (err) {
      logger.warn(`[store] Prisma init failed (${(err as Error).message}) — falling back to in-memory store`);
    }
  } else {
    logger.warn('[store] no DATABASE_URL — using in-memory store (data is lost on restart)');
  }
  return new MemoryStore();
}

/**
 * Seed a demo student (Postgres only — memory mode reseeds on boot anyway).
 *   npm -w backend run seed
 * Prints the bearer token to use from the app/curl.
 */
import { newToken } from '../auth.js';
import { createStore } from '../store/index.js';

const log = { info: console.log, warn: console.warn };

const store = await createStore(log);
const { token, hash } = newToken();
const student = await store.createStudent({
  name: 'Demo',
  gender: null,
  grade: 3,
  language: 'en',
  color: '#1CB0F6',
  interest: 'space',
  learningContext: null,
  interests: ['nature_environment'],
  dailyGoal: 3,
  tokenHash: hash,
});

console.log('--- demo student seeded ---');
console.log('studentId:', student.id);
console.log('token:    ', token);
console.log(`try: curl -H "Authorization: Bearer ${token}" http://localhost:8080/api/v1/students/me`);
if (store.kind === 'memory') {
  console.log('(memory store: this student only exists for this process — set DATABASE_URL for persistence)');
}
process.exit(0);

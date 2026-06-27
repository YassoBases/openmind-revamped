/** In-memory store — dev fallback when DATABASE_URL is unset. Data dies on restart. */
import { randomUUID } from "node:crypto";
import type {
  GameRow,
  GradeRow,
  LearningPathRow,
  LearningPathWithNodes,
  PathNodeRow,
  PlaySessionRow,
  PlacementTestSessionRow,
  QuestionDifficulty,
  QuestionRow,
  Store,
  StudentRow,
  SubjectRow,
  SubjectWithPaths,
  XpEventRow,
} from "./types.js";

export class MemoryStore implements Store {
  kind = "memory" as const;
  private students = new Map<string, StudentRow>();
  private games = new Map<string, GameRow>();
  private sessions: PlaySessionRow[] = [];
  private xpEvents: XpEventRow[] = [];
  private streakDays = new Set<string>();
  private cache = new Map<
    string,
    { content: Record<string, unknown>; expiresAt: number }
  >();
  private grades = new Map<string, GradeRow>();
  private subjects = new Map<string, SubjectRow>();
  private learningPaths = new Map<string, LearningPathRow>();
  private pathNodes = new Map<string, PathNodeRow>();
  private questions = new Map<string, QuestionRow>();
  private placementTests = new Map<string, PlacementTestSessionRow>();

  async ping() {
    return true;
  }

  async createStudent(
    data: Omit<
      StudentRow,
      "id" | "createdAt" | "xp" | "streakCount" | "streakLastPlayedAt"
    >,
  ) {
    const row: StudentRow = {
      ...data,
      id: randomUUID(),
      xp: 0,
      streakCount: 0,
      streakLastPlayedAt: null,
      createdAt: new Date(),
    };
    this.students.set(row.id, row);
    return row;
  }

  async getStudentByToken(tokenHash: string) {
    for (const s of this.students.values())
      if (s.tokenHash === tokenHash) return s;
    return null;
  }

  async getStudent(id: string) {
    return this.students.get(id) ?? null;
  }

  async updateStudent(id: string, patch: Partial<StudentRow>) {
    const s = this.students.get(id);
    if (!s) throw new Error("student not found");
    Object.assign(s, patch);
    return s;
  }

  async createGame(
    data: Omit<
      GameRow,
      "createdAt" | "deletedAt" | "bestScore" | "playCount" | "lastPlayedAt"
    >,
  ) {
    const row: GameRow = {
      ...data,
      bestScore: 0,
      playCount: 0,
      lastPlayedAt: null,
      createdAt: new Date(),
      deletedAt: null,
    };
    this.games.set(row.id, row);
    return row;
  }

  async getGame(id: string) {
    return this.games.get(id) ?? null;
  }

  async updateGame(id: string, patch: Partial<GameRow>) {
    const g = this.games.get(id);
    if (!g) throw new Error("game not found");
    Object.assign(g, patch);
    return g;
  }

  async listGames(studentId: string, opts: { limit: number; offset: number }) {
    const all = [...this.games.values()]
      .filter((g) => g.studentId === studentId && !g.deletedAt)
      .sort(
        (a, b) =>
          (b.lastPlayedAt ?? b.createdAt).getTime() -
          (a.lastPlayedAt ?? a.createdAt).getTime(),
      );
    return {
      items: all.slice(opts.offset, opts.offset + opts.limit),
      total: all.length,
    };
  }

  async createPlaySession(data: Omit<PlaySessionRow, "id" | "createdAt">) {
    const row: PlaySessionRow = {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.sessions.push(row);
    return row;
  }

  async recentPlaySessions(studentId: string, limit: number) {
    return this.sessions
      .filter((s) => s.studentId === studentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async playSessionsSince(studentId: string, since: Date) {
    return this.sessions.filter(
      (s) => s.studentId === studentId && s.createdAt >= since,
    );
  }

  async addXpEvent(studentId: string, amount: number, reason: string) {
    const row: XpEventRow = {
      id: randomUUID(),
      studentId,
      amount,
      reason,
      createdAt: new Date(),
    };
    this.xpEvents.push(row);
    return row;
  }

  async listXpEvents(studentId: string, limit: number) {
    return this.xpEvents
      .filter((e) => e.studentId === studentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async addStreakDay(studentId: string, day: Date) {
    const key = `${studentId}|${day.toISOString().slice(0, 10)}`;
    if (this.streakDays.has(key)) return false;
    this.streakDays.add(key);
    return true;
  }

  async cacheGet(key: string) {
    const hit = this.cache.get(key);
    if (!hit || hit.expiresAt < Date.now()) return null;
    return hit.content;
  }

  async cacheSet(key: string, content: Record<string, unknown>, ttlMs: number) {
    this.cache.set(key, { content, expiresAt: Date.now() + ttlMs });
  }

  // Grades ---------------------------------------------------------------------
  async createGrade(data: Omit<GradeRow, "id" | "createdAt">) {
    for (const g of this.grades.values()) {
      if (g.index === data.index)
        throw new Error(`grade index ${data.index} already exists`);
    }
    const row: GradeRow = { ...data, id: randomUUID(), createdAt: new Date() };
    this.grades.set(row.id, row);
    return row;
  }
  async getGrade(id: string) {
    return this.grades.get(id) ?? null;
  }
  async getGradeByIndex(index: number) {
    for (const g of this.grades.values()) if (g.index === index) return g;
    return null;
  }
  async listGrades() {
    return [...this.grades.values()].sort((a, b) => a.index - b.index);
  }
  async updateGrade(
    id: string,
    patch: Partial<Pick<GradeRow, "name" | "index">>,
  ) {
    const g = this.grades.get(id);
    if (!g) throw new Error("grade not found");
    if (patch.index != null && patch.index !== g.index) {
      for (const other of this.grades.values()) {
        if (other.id !== id && other.index === patch.index)
          throw new Error(`grade index ${patch.index} already exists`);
      }
    }
    Object.assign(g, patch);
    return g;
  }
  async deleteGrade(id: string) {
    // cascade: delete subjects (and their learning paths / nodes) under this grade
    for (const s of [...this.subjects.values()]) {
      if (s.gradeId === id) await this.deleteSubject(s.id);
    }
    this.grades.delete(id);
  }

  // Subjects -------------------------------------------------------------------
  async createSubject(data: Omit<SubjectRow, "id" | "createdAt">) {
    if (!this.grades.has(data.gradeId)) throw new Error("grade not found");
    const row: SubjectRow = {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.subjects.set(row.id, row);
    return row;
  }
  async getSubject(id: string) {
    return this.subjects.get(id) ?? null;
  }
  async getSubjectWithPaths(id: string) {
    const s = this.subjects.get(id);
    if (!s) return null;
    return { ...s, learningPaths: await this.listLearningPaths(id) };
  }
  async listSubjects(gradeId: string) {
    return [...this.subjects.values()]
      .filter((s) => s.gradeId === gradeId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }
  async listSubjectsWithPaths(gradeId: string) {
    const subjects = await this.listSubjects(gradeId);
    return Promise.all(
      subjects.map(async (s) => ({
        ...s,
        learningPaths: await this.listLearningPaths(s.id),
      })),
    );
  }
  async updateSubject(
    id: string,
    patch: Partial<Omit<SubjectRow, "id" | "gradeId" | "createdAt">>,
  ) {
    const s = this.subjects.get(id);
    if (!s) throw new Error("subject not found");
    Object.assign(s, patch);
    return s;
  }
  async deleteSubject(id: string) {
    // cascade: delete learning paths (and their nodes) under this subject
    for (const lp of [...this.learningPaths.values()]) {
      if (lp.subjectId === id) await this.deleteLearningPath(lp.id);
    }
    this.subjects.delete(id);
  }

  // Learning paths -------------------------------------------------------------
  async createLearningPath(data: Omit<LearningPathRow, "id" | "createdAt">) {
    if (!this.subjects.has(data.subjectId))
      throw new Error("subject not found");
    const row: LearningPathRow = {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.learningPaths.set(row.id, row);
    return row;
  }
  async getLearningPath(id: string) {
    return this.learningPaths.get(id) ?? null;
  }
  async getLearningPathWithNodes(id: string) {
    const lp = this.learningPaths.get(id);
    if (!lp) return null;
    return { ...lp, pathNodes: await this.listPathNodes(id) };
  }
  async listLearningPaths(subjectId: string) {
    return [...this.learningPaths.values()].filter(
      (lp) => lp.subjectId === subjectId,
    );
  }
  async updateLearningPath(
    id: string,
    patch: Partial<Omit<LearningPathRow, "id" | "subjectId" | "createdAt">>,
  ) {
    const lp = this.learningPaths.get(id);
    if (!lp) throw new Error("learning path not found");
    Object.assign(lp, patch);
    return lp;
  }
  async deleteLearningPath(id: string) {
    // cascade: delete path nodes under this learning path
    for (const pn of [...this.pathNodes.values()]) {
      if (pn.learningPathId === id) await this.deletePathNode(pn.id);
    }
    this.learningPaths.delete(id);
  }

  // Path nodes -----------------------------------------------------------------
  async createPathNode(data: Omit<PathNodeRow, "id" | "createdAt">) {
    if (!this.learningPaths.has(data.learningPathId))
      throw new Error("learning path not found");
    const row: PathNodeRow = {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.pathNodes.set(row.id, row);
    return row;
  }
  async getPathNode(id: string) {
    return this.pathNodes.get(id) ?? null;
  }
  async listPathNodes(learningPathId: string) {
    return [...this.pathNodes.values()]
      .filter((pn) => pn.learningPathId === learningPathId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }
  async updatePathNode(
    id: string,
    patch: Partial<Omit<PathNodeRow, "id" | "learningPathId" | "createdAt">>,
  ) {
    const pn = this.pathNodes.get(id);
    if (!pn) throw new Error("path node not found");
    Object.assign(pn, patch);
    return pn;
  }
  async deletePathNode(id: string) {
    this.pathNodes.delete(id);
  }

  async createQuestion(data: Omit<QuestionRow, 'id' | 'createdAt'>) {
    if (!this.learningPaths.has(data.learningPathId)) throw new Error('learning path not found');
    const row: QuestionRow = { ...data, id: randomUUID(), createdAt: new Date() };
    this.questions.set(row.id, row);
    return row;
  }
  async getQuestion(id: string) {
    return this.questions.get(id) ?? null;
  }
  async listQuestions(learningPathId: string, difficulty?: QuestionDifficulty) {
    return [...this.questions.values()].filter(
      (q) => q.learningPathId === learningPathId && (!difficulty || q.difficulty === difficulty),
    );
  }
  async updateQuestion(id: string, patch: Partial<Omit<QuestionRow, 'id' | 'learningPathId' | 'createdAt'>>) {
    const q = this.questions.get(id);
    if (!q) throw new Error('question not found');
    Object.assign(q, patch);
    return q;
  }
  async deleteQuestion(id: string) {
    this.questions.delete(id);
  }

  // ─── Placement test sessions ────────────────────────────────────────────────

  async createPlacementTest(data: Omit<PlacementTestSessionRow, 'id' | 'startedAt' | 'completedAt' | 'answers' | 'currentDifficulty' | 'questionCount' | 'placedNodeId' | 'status'>) {
    const row: PlacementTestSessionRow = {
      ...data,
      id: randomUUID(),
      status: 'in_progress',
      answers: [],
      currentDifficulty: 'medium',
      questionCount: 0,
      placedNodeId: null,
      startedAt: new Date(),
      completedAt: null,
    };
    this.placementTests.set(row.id, row);
    return row;
  }
  async getPlacementTest(id: string) {
    return this.placementTests.get(id) ?? null;
  }
  async getActivePlacementTest(studentId: string, learningPathId: string) {
    for (const t of this.placementTests.values()) {
      if (t.studentId === studentId && t.learningPathId === learningPathId && t.status === 'in_progress') return t;
    }
    return null;
  }
  async listPlacementTestsByStudent(studentId: string) {
    return [...this.placementTests.values()]
      .filter((t) => t.studentId === studentId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }
  async updatePlacementTest(id: string, patch: Partial<Omit<PlacementTestSessionRow, 'id' | 'studentId' | 'learningPathId' | 'startedAt'>>) {
    const t = this.placementTests.get(id);
    if (!t) throw new Error('placement test not found');
    Object.assign(t, patch);
    return t;
  }

}

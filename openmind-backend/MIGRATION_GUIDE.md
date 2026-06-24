# OpenMind Backend Migration to Laravel

This document provides a comprehensive guide for the migration of the OpenMind backend from Fastify (Node.js) to Laravel (PHP).

## Project Status

The Laravel backend has been successfully initialized with the following components:

### Completed

1. **Database Migrations** - All tables created with proper relationships and indexes:
   - `students` - Student profiles with authentication tokens
   - `games` - Game instances with status tracking
   - `play_sessions` - Session records with XP and accuracy
   - `xp_events` - XP transaction history
   - `streak_events` - Daily streak tracking
   - `spec_caches` - GameSpec caching with TTL

2. **Eloquent Models** - All models with relationships:
   - `Student` - Has many games, play sessions, XP events, streak events
   - `Game` - Belongs to student, has many play sessions
   - `PlaySession` - Belongs to game and student
   - `XpEvent` - Belongs to student
   - `StreakEvent` - Belongs to student
   - `SpecCache` - Standalone caching model

3. **Authentication Service** - Token generation and validation:
   - `AuthService::generateToken()` - Creates `emt_<64-char-hex>` tokens with SHA-256 hashing
   - `AuthService::hashToken()` - Hashes tokens for storage
   - `AuthService::getStudentByTokenHash()` - Retrieves student by token hash

4. **Custom Middleware** - API token authentication:
   - `AuthenticateToken` - Validates Bearer tokens and attaches student to request

5. **API Controllers** - Implemented endpoints:
   - `SystemController` - Health check endpoint
   - `StudentController` - Student creation, profile retrieval, profile updates
   - `GameController` - Game CRUD operations with progressive start
   - `StatController` - Stats, streak check, and XP events

6. **API Routes** - All routes configured in `/routes/api.php`:
   - Health check: `GET /api/v1/health`
   - Student endpoints: `POST /api/v1/students`, `GET /api/v1/students/me`, `PATCH /api/v1/students/me`
   - Game endpoints: `POST /api/v1/games`, `GET /api/v1/games/library`, `GET /api/v1/games/{id}`, `PATCH /api/v1/games/{id}`, `DELETE /api/v1/games/{id}`
   - Stats endpoints: `GET /api/v1/students/me/stats`, `POST /api/v1/students/me/streak-check`, `GET /api/v1/students/me/xp-events`

### Testing

The API is currently running on `http://localhost:8080`. Test the endpoints:

```bash
# Health check
curl http://localhost:8080/api/v1/health

# Create a student
curl -X POST http://localhost:8080/api/v1/students \
  -H "Content-Type: application/json" \
  -d '{"name":"Sami","grade":3,"language":"en"}'

# Get student profile (requires token from creation response)
curl -H "Authorization: Bearer emt_..." \
  http://localhost:8080/api/v1/students/me
```

## Remaining Implementation

### Phase 5: Background Jobs and LLM Integration

The following features need to be implemented:

1. **GameSpec Generation Job** (`GenerateGameSpecJob`)
   - Triggered when a game is created
   - Calls LLM to generate content
   - Implements caching with TTL
   - Updates game status to "ready" or "failed"

2. **LLM Integration Service** (`LLMService`)
   - Normalize topics (with clarifying questions)
   - Generate game specs with content
   - Fact-check teaching content
   - Repair failed items
   - Generate feedback enrichment

3. **Game Endpoints**
   - `GET /api/v1/games/{id}/spec` - Retrieve full GameSpec
   - `GET /api/v1/games/{id}/play` - Assembled HTML with injected spec
   - `POST /api/v1/games/{id}/retry` - Retry failed generation
   - `POST /api/v1/games/{id}/refine` - Apply refinements (theme, difficulty, more questions)

### Phase 6: Review Mode and Session Recording

1. **Session Recording** (`SessionController`)
   - `POST /api/v1/games/{id}/sessions` - Record game session
   - `POST /api/v1/review/sessions` - Record review session
   - Implements XP calculation, streak logic, and feedback enrichment

2. **Review Mode** (`ReviewController`)
   - `GET /api/v1/review/today` - Synthesize daily review game from missed items
   - Zero-cost spaced repetition using existing GameSpecs

3. **Session Helper Service** (`SessionService`)
   - Record play sessions with XP clamping
   - Add XP events with reasons
   - Manage streak logic (consecutive days)
   - Update student stats
   - Update game stats
   - Enrich feedback via LLM

## Architecture Decisions

### Authentication

The original system uses lightweight device tokens with no passwords or emails (minors). This has been preserved:
- Tokens are 32 random bytes (64 hex characters) prefixed with `emt_`
- Stored as SHA-256 hashes in the database
- Validated on every authenticated request via Bearer header

### Database

- **SQLite** for development (current setup)
- **PostgreSQL** for production (recommended)
- JSONB columns for flexible spec storage
- Soft deletes for games
- Proper indexing for query performance

### Error Handling

All errors follow the consistent envelope format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "requestId": "req-unique-id"
  }
}
```

### Rate Limiting

The original system implements per-student generation rate limiting (default: 20 games/hour). This needs to be added to the `GameController::store()` method.

## File Structure

```
openmind-backend/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── SystemController.php
│   │   │   ├── StudentController.php
│   │   │   ├── GameController.php
│   │   │   ├── StatController.php
│   │   │   ├── SessionController.php (TODO)
│   │   │   └── ReviewController.php (TODO)
│   │   └── Middleware/
│   │       └── AuthenticateToken.php
│   ├── Models/
│   │   ├── Student.php
│   │   ├── Game.php
│   │   ├── PlaySession.php
│   │   ├── XpEvent.php
│   │   ├── StreakEvent.php
│   │   └── SpecCache.php
│   ├── Services/
│   │   ├── AuthService.php
│   │   ├── LLMService.php (TODO)
│   │   └── SessionService.php (TODO)
│   └── Jobs/
│       └── GenerateGameSpecJob.php (TODO)
├── database/
│   └── migrations/
│       ├── 2026_06_23_112129_create_students_table.php
│       ├── 2026_06_23_112133_create_games_table.php
│       ├── 2026_06_23_112133_create_play_sessions_table.php
│       ├── 2026_06_23_112133_create_xp_events_table.php
│       ├── 2026_06_23_112134_create_streak_events_table.php
│       └── 2026_06_23_112134_create_spec_caches_table.php
├── routes/
│   ├── api.php
│   └── web.php
├── bootstrap/
│   └── app.php
└── MIGRATION_GUIDE.md (this file)
```

## Next Steps

1. **Implement LLM Integration**
   - Set up Anthropic API client
   - Create `LLMService` for content generation
   - Implement caching strategy

2. **Create Background Jobs**
   - Set up Laravel Queue system
   - Create `GenerateGameSpecJob`
   - Implement job failure handling and retry logic

3. **Implement Session Recording**
   - Create `SessionController`
   - Implement XP calculation and streak logic
   - Add feedback enrichment

4. **Implement Review Mode**
   - Create `ReviewController`
   - Synthesize daily review games
   - Implement spaced repetition logic

5. **Add Missing Game Endpoints**
   - Spec retrieval with caching
   - HTML assembly and serving
   - Game refinement operations

6. **Testing and Validation**
   - Unit tests for services
   - Integration tests for API endpoints
   - Load testing for concurrent requests

## Configuration

### Environment Variables

Create a `.env` file with:

```env
APP_NAME="OpenMind Backend"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8080

DB_CONNECTION=sqlite
DB_DATABASE=database/database.sqlite

ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_MODEL_DEFAULT=claude-haiku-4-5
ANTHROPIC_MODEL_ESCALATION=claude-sonnet-4-6

MAX_GENERATIONS_PER_HOUR=20
SPEC_CACHE_TTL_HOURS=24
```

### Database Setup

```bash
php artisan migrate
php artisan db:seed (if seeders are created)
```

### Running the Server

```bash
php artisan serve --host=0.0.0.0 --port=8080
```

## Performance Considerations

1. **Caching** - GameSpecs are cached by hash of (subject|topic|language|gameType|theme|grade|difficulty|sessionLength)
2. **Indexing** - Proper indexes on frequently queried columns
3. **Pagination** - Library queries support limit/offset for large datasets
4. **Soft Deletes** - Games are soft-deleted to preserve history
5. **Async Jobs** - Spec generation runs asynchronously to provide progressive start

## Security Considerations

1. **Token Storage** - Tokens are hashed with SHA-256 before storage
2. **CORS** - Configure allowed origins in middleware
3. **Rate Limiting** - Implement per-student generation limits
4. **Input Validation** - All inputs validated with Laravel's validation rules
5. **Data Minimization** - No real names or emails (minors)

## Troubleshooting

### Server won't start
```bash
php artisan serve --host=0.0.0.0 --port=8080
```

### Database errors
```bash
php artisan migrate:fresh
php artisan migrate
```

### Clear cache
```bash
php artisan cache:clear
php artisan config:clear
```

## References

- Original Fastify Backend: `/home/ubuntu/openmind-revamped/backend`
- API Documentation: `/home/ubuntu/openmind-revamped/docs/API.md`
- Database Schema: `database/migrations/`
- Laravel Documentation: https://laravel.com/docs

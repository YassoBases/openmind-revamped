# Placement Test — Question Types Reference

This document explains how to answer each of the **7 question types** used in the OpenMind placement tests.

Every answer is sent to the same endpoint:

```
POST /api/v1/placement-tests/:sessionId/answer
Authorization: Bearer <token>
Content-Type: application/json
```

The request body always has this structure:

```json
{
  "questionId": "<the question id from the test>",
  "response": { ... type-specific fields ... }
}
```

Only the `response` object changes between question types. Below is the exact format for each.

---

## Table of Contents

1. [Choice (`choice`)](#1-choice-choice) — اختيار
2. [Drag & Drop (`drag_drop`)](#2-drag--drop-drag_drop) — سحب وإفلات
3. [Spin (`spin`)](#3-spin-spin) — تدوير
4. [Connect (`connect`)](#4-connect-connect) — ربط
5. [Numeric Input (`numeric_input`)](#5-numeric-input-numeric_input) — إدخال رقمي
6. [Tap Image (`tap_image`)](#6-tap-image-tap_image) — نقر على الصورة
7. [Open Response (`open_response`)](#7-open-response-open_response) — إجابة مفتوحة
8. [Quick Reference Table](#quick-reference-table)
9. [Important: Answer Stripping](#important-answer-stripping)
10. [Common Mistakes](#common-mistakes)

---

## 1. Choice (`choice`)

**Arabic:** اختيار

**Description:** The student picks one option from a list by its **index** (0-based).

### Question content you receive

```json
{
  "type": "choice",
  "prompt": "ما قيمة الرقم 5 في العدد 523,487؟",
  "options": ["500,000", "50,000", "5,000", "500"]
}
```

### Answer format

```json
{
  "questionId": "<id>",
  "response": {
    "selectedIndex": 0
  }
}
```

### How it's graded

The grader compares your `selectedIndex` against the hidden `correctIndex` (which is stripped from the question before it's sent to you):

```typescript
correctIndex === selectedIndex
```

### Example

Question: "ما قيمة الرقم 5 في العدد 523,487؟"
Options: `["500,000", "50,000", "5,000", "500"]`

The digit 5 is in the hundred-thousands place = 500,000, which is at index **0**.

**Answer:**
```json
{ "selectedIndex": 0 }
```

### Notes

- `selectedIndex` is **0-based** (first option = 0, second = 1, etc.)
- You must pick exactly one option
- Out-of-range indexes will be marked wrong

---

## 2. Drag & Drop (`drag_drop`)

**Arabic:** سحب وإفلات

**Description:** The student drags **items** into **slots**. Each slot must receive the correct item.

### Question content you receive

```json
{
  "type": "drag_drop",
  "prompt": "اسحب كل كسر عشري إلى مكانه الصحيح على الخط العددي",
  "items": [
    { "id": "a", "label": "0.3" },
    { "id": "b", "label": "0.7" },
    { "id": "c", "label": "0.9" }
  ],
  "slots": [
    { "id": "s1", "label": "بين 0 و 0.5" },
    { "id": "s2", "label": "بين 0.5 و 0.8" },
    { "id": "s3", "label": "أكبر من 0.8" }
  ]
}
```

### Answer format

```json
{
  "questionId": "<id>",
  "response": {
    "placements": [
      { "slotId": "s1", "itemId": "a" },
      { "slotId": "s2", "itemId": "b" },
      { "slotId": "s3", "itemId": "c" }
    ]
  }
}
```

### How it's graded

The grader checks that **every slot** has the correct item placed in it (the `correctItemId` is stripped from each slot before sending):

```typescript
const map = new Map(placements.map(p => [p.slotId, p.itemId]));
return slots.every(s => map.get(s.id) === s.correctItemId);
```

### Example

Question: Place 0.3, 0.7, 0.9 on a number line
- 0.3 → between 0 and 0.5 → slot `s1` ← item `a`
- 0.7 → between 0.5 and 0.8 → slot `s2` ← item `b`
- 0.9 → greater than 0.8 → slot `s3` ← item `c`

**Answer:**
```json
{
  "placements": [
    { "slotId": "s1", "itemId": "a" },
    { "slotId": "s2", "itemId": "b" },
    { "slotId": "s3", "itemId": "c" }
  ]
}
```

### Notes

- **All slots must be correct** — one wrong slot = whole answer wrong
- You can't put the same item in two slots
- You don't need to fill slots that aren't in the `slots` array
- Each placement object has `slotId` and `itemId` (both strings)

---

## 3. Spin (`spin`)

**Arabic:** تدوير

**Description:** The student spins a wheel and selects one **segment by its ID**.

### Question content you receive

```json
{
  "type": "spin",
  "prompt": "دوّر العجلة إلى ناتج: −6 + (−4)",
  "wheelSegments": [
    { "id": "w1", "label": "−10" },
    { "id": "w2", "label": "−2" },
    { "id": "w3", "label": "2" }
  ]
}
```

### Answer format

```json
{
  "questionId": "<id>",
  "response": {
    "selectedSegmentId": "w1"
  }
}
```

### How it's graded

The grader does a simple string match between your `selectedSegmentId` and the hidden `correctSegmentId`:

```typescript
correctSegmentId === selectedSegmentId
```

### Example

Question: "−6 + (−4) = ?"
- Adding two negatives: −6 + (−4) = −(6+4) = **−10**
- −10 is segment `w1`

**Answer:**
```json
{ "selectedSegmentId": "w1" }
```

### Notes

- You're sending the segment **ID**, not the label
- You must pick exactly one segment
- Trap answers are common (e.g., −2 for students who subtract instead of add)

---

## 4. Connect (`connect`)

**Arabic:** ربط

**Description:** The student matches items from a **left column** to items in a **right column** by creating pairs.

### Question content you receive

```json
{
  "type": "connect",
  "prompt": "طابق كل زوج أعداد بالإشارة الصحيحة",
  "leftItems": [
    { "id": "l1", "label": "456 ? 465" },
    { "id": "l2", "label": "901 ? 899" }
  ],
  "rightItems": [
    { "id": "r1", "label": "<" },
    { "id": "r2", "label": ">" }
  ]
}
```

### Answer format

```json
{
  "questionId": "<id>",
  "response": {
    "pairs": [
      { "leftId": "l1", "rightId": "r1" },
      { "leftId": "l2", "rightId": "r2" }
    ]
  }
}
```

### How it's graded

The grader checks that the set of pairs you submitted **exactly matches** the set of correct pairs (the `correctPairs` array is stripped before sending):

```typescript
const correctSet = new Set(correctPairs.map(p => `${p.leftId}|${p.rightId}`));
const studentSet = new Set(pairs.map(p => `${p.leftId}|${p.rightId}`));
// every correct pair must be present, and no extras
return correctPairs.every(p => studentSet.has(`${p.leftId}|${p.rightId}`))
  && studentSet.size === correctSet.size;
```

### Example

Question: Match each comparison with the correct sign
- 456 < 465 → `l1` matches `r1`
- 901 > 899 → `l2` matches `r2`

**Answer:**
```json
{
  "pairs": [
    { "leftId": "l1", "rightId": "r1" },
    { "leftId": "l2", "rightId": "r2" }
  ]
}
```

### Notes

- **All pairs must be correct** — one wrong pair = whole answer wrong
- You can't have **extra** pairs (the set sizes must match)
- You can't match the same left item to two right items
- Each pair object has `leftId` and `rightId` (both strings)

---

## 5. Numeric Input (`numeric_input`)

**Arabic:** إدخال رقمي

**Description:** The student types a **number** as the answer.

### Question content you receive

```json
{
  "type": "numeric_input",
  "prompt": "احسب: 500,000 − 123,456"
}
```

### Answer format

```json
{
  "questionId": "<id>",
  "response": {
    "value": 376544
  }
}
```

### How it's graded

The grader checks if your value is within the **acceptable variance** of the correct answer (both `correctAnswer` and `acceptableVariance` are stripped before sending):

```typescript
Math.abs(value - correctAnswer) <= acceptableVariance
```

### Example

Question: "احسب: 500,000 − 123,456"
- 500,000 − 123,456 = 376,544

**Answer:**
```json
{ "value": 376544 }
```

### Notes

- `value` must be a **number**, not a string
- The default `acceptableVariance` is 0 (exact match), but some questions allow a small tolerance (e.g., 0.01 for decimals)
- Negative numbers are supported: `{ "value": -7 }`
- Decimals are supported: `{ "value": 3.35 }`

---

## 6. Tap Image (`tap_image`)

**Arabic:** نقر على الصورة

**Description:** The student taps on one or more **regions**. They must tap **exactly** the correct set — no more, no less.

### Question content you receive

```json
{
  "type": "tap_image",
  "prompt": "انقر على الأعداد التي عند تقريبها لأقرب 100 تصبح 500",
  "regions": [
    { "id": "r1", "label": "478" },
    { "id": "r2", "label": "524" },
    { "id": "r3", "label": "561" }
  ]
}
```

### Answer format

```json
{
  "questionId": "<id>",
  "response": {
    "tappedRegionIds": ["r1", "r2"]
  }
}
```

### How it's graded

The grader checks that the set of tapped region IDs **exactly matches** the set of correct region IDs (the `isCorrect` flag is stripped from each region before sending):

```typescript
const correctSet = new Set(regions.filter(r => r.isCorrect).map(r => r.id));
const tappedSet = new Set(tapped);
return correctSet.size === tappedSet.size
  && [...correctSet].every(id => tappedSet.has(id));
```

### Example

Question: "Tap numbers that round to 500"
- 478 → rounds to 500 (78 ≥ 50) → tap `r1` ✅
- 524 → rounds to 500 (24 < 50) → tap `r2` ✅
- 561 → rounds to 600 (61 ≥ 50) → don't tap ❌

**Answer:**
```json
{ "tappedRegionIds": ["r1", "r2"] }
```

### Notes

- You must tap **exactly** the correct regions
- Tapping an extra wrong region = wrong answer
- Missing a correct region = wrong answer
- `tappedRegionIds` is an array of strings (region IDs)
- An empty array `[]` is valid (if no regions are correct)

---

## 7. Open Response (`open_response`)

**Arabic:** إجابة مفتوحة

**Description:** The student types a **free-text answer**.

### Question content you receive

```json
{
  "type": "open_response",
  "prompt": "اشرح كيف تجمع 356 + 478 خطوة بخطوة"
}
```

### Answer format

```json
{
  "questionId": "<id>",
  "response": {
    "text": "نجمع الآحاد: 6+8=14، العشرات: 5+7+1=13، المئات: 3+4+1=8 → 834"
  }
}
```

### How it's graded

The grader does a **case-insensitive, trimmed exact match** against the hidden `acceptableAnswers` array:

```typescript
const normalized = text.trim().toLowerCase();
return acceptable.some(a => a.trim().toLowerCase() === normalized);
```

### Example

Question: "اشرح كيف تجمع 356 + 478"
The acceptable answer is: `"نجمع الآحاد: 6+8=14 (نكتب 4 ونحمل 1)، العشرات: 5+7+1=13 (نكتب 3 ونحمل 1)، المئات: 3+4+1=8 → 834"`

**Answer:**
```json
{ "text": "نجمع الآحاد: 6+8=14 (نكتب 4 ونحمل 1)، العشرات: 5+7+1=13 (نكتب 3 ونحمل 1)، المئات: 3+4+1=8 → 834" }
```

### ⚠️ Important limitation

The grader requires an **exact match**. Any variation in:
- Punctuation
- Spacing
- Wording
- Arabic diacritics (tashkeel)

...will be marked **wrong**. This is a known limitation. For production use, consider upgrading to:
- **Substring matching** (answer contains the key phrase)
- **Keyword matching** (answer contains all keywords)
- **LLM grading** (send to an AI to judge correctness)

### Notes

- `text` must be a string
- Whitespace is trimmed, case is lowered (so "  Hello  " matches "hello")
- Multiple acceptable answers can be stored — any one match = correct

---

## Quick Reference Table

| Type | Arabic | `response` shape | What's checked |
|---|---|---|---|
| `choice` | اختيار | `{ "selectedIndex": 0 }` | index matches hidden `correctIndex` |
| `drag_drop` | سحب وإفلات | `{ "placements": [{ "slotId": "s1", "itemId": "a" }] }` | every slot has correct item |
| `spin` | تدوير | `{ "selectedSegmentId": "w2" }` | segment ID matches hidden `correctSegmentId` |
| `connect` | ربط | `{ "pairs": [{ "leftId": "l1", "rightId": "r1" }] }` | all pairs match exactly, no extras |
| `numeric_input` | إدخال رقمي | `{ "value": 42 }` | number within `acceptableVariance` of `correctAnswer` |
| `tap_image` | نقر على الصورة | `{ "tappedRegionIds": ["r1", "r3"] }` | exact set of correct regions (no more, no less) |
| `open_response` | إجابة مفتوحة | `{ "text": "answer here" }` | case-insensitive exact match against `acceptableAnswers` |

---

## Important: Answer Stripping

Before a question is sent to the student, the server **removes the correct answer** from the question content using the `stripAnswer()` function. This prevents cheating.

| Type | What's stripped |
|---|---|
| `choice` | `correctIndex` |
| `drag_drop` | `correctItemId` from each slot |
| `spin` | `correctSegmentId` |
| `connect` | `correctPairs` array |
| `numeric_input` | `correctAnswer` + `acceptableVariance` |
| `tap_image` | `isCorrect` from each region |
| `open_response` | `acceptableAnswers` array |

**This means:** the question you receive will NOT contain the correct answer. You must solve the question yourself.

---

## Common Mistakes

### 1. Sending a string instead of a number

```json
// ❌ WRONG:
{ "value": "42" }

// ✅ CORRECT:
{ "value": 42 }
```

### 2. Using labels instead of IDs

```json
// ❌ WRONG (using the label):
{ "selectedSegmentId": "−10" }

// ✅ CORRECT (using the ID):
{ "selectedSegmentId": "w1" }
```

### 3. Missing the questionId

```json
// ❌ WRONG:
{
  "response": { "selectedIndex": 0 }
}

// ✅ CORRECT:
{
  "questionId": "cmr3ogtfm001mmjtstrbaoij6",
  "response": { "selectedIndex": 0 }
}
```

### 4. Tapping extra regions (tap_image)

```json
// ❌ WRONG (tapped an extra wrong region):
{ "tappedRegionIds": ["r1", "r2", "r3"] }

// ✅ CORRECT (only the correct regions):
{ "tappedRegionIds": ["r1", "r2"] }
```

### 5. Extra pairs in connect

```json
// ❌ WRONG (extra pair):
{
  "pairs": [
    { "leftId": "l1", "rightId": "r1" },
    { "leftId": "l2", "rightId": "r2" },
    { "leftId": "l1", "rightId": "r2" }  // ← extra!
  ]
}

// ✅ CORRECT:
{
  "pairs": [
    { "leftId": "l1", "rightId": "r1" },
    { "leftId": "l2", "rightId": "r2" }
  ]
}
```

### 6. Open response with different wording

```json
// ❌ WRONG (different wording than the acceptable answer):
{ "text": "نضغط الأرقام معاً" }

// ✅ CORRECT (matches the acceptable answer):
{ "text": "نجمع الآحاد ثم العشرات ثم المئات" }
```

---

## Full Example: Complete Test Flow

Here's a complete example of starting a test and answering 5 questions:

### Step 1: Start the test

```
POST /api/v1/placement-tests
Authorization: Bearer <token>

{
  "learningPathId": "<path-id>",
  "theme": "bridge"
}
```

**Response:**
```json
{
  "session": { "id": "session-123", ... },
  "question": { "id": "q1", "type": "choice", ... },
  "progress": { "answered": 0, "total": 5, "done": false }
}
```

### Step 2: Answer each question

```
POST /api/v1/placement-tests/session-123/answer
Authorization: Bearer <token>

{
  "questionId": "q1",
  "response": { "selectedIndex": 2 }
}
```

**Response:**
```json
{
  "correct": true,
  "nextQuestion": { "id": "q2", "type": "numeric_input", ... },
  "progress": { "answered": 1, "total": 5, "done": false }
}
```

### Step 3: Continue until done

Keep answering `nextQuestion` until `progress.done` is `true` and `nextQuestion` is `null`.

### Step 4: Get the result

```
GET /api/v1/placement-tests/session-123/result
Authorization: Bearer <token>
```

**Response:**
```json
{
  "totalQuestions": 5,
  "correctCount": 4,
  "masteryRatio": 0.8,
  "placedNodeId": "<node-id>",
  "placedNodeTitle": "الأعداد: قيمة المنزلة",
  "answers": [...]
}
```

---

## API Endpoints Summary

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/placement-tests/themes` | List the 3 themes (bridge/road/map) |
| `POST` | `/api/v1/placement-tests` | Start/resume a test |
| `POST` | `/api/v1/placement-tests/:id/answer` | Submit an answer |
| `GET` | `/api/v1/placement-tests/:id` | Get session status |
| `GET` | `/api/v1/placement-tests/:id/result` | Get final result (mastery + placement) |
| `POST` | `/api/v1/placement-tests/:id/abandon` | Abandon an in-progress test |
| `GET` | `/api/v1/placement-tests/me` | List student's test history |

All endpoints require `Authorization: Bearer <token>`.

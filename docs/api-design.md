# QuickNotes API Design

This document specifies the REST API for the QuickNotes online service. It is
the real production API that will replace browser-only storage, not the
JSONPlaceholder demo used by the client in `index.html`.

## 1. Conventions

| Aspect | Decision |
| --- | --- |
| Base URL | `https://api.quicknotes.example/api/v1` |
| Versioning | Version in the path (`/api/v1`). Breaking changes ship as `/api/v2`; v1 keeps working during a deprecation window. |
| Format | JSON request and response bodies, `Content-Type: application/json`, UTF-8. |
| Field naming | `camelCase` in JSON (the database uses `snake_case`; the API layer maps between them). |
| IDs | UUIDs, so ids cannot be guessed or enumerated (`/notes/1`, `/notes/2`, ...). |
| Timestamps | ISO 8601 in UTC, e.g. `2026-10-25T09:30:00Z`. |
| Auth | `Authorization: Bearer <JWT>` on every endpoint except register and login. |
| Transport | HTTPS only. Plain HTTP is redirected or refused. |

### Resource naming

Resources are plural nouns (`/notes`, `/tags`), and the HTTP method expresses
the action: `GET` reads, `POST` creates, `PATCH` partially updates, `DELETE`
removes. There are no verbs in paths such as `/getNotes` or `/deleteNote`.
`/auth/register` and `/auth/login` are the exception, because they are
actions rather than resources.

## 2. Authentication

1. The client calls `POST /auth/register` or `POST /auth/login` and receives a
   signed JWT access token.
2. The client sends it on every later request:
   `Authorization: Bearer eyJhbGciOiJIUzI1NiIs...` (truncated example).
3. The server checks the signature and expiry, then reads the user id from the
   token's `sub` claim. **The user id is never taken from the URL or body**, so a
   client cannot act as someone else by editing a parameter.
4. Access tokens expire after 15 minutes (`expiresIn: 900`). An expired or
   invalid token returns `401`, and the client must log in again.

Passwords are hashed on the server with a slow algorithm (bcrypt or Argon2) and
are never stored or returned in plain text.

### Ownership rule

Every note and tag belongs to a single user. All queries are scoped to the
authenticated user (`WHERE user_id = :currentUser`). **If a user asks for a note
that belongs to someone else, the API returns `404 Not Found`, not `403`.** A 403
would confirm that the id exists, which leaks information. To the caller,
"not yours" and "doesn't exist" look exactly the same.

## 3. Endpoints

| Method | Path | Description | Success status |
| --- | --- | --- | --- |
| POST | `/auth/register` | Create an account and return an access token | `201 Created` |
| POST | `/auth/login` | Exchange email + password for an access token | `200 OK` |
| GET | `/notes` | List the current user's notes (paginated, filterable by tag) | `200 OK` |
| GET | `/notes/{id}` | Get one note by id | `200 OK` |
| POST | `/notes` | Create a note | `201 Created` |
| PATCH | `/notes/{id}` | Partially update a note (title, body and/or tags) | `200 OK` |
| DELETE | `/notes/{id}` | Delete a note | `204 No Content` |
| GET | `/tags` | List the current user's tags with note counts | `200 OK` |

### 3.1 POST /auth/register

Request:

```json
{
  "email": "ada@example.com",
  "password": "a-long-passphrase",
  "displayName": "Ada"
}
```

Validation: `email` must be a valid, unique address; `password` must be 12–128
characters; `displayName` is 1–50 characters.

Response `201 Created` (with header `Location: /api/v1/users/me`):

```json
{
  "user": {
    "id": "3f8a2c1e-5b7d-4e9a-9c21-0d6f4b8e7a10",
    "email": "ada@example.com",
    "displayName": "Ada",
    "createdAt": "2026-10-25T09:30:00Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

If the email is already registered, the response is `409 Conflict`.

### 3.2 POST /auth/login

Request:

```json
{ "email": "ada@example.com", "password": "a-long-passphrase" }
```

Response `200 OK`: the same `accessToken`, `tokenType` and `expiresIn` fields as
register. A wrong email and a wrong password both return the same `401` with
the same message, so the endpoint cannot be used to find out which emails have
accounts. Repeated failures are rate-limited (`429`).

### 3.3 GET /notes

Lists the current user's notes, newest `updatedAt` first.

| Query param | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | integer | `1` | ≥ 1 |
| `limit` | integer | `20` | 1–100 (capped so one request cannot pull the whole table) |
| `tag` | string | none | Only return notes that have this tag name |

Request:

```http
GET /api/v1/notes?page=2&limit=2&tag=work HTTP/1.1
Host: api.quicknotes.example
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Accept: application/json
```

Response `200 OK`:

```json
{
  "data": [
    {
      "id": "9b1d7c3a-2e4f-4a6b-8c0d-1e2f3a4b5c6d",
      "title": "Sprint planning",
      "body": "Agree scope for the notes API and the data model.",
      "tags": ["work", "planning"],
      "createdAt": "2026-10-20T08:15:00Z",
      "updatedAt": "2026-10-24T16:42:10Z"
    },
    {
      "id": "c4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
      "title": "Ask about load testing",
      "body": "",
      "tags": ["work"],
      "createdAt": "2026-10-19T11:02:33Z",
      "updatedAt": "2026-10-19T11:02:33Z"
    }
  ],
  "pagination": {
    "page": 2,
    "limit": 2,
    "totalItems": 7,
    "totalPages": 4,
    "hasNext": true,
    "hasPrev": true
  }
}
```

An empty result is still `200 OK`, with `"data": []` and `totalItems: 0`. That
is a valid answer, not an error, and the client shows its empty state. An
unknown `tag` also returns an empty list rather than `404`.

### 3.4 GET /notes/{id}

Response `200 OK`: a single note object with the same shape as an item in
`data` above. Returns `404` if the note does not exist **or belongs to another
user**, and `400` if `{id}` is not a valid UUID.

### 3.5 POST /notes

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `title` | string | yes | Trimmed, 1–100 characters |
| `body` | string | no | Defaults to `""`; max 20,000 characters |
| `tags` | string[] | no | Max 10 tags; each name trimmed, lowercased, 1–30 characters. Tags that do not exist yet are created for this user. |

Request:

```http
POST /api/v1/notes HTTP/1.1
Host: api.quicknotes.example
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
```

```json
{
  "title": "Buy groceries",
  "body": "Milk, eggs, coffee",
  "tags": ["personal", "errands"]
}
```

Response `201 Created` with header
`Location: /api/v1/notes/7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d`:

```json
{
  "id": "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d",
  "title": "Buy groceries",
  "body": "Milk, eggs, coffee",
  "tags": ["errands", "personal"],
  "createdAt": "2026-10-25T09:41:07Z",
  "updatedAt": "2026-10-25T09:41:07Z"
}
```

The server assigns `id`, `createdAt` and `updatedAt`. If the client sends these
fields, or a `userId`, they are ignored. The owner always comes from the token.

### 3.6 PATCH /notes/{id}

Partial update: only the fields sent are changed, with the same validation as
create. If `tags` is sent, it **replaces** the note's whole tag set (`[]`
removes all tags). `updatedAt` is set to the current time.

```json
{ "title": "Buy groceries (Saturday)", "tags": ["errands"] }
```

Response `200 OK`: the full updated note. An empty body `{}` returns `400`.

PATCH is used instead of PUT because clients usually change one field (for
example, renaming a note). PUT would require sending the whole note every time
and could accidentally wipe fields the client left out.

### 3.7 DELETE /notes/{id}

Response `204 No Content` with an empty body. The note's tag links are removed
with it, but the tags themselves stay. Deleting a note that does not exist, or
belongs to someone else, returns `404`.

### 3.8 GET /tags

Response `200 OK`:

```json
{
  "data": [
    { "id": "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "name": "errands", "noteCount": 3 },
    { "id": "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a", "name": "work", "noteCount": 7 }
  ]
}
```

Sorted alphabetically. Not paginated, because a user has few tags. If this
changes, pagination can be added without a breaking change.

## 4. Errors

Every error uses the same body shape, so clients need only one error handler:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body contains invalid fields.",
    "details": [
      { "field": "title", "issue": "must be between 1 and 100 characters" },
      { "field": "tags[2]", "issue": "must be 30 characters or fewer" }
    ],
    "requestId": "req_01HF8Z6Q2J3K4M5N6P7Q8R9S0T"
  }
}
```

- `code` is a stable, machine-readable string that clients can branch on.
- `message` is human-readable and safe to show. It never contains stack traces,
  SQL or internal hostnames.
- `details` is optional and lists errors for individual fields.
- `requestId` matches a server log entry, so support can trace a specific failure.

| Status | Code | When it occurs |
| --- | --- | --- |
| `400 Bad Request` | `VALIDATION_ERROR` / `BAD_REQUEST` | Malformed JSON, a missing or invalid field (empty title, title > 100 chars), an invalid UUID in the path, or out-of-range `page`/`limit`. |
| `401 Unauthorized` | `UNAUTHENTICATED` | No `Authorization` header, or a token that is malformed, expired or badly signed. Also a wrong email or password on login. |
| `403 Forbidden` | `FORBIDDEN` | The caller is authenticated but their account may not do this, e.g. a suspended account tries to write. **Not** used for other users' notes (see 404). |
| `404 Not Found` | `NOT_FOUND` | The resource does not exist **or belongs to another user**, or the route itself does not exist. |
| `409 Conflict` | `CONFLICT` | Registering with an email that already has an account. |
| `429 Too Many Requests` | `RATE_LIMITED` | Too many requests, e.g. more than 10 login attempts per minute per IP, or the general per-user limit. Includes a `Retry-After` header. |
| `500 Internal Server Error` | `INTERNAL_ERROR` | An unexpected server failure. The client sees a generic message plus `requestId`; the details go to the logs only. |
| `503 Service Unavailable` | `SERVICE_UNAVAILABLE` | A dependency (e.g. the database) is temporarily down or in maintenance. Includes `Retry-After`. |

**Why 400 is used instead of 422:** all validation failures return `400 VALIDATION_ERROR`
with `details`. Some APIs split "malformed JSON" (400) from "valid JSON with
invalid values" (422). We chose a single status so clients handle validation in
one place. The `code` field already tells them which kind of problem it is.

## 5. Status codes for successful requests

| Status | Used for | Why |
| --- | --- | --- |
| `200 OK` | Successful GET, PATCH and login | Body contains the requested or updated resource. |
| `201 Created` | POST `/notes`, POST `/auth/register` | A new resource exists. The `Location` header points to it. |
| `204 No Content` | DELETE `/notes/{id}` | Success with nothing useful to return, so no body is sent. |

## 6. Security and operations

- **HTTPS everywhere.** Tokens and passwords are never sent in plain text.
- **Least privilege.** Every query is scoped by the user id taken from the token.
- **Input limits.** Field lengths, a 10-tag maximum and `limit ≤ 100` bound the
  work a single request can cause.
- **Rate limiting** per IP for auth endpoints and per user elsewhere (`429`).
- **CORS** allows only the official web client's origin.
- **No sensitive data in URLs.** Tokens go in headers, never in query strings,
  because URLs end up in logs and browser history.

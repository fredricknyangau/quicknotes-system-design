# QuickNotes — From Browser App to Online Service

QuickNotes is a notes app that is moving from browser-only storage to an online
service for 1 million users. This repository contains two parts:

1. **A working API client** (`index.html`, `api.js`, `style.css`) written in
   vanilla HTML, CSS and JavaScript. It loads, creates and deletes notes
   against a REST API using `fetch`, with clear loading, success, error and
   empty states.
2. **System design documents** for the real QuickNotes backend: the REST API
   contract, the PostgreSQL data model, and the architecture needed to serve
   1 million users.

No frameworks, packages or build step are used.

## Project structure

```text
.
├── index.html            # Page structure: load button, status, form, notes list
├── api.js                # fetch wrapper, GET / POST / DELETE, rendering, validation
├── style.css             # Layout, status colours, focus and disabled states
├── README.md
└── docs/
    ├── api-design.md     # REST endpoints, examples, status codes, errors
    ├── data-model.md     # Tables, keys, relationships, SQL, indexes
    └── architecture.md   # Requirements, load estimate, diagram, flows, trade-offs
```

## How to run the API client

**Option 1: open the file directly.** Double-click `index.html`, or open it
from your browser with *File → Open*.

**Option 2: use a local web server (recommended).** From the project folder:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>. Press `Ctrl+C` in the terminal to stop the
server.

An internet connection is needed because the client calls
`https://jsonplaceholder.typicode.com`.

### What you can do

| Action | How | What you should see |
| --- | --- | --- |
| Load notes (GET) | Click **Load notes** | "Loading notes...", then "Loaded 10 notes from the server." |
| Create a note (POST) | Fill in a title (and optional body), click **Create note** | The note appears at the top, with "Note created (status 201, id 101)." |
| Validation | Submit with an empty or blank title | "Title is required." Nothing is sent to the server. |
| Delete a note (DELETE) | Click **Delete** on any note | The note is removed, with a success message. |
| Error handling | Go offline (DevTools → Network → Offline) and try any action | A friendly red error message; no data is lost from the page. |
| Empty state | Delete every note | "No notes yet." |

## Design documents

- [API design](docs/api-design.md): versioned REST API (`/api/v1`) with JWT
  auth, an endpoint table, request/response examples, pagination and a
  consistent error format.
- [Data model](docs/data-model.md): the `users`, `notes`, `tags` and
  `note_tags` tables, PostgreSQL `CREATE TABLE` statements, example queries,
  indexes, and why SQL was chosen over NoSQL.
- [Architecture](docs/architecture.md): requirements, a load estimate for
  1M users with the arithmetic shown, a Mermaid architecture diagram,
  request flows, trade-offs and how single points of failure are avoided.

## JSONPlaceholder limitations

The client uses [JSONPlaceholder](https://jsonplaceholder.typicode.com), a free
fake REST API for practice. It behaves like a real API, but **nothing is
actually saved**:

- **POST does not save anything.** The server returns `201` and an echo of the
  note, but it is not stored. Reloading notes does not show it.
- **Every created note gets id `101`.** The client therefore gives each note its
  own client-side key (`data-key`), keeps the server id separately (`data-id`),
  and marks created notes with `data-local="true"`, so two created notes never
  get mixed up.
- **DELETE does not delete anything.** It returns `200`, but deleted notes come
  back when you click **Load notes** again.
- **Deleting a created note.** The client still sends `DELETE /posts/{id}` to
  show the call, and removes the note from the page even if the server answers
  `404`, because the server never had it. The status message says this
  honestly. See the comment above `deleteNote()` in `api.js`.
- **No authentication, tags or pagination metadata.** These are part of the
  real QuickNotes API described in [docs/api-design.md](docs/api-design.md),
  not the demo.

## What I learned

> **Draft — Fredrick: rewrite each point in your own words before submitting.**

1. **Draft: `fetch` does not fail on HTTP errors.** I expected a 404 or 500 to
   go to the `catch` block, but `fetch` only rejects on network failures. I had
   to check `response.ok` myself and throw an error with the status code, and
   handle network failures separately so the user sees a friendly message
   instead of a raw error.

2. **Draft: `innerHTML` with API data is a security risk.** Text from a server or
   a user could contain HTML or scripts (XSS). Building elements with
   `createElement` and setting `textContent` means anything the API returns is
   shown as plain text and never runs.

3. **Draft: server ids are not always unique, and keys matter.** JSONPlaceholder
   returns id 101 for every created note. If I had deleted notes by searching
   for their id, one click would have removed every created note. Giving each
   element its own client key, and linking each Delete button to its own
   `<li>`, taught me to keep "DOM identity" separate from "server identity".

4. **Draft: estimates should drive the design, not the other way round.** Working
   out the numbers (about 232 reads/s and 58 writes/s at peak for 1M users)
   showed that one database could handle the load. Replicas, a cache and
   multiple app servers are mainly there for availability and latency, which
   changed how I justify each component.

5. **Draft: the database should enforce its own rules.** Constraints like
   `CHECK (char_length(title) BETWEEN 1 AND 100)`, foreign keys and
   `UNIQUE (user_id, name)` still protect the data if a bug in the client or API
   lets bad input through. Validation belongs in every layer.

"use strict";

const API_URL = "https://jsonplaceholder.typicode.com/posts";

const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const notesList = document.getElementById("notes-list");
const noteForm = document.getElementById("note-form");
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const submitBtn = document.getElementById("submit-btn");

const TITLE_MAX_LENGTH = 100;

// Each rendered note gets a unique client-side key so notes never collide in
// the DOM, even when the server returns duplicate ids.
let nextKey = 1;

/**
 * Wraps fetch with JSON handling and consistent errors.
 * Throws an Error with a `status` property for non-2xx responses, and a
 * friendly Error (status 0) when the network request itself fails.
 */
async function request(url, options = {}) {
  const config = { ...options, headers: { ...options.headers } };
  if (config.body !== undefined) {
    config.headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(url, config);
  } catch (networkError) {
    const error = new Error("Network error: could not reach the server.");
    error.status = 0;
    error.cause = networkError;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`Request failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  // 204 No Content (and some DELETE responses) have no JSON body.
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { status: response.status, data };
}

/** Shows a message in #status; type is "loading" | "success" | "error". */
function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type;
}

function renderEmptyState() {
  const li = document.createElement("li");
  li.className = "empty-state";
  li.textContent = "No notes yet.";
  notesList.append(li);
}

function createNoteElement(note) {
  const li = document.createElement("li");
  li.className = "note";
  li.dataset.key = String(nextKey++);
  li.dataset.id = String(note.id);

  const title = document.createElement("h3");
  title.className = "note-title";
  title.textContent = note.title;

  li.append(title);
  if (note.body) {
    const body = document.createElement("p");
    body.className = "note-body";
    body.textContent = note.body;
    li.append(body);
  }

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "Delete";
  deleteBtn.setAttribute("aria-label", `Delete note: ${note.title}`);
  deleteBtn.addEventListener("click", () => deleteNote(li, deleteBtn));

  li.append(deleteBtn);
  return li;
}

function removeEmptyState() {
  const emptyState = notesList.querySelector(".empty-state");
  if (emptyState) {
    emptyState.remove();
  }
}

function renderNotes(notes) {
  notesList.replaceChildren();
  if (notes.length === 0) {
    renderEmptyState();
    return;
  }
  for (const note of notes) {
    notesList.append(createNoteElement(note));
  }
}

async function loadNotes() {
  loadBtn.disabled = true;
  setStatus("Loading notes...", "loading");
  try {
    const { data } = await request(`${API_URL}?_limit=10`);
    const notes = Array.isArray(data) ? data : [];
    renderNotes(notes);
    setStatus(`Loaded ${notes.length} notes from the server.`, "success");
  } catch (error) {
    console.error(error);
    setStatus("Could not load notes. Check your connection and try again.", "error");
  } finally {
    loadBtn.disabled = false;
  }
}

/** Returns an error message for an invalid title, or null if it is valid. */
function validateTitle(title) {
  if (title.length === 0) {
    return "Title is required.";
  }
  if (title.length > TITLE_MAX_LENGTH) {
    return `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

async function createNote(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  const validationError = validateTitle(title);
  if (validationError) {
    setStatus(validationError, "error");
    titleInput.setAttribute("aria-invalid", "true");
    titleInput.focus();
    return;
  }
  titleInput.removeAttribute("aria-invalid");

  submitBtn.disabled = true;
  setStatus("Creating note...", "loading");
  try {
    const { status, data } = await request(API_URL, {
      method: "POST",
      body: JSON.stringify({ title, body, userId: 1 }),
    });
    // JSONPlaceholder does not persist POSTs, so mark this note as local-only.
    const li = createNoteElement(data);
    li.dataset.local = "true";
    removeEmptyState();
    notesList.prepend(li);
    setStatus(`Note created (status ${status}, id ${data.id}).`, "success");
    noteForm.reset();
  } catch (error) {
    console.error(error);
    setStatus("Could not create the note. Check your connection and try again.", "error");
  } finally {
    submitBtn.disabled = false;
  }
}

/*
 * Deleting notes, and two JSONPlaceholder quirks:
 *
 * 1. JSONPlaceholder never saves POSTs, and every created note comes back
 *    with id 101. Two created notes can therefore share the same server id.
 *    Each <li> has its own client-side data-key, and this function only ever
 *    removes the exact <li> it was given. It never searches by data-id, so
 *    deleting one "id 101" note never removes the others.
 *
 * 2. Created notes (data-local="true") never existed on the server. We still
 *    send DELETE /posts/{id} to show the real API call. If the server answers
 *    404, we remove the note anyway, because there is nothing on the server
 *    to delete, and the status message says so plainly. For notes loaded from
 *    the server, any error keeps the note and shows an error status.
 */
async function deleteNote(li, deleteBtn) {
  const id = li.dataset.id;
  const isLocal = li.dataset.local === "true";

  deleteBtn.disabled = true;
  setStatus("Deleting note...", "loading");
  try {
    const { status } = await request(`${API_URL}/${id}`, { method: "DELETE" });
    removeNoteElement(li);
    if (isLocal) {
      setStatus(
        `Note removed (status ${status}). It was only stored in this page, because JSONPlaceholder does not save new notes.`,
        "success"
      );
    } else {
      setStatus(`Note ${id} deleted (status ${status}).`, "success");
    }
  } catch (error) {
    console.error(error);
    if (isLocal && error.status === 404) {
      removeNoteElement(li);
      setStatus(
        "Note removed locally. The server returned 404 because JSONPlaceholder never saved it.",
        "success"
      );
    } else {
      setStatus("Could not delete the note. Check your connection and try again.", "error");
    }
  } finally {
    deleteBtn.disabled = false;
  }
}

function removeNoteElement(li) {
  li.remove();
  if (!notesList.querySelector(".note")) {
    renderEmptyState();
  }
}

loadBtn.addEventListener("click", loadNotes);
noteForm.addEventListener("submit", createNote);
titleInput.addEventListener("input", () => titleInput.removeAttribute("aria-invalid"));

"use strict";

const API_URL = "https://jsonplaceholder.typicode.com/posts";

const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const notesList = document.getElementById("notes-list");

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

  const body = document.createElement("p");
  body.className = "note-body";
  body.textContent = note.body;

  li.append(title, body);
  return li;
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

loadBtn.addEventListener("click", loadNotes);

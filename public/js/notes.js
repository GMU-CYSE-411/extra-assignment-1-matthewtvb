function noteCard(note) {
  const article = document.createElement("article");
  article.className = "note-card";

  const h3 = document.createElement("h3");
  h3.textContent = note.title;

  const meta = document.createElement("p");
  meta.className = "note-meta";
  meta.textContent = `Owner: ${note.ownerUsername} | ID: ${note.id} | Pinned: ${note.pinned}`;

  const body = document.createElement("div");
  body.className = "note-body";
  body.textContent = note.body;

  article.appendChild(h3);
  article.appendChild(meta);
  article.appendChild(body);
  return article;
}

async function loadNotes(search) {
  const query = new URLSearchParams();
  if (search) query.set("search", search);

  const result = await api(`/api/notes?${query.toString()}`);
  const notesList = document.getElementById("notes-list");
  notesList.textContent = "";
  result.notes.forEach((note) => notesList.appendChild(noteCard(note)));
}

(async function bootstrapNotes() {
  try {
    const user = await loadCurrentUser();

    if (!user) {
      document.getElementById("notes-list").textContent = "Please log in first.";
      return;
    }

    await loadNotes("");
  } catch (error) {
    document.getElementById("notes-list").textContent = error.message;
  }
})();

document.getElementById("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  await loadNotes(formData.get("search"));
});

document.getElementById("create-note-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const payload = {
    title: formData.get("title"),
    body: formData.get("body"),
    pinned: formData.get("pinned") === "on"
  };

  await api("/api/notes", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  await loadNotes("");
  event.currentTarget.reset();
});

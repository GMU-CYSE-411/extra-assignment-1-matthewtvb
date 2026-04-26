(async function bootstrapAdmin() {
  try {
    const user = await loadCurrentUser();

    if (!user) {
      document.getElementById("admin-warning").textContent = "Please log in first.";
      return;
    }

    if (user.role !== "admin") {
      document.getElementById("admin-warning").textContent =
        "The client says this is not your area, but the page still tries to load admin data.";
    } else {
      document.getElementById("admin-warning").textContent = "Authenticated as admin.";
    }

    const result = await api("/api/admin/users");
    const tbody = document.getElementById("admin-users");
    tbody.textContent = "";
    result.users.forEach((entry) => {
      const tr = document.createElement("tr");
      [entry.id, entry.username, entry.role, entry.displayName, entry.noteCount].forEach((val) => {
        const td = document.createElement("td");
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  } catch (error) {
    document.getElementById("admin-warning").textContent = error.message;
  }
})();

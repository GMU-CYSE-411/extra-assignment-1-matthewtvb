// Removed userId parameter; the server derives the target user from the session
async function loadSettings() {
  const result = await api("/api/settings");
  const settings = result.settings;

  const form = document.getElementById("settings-form");
  form.elements.displayName.value = settings.displayName;
  form.elements.theme.value = settings.theme;
  form.elements.statusMessage.value = settings.statusMessage;
  form.elements.emailOptIn.checked = Boolean(settings.emailOptIn);

  // Replaced innerHTML with DOM APIs so displayName and statusMessage are never parsed as HTML
  const preview = document.getElementById("status-preview");
  preview.textContent = "";
  const namePara = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = settings.displayName;
  namePara.appendChild(strong);
  const statusPara = document.createElement("p");
  statusPara.textContent = settings.statusMessage;
  preview.appendChild(namePara);
  preview.appendChild(statusPara);

  writeJson("settings-output", settings);
}

(async function bootstrapSettings() {
  try {
    const user = await loadCurrentUser();

    if (!user) {
      writeJson("settings-output", { error: "Please log in first." });
      return;
    }

    await loadSettings();
  } catch (error) {
    writeJson("settings-output", { error: error.message });
  }
})();

document.getElementById("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  // Removed userId from payload; server assigns the target from the session
  const payload = {
    displayName: formData.get("displayName"),
    theme: formData.get("theme"),
    statusMessage: formData.get("statusMessage"),
    emailOptIn: formData.get("emailOptIn") === "on"
  };

  const result = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  writeJson("settings-output", result);
  await loadSettings();
});

// Changed from GET to POST so the toggle cannot be triggered by a cross-site image or link
document.getElementById("enable-email").addEventListener("click", async () => {
  const result = await api("/api/settings/toggle-email", {
    method: "POST",
    body: JSON.stringify({ enabled: "1" })
  });
  writeJson("settings-output", result);
});

// Changed from GET to POST so the toggle cannot be triggered by a cross-site image or link
document.getElementById("disable-email").addEventListener("click", async () => {
  const result = await api("/api/settings/toggle-email", {
    method: "POST",
    body: JSON.stringify({ enabled: "0" })
  });
  writeJson("settings-output", result);
});

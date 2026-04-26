document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());

  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    // store token for future requests
    if (result.csrfToken) {
      setCsrfToken(result.csrfToken);
    }

    writeJson("login-output", result);
  } catch (error) {
    writeJson("login-output", { error: error.message });
  }
});

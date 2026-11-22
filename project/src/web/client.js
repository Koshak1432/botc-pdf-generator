const form = document.querySelector("#upload");
const input = document.querySelector("#script");
const button = document.querySelector("#generate");
const status = document.querySelector("#status");
const downloads = document.querySelector("#downloads");
const playersLink = document.querySelector("#players");
const storytellerLink = document.querySelector("#storyteller");

input.addEventListener("change", () => {
  clearDownloads();
  status.textContent = "";
  status.removeAttribute("data-error");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = input.files[0];
  if (file === undefined || button.disabled) return;
  clearDownloads();
  input.disabled = true;
  button.disabled = true;
  status.removeAttribute("data-error");
  status.textContent = "Создаём памятки…";

  try {
    const query = new URLSearchParams({ filename: file.name });
    const response = await fetch(`/generate?${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: file,
    });
    if (!response.ok) {
      showError(await response.text());
      return;
    }
    const result = await response.formData();
    const players = result.get("players");
    const storyteller = result.get("storyteller");
    if (!(players instanceof File) || !(storyteller instanceof File)) {
      showError("Не удалось получить обе памятки.");
      return;
    }
    playersLink.href = URL.createObjectURL(players);
    playersLink.download = players.name;
    storytellerLink.href = URL.createObjectURL(storyteller);
    storytellerLink.download = storyteller.name;
    downloads.hidden = false;
    status.textContent = "Оба PDF готовы.";
  } catch {
    showError("Не удалось получить PDF. Проверьте, что генератор запущен.");
  } finally {
    input.disabled = false;
    button.disabled = false;
  }
});

function clearDownloads() {
  downloads.hidden = true;
  for (const link of [playersLink, storytellerLink]) {
    if (link.hasAttribute("href")) {
      URL.revokeObjectURL(link.href);
      link.removeAttribute("href");
    }
  }
}

function showError(message) {
  status.textContent = message;
  status.setAttribute("data-error", "");
}

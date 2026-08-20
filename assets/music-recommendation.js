(() => {
  const sticky = document.querySelector("[data-music-rec-open]");
  const overlay = document.querySelector("[data-music-rec-overlay]");
  const form = document.querySelector("[data-music-rec-form]");
  const closeButtons = [...document.querySelectorAll("[data-music-rec-close]")];
  const recommendation = document.querySelector("[data-music-rec-recommendation]");
  const reason = document.querySelector("[data-music-rec-reason]");
  const sender = document.querySelector("[data-music-rec-sender]");
  const honeypot = document.querySelector("[data-music-rec-honeypot]");
  const status = document.querySelector("[data-music-rec-status]");
  const submit = form?.querySelector("button[type='submit']");
  if (!sticky || !overlay || !form || !recommendation) return;

  let restoreFocus = null;
  const defaultSubmitLabel = submit?.textContent || "send rec";

  function openForm() {
    restoreFocus = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add("music-rec-is-open");
    status.textContent = "";
    status.dataset.state = "";
    if (submit) {
      submit.disabled = false;
      submit.textContent = defaultSubmitLabel;
    }
    window.requestAnimationFrame(() => recommendation.focus());
  }

  function closeForm() {
    overlay.hidden = true;
    document.body.classList.remove("music-rec-is-open");
    status.textContent = "";
    restoreFocus?.focus?.();
  }

  sticky.addEventListener("click", openForm);
  closeButtons.forEach((button) => button.addEventListener("click", closeForm));
  overlay.addEventListener("pointerdown", (event) => {
    if (event.target === overlay) closeForm();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeForm();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const pick = recommendation.value.trim();
    if (!pick) {
      recommendation.focus();
      return;
    }

    if (honeypot?.value) {
      form.reset();
      status.textContent = "Sent. I'll listen soon.";
      status.dataset.state = "success";
      return;
    }

    if (submit) {
      submit.disabled = true;
      submit.textContent = "sending…";
    }
    status.textContent = "Sending…";
    status.dataset.state = "sending";

    try {
      const response = await fetch("https://formsubmit.co/ajax/lgravina@stanford.edu", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          _subject: "Music recommendation from lucasgravina.com",
          _template: "table",
          _captcha: "false",
          recommendation: pick,
          why: reason.value.trim() || "—",
          from: sender.value.trim() || "Anonymous",
          page: window.location.href
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false || result.success === "false") {
        throw new Error(result.message || "Submission failed");
      }

      form.reset();
      status.textContent = "Sent. I'll listen soon.";
      status.dataset.state = "success";
      if (submit) submit.textContent = "sent ✓";
    } catch (error) {
      status.textContent = "Couldn't send that. Try again.";
      status.dataset.state = "error";
      if (submit) {
        submit.disabled = false;
        submit.textContent = "try again ↗";
      }
    }
  });
})();

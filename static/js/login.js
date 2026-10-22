import { api } from "./store.js";

const $ = (id) => document.getElementById(id);
const err = (m) => { $("err").textContent = m || ""; };

$("email-form").addEventListener("submit", async (e) => {
  e.preventDefault(); err();
  try {
    await api("/api/auth/request-code", { method: "POST", body: { email: $("email").value } });
    $("sent-to").textContent = `Code sent to ${$("email").value}. It expires in 10 minutes.`;
    $("email-form").hidden = true; $("code-form").hidden = false; $("code").focus();
  } catch (x) { err(x.message); }
});

$("code-form").addEventListener("submit", async (e) => {
  e.preventDefault(); err();
  try {
    await api("/api/auth/verify-code", { method: "POST", body: { email: $("email").value, code: $("code").value } });
    location.href = "/app";
  } catch (x) { err(x.message); }
});

$("restart").addEventListener("click", () => { $("code-form").hidden = true; $("email-form").hidden = false; err(); });

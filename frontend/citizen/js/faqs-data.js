// SafeSpace — FAQs page data: the public curated FAQ list, plus the
// logged-in citizen's own asked questions.

async function getFAQs() {
  const response = await fetch("/api/faqs/");
  if (!response.ok) throw new Error("Could not load the FAQ list.");
  return response.json();
}

async function getMyQuestions() {
  const response = await authFetch("/api/questions/");
  if (!response.ok) throw new Error("Could not load your questions.");
  return response.json();
}

async function askQuestion(question) {
  const response = await authFetch("/api/questions/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const firstError = Object.values(data)[0];
    throw new Error(Array.isArray(firstError) ? firstError[0] : "Could not submit your question.");
  }
  return response.json();
}

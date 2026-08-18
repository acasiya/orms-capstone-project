// O.R.M.S. — File Report: populate the ordinance dropdown from shared data.

document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("ordinanceSelect");
  select.append(...ORDINANCES.map((o) => new Option(`${o.number} — ${o.title}`, o.id)));
});

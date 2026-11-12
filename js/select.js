// Styled dropdowns. The native <select> stays in the form (so values, FormData and "change"
// events work as before) but is hidden; a button and a list replace the browser's default menu.
// Keyboard: Enter/Space/ArrowDown opens, arrows move, Enter picks, Escape closes, letters jump.
let uid = 0;

export function enhanceSelects(root = document) {
  for (const sel of root.querySelectorAll("select[data-fancy]")) enhance(sel);
}

function enhance(sel) {
  if (sel.dataset.enhanced) return;
  sel.dataset.enhanced = "1";
  const id = `fs-${++uid}`;
  const wrap = document.createElement("div");
  wrap.className = "fsel";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "fsel-btn";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  const label = sel.closest("label")?.querySelector("span");
  if (label) { label.id ||= `${id}-l`; btn.setAttribute("aria-labelledby", `${label.id} ${id}-v`); }
  btn.innerHTML = `<span class="fsel-val" id="${id}-v"></span><svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  const list = document.createElement("ul");
  list.className = "fsel-list";
  list.id = `${id}-list`;
  list.setAttribute("role", "listbox");
  list.tabIndex = -1;
  list.hidden = true;
  btn.setAttribute("aria-controls", list.id);
  sel.hidden = true;
  sel.tabIndex = -1;
  sel.after(wrap);
  wrap.append(btn, list);
  // A click on the surrounding label should open the menu, not focus the hidden select.
  sel.closest("label")?.addEventListener("click", (e) => { if (!wrap.contains(e.target)) { e.preventDefault(); btn.focus(); open(); } });

  let active = 0;
  const opts = () => [...sel.options];
  const sync = () => { btn.querySelector(".fsel-val").textContent = sel.selectedOptions[0]?.textContent || ""; };
  const draw = () => {
    list.innerHTML = opts().map((o, i) => `<li role="option" id="${id}-o${i}" data-i="${i}" aria-selected="${o.selected}"${i === active ? ' class="on"' : ""}>${o.textContent.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])}</li>`).join("");
    list.setAttribute("aria-activedescendant", `${id}-o${active}`);
    list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  };
  const open = () => {
    if (!list.hidden) return;
    active = Math.max(0, sel.selectedIndex);
    draw();
    list.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    wrap.classList.add("open");
    // Open upwards when there's no room below.
    const r = wrap.getBoundingClientRect();
    wrap.classList.toggle("up", innerHeight - r.bottom < Math.min(list.scrollHeight, 280) + 16 && r.top > innerHeight - r.bottom);
    list.focus({ preventScroll: true });
  };
  const close = (focusBtn = true) => {
    if (list.hidden) return;
    list.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    wrap.classList.remove("open", "up");
    if (focusBtn) btn.focus({ preventScroll: true });
  };
  const pick = (i) => {
    if (sel.selectedIndex !== i) {
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    sync();
    close();
  };

  btn.addEventListener("click", () => (list.hidden ? open() : close()));
  btn.addEventListener("keydown", (e) => { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); open(); } });
  list.addEventListener("click", (e) => { const li = e.target.closest("[data-i]"); if (li) pick(Number(li.dataset.i)); });
  list.addEventListener("mousemove", (e) => { const li = e.target.closest("[data-i]"); if (li && Number(li.dataset.i) !== active) { active = Number(li.dataset.i); draw(); } });
  list.addEventListener("keydown", (e) => {
    const n = sel.options.length;
    if (e.key === "ArrowDown") active = Math.min(n - 1, active + 1);
    else if (e.key === "ArrowUp") active = Math.max(0, active - 1);
    else if (e.key === "Home") active = 0;
    else if (e.key === "End") active = n - 1;
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); return pick(active); }
    else if (e.key === "Escape") { e.preventDefault(); return close(); }
    else if (e.key === "Tab") return close(false);
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      const j = opts().findIndex((o, i) => i > active && o.textContent.trim().toLowerCase().startsWith(k));
      const f = j >= 0 ? j : opts().findIndex((o) => o.textContent.trim().toLowerCase().startsWith(k));
      if (f >= 0) active = f;
    } else return;
    e.preventDefault();
    draw();
  });
  document.addEventListener("pointerdown", (e) => { if (!wrap.contains(e.target)) close(false); });
  sel.addEventListener("change", sync);
  // Options can be added after load (buildings, modes), so watch for them.
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true });
  sync();
}

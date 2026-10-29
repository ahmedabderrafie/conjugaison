/* ===========================================================
   app.js — Interface & interactions
   Recherche, menu, rendu des conjugaisons, routage par #hash,
   filtres par groupe, verbe aléatoire, thème clair/sombre.
   =========================================================== */

(function () {
  "use strict";

  const PRON = ["je", "tu", "il", "nous", "vous", "ils"];
  const PRON_SUBJ = ["que je", "que tu", "qu’il", "que nous", "que vous", "qu’ils"];
  const IMPER_LABEL = ["(tu)", "(nous)", "(vous)"];
  const VOWEL = /^[aâàäeéèêëiîïoôöuûüyh]/i;

  // Ordre d'affichage des modes et libellés
  const MODES = [
    ["indicatif", "Indicatif"],
    ["subjonctif", "Subjonctif"],
    ["conditionnel", "Conditionnel"],
    ["imperatif", "Impératif"],
    ["infinitif", "Infinitif"],
    ["participe", "Participe"],
    ["gerondif", "Gérondif"],
  ];
  const COMPOSE_TENSES = new Set([
    "Passé composé", "Plus-que-parfait", "Passé antérieur", "Futur antérieur",
    "Passé",
  ]);

  const GROUP_LABEL = { 1: "1er groupe", 2: "2e groupe", 3: "3e groupe" };

  // --- Éléments du DOM ---
  const el = {
    list: document.getElementById("verbList"),
    search: document.getElementById("search"),
    main: document.getElementById("main"),
    filters: document.getElementById("filters"),
    sidebar: document.getElementById("sidebar"),
    backdrop: document.getElementById("backdrop"),
    menuToggle: document.getElementById("menuToggle"),
    homeLogo: document.getElementById("homeLogo"),
    brandHome: document.getElementById("brandHome"),
    random: document.getElementById("randomBtn"),
    theme: document.getElementById("themeBtn"),
    quiz: document.getElementById("quizBtn"),
    quizModal: document.getElementById("quizModal"),
    quizBox: document.getElementById("quizBox"),
  };

  let currentFilter = "all";
  let currentInf = null;

  // ---------- Favoris ----------
  let favorites = new Set();
  try { favorites = new Set(JSON.parse(localStorage.getItem("conj-favs") || "[]")); }
  catch (e) { favorites = new Set(); }

  function saveFavs() {
    localStorage.setItem("conj-favs", JSON.stringify([...favorites]));
  }
  function toggleFav(inf) {
    if (favorites.has(inf)) favorites.delete(inf); else favorites.add(inf);
    saveFavs();
    buildList();
    const btn = el.main.querySelector(".fav-btn");
    if (btn && currentInf === inf) {
      const on = favorites.has(inf);
      btn.classList.toggle("on", on);
      btn.innerHTML = (on ? "★" : "☆") + " Favori";
    }
  }

  // ---------- Prononciation (synthèse vocale) ----------
  function speak(text) {
    if (!("speechSynthesis" in window) || !text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  function escAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }
  function sayBtn(text) {
    return `<button type="button" class="say" title="Écouter" aria-label="Écouter" data-say="${escAttr(text)}">🔊</button>`;
  }

  // ---------- Rendu du menu ----------
  function normalize(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  // Génère une entrée « régulière » pour un verbe absent de la base.
  // -er → 1er groupe, -ir (hors -oir) → 2e groupe. Retourne null sinon.
  function autoEntry(inf) {
    const w = (inf || "").toLowerCase().trim();
    if (!/^[a-zàâäéèêëîïôöùûüÿç]{2,}$/.test(w)) return null;
    if (VERBS.some((v) => v.inf === w)) return null;
    if (/er$/.test(w) && w !== "aller") {
      const e = { inf: w, group: 1, aux: "avoir", auto: true };
      if (/yer$/.test(w)) e.stem = "yi";
      else if (/é[bcçdfghjklmnpqrstvwxz]er$/.test(w)) e.stem = "eaigu";
      else if (/e[bcçdfghjklmnpqrstvwxz]er$/.test(w)) e.stem = "egrave";
      return e;
    }
    if (/ir$/.test(w) && !/oir$/.test(w)) {
      return { inf: w, group: 2, aux: "avoir", auto: true };
    }
    return null;
  }

  function buildList() {
    const q = normalize(el.search.value.trim());
    const filtered = VERBS.filter((v) => {
      if (currentFilter !== "all" && String(v.group) !== currentFilter) return false;
      if (q && !normalize(v.inf).startsWith(q) &&
              !normalize(v.inf).includes(q) &&
              !normalize(v.tr || "").includes(q)) return false;
      return true;
    });

    el.list.innerHTML = "";
    if (!filtered.length) {
      const w = el.search.value.trim();
      const gen = autoEntry(w);
      el.list.innerHTML =
        `<p class="no-result">Aucun verbe dans la base.` +
        (gen ? `<button type="button" class="gen-btn" data-gen="${escAttr(w)}">⚙️ Conjuguer « ${escAttr(w)} »</button>` : "") +
        `</p>`;
      return;
    }

    const total = document.createElement("div");
    total.className = "list-total";
    total.textContent = q
      ? `${filtered.length} résultat${filtered.length > 1 ? "s" : ""}`
      : `${filtered.length} verbes`;
    el.list.appendChild(total);

    // Regroupé par fréquence, avec les favoris en tête
    const rest = filtered.filter((v) => !favorites.has(v.inf));
    const groups = [
      ["★ Favoris", filtered.filter((v) => favorites.has(v.inf))],
      ["Très fréquents", rest.filter((v) => v.freq === 1)],
      ["Courants", rest.filter((v) => v.freq === 2)],
      ["Moins fréquents", rest.filter((v) => v.freq === 3)],
    ];

    groups.forEach(([label, arr]) => {
      if (!arr.length) return;
      arr.sort((a, b) => a.inf.localeCompare(b.inf, "fr"));
      const h = document.createElement("div");
      h.className = "group-label";
      h.innerHTML = `<span>${label}</span><span class="count">${arr.length}</span>`;
      el.list.appendChild(h);
      arr.forEach((v) => {
        const b = document.createElement("button");
        b.className = "verb-item" + (v.aux === "être" ? " etre" : "") +
          (v.inf === currentInf ? " active" : "");
        b.innerHTML =
          `<span class="star${favorites.has(v.inf) ? " on" : ""}" title="Favori">${favorites.has(v.inf) ? "★" : "☆"}</span>` +
          `<span class="name">${v.inf}</span><span class="tag grp-${v.group}">${v.aux === "être" ? "être" : "G" + v.group}</span>`;
        b.addEventListener("click", (e) => {
          if (e.target.classList.contains("star")) {
            e.stopPropagation();
            toggleFav(v.inf);
            return;
          }
          location.hash = encodeURIComponent(v.inf);
          closeSidebar();
        });
        el.list.appendChild(b);
      });
    });
  }

  // ---------- Rendu d'un temps ----------
  function pronParts(i, form, mode) {
    if (mode === "imperatif") return { pn: IMPER_LABEL[i], cj: form, sep: " " };
    const base = mode === "subjonctif" ? PRON_SUBJ[i] : PRON[i];
    if (/je$/.test(base) && VOWEL.test(form)) {
      return { pn: base.replace(/je$/, "j’"), cj: form, sep: "" };
    }
    return { pn: base, cj: form, sep: " " };
  }

  function renderSimpleList(forms, mode) {
    let html = "<ol>";
    forms.forEach((f, i) => {
      if (f == null) return;
      const { pn, cj, sep } = pronParts(i, f, mode);
      const say = mode === "imperatif" ? f : subjectPhrase(i, f, mode);
      html += `<li><span class="pn">${pn}</span>${sep}<span class="cj">${cj}</span>${sayBtn(say)}</li>`;
    });
    html += "</ol>";
    return html;
  }

  function renderInvariantList(pairs) {
    let html = "<ol>";
    pairs.forEach(([label, val]) => {
      if (val == null) return;
      html += `<li><span class="pn">${label} :</span> <span class="cj">${val}</span>${sayBtn(val)}</li>`;
    });
    html += "</ol>";
    return html;
  }

  function slugify(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().trim().replace(/\s+/g, "-");
  }

  // ---------- Exemples de phrases ----------
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function subjectPhrase(i, form, mode) {
    const base = mode === "subjonctif" ? PRON_SUBJ[i] : PRON[i];
    if (/je$/.test(base) && VOWEL.test(form)) {
      return base.replace(/je$/, "j’") + form;
    }
    return base + " " + form;
  }

  // Templates : {i: personne, pre, suf}. La phrase illustre la valeur du temps.
  const EXAMPLES = {
    indicatif: {
      "Présent": [{ i: 0, pre: "En ce moment, ", suf: "." }, { i: 3, pre: "Chaque jour, ", suf: "." }],
      "Imparfait": [{ i: 2, pre: "Autrefois, ", suf: " souvent." }, { i: 3, pre: "Pendant les vacances, ", suf: " tous les jours." }],
      "Passé simple": [{ i: 2, pre: "Ce jour-là, ", suf: "." }, { i: 5, pre: "Soudain, ", suf: "." }],
      "Futur simple": [{ i: 1, pre: "Demain, ", suf: "." }, { i: 3, pre: "L'année prochaine, ", suf: "." }],
      "Passé composé": [{ i: 0, pre: "Hier, ", suf: "." }, { i: 4, pre: "Ce matin, ", suf: " ensemble." }],
      "Plus-que-parfait": [{ i: 2, pre: "Quand tu es arrivé, ", suf: " déjà." }],
      "Passé antérieur": [{ i: 0, pre: "Lorsque ", suf: ", je partis." }],
      "Futur antérieur": [{ i: 1, pre: "Quand ", suf: ", préviens-moi." }],
    },
    subjonctif: {
      "Présent": [{ i: 0, pre: "Il faut ", suf: "." }, { i: 2, pre: "Je veux ", suf: "." }],
      "Imparfait": [{ i: 0, pre: "Il fallait ", suf: "." }],
      "Passé": [{ i: 2, pre: "Bien ", suf: ", il est venu." }],
      "Plus-que-parfait": [{ i: 2, pre: "J'aurais préféré ", suf: "." }],
    },
    conditionnel: {
      "Présent": [{ i: 0, pre: "Si je pouvais, ", suf: "." }, { i: 1, pre: "À ta place, ", suf: "." }],
      "Passé": [{ i: 0, pre: "Avec plus de temps, ", suf: "." }],
    },
  };

  const IMPER_EXAMPLES = {
    "Présent": [
      (f) => f[0] ? cap(f[0]) + " maintenant !" : null,
      (f) => f[1] ? cap(f[1]) + " ensemble !" : null,
      (f) => f[2] ? cap(f[2]) + ", s'il vous plaît !" : null,
    ],
    "Passé": [(f) => f[0] ? cap(f[0]) + " avant ce soir !" : null],
  };

  function buildTenseExamples(mode, tense, forms) {
    if (mode === "imperatif") {
      const gens = IMPER_EXAMPLES[tense] || [];
      return gens.map((g) => g(forms)).filter(Boolean);
    }
    const tpl = (EXAMPLES[mode] || {})[tense];
    if (!tpl) return [];
    return tpl.map((t) => {
      const form = forms[t.i];
      if (form == null) return null;
      return cap(t.pre + subjectPhrase(t.i, form, mode) + t.suf);
    }).filter(Boolean);
  }

  function buildInvariantExamples(key, data) {
    if (key === "infinitif") {
      return [
        data["Présent"] ? "Je dois " + data["Présent"] + "." : null,
        data["Passé"] ? "Après " + data["Passé"] + ", il partit." : null,
      ].filter(Boolean);
    }
    if (key === "participe") {
      return [
        data["Présent"] ? cap(data["Présent"]) + ", il réfléchit." : null,
        data["Passé composé"] ? cap(data["Passé composé"]) + ", il partit." : null,
      ].filter(Boolean);
    }
    if (key === "gerondif") {
      return [
        data["Présent"] ? cap(data["Présent"]) + ", on apprend." : null,
      ].filter(Boolean);
    }
    return [];
  }

  function exampleBlock(sentences) {
    if (!sentences.length) return "";
    const items = sentences.map((s) => `<li>${s}</li>`).join("");
    return `<button type="button" class="ex-toggle">Exemples</button>
      <ul class="ex-list" hidden>${items}</ul>`;
  }

  function tenseCard(title, bodyHtml, isCompose, examplesHtml) {
    return `<div class="tense-card ${isCompose ? "compose" : "simple"} t-${slugify(title)}">
      <h4>${title}</h4>${bodyHtml}${examplesHtml || ""}</div>`;
  }

  function renderMode(key, label, data) {
    let cards = "";

    if (key === "infinitif" || key === "participe" || key === "gerondif") {
      const pairs = Object.entries(data).filter(([, v]) => v != null);
      if (!pairs.length) return "";
      cards = tenseCard(
        "Formes",
        renderInvariantList(pairs),
        false,
        exampleBlock(buildInvariantExamples(key, data))
      );
    } else {
      const entries = Object.entries(data);
      const hasContent = entries.some(([, forms]) =>
        Array.isArray(forms) && forms.some((f) => f != null));
      if (!hasContent) return "";
      entries.forEach(([tense, forms]) => {
        if (!forms || !forms.some((f) => f != null)) return;
        const isCompose = COMPOSE_TENSES.has(tense);
        cards += tenseCard(
          tense,
          renderSimpleList(forms, key),
          isCompose,
          exampleBlock(buildTenseExamples(key, tense, forms))
        );
      });
    }

    return `<section class="mode">
      <div class="mode-head"><span class="dot"></span><h3>${label}</h3></div>
      <div class="tense-grid">${cards}</div>
    </section>`;
  }

  function renderVerb(inf) {
    let entry = VERBS.find((v) => v.inf === inf);
    const generated = !entry;
    if (!entry) entry = autoEntry(inf);
    if (!entry) { renderNotFound(inf); return; }
    currentInf = inf;

    let c;
    try {
      c = conjugate(entry);
    } catch (e) {
      el.main.innerHTML = `<p class="no-result">Erreur : ${e.message}</p>`;
      return;
    }

    const auxClass = entry.aux === "être" ? "aux-etre" : "";
    const isFav = favorites.has(entry.inf);
    let html = `<div class="verb-head">
      <h2>${entry.inf}</h2>
      <div class="meta">
        <span class="badge grp grp-${entry.group}">${GROUP_LABEL[entry.group]}</span>
        <span class="badge ${auxClass}">auxiliaire : ${entry.aux}</span>
        <span class="badge">participe passé : ${c.participePasse}</span>
        ${entry.tr ? `<span class="badge tr">${entry.tr}</span>` : ""}
        ${entry.defective ? `<span class="badge tr">verbe défectif</span>` : ""}
        ${generated ? `<span class="badge gen">généré automatiquement</span>` : ""}
      </div>
      <div class="verb-actions">
        <button type="button" class="act-btn say" data-say="${escAttr(entry.inf)}">🔊 Écouter</button>
        <button type="button" class="act-btn fav-btn${isFav ? " on" : ""}">${isFav ? "★" : "☆"} Favori</button>
        <button type="button" class="act-btn copy-btn">⧉ Copier</button>
        <button type="button" class="act-btn print-btn">🖨 Imprimer</button>
      </div>
    </div>`;

    if (generated) {
      const modele = entry.group === 1 ? "du 1er groupe (verbes en -er)" : "du 2e groupe (verbes en -ir, type « finir »)";
      html += `<p class="verb-auto">⚙️ Ce verbe n'est pas dans la base : la conjugaison est <strong>générée automatiquement</strong> selon le modèle régulier ${modele}. Un verbe irrégulier ou un auxiliaire « être » peut différer.</p>`;
    }

    const def = (typeof DEFINITIONS !== "undefined") ? DEFINITIONS[entry.inf] : null;
    if (def) {
      html += `<p class="verb-def"><strong>${cap(entry.inf)}</strong> — ${def}</p>`;
    }

    MODES.forEach(([k, lbl]) => { html += renderMode(k, lbl, c[k]); });

    el.main.innerHTML = html;
    el.main.parentElement.scrollTop = 0;
    document.title = `Conjuguer « ${entry.inf} » — Conjugaison française`;
    buildList();
  }

  function renderNotFound(inf) {
    currentInf = null;
    document.title = "Verbe introuvable — Conjugaison française";
    el.main.innerHTML =
      `<div class="verb-head"><h2>${escAttr(inf)}</h2></div>
       <p class="verb-auto">Ce verbe est introuvable et ne correspond à aucun modèle régulier connu
       (terminaisons -er ou -ir). Vérifiez l'orthographe, ou choisissez un verbe dans la liste.</p>`;
    el.main.parentElement.scrollTop = 0;
    buildList();
  }

  function renderIntro() {
    currentInf = null;
    document.title = "Conjugaison française — Le conjugueur de référence";
    el.main.innerHTML = `
      <div class="verb-head"><h2>Bienvenue</h2>
        <div class="meta"><span class="badge">${VERBS.length} verbes</span>
        <span class="badge tr">tous les modes et temps</span></div>
      </div>
      <div class="intro">
        <h3>Un conjugueur clair, complet et rapide</h3>
        <p>Cherchez un verbe dans la barre de gauche, filtrez par groupe, ou
        laissez-vous surprendre par le bouton <strong>Aléatoire</strong>.
        Chaque fiche présente les sept modes du français, organisés
        <em>mode par mode</em> puis <em>temps par temps</em>.</p>
        <ul>
          <li><strong>1er groupe</strong> : verbes en <em>-er</em> (parler), y compris les
          particularités (manger, commencer, appeler, acheter, préférer, payer…).</li>
          <li><strong>2e groupe</strong> : verbes en <em>-ir</em> de type « finir ».</li>
          <li><strong>3e groupe</strong> : verbes irréguliers, générés à partir de leurs
          temps primitifs.</li>
        </ul>
        <p>Les temps <strong>simples</strong> sont bordés de bleu, les temps
        <strong>composés</strong> de rouge — aux couleurs de la France.</p>
      </div>`;
    buildList();
  }

  // ---------- Copier la conjugaison ----------
  function plainConjugation(entry, c) {
    const lines = [entry.inf.toUpperCase()];
    MODES.forEach(([key, label]) => {
      const data = c[key];
      const chunks = [];
      if (key === "infinitif" || key === "participe" || key === "gerondif") {
        Object.entries(data).forEach(([t, v]) => { if (v != null) chunks.push(`  ${t} : ${v}`); });
      } else {
        Object.entries(data).forEach(([tense, forms]) => {
          if (!Array.isArray(forms) || !forms.some((f) => f != null)) return;
          chunks.push(`  ${tense}`);
          forms.forEach((f, i) => {
            if (f == null) return;
            chunks.push("    " + subjectPhrase(i, f, key));
          });
        });
      }
      if (chunks.length) { lines.push("", label.toUpperCase(), ...chunks); }
    });
    return lines.join("\n");
  }

  function copyConjugation() {
    const entry = VERBS.find((v) => v.inf === currentInf);
    if (!entry) return;
    let c;
    try { c = conjugate(entry); } catch (e) { return; }
    const text = plainConjugation(entry, c);
    const done = () => {
      const btn = el.main.querySelector(".copy-btn");
      if (!btn) return;
      const old = btn.innerHTML;
      btn.innerHTML = "✓ Copié";
      btn.classList.add("done");
      setTimeout(() => { btn.innerHTML = old; btn.classList.remove("done"); }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => {});
    } else {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  // ---------- Mode entraînement (quiz) ----------
  const QUIZ_TENSES = [
    ["indicatif", "Présent"],
    ["indicatif", "Imparfait"],
    ["indicatif", "Futur simple"],
    ["indicatif", "Passé composé"],
    ["subjonctif", "Présent"],
    ["conditionnel", "Présent"],
  ];
  let quiz = null;

  function newQuestion() {
    const pool = VERBS.filter((v) => v.freq <= 2);
    for (let tries = 0; tries < 60; tries++) {
      const v = pool[Math.floor(Math.random() * pool.length)];
      const [mode, tense] = QUIZ_TENSES[Math.floor(Math.random() * QUIZ_TENSES.length)];
      let c;
      try { c = conjugate(v); } catch (e) { continue; }
      const forms = c[mode] && c[mode][tense];
      if (!Array.isArray(forms)) continue;
      const idxs = forms.map((f, i) => (f != null ? i : -1)).filter((i) => i >= 0);
      if (!idxs.length) continue;
      const i = idxs[Math.floor(Math.random() * idxs.length)];
      return { inf: v.inf, mode, tense, i, answer: forms[i] };
    }
    return null;
  }

  function quizPrompt(q) {
    const base = q.mode === "subjonctif" ? PRON_SUBJ[q.i] : PRON[q.i];
    return base;
  }

  function renderQuiz() {
    if (!quiz) return;
    const q = quiz.q;
    const modeLabel = (MODES.find(([k]) => k === q.mode) || [])[1] || q.mode;
    let feedback = "";
    if (quiz.state === "right") {
      feedback = `<p class="quiz-fb right">✓ Bravo ! <strong>${quizPrompt(q)} ${q.answer}</strong></p>`;
    } else if (quiz.state === "accent") {
      feedback = `<p class="quiz-fb accent">Presque — attention aux accents : <strong>${q.answer}</strong></p>`;
    } else if (quiz.state === "wrong") {
      feedback = `<p class="quiz-fb wrong">✗ La réponse était <strong>${q.answer}</strong></p>`;
    }
    const answered = quiz.state && quiz.state !== "ask";
    el.quizBox.innerHTML = `
      <div class="quiz-head">
        <h3>Entraînement</h3>
        <button type="button" class="quiz-close" data-q="close" aria-label="Fermer">✕</button>
      </div>
      <p class="quiz-task">Conjuguez <strong>${q.inf}</strong><br>
        <span class="quiz-tense">${modeLabel} · ${q.tense}</span></p>
      <div class="quiz-input">
        <span class="quiz-pron">${quizPrompt(q)}</span>
        <input id="quizInput" type="text" autocomplete="off" autocapitalize="off"
          spellcheck="false" ${answered ? "disabled" : ""} value="${answered ? escAttr(quiz.given || "") : ""}">
      </div>
      ${feedback}
      <div class="quiz-actions">
        ${answered
          ? `<button type="button" class="act-btn primary" data-q="next">Question suivante →</button>`
          : `<button type="button" class="act-btn primary" data-q="check">Valider</button>`}
        <span class="quiz-score">Score : ${quiz.score} / ${quiz.total}</span>
      </div>`;
    const input = document.getElementById("quizInput");
    if (input && !answered) input.focus();
  }

  function quizCheck() {
    const input = document.getElementById("quizInput");
    if (!input) return;
    const given = input.value.trim();
    if (!given) return;
    quiz.given = given;
    quiz.total++;
    const exact = given === quiz.q.answer;
    const loose = normalize(given) === normalize(quiz.q.answer);
    if (exact) { quiz.state = "right"; quiz.score++; }
    else if (loose) { quiz.state = "accent"; quiz.score++; }
    else { quiz.state = "wrong"; }
    renderQuiz();
  }

  function quizNext() {
    const q = newQuestion();
    if (!q) { closeQuiz(); return; }
    quiz.q = q;
    quiz.state = "ask";
    quiz.given = "";
    renderQuiz();
  }

  function openQuiz() {
    quiz = { score: 0, total: 0 };
    quizNext();
    el.quizModal.removeAttribute("hidden");
  }
  function closeQuiz() {
    el.quizModal.setAttribute("hidden", "");
    speechSynthesis && speechSynthesis.cancel();
  }

  // ---------- Filtres ----------
  function buildFilters() {
    const defs = [["all", "Tous"], ["1", "1er gr."], ["2", "2e gr."], ["3", "3e gr."]];
    el.filters.innerHTML = "";
    defs.forEach(([val, label]) => {
      const b = document.createElement("button");
      b.className = "chip" + (val === currentFilter ? " active" : "");
      b.textContent = label;
      b.addEventListener("click", () => {
        currentFilter = val;
        buildFilters();
        buildList();
      });
      el.filters.appendChild(b);
    });
  }

  // ---------- Sidebar mobile ----------
  function openSidebar() {
    el.sidebar.classList.add("open");
    el.backdrop.classList.add("show");
  }
  function closeSidebar() {
    el.sidebar.classList.remove("open");
    el.backdrop.classList.remove("show");
  }

  // ---------- Thème ----------
  function applyTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem("conj-theme", mode);
    el.theme.textContent = mode === "dark" ? "☀︎" : "☾";
  }

  // ---------- Routage ----------
  function route() {
    const inf = decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
    if (!inf) { renderIntro(); return; }
    renderVerb(inf);
  }

  // ---------- Initialisation ----------
  function init() {
    buildFilters();
    buildList();

    el.search.addEventListener("input", buildList);
    el.search.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const w = el.search.value.trim();
      if (!w) return;
      const exact = VERBS.find((v) => normalize(v.inf) === normalize(w));
      const target = exact ? exact.inf : (autoEntry(w) ? w : null);
      if (target) { location.hash = encodeURIComponent(target); closeSidebar(); }
    });
    el.list.addEventListener("click", (e) => {
      const g = e.target.closest(".gen-btn");
      if (g) { location.hash = encodeURIComponent(g.dataset.gen); closeSidebar(); }
    });
    el.menuToggle.addEventListener("click", openSidebar);
    el.homeLogo.addEventListener("click", (e) => {
      e.preventDefault();
      if (location.hash) location.hash = "";
      else renderIntro();
      closeSidebar();
    });
    el.brandHome.addEventListener("click", (e) => {
      e.preventDefault();
      if (location.hash) location.hash = "";
      else renderIntro();
      closeSidebar();
    });
    el.backdrop.addEventListener("click", closeSidebar);
    el.random.addEventListener("click", () => {
      const v = VERBS[Math.floor(Math.random() * VERBS.length)];
      location.hash = encodeURIComponent(v.inf);
    });
    el.theme.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") === "dark"
        ? "light" : "dark";
      applyTheme(cur);
    });

    // Basculer l'affichage des exemples + actions (délégation d'événements)
    el.main.addEventListener("click", (e) => {
      const toggle = e.target.closest(".ex-toggle");
      if (toggle) {
        const list = toggle.nextElementSibling;
        const open = list.hasAttribute("hidden");
        if (open) list.removeAttribute("hidden"); else list.setAttribute("hidden", "");
        toggle.classList.toggle("open", open);
        return;
      }
      const say = e.target.closest(".say");
      if (say) { speak(say.dataset.say); return; }
      if (e.target.closest(".fav-btn")) { toggleFav(currentInf); return; }
      if (e.target.closest(".copy-btn")) { copyConjugation(); return; }
      if (e.target.closest(".print-btn")) { window.print(); return; }
    });

    // Entraînement (quiz)
    el.quiz.addEventListener("click", openQuiz);
    el.quizModal.addEventListener("click", (e) => {
      if (e.target === el.quizModal) { closeQuiz(); return; }
      const btn = e.target.closest("[data-q]");
      if (!btn) return;
      const a = btn.dataset.q;
      if (a === "close") closeQuiz();
      else if (a === "check") quizCheck();
      else if (a === "next") quizNext();
    });
    el.quizModal.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (quiz && quiz.state && quiz.state !== "ask") quizNext();
      else quizCheck();
    });

    // Raccourcis clavier
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!el.quizModal.hasAttribute("hidden")) closeQuiz();
        else closeSidebar();
        return;
      }
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
      if (e.key === "/" && !typing) { e.preventDefault(); el.search.focus(); }
    });

    const saved = localStorage.getItem("conj-theme") || "light";
    applyTheme(saved);

    window.addEventListener("hashchange", route);
    route();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

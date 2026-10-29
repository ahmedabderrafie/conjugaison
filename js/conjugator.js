/* ===========================================================
   conjugator.js — Moteur de conjugaison
   -----------------------------------------------------------
   conjugate(entry) -> objet structuré (modes > temps > [6])
   Gère :
   - 1er groupe (-er) + particularités (double, egrave, yi, eaigu,
     verbes en -ger / -cer)
   - 2e groupe (-ir, type finir)
   - 3e groupe via les temps primitifs (IRREGULARS)
   - temps composés (auxiliaire + participe passé, accord avec être)
   =========================================================== */

(function (global) {
  "use strict";

  const END = {
    er_pres: ["e", "es", "e", "ons", "ez", "ent"],
    ir_pres: ["is", "is", "it", "issons", "issez", "issent"],
    impf: ["ais", "ais", "ait", "ions", "iez", "aient"],
    fut: ["ai", "as", "a", "ons", "ez", "ont"],
    cond: ["ais", "ais", "ait", "ions", "iez", "aient"],
    subj: ["e", "es", "e", "ions", "iez", "ent"],
    ps_a: ["ai", "as", "a", "âmes", "âtes", "èrent"],
    ps_i: ["is", "is", "it", "îmes", "îtes", "irent"],
    ps_u: ["us", "us", "ut", "ûmes", "ûtes", "urent"],
    ps_in: ["ins", "ins", "int", "înmes", "întes", "inrent"],
  };

  const CIRC = { a: "â", e: "ê", i: "î", o: "ô", u: "û" };

  // Auxiliaires — temps simples utilisés pour former les temps composés
  const AUX = {
    avoir: {
      present: ["ai", "as", "a", "avons", "avez", "ont"],
      imparfait: ["avais", "avais", "avait", "avions", "aviez", "avaient"],
      futur: ["aurai", "auras", "aura", "aurons", "aurez", "auront"],
      cond: ["aurais", "aurais", "aurait", "aurions", "auriez", "auraient"],
      passeSimple: ["eus", "eus", "eut", "eûmes", "eûtes", "eurent"],
      subjPresent: ["aie", "aies", "ait", "ayons", "ayez", "aient"],
      subjImparfait: ["eusse", "eusses", "eût", "eussions", "eussiez", "eussent"],
      imper: ["aie", "ayons", "ayez"],
      inf: "avoir", part: "ayant",
    },
    "être": {
      present: ["suis", "es", "est", "sommes", "êtes", "sont"],
      imparfait: ["étais", "étais", "était", "étions", "étiez", "étaient"],
      futur: ["serai", "seras", "sera", "serons", "serez", "seront"],
      cond: ["serais", "serais", "serait", "serions", "seriez", "seraient"],
      passeSimple: ["fus", "fus", "fut", "fûmes", "fûtes", "furent"],
      subjPresent: ["sois", "sois", "soit", "soyons", "soyez", "soient"],
      subjImparfait: ["fusse", "fusses", "fût", "fussions", "fussiez", "fussent"],
      imper: ["sois", "soyons", "soyez"],
      inf: "être", part: "étant",
    },
  };

  // Adoucissement -ger / -cer devant a/o
  function soften(stem, endingVowel) {
    if (/g$/.test(stem) && /[aoâ]/.test(endingVowel)) return stem + "e";
    if (/c$/.test(stem) && /[aoâ]/.test(endingVowel)) return stem.slice(0, -1) + "ç";
    return stem;
  }

  // Radical modifié devant terminaison muette (e, es, e, ent) pour -er
  function changedStem(stem, type) {
    switch (type) {
      case "double": {
        const m = stem.match(/([bcdfglmnprstz])$/i);
        return m ? stem + m[1] : stem;
      }
      case "egrave":
        return stem.replace(/e([bcdfglmnprstvz])$/i, "è$1");
      case "eaigu":
        return stem.replace(/é([bcdfglmnprstvz])$/i, "è$1");
      case "yi":
        return stem.replace(/y$/i, "i");
      default:
        return stem;
    }
  }

  function addCircumflex(base) {
    for (let i = base.length - 1; i >= 0; i--) {
      const c = base[i].toLowerCase();
      if (CIRC[c]) return base.slice(0, i) + CIRC[c] + base.slice(i + 1);
    }
    return base;
  }

  function passeSimpleForms(stem, type) {
    const map = { a: END.ps_a, i: END.ps_i, u: END.ps_u, in: END.ps_in };
    return map[type].map((e) => stem + e);
  }

  // Subjonctif imparfait à partir de la 2e pers. du passé simple
  function subjImparfait(psForms) {
    const tu = psForms[1];
    if (!tu) return [null, null, null, null, null, null];
    const base = tu.replace(/s$/, "");
    return [
      base + "sse",
      base + "sses",
      addCircumflex(base) + "t",
      base + "ssions",
      base + "ssiez",
      base + "ssent",
    ];
  }

  function apply(endings, fn) {
    return endings.map((e, i) => fn(e, i));
  }

  // ------- Construction des temps simples selon le groupe -------
  function simpleTenses(entry) {
    const inf = entry.inf;
    let pres, impf, fut, cond, ps, subjPres, imper, partPres, pp;

    if (entry.group === 1) {
      const stem = inf.slice(0, -2); // retire "er"
      const chg = changedStem(stem, entry.stem);
      pres = [
        chg + "e", chg + "es", chg + "e",
        soften(stem, "o") + "ons", stem + "ez", chg + "ent",
      ];
      impf = apply(END.impf, (e) => soften(stem, e[0]) + e);
      const futStem = entry.futStem ||
        ((entry.stem === "double" || entry.stem === "egrave" || entry.stem === "yi")
          ? changedStem(stem, entry.stem) + "er"
          : stem + "er");
      fut = END.fut.map((e) => futStem + e);
      cond = END.cond.map((e) => futStem + e);
      ps = apply(END.ps_a, (e) => soften(stem, e[0]) + e);
      subjPres = [
        chg + "e", chg + "es", chg + "e",
        stem + "ions", stem + "iez", chg + "ent",
      ];
      partPres = soften(stem, "a") + "ant";
      pp = stem + "é";
      imper = [dropImperativeS(pres[1], entry.group), pres[3], pres[4]];
    } else if (entry.group === 2) {
      const stem = inf.slice(0, -2); // retire "ir"
      pres = END.ir_pres.map((e) => stem + e);
      impf = END.impf.map((e) => stem + "iss" + e);
      fut = END.fut.map((e) => inf + e);
      cond = END.cond.map((e) => inf + e);
      ps = passeSimpleForms(stem, "i");
      subjPres = END.subj.map((e) => stem + "iss" + e);
      partPres = stem + "issant";
      pp = stem + "i";
      imper = [pres[1], pres[3], pres[4]];
    } else {
      // 3e groupe : temps primitifs
      const d = global.IRREGULARS[inf];
      if (!d) throw new Error("Verbe irrégulier inconnu : " + inf);
      pres = d.pres.slice();
      pp = d.pp;
      fut = END.fut.map((e) => d.futStem + e);
      cond = END.cond.map((e) => d.futStem + e);
      ps = d.ps.forms || passeSimpleForms(d.ps.stem, d.ps.type);

      const nous = pres[3];
      const nousStem = nous ? nous.replace(/ons$/, "") : null;
      impf = d.impf || (nousStem
        ? END.impf.map((e) => soften(nousStem, e[0]) + e)
        : [null, null, null, null, null, null]);
      partPres = d.part !== undefined
        ? d.part
        : (nousStem ? soften(nousStem, "a") + "ant" : null);

      if (d.subj) {
        subjPres = d.subj.slice();
      } else {
        const ils = pres[5];
        const sStem = ils ? ils.replace(/ent$/, "") : "";
        subjPres = [
          sStem + "e", sStem + "es", sStem + "e",
          impf[3], impf[4], sStem + "ent",
        ];
      }

      if (d.imper === null) {
        imper = null;
      } else if (d.imper) {
        imper = d.imper.slice();
      } else {
        imper = [dropImperativeS(pres[1], 3), pres[3], pres[4]];
      }
    }

    const subjImpf = subjImparfait(ps);
    return { pres, impf, fut, cond, ps, subjPres, subjImpf, imper, partPres, pp };
  }

  function dropImperativeS(form, group) {
    if (!form) return form;
    if (group === 1 && /es$/.test(form)) return form.replace(/s$/, "");
    if (/[ae]s$/.test(form)) return form.replace(/s$/, ""); // vas -> va
    return form;
  }

  // Participe passé décliné (accord avec être)
  function ppPersons(pp, aux) {
    if (aux !== "être") return [pp, pp, pp, pp, pp, pp];
    return [
      pp + "(e)", pp + "(e)", pp,
      pp + "(e)s", pp + "(e)(s)", pp + "s",
    ];
  }

  function compose(auxForms, ppArr) {
    return auxForms.map((a, i) => (a && ppArr[i] != null ? a + " " + ppArr[i] : null));
  }

  function conjugate(entry) {
    const aux = entry.aux || "avoir";
    const A = AUX[aux];
    const t = simpleTenses(entry);
    const ppArr = ppPersons(t.pp, aux);
    const ppMasc = t.pp;

    // Impératif composé (tu, nous, vous) = auxiliaire impératif + participe passé
    let imperCompose = null;
    if (t.imper) {
      const ppImp = aux === "être"
        ? [ppMasc + "(e)", ppMasc + "(e)s", ppMasc + "(e)(s)"]
        : [ppMasc, ppMasc, ppMasc];
      imperCompose = A.imper.map((a, i) => a + " " + ppImp[i]);
    }

    const result = {
      inf: entry.inf,
      group: entry.group,
      aux,
      defective: entry.defective || null,
      participePasse: ppMasc,
      indicatif: {
        "Présent": t.pres,
        "Imparfait": t.impf,
        "Passé simple": t.ps,
        "Futur simple": t.fut,
        "Passé composé": compose(A.present, ppArr),
        "Plus-que-parfait": compose(A.imparfait, ppArr),
        "Passé antérieur": compose(A.passeSimple, ppArr),
        "Futur antérieur": compose(A.futur, ppArr),
      },
      subjonctif: {
        "Présent": t.subjPres,
        "Imparfait": t.subjImpf,
        "Passé": compose(A.subjPresent, ppArr),
        "Plus-que-parfait": compose(A.subjImparfait, ppArr),
      },
      conditionnel: {
        "Présent": t.cond,
        "Passé": compose(A.cond, ppArr),
      },
      imperatif: {
        "Présent": t.imper,
        "Passé": imperCompose,
      },
      infinitif: {
        "Présent": entry.inf,
        "Passé": A.inf + " " + ppMasc,
      },
      participe: {
        "Présent": t.partPres,
        "Passé": ppMasc,
        "Passé composé": t.partPres ? (A.part + " " + ppMasc) : null,
      },
      gerondif: {
        "Présent": t.partPres ? "en " + t.partPres : null,
        "Passé": t.partPres ? "en " + A.part + " " + ppMasc : null,
      },
    };

    if (entry.defective === "il") maskImpersonal(result);
    return result;
  }

  // Verbes défectifs impersonnels (falloir, pleuvoir) : ne garder que « il »
  function maskImpersonal(result) {
    ["indicatif", "subjonctif", "conditionnel"].forEach((mode) => {
      Object.keys(result[mode]).forEach((tense) => {
        const arr = result[mode][tense];
        if (Array.isArray(arr)) {
          result[mode][tense] = arr.map((f, i) => (i === 2 ? f : null));
        }
      });
    });
    result.imperatif["Présent"] = null;
    result.imperatif["Passé"] = null;
  }

  global.conjugate = conjugate;
  if (typeof module !== "undefined") module.exports = { conjugate };
})(typeof globalThis !== "undefined" ? globalThis : this);

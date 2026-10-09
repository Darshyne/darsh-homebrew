/**
 * Les formulaires des recettes, bâtis d'après le catalogue du moteur (`api.content.recipes`) : un champ par `kind`, une ligne par
 * clause de condition. Rien ici ne connaît le sens d'une recette ; les choix qui dépendent de dnd5e (types de dégâts, états,
 * tailles…) viennent de CONFIG, ceux qui dépendent de l'objet (activités, effets) de l'item passé.
 *
 * Chaque saisie porte des `data-*` qui disent où ranger sa valeur ; `readInput` les relit (creator.mjs).
 */
import { loc, engineLoc, escape } from "../shared.mjs";
import { fieldVisible } from "../core/creations.mjs";

const option = (value, label, selected) => `<option value="${escape(value)}" ${selected ? "selected" : ""}>${escape(label)}</option>`;
const valueLabel = v => engineLoc(`Recette.Valeur.${v}`);
const labelOf = entry => game.i18n.localize(entry?.label ?? entry?.name ?? "");

/** Les choix d'un genre qui vient de dnd5e ou du cœur : `[[valeur, libellé]]`. */
function configChoices(kind, { factOptions }={}) {
  switch ( kind ) {
    case "damageType":
    case "damageTypes":
      return Object.entries(CONFIG.DND5E.damageTypes).map(([k, v]) => [k, labelOf(v)]);
    case "creatureType":
      return Object.entries(CONFIG.DND5E.creatureTypes).map(([k, v]) => [k, labelOf(v)]);
    case "size":
      return (factOptions?.size ?? Object.keys(CONFIG.DND5E.actorSizes)).map(k => [k, labelOf(CONFIG.DND5E.actorSizes[k]) || k]);
    case "activityType":
      return (factOptions?.activityType ?? []).map(k => {
        const title = CONFIG.DND5E.activityTypes?.[k]?.documentClass?.metadata?.title;
        return [k, title ? game.i18n.localize(title) : k];
      });
    case "units":
      return ["ft", "m"].map(u => [u, valueLabel(u)]);
    default:
      return [];
  }
}

/** Les activités de l'item (filtrées par type), `[[id, libellé]]`. */
function activityChoices(item, types) {
  const list = item?.system?.activities ? Array.from(item.system.activities) : [];
  return list.filter(a => !types?.length || types.includes(a.type)).map(a => [a.id, `${a.name} (${a.type})`]);
}

/** Les effets de l'item, `[[id, libellé]]`. */
function effectChoices(item) {
  return Array.from(item?.effects ?? []).map(e => [e.id, e.name]);
}

/**
 * Les états proposés : ceux de jeu seulement, d'après `CONFIG.DND5E.conditionTypes` de dnd5e 6 (config.mjs:3640) — les
 * conditions des règles d'abord, puis les états secondaires que dnd5e marque `pseudo` (Saignement, Maudit, Réduit au
 * silence…). Les marqueurs techniques de `CONFIG.statusEffects` qui n'y sont pas (abris, Concentré, Pointe, Désengagé,
 * Réaction utilisée…) sont écartés. Rend `{ conditions, others }`, chacun `[[id, libellé]]` trié, limité aux états connus du cœur.
 */
function statusGroups() {
  const known = new Set(CONFIG.statusEffects.map(s => s.id).filter(Boolean));
  const sorted = list => list.sort((a, b) => a[1].localeCompare(b[1]));
  const conditions = [];
  const others = [];
  for ( const [id, c] of Object.entries(CONFIG.DND5E.conditionTypes ?? {}) ) {
    if ( !known.has(id) ) continue;
    (c.pseudo ? others : conditions).push([id, labelOf(c)]);
  }
  return { conditions: sorted(conditions), others: sorted(others) };
}

/** Le `<select>` d'un état, par groupes ; une valeur déjà choisie hors de la liste (création ancienne, base reprise) est gardée. */
function statusSelect(attrs, value, blank=null) {
  const { conditions, others } = statusGroups();
  const listed = new Set([...conditions, ...others].map(([id]) => id));
  const group = (label, list) => list.length
    ? `<optgroup label="${escape(label)}">${list.map(([v, l]) => option(v, l, v === value)).join("")}</optgroup>` : "";
  const extra = (value && !listed.has(value))
    ? option(value, labelOf(CONFIG.statusEffects.find(s => s.id === value)) || value, true) : "";
  const first = blank !== null ? option("", blank, !value) : "";
  return `<select ${attrs}>${first}${extra}${group(loc("Etat.Conditions"), conditions)}${group(loc("Etat.Autres"), others)}</select>`;
}

/** Un `<select>` ; `blank` : libellé d'une première option vide. */
function select(attrs, choices, value, blank=null) {
  const opts = (blank !== null ? [option("", blank, !value)] : []).concat(choices.map(([v, l]) => option(v, l, v === value)));
  return `<select ${attrs}>${opts.join("")}</select>`;
}

/** Le champ d'une recette. `at` : les attributs data qui désignent la valeur. */
function fieldInput(field, value, { item, at }) {
  const attrs = `${at} data-kind="${field.kind}"`;
  switch ( field.kind ) {
    case "formula":
      return `<input type="text" ${attrs} value="${escape(value ?? "")}" placeholder="1d6">`;
    case "number":
      return `<input type="number" ${attrs} value="${escape(value ?? "")}" min="0" step="any">`;
    case "boolean":
      return `<input type="checkbox" ${attrs} ${value ? "checked" : ""}>`;
    case "choice":
      return select(attrs, field.options.map(o => [o, o ? valueLabel(o) : loc("Champ.Aucun")]), value ?? field.default ?? "");
    case "multi": {
      const list = [value ?? []].flat();
      return `<div class="dhb-multi">${field.options.map(o => `<label><input type="checkbox" ${attrs} data-option="${escape(o)}"
        ${list.includes(o) ? "checked" : ""}> ${escape(valueLabel(o))}</label>`).join("")}</div>`;
    }
    case "status":
      return statusSelect(attrs, value ?? "", field.required ? loc("Champ.Choisir") : "—");
    case "damageType":
    case "units":
      return select(attrs, configChoices(field.kind), value ?? field.default ?? "", field.required ? null : "—");
    case "activity":
      return select(attrs, activityChoices(item, field.activityTypes), value ?? "", field.required ? loc("Champ.Choisir") : loc("Champ.ActiviteParDefaut"));
    case "effect":
      return select(attrs, effectChoices(item), value ?? "", loc("Champ.TousLesEffets"));
    default:
      return `<input type="text" ${attrs} value="${escape(value ?? "")}">`;
  }
}

/** L'argument d'une clause de condition, selon le genre d'argument du fait. */
function clauseArg(kind, arg, at, recipes) {
  const part = p => `${at} data-part="${p}"`;
  switch ( kind ) {
    case "true": return "";
    case "number":
      return `<input type="number" ${part("arg")} value="${escape(arg ?? "")}" step="any">`;
    case "identifier":
      return `<input type="text" ${part("arg")} value="${escape(arg ?? "")}" placeholder="${escape(loc("Champ.Identifiant"))}">`;
    case "range":
      return `<input type="number" ${part("distance")} value="${escape(arg?.distance ?? 5)}" min="0" step="any">
        ${select(part("units"), configChoices("units"), arg?.units ?? "ft")}`;
    case "classLevel":
      return `<input type="text" ${part("class")} value="${escape(arg?.class ?? "")}" placeholder="cleric">
        <input type="number" ${part("level")} value="${escape(arg?.level ?? 1)}" min="1" step="1">`;
    case "status":
      return statusSelect(part("arg"), arg ?? "", "—");
    case "damageTypes": {
      const list = [arg ?? []].flat();
      const opts = configChoices("damageTypes").map(([v, l]) => option(v, l, list.includes(v))).join("");
      return `<select multiple ${part("arg")}>${opts}</select>`;
    }
    default:
      return select(part("arg"), configChoices(kind, { factOptions: recipes.factOptions }), arg ?? "", "—");
  }
}

/** L'éditeur de condition : une ligne par clause, toutes requises. */
function conditionInput(field, clauses, { recipeIndex, recipes }) {
  const facts = recipes.facts;
  const factChoices = Object.keys(facts).map(k => [k, engineLoc(`Recette.Fait.${k.replace(".", "_")}`)]);
  const rows = (clauses ?? []).map((c, j) => {
    const at = `data-recipe="${recipeIndex}" data-field="${field.key}" data-clause="${j}"`;
    const kind = facts[c.fact]?.arg ?? "true";
    return `<div class="dhb-clause">
      <label class="dhb-not" title="${escape(loc("Condition.NonAide"))}"><input type="checkbox" ${at} data-part="not" ${c.not ? "checked" : ""}> ${escape(loc("Condition.Non"))}</label>
      ${select(`${at} data-part="fact"`, factChoices, c.fact)}
      ${clauseArg(kind, c.arg, at, recipes)}
      <button type="button" class="dhb-icon" data-action="removeClause" data-recipe="${recipeIndex}" data-field="${field.key}" data-clause="${j}"
        title="${escape(loc("Condition.Retirer"))}"><i class="fa-solid fa-xmark"></i></button>
    </div>`;
  }).join("");
  const empty = (clauses ?? []).length ? "" : `<p class="dhb-hint">${escape(loc("Condition.Aucune"))}</p>`;
  return `<div class="dhb-condition">${empty}${rows}
    <button type="button" data-action="addClause" data-recipe="${recipeIndex}" data-field="${field.key}"><i class="fa-solid fa-plus"></i> ${escape(loc("Condition.Ajouter"))}</button>
  </div>`;
}

/** Le bloc d'une recette posée sur l'objet. */
export function recipeBlock(recipe, type, values, index, { item, recipes }) {
  const fields = recipe.fields.filter(f => fieldVisible(recipe, f, values)).map(f => {
    const label = `<span class="dhb-label">${escape(engineLoc(`Recette.Champ.${f.key}`))}${f.required ? " *" : ""}</span>`;
    const input = f.kind === "condition"
      ? conditionInput(f, values[f.key], { recipeIndex: index, recipes })
      : fieldInput(f, values[f.key], { item, at: `data-recipe="${index}" data-field="${f.key}"` });
    return `<div class="dhb-field dhb-kind-${f.kind}">${label}${input}</div>`;
  }).join("");
  return `<section class="dhb-recipe">
    <header>
      <h4>${escape(engineLoc(`Recette.${type}.Nom`))}</h4>
      <button type="button" class="dhb-icon" data-action="removeRecipe" data-recipe="${index}" title="${escape(loc("Automatisation.Retirer"))}">
        <i class="fa-solid fa-trash"></i></button>
    </header>
    <p class="dhb-hint">${escape(engineLoc(`Recette.${type}.Aide`))}</p>
    ${fields || `<p class="dhb-hint">${escape(loc("Automatisation.RienARegler"))}</p>`}
  </section>`;
}

/** Le catalogue des recettes, rangé par catégorie, pour en ajouter une. */
export function catalogue(recipes, used) {
  const groups = {};
  for ( const [type, r] of Object.entries(recipes.list) ) (groups[r.category] ??= []).push([type, r]);
  return Object.entries(groups).map(([category, list]) => `<div class="dhb-group">
    <h5>${escape(engineLoc(`Recette.Categorie.${category}`))}</h5>
    ${list.map(([type, r]) => {
      const disabled = r.unique && used.includes(type);
      return `<button type="button" data-action="addRecipe" data-type="${type}" ${disabled ? "disabled" : ""}
        title="${escape(engineLoc(`Recette.${type}.Aide`))}">${escape(engineLoc(`Recette.${type}.Nom`))}</button>`;
    }).join("")}
  </div>`).join("");
}

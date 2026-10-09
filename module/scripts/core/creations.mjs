/**
 * Les créations de l'atelier, sans Foundry (SPEC §8.4) : leur forme rangée, les valeurs par défaut des recettes, et la table
 * de contenu qu'on en tire pour le moteur.
 *
 * Rangement (réglage monde `creations`) :
 *   { v: 1, entries: { <identifiant>: { uuid, name, recipes: [{ type, values }], base, keepBase, recipesVersion } } }
 *
 * `base` : l'automatisation reprise de l'objet de départ (« à partir de… »), gardée telle quelle et non éditable ; `keepBase`
 * dit si elle s'applique. Les recettes (core/recipes.mjs du moteur) s'y ajoutent.
 *
 * Fonctions pures : la construction d'une entrée est passée en argument (`build`, celle du moteur), pour que ce module ne
 * connaisse pas le schéma.
 */

export const STORE_VERSION = 1;

const isObject = v => (typeof v === "object") && (v !== null) && !Array.isArray(v);

/** Le rangement, toujours bien formé (un réglage vide ou d'une autre version donne un rangement vide). */
export function normalizeStore(raw) {
  if ( !isObject(raw) || (raw.v !== STORE_VERSION) || !isObject(raw.entries) ) return { v: STORE_VERSION, entries: {} };
  const entries = {};
  for ( const [id, c] of Object.entries(raw.entries) ) {
    if ( !isObject(c) ) continue;
    entries[id] = {
      uuid: typeof c.uuid === "string" ? c.uuid : null,
      name: typeof c.name === "string" ? c.name : id,
      recipes: Array.isArray(c.recipes) ? c.recipes.filter(r => isObject(r) && (typeof r.type === "string")) : [],
      base: isObject(c.base) ? c.base : null,
      keepBase: c.keepBase !== false,
      recipesVersion: Number.isInteger(c.recipesVersion) ? c.recipesVersion : 1
    };
  }
  return { v: STORE_VERSION, entries };
}

/** Le rangement avec une création ajoutée ou remplacée (`null` la retire). Ne modifie pas l'original. */
export function withCreation(store, identifier, creation) {
  const next = normalizeStore(store);
  if ( creation === null ) delete next.entries[identifier];
  else next.entries[identifier] = normalizeStore({ v: STORE_VERSION, entries: { [identifier]: creation } }).entries[identifier];
  return next;
}

/**
 * Un identifiant dnd5e tiré d'un nom : minuscules, sans accents, mots séparés par des tirets (comme `formatIdentifier`).
 * « Trait de givre » → « trait-de-givre ».
 */
export function suggestIdentifier(name) {
  return String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Un identifiant acceptable : minuscules, chiffres et tirets, ni vide ni bordé de tirets. */
export function isIdentifier(id) {
  return (typeof id === "string") && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id);
}

/** Le champ a-t-il un sens, vu les autres valeurs (`when` de la recette) ? */
export function fieldVisible(recipe, field, values={}) {
  if ( !field.when ) return true;
  return Object.entries(field.when).every(([key, want]) => {
    const other = recipe.fields.find(f => f.key === key);
    return [want].flat().includes(values[key] ?? other?.default);
  });
}

/** Les valeurs de départ d'une recette : les défauts de ses champs. */
export function defaultValues(recipe) {
  const values = {};
  for ( const f of recipe?.fields ?? [] ) {
    if ( f.default !== undefined ) values[f.key] = structuredClone(f.default);
    else if ( f.kind === "condition" ) values[f.key] = [];
    else if ( f.kind === "multi" ) values[f.key] = [];
  }
  return values;
}

/** L'argument de départ d'une clause, selon le genre d'argument du fait. */
export function defaultArg(kind, { identifier="" }={}) {
  switch ( kind ) {
    case "true": return true;
    case "range": return { distance: 5, units: "ft" };
    case "classLevel": return { class: "", level: 1 };
    case "damageTypes": return [];
    case "number": return 1;
    case "identifier": return identifier;
    default: return "";
  }
}

/** Une valeur saisie dans un champ de formulaire, mise dans le type du champ. */
export function parseFieldValue(kind, raw) {
  switch ( kind ) {
    case "boolean": return raw === true || raw === "true" || raw === "on";
    case "number": {
      const n = Number(raw);
      return (raw === "" || raw === null || !Number.isFinite(n)) ? null : n;
    }
    case "multi": return [raw].flat().filter(v => (v !== "") && (v !== null) && (v !== undefined));
    default: return raw ?? "";
  }
}

/** L'entrée d'une création : sa base (si gardée) et ses recettes. */
export function compileCreation(identifier, creation, build) {
  const base = creation.keepBase ? creation.base : null;
  return build(creation.recipes, { identifier, base });
}

/**
 * La table de contenu de toutes les créations, pour `api.content.register`. Une création qui ne donne rien (aucune recette,
 * pas de base) n'y figure pas. Les erreurs sont rendues par identifiant ; une création en erreur est écartée.
 * @returns {{table: Record<string, object>, errors: Record<string, string[]>}}
 */
export function compileTable(store, build, validate=() => []) {
  const table = {};
  const errors = {};
  for ( const [id, creation] of Object.entries(normalizeStore(store).entries) ) {
    const { entry, errors: built } = compileCreation(id, creation, build);
    const all = [...built, ...(Object.keys(entry).length ? validate(entry) : [])];
    if ( all.length ) errors[id] = all;
    else if ( Object.keys(entry).length ) table[id] = entry;
  }
  return { table, errors };
}

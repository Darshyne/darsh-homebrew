/**
 * Le seul passage vers le moteur (`dnd5e-combat`) : son API publique, rien d'autre. Le moteur ne connaît pas ce module.
 */
const ENGINE_ID = "dnd5e-combat";

/** L'API de contenu du moteur, ou null s'il n'est pas actif (il est requis : ne devrait pas arriver). */
export function content() {
  return game.modules.get(ENGINE_ID)?.api?.content ?? null;
}

/** Le catalogue des recettes du moteur (core/recipes.mjs de dnd5e-combat). */
export function recipes() {
  return content()?.recipes ?? null;
}

/** L'entrée tirée d'une liste de recettes : `{ entry, errors }`. */
export function build(list, ctx) {
  return recipes().build(list, ctx);
}

/** Les erreurs d'une entrée du schéma (vide = valide). */
export function validate(entry) {
  return content()?.validate(entry) ?? ["moteur absent"];
}

/** L'automatisation en vigueur sur un item (toutes couches), pour une reprise « à partir de… ». */
export function entryOf(item) {
  return content()?.of(item)?.entry ?? null;
}

/**
 * Une automatisation existe-t-elle déjà sous cet identifiant, venue d'ailleurs que de cet atelier (contenu livré par le moteur,
 * ou un autre module) ? `shipped` est le contenu en vigueur, tables enregistrées comprises — la nôtre aussi : on l'écarte.
 */
export function takenElsewhere(identifier, source) {
  const api = content();
  if ( !api?.shipped?.[identifier] ) return false;
  return Object.entries(api.registered?.() ?? {}).some(([s, ids]) => (s !== source) && ids.includes(identifier))
    || !(api.registered?.()[source] ?? []).includes(identifier);
}

/** Enregistre (ou remplace) la table de l'atelier auprès du moteur, sur ce client. */
export function register(source, table) {
  return content()?.register(source, table) ?? null;
}

/**
 * Le niveau d'automatisation du moteur applique-t-il le contenu (niveau Intégral, §117 du moteur) ? Au-dessous, les créations
 * sont enregistrées mais sans effet. Un moteur sans niveaux (avant 0.202.0) : oui.
 */
export function contentApplies() {
  const api = game.modules.get(ENGINE_ID)?.api;
  return typeof api?.levelAtLeast === "function" ? api.levelAtLeast("full") : true;
}

/**
 * La table des créations, tenue à jour auprès du moteur sur chaque client (SPEC §8.4) :
 * - au démarrage, par le hook `dnd5e-combat.registerContent` (appelé une fois à `setup`, s'y inscrire pendant `init`) ;
 * - à chaque écriture du réglage des créations (`onChange`, sur tous les clients), par `api.content.register`, qui
 *   remplace la table de la même source.
 */
import { MODULE_ID, log } from "../shared.mjs";
import { compileTable } from "../core/creations.mjs";
import { readStore } from "../adapter/store.mjs";
import * as engine from "../adapter/engine.mjs";

/** La table de toutes les créations ; une création fausse est écartée et dite dans la console. */
export function currentTable() {
  if ( !engine.recipes() ) return {};
  const { table, errors } = compileTable(readStore(), engine.build, engine.validate);
  if ( Object.keys(errors).length ) log.warn("créations écartées", errors);
  return table;
}

/** À appeler pendant `init`. */
export function registerRegistry() {
  Hooks.once("dnd5e-combat.registerContent", register => register(MODULE_ID, currentTable()));
}

/** Après une écriture : la table est reconstruite et enregistrée de nouveau. */
export function refresh() {
  const result = engine.register(MODULE_ID, currentTable());
  if ( result ) log.info(`${result.accepted.length} création(s) automatisée(s)`);
}

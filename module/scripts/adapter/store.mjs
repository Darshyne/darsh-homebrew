/**
 * Les réglages de l'atelier : le rangement des créations (SPEC §8.4) et le compendium du monde où vivent leurs items.
 * Un réglage monde se relit sur tous les clients à chaque écriture (`onChange`) : c'est ce qui tient la table du moteur à
 * jour chez les joueurs, sans socket.
 */
import { MODULE_ID } from "../shared.mjs";
import { normalizeStore, withCreation } from "../core/creations.mjs";

export const STORE_SETTING = "creations";
export const PACK_SETTING = "pack";
export const INSTALLED_SETTING = "installed";

/** @param {Function} onChange  appelée sur chaque client quand une création change */
export function registerSettings(onChange) {
  game.settings.register(MODULE_ID, STORE_SETTING, { scope: "world", config: false, type: Object, default: {}, onChange });
  game.settings.register(MODULE_ID, PACK_SETTING, { scope: "world", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, INSTALLED_SETTING, { scope: "world", config: false, type: Boolean, default: false });
}

export function readStore() {
  return normalizeStore(game.settings.get(MODULE_ID, STORE_SETTING));
}

/** Une création de ce monde, ou null. */
export function creationOf(identifier) {
  return readStore().entries[identifier] ?? null;
}

/** Écrit (ou retire, avec `null`) une création. MJ seulement. */
export async function saveCreation(identifier, creation) {
  return game.settings.set(MODULE_ID, STORE_SETTING, withCreation(readStore(), identifier, creation));
}

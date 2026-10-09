/**
 * Ce que toutes les couches (hors core/) partagent : identifiant, journal, traductions, réglages.
 */
export const MODULE_ID = "darsh-homebrew";

export const log = {
  info: (...args) => console.log(`${MODULE_ID} |`, ...args),
  warn: (...args) => console.warn(`${MODULE_ID} |`, ...args),
  error: (...args) => console.error(`${MODULE_ID} |`, ...args)
};

/** Texte traduit de la clé `DHB.<key>`. */
export function loc(key, data) {
  const full = `DHB.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

/** Texte traduit d'une clé du moteur (`DND5ECOMBAT.<key>`) : les libellés des recettes vivent chez lui. */
export function engineLoc(key) {
  return game.i18n.localize(`DND5ECOMBAT.${key}`);
}

export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

export const escape = s => foundry.utils.escapeHTML(String(s ?? ""));

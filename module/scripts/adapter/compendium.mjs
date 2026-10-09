/**
 * Le compendium « Homebrew » du monde (SPEC §8.1) : créé par l'atelier au premier lancement, pas livré avec le module, donc
 * modifiable et propre au monde. `CompendiumCollection.createCompendium` (cœur V14,
 * client/documents/collections/compendium-collection.mjs:758) : MJ seulement.
 */
import { MODULE_ID, loc, setting, log } from "../shared.mjs";
import { PACK_SETTING, INSTALLED_SETTING } from "./store.mjs";

const PACK_NAME = "darsh-homebrew";

/** Le compendium de l'atelier, s'il existe encore. */
export function homebrewPack() {
  const id = setting(PACK_SETTING);
  return (id && game.packs.get(id)) || null;
}

/** Crée le compendium du monde (ou reprend celui qui porte déjà son nom) et le retient. */
export async function createPack() {
  const existing = game.packs.get(`world.${PACK_NAME}`);
  const pack = existing ?? await foundry.documents.collections.CompendiumCollection.createCompendium({
    type: "Item", name: PACK_NAME, label: loc("Pack.Label")
  });
  if ( !pack ) return null;
  await game.settings.set(MODULE_ID, PACK_SETTING, pack.collection);
  log.info(`compendium ${pack.collection} ${existing ? "reused" : "created"}`);
  return pack;
}

/** Premier lancement (MJ actif) : crée le compendium une fois. S'il a été supprimé depuis, le créateur le proposera. */
export async function install() {
  if ( !game.user.isActiveGM || setting(INSTALLED_SETTING) ) return;
  const pack = await createPack();
  if ( !pack ) return;
  await game.settings.set(MODULE_ID, INSTALLED_SETTING, true);
  ui.notifications.info(loc("Pack.Created", { label: pack.metadata.label }));
}

/**
 * Crée l'item d'une création dans le compendium. Les ids des activités et des effets sont gardés (`keepId` et les ids
 * embarqués) : l'automatisation reprise y fait référence.
 */
export async function createItem(pack, data) {
  const [item] = await Item.implementation.createDocuments([data], { pack: pack.collection, keepId: false, keepEmbeddedIds: true });
  return item ?? null;
}

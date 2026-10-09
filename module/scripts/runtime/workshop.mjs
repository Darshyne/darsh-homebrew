/**
 * Ce que fait l'atelier, hors de toute fenêtre : créer l'item d'une création, enregistrer son automatisation, la retirer.
 * Le créateur (apps/creator.mjs) et les fonctions de test (`api.mcp`) passent par ici.
 */
import { MODULE_ID } from "../shared.mjs";
import { isIdentifier } from "../core/creations.mjs";
import { readStore, creationOf, saveCreation } from "../adapter/store.mjs";
import { homebrewPack, createItem } from "../adapter/compendium.mjs";
import * as engine from "../adapter/engine.mjs";

/** Les natures proposées : type d'item dnd5e, et sous-type d'aptitude (`system.type.value`). */
export const NATURES = Object.freeze({
  spell: { type: "spell" },
  classFeature: { type: "feat", subtype: "class" },
  speciesTrait: { type: "feat", subtype: "race" },
  feat: { type: "feat", subtype: "feat" },
  monsterFeature: { type: "feat", subtype: "monster" },
  weapon: { type: "weapon" },
  equipment: { type: "equipment" },
  consumable: { type: "consumable" }
});

/**
 * Les données de l'item : la copie du modèle sans son identité (id, source, traduction, règles posées en flags), ou un item
 * vierge de la nature choisie.
 */
export async function itemData({ sourceUuid=null, nature="spell", name, img="", identifier }) {
  let data;
  if ( sourceUuid ) {
    const source = await fromUuid(sourceUuid);
    if ( !source ) throw new Error(`modèle introuvable : ${sourceUuid}`);
    data = source.toObject();
    delete data._id;
    delete data.folder;
    delete data.ownership;
    delete data._stats;
    if ( data.flags ) { delete data.flags.babele; delete data.flags["dnd5e-combat"]; delete data.flags.core?.sourceId; }
  }
  else {
    const n = NATURES[nature] ?? NATURES.spell;
    data = { type: n.type, system: n.subtype ? { type: { value: n.subtype } } : {} };
  }
  data.name = String(name).trim();
  if ( img ) data.img = img;
  foundry.utils.setProperty(data, "system.identifier", identifier);
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.creation`, true);
  return data;
}

/** Ce qui empêche de créer sous cet identifiant (vide : rien). Clés de traduction `DHB.<clé>` et leurs données. */
export function identityProblems({ name, identifier, override=false }) {
  const out = [];
  if ( !String(name ?? "").trim() ) out.push(["Identite.NomRequis"]);
  if ( !isIdentifier(identifier) ) out.push(["Identite.IdentifiantFaux"]);
  else if ( readStore().entries[identifier] ) out.push(["Identite.DejaCree", { id: identifier }]);
  else if ( engine.takenElsewhere(identifier, MODULE_ID) && !override ) out.push(["Identite.DejaAutomatise", { id: identifier }]);
  return out;
}

/**
 * Crée l'item dans le compendium et range la création, sans recette. `base` : l'automatisation reprise du modèle.
 * @returns {Promise<Item>}
 */
export async function createCreation({ sourceUuid=null, nature="spell", name, img="", identifier, override=false, base, keepBase=true }) {
  const problems = identityProblems({ name, identifier, override });
  if ( problems.length ) throw new Error(problems.map(([k]) => k).join(", "));
  const pack = homebrewPack();
  if ( !pack ) throw new Error("compendium Homebrew absent");
  // Sans base fournie, celle du modèle : son automatisation en vigueur (toutes couches).
  if ( base === undefined ) base = sourceUuid ? engine.entryOf(await fromUuid(sourceUuid)) : null;
  const item = await createItem(pack, await itemData({ sourceUuid, nature, name, img, identifier }));
  if ( !item ) throw new Error("création de l'item refusée");
  await saveCreation(identifier, { uuid: item.uuid, name: item.name, recipes: [], base, keepBase, recipesVersion: engine.recipes().version });
  return item;
}

/** L'entrée que donneraient ces recettes, et ses erreurs (construction puis validation par le moteur). */
export function preview(identifier, { recipes=[], base=null, keepBase=true }) {
  const { entry, errors } = engine.build(recipes, { identifier, base: keepBase ? base : null });
  const problems = [...errors, ...((!errors.length && Object.keys(entry).length) ? engine.validate(entry) : [])];
  return { entry, problems };
}

/** Enregistre l'automatisation d'une création existante ; refusé si elle a des erreurs. */
export async function saveAutomation(identifier, { recipes=[], keepBase=null, name=null }={}) {
  const current = creationOf(identifier);
  if ( !current ) throw new Error(`aucune création « ${identifier} »`);
  const next = { ...current, recipes, keepBase: keepBase ?? current.keepBase, name: name ?? current.name, recipesVersion: engine.recipes().version };
  const { problems } = preview(identifier, next);
  if ( problems.length ) return { saved: false, problems };
  await saveCreation(identifier, next);
  return { saved: true, problems: [] };
}

/** Retire une création ; son item reste dans le compendium (supprimé à part, s'il le faut). */
export async function removeCreation(identifier, { deleteItem=false }={}) {
  const current = creationOf(identifier);
  if ( !current ) return false;
  if ( deleteItem && current.uuid ) await (await fromUuid(current.uuid))?.delete();
  await saveCreation(identifier, null);
  return true;
}

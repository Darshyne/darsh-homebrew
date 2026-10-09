import { describe, it, expect } from "vitest";
import { normalizeStore, withCreation, suggestIdentifier, isIdentifier, fieldVisible, defaultValues, defaultArg, parseFieldValue, compileTable } from "../module/scripts/core/creations.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Le catalogue du moteur : les tests de l'atelier suivent ses recettes réelles. DAS_CORE désigne un clone de `dnd5e-combat`
// (la CI le récupère dans `core/`) ; sur un poste, le dépôt voisin.
const CORE = process.env.DAS_CORE ?? resolve(import.meta.dirname, "../../Foundry dnd5e moteur de combat");
const core = file => import(pathToFileURL(resolve(CORE, "module/scripts/core", file)).href);
const { RECIPES, buildEntry } = await core("recipes.mjs");
const { validateEntry } = await core("content.mjs");

describe("rangement des créations", () => {
  it("un réglage vide ou étranger donne un rangement vide", () => {
    expect(normalizeStore(undefined)).toEqual({ v: 1, entries: {} });
    expect(normalizeStore({ v: 2, entries: { a: {} } })).toEqual({ v: 1, entries: {} });
  });

  it("une création est complétée et nettoyée", () => {
    const s = normalizeStore({ v: 1, entries: { "trait-de-givre": { uuid: "Compendium.world.x.Item.abc", recipes: [{ type: "aura" }, "faux"] } } });
    expect(s.entries["trait-de-givre"]).toEqual({ uuid: "Compendium.world.x.Item.abc", name: "trait-de-givre", recipes: [{ type: "aura" }], base: null, keepBase: true, recipesVersion: 1 });
  });

  it("ajouter, remplacer, retirer, sans toucher à l'original", () => {
    const a = normalizeStore({});
    const b = withCreation(a, "x", { name: "X", recipes: [] });
    expect(a.entries).toEqual({});
    expect(b.entries.x.name).toBe("X");
    expect(withCreation(b, "x", null).entries).toEqual({});
  });
});

describe("identifiants", () => {
  it("tiré du nom, sans accents", () => {
    expect(suggestIdentifier("Trait de givre")).toBe("trait-de-givre");
    expect(suggestIdentifier("  Épée « flamme » +1 ")).toBe("epee-flamme-1");
    expect(isIdentifier("trait-de-givre")).toBe(true);
    expect(isIdentifier("Trait")).toBe(false);
    expect(isIdentifier("-a")).toBe(false);
  });
});

describe("champs des recettes", () => {
  it("les défauts viennent du catalogue du moteur", () => {
    expect(defaultValues(RECIPES.bonusDamage)).toEqual({ scope: "own", oncePerTurn: false, condition: [] });
    expect(defaultValues(RECIPES.lastingZone)).toEqual({ moments: ["enter", "turnEnd"] });
  });

  it("un champ conditionnel ne se montre que dans son cas", () => {
    const scope = RECIPES.attackModifier.fields.find(f => f.key === "scope");
    expect(fieldVisible(RECIPES.attackModifier, scope, {})).toBe(true);   // carrier par défaut : item
    expect(fieldVisible(RECIPES.attackModifier, scope, { carrier: "effect" })).toBe(false);
  });

  it("valeurs saisies mises en forme", () => {
    expect(parseFieldValue("number", "10")).toBe(10);
    expect(parseFieldValue("number", "")).toBe(null);
    expect(parseFieldValue("boolean", "on")).toBe(true);
    expect(parseFieldValue("multi", ["enter", ""])).toEqual(["enter"]);
    expect(defaultArg("identifier", { identifier: "mon-sort" })).toBe("mon-sort");
    expect(defaultArg("range")).toEqual({ distance: 5, units: "ft" });
  });
});

describe("table de contenu", () => {
  const facts = new Proxy({}, { has: () => true, get: () => true });
  const validate = entry => validateEntry(entry, { facts });

  it("chaque création donne son entrée ; une création vide n'y figure pas ; une fausse est écartée", () => {
    const store = {
      v: 1,
      entries: {
        "lame-ardente": { recipes: [{ type: "bonusDamage", values: { formula: "1d4", damageType: "fire" } }] },
        "vide": { recipes: [] },
        "fausse": { recipes: [{ type: "outcomeStatus", values: { on: "hit" } }] }
      }
    };
    const { table, errors } = compileTable(store, buildEntry, validate);
    expect(Object.keys(table)).toEqual(["lame-ardente"]);
    expect(table["lame-ardente"].triggers[0].if).toEqual({ "activity.identifier": "lame-ardente" });
    expect(Object.keys(errors)).toEqual(["fausse"]);
  });

  it("la base reprise s'applique tant qu'elle est gardée", () => {
    const base = { teleport: { distance: 30, units: "ft" } };
    const keep = compileTable({ v: 1, entries: { a: { base, recipes: [] } } }, buildEntry, validate);
    expect(keep.table.a).toEqual(base);
    const drop = compileTable({ v: 1, entries: { a: { base, keepBase: false, recipes: [] } } }, buildEntry, validate);
    expect(drop.table).toEqual({});
  });
});

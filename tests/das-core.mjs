import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Où est le moteur, pour les tests qui suivent ses recettes réelles : la variable `DAS_CORE` (un dossier ; la CI y met son clone,
 * `core/`), sinon le dépôt voisin — sous son nom de poste (`Foundry dnd5e moteur de combat`) ou sous son nom GitHub
 * (`dnd5e-combat`, ce que donne un `git clone` à côté de celui-ci) —, sinon `core/` dans ce dépôt.
 */
const here = import.meta.dirname;
const candidates = [process.env.DAS_CORE, resolve(here, "../../Foundry dnd5e moteur de combat"), resolve(here, "../../dnd5e-combat"),
  resolve(here, "../core")].filter(Boolean);

export const CORE = candidates.find(dir => existsSync(resolve(dir, "module/scripts/core/content.mjs")));

if ( !CORE ) {
  throw new Error("moteur introuvable : clonez Darshyne/dnd5e-combat à côté de ce dépôt, ou donnez son dossier dans DAS_CORE "
    + `(cherché : ${candidates.join(", ")})`);
}

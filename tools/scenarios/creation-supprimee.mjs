/**
 * Une création supprimée libère son nom (issue #4) :
 *  - l'item d'une création supprimé du compendium Homebrew → la création est retirée, le moteur ne l'a plus, le nom est libre ;
 *  - une copie posée sur une fiche, supprimée, ne retire rien (comparaison par uuid exact) ;
 *  - une création orpheline (item disparu) est retirée par le nettoyage du chargement, et l'étape Identité propose de la remplacer
 *    au lieu de refuser son nom ; une création dont le compendium manque est gardée ;
 *  - « Supprimer cette création » avec l'option « supprimer aussi l'objet » (`retirer`, `deleteItem`).
 * Aucun combat : tout se lit dans le rangement de l'atelier et dans ce que le moteur a reçu.
 *
 * Se lance avec le lanceur du moteur : `node tools/scenario.mjs "../homebrew-issue-4/tools/scenarios"` (depuis le dépôt du moteur),
 * ou le dossier `tools/scenarios` du dépôt de l'atelier.
 */
const A = "essai-efface-das";
const COPY = "essai-copie-das";
const ORPHAN = "essai-orphelin-das";
const NO_PACK = "essai-sans-pack-das";
const RECIPES = [{ type: "bonusDamage", values: { formula: "1d4", damageType: "cold", scope: "own" } }];
const wait = ms => new Promise(r => setTimeout(r, ms));

export default {
  name: "homebrew — création supprimée : nettoyage, orphelins, nom réutilisable (issue #4)",

  async run(ctx) {
    const hb = async (fn, args={}) => {
      const r = await ctx.call("call-module-api", { moduleId: "darsh-homebrew", fn, args, waitMs: 8000 });
      if ( !r.settled ) throw new Error(`darsh-homebrew.${fn} : pas de réponse`);
      return r.result;
    };
    const ids = [A, COPY, ORPHAN, NO_PACK];
    for ( const id of ids ) await hb("retirer", { identifier: id, deleteItem: true });
    ctx.restore(async () => { for ( const id of ids ) await hb("retirer", { identifier: id, deleteItem: true }); });

    // --- 1. L'item supprimé du compendium emporte sa création -----------------------------------------------------------
    const uuid = await hb("creer", { nature: "spell", name: "Essai effacé", identifier: A });
    const saved = await hb("automatiser", { identifier: A, recipes: RECIPES });
    ctx.expect(saved.saved, `automatisation enregistrée (${saved.problems.join(" ; ")})`);
    let etat = await hb("etat");
    ctx.expect(etat.enregistre.includes(A), "le moteur a reçu la création");
    const refused = await hb("identite", { name: "Essai effacé", identifier: A });
    ctx.expect(refused.problems.some(([k]) => k === "Identite.DejaCree"), "tant que l'item existe, le nom est refusé (« déjà pris »)");

    ctx.expect(await hb("supprimerDocument", { uuid }), "l'item est supprimé du compendium");
    await wait(1000);
    etat = await hb("etat");
    ctx.expect(!etat.creations[A], "la création est retirée du rangement");
    ctx.expect(!etat.enregistre.includes(A), `le moteur ne l'a plus (${etat.enregistre.join(", ") || "rien"})`);
    const free = await hb("identite", { name: "Essai effacé", identifier: A });
    ctx.expect(!free.problems.length && !free.notices.length, `le nom est libre (${JSON.stringify(free)})`);
    const again = await hb("creer", { nature: "spell", name: "Essai effacé", identifier: A });
    ctx.expect(typeof again === "string" && again !== uuid, "une nouvelle création reprend le même nom");

    // --- 2. Une copie posée sur une fiche, supprimée : rien n'est retiré ------------------------------------------------
    const copyUuid = await hb("creer", { nature: "spell", name: "Essai copie", identifier: COPY });
    const mage = await ctx.token("Magicien");
    const { data: tok } = await ctx.call("get-scene-object", { type: "Token", objectId: mage.id });
    await ctx.call("upsert-actor-item", { actorId: tok.actorId, itemData: { name: "Essai copie", type: "spell",
      system: { identifier: COPY }, flags: { "darsh-homebrew": { creation: true } } }, match: { path: "system.identifier", value: COPY } });
    const copyId = await ctx.itemId(mage.id, COPY);
    ctx.expect(!!copyId, "la copie est posée sur la fiche du Magicien");
    if ( copyId ) await ctx.call("remove-embedded-item", { documentType: "Actor", id: tok.actorId, itemId: copyId });
    await wait(1000);
    etat = await hb("etat");
    ctx.expect(etat.creations[COPY]?.uuid === copyUuid, "supprimer la copie de la fiche garde la création");

    // --- 3. Orphelins au chargement, et remplacement proposé ---------------------------------------------------------------
    const store = (await ctx.call("get-setting", { namespace: "darsh-homebrew", key: "creations" }));
    const value = store.value ?? store.settings?.[0]?.value ?? store;
    const entries = { ...(value?.entries ?? {}),
      [ORPHAN]: { uuid: "Compendium.world.darsh-homebrew.Item.zzzzzzzzzzzzzzzz", name: "Essai orphelin", recipes: RECIPES },
      [NO_PACK]: { uuid: "Compendium.world.pack-absent-das.Item.zzzzzzzzzzzzzzzz", name: "Essai sans pack", recipes: [] } };
    await ctx.call("set-setting", { namespace: "darsh-homebrew", key: "creations", value: { v: 1, entries } });
    await wait(500);
    const orphanIdentity = await hb("identite", { name: "Essai orphelin", identifier: ORPHAN });
    ctx.expect(!orphanIdentity.problems.length && orphanIdentity.notices.some(([k]) => k === "Identite.Orphelin"),
      `le nom d'un orphelin n'est pas refusé : remplacement annoncé (${JSON.stringify(orphanIdentity)})`);
    const noPackIdentity = await hb("identite", { name: "Essai sans pack", identifier: NO_PACK });
    ctx.expect(noPackIdentity.problems.some(([k]) => k === "Identite.DejaCree"), "compendium absent : le nom reste pris (rien ne permet de dire si son item existe)");
    const cleaned = await hb("nettoyer", { notify: false });
    ctx.expect(cleaned.removed.includes(ORPHAN) && !cleaned.removed.includes(NO_PACK) && cleaned.unknown.includes(NO_PACK),
      `nettoyage : l'orphelin retiré, la création sans compendium gardée (${JSON.stringify(cleaned)})`);
    etat = await hb("etat");
    ctx.expect(!etat.creations[ORPHAN] && !!etat.creations[NO_PACK] && !!etat.creations[A] && !!etat.creations[COPY],
      "les autres créations ne bougent pas");

    // --- 4. « Supprimer cette création », objet compris ------------------------------------------------------------------
    ctx.expect(await hb("retirer", { identifier: A, deleteItem: true }), "création supprimée depuis l'atelier");
    await wait(1000);
    etat = await hb("etat");
    ctx.expect(!etat.creations[A] && !etat.enregistre.includes(A), "plus de création ni de règle");
    ctx.expect(!(await hb("existe", { uuid: again })), "son objet a quitté le compendium");
    ctx.expect(await hb("retirer", { identifier: COPY, deleteItem: false }), "suppression sans l'objet");
    await wait(500);
    ctx.expect(await hb("existe", { uuid: copyUuid }), "l'objet reste dans le compendium quand la case est décochée");
    await hb("supprimerDocument", { uuid: copyUuid });
  }
};

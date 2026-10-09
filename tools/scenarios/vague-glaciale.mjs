/**
 * Une création de l'atelier jouée en combat, de bout en bout (SPEC §0, à vérifier en jeu) :
 *  - « Vague glaciale », variante de Vague tonnante (PHB) faite par `api.mcp.creer` : sa poussée (contenu `thunderwave` du moteur)
 *    est reprise en « base » sous le nouvel identifiant `vague-glaciale` ;
 *  - deux recettes ajoutées par `api.mcp.automatiser` : À terre sur un échec (`outcomeStatus`) et +1d6 froid sur ses propres
 *    dégâts (`bonusDamage`, « cet objet seulement ») ;
 *  - le Magicien la lance sur le Zombi ; sur un échec : poussé de 10 ft, À terre, dégâts de froid ajoutés.
 * La création et son item sont retirés à la fin.
 *
 * Se lance avec le lanceur du moteur : `node tools/scenario.mjs "../Foundry dnd5e homebrew/tools/scenarios"` (depuis le dépôt du moteur).
 */
const ID = "vague-glaciale";
const THUNDERWAVE = "Compendium.dnd-players-handbook.spells.phbsplThunderwav";

export default {
  name: "homebrew — Vague glaciale (variante de Vague tonnante + À terre + 1d6 froid)",

  async run(ctx) {
    const hb = async (fn, args={}) => {
      const r = await ctx.call("call-module-api", { moduleId: "darsh-homebrew", fn, args, waitMs: 8000 });
      if ( !r.settled ) throw new Error(`darsh-homebrew.${fn} : pas de réponse`);
      return r.result;
    };

    // --- La création -------------------------------------------------------------------------------------------------
    await hb("retirer", { identifier: ID, deleteItem: true });
    const uuid = await hb("creer", { sourceUuid: THUNDERWAVE, name: "Vague glaciale", identifier: ID });
    ctx.restore(() => hb("retirer", { identifier: ID, deleteItem: true }));
    const saved = await hb("automatiser", { identifier: ID, recipes: [
      { type: "outcomeStatus", values: { on: "failedSave", status: "prone" } },
      { type: "bonusDamage", values: { formula: "1d6", damageType: "cold", scope: "own" } }
    ] });
    ctx.expect(saved.saved, `automatisation enregistrée (${saved.problems.join(" ; ")})`);
    const etat = await hb("etat");
    ctx.expect(etat.enregistre.includes(ID), `la création est enregistrée auprès du moteur (${etat.enregistre.join(", ")})`);
    const seen = await hb("moteur", { uuid });
    const steps = (seen?.entry?.triggers ?? []).flatMap(t => t.do.map(s => s.type));
    ctx.expect(seen?.identifier === ID && ["move", "status", "damage"].every(t => steps.includes(t)),
      `le moteur lit l'item sous « ${seen?.identifier} » : poussée reprise + À terre + froid (${steps.join(", ")})`);

    // --- En combat -----------------------------------------------------------------------------------------------------
    const mage = await ctx.token("Magicien");
    const zombi = await ctx.token("Zombi");
    await ctx.ensureItem(mage, uuid);
    const hp0 = await ctx.hp(zombi);
    const home = await ctx.position(zombi);
    const magePos = await ctx.position(mage);
    const grid = await ctx.gridSize();
    ctx.restore(() => ctx.setHp(zombi, hp0));
    ctx.restore(() => ctx.removeStatusEffects(zombi, "prone").catch(() => {}));
    ctx.restore(() => ctx.call("move-token", { tokenId: zombi.id, x: home.x, y: home.y, elevation: home.elevation }).catch(() => {}));
    const pos0 = { x: magePos.x, y: magePos.y + 2 * grid, elevation: magePos.elevation };

    let failed = null;
    for ( let i = 0; i < 20 && !failed; i++ ) {
      await ctx.setHp(zombi, hp0);
      await ctx.removeStatusEffects(zombi, "prone").catch(() => {});
      await ctx.call("move-token", { tokenId: zombi.id, x: pos0.x, y: pos0.y, elevation: pos0.elevation });
      const box = await ctx.box(zombi);
      const since = await ctx.lastMessageId();
      const used = await ctx.use({ tokenId: mage.id, identifier: ID, activityType: "save", area: { shape: "rectangle", ...box } });
      if ( used.regionId ) ctx.restore(() => ctx.call("delete-scene-object", { type: "Region", objectId: used.regionId }).catch(() => {}));
      const r = await ctx.settle(used.usageMessageId);
      const target = r.targets.find(t => t.name === "Zombi");
      if ( !target?.save ) { ctx.expect(false, `le Zombi n'est pas une cible de la zone (${r.targets.map(t => t.name).join(", ")})`); return; }
      if ( target.save.success ) continue;
      await new Promise(res => setTimeout(res, 1500));   // déplacement et état suivent l'application
      failed = { r, target, since };
    }
    if ( !failed ) { ctx.expect(false, "aucun échec de sauvegarde en 20 essais"); return; }
    const { r, target, since } = failed;
    const types = r.plan.steps.map(s => s.type);
    ctx.expect(types.includes("move") && types.includes("status"), `le plan porte la poussée et l'état (${JSON.stringify(types)})`);
    const pos = await ctx.position(zombi);
    const moved = Math.round(Math.hypot(pos.x - pos0.x, pos.y - pos0.y) / grid);
    ctx.expect(moved === 2, `sauvegarde ratée : le Zombi a reculé de ${moved} case(s) (attendu 2 = 10 ft)`);
    const effects = await ctx.effects(zombi);
    ctx.expect(effects.some(e => (e.statuses ?? []).includes("prone")), `le Zombi est À terre (${effects.map(e => e.name).join(", ")})`);
    const damage = (await ctx.messagesSince(since)).find(m => m.type === "damage");
    const formula = (damage?.rolls ?? []).map(x => x.formula).join(" | ");
    const dmgTypes = (r.damageRoll?.damages ?? []).map(d => d.type);
    ctx.expect(dmgTypes.includes("cold") || /cold/.test(formula), `dégâts de froid ajoutés (${JSON.stringify(dmgTypes)}, « ${formula} »)`);
    ctx.expect((target.damage?.applied ?? 0) > 0, `dégâts appliqués (${target.damage?.applied})`);
  }
};

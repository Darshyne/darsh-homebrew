/**
 * Le créateur (SPEC §8.2) : une fenêtre, des étapes.
 *
 *   start      partir de rien, ou d'un objet existant (glissé dans la fenêtre)
 *   nature     sort, aptitude, objet… (à partir de rien seulement)
 *   identity   nom, image, identifiant ; « Créer » range l'item dans le compendium du monde
 *   native     la fiche dnd5e de l'item, pour ses activités et ses effets (l'atelier ne refait pas l'éditeur du système)
 *   automation les recettes du moteur, posées et réglées ; « Enregistrer » écrit la création
 *
 * Rouvrir une création existante (en-tête de sa fiche) mène directement à `automation`.
 */
import { MODULE_ID, loc, escape } from "../shared.mjs";
import { suggestIdentifier, isIdentifier, defaultValues, defaultArg, parseFieldValue } from "../core/creations.mjs";
import { creationOf } from "../adapter/store.mjs";
import { homebrewPack, createPack } from "../adapter/compendium.mjs";
import { NATURES, identityProblems, createCreation, preview, saveAutomation } from "../runtime/workshop.mjs";
import * as engine from "../adapter/engine.mjs";
import { recipeBlock, catalogue } from "./automation-form.mjs";

const { ApplicationV2 } = foundry.applications.api;

const STEPS = ["start", "nature", "identity", "native", "automation"];

export class Creator extends ApplicationV2 {
  /** @param {{identifier?: string}} options  une création existante à rouvrir */
  constructor({ identifier=null, ...options }={}) {
    super(options);
    this.draft = identifier ? Creator.#stateOf(identifier) : Creator.#blank();
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-creator-{id}`,
    classes: ["dhb-creator"],
    window: { icon: "fa-solid fa-flask", resizable: true },
    position: { width: 640, height: 720 },
    actions: {
      next: Creator.#onNext,
      prev: Creator.#onPrev,
      clearSource: Creator.#onClearSource,
      pickImage: Creator.#onPickImage,
      createItem: Creator.#onCreateItem,
      openSheet: Creator.#onOpenSheet,
      addRecipe: Creator.#onAddRecipe,
      removeRecipe: Creator.#onRemoveRecipe,
      addClause: Creator.#onAddClause,
      removeClause: Creator.#onRemoveClause,
      save: Creator.#onSave,
      recreatePack: Creator.#onRecreatePack
    }
  };

  /** Ouvre le créateur ; une création déjà ouverte est ramenée au premier plan. */
  static open(identifier=null) {
    if ( !game.user.isGM ) return ui.notifications.warn(loc("Refus.MJSeul"));
    if ( identifier ) {
      const open = foundry.applications.instances.get(`${MODULE_ID}-creator-${identifier}`);
      if ( open ) return open.bringToFront();
    }
    return new Creator({ identifier, id: `${MODULE_ID}-creator-${identifier ?? foundry.utils.randomID()}` }).render({ force: true });
  }

  static #blank() {
    return { step: "start", sourceUuid: null, sourceName: null, base: null, keepBase: true, nature: "spell", name: "", img: "",
      identifier: "", identifierTouched: false, override: false, itemUuid: null, recipes: [], editing: false, saved: false };
  }

  static #stateOf(identifier) {
    const c = creationOf(identifier);
    if ( !c ) return Creator.#blank();
    return { ...Creator.#blank(), step: "automation", editing: true, identifier, name: c.name, itemUuid: c.uuid,
      base: c.base, keepBase: c.keepBase, recipes: structuredClone(c.recipes), saved: true };
  }

  get title() {
    return this.draft.name ? loc("Titre.Avec", { name: this.draft.name }) : loc("Titre.Nouveau");
  }

  /* ------------------------------------------------------------------ */
  /*  Rendu                                                              */
  /* ------------------------------------------------------------------ */

  async _prepareContext() {
    const item = this.draft.itemUuid ? await fromUuid(this.draft.itemUuid) : null;
    return { item, pack: homebrewPack(), recipes: engine.recipes() };
  }

  async _renderHTML(context) {
    const root = document.createElement("div");
    root.className = "dhb-body";
    if ( !context.recipes ) {
      root.innerHTML = `<p class="dhb-error">${escape(loc("Refus.Moteur"))}</p>`;
      return root;
    }
    const body = {
      start: () => this.#start(context),
      nature: () => this.#nature(),
      identity: () => this.#identity(context),
      native: () => this.#native(context),
      automation: () => this.#automation(context)
    }[this.draft.step]();
    root.innerHTML = `${this.#steps()}<div class="dhb-step">${body}</div>${this.#footer(context)}`;
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onFirstRender() {
    this.element.addEventListener("change", event => this.#onChange(event));
    this.element.addEventListener("dragover", event => event.preventDefault());
    this.element.addEventListener("drop", event => this.#onDrop(event));
  }

  /** Les étapes, celle en cours en avant. */
  #steps() {
    const shown = STEPS.filter(s => !(this.draft.editing && ["start", "nature", "identity"].includes(s))
      && !((s === "nature") && this.draft.sourceUuid));
    return `<ol class="dhb-steps">${shown.map(s => `<li class="${s === this.draft.step ? "active" : ""}">${escape(loc(`Etape.${s}`))}</li>`).join("")}</ol>`;
  }

  #start() {
    const source = this.draft.sourceUuid
      ? `<div class="dhb-source"><i class="fa-solid fa-copy"></i> ${escape(loc("Depart.Source", { name: this.draft.sourceName }))}
          <button type="button" class="dhb-icon" data-action="clearSource" title="${escape(loc("Depart.Oublier"))}"><i class="fa-solid fa-xmark"></i></button></div>`
      : `<div class="dhb-drop"><i class="fa-solid fa-hand-pointer"></i> ${escape(loc("Depart.Deposer"))}</div>`;
    return `<h3>${escape(loc("Depart.Titre"))}</h3>
      <p>${escape(loc("Depart.Explication"))}</p>
      ${source}
      <p class="dhb-hint">${escape(loc("Depart.Vierge"))}</p>`;
  }

  #nature() {
    const choices = Object.keys(NATURES).map(n => `<label class="dhb-nature">
      <input type="radio" name="nature" data-state="nature" value="${n}" ${this.draft.nature === n ? "checked" : ""}>
      ${escape(loc(`Nature.${n}`))}</label>`).join("");
    return `<h3>${escape(loc("Nature.Titre"))}</h3><div class="dhb-natures">${choices}</div>`;
  }

  #identity(context) {
    const s = this.draft;
    const problems = this.#identityProblems();
    const taken = isIdentifier(s.identifier) && engine.takenElsewhere(s.identifier, MODULE_ID);
    const override = taken ? `<label class="dhb-warn"><input type="checkbox" data-state="override" ${s.override ? "checked" : ""}>
      ${escape(loc("Identite.Remplacer", { id: s.identifier }))}</label>` : "";
    const pack = context.pack ? "" : `<p class="dhb-warn">${escape(loc("Pack.Absent"))}
      <button type="button" data-action="recreatePack">${escape(loc("Pack.Recreer"))}</button></p>`;
    return `<h3>${escape(loc("Identite.Titre"))}</h3>
      <div class="dhb-field"><span class="dhb-label">${escape(loc("Identite.Nom"))} *</span>
        <input type="text" data-state="name" value="${escape(s.name)}"></div>
      <div class="dhb-field"><span class="dhb-label">${escape(loc("Identite.Image"))}</span>
        <div class="dhb-img">${s.img ? `<img src="${escape(s.img)}" alt="">` : ""}
          <input type="text" data-state="img" value="${escape(s.img)}">
          <button type="button" class="dhb-icon" data-action="pickImage"><i class="fa-solid fa-file-image"></i></button></div></div>
      <div class="dhb-field"><span class="dhb-label">${escape(loc("Identite.Identifiant"))} *</span>
        <input type="text" data-state="identifier" value="${escape(s.identifier)}">
        <p class="dhb-hint">${escape(loc("Identite.IdentifiantAide"))}</p></div>
      ${override}
      ${problems.map(p => `<p class="dhb-error">${escape(p)}</p>`).join("")}
      ${pack}`;
  }

  /** Ce qui empêche de créer l'item (vide : rien). */
  #identityProblems() {
    return identityProblems(this.draft).map(([key, data]) => loc(key, data));
  }

  #native(context) {
    const item = context.item;
    if ( !item ) return `<p class="dhb-error">${escape(loc("Natif.Introuvable"))}</p>`;
    return `<h3>${escape(loc("Natif.Titre"))}</h3>
      <p>${escape(loc("Natif.Explication"))}</p>
      <ul class="dhb-list">
        <li>${escape(loc("Natif.Activites", { n: item.system.activities?.size ?? 0 }))}</li>
        <li>${escape(loc("Natif.Effets", { n: item.effects.size }))}</li>
      </ul>
      <button type="button" data-action="openSheet"><i class="fa-solid fa-pen-to-square"></i> ${escape(loc("Natif.Ouvrir"))}</button>
      <p class="dhb-hint">${escape(loc("Natif.Revenir"))}</p>`;
  }

  #automation(context) {
    const { item, recipes } = context;
    const s = this.draft;
    const blocks = s.recipes.map((r, i) => {
      const recipe = recipes.list[r.type];
      return recipe ? recipeBlock(recipe, r.type, r.values ?? {}, i, { item, recipes })
        : `<p class="dhb-error">${escape(loc("Automatisation.Inconnue", { type: r.type }))}</p>`;
    }).join("");
    const base = s.base ? `<section class="dhb-base">
        <label><input type="checkbox" data-state="keepBase" ${s.keepBase ? "checked" : ""}> ${escape(loc("Automatisation.Base", { keys: Object.keys(s.base).join(", ") }))}</label>
        <details><summary>${escape(loc("Automatisation.Voir"))}</summary><pre>${escape(JSON.stringify(s.base, null, 2))}</pre></details>
      </section>` : "";
    const { entry, problems } = preview(s.identifier, s);
    const verdict = problems.length
      ? `<div class="dhb-error"><strong>${escape(loc("Automatisation.Erreurs"))}</strong><ul>${problems.map(p => `<li>${escape(p)}</li>`).join("")}</ul></div>`
      : `<p class="dhb-ok"><i class="fa-solid fa-check"></i> ${escape(loc(Object.keys(entry).length ? "Automatisation.Valide" : "Automatisation.Vide"))}</p>`;
    return `<h3>${escape(loc("Automatisation.Titre", { name: s.name }))}</h3>
      ${item ? "" : `<p class="dhb-warn">${escape(loc("Natif.Introuvable"))}</p>`}
      ${base}
      ${blocks || `<p class="dhb-hint">${escape(loc("Automatisation.Aucune"))}</p>`}
      <details class="dhb-add" ${s.recipes.length ? "" : "open"}><summary><i class="fa-solid fa-plus"></i> ${escape(loc("Automatisation.Ajouter"))}</summary>
        ${catalogue(recipes, s.recipes.map(r => r.type))}</details>
      ${verdict}
      <details><summary>${escape(loc("Automatisation.Json"))}</summary><pre>${escape(JSON.stringify(entry, null, 2))}</pre></details>`;
  }

  #footer() {
    const s = this.draft;
    const buttons = [];
    const back = { nature: "start", identity: s.sourceUuid ? "start" : "nature", automation: "native" }[s.step];
    if ( back && !(s.editing && (s.step !== "automation")) ) buttons.push(`<button type="button" data-action="prev"><i class="fa-solid fa-arrow-left"></i> ${escape(loc("Bouton.Precedent"))}</button>`);
    if ( ["start", "nature", "native"].includes(s.step) ) buttons.push(`<button type="button" data-action="next">${escape(loc("Bouton.Suivant"))} <i class="fa-solid fa-arrow-right"></i></button>`);
    if ( s.step === "identity" ) {
      const disabled = this.#identityProblems().length || !homebrewPack() ? "disabled" : "";
      buttons.push(`<button type="button" data-action="createItem" ${disabled}><i class="fa-solid fa-wand-magic-sparkles"></i> ${escape(loc("Bouton.Creer"))}</button>`);
    }
    if ( s.step === "automation" ) buttons.push(`<button type="button" data-action="save"><i class="fa-solid fa-floppy-disk"></i> ${escape(loc("Bouton.Enregistrer"))}</button>`);
    return `<footer class="dhb-footer">${buttons.join("")}</footer>`;
  }

  /* ------------------------------------------------------------------ */
  /*  Saisie                                                             */
  /* ------------------------------------------------------------------ */

  /** Une saisie change : la valeur va dans l'état, la fenêtre se redessine (champs conditionnels, argument d'un fait). */
  #onChange(event) {
    const el = event.target;
    const s = this.draft;
    const d = el.dataset;
    if ( d.state ) {
      const value = el.type === "checkbox" ? el.checked : el.value;
      s[d.state] = value;
      if ( d.state === "name" && !s.identifierTouched ) s.identifier = suggestIdentifier(value);
      if ( d.state === "identifier" ) { s.identifierTouched = true; s.identifier = String(value).trim(); s.override = false; }
    }
    else if ( d.recipe !== undefined ) {
      const recipe = s.recipes[Number(d.recipe)];
      if ( !recipe ) return;
      recipe.values ??= {};
      if ( d.clause !== undefined ) this.#setClause(recipe, d, el);
      else if ( d.kind === "multi" ) {
        const boxes = this.element.querySelectorAll(`[data-recipe="${d.recipe}"][data-field="${d.field}"][data-option]`);
        recipe.values[d.field] = parseFieldValue("multi", Array.from(boxes).filter(b => b.checked).map(b => b.dataset.option));
      }
      else recipe.values[d.field] = parseFieldValue(d.kind, el.type === "checkbox" ? el.checked : el.value);
    }
    else return;
    s.saved = false;
    this.render();
  }

  /** Une partie d'une clause de condition. Changer le fait remet son argument à zéro. */
  #setClause(recipe, d, el) {
    const clauses = recipe.values[d.field] ??= [];
    const clause = clauses[Number(d.clause)];
    if ( !clause ) return;
    const facts = engine.recipes().facts;
    switch ( d.part ) {
      case "fact":
        clause.fact = el.value;
        clause.arg = defaultArg(facts[el.value]?.arg, { identifier: this.draft.identifier });
        break;
      case "not": clause.not = el.checked; break;
      case "arg":
        clause.arg = el.multiple ? Array.from(el.selectedOptions).map(o => o.value)
          : (facts[clause.fact]?.arg === "number" ? Number(el.value) : el.value);
        break;
      case "distance": clause.arg = { ...clause.arg, distance: Number(el.value) }; break;
      case "units": clause.arg = { ...clause.arg, units: el.value }; break;
      case "class": clause.arg = { ...clause.arg, class: el.value.trim() }; break;
      case "level": clause.arg = { ...clause.arg, level: Number(el.value) }; break;
    }
  }

  /** Un item glissé dans la fenêtre, à l'étape de départ : il devient le modèle. */
  async #onDrop(event) {
    if ( this.draft.step !== "start" ) return;
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if ( data?.type !== "Item" ) return ui.notifications.warn(loc("Depart.PasUnObjet"));
    const item = await fromUuid(data.uuid);
    if ( !item ) return;
    Object.assign(this.draft, {
      sourceUuid: item.uuid, sourceName: item.name, base: engine.entryOf(item), keepBase: true,
      name: loc("Depart.NomCopie", { name: item.name }), img: item.img, identifierTouched: false
    });
    this.draft.identifier = suggestIdentifier(this.draft.name);
    this.render();
  }

  /* ------------------------------------------------------------------ */
  /*  Actions                                                            */
  /* ------------------------------------------------------------------ */

  static #onNext() {
    const s = this.draft;
    s.step = { start: s.sourceUuid ? "identity" : "nature", nature: "identity", native: "automation" }[s.step] ?? s.step;
    if ( (s.step === "identity") && !s.sourceUuid && !s.img ) s.img = Item.implementation.getDefaultArtwork?.({ type: NATURES[s.nature].type })?.img ?? "";
    this.render();
  }

  static #onPrev() {
    const s = this.draft;
    s.step = { nature: "start", identity: s.sourceUuid ? "start" : "nature", automation: "native" }[s.step] ?? s.step;
    this.render();
  }

  static #onClearSource() {
    Object.assign(this.draft, { sourceUuid: null, sourceName: null, base: null, name: "", img: "", identifier: "" });
    this.render();
  }

  static #onPickImage() {
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    new FilePicker({ type: "image", current: this.draft.img, callback: path => { this.draft.img = path; this.render(); } }).render({ force: true });
  }

  static async #onRecreatePack() {
    await createPack();
    this.render();
  }

  /** L'item est créé dans le compendium, la création rangée (sans recette) : on peut passer aux activités. */
  static async #onCreateItem(event, target) {
    const s = this.draft;
    if ( this.#identityProblems().length ) return;
    if ( !homebrewPack() ) return ui.notifications.error(loc("Pack.Absent"));
    target.disabled = true;
    try {
      const item = await createCreation(s);
      s.itemUuid = item.uuid;
    } catch(err) {
      target.disabled = false;
      return ui.notifications.error(err.message);
    }
    s.step = "native";
    s.saved = true;
    this.render();
  }

  static async #onOpenSheet() {
    const item = this.draft.itemUuid ? await fromUuid(this.draft.itemUuid) : null;
    item?.sheet.render({ force: true });
  }

  static #onAddRecipe(event, target) {
    const type = target.dataset.type;
    const recipe = engine.recipes().list[type];
    if ( !recipe ) return;
    this.draft.recipes.push({ type, values: defaultValues(recipe) });
    this.draft.saved = false;
    this.render();
  }

  static #onRemoveRecipe(event, target) {
    this.draft.recipes.splice(Number(target.dataset.recipe), 1);
    this.draft.saved = false;
    this.render();
  }

  static #onAddClause(event, target) {
    const recipe = this.draft.recipes[Number(target.dataset.recipe)];
    if ( !recipe ) return;
    const facts = engine.recipes().facts;
    const fact = Object.keys(facts)[0];
    ((recipe.values ??= {})[target.dataset.field] ??= []).push({ fact, arg: defaultArg(facts[fact].arg) });
    this.render();
  }

  static #onRemoveClause(event, target) {
    const recipe = this.draft.recipes[Number(target.dataset.recipe)];
    recipe?.values?.[target.dataset.field]?.splice(Number(target.dataset.clause), 1);
    this.render();
  }

  /** Enregistre la création ; refusé tant qu'elle a des erreurs (le moteur l'écarterait). */
  static async #onSave() {
    const s = this.draft;
    const { saved } = await saveAutomation(s.identifier, { recipes: s.recipes, keepBase: s.keepBase, name: s.name });
    if ( !saved ) return ui.notifications.error(loc("Automatisation.PasEnregistre"));
    s.saved = true;
    ui.notifications.info(loc("Automatisation.Enregistre", { name: s.name }));
    this.render();
  }
}

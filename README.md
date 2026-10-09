# DAS · Homebrew (`darsh-homebrew`)

[![Tests](https://github.com/Darshyne/darsh-homebrew/actions/workflows/tests.yml/badge.svg)](https://github.com/Darshyne/darsh-homebrew/actions/workflows/tests.yml)

Part of **Darshyne's Automation Suite (DAS)**. A step-by-step **creator of automated items** for **Foundry VTT V14** and
**dnd5e 6.x**, for GMs who don't write code: spells, class features, species traits, feats, weapons, equipment,
consumables and monster features.

- **Start from scratch, or from any existing item**: drop a spell or a feature into the creator and it keeps its
  activities, effects and current automation — you only change what differs ("like Thunderwave, but cold").
- **dnd5e does what dnd5e does**: activities (attack, save, damage, healing, summon…), range, area and effects are set
  on the item's own sheet.
- **The engine does the rest**: pick building blocks from a catalogue and fill in simple forms — bonus damage,
  advantage or disadvantage, a condition on a hit or a failed save, push or pull, repeated save, effect ending on
  damage, lasting zone, aura, reaction, retaliation, save on hit, teleport, summon, usage limits, effects ending on a
  rest. Conditions are built from plain choices ("the target has the Prone condition", "the target is within 10 ft").
  The engine checks every automation before it is saved and shows exactly what it will receive.
- Creations live in a compendium **created in your world** on first launch ("Homebrew (DAS)"), so they stay yours and
  editable. Their rules are recognised by identifier on every sheet the item is placed on, PCs and NPCs alike, and
  editing a creation updates all of them at once, for every connected player.

It **requires the [`dnd5e-combat`](https://github.com/Darshyne/dnd5e-combat) engine** (≥ 0.200.0), whose recipe
catalogue (`api.content.recipes`) defines the building blocks: what the engine cannot do, the creator cannot offer.
The engine does not depend on this module and runs without it.

## Use

GM only. In the Items sidebar, **Create (Homebrew)**. To edit a creation later, open its sheet (in the compendium or on
an actor) and use **Automation (Homebrew)** in the window header.

## Installation

In Foundry (or on The Forge), *Install Module* → paste the manifest URL:

```
https://github.com/Darshyne/darsh-homebrew/releases/latest/download/module.json
```

From source: the Foundry module is the `module/` subfolder, to copy or link into `Data/modules/darsh-homebrew`.
Tests: `npm install` then `npm test` (they read the engine's catalogue from a `dnd5e-combat` clone, set `DAS_CORE` to its
path). In-game scenario: `tools/scenarios/`, played with the engine's scenario runner.

Early development. Planned next: automation packs (installable rule sets, including ones that automate premium content
by identifier without shipping any of it).

## License

MIT. No book text or premium content is shipped.

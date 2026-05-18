# Chocobo Vector Racing - Agent Handoff

Hello! If you are a new agent picking up this project, welcome. 

## Context
The user is building a Foundry VTT v13 module to automate a DnD 5e minigame called **Chocobo Vector Racing**. 
The mechanics are based on momentum, "ghost" positions (where your velocity carries you), and maneuvering. 

**Core Gameplay Loop:**
1. **Secret Planning Phase:** All players use a custom "Racing HUD" to secretly lock in their movement adjustment (Control, Focus, Pivot). 
2. **Resolution Phase:** When their turn comes up in DnD5e initiative, they reveal their locked-in move, the token auto-moves, and they take their normal action.
3. **Challenge Phase:** At the end of a round, if two tokens share a space, they contest a check to push each other (which can cause crashes).

**Other Mechanics:**
- Crashing into walls deals `max(0, Speed - 4)d6` damage and stops momentum. Collision should use a direct ray check to be lenient.
- Stamina tracking.
- Mount Tokens are used on the map, but the "Rider" stats (for Animal Handling / Acrobatics) are pulled from a linked 5e Actor.
- Uses Foundry V13 **Regions API** to trigger terrain effects (Deep Sand, Boost Pads) when passing through them.

## Current State
- The scaffold has been created in `d:\Documents\Github Projects\FFXIV VTT\chocobo-racing`.
- **Note to User/Agent:** The user requested to move this folder out of the `FFXIV VTT` project and into `d:\Documents\Github Projects\chocobo-racing`. Check the current working directory to see where you are.
- Basic `module.json` and `scripts/main.js` are in place. The `main.js` currently injects a button into the Token HUD to open the Racing HUD, but the ApplicationV2 window is not fully built yet.

## Next Steps (Phase 1)
1. **Token Flags:** Build the logic to link a Mount token to a Rider Actor ID, and initialize default velocity/stamina flags.
2. **Ghost Rendering:** Create the canvas visualizer that draws the "Ghost" prediction box based on current velocity.
3. **The Racing HUD:** Build the UI that reads the velocity, offers the maneuvers, and saves the "Secret Plan" to the token flags when locked in.
4. **Reveal Logic:** Build the macro/function that officially moves the token to its secretly planned location and recalculates the new velocity.

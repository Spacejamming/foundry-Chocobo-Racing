const MODULE_ID = "chocobo-racing";

class RacingManager {
    static init() {
        const version = game.modules.get(MODULE_ID).version;
        console.log(`Chocobo Vector Racing | Initializing module (Version ${version})`);
        
        // Register module settings
        game.settings.register(MODULE_ID, "raceModeEnabled", {
            name: "Enable Race Mode",
            hint: "When enabled, selecting a token allows access to the Racing HUD.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
        });

        // Hook to inject Racing HUD button on tokens
        Hooks.on("getRenderTokenHUD", RacingManager._onTokenHUD);
    }

    static _onTokenHUD(hud, html, data) {
        if (!game.settings.get(MODULE_ID, "raceModeEnabled")) return;
        
        // Only show if we own the token
        const token = canvas.tokens.get(data._id);
        if (!token || !token.isOwner) return;

        // Add a racing flag button to the left side of the HUD
        const button = $(`
            <div class="control-icon chocobo-race-hud-btn" title="Open Racing HUD">
                <i class="fa-solid fa-flag-checkered"></i>
            </div>
        `);
        
        button.click((ev) => {
            ev.preventDefault();
            new RacingHUDApplication(token).render(true);
        });

        html.find('.col.left').append(button);
    }
}

class RacingHUDApplication extends foundry.applications.api.ApplicationV2 {
    constructor(token) {
        super();
        this.token = token;
    }

    static DEFAULT_OPTIONS = {
        id: "chocobo-racing-hud",
        classes: ["chocobo-racing-app"],
        title: "Racing HUD",
        tag: "form",
        position: { width: 350, height: "auto" },
        window: { minimizable: true, resizable: false }
    };

    get title() {
        return `Racing HUD: ${this.token.name}`;
    }

    // In a future session, we will expand this class with Vue/Handlebars logic 
    // to render Stamina, Speed, the Ghost rendering logic, and the "Lock In" / "Reveal" actions!
}

class RacingData {
    static getVelocity(tokenDoc) {
        return tokenDoc.getFlag(MODULE_ID, "velocity") || { x: 0, y: 0 };
    }
    
    static async setVelocity(tokenDoc, x, y) {
        return tokenDoc.setFlag(MODULE_ID, "velocity", { x, y });
    }
    
    static getMaxStamina(tokenDoc) {
        return tokenDoc.getFlag(MODULE_ID, "maxStamina") || 5;
    }
    
    static getStamina(tokenDoc) {
        const max = this.getMaxStamina(tokenDoc);
        const current = tokenDoc.getFlag(MODULE_ID, "stamina");
        return current !== undefined ? current : max;
    }
    
    static async setStamina(tokenDoc, value) {
        return tokenDoc.setFlag(MODULE_ID, "stamina", Math.max(0, value));
    }
}

class GhostRenderer {
    static renderGhost(token) {
        const isRaceModeEnabled = game.settings.get(MODULE_ID, "raceModeEnabled");
        if (!isRaceModeEnabled) {
            // Optional: you can uncomment the log below if you want to see how often it fires
            // console.log(`Chocobo Racing | GhostRenderer skipped: raceModeEnabled is false for ${token.name}`);
            return;
        }
        
        console.log(`Chocobo Racing | renderGhost called for token ${token.name}`);

        const velocity = RacingData.getVelocity(token.document);
        console.log(`Chocobo Racing | ${token.name} current velocity:`, velocity);
        
        if (velocity.x === 0 && velocity.y === 0) {
            if (token._ghostGraphics) {
                console.log(`Chocobo Racing | Clearing ghost for ${token.name} (velocity is 0)`);
                token._ghostGraphics.clear();
            }
            return;
        }

        if (!token._ghostGraphics) {
            console.log(`Chocobo Racing | Creating new ghost PIXI.Graphics for ${token.name}`);
            token._ghostGraphics = new PIXI.Graphics();
            token._ghostGraphics.zIndex = -1;
            token.addChild(token._ghostGraphics);
            token.sortableChildren = true;
        }

        const sizeX = canvas.grid.sizeX || canvas.grid.size; // fallback for older versions
        const sizeY = canvas.grid.sizeY || canvas.grid.size;
        
        const dx = velocity.x * sizeX;
        const dy = velocity.y * sizeY;
        
        console.log(`Chocobo Racing | Drawing ghost for ${token.name} at offset dx=${dx}, dy=${dy} (Grid Size: ${sizeX}x${sizeY})`);

        const g = token._ghostGraphics;
        g.clear();
        g.lineStyle(2, 0x00FFFF, 0.8);
        g.beginFill(0x00FFFF, 0.2);
        g.drawRect(dx, dy, token.document.width * sizeX, token.document.height * sizeY); // In V12+, token.w/h can be unreliable before draw. Best to use document size.
        g.endFill();
    }
}

Hooks.once("init", () => RacingManager.init());

Hooks.on("refreshToken", (token) => {
    // Only render ghosts for tokens we own so we can't see enemy secret plans
    if (token.isOwner) GhostRenderer.renderGhost(token);
});

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

Hooks.once("init", () => RacingManager.init());

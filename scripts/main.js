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
        Hooks.on("renderTokenHUD", RacingManager._onTokenHUD);
    }

    static _onTokenHUD(hud, html, data) {
        if (!game.settings.get(MODULE_ID, "raceModeEnabled")) return;
        
        // Only show if we own the token
        const token = hud.object;
        if (!token || !token.isOwner) return;

        console.log("Chocobo Racing | Injecting Racing HUD button for", token.name);

        const button = $(`
            <div class="control-icon chocobo-race-hud-btn" title="Open Racing HUD">
                <i class="fas fa-flag-checkered"></i>
            </div>
        `);
        
        button.click((ev) => {
            ev.preventDefault();
            new RacingHUDApplication(token).render(true);
        });

        const $html = $(html);
        const leftCol = $html.find('.col.left');
        console.log("Chocobo Racing | Found left column:", leftCol.length);
        if (leftCol.length > 0) {
            leftCol.append(button);
        } else {
            // Fallback if .col.left isn't found
            $html.find('.control-icon').first().parent().append(button);
        }
    }
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class RacingHUDApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(token) {
        super();
        this.token = token;
        this.plan = {
            adjustment: { dx: 0, dy: 0 },
            action: "action-none"
        };
    }

    static DEFAULT_OPTIONS = {
        id: "chocobo-racing-hud",
        classes: ["chocobo-racing-app"],
        tag: "form",
        position: { width: 350, height: "auto" },
        window: { minimizable: true, resizable: false }
    };

    static PARTS = {
        hud: {
            template: "modules/chocobo-racing/templates/racing-hud.hbs",
        }
    };

    get title() {
        return `Racing HUD: ${this.token.name}`;
    }

    async _prepareContext(options) {
        const ownerUser = game.users.find(u => !u.isGM && this.token.document.testUserPermission(u, "OWNER")) || game.user;
        const colorHex = ownerUser.color || "#00FFFF";
        
        return {
            tokenName: this.token.name,
            playerColor: colorHex,
            stamina: RacingData.getStamina(this.token.document),
            maxStamina: RacingData.getMaxStamina(this.token.document),
            velocity: RacingData.getVelocity(this.token.document)
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;

        // Compass Handlers
        html.querySelectorAll('.compass-btn').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                html.querySelectorAll('.compass-btn').forEach(b => b.classList.remove('active'));
                ev.currentTarget.classList.add('active');
                
                const action = ev.currentTarget.dataset.action;
                let dx = 0, dy = 0;
                if (action === "adjust-n") dy = -1;
                if (action === "adjust-s") dy = 1;
                if (action === "adjust-e") dx = 1;
                if (action === "adjust-w") dx = -1;
                if (action === "adjust-nw") { dx = -1; dy = -1; }
                if (action === "adjust-ne") { dx = 1; dy = -1; }
                if (action === "adjust-sw") { dx = -1; dy = 1; }
                if (action === "adjust-se") { dx = 1; dy = 1; }
                if (action === "adjust-reset") { dx = 0; dy = 0; }
                
                this.plan.adjustment = { dx, dy };
                
                // Update preview line
                this.token._previewAdjustment = this.plan.adjustment;
                GhostRenderer.renderGhost(this.token);
            });
        });

        // Action Handlers
        html.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                html.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
                ev.currentTarget.classList.add('active');
                this.plan.action = ev.currentTarget.dataset.action;
            });
        });

        // Form Submit / Lock In
        html.querySelector('.lock-in-btn').addEventListener('click', async (ev) => {
            ev.preventDefault();
            await this.token.document.setFlag(MODULE_ID, "secretPlan", this.plan);
            ui.notifications.info(`${this.token.name} locked in their plan!`);
            this.close();
        });
    }
    
    close(options) {
        // Clear preview when closing
        delete this.token._previewAdjustment;
        GhostRenderer.renderGhost(this.token);
        return super.close(options);
    }
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
        if (!isRaceModeEnabled) return;

        const velocity = RacingData.getVelocity(token.document);
        
        if (velocity.x === 0 && velocity.y === 0) {
            if (token._ghostGraphics) token._ghostGraphics.clear();
            return;
        }

        if (!token._ghostGraphics) {
            token._ghostGraphics = new PIXI.Graphics();
            token._ghostGraphics.zIndex = -1;
            token.addChild(token._ghostGraphics);
            token.sortableChildren = true;
        }

        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;
        
        let dx = velocity.x;
        let dy = velocity.y;

        if (token._previewAdjustment) {
            dx += token._previewAdjustment.dx;
            dy += token._previewAdjustment.dy;
        }

        const px = dx * sizeX;
        const py = dy * sizeY;
        
        const g = token._ghostGraphics;
        g.clear();
        // Remove old text children
        g.removeChildren();

        // Determine color based on the first non-GM owner
        const ownerUser = game.users.find(u => !u.isGM && token.document.testUserPermission(u, "OWNER")) || game.user;
        const colorHex = ownerUser.color || "#00FFFF";
        const colorNumeric = foundry.utils.Color.from(colorHex).valueOf();

        g.lineStyle(2, colorNumeric, 0.8);
        g.beginFill(colorNumeric, 0.2);
        g.drawRect(px, py, token.document.width * sizeX, token.document.height * sizeY);
        g.endFill();

        // Draw line between rider and ghost
        g.lineStyle(2, colorNumeric, token._previewAdjustment ? 0.8 : 0.5);
        g.moveTo(sizeX / 2, sizeY / 2); // Center of token
        g.lineTo(px + sizeX / 2, py + sizeY / 2); // Center of ghost

        // Check if this owner has multiple racers
        const ownedTokens = canvas.tokens.placeables.filter(t => t.document.testUserPermission(ownerUser, "OWNER"));
        if (ownedTokens.length > 1) {
            const labelIndex = ownedTokens.indexOf(token);
            const labelChar = String.fromCharCode(65 + Math.max(0, labelIndex)); // A, B, C...

            // Label for Ghost
            const textStyle = { fill: colorHex, fontSize: 32, stroke: 0x000000, strokeThickness: 4, fontWeight: 'bold' };
            const ghostText = new PIXI.Text({text: labelChar, style: textStyle}); // V12/13 PIXI.Text options
            const gText = new PIXI.Text(labelChar, textStyle);
            gText.anchor.set(0.5);
            gText.position.set(px + (token.document.width * sizeX)/2, py + (token.document.height * sizeY)/2);
            g.addChild(gText);

            // Label for Token
            const tText = new PIXI.Text(labelChar, textStyle);
            tText.anchor.set(0.5);
            tText.position.set((token.document.width * sizeX)/2, (token.document.height * sizeY)/2);
            g.addChild(tText);
        }
    }
}

Hooks.once("init", () => RacingManager.init());

Hooks.on("refreshToken", (token) => {
    // Only render ghosts for tokens we own so we can't see enemy secret plans
    if (token.isOwner) GhostRenderer.renderGhost(token);
});

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
        
        // Hook to inject Token Config settings
        Hooks.on("renderTokenConfig", RacingManager._onRenderTokenConfig);
    }

    static _onTokenHUD(hud, html, data) {
        if (!game.settings.get(MODULE_ID, "raceModeEnabled")) return;
        
        const token = hud.object;
        if (!token || !token.isOwner) return;

        const button = $(`
            <div class="control-icon chocobo-race-hud-btn" title="Toggle Racing HUD">
                <i class="fas fa-flag-checkered"></i>
            </div>
        `);
        
        button.click((ev) => {
            ev.preventDefault();
            CanvasRacingHUD.toggle(token);
        });

        const $html = $(html);
        const leftCol = $html.find('.col.left');
        if (leftCol.length > 0) {
            leftCol.append(button);
        } else {
            $html.find('.control-icon').first().parent().append(button);
        }
    }

    static _onRenderTokenConfig(app, html, data) {
        const $html = $(html);
        const nav = $html.find('nav.sheet-tabs[data-group="main"]');
        if (!nav.length) return;

        nav.append(`<a class="item" data-tab="chocobo-racing"><i class="fas fa-flag-checkered"></i> Racing</a>`);

        const riderId = app.document.getFlag(MODULE_ID, "riderId") || "";
        const maxStamina = app.document.getFlag(MODULE_ID, "maxStamina") || 5;

        let options = `<option value="">None</option>`;
        game.actors.forEach(actor => {
            if (actor.hasPlayerOwner) {
                const selected = actor.id === riderId ? "selected" : "";
                options += `<option value="${actor.id}" ${selected}>${actor.name}</option>`;
            }
        });

        const tab = $(`
            <div class="tab" data-group="main" data-tab="chocobo-racing">
                <div class="form-group">
                    <label>Rider Actor</label>
                    <div class="form-fields">
                        <select name="flags.${MODULE_ID}.riderId">${options}</select>
                    </div>
                    <p class="notes">Link a player actor to this mount for skill checks and identification.</p>
                </div>
                <div class="form-group">
                    <label>Max Stamina</label>
                    <div class="form-fields">
                        <input type="number" name="flags.${MODULE_ID}.maxStamina" value="${maxStamina}" min="1" step="1">
                    </div>
                </div>
            </div>
        `);

        $html.find('footer.sheet-footer').before(tab);
    }
}

class CanvasRacingHUD {
    static activeToken = null;
    static plan = { adjustment: { dx: 0, dy: 0 }, action: "action-none" };
    static element = null;

    static async toggle(token) {
        if (this.activeToken === token) {
            this.close();
        } else {
            await this.open(token);
        }
    }

    static async open(token) {
        this.close(); // Close any existing
        this.activeToken = token;
        this.plan = { adjustment: { dx: 0, dy: 0 }, action: "action-none" };
        
        const rider = RacingData.getRider(token.document);
        const riderName = rider ? rider.name : token.name;
        const stamina = RacingData.getStamina(token.document);
        const maxStamina = RacingData.getMaxStamina(token.document);
        const velocity = RacingData.getVelocity(token.document);
        
        const ownerUser = game.users.find(u => !u.isGM && token.document.testUserPermission(u, "OWNER")) || game.user;
        const colorHex = ownerUser.color || "#00FFFF";

        const templateData = {
            tokenId: token.id,
            tokenName: token.name,
            riderName: riderName,
            playerColor: colorHex,
            stamina: stamina,
            maxStamina: maxStamina
        };

        const htmlString = await renderTemplate("modules/chocobo-racing/templates/racing-hud.hbs", templateData);
        
        // Inject into #hud
        const $hud = $('#hud');
        $hud.append(htmlString);
        this.element = $hud.find(`#chocobo-hud-${token.id}`);

        this.updatePosition();

        // Bind events
        this.element.find('.compass-btn').click(ev => {
            this.element.find('.compass-btn').removeClass('active');
            $(ev.currentTarget).addClass('active');
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
            this.activeToken._previewAdjustment = this.plan.adjustment;
            GhostRenderer.renderGhost(this.activeToken);
        });

        this.element.find('.action-btn').click(ev => {
            this.element.find('.action-btn').removeClass('active');
            $(ev.currentTarget).addClass('active');
            this.plan.action = ev.currentTarget.dataset.action;
        });

        this.element.find('.lock-in-btn').click(async (ev) => {
            ev.preventDefault();
            await this.activeToken.document.setFlag(MODULE_ID, "secretPlan", this.plan);
            ui.notifications.info(`${riderName} locked in their plan!`);
            this.close();
        });

        Hooks.on('canvasPan', CanvasRacingHUD.onPan);
    }

    static onPan = () => {
        if (CanvasRacingHUD.activeToken) {
            CanvasRacingHUD.updatePosition();
        }
    }

    static updatePosition() {
        if (!this.activeToken || !this.element) return;
        
        // Actions go near the token
        const actionsHUD = this.element.find('.chocobo-canvas-actions');
        
        // Use native Foundry transform for Token
        const tokenPoint = {
            x: this.activeToken.document.x + this.activeToken.w, 
            y: this.activeToken.document.y
        };
        const tokenScreen = canvas.clientCoordinatesFromCanvas(tokenPoint);
        actionsHUD.css({ left: tokenScreen.x + 20, top: tokenScreen.y });

        // Compass goes over the ghost
        const velocity = RacingData.getVelocity(this.activeToken.document);
        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;
        
        // Include preview adjustment if any
        let dx = velocity.x;
        let dy = velocity.y;
        if (this.activeToken._previewAdjustment) {
            dx += this.activeToken._previewAdjustment.dx;
            dy += this.activeToken._previewAdjustment.dy;
        }

        const ghostX = this.activeToken.document.x + (dx * sizeX) + (this.activeToken.w / 2);
        const ghostY = this.activeToken.document.y + (dy * sizeY) + (this.activeToken.h / 2);
        
        const ghostScreen = canvas.clientCoordinatesFromCanvas({x: ghostX, y: ghostY});
        
        const compassHUD = this.element.find('.chocobo-canvas-compass');
        compassHUD.css({ left: ghostScreen.x, top: ghostScreen.y });
    }

    static close() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        if (this.activeToken) {
            delete this.activeToken._previewAdjustment;
            GhostRenderer.renderGhost(this.activeToken);
            this.activeToken = null;
        }
        Hooks.off('canvasPan', CanvasRacingHUD.onPan);
    }
}

class RacingData {
    static getRider(tokenDoc) {
        const riderId = tokenDoc.getFlag(MODULE_ID, "riderId");
        return riderId ? game.actors.get(riderId) : null;
    }

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

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
        
        // Close the HUD if the active token is deleted
        Hooks.on("deleteToken", (scene, tokenDoc) => {
            if (CanvasRacingHUD.activeToken?.id === tokenDoc.id) {
                CanvasRacingHUD.close();
            }
        });
        
        this.registerGlobalApi();
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
        const nav = $html.find('nav.tabs, nav.sheet-tabs').first();
        
        if (!nav.length) return;

        const $racingTab = $(`<a class="item" data-tab="chocobo-racing"><i class="fas fa-flag-checkered"></i> Racing</a>`);
        nav.append($racingTab);
        $racingTab.click(ev => {
            ev.preventDefault();
            nav.find('a.item').removeClass('active');
            $racingTab.addClass('active');
            $html.find('.tab').removeClass('active');
            $html.find('.tab[data-tab="chocobo-racing"]').addClass('active');
        });

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

        const contentContainer = $html.find('.window-content').length ? $html.find('.window-content') : $html.find('footer.sheet-footer').parent();
        if ($html.find('footer.sheet-footer').length) {
            $html.find('footer.sheet-footer').before(tab);
        } else {
            contentContainer.append(tab);
        }
    }

    static registerGlobalApi() {
        const api = {
            revealControlPlans: this.revealControlPlans.bind(this),
            applyGhostResults: this.applyGhostResults.bind(this),
            cleanupGhosts: this.cleanupGhosts.bind(this),
            getRacePhase: this.getSceneRacePhase.bind(this),
        };
        if (typeof globalThis !== "undefined") {
            globalThis.ChocoboRacing = api;
        }
        console.log("Chocobo Racing | Global API registered", api);
    }

    static _isGM() {
        return game.user?.isGM;
    }

    static getScene() {
        return game.scenes?.current;
    }

    static getSceneRacePhase(scene = this.getScene()) {
        return scene?.getFlag(MODULE_ID, "racePhase") || "planning";
    }

    static async setSceneRacePhase(phase, scene = this.getScene()) {
        if (!scene) return null;
        return scene.setFlag(MODULE_ID, "racePhase", phase);
    }

    /**
     * GM macro entry point for revealing secret racing control plans.
     *
     * This method scans all scene tokens for a stored `secretPlan`,
     * creates temporary desaturated ghost tokens at the computed destination,
     * and links each ghost back to its original token.
     */
    static async revealControlPlans() {
        if (!this._isGM()) {
            ui.notifications.warn("Only the GM can reveal racing control plans.");
            return;
        }

        const scene = this.getScene();
        if (!scene) return;

        const plannedTokens = scene.tokens.contents.filter(token => token.getFlag(MODULE_ID, "secretPlan"));
        if (!plannedTokens.length) {
            ui.notifications.info("No secret racing plans found for reveal.");
            return;
        }

        await this.cleanupGhosts();

        const gridSizeX = canvas.grid.sizeX || canvas.grid.size;
        const gridSizeY = canvas.grid.sizeY || canvas.grid.size;
        const ghostData = [];

        const actionLabels = {
            "action-focus": "Focus",
            "action-pivot": "Pivot",
            "action-sabotage": "Sabotage",
            "action-none": "No Action"
        };

        for (const token of plannedTokens) {
            const plan = token.getFlag(MODULE_ID, "secretPlan");
            const currentVelocity = RacingData.getVelocity(token);
            const adjustment = plan?.adjustment || { dx: 0, dy: 0 };
            const actionLabel = actionLabels[plan?.action] || (plan?.action ? plan.action.replace(/^action-/, "").replace(/-/g, " ") : "No Action");
            ui.notifications.info(`${token.name} planned ${actionLabel}.`);
            currentVelocity.x = (currentVelocity.x || 0) + (adjustment.dx || 0);
            currentVelocity.y = (currentVelocity.y || 0) + (adjustment.dy || 0);
            const ghostX = token.x + (currentVelocity.x * gridSizeX);
            const ghostY = token.y + (currentVelocity.y * gridSizeY);
            const velocity = { x: currentVelocity.x, y: currentVelocity.y, total: Math.abs(currentVelocity.x) + Math.abs(currentVelocity.y) };

            const tokenData = foundry.utils.deepClone(token.toObject());
            delete tokenData._id;
            tokenData.x = ghostX;
            tokenData.y = ghostY;
            tokenData.alpha = 0.45;
            tokenData.lockRotation = true;
            tokenData.name = `Ghost: ${token.name}`;
            tokenData.displayName = CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER;
            tokenData.flags = tokenData.flags || {};
            tokenData.flags[MODULE_ID] = tokenData.flags[MODULE_ID] || {};
            tokenData.flags[MODULE_ID].ghostOf = token.id;
            tokenData.flags[MODULE_ID].isTemporaryGhost = true;
            tokenData.flags[MODULE_ID].ghostPhase = "controlReveal";
            tokenData.flags[MODULE_ID].previewVelocity = velocity;
            ghostData.push(tokenData);
        }

        const createdGhosts = await scene.createEmbeddedDocuments("Token", ghostData);
        for (const ghost of createdGhosts) {
            const originalId = ghost.getFlag(MODULE_ID, "ghostOf");
            const original = scene.tokens.get(originalId);
            if (!original) continue;
            await original.setFlag(MODULE_ID, "ghostTokenId", ghost.id);
            await original.setFlag(MODULE_ID, "plannedVelocity", ghost.getFlag(MODULE_ID, "previewVelocity"));
        }

        await this.setSceneRacePhase("controlReveal");
        ui.notifications.info("Control plans revealed. Ghost tokens have been created.");
        ChatMessage.create({ content: `<p><strong>Chocobo Racing:</strong> Control movement has been revealed and ghost tokens are on the board.</p>` });
    }

    static async cleanupGhosts() {
        const scene = this.getScene();
        if (!scene) return;

        const ghosts = scene.tokens.contents.filter(token => token.getFlag(MODULE_ID, "isTemporaryGhost"));
        if (!ghosts.length) {
            await this.setSceneRacePhase("planning");
            return;
        }

        const ghostIds = ghosts.map(token => token.id);
        const originalIds = ghosts.map(token => token.getFlag(MODULE_ID, "ghostOf")).filter(Boolean);
        await scene.deleteEmbeddedDocuments("Token", ghostIds);

        for (const originalId of originalIds) {
            const original = scene.tokens.get(originalId);
            if (!original) continue;
            await original.unsetFlag(MODULE_ID, "ghostTokenId");
            await original.unsetFlag(MODULE_ID, "plannedVelocity");
            await original.unsetFlag(MODULE_ID, "previewVelocity");
        }

        await this.setSceneRacePhase("planning");
        ui.notifications.info("Temporary ghost tokens removed and race phase reset to planning.");
    }

    /**
     * GM macro entry point for finalizing a race round.
     *
     * This method takes every temporary ghost token, moves the original token to the
     * ghost position, updates the token velocity, and removes ghost state.
     */
    static async applyGhostResults() {
        if (!this._isGM()) {
            ui.notifications.warn("Only the GM can apply ghost results.");
            return;
        }

        const scene = this.getScene();
        if (!scene) return;

        const ghosts = scene.tokens.contents.filter(token => token.getFlag(MODULE_ID, "isTemporaryGhost"));
        if (!ghosts.length) {
            ui.notifications.info("No ghost tokens found to apply.");
            return;
        }

        const gridSize = canvas.grid.sizeX || canvas.grid.size;
        for (const ghost of ghosts) {
            const originalId = ghost.getFlag(MODULE_ID, "ghostOf");
            const original = scene.tokens.get(originalId);
            if (!original) continue;

            const dx = Math.round((ghost.x - original.x) / gridSize);
            const dy = Math.round((ghost.y - original.y) / gridSize);

            await original.update({ x: ghost.x, y: ghost.y });
            await original.setFlag(MODULE_ID, "velocity", { x: dx, y: dy });
            await original.unsetFlag(MODULE_ID, "secretPlan");
            await original.unsetFlag(MODULE_ID, "ghostTokenId");
            await original.unsetFlag(MODULE_ID, "plannedVelocity");
            await original.unsetFlag(MODULE_ID, "previewVelocity");
        }

        const ghostIds = ghosts.map(token => token.id);
        await scene.deleteEmbeddedDocuments("Token", ghostIds);
        await this.setSceneRacePhase("complete");

        ui.notifications.info("Ghost results applied: tokens moved and velocity updated.");
        ChatMessage.create({ content: `<p><strong>Chocobo Racing:</strong> Ghost movement has been applied and the round is complete.</p>` });
    }
}

class CanvasRacingHUD {
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
        const existingPlan = token.document.getFlag(MODULE_ID, "secretPlan");
        
        const ownerUser = game.users.find(u => !u.isGM && token.document.testUserPermission(u, "OWNER")) || game.user;
        const colorHex = ownerUser.color || "#00FFFF";

        const templateData = {
            tokenId: token.id,
            tokenName: token.name,
            riderName: riderName,
            playerColor: colorHex,
            stamina: stamina,
            maxStamina: maxStamina,
            selectedAction: existingPlan?.action || "action-none",
            selectedAdjustment: existingPlan?.adjustment || { dx: 0, dy: 0 }
        };

        const renderFn = foundry.applications?.handlebars?.renderTemplate || renderTemplate;
        const htmlString = await renderFn("modules/chocobo-racing/templates/racing-hud.hbs", templateData);
        
        // Inject into #hud directly
        const $hud = $('#hud');
        if (!$hud.length) return;
        $hud.append(htmlString);
        
        this.element = $('#chocobo-hud-' + token.id);
        if (!this.element.length) {
            console.error(`Chocobo Racing | Failed to find injected HUD element for token ${token.id}`);
            return;
        }
        
        this.plan = existingPlan || this.plan;
        this.activeToken._previewAdjustment = this.plan.adjustment;
        GhostRenderer.renderGhost(this.activeToken);

        this._bindListeners(riderName);
        this.updatePosition();

        if (!this._panHookRegistered) {
            Hooks.on('canvasPan', this.onPan);
            this._panHookRegistered = true;
        }
    }

    static _bindListeners(riderName) {
        const compassHUD = this.element.find('.chocobo-canvas-compass');
        const actionsHUD = this.element.find('.chocobo-canvas-actions');
        const self = this;

        if (this.plan.action) {
            actionsHUD.find(`.action-btn[data-action="${this.plan.action}"]`).addClass('active');
        }
        if (this.plan.adjustment) {
            const adjustmentKey = this._formatAdjustmentKey(this.plan.adjustment);
            compassHUD.find(`.compass-btn[data-action="${adjustmentKey}"]`).addClass('active');
        }
        
        compassHUD.find('.compass-btn').click(ev => {
            compassHUD.find('.compass-btn').removeClass('active');
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
            self.plan.adjustment = { dx, dy };
            self.activeToken._previewAdjustment = self.plan.adjustment;
            GhostRenderer.renderGhost(self.activeToken);
        });

        actionsHUD.find('.action-btn').click(ev => {
            actionsHUD.find('.action-btn').removeClass('active');
            $(ev.currentTarget).addClass('active');
            self.plan.action = ev.currentTarget.dataset.action;
        });

        const actionPanel = actionsHUD.find('.action-panel');
        const toggleBtn = actionsHUD.find('.action-toggle-btn');
        toggleBtn.click(() => {
            const collapsed = actionPanel.toggleClass('collapsed').hasClass('collapsed');
            toggleBtn.html(`<i class="fas fa-chevron-${collapsed ? 'down' : 'up'}"></i>`);
            toggleBtn.attr('title', collapsed ? 'Show actions' : 'Hide actions');
        });

        actionsHUD.find('.lock-in-btn').click(async (ev) => {
            ev.preventDefault();
            await self.activeToken.document.setFlag(MODULE_ID, "secretPlan", self.plan);
            await self.activeToken.document.setFlag(MODULE_ID, "lastPlannedAt", Date.now());
            ui.notifications.info(`${riderName} locked in their plan!`);
            self.close();
        });
    }

    static onPan() {
        console.log('Chocobo Racing | onPan callback triggered');
        if (CanvasRacingHUD.activeToken) {
            CanvasRacingHUD.updatePosition();
        }
    }

    static _formatAdjustmentKey(adjustment) {
        if (!adjustment) return "adjust-reset";
        const { dx, dy } = adjustment;
        if (dx === 0 && dy === 0) return "adjust-reset";
        if (dx === -1 && dy === -1) return "adjust-nw";
        if (dx === 0 && dy === -1) return "adjust-n";
        if (dx === 1 && dy === -1) return "adjust-ne";
        if (dx === -1 && dy === 0) return "adjust-w";
        if (dx === 1 && dy === 0) return "adjust-e";
        if (dx === -1 && dy === 1) return "adjust-sw";
        if (dx === 0 && dy === 1) return "adjust-s";
        if (dx === 1 && dy === 1) return "adjust-se";
        return "adjust-reset";
    }

    // Note: now using interval-based updates instead of hook; kept for reference

    static updatePosition() {
        if (!this.activeToken) {
            return;
        }
        
        if (!canvas || !canvas.ready) {
            return;
        }

        if (!canvas.tokens.get(this.activeToken.id)) {
            this.close();
            return;
        }
        
        try {
            if (!this.element) return;
            const actionsHUD = this.element.find('.chocobo-canvas-actions');
            const compassHUD = this.element.find('.chocobo-canvas-compass');
            
            if (!actionsHUD.length || !compassHUD.length) {
                return;
            }
            
            // Get grid sizes
            const sizeX = canvas.grid.sizeX || canvas.grid.size;
            const sizeY = canvas.grid.sizeY || canvas.grid.size;
            
            // Get token's world position and convert to viewport coordinates
            const tokenX = this.activeToken.x;
            const tokenY = this.activeToken.y;
            const tokenW = (this.activeToken.w !== undefined) ? this.activeToken.w : (this.activeToken.document.width * sizeX);
            const tokenH = (this.activeToken.h !== undefined) ? this.activeToken.h : (this.activeToken.document.height * sizeY);
            
            // Convert to viewport (screen) coordinates
            const tokenWorldCenter = { x: tokenX + tokenW / 2, y: tokenY };
            const tokenScreenCoords = canvas.clientCoordinatesFromCanvas(tokenWorldCenter);
            
            const actionsLeft = Math.round(tokenScreenCoords.x);
            const desiredTop = Math.round(tokenScreenCoords.y - actionsHUD.outerHeight() - 10);
            const actionsTop = desiredTop < 12 ? Math.round(tokenScreenCoords.y + 12) : desiredTop;
            
            actionsHUD.css({ left: actionsLeft, top: actionsTop });

            // Compass goes over the ghost
            const velocity = RacingData.getVelocity(this.activeToken.document);
            
            let dx = velocity.x;
            let dy = velocity.y;
            if (this.activeToken._previewAdjustment) {
                dx += this.activeToken._previewAdjustment.dx;
                dy += this.activeToken._previewAdjustment.dy;
            }

            const ghostWorldX = tokenX + (dx * sizeX) + (tokenW / 2);
            const ghostWorldY = tokenY + (dy * sizeY) + (tokenH / 2);
            
            const ghostScreenCoords = canvas.clientCoordinatesFromCanvas({ x: ghostWorldX, y: ghostWorldY });
            const compassLeft = Math.round(ghostScreenCoords.x);
            const compassTop = Math.round(ghostScreenCoords.y);
            
            compassHUD.css({ left: compassLeft, top: compassTop });
        } catch (err) {
            console.error('Chocobo Racing | Error in updatePosition:', err);
        }
    }

    static close() {
        if (this._panHookRegistered) {
            Hooks.off('canvasPan', this.onPan);
            this._panHookRegistered = false;
        }
        
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        
        if (this.activeToken) {
            delete this.activeToken._previewAdjustment;
            GhostRenderer.renderGhost(this.activeToken);
            this.activeToken = null;
        }
        console.log('Chocobo Racing | HUD closed');
    }
}

CanvasRacingHUD.activeToken = null;
CanvasRacingHUD.plan = { adjustment: { dx: 0, dy: 0 }, action: "action-none" };
CanvasRacingHUD.element = null;
CanvasRacingHUD._panHookRegistered = false;

class RacingData {
    static _tokenDocument(tokenDoc) {
        return tokenDoc?.getFlag ? tokenDoc : tokenDoc?.document ? tokenDoc.document : null;
    }

    static getRider(tokenDoc) {
        const doc = this._tokenDocument(tokenDoc);
        const riderId = doc?.getFlag(MODULE_ID, "riderId");
        return riderId ? game.actors.get(riderId) : null;
    }

    static getVelocity(tokenDoc) {
        const doc = this._tokenDocument(tokenDoc);
        return doc?.getFlag(MODULE_ID, "velocity") || { x: 0, y: 0 };
    }
    
    static async setVelocity(tokenDoc, x, y) {
        const doc = this._tokenDocument(tokenDoc);
        return doc?.setFlag(MODULE_ID, "velocity", { x, y });
    }
    
    static getMaxStamina(tokenDoc) {
        const doc = this._tokenDocument(tokenDoc);
        return doc?.getFlag(MODULE_ID, "maxStamina") || 5;
    }
    
    static getStamina(tokenDoc) {
        const doc = this._tokenDocument(tokenDoc);
        const max = this.getMaxStamina(doc);
        const current = doc?.getFlag(MODULE_ID, "stamina");
        return current !== undefined ? current : max;
    }
    
    static async setStamina(tokenDoc, value) {
        const doc = this._tokenDocument(tokenDoc);
        return doc?.setFlag(MODULE_ID, "stamina", Math.max(0, value));
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

        const g = token._ghostGraphics;

        if (token.document.getFlag(MODULE_ID, "isTemporaryGhost")) {
            const originalId = token.document.getFlag(MODULE_ID, "ghostOf");
            const original = canvas.tokens.get(originalId);
            if (original) {
                const originalCenter = {
                    x: original.x - token.x + (original.w / 2),
                    y: original.y - token.y + (original.h / 2)
                };
                const ghostCenter = {
                    x: token.w / 2,
                    y: token.h / 2
                };
                g.clear();
                g.lineStyle(3, 0xffffff, 0.65);
                g.moveTo(originalCenter.x, originalCenter.y);
                g.lineTo(ghostCenter.x, ghostCenter.y);
                g.lineStyle(0);

                g.beginFill(0xffffff, 0.35);
                g.drawCircle(ghostCenter.x, ghostCenter.y, 8);
                g.drawCircle(originalCenter.x, originalCenter.y, 4);
                g.endFill();
            }
            this.renderGhostTokenLabel(token);
            return;
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
        
        g.clear();
        // Remove old text children
        g.removeChildren();

        // Determine color based on the first non-GM owner
        const ownerUser = game.users.find(u => !u.isGM && token.document.testUserPermission(u, "OWNER")) || game.user;
        const colorHex = ownerUser.color || "#00FFFF";
        const colorNumeric = foundry.utils.Color.from(colorHex).valueOf();

        // Render the ghost tile preview at the computed destination.
        // This is a visual overlay, not the actual token itself.
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

            const textStyle = { fill: colorHex, fontSize: 32, stroke: 0x000000, strokeThickness: 4, fontWeight: 'bold' };
            const gText = PIXI.VERSION.startsWith('8') ? new PIXI.Text({ text: labelChar, style: textStyle }) : new PIXI.Text(labelChar, textStyle);
            gText.anchor.set(0.5);
            gText.position.set(px + (token.document.width * sizeX)/2, py + (token.document.height * sizeY)/2);
            g.addChild(gText);

            const tText = PIXI.VERSION.startsWith('8') ? new PIXI.Text({ text: labelChar, style: textStyle }) : new PIXI.Text(labelChar, textStyle);
            tText.anchor.set(0.5);
            tText.position.set((token.document.width * sizeX)/2, (token.document.height * sizeY)/2);
            g.addChild(tText);
        }
    }

    static renderGhostTokenLabel(token) {
        const ownerId = token.document.getFlag(MODULE_ID, "ghostOf");
        if (!ownerId) return;

        const original = canvas.tokens.get(ownerId);
        if (!original) return;

        const gridSize = canvas.grid.sizeX || canvas.grid.size;
        const dx = Math.round((token.x - original.x) / gridSize);
        const dy = Math.round((token.y - original.y) / gridSize);
        const label = `Velocity: (${dx}, ${dy})`;

        if (token._velocityText && token._velocityText.parent) {
            token._velocityText.text = label;
        } else {
            const style = {
                fill: '#ffffff',
                fontSize: 14,
                stroke: '#000000',
                strokeThickness: 3,
                fontWeight: 'bold'
            };
            const tokenW = (token.w !== undefined) ? token.w : (token.document.width * gridSize);
            token._velocityText = PIXI.VERSION.startsWith('8') ? new PIXI.Text({ text: label, style }) : new PIXI.Text(label, style);
            token._velocityText.anchor.set(0.5, 1);
            token._velocityText.position.set(tokenW / 2, -8);
            token._velocityText.zIndex = 1000;
            token.sortableChildren = true;
            token.addChild(token._velocityText);
        }
    }
}

Hooks.once("init", () => RacingManager.init());

Hooks.on("refreshToken", (token) => {
    GhostRenderer.renderGhost(token);
});

Hooks.on("renderToken", (token) => {
    GhostRenderer.renderGhost(token);
});

Hooks.on("updateToken", async (scene, tokenDoc, diff, options, userId) => {
    const token = canvas.tokens.get(tokenDoc.id);
    if (!token) return;
    if (token.document.getFlag(MODULE_ID, "isTemporaryGhost")) {
        GhostRenderer.renderGhost(token);
    }
});

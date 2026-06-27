// This uses the Webpack and Patcher modules exposed by mobile mod environments like Bunny/Kettu
const { Webpack, Patcher } = bunny; // or 'vendetta' depending on your build toolchain

// Find critical internal Discord modules
const MessageActions = Webpack.getModule(m => m.sendMessage && m.editMessage);
const ProfileModule = Webpack.getModule(m => m.getUserProfile || m.fetchProfile);
const StreamSettings = Webpack.getModule(m => m.getScreenShareQualityOptions);

// 3y3 Encoding / Decoding constants (Invisible Unicode tags range U+E0000 - U+E007F)
const TAG_START = 0xE0000;

export default {
    onLoad: () => {
        console.log("[NitroAllInOne] Plugin Initialized.");

        // ==========================================
        // FEATURE 1: FAKE EMOJIS & STICKERS
        // ==========================================
        if (MessageActions) {
            Patcher.before(MessageActions, "sendMessage", (ctx, args) => {
                let message = args[1]; // The message content object
                if (!message || !message.content) return;

                // Match custom/animated emojis <:name:id> or <a:name:id>
                const emojiRegex = /<(a?):([a-zA-Z0-9_]+):([0-9]+)>/g;
                
                message.content = message.content.replace(emojiRegex, (match, animated, name, id) => {
                    // Check if the emoji is a server-locked or animated emoji by converting it to a direct CDN link
                    const ext = animated ? "gif" : "png";
                    const cdnUrl = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=48`;
                    
                    // Instead of failing the Nitro check, we pass it along as a standalone high-quality link
                    return cdnUrl;
                });
            });
        }

        // ==========================================
        // FEATURE 2: NITRO THEMES & 3Y3 DECODING
        // ==========================================
        if (ProfileModule) {
            Patcher.after(ProfileModule, "getUserProfile", (ctx, args, response) => {
                if (!response || !response.bio) return;

                // Read invisible data embedded in the user's bio text
                let decodedData = "";
                for (const char of response.bio) {
                    const code = char.codePointAt(0);
                    if (code >= TAG_START && code <= (TAG_START + 127)) {
                        decodedData += String.fromCharCode(code - TAG_START);
                    }
                }

                // If hidden JSON profile colors exist, inject them locally into the client render
                if (decodedData.startsWith("THEME:")) {
                    try {
                        const colors = JSON.parse(decodedData.replace("THEME:", ""));
                        response.themeColors = [colors.primary, colors.secondary]; 
                        response.premiumType = 2; // Artificially flag premium locally to trigger rendering
                    } catch (e) {
                        console.error("[NitroAllInOne] Failed decoding 3y3 theme data", e);
                    }
                }
            });
        }

        // ==========================================
        // FEATURE 3: HIGH-QUALITY STREAMING BYPASS
        // ==========================================
        if (StreamSettings) {
            // Force the resolution/FPS limits to allow 1080p/4k and 60fps options
            Patcher.after(StreamSettings, "getScreenShareQualityOptions", (ctx, args, response) => {
                if (Array.isArray(response)) {
                    response.forEach(option => {
                        option.userPremiumType = 2; // Forces client to treat selection as unlocked
                    });
                }
            });
        }
    },

    onUnload: () => {
        // Clean up all patches gracefully when the plugin is turned off
        Patcher.unpatchAll();
        console.log("[NitroAllInOne] Plugin Stopped. All hooks removed.");
    }
}

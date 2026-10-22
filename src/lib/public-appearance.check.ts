// Self-check of the appearance layers: npx tsx src/lib/public-appearance.check.ts
import assert from "node:assert/strict";
import { cleanLayer, layered, pageAppearance } from "@/lib/public-appearance";

assert.deepEqual(cleanLayer({ publicTransparent: true, publicContentWidth: 0 }), { publicTransparent: true, publicContentWidth: 0 });
assert.deepEqual(cleanLayer({}), {});
assert.deepEqual(cleanLayer({ publicFontFamily: null }), { publicFontFamily: null }); // explicit default stays
assert.equal(cleanLayer({ publicBaseFontSize: 99 }), null);
assert.equal(cleanLayer({ publicTheme: "pink" }), null);

const org = { publicFontFamily: "lato", publicTransparent: false, publicContentWidth: null, publicTheme: "light", appearanceEmbed: { publicTransparent: true, publicContentWidth: 0 }, appearanceRegistration: { publicContentWidth: 800 } };
// Portal on its own: the base only.
assert.equal(pageAppearance(org, "portal", false).publicTransparent, false);
assert.equal(pageAppearance(org, "portal", false).publicContentWidth, null);
// Embedded anywhere: the embed layer on top.
assert.equal(pageAppearance(org, "portal", true).publicTransparent, true);
assert.equal(pageAppearance(org, "registration", true).publicContentWidth, 0);
// Standalone registration page: its own layer; the event wins over both.
assert.equal(pageAppearance(org, "registration", false).publicContentWidth, 800);
assert.equal(pageAppearance(org, "registration", false, { publicContentWidth: 600 }).publicContentWidth, 600);
assert.equal(pageAppearance(org, "registration", true, { publicTransparent: false }).publicTransparent, false);
assert.equal(pageAppearance(org, "registration", false).publicFontFamily, "lato"); // inherited
// The event layer never reaches the portal.
assert.equal(pageAppearance(org, "portal", false, { publicContentWidth: 600 }).publicContentWidth, null);
assert.deepEqual(layered(null, { publicTheme: "dark" }), { publicTheme: "dark" });
console.log("appearance ok");

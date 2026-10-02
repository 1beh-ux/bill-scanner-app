// The body silhouette used to mark an injury (picker, incident detail, parent
// summary PDF): public/body-map/{front,back}.png, 332 x 730 px. Points are
// stored as % of this box (bodyXPct/bodyYPct), so every place draws the image
// in a box of exactly this ratio and puts the dot at the same percentages.
export const BODY_MAP_W = 332;
export const BODY_MAP_H = 730;
export const BODY_MAP_DOT_R = 16;
export const bodyMapSrc = (view: "front" | "back") => `/body-map/${view}.png`;

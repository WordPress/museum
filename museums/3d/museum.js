import { prepareBlueprint } from './playground.js';
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.171.0/build/three.module.min.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.171.0/examples/jsm/loaders/GLTFLoader.js';

const releases = [...window.WP_MUSEUM_RELEASES].sort(compareVersions);
const eras = window.WP_MUSEUM_ERAS;
const activeVariant = getActiveVariant();
const isCurrentVariant = activeVariant.isCurrent;
const shouldDecorateScene = !isCurrentVariant || activeVariant.decor === true;
const eraColors = new Map(
	eras.map((era, index) => [
		era,
		activeVariant.eraColors[index % activeVariant.eraColors.length],
	])
);

const canvas = document.querySelector('#museum-canvas');
const renderer = new THREE.WebGLRenderer({
	canvas,
	antialias: true,
	powerPreference: 'low-power',
	preserveDrawingBuffer: new URLSearchParams(window.location.search).has('debug'),
});
// While the Playground modal covers the scene we free its GPU memory by losing
// the WebGL context; Three re-uploads textures/buffers on restore. Null if the
// browser lacks the extension (then the modal simply keeps the scene resident).
const loseContextExtension = renderer.getContext().getExtension('WEBGL_lose_context');
let webglContextLost = false;
canvas.addEventListener('webglcontextlost', () => { webglContextLost = true; }, false);
canvas.addEventListener('webglcontextrestored', () => { webglContextLost = false; }, false);
const textureCanvases = new Map();
const museumTextures = new Map();
const plaqueImageCache = new Map();
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const modelCache = new Map();
let wapuuTextures = null;
let wapuuWordmarkTexture = null;
const deviceScreenTextures = new Map();
let deferredAssetTaskIndex = 0;
const modelDefinitions = {
	benchCushion: './assets/models/kenney/furniture/benchCushion.glb',
	bookcaseOpenLow: './assets/models/kenney/furniture/bookcaseOpenLow.glb',
	computerScreen: './assets/models/kenney/furniture/computerScreen.glb',
	laptop: './assets/models/kenney/furniture/laptop.glb',
	loungeDesignChair: './assets/models/kenney/furniture/loungeDesignChair.glb',
	loungeDesignSofa: './assets/models/kenney/furniture/loungeDesignSofa.glb',
	plantSmall2: './assets/models/kenney/furniture/plantSmall2.glb',
	pottedPlant: './assets/models/kenney/furniture/pottedPlant.glb',
	radio: './assets/models/kenney/furniture/radio.glb',
	speakerSmall: './assets/models/kenney/furniture/speakerSmall.glb',
	tableCoffee: './assets/models/kenney/furniture/tableCoffee.glb',
	televisionVintage: './assets/models/kenney/furniture/televisionVintage.glb',
	detailAwningWide: './assets/models/kenney/retro-urban/detail-awning-wide.glb',
	detailBench: './assets/models/kenney/retro-urban/detail-bench.glb',
	detailLightSingle: './assets/models/kenney/retro-urban/detail-light-single.glb',
	detailLightTraffic: './assets/models/kenney/retro-urban/detail-light-traffic.glb',
	pallet: './assets/models/kenney/retro-urban/pallet.glb',
	scaffoldingStructure: './assets/models/kenney/retro-urban/scaffolding-structure.glb',
	treeParkLarge: './assets/models/kenney/retro-urban/tree-park-large.glb',
	treeSmall: './assets/models/kenney/retro-urban/tree-small.glb',
	truckGreen: './assets/models/kenney/retro-urban/truck-green.glb',
	borderHigh: './assets/models/kenney/building/border-high.glb',
	columnThin: './assets/models/kenney/building/column-thin.glb',
	doorRotateRoundA: './assets/models/kenney/building/door-rotate-round-a.glb',
	doorRotateSquareA: './assets/models/kenney/building/door-rotate-square-a.glb',
	platingDetailed: './assets/models/kenney/building/plating-detailed.glb',
	stairsOpenShort: './assets/models/kenney/building/stairs-open-short.glb',
	wallDoorwayRound: './assets/models/kenney/building/wall-doorway-round.glb',
};
const museumTextureSources = {
	...(isCurrentVariant
		? {
			// Floors are drawn procedurally as large warm marble slabs.
			ceiling: './assets/textures/ceiling-tiles.jpg',
			roomWall: './assets/textures/wall-marble.jpg',
			shellWall: './assets/textures/wall-marble.jpg',
		}
		: {}),
};
const wapuuTextureSources = [
	{
		name: 'Original Wapuu',
		src: './assets/wapuu/wapuu-original.svg',
	},
	{
		name: 'Superman Wapuu',
		src: './assets/wapuu/variations/wapuu-superman.png',
	},
	{
		name: 'Orbit Wapuu',
		src: './assets/wapuu/variations/wapuu-orbit.png',
	},
];
// Each procedural floor canvas holds a 2x2 block of slabs; this span sets
// the real-world size of that block so individual slabs read ~2.6m.
const floorTileSpan = 5.2;
// Bright warm tint multiplied over the cool marble photo so the walls read
// as light, airy limestone that harmonises with the light polished marble
// floor for a bright, monumental interior.
const wallWarmTint = 0xf4eede;
// The official WordPress logo mark (ring + W), as the five separate paths of the
// canonical asset, reused for the carpet emblem and the Wapuu's held medallion.
// (A single concatenated path mis-rendered the right swoosh over the ring, which
// leaked the inner fill out the bottom-right under either fill rule.)
function wpLogoSvgDataUrl(fill) {
	return (
		'data:image/svg+xml,' +
		encodeURIComponent(
			"<svg viewBox='0 0 122.52 122.523' xmlns='http://www.w3.org/2000/svg'><g fill='" +
				fill +
				"'>" +
				"<path d='m8.708 61.26c0 20.802 12.089 38.779 29.619 47.298l-25.069-68.686c-2.916 6.536-4.55 13.769-4.55 21.388z'/>" +
				"<path d='m96.74 58.608c0-6.495-2.333-10.993-4.334-14.494-2.664-4.329-5.161-7.995-5.161-12.324 0-4.831 3.664-9.328 8.825-9.328.233 0 .454.029.681.042-9.35-8.566-21.807-13.796-35.489-13.796-18.36 0-34.513 9.42-43.91 23.688 1.233.037 2.395.063 3.382.063 5.497 0 14.006-.667 14.006-.667 2.833-.167 3.167 3.994.337 4.329 0 0-2.847.335-6.015.501l19.138 56.925 11.501-34.493-8.188-22.434c-2.83-.166-5.511-.501-5.511-.501-2.832-.166-2.5-4.496.332-4.329 0 0 8.679.667 13.843.667 5.496 0 14.006-.667 14.006-.667 2.835-.167 3.168 3.994.337 4.329 0 0-2.853.335-6.015.501l18.992 56.494 5.242-17.517c2.272-7.269 4.001-12.49 4.001-16.989z'/>" +
				"<path d='m62.184 65.857-15.768 45.819c4.708 1.384 9.687 2.141 14.846 2.141 6.12 0 11.989-1.058 17.452-2.979-.141-.225-.269-.464-.374-.724z'/>" +
				"<path d='m107.376 36.046c.226 1.674.354 3.471.354 5.404 0 5.333-.996 11.328-3.996 18.824l-16.053 46.413c15.624-9.111 26.133-26.038 26.133-45.426.001-9.137-2.333-17.729-6.438-25.215z'/>" +
				"<path d='m61.262 0c-33.779 0-61.262 27.481-61.262 61.26 0 33.783 27.483 61.263 61.262 61.263 33.778 0 61.265-27.48 61.265-61.263-.001-33.779-27.487-61.26-61.265-61.26zm0 119.715c-32.23 0-58.453-26.223-58.453-58.455 0-32.23 26.222-58.451 58.453-58.451 32.229 0 58.45 26.221 58.45 58.451 0 32.232-26.221 58.455-58.45 58.455z'/>" +
				"</g></svg>"
		)
	);
}

// Canvas textures (the ~400 procedural signs, plaques and artwork) dominate GPU
// memory — at full resolution they totalled ~550MB, which blows iOS Safari's
// budget and crashes the tab once enough rooms have rendered. Cap every canvas
// texture's long edge so the resident set stays small. Drawing still happens at
// full resolution and is downscaled into the texture, so text stays crisp.
const MAX_TEXTURE_DIM = 448;

// Loaded image textures (the marble/ceiling JPGs, re-loaded once per repeat
// setting) ship at 1024² — cap them on load too. Drawing happens at full res
// elsewhere; tiled wall/ceiling textures lose nothing at this size.
function loadCappedTexture(source) {
	return textureLoader.load(source, (texture) => {
		const image = texture.image;
		if (!image) {
			return;
		}
		const longEdge = Math.max(image.width, image.height);
		if (longEdge <= MAX_TEXTURE_DIM) {
			return;
		}
		const scale = MAX_TEXTURE_DIM / longEdge;
		const small = document.createElement('canvas');
		small.width = Math.max(1, Math.round(image.width * scale));
		small.height = Math.max(1, Math.round(image.height * scale));
		small.getContext('2d').drawImage(image, 0, 0, small.width, small.height);
		texture.image = small;
		texture.needsUpdate = true;
	});
}

function createCanvasTexture(canvas, maxDim = MAX_TEXTURE_DIM) {
	const longEdge = Math.max(canvas.width, canvas.height);
	if (longEdge <= maxDim) {
		return new THREE.CanvasTexture(canvas);
	}
	const scale = maxDim / longEdge;
	const small = document.createElement('canvas');
	small.width = Math.max(1, Math.round(canvas.width * scale));
	small.height = Math.max(1, Math.round(canvas.height * scale));
	small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
	const texture = new THREE.CanvasTexture(small);
	texture.userData.sourceCanvas = canvas; // kept so async redraws can refresh
	return texture;
}

// Re-run the downscale for textures whose source canvas is drawn asynchronously
// (logo emblems, release plaques that composite a loaded screenshot), then flag
// the upload. For small textures (image === the source canvas) it just flags.
function refreshCanvasTexture(texture) {
	const source = texture.userData && texture.userData.sourceCanvas;
	if (source && texture.image && texture.image !== source) {
		const ctx = texture.image.getContext('2d');
		ctx.clearRect(0, 0, texture.image.width, texture.image.height);
		ctx.drawImage(source, 0, 0, texture.image.width, texture.image.height);
	}
	texture.needsUpdate = true;
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 420);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pickables = [];
const exhibitPositions = [];
const galleryDoorways = [];
// Midpoints of the shop<->gallery passage doorways (shop-wall and gallery-wall
// ends), recorded for the debug overlay / verification.
const shopPassageDoorways = [];
let railButtons = [];
let railItems = [];
let railMode = '';
let railEra = '';
let activeExhibitMarker = null;
const keys = new Set();
const mobileMotion = {
	forward: false,
	back: false,
	left: false,
	right: false,
};
const animatedObjects = [];
const openSourceProjectItems = [
	{ title: 'PHP', note: 'runtime', color: '#7f8cff' },
	{ title: 'MYSQL', note: 'content store', color: '#f29111' },
	{ title: 'MARIADB', note: 'content store', color: '#1f8aa6' },
	{ title: 'APACHE', note: 'http server', color: '#d84f57' },
	{ title: 'NGINX', note: 'http server', color: '#28b463' },
	{ title: 'SQLITE', note: 'playground db', color: '#58a6d6' },
	{ title: 'WASM', note: 'browser php', color: '#8062ff' },
	{ title: 'GUTENBERG', note: 'block editor', color: '#2bb7ff' },
	{ title: 'PLAYGROUND', note: 'wp in browser', color: '#50d890' },
];

const hubApothem = 16.5;
const hubCircumradius = hubApothem / Math.cos(Math.PI / 8);
const hubSideLength = 2 * hubApothem * Math.tan(Math.PI / 8);
const roomWidth = hubSideLength;
const roomDepth = 16;
const wallHeight = 7.35;
// Rooms are flush radial wedges: the 45deg sector between the two radials
// through their octagon vertices. Side walls are shared with neighbours and
// tilt 22.5deg from the room's outward normal, so the room widens from the
// hub-facing inner edge to a wider flat outer (back) wall.
const wedgeHalfAngle = Math.PI / 8;
const wedgeTan = Math.tan(wedgeHalfAngle);
const roomCenterDistance = hubApothem + roomDepth / 2;
const sideHalfWidthAtZ = (z) => (roomCenterDistance + z) * wedgeTan;
const innerHalfWidth = sideHalfWidthAtZ(-roomDepth / 2); // == roomWidth / 2
// The two outer corners are beveled so the wedge reads as a hexagon: each side
// wall stops short of the full corner, and a 45deg chamfer angles in to a
// narrower flat back wall.
const cornerBevel = 4.5;
const spokeEndZ = roomDepth / 2 - cornerBevel;
const sideEndHalfWidth = sideHalfWidthAtZ(spokeEndZ);
const backFlatHalf = sideEndHalfWidth - cornerBevel;
const backWallWidth = backFlatHalf * 2;
const wallThickness = 0.26;
const roomDoorHalfWidth = 2.9;
const exhibitMountOffset = wallThickness / 2 + 0.035;
const exhibitFrameDepth = 0.13;
const exhibitPlaqueRecess = 0.065;
const exhibitOuterWidth = 2.72;
const exhibitOuterHeight = 2.2;
const exhibitPlaqueWidth = 2.42;
const exhibitPlaqueHeight = 1.9;
// Shared size + mount height for the Blogging Roots era-decoration panels
// (web-safe palette, link buttons, under construction, browser wars and the
// Google/Yahoo screenshots) so they read as one uniform set, vertically
// aligned with the release plaques (which mount at y=2.05).
const eraPanelArtW = 1.6;
const eraPanelArtH = 1.2;
const eraPanelY = 2.05;
const exhibitWallMargin = 0.7;
const entryDistanceFromCenter = 5.2;
const shellPadding = 1.4;
const shellHeight = 12.4;
const portalDoorHeight = 4.2;
const portalDoorHalfWidth = 1.55;
const portalCenterOffset = 3.1;
const portalAlcoveHalfWidth = 1.55;
const portalAlcoveDepth = 4.4;
const mercantileUrl = 'https://mercantile.wordpress.org/';
const wordpressOrgUrl = 'https://wordpress.org/';
// Two doorways flank the central pier on the mural wall: enter from
// wordpress.org on the left, exit through the Mercantile gift shop on the
// right. Each opens a short themed alcove with a clickable door.
const muralPortals = [
	{
		offset: -portalCenterOffset,
		kind: 'entrance',
		title: 'WELCOME',
		sub: 'Powered by wordpress.org',
		url: wordpressOrgUrl,
		runner: 0x2c6fae,
		door: 0x1f6fb0,
		accent: 0x8fd0ff,
	},
	{
		offset: portalCenterOffset,
		kind: 'exit',
		title: 'EXIT',
		sub: 'Mercantile · Gift Shop',
		url: mercantileUrl,
		runner: 0xc24a2c,
		door: 0xd45a39,
		accent: 0xffd166,
	},
];
// The exit portal opens (through its back archway) into a small physical
// Mercantile gift shop the visitor can walk into. The shop is centered on the
// exit alcove's x so the connecting passage lines up, and sits entirely beyond
// the alcove's end wall (further +z) so it never overlaps the entrance alcove
// or the rotunda.
const shopCenterX = portalCenterOffset;
const shopWidth = 10;
const shopDepth = 8;
const shopHeight = 5.4;
const shopWallThickness = 0.3;
const shopZStart = hubApothem + portalAlcoveDepth + 0.1; // just past the alcove end wall
const shopZEnd = shopZStart + shopDepth;
const shopCenterZ = (shopZStart + shopZEnd) / 2;
const shopMinX = shopCenterX - shopWidth / 2;
const shopMaxX = shopCenterX + shopWidth / 2;
// The walk-through doorway joining the exit alcove to the shop spans this gap.
const shopDoorHalfWidth = portalAlcoveHalfWidth - 0.05;
const shopDoorHeight = portalDoorHeight - 0.2;
// Two short side passages make the museum loop-walkable: from the shop's left
// wall to the Blogging Roots gallery (eras[0]) and from its right wall to the
// Blocks Everywhere gallery (eras[6]). Each gallery's shop-facing spoke gets a
// doorway at this local z (matching the connector pattern), and a flat-roofed
// rectangular passage bridges the world-z band below across the void to a
// matching doorway in the shop side wall. The shop is offset (+x), so the left
// passage is long (~7m) and the right one a short vestibule (~2m).
const shopPassageDoorZ = -2.0; // gallery spoke local z of the passage doorway
const shopPassageDoorHalfWidth = 0.9; // 1.8m clear opening
const shopPassageDoorHeight = 2.7;
const shopPassageHeight = 3.4; // passage interior / ceiling height
const shopPassageZCenter = 22.5; // world z the passage and both doorways share
const shopPassageHalfDepth = 1.0; // world-z half-span; covers the tilted opening
const walkSpeed = 7.2;
const arrowWalkSpeed = 9.2;
const mobileWalkSpeed = 8.8;
const sprintSpeed = 12;
const keyboardTurnSpeed = 520;
const mobileTurnSpeed = 320;
const maxMovementStep = 0.16;
const hubSides = createHubSides();
const muralSide = hubSides.find((side) => side.kind === 'mural');
const roomSides = hubSides.filter((side) => side.era);
const roomLayout = new Map(roomSides.map((side) => [side.era, side]));
// Adjacent galleries share a radial wall; a doorway through it, set back toward
// the hub on the straight part of the wall, links them chronologically.
const connectorDoorHalfWidth = 1.0;
const connectorDoorHeight = 3.0;
const connectorDoorZ = -2.5;
// Side-wall exhibits flank the mid doorway: the BACK segment runs from the
// doorway to the beveled corner, the small FRONT segment from the hub-facing
// inner edge to the doorway (the door sits near the hub, so it's tight).
const sideExhibitMinZ = connectorDoorZ + connectorDoorHalfWidth + exhibitOuterWidth / 2 + 0.3;
const sideExhibitMaxZ = spokeEndZ - exhibitOuterWidth / 2 - 0.3;
const sideExhibitFrontMinZ = -roomDepth / 2 + exhibitOuterWidth / 2 + 1.0;
const sideExhibitFrontMaxZ = connectorDoorZ - connectorDoorHalfWidth - exhibitOuterWidth / 2 - 0.3;
const galleryConnections = computeGalleryConnections();
// The Playground annex: a small enclosed room reached through a doorway cut into
// the BACK-CORNER (right-hand) chamfer of Blocks Everywhere (eras[6], the newest
// era). A double pun on WordPress Playground (run WP in the browser, ~2022) and a
// literal children's playground. It sits in the open area east/south-east of the
// gallery; the gallery is rotated 135deg, so this chamfer is the axis-aligned plane
// at world x=playgroundDoorWallX facing +x, and the annex is axis-aligned beyond it.
const playgroundRoom = roomLayout.get(eras[6]);
const playgroundChamferA = playgroundRoom
	? roomLocalToWorld(playgroundRoom, new THREE.Vector3(sideEndHalfWidth, 0, spokeEndZ))
	: new THREE.Vector3();
const playgroundChamferB = playgroundRoom
	? roomLocalToWorld(playgroundRoom, new THREE.Vector3(backFlatHalf, 0, roomDepth / 2))
	: new THREE.Vector3();
const playgroundDoorWallX = playgroundChamferA.x; // shared west wall / chamfer plane
const playgroundChamferZMin = Math.min(playgroundChamferA.z, playgroundChamferB.z);
const playgroundChamferZMax = Math.max(playgroundChamferA.z, playgroundChamferB.z);
const playgroundDoorZCenter = (playgroundChamferZMin + playgroundChamferZMax) / 2;
const playgroundDoorHalfWidth = 1.0; // 2m clear opening
const playgroundDoorHeight = 3.0;
const playgroundWallThickness = 0.3;
const playgroundWidth = 12.5; // z-extent (south from the gallery corner); expanded for room
const playgroundDepth = 12.5; // x-extent, east from the chamfer wall; expanded for room
const playgroundHeight = wallHeight;
// The Block Editor gallery (eras[5]) fills the area just NW of the chamfer top
// (its left corner reaches world x=28, z~11.6), so the annex starts a little south
// of that corner and runs +z; the doorway sits at the chamfer midpoint near the
// annex's north wall.
const playgroundMinZ = playgroundChamferZMin + 0.5;
const playgroundMaxZ = playgroundMinZ + playgroundWidth;
const playgroundMinX = playgroundDoorWallX; // west wall, flush with the chamfer
const playgroundMaxX = playgroundDoorWallX + playgroundDepth;
const playgroundCenterX = (playgroundMinX + playgroundMaxX) / 2;
const playgroundCenterZ = (playgroundMinZ + playgroundMaxZ) / 2;
const atriumCenterPosition = new THREE.Vector3(0, 1.65, 0);
const atriumStartPosition = atriumCenterPosition
	.clone()
	.add(muralSide.normal.clone().multiplyScalar(-entryDistanceFromCenter));
// ── Era side-room annexes ─────────────────────────────────────────────────
// Every era gallery except Blocks Everywhere (which already opens onto the
// Playground) gains a small enclosed themed side room, reached through a doorway
// cut into its RIGHT back-corner chamfer — the same relative spot as the
// Playground's door. Each annex is authored in a local frame whose +z points out
// through the chamfer (away from the gallery) and +x runs along the chamfer, so a
// single generic builder serves every wedge regardless of how it is rotated.
const annexDoorHalfWidth = 1.0; // 2m clear opening, matching the Playground
const annexDoorHeight = 3.0;
const annexWallThickness = 0.3;
const annexHeight = wallHeight;
const annexChamferHalfLen = (cornerBevel * Math.SQRT2) / 2; // ≈3.18, half the bevel
// Local (room-frame) midpoint of the right chamfer = the doorway centre.
const annexChamferLocalMid = new THREE.Vector3(
	sideEndHalfWidth - cornerBevel / 2,
	0,
	spokeEndZ + cornerBevel / 2
);
// Each config: which gallery, the destination sign + accent, room palette, and
// the forward depth + sideways span [sMin, sMax] (relative to the door centre,
// which sits at local x = 0). sMin/sMax must bracket the chamfer (±annexChamferHalfLen)
// so the doored wall fully backs the gallery's beveled corner. `build(ctx)` adds
// the themed contents in the annex local frame. Configs are appended per room.
const ERA_ANNEX_CONFIGS = [
	{
		era: eras[5], // VI · Block Editor → Classic Editor period room
		title: 'CLASSIC EDITOR',
		accent: '#d8b24a',
		glow: 0xffcf6a,
		floorColor: 0x7a5a32,
		wallColor: 0x6f5740,
		ceilingColor: 0x39291a,
		light: 0xffe6b0,
		depth: 10,
		width: 10,
		build: buildClassicEditorAnnex,
	},
	{
		era: eras[4], // V · API & Customizer → REST API server room
		title: '/WP-JSON',
		accent: '#46e0d2',
		glow: 0x46e0d2,
		floorColor: 0x2b3037,
		wallColor: 0x3b434c,
		ceilingColor: 0x12161b,
		light: 0xbfe6ff,
		depth: 10,
		width: 10,
		build: buildServerRoomAnnex,
	},
	{
		era: eras[3], // IV · Modern Admin → responsive device lab
		title: 'RESPONSIVE',
		accent: '#00a0d2',
		glow: 0x35c0f0,
		floorColor: 0x9aa2ab,
		wallColor: 0xd4dade,
		ceilingColor: 0x3a4047,
		light: 0xffffff,
		depth: 10,
		width: 10,
		build: buildDeviceLabAnnex,
	},
	{
		era: eras[2], // III · CMS Toolkit → default-themes gallery
		title: 'THEME GALLERY',
		accent: '#e0bd62',
		glow: 0xffcf6a,
		floorColor: 0x6b4a2c,
		wallColor: 0x5e3036,
		ceilingColor: 0xe7dcc4,
		light: 0xfff0d8,
		depth: 10,
		width: 10,
		build: buildThemeGalleryAnnex,
	},
	{
		era: eras[1], // II · Dashboard Foundations → WordCamp community hall
		title: 'WORDCAMP',
		accent: '#3a9bc8',
		glow: 0x3a9bc8,
		floorColor: 0x70522f,
		wallColor: 0xcdc0a2,
		ceilingColor: 0x2f2a22,
		light: 0xfff1d6,
		depth: 10.5,
		width: 10,
		build: buildWordCampAnnex,
	},
	{
		era: eras[0], // I · Blogging Roots → the origins / forge room
		title: 'THE FORGE',
		accent: '#e0913f',
		glow: 0xff9a3a,
		floorColor: 0x6b5236,
		wallColor: 0x5a4632,
		ceilingColor: 0x281e14,
		light: 0xffd9a0,
		depth: 10,
		width: 10,
		build: buildForgeAnnex,
	},
];
const eraAnnexes = computeEraAnnexes();
const eraAnnexEras = new Set(eraAnnexes.map((annex) => annex.config.era));
const museumBounds = getMuseumBounds();
const cameraBounds = {
	minX: museumBounds.minX - 1.5,
	maxX: museumBounds.maxX + 1.5,
	minZ: museumBounds.minZ - 1.5,
	maxZ: museumBounds.maxZ + 1.5,
};
const movementZones = roomSides;
let activeIndex = 0;
let atCenter = true; // true while parked at the rotunda centre, not on a release
let inMercantileShop = false; // true while the visitor stands in the gift shop
let guidedTarget = null;
let guidedTour = false;
let tourHoldUntil = 0;
const guidedFlightY = 1.65; // flat flights at eye level, matching the stands
const guidedFlightSpeed = 11; // m/s base; long hops scale up (guidedFlightSpeedFor)
const guidedFlightAccel = 16; // m/s² ease-in/out and braking into corners
const guidedCornerRadius = 3.0; // arc radius; wide, gentle turns (audited envelope)
let yaw = Math.PI;
let pitch = 0;
let dragging = false;
let dragMoved = false;
let lastPointer = { x: 0, y: 0 };
let programmaticRailScroll = false;
let programmaticRailScrollTimer = 0;
let railScrollFrame = 0;
let renderedFrameCount = 0;
let eraYearRangeMap = null;
// Light culling state (declared before the init/animate call below to avoid a
// temporal-dead-zone error on the first frame).
const MAX_ACTIVE_POINT_LIGHTS = 14;
let cullablePointLights = null;
const lightCullTmp = new THREE.Vector3();
// Developer stats overlay (shown when the URL has ?debug).
let debugPanelEl = null;
let debugPanelVisible = false;
let fpsSmoothed = 0;
let debugPanelTimer = 0;
let vramLiveMB = 0;
let vramMaxMB = 0;
let vramComputed = false;
let vramRecalcTicks = 0;
// Distant-room texture residency (frees far galleries' big textures).
let roomTextureGroups = null;
const residencyFrustum = new THREE.Frustum();
const residencyMatrix = new THREE.Matrix4();
const residencySphere = new THREE.Sphere();
let residencyTimer = 0;

camera.rotation.order = 'YXZ';
camera.position.copy(atriumStartPosition);
setCameraRotation();

initRenderer();
buildScene();
buildRail();
bindControls();
startAtMuseumCenter();
applyReleaseDeepLink();
initDebugApi();
animate();

function initRenderer() {
	applyVariantUi();
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = isCurrentVariant ? 0.86 : 1;
	scene.background = new THREE.Color(activeVariant.scene.background);
	scene.fog = new THREE.Fog(
		activeVariant.scene.fog,
		isCurrentVariant ? 38 : 52,
		isCurrentVariant ? 105 : 118
	);

	scene.add(
		new THREE.HemisphereLight(
			activeVariant.scene.hemiSky,
			activeVariant.scene.hemiGround,
			activeVariant.scene.hemiIntensity
		)
	);
	scene.add(new THREE.AmbientLight(0xe8edff, isCurrentVariant ? 0.49 : 0.72));
	const keyLight = new THREE.DirectionalLight(0xffe2b0, 2.8);
	keyLight.intensity = activeVariant.scene.keyIntensity * (isCurrentVariant ? 0.92 : 1);
	keyLight.position.set(2, 8, -6);
	scene.add(keyLight);

	window.addEventListener('resize', resizeRenderer);
	resizeRenderer();
}

function getActiveVariant() {
	const variants = window.WP_MUSEUM_VARIANTS || [];
	const current = variants.find((variant) => variant.slug === 'current') || {
		slug: 'current',
		name: 'Current Museum',
		kicker: 'Plain Three.js prototype',
		isCurrent: true,
		uiStyle: 'glass',
		textureStyle: 'current',
		frameStyle: 'classic',
		props: [],
		scene: {
			background: '#151a2a',
			fog: '#151a2a',
			hemiSky: '#fff7df',
			hemiGround: '#2d3a58',
			hemiIntensity: 3.1,
			keyIntensity: 2.8,
		},
		eraColors: [
			'#ffd166',
			'#ff4f64',
			'#2bb7ff',
			'#50d890',
			'#b37cff',
			'#ff9b54',
			'#78e0dc',
		],
		wall: ['#cbd7e7', '#9fb1c9', '#f3f0dd'],
		floor: ['#2f3f5f', '#1f2b44', '#ffcf6a'],
		ceiling: ['#d5dde8', '#97a8bf', '#ffffff'],
	};
	const slug = new URLSearchParams(window.location.search).get('variant');
	return variants.find((variant) => variant.slug === slug) || current;
}

function applyVariantUi() {
	document.body.dataset.variant = activeVariant.slug;
	document.body.dataset.ui = activeVariant.uiStyle || 'glass';
	document.documentElement.style.setProperty(
		'--accent',
		activeVariant.eraColors[0]
	);
	document.documentElement.style.setProperty(
		'--danger',
		activeVariant.eraColors[1]
	);
	document.documentElement.style.setProperty(
		'--variant-panel',
		getPanelBackground()
	);
	document.querySelector('.kicker').textContent = activeVariant.kicker;
	document.title = isCurrentVariant
		? 'WordPress Museum - Three.js Gallery'
		: `${activeVariant.name} - WordPress Museum`;
}

function getPanelBackground() {
	if (isCurrentVariant) {
		return 'rgba(17, 24, 39, 0.74)';
	}
	return activeVariant.uiStyle === 'paper'
		? 'rgba(245, 232, 199, 0.9)'
		: activeVariant.uiStyle === 'terminal'
			? 'rgba(0, 24, 18, 0.86)'
			: activeVariant.uiStyle === 'brutalist'
				? 'rgba(28, 28, 26, 0.88)'
				: 'rgba(17, 24, 39, 0.72)';
}

function buildScene() {
	const root = new THREE.Group();
	scene.add(root);

	root.add(createBuildingShell());
	root.add(createAtrium());
	activeExhibitMarker = createActiveExhibitMarker();
	root.add(activeExhibitMarker);
	getEraReleaseGroups().forEach(({ era, items }) => {
		const roomSide = roomLayout.get(era);
		const color = eraColors.get(era);
		const room = {
			era,
			color,
			yearRange: getReleaseYearRange(items),
			...roomSide,
		};
		root.add(createRoom(room));
		createExhibitSlots(room, items.length).forEach((slot, slotIndex) => {
			const { release, index } = items[slotIndex];
			exhibitPositions[index] = {
				card: slot.position.clone(),
				era,
				stand: slot.position
					.clone()
					.add(slot.normal.clone().multiplyScalar(5.6)),
				color,
				normal: slot.normal.clone(),
				rotationY: slot.rotationY,
			};
			exhibitPositions[index].stand.y = 1.65;
			root.add(createExhibit(release, index, slot, color));
		});
	});
	// Shared radial spokes (the room side walls) are structural — always built,
	// so rooms stay enclosed in every variant.
	root.add(createRadialSpokes());
	// Carpet threading the side doorways, shop passages and Playground annex.
	root.add(createDoorwayCarpetRunners());
	// In-room runners joining each gallery's two doorways into a continuous ring.
	root.add(createRingCarpetRunners());
}

function getReleaseYearRange(items) {
	const years = items.map(({ release }) => release.year);
	const minYear = Math.min(...years);
	const maxYear = Math.max(...years);
	return minYear === maxYear ? `${minYear}` : `${minYear}-${maxYear}`;
}

function getEraYearRange(era) {
	if (!eraYearRangeMap) {
		eraYearRangeMap = new Map(
			getEraReleaseGroups().map(({ era: name, items }) => [name, getReleaseYearRange(items)])
		);
	}
	return eraYearRangeMap.get(era) || '';
}

function createBuildingShell() {
	const group = new THREE.Group();
	const bounds = getShellBounds();
	const width = bounds.maxX - bounds.minX;
	const depth = bounds.maxZ - bounds.minZ;
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;

	group.add(createShellWall(centerX, bounds.minZ, width, true));
	group.add(createShellWall(centerX, bounds.maxZ, width, true));
	group.add(createShellWall(bounds.minX, centerZ, depth, false));
	group.add(createShellWall(bounds.maxX, centerZ, depth, false));
	group.add(createCeiling(bounds));
	group.add(createCeilingDetails(bounds));
	if (isCurrentVariant) {
		group.add(createMuralPortals());
	}
	return group;
}

function createMuralPortals() {
	const group = new THREE.Group();
	for (const portal of muralPortals) {
		group.add(createPortalAlcove(portal));
	}
	group.add(createMercantileShop());
	group.add(createShopGalleryPassages());
	group.add(createPlaygroundAnnex());
	group.add(createEraAnnexes());
	return group;
}

function createPortalAlcove(portal) {
	const group = new THREE.Group();
	const zStart = hubApothem;
	const zEnd = hubApothem + portalAlcoveDepth;
	const centerZ = (zStart + zEnd) / 2;
	const cx = portal.offset;
	const width = portalAlcoveHalfWidth * 2;
	const height = portalDoorHeight + 0.42;

	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(width, portalAlcoveDepth),
		createMuseumMaterial('roomFloor', {
			repeatX: width / floorTileSpan,
			repeatY: portalAlcoveDepth / floorTileSpan,
			roughness: 0.26,
			metalness: 0.3,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(cx, 0.015, centerZ);
	group.add(floor);

	const runner = new THREE.Mesh(
		new THREE.PlaneGeometry(width * 0.5, portalAlcoveDepth - 0.4),
		new THREE.MeshBasicMaterial({ color: portal.runner, transparent: true, opacity: 0.85, depthWrite: false })
	);
	runner.rotation.x = -Math.PI / 2;
	runner.position.set(cx, 0.06, centerZ);
	group.add(runner);

	const wallMaterial = createMuseumMaterial('roomWall', {
		repeatX: portalAlcoveDepth / 4.6,
		repeatY: height / 2.4,
		color: wallWarmTint,
		roughness: 0.9,
		metalness: 0.03,
	});
	for (const sideSign of [-1, 1]) {
		const wall = new THREE.Mesh(
			new THREE.BoxGeometry(wallThickness, height, portalAlcoveDepth),
			wallMaterial
		);
		wall.position.set(cx + sideSign * (portalAlcoveHalfWidth + wallThickness / 2), height / 2, centerZ);
		group.add(wall);
	}

	const ceiling = new THREE.Mesh(
		new THREE.PlaneGeometry(width + wallThickness * 2, portalAlcoveDepth),
		new THREE.MeshBasicMaterial({
			map: createMuseumTexture('ceiling', (width + wallThickness * 2) / 4, portalAlcoveDepth / 4),
			side: THREE.DoubleSide,
		})
	);
	ceiling.rotation.x = Math.PI / 2;
	ceiling.position.set(cx, height, centerZ);
	group.add(ceiling);

	const beam = new THREE.Mesh(
		new THREE.BoxGeometry(width + 0.16, 0.13, 0.16),
		new THREE.MeshStandardMaterial({ color: 0xf2cf86, emissive: 0x3a2710, emissiveIntensity: 0.12, roughness: 0.3, metalness: 0.5 })
	);
	beam.position.set(cx, height - 0.07, centerZ);
	group.add(beam);
	const bulb = new THREE.Mesh(
		new THREE.SphereGeometry(0.12, 16, 12),
		new THREE.MeshBasicMaterial({ color: 0xffefb4 })
	);
	bulb.position.set(cx, height - 0.3, centerZ);
	group.add(bulb);
	const lamp = new THREE.PointLight(0xffe6b0, 0.95, 8.5);
	lamp.position.set(cx, height - 0.4, centerZ);
	registerAnimation(lamp, (object, elapsed) => {
		object.intensity = 0.82 + Math.sin(elapsed * 1.5) * 0.1;
	});
	group.add(lamp);

	group.add(createPortalEndWall(portal, cx, zEnd, height));
	group.add(createPortalContent(portal, cx, zStart, zEnd));
	return group;
}

function createPortalEndWall(portal, cx, zEnd, height) {
	// The exit alcove opens through its back wall into the walkable gift shop,
	// so it gets an open doorway instead of the entrance's closed clickable door.
	if (portal.kind === 'exit') {
		return createShopDoorway(cx, zEnd, height);
	}
	const group = new THREE.Group();
	const wallMaterial = createMuseumMaterial('roomWall', {
		repeatX: portalAlcoveHalfWidth,
		repeatY: height / 2.4,
		color: wallWarmTint,
	});
	const wall = new THREE.Mesh(
		new THREE.BoxGeometry(portalAlcoveHalfWidth * 2 + wallThickness * 2, height, wallThickness),
		wallMaterial
	);
	wall.position.set(cx, height / 2, zEnd + wallThickness / 2);
	group.add(wall);

	const archMaterial = new THREE.MeshStandardMaterial({
		color: 0xf5d088,
		emissive: 0x4a2810,
		emissiveIntensity: 0.32,
		roughness: 0.32,
		metalness: 0.46,
	});
	const archWidth = portalAlcoveHalfWidth * 1.74;
	const archHeight = height * 0.84;
	const archFrame = new THREE.Mesh(new THREE.BoxGeometry(archWidth + 0.3, 0.2, 0.46), archMaterial);
	archFrame.position.set(cx, archHeight + 0.18, zEnd - 0.08);
	group.add(archFrame);
	for (const xSign of [-1, 1]) {
		const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, archHeight + 0.38, 0.4), archMaterial);
		post.position.set(cx + xSign * (archWidth / 2 + 0.1), (archHeight + 0.38) / 2, zEnd - 0.08);
		group.add(post);
	}

	// A real, closed museum door: a painted slab with recessed panels, a brass
	// kick plate and a push handle. We view the entrance from inside the museum,
	// so it carries a NO-ENTRY sign rather than an inviting poster.
	const doorCenterZ = zEnd - 0.14;
	const faceZ = doorCenterZ - 0.08; // front face, toward the rotunda
	const slabMat = new THREE.MeshStandardMaterial({ color: 0x6e4426, roughness: 0.62, metalness: 0.05 });
	const panelMat = new THREE.MeshStandardMaterial({ color: 0x593318, roughness: 0.66, metalness: 0.04 });
	const brass = new THREE.MeshStandardMaterial({ color: 0xcaa24a, roughness: 0.3, metalness: 0.7 });

	const door = new THREE.Mesh(new THREE.BoxGeometry(archWidth, archHeight, 0.16), slabMat);
	door.position.set(cx, archHeight / 2 + 0.05, doorCenterZ);
	door.userData.portalUrl = portal.url;
	group.add(door);
	pickables.push(door);

	// Two columns by two rows of raised panels (classic six-/four-panel look).
	const panelW = (archWidth - 0.54) / 2;
	const colDx = panelW / 2 + 0.09;
	for (const dx of [-colDx, colDx]) {
		for (const [panelY, panelH] of [[0.95, 1.4], [2.82, 1.9]]) {
			const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, 0.06), panelMat);
			panel.position.set(cx + dx, panelY, faceZ - 0.02);
			group.add(panel);
		}
	}

	// Brass kick plate and a vertical push handle on the latch side.
	const kick = new THREE.Mesh(new THREE.BoxGeometry(archWidth - 0.1, 0.42, 0.03), brass);
	kick.position.set(cx, 0.3, faceZ - 0.02);
	group.add(kick);
	const handleX = cx + archWidth / 2 - 0.3;
	const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.1, 12), brass);
	handle.position.set(handleX, archHeight / 2, faceZ - 0.08);
	group.add(handle);
	for (const hy of [archHeight / 2 - 0.52, archHeight / 2 + 0.52]) {
		const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10), brass);
		mount.rotation.x = Math.PI / 2;
		mount.position.set(handleX, hy, faceZ - 0.05);
		group.add(mount);
	}

	// A "NO EXIT" sign (🚫 + label). This is the entrance, viewed from inside, so
	// visitors leave through the gift shop rather than back out here.
	const noExit = createReadableLabel(createNoExitTexture(), 1.0, 1.22);
	noExit.position.set(cx, archHeight * 0.55, faceZ - 0.05);
	group.add(noExit);

	// A soft warm light so the doorway reads, without the old portal glow.
	const doorLight = new THREE.PointLight(0xffe6b8, 0.7, 7);
	doorLight.position.set(cx, archHeight / 2 + 0.3, zEnd - 1.4);
	registerAnimation(doorLight, (object, elapsed) => {
		object.intensity = 0.62 + Math.sin(elapsed * 1.05) * 0.1;
	});
	group.add(doorLight);

	return group;
}

// A flat "NO EXIT" sign texture: the round 🚫 prohibition mark (white disc, bold
// red ring and diagonal bar) over a red "NO EXIT" label, on transparent.
function createNoExitTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 384;
	canvas.height = 470;
	const ctx = canvas.getContext('2d');
	const cx = 192;
	const cy = 172;
	const r = 116;
	ctx.fillStyle = '#f6f6f4';
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = '#c62828';
	ctx.lineWidth = 34;
	ctx.beginPath();
	ctx.arc(cx, cy, r - 20, 0, Math.PI * 2);
	ctx.stroke();
	ctx.lineCap = 'butt';
	const s = (r - 38) * Math.SQRT1_2;
	ctx.beginPath();
	ctx.moveTo(cx - s, cy - s);
	ctx.lineTo(cx + s, cy + s);
	ctx.stroke();
	ctx.fillStyle = '#f6f6f4';
	roundRectPath(ctx, cx - 130, 366, 260, 76, 12);
	ctx.fill();
	ctx.lineWidth = 6;
	roundRectPath(ctx, cx - 130, 366, 260, 76, 12);
	ctx.stroke();
	ctx.fillStyle = '#c62828';
	ctx.font = '900 54px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('NO EXIT', cx, 406);
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

// An L of golden stanchions with a red velvet rope, roping off the entrance the
// visitor arrived through and nudging them on toward the galleries.
function createEntranceStanchions(cx, zStart) {
	const mouthZ = zStart - 0.3;
	// An L that guides someone entering through the door (facing the rotunda, −z)
	// first FORWARD out of the alcove, then LEFT across the Start Here approach.
	const points = [
		{ x: cx + 1.5, z: mouthZ },
		{ x: cx + 1.5, z: mouthZ - 1.4 },
		{ x: cx + 1.5, z: mouthZ - 2.8 },
		{ x: cx + 0.1, z: mouthZ - 2.8 },
		{ x: cx - 1.3, z: mouthZ - 2.8 },
	];
	return createMuseumRopeLine(points, 0xa01828, { postHeight: 0.92, ropeY: 0.86, sag: 0.2 });
}

// The back of the exit alcove: a brass-framed open doorway (lintel + posts, no
// door slab) leading into the gift shop. The flanking wall segments fill the
// rest of the alcove's back so the shop stays enclosed.
function createShopDoorway(cx, zEnd, height) {
	const group = new THREE.Group();
	const wallMaterial = createMuseumMaterial('roomWall', {
		repeatX: portalAlcoveHalfWidth,
		repeatY: height / 2.4,
		color: wallWarmTint,
	});
	const totalWidth = portalAlcoveHalfWidth * 2 + wallThickness * 2;
	const openW = shopDoorHalfWidth * 2;

	// Lintel above the opening.
	const lintelH = height - shopDoorHeight;
	const lintel = new THREE.Mesh(
		new THREE.BoxGeometry(totalWidth, lintelH, wallThickness),
		wallMaterial
	);
	lintel.position.set(cx, shopDoorHeight + lintelH / 2, zEnd + wallThickness / 2);
	group.add(lintel);

	// Narrow jambs flanking the opening (the opening nearly spans the alcove,
	// so these are slim).
	const jambW = (totalWidth - openW) / 2;
	if (jambW > 0.02) {
		for (const xSign of [-1, 1]) {
			const jamb = new THREE.Mesh(
				new THREE.BoxGeometry(jambW, shopDoorHeight, wallThickness),
				wallMaterial
			);
			jamb.position.set(
				cx + xSign * (openW / 2 + jambW / 2),
				shopDoorHeight / 2,
				zEnd + wallThickness / 2
			);
			group.add(jamb);
		}
	}

	// Brass archway around the opening.
	const archMaterial = new THREE.MeshStandardMaterial({
		color: 0xf5d088,
		emissive: 0x4a2810,
		emissiveIntensity: 0.32,
		roughness: 0.32,
		metalness: 0.46,
	});
	const archFrame = new THREE.Mesh(new THREE.BoxGeometry(openW + 0.36, 0.2, 0.46), archMaterial);
	archFrame.position.set(cx, shopDoorHeight + 0.06, zEnd - 0.06);
	group.add(archFrame);
	for (const xSign of [-1, 1]) {
		const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, shopDoorHeight + 0.16, 0.4), archMaterial);
		post.position.set(cx + xSign * (openW / 2 + 0.09), (shopDoorHeight + 0.16) / 2, zEnd - 0.06);
		group.add(post);
	}

	// Header sign above the doorway, visible from the alcove.
	const sign = createReadableLabel(createMercantileSignTexture('MERCANTILE', 'GIFT SHOP — THIS WAY'), 2.1, 0.7);
	sign.position.set(cx, shopDoorHeight + lintelH * 0.55, zEnd - 0.16);
	group.add(sign);

	// Warm spill light at the threshold so the shop reads as inviting.
	const glow = new THREE.PointLight(0xffd98a, 0.8, 7);
	glow.position.set(cx, shopDoorHeight * 0.6, zEnd + 0.4);
	registerAnimation(glow, (object, elapsed) => {
		object.intensity = 0.7 + Math.sin(elapsed * 1.1) * 0.12;
	});
	group.add(glow);
	return group;
}

function createPortalContent(portal, cx, zStart, zEnd) {
	const group = new THREE.Group();
	// Poster on the outer side wall of the alcove.
	const sideSign = portal.kind === 'exit' ? 1 : -1;
	const poster = new THREE.Mesh(
		new THREE.PlaneGeometry(portalAlcoveDepth - 1.6, 1.5),
		new THREE.MeshBasicMaterial({ map: createPortalPosterTexture(portal), transparent: true })
	);
	poster.position.set(cx + sideSign * (portalAlcoveHalfWidth - 0.03), 2.4, (zStart + zEnd) / 2);
	poster.rotation.y = sideSign === 1 ? -Math.PI / 2 : Math.PI / 2;
	group.add(poster);

	if (portal.kind === 'exit') {
		group.add(createGiftShopShelf(cx, zStart, zEnd));
	} else {
		group.add(createEntranceStanchions(cx, zStart));
	}
	return group;
}

function createGiftShopShelf(cx, zStart, zEnd) {
	const group = new THREE.Group();
	const shelfMat = new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.64 });
	const items = [
		{ z: zStart + 1.5, color: 0xffd166, label: 'TEE' },
		{ z: zStart + 2.85, color: 0x2bb7ff, label: 'PIN' },
	];
	const x = cx - (portalAlcoveHalfWidth - 0.34);
	for (const item of items) {
		const support = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.94, 0.5), shelfMat);
		support.position.set(x, 0.47, item.z);
		group.add(support);
		const merch = new THREE.Mesh(
			new THREE.BoxGeometry(0.34, 0.32, 0.4),
			new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.55 })
		);
		merch.position.set(x, 1.12, item.z);
		merch.rotation.y = 0.2;
		group.add(merch);
		const tag = createReadableLabel(createSmallSignTexture(item.label, '#0e1c2e'), 0.34, 0.12);
		tag.position.set(x + 0.2, 1.14, item.z);
		tag.rotation.y = Math.PI / 2;
		group.add(tag);
	}
	// Wapuu plushie display on a small plinth.
	const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), shelfMat);
	plinth.position.set(cx + (portalAlcoveHalfWidth - 0.4), 0.25, zStart + 2.2);
	group.add(plinth);
	const plushie = createWapuu3D({ height: 0.55, accent: 0xffd166 });
	plushie.position.set(cx + (portalAlcoveHalfWidth - 0.4), 0.5, zStart + 2.2);
	plushie.rotation.y = -Math.PI / 2 - 0.2;
	group.add(plushie);
	const tag = createReadableLabel(createSmallSignTexture('WAPUU', '#0e1c2e'), 0.5, 0.14);
	tag.position.set(cx + (portalAlcoveHalfWidth - 0.62), 0.62, zStart + 2.2);
	tag.rotation.y = Math.PI / 2;
	group.add(tag);
	return group;
}

// The walkable Mercantile gift shop beyond the exit alcove: an enclosed marble
// room with a warm floor, its own ceiling light, WordPress merch on shelves and
// tables, a checkout counter, and signage. Reached on foot through the exit
// alcove's open back doorway.
function createMercantileShop() {
	const group = new THREE.Group();
	const cx = shopCenterX;
	const cz = shopCenterZ;

	// Warm marble floor.
	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(shopWidth, shopDepth),
		createMuseumMaterial('roomFloor', {
			repeatX: shopWidth / floorTileSpan,
			repeatY: shopDepth / floorTileSpan,
			roughness: 0.28,
			metalness: 0.28,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(cx, 0.012, cz);
	group.add(floor);

	// A warm rug anchoring the merchandise cluster, set back from the front strip so
	// the red carpet ring crossing the shop (z=shopPassageZCenter, joining the two
	// gallery passages) reads as a distinct band in front of it, not crowding it.
	const rug = new THREE.Mesh(
		new THREE.PlaneGeometry(shopWidth * 0.5, shopDepth * 0.46),
		new THREE.MeshStandardMaterial({ color: 0xb6442b, roughness: 0.92, metalness: 0.02 })
	);
	rug.rotation.x = -Math.PI / 2;
	rug.position.set(cx, 0.05, cz + 0.9);
	group.add(rug);

	const wallMaterial = createMuseumMaterial('roomWall', {
		repeatX: shopWidth / 4.6,
		repeatY: shopHeight / 2.4,
		color: wallWarmTint,
		roughness: 0.9,
		metalness: 0.03,
	});

	// Back wall (far +z) and the two side walls.
	const backWall = new THREE.Mesh(
		new THREE.BoxGeometry(shopWidth + shopWallThickness * 2, shopHeight, shopWallThickness),
		wallMaterial
	);
	backWall.position.set(cx, shopHeight / 2, shopZEnd + shopWallThickness / 2);
	group.add(backWall);
	// Side walls. In the current variant each carries a doorway to a flanking
	// gallery (Blogging Roots on the left, Blocks Everywhere on the right), so the
	// wall is split into front/back segments plus a header around the opening.
	for (const xSign of [-1, 1]) {
		const wallX = cx + xSign * (shopWidth / 2 + shopWallThickness / 2);
		if (!isCurrentVariant) {
			const sideWall = new THREE.Mesh(
				new THREE.BoxGeometry(shopWallThickness, shopHeight, shopDepth + shopWallThickness * 2),
				wallMaterial
			);
			sideWall.position.set(wallX, shopHeight / 2, cz);
			group.add(sideWall);
			continue;
		}
		const fullMinZ = shopZStart - shopWallThickness;
		const fullMaxZ = shopZEnd + shopWallThickness;
		const doorMinZ = shopPassageZCenter - shopPassageDoorHalfWidth;
		const doorMaxZ = shopPassageZCenter + shopPassageDoorHalfWidth;
		const addZSeg = (z0, z1, height, yCenter) => {
			const len = z1 - z0;
			if (len < 0.02) {
				return;
			}
			const seg = new THREE.Mesh(
				new THREE.BoxGeometry(shopWallThickness, height, len),
				wallMaterial
			);
			seg.position.set(wallX, yCenter, (z0 + z1) / 2);
			group.add(seg);
		};
		addZSeg(fullMinZ, doorMinZ, shopHeight, shopHeight / 2); // front of door
		addZSeg(doorMaxZ, fullMaxZ, shopHeight, shopHeight / 2); // behind door
		const headerH = shopHeight - shopPassageDoorHeight;
		addZSeg(doorMinZ, doorMaxZ, headerH, shopPassageDoorHeight + headerH / 2); // header
	}

	// Front wall (toward the hub) with a doorway gap aligned to the exit alcove.
	const frontZ = shopZStart - shopWallThickness / 2;
	const openMinX = cx - shopDoorHalfWidth;
	const openMaxX = cx + shopDoorHalfWidth;
	const leftSegWidth = openMinX - shopMinX;
	const rightSegWidth = shopMaxX - openMaxX;
	if (leftSegWidth > 0.02) {
		const seg = new THREE.Mesh(
			new THREE.BoxGeometry(leftSegWidth, shopHeight, shopWallThickness),
			wallMaterial
		);
		seg.position.set(shopMinX + leftSegWidth / 2, shopHeight / 2, frontZ);
		group.add(seg);
	}
	if (rightSegWidth > 0.02) {
		const seg = new THREE.Mesh(
			new THREE.BoxGeometry(rightSegWidth, shopHeight, shopWallThickness),
			wallMaterial
		);
		seg.position.set(openMaxX + rightSegWidth / 2, shopHeight / 2, frontZ);
		group.add(seg);
	}
	// Lintel over the doorway gap.
	const lintelH = shopHeight - shopDoorHeight;
	const lintel = new THREE.Mesh(
		new THREE.BoxGeometry(shopDoorHalfWidth * 2, lintelH, shopWallThickness),
		wallMaterial
	);
	lintel.position.set(cx, shopDoorHeight + lintelH / 2, frontZ);
	group.add(lintel);

	// Skirting/baseboard trim around the room for a finished look.
	const trimMat = new THREE.MeshStandardMaterial({ color: 0xd9c8a6, roughness: 0.6, metalness: 0.1 });
	const trimBack = new THREE.Mesh(new THREE.BoxGeometry(shopWidth, 0.22, 0.06), trimMat);
	trimBack.position.set(cx, 0.11, shopZEnd - 0.04);
	group.add(trimBack);
	for (const xSign of [-1, 1]) {
		const trimSide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, shopDepth), trimMat);
		trimSide.position.set(cx + xSign * (shopWidth / 2 - 0.04), 0.11, cz);
		group.add(trimSide);
	}

	// Ceiling.
	const ceiling = new THREE.Mesh(
		new THREE.PlaneGeometry(shopWidth + shopWallThickness * 2, shopDepth + shopWallThickness * 2),
		new THREE.MeshStandardMaterial({ color: 0x1a2640, roughness: 0.6, metalness: 0.16, side: THREE.DoubleSide })
	);
	ceiling.rotation.x = Math.PI / 2;
	ceiling.position.set(cx, shopHeight, cz);
	group.add(ceiling);

	// Ceiling light fixture + lamp so the room is bright.
	const fixture = new THREE.Mesh(
		new THREE.BoxGeometry(2.6, 0.12, 1.4),
		new THREE.MeshStandardMaterial({ color: 0xf2cf86, emissive: 0x3a2710, emissiveIntensity: 0.18, roughness: 0.3, metalness: 0.5 })
	);
	fixture.position.set(cx, shopHeight - 0.08, cz);
	group.add(fixture);
	const panel = new THREE.Mesh(
		new THREE.PlaneGeometry(2.3, 1.1),
		new THREE.MeshBasicMaterial({ color: 0xfff2cf })
	);
	panel.rotation.x = Math.PI / 2;
	panel.position.set(cx, shopHeight - 0.16, cz);
	group.add(panel);
	const lamp = new THREE.PointLight(0xffe7b8, 1.5, 22);
	lamp.position.set(cx, shopHeight - 0.6, cz);
	registerAnimation(lamp, (object, elapsed) => {
		object.intensity = 1.4 + Math.sin(elapsed * 1.3) * 0.12;
	});
	group.add(lamp);
	// A second softer fill light toward the back so corners aren't dark.
	const fill = new THREE.PointLight(0xfff0d6, 0.6, 16);
	fill.position.set(cx, shopHeight - 1.4, shopZEnd - 1.6);
	group.add(fill);

	group.add(linkToMercantile(createMercantileWallSign(cx, shopZEnd)));
	group.add(linkToMercantile(createMercantileShelves()));
	group.add(linkToMercantile(createMercantileTables()));
	group.add(linkToMercantile(createMercantileCounter()));
	group.add(linkToMercantile(createWordCampBanner()));
	return group;
}

// Every sign and piece of merch in the shop is a storefront link: clicking
// any of it opens the real Mercantile in a new tab (same handling as the
// portal doors' userData.portalUrl).
function linkToMercantile(root) {
	root.traverse((child) => {
		if (child.isMesh && !child.userData.portalUrl) {
			child.userData.portalUrl = mercantileUrl;
			pickables.push(child);
		}
	});
	return root;
}

// A felt WordCamp pennant banner strung high on the shop's clean mid right wall,
// between the Blocks Everywhere doorway and the checkout — a nod to the community
// events where this merch is sold. Hung from a small cord, gently swaying.
function createWordCampBanner() {
	const group = new THREE.Group();
	const wallX = shopMaxX - shopWallThickness / 2 - 0.04;
	const z = shopCenterZ - 0.4; // clear of the front doorway and the back checkout
	const y = shopHeight - 1.5;
	// Cord the banner hangs from, fixed to two small pegs.
	const cordMat = new THREE.MeshStandardMaterial({ color: 0x6f4a2c, roughness: 0.7 });
	const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.0, 8), cordMat);
	cord.rotation.x = Math.PI / 2;
	cord.position.set(wallX - 0.02, y + 0.62, z);
	group.add(cord);
	for (const dz of [-1.0, 1.0]) {
		const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), cordMat);
		peg.rotation.z = Math.PI / 2;
		peg.position.set(wallX, y + 0.62, z + dz);
		group.add(peg);
	}
	// The triangular felt pennant, art on both faces, tip pointing down.
	const pennant = new THREE.Mesh(
		createPennantGeometry(1.7, 1.05),
		new THREE.MeshBasicMaterial({ map: createWordCampBannerTexture(), side: THREE.DoubleSide })
	);
	pennant.position.set(wallX - 0.05, y, z);
	pennant.rotation.y = -Math.PI / 2; // face the shop interior (−x)
	registerAnimation(pennant, (object, elapsed) => {
		object.rotation.z = Math.sin(elapsed * 0.9) * 0.025;
	});
	group.add(pennant);
	return group;
}

// A downward-pointing triangular pennant in the local x/y plane (top edge along
// z at y=+height/2, apex at y=−height/2), UV-mapped so a banner canvas reads
// upright. Front faces +z.
function createPennantGeometry(width, height) {
	const geometry = new THREE.BufferGeometry();
	const hw = width / 2;
	const positions = new Float32Array([
		-hw, height / 2, 0,
		hw, height / 2, 0,
		0, -height / 2, 0,
	]);
	const uvs = new Float32Array([0, 1, 1, 1, 0.5, 0]);
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
	geometry.computeVertexNormals();
	return geometry;
}

// The pennant geometry only samples the downward triangle between the top
// corners and the bottom-center apex, so everything is laid out inside that
// triangle: border along its edges, each text line sized to the width the
// triangle still has at the line's bottom, and a WP roundel near the apex.
function createWordCampBannerTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 420;
	canvas.height = 260;
	const ctx = canvas.getContext('2d');
	const w = canvas.width;
	const h = canvas.height;
	// Width still available at a given y, inside the border.
	const availWidth = (y, margin) => Math.max(0, w * (1 - y / h) - margin * 2);
	// Felt-blue field with a cream border following the triangle's edges.
	ctx.fillStyle = '#21759b';
	ctx.fillRect(0, 0, w, h);
	ctx.strokeStyle = '#fff5df';
	ctx.lineWidth = 10;
	ctx.beginPath();
	ctx.moveTo(10, 8);
	ctx.lineTo(w - 10, 8);
	ctx.lineTo(w / 2, h - 14);
	ctx.closePath();
	ctx.stroke();
	ctx.textAlign = 'center';
	ctx.fillStyle = '#fff5df';
	fillFittedCanvasText(ctx, 'WordCamp', w / 2, 68, availWidth(80, 34), 44, '900', 'Arial Black, Impact, sans-serif');
	ctx.fillStyle = '#ffd166';
	fillFittedCanvasText(ctx, '★ COMMUNITY ★', w / 2, 112, availWidth(118, 34), 24, '800', 'system-ui, sans-serif');
	// Small WP roundel toward the apex, where text no longer fits.
	ctx.strokeStyle = '#fff5df';
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.arc(w / 2, 158, 18, 0, Math.PI * 2);
	ctx.stroke();
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 20px Georgia, serif';
	ctx.fillText('W', w / 2, 165);
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// The two short side passages that make the museum loop-walkable, bridging the
// shop's side walls to the flanking galleries. The shop side-wall doorways are
// cut in createMercantileShop and the gallery side-wall doorways in
// createSpokeWall; this builds the floor, side walls, ceiling and signage of the
// passage between them, plus a brass frame on the shop doorway.
function createShopGalleryPassages() {
	const group = new THREE.Group();
	shopPassageDoorways.length = 0;
	// Left wall -> Blogging Roots (eras[0]); right wall -> Blocks Everywhere.
	group.add(createShopGalleryPassage(-1, roomLayout.get(eras[0]), shopMinX));
	group.add(createShopGalleryPassage(1, roomLayout.get(eras[eras.length - 1]), shopMaxX));
	return group;
}

function createShopGalleryPassage(xSign, room, shopWallInnerX) {
	const group = new THREE.Group();
	if (!room) {
		return group;
	}
	const z0 = shopPassageZCenter - shopPassageHalfDepth;
	const z1 = shopPassageZCenter + shopPassageHalfDepth;
	// World x of the room's shop-facing spoke wall at the two passage z edges; the
	// passage side walls embed ~0.2 past it so there is no seam to the void.
	const gx0 = shopFacingWallWorldX(room, z0);
	const gx1 = shopFacingWallWorldX(room, z1);
	const galleryX = (gx0 + gx1) / 2;
	const embed = 0.2 * xSign;

	const innerX = shopWallInnerX; // shop interior wall face
	const length = Math.abs(galleryX - innerX);
	const midX = (innerX + galleryX) / 2;
	const wt = shopWallThickness;
	// The gallery wall is tilted, so its world x varies across the z-band. The
	// flat floor/ceiling must stop at the wall point CLOSEST to the shop, or they
	// poke through the wall above/below the opening; the small wedge to the deeper
	// wall point is backed by the solid gallery wall (above) / gallery floor.
	const galleryNearX = innerX + xSign * Math.min(Math.abs(gx0 - innerX), Math.abs(gx1 - innerX));
	const nearLength = Math.abs(galleryNearX - innerX);
	const nearMidX = (innerX + galleryNearX) / 2;

	// Record both doorway midpoints for the debug overlay / verification.
	shopPassageDoorways.push(
		{ x: innerX, z: shopPassageZCenter, era: room.era, end: 'shop' },
		{ x: galleryX, z: shopPassageZCenter, era: room.era, end: 'gallery' }
	);

	const wallMaterial = createMuseumMaterial('roomWall', {
		repeatX: length / 4.6,
		repeatY: shopPassageHeight / 2.4,
		color: wallWarmTint,
		roughness: 0.9,
		metalness: 0.03,
	});

	// Floor spanning the void, flush with the shop/gallery floors. It runs from a
	// touch inside the shop to the near gallery-wall edge.
	const floorShopX = innerX - xSign * (wt + 0.2);
	const floorLen = Math.abs(galleryNearX - floorShopX);
	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(floorLen, z1 - z0),
		createMuseumMaterial('roomFloor', {
			repeatX: floorLen / floorTileSpan,
			repeatY: (z1 - z0) / floorTileSpan,
			roughness: 0.28,
			metalness: 0.28,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set((floorShopX + galleryNearX) / 2, 0.014, shopPassageZCenter);
	group.add(floor);

	// Two side walls running along x. Each spans from inside the shop wall to just
	// past the (tilted) gallery wall at its own z edge, so both ends are sealed.
	const sideWallSpecs = [
		{ z: z0, gx: gx0 },
		{ z: z1, gx: gx1 },
	];
	for (const spec of sideWallSpecs) {
		const startX = innerX - wt * xSign; // bite into the shop wall
		const endX = spec.gx + embed; // bite into the gallery wall
		const len = Math.abs(endX - startX);
		const wall = new THREE.Mesh(
			new THREE.BoxGeometry(len, shopPassageHeight, wt),
			wallMaterial
		);
		wall.position.set((startX + endX) / 2, shopPassageHeight / 2, spec.z);
		group.add(wall);
	}

	// Flat ceiling, from inside the shop to the near gallery-wall edge so it never
	// pokes through the tilted wall above the opening.
	const ceilShopX = innerX - xSign * wt;
	const ceilLen = Math.abs(galleryNearX - ceilShopX);
	const ceiling = new THREE.Mesh(
		new THREE.PlaneGeometry(ceilLen, z1 - z0 + wt * 2),
		new THREE.MeshBasicMaterial({
			map: createMuseumTexture('ceiling', ceilLen / 4, (z1 - z0 + wt * 2) / 4),
			side: THREE.DoubleSide,
		})
	);
	ceiling.rotation.x = Math.PI / 2;
	ceiling.position.set((ceilShopX + galleryNearX) / 2, shopPassageHeight, shopPassageZCenter);
	group.add(ceiling);

	// Skirting along both side walls for a finished look.
	const trimMat = new THREE.MeshStandardMaterial({ color: 0xd9c8a6, roughness: 0.6, metalness: 0.1 });
	for (const spec of sideWallSpecs) {
		const trim = new THREE.Mesh(new THREE.BoxGeometry(length, 0.18, 0.05), trimMat);
		const inset = 0.06 * (spec.z < shopPassageZCenter ? 1 : -1);
		trim.position.set(midX, 0.09, spec.z + inset);
		group.add(trim);
	}

	// Brass frame + lintel on the shop-wall doorway, matching the shop's style.
	group.add(createShopPassageShopFrame(xSign, innerX));

	// Warm fill light so the passage reads as an inviting threshold.
	const lamp = new THREE.PointLight(0xffe7b8, 0.9, length + 6);
	lamp.position.set(midX, shopPassageHeight - 0.5, shopPassageZCenter);
	registerAnimation(lamp, (object, elapsed) => {
		object.intensity = 0.82 + Math.sin(elapsed * 1.2) * 0.1;
	});
	group.add(lamp);

	// Wayfinding sign over the shop-wall doorway, facing into the shop.
	const era = room.era;
	const color = `#${new THREE.Color(eraColors.get(era) ?? 0x2bb7ff).getHexString()}`;
	const destination = era === eras[0] ? 'TO BLOGGING ROOTS' : 'TO BLOCKS EVERYWHERE';
	const shopSign = createReadableLabel(createSmallSignTexture(destination, color), 1.9, 0.4);
	const headerH = shopPassageHeight - shopPassageDoorHeight;
	shopSign.position.set(innerX - 0.14 * xSign, shopPassageDoorHeight + headerH * 0.42, shopPassageZCenter);
	shopSign.rotation.y = xSign > 0 ? -Math.PI / 2 : Math.PI / 2;
	group.add(shopSign);

	// The period "what the web looked like then" poster rehomed from the gallery
	// side wall onto the passage's back wall, facing into the passage.
	const poster = createWebEraPosterPanel(era);
	poster.position.set(midX, 2.0, z1 - 0.02);
	poster.rotation.y = Math.PI; // art (+z) faces -z, toward the passage
	group.add(poster);

	return group;
}

// World x of a gallery's shop-facing spoke wall at a given world z. The wall is
// the straight tilted line local x = sign * sideHalfWidthAtZ(localZ); since the
// half-width is linear in localZ this inverts in closed form.
function shopFacingWallWorldX(room, worldZ) {
	const sign = room.connectLeft ? 1 : -1; // 'right' wall (+x local) for eras[0]
	// worldZ(lz) = C.z + T.z*sign*(rcd+lz)*wedgeTan + N.z*lz, linear in lz.
	const a = room.tangent.z * sign * wedgeTan; // dWorldZ from the hw term
	const b = room.tangent.z * sign * roomCenterDistance * wedgeTan + room.center.z;
	// worldZ = a*lz + room.normal.z*lz + b  =>  lz = (worldZ - b) / (a + N.z)
	const lz = (worldZ - b) / (a + room.normal.z);
	const hw = sideHalfWidthAtZ(lz);
	return room.center.x + room.tangent.x * (sign * hw) + room.normal.x * lz;
}

// Brass post-and-lintel frame around a shop side-wall passage doorway, matching
// the exit-alcove doorway. Built in world space at the shop wall's inner face.
function createShopPassageShopFrame(xSign, innerX) {
	const group = new THREE.Group();
	const archMaterial = new THREE.MeshStandardMaterial({
		color: 0xf5d088,
		emissive: 0x4a2810,
		emissiveIntensity: 0.3,
		roughness: 0.32,
		metalness: 0.46,
	});
	const z0 = shopPassageZCenter - shopPassageDoorHalfWidth;
	const z1 = shopPassageZCenter + shopPassageDoorHalfWidth;
	const faceX = innerX - 0.03 * xSign; // just proud of the wall's inner face
	// Lintel across the top of the opening.
	const lintel = new THREE.Mesh(
		new THREE.BoxGeometry(0.4, 0.2, shopPassageDoorHalfWidth * 2 + 0.36),
		archMaterial
	);
	lintel.position.set(faceX, shopPassageDoorHeight + 0.06, shopPassageZCenter);
	group.add(lintel);
	// Posts on each side of the opening.
	for (const z of [z0, z1]) {
		const post = new THREE.Mesh(
			new THREE.BoxGeometry(0.4, shopPassageDoorHeight + 0.16, 0.18),
			archMaterial
		);
		post.position.set(faceX, (shopPassageDoorHeight + 0.16) / 2, z + (z < shopPassageZCenter ? -0.09 : 0.09));
		group.add(post);
	}
	return group;
}

// THE PLAYGROUND: a small enclosed annex east of Blocks Everywhere, reached
// through a doorway cut into that gallery's right back-corner chamfer. A double
// pun on WordPress Playground (run WordPress in the browser, ~2022) and a literal
// children's playground: it holds a slide, swings, a sandbox, a see-saw and a
// spring rider around a walkable centre, plus a Playground exhibit panel. The
// gallery is rotated 135deg so this chamfer is the axis-aligned plane at world x =
// playgroundDoorWallX; the whole annex is built axis-aligned in world space.
function createPlaygroundAnnex() {
	const group = new THREE.Group();
	if (!isCurrentVariant || !playgroundRoom) {
		return group;
	}
	const cx = playgroundCenterX;
	const cz = playgroundCenterZ;
	const wt = playgroundWallThickness;

	// Cheerful but marble-consistent floor.
	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(playgroundDepth, playgroundWidth),
		createMuseumMaterial('roomFloor', {
			repeatX: playgroundDepth / floorTileSpan,
			repeatY: playgroundWidth / floorTileSpan,
			roughness: 0.3,
			metalness: 0.24,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(cx, 0.012, cz);
	group.add(floor);

	// A soft grassy play mat anchors the centre and reads as a real playground.
	const mat = new THREE.Mesh(
		new THREE.PlaneGeometry(playgroundDepth * 0.62, playgroundWidth * 0.6),
		new THREE.MeshStandardMaterial({ color: 0x6fc46a, roughness: 0.95, metalness: 0.01 })
	);
	mat.rotation.x = -Math.PI / 2;
	mat.position.set(cx + 0.6, 0.05, cz);
	group.add(mat);

	// All inner walls share a cheerful grass-green, like the other side rooms'
	// coloured walls — the doored chamfer wall included.
	const wallMaterial = createMuseumMaterial('roomWall', {
		repeatX: playgroundDepth / 4.6,
		repeatY: playgroundHeight / 2.4,
		color: 0x6fae4e,
		roughness: 0.9,
		metalness: 0.03,
	});
	group.add(createPlaygroundDoorWall(wallMaterial));

	// East wall (far +x).
	const eastWall = new THREE.Mesh(
		new THREE.BoxGeometry(wt, playgroundHeight, playgroundWidth + wt * 2),
		wallMaterial
	);
	eastWall.position.set(playgroundMaxX + wt / 2, playgroundHeight / 2, cz);
	group.add(eastWall);
	// North (-z) and south (+z) walls.
	for (const zSign of [-1, 1]) {
		const wallZ = cz + zSign * (playgroundWidth / 2 + wt / 2);
		const wall = new THREE.Mesh(
			new THREE.BoxGeometry(playgroundDepth, playgroundHeight, wt),
			wallMaterial
		);
		wall.position.set(cx, playgroundHeight / 2, wallZ);
		group.add(wall);
	}

	// Skirting around the room.
	const trimMat = new THREE.MeshStandardMaterial({ color: 0xd9c8a6, roughness: 0.6, metalness: 0.1 });
	const trimEast = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, playgroundWidth), trimMat);
	trimEast.position.set(playgroundMaxX - 0.04, 0.11, cz);
	group.add(trimEast);
	for (const zSign of [-1, 1]) {
		const trim = new THREE.Mesh(new THREE.BoxGeometry(playgroundDepth, 0.22, 0.06), trimMat);
		trim.position.set(cx, 0.11, cz + zSign * (playgroundWidth / 2 - 0.04));
		group.add(trim);
	}

	// Open-air courtyard "roof": rather than a flat plate, a painted bright sky
	// with drifting clouds, framed by a cornice so it reads as a deliberate open
	// top for a playground. Opaque, so the building shell above never shows through.
	group.add(createPlaygroundSkyCeiling(cx, cz, wt));

	// Daylight pours in from the open sky above: a warm "sun" high overhead plus a
	// cool sky fill, so the courtyard stays bright without an indoor light fixture.
	const sun = new THREE.PointLight(0xfff1d4, 1.6, 30);
	sun.position.set(cx, playgroundHeight - 0.5, cz);
	registerAnimation(sun, (object, elapsed) => {
		object.intensity = 1.5 + Math.sin(elapsed * 1.3) * 0.12;
	});
	group.add(sun);
	const fill = new THREE.PointLight(0xeaf4ff, 0.7, 20);
	fill.position.set(playgroundMaxX - 2.0, playgroundHeight - 1.4, cz);
	group.add(fill);

	// Equipment, kept around the edges so the centre and the door->exhibit sightline
	// stay walkable. The exhibit sits on the east wall directly across from the door
	// (z = playgroundDoorZCenter), so that lane and the room middle are left clear.
	// The sandbox sits against the east wall just right of the main exhibit sign, in
	// view in front of the entrance (completing the sign's "the sandbox is over there
	// →" gag); the slide/swing line the south wall and the see-saw/spring rider sit
	// west/north, all clear of the open entry lane and room middle.
	group.add(createPlaygroundSandbox(playgroundMaxX - 2.0, playgroundDoorZCenter + 3.2)); // E wall, right of the sign
	// Slide angled ~45° out of the SW corner so its chute leads into the room centre
	// (and reads as a clear focal point on the way in).
	group.add(createPlaygroundSlide(playgroundMinX + 3.0, playgroundMaxZ - 3.0, Math.PI * 0.75));
	group.add(createPlaygroundSwingSet(playgroundMaxX - 4.0, playgroundMaxZ - 1.7)); // SE, well clear of the SW slide
	group.add(createPlaygroundSeesaw(playgroundMinX + 2.8, playgroundDoorZCenter + 2.0)); // W, clear of the entry sightline
	group.add(createPlaygroundSpringRider(playgroundMinX + 7.5, playgroundMinZ + 1.6)); // N, east of the door

	// WordPress Playground exhibit panel + the "SANDBOX" sign, both on the east wall.
	group.add(createPlaygroundExhibitSign());
	group.add(createPlaygroundSandboxSign());
	group.add(createPlaygroundBlueprint());
	return group;
}

// The annex reads as an open-air courtyard: a painted bright sky with clouds caps
// the top (opaque, so the building shell above never peeks through), ringed by a
// brass-and-cream cornice that frames it as a deliberate skylight opening.
function createPlaygroundSkyCeiling(cx, cz, wt) {
	const group = new THREE.Group();
	const sky = new THREE.Mesh(
		new THREE.PlaneGeometry(playgroundDepth + wt * 2, playgroundWidth + wt * 2),
		new THREE.MeshBasicMaterial({ map: createPlaygroundSkyTexture(), side: THREE.DoubleSide })
	);
	sky.rotation.x = Math.PI / 2;
	sky.position.set(cx, playgroundHeight, cz);
	group.add(sky);

	// Cornice ring around the wall tops: a brass top rail over a cream cove, hugging
	// the four inner wall faces just below the sky so the opening reads as framed.
	const brass = new THREE.MeshStandardMaterial({ color: 0xf2cf86, emissive: 0x3a2710, emissiveIntensity: 0.12, roughness: 0.3, metalness: 0.5 });
	const cream = new THREE.MeshStandardMaterial({ color: 0xf2e7c9, roughness: 0.6, metalness: 0.08 });
	const inX = playgroundDepth + 0.02;
	const inZ = playgroundWidth + 0.02;
	const railY = playgroundHeight - 0.16;
	const coveY = playgroundHeight - 0.42;
	const addBand = (geo, mat, y, x, z) => {
		const band = new THREE.Mesh(geo, mat);
		band.position.set(x, y, z);
		group.add(band);
	};
	for (const xSign of [-1, 1]) {
		const x = cx + xSign * (playgroundDepth / 2 - 0.05);
		addBand(new THREE.BoxGeometry(0.16, 0.16, inZ), brass, railY, x, cz);
		addBand(new THREE.BoxGeometry(0.26, 0.3, inZ), cream, coveY, x, cz);
	}
	for (const zSign of [-1, 1]) {
		const z = cz + zSign * (playgroundWidth / 2 - 0.05);
		addBand(new THREE.BoxGeometry(inX, 0.16, 0.16), brass, railY, cx, z);
		addBand(new THREE.BoxGeometry(inX, 0.3, 0.26), cream, coveY, cx, z);
	}
	return group;
}

// A cheerful daytime sky for the playground roof: a clear-blue vertical gradient
// with a soft warm sun glow and a few drifting cumulus clouds, drawn so it tiles
// gently across the courtyard top.
function createPlaygroundSkyTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 512;
	const ctx = canvas.getContext('2d');

	const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
	grad.addColorStop(0, '#6fb7ec');
	grad.addColorStop(0.55, '#9fd2ef');
	grad.addColorStop(1, '#d8eefb');
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Warm sun glow toward one corner.
	const sun = ctx.createRadialGradient(370, 150, 10, 370, 150, 220);
	sun.addColorStop(0, 'rgba(255, 248, 214, 0.9)');
	sun.addColorStop(0.4, 'rgba(255, 244, 198, 0.35)');
	sun.addColorStop(1, 'rgba(255, 244, 198, 0)');
	ctx.fillStyle = sun;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Soft cumulus clouds: overlapping pale puffs.
	const puff = (x, y, r, alpha) => {
		const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
		g.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
		g.addColorStop(0.7, `rgba(255, 255, 255, ${alpha * 0.5})`);
		g.addColorStop(1, 'rgba(255, 255, 255, 0)');
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	};
	const clouds = [
		[120, 110, 60], [165, 95, 48], [205, 120, 52], [85, 130, 40],
		[360, 360, 66], [415, 345, 50], [310, 372, 46],
		[150, 400, 44], [195, 415, 36],
	];
	for (const [x, y, r] of clouds) {
		puff(x, y, r, 0.9);
	}

	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

// The annex's west wall is Blocks Everywhere's right chamfer (the plane at world x
// = playgroundDoorWallX). It carries the doorway: solid chamfer above/either side,
// a brass post-and-lintel frame, a "THE PLAYGROUND" destination sign on the
// gallery face and a "<- GALLERY" return sign on the annex face. North/south stubs
// extend the chamfer to the annex's full width where it overhangs the gallery corner.
function createPlaygroundDoorWall(wallMaterial) {
	const group = new THREE.Group();
	const wallX = playgroundDoorWallX;
	const wt = playgroundWallThickness;
	const doorMinZ = playgroundDoorZCenter - playgroundDoorHalfWidth;
	const doorMaxZ = playgroundDoorZCenter + playgroundDoorHalfWidth;
	// Run the wall a touch past the gallery chamfer corner (z = playgroundChamferZMin)
	// so the seam to the gallery's side wall is closed with no sliver to the void.
	const fullMinZ = Math.min(playgroundMinZ - wt, playgroundChamferZMin - 0.1);
	const fullMaxZ = playgroundMaxZ + wt;
	const addZSeg = (z0, z1, height, yCenter) => {
		const len = z1 - z0;
		if (len < 0.02) {
			return;
		}
		const seg = new THREE.Mesh(new THREE.BoxGeometry(wt, height, len), wallMaterial);
		seg.position.set(wallX, yCenter, (z0 + z1) / 2);
		group.add(seg);
	};
	addZSeg(fullMinZ, doorMinZ, playgroundHeight, playgroundHeight / 2); // -z of door
	addZSeg(doorMaxZ, fullMaxZ, playgroundHeight, playgroundHeight / 2); // +z of door
	const headerH = playgroundHeight - playgroundDoorHeight;
	addZSeg(doorMinZ, doorMaxZ, headerH, playgroundDoorHeight + headerH / 2); // header

	// Brass post-and-lintel frame, on the annex (interior) face.
	const brass = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.1,
		roughness: 0.32,
		metalness: 0.5,
	});
	const faceX = wallX + wt / 2 + 0.03; // just proud of the interior face (annex is +x)
	const lintel = new THREE.Mesh(
		new THREE.BoxGeometry(0.2, 0.2, playgroundDoorHalfWidth * 2 + 0.36),
		brass
	);
	lintel.position.set(faceX, playgroundDoorHeight + 0.06, playgroundDoorZCenter);
	group.add(lintel);
	for (const z of [doorMinZ, doorMaxZ]) {
		const post = new THREE.Mesh(
			new THREE.BoxGeometry(0.2, playgroundDoorHeight + 0.16, 0.18),
			brass
		);
		post.position.set(faceX, (playgroundDoorHeight + 0.16) / 2, z + (z < playgroundDoorZCenter ? -0.09 : 0.09));
		group.add(post);
	}
	// Threshold strip flush with the floor.
	const threshold = new THREE.Mesh(
		new THREE.BoxGeometry(wt + 0.24, 0.05, playgroundDoorHalfWidth * 2),
		brass
	);
	threshold.position.set(wallX, 0.025, playgroundDoorZCenter);
	group.add(threshold);

	// Destination "THE PLAYGROUND" sign on the gallery (chamfer outer, -x) face,
	// facing -x toward the gallery so approaching visitors read where the door leads.
	const destSign = createReadableLabel(
		createSmallSignTexture('THE PLAYGROUND', '#78e0dc'),
		1.9,
		0.42
	);
	destSign.position.set(wallX - wt / 2 - 0.05, playgroundDoorHeight + headerH * 0.42, playgroundDoorZCenter);
	destSign.rotation.y = -Math.PI / 2; // face -x, toward the gallery
	group.add(destSign);

	// Return "<- GALLERY" sign on the annex (interior, +x) face, facing +x so a
	// visitor inside the annex reads the way back.
	const returnSign = createReadableLabel(
		createSmallSignTexture('← GALLERY', '#78e0dc'),
		1.7,
		0.4
	);
	returnSign.position.set(faceX + 0.05, playgroundDoorHeight + headerH * 0.42, playgroundDoorZCenter);
	returnSign.rotation.y = Math.PI / 2; // face +x, toward the annex interior
	group.add(returnSign);

	// Warm glow so the portal reads as an inviting threshold from the gallery.
	const glow = new THREE.PointLight(0xffd8a0, 3, 6, 2);
	glow.position.set(wallX, playgroundDoorHeight - 0.6, playgroundDoorZCenter);
	group.add(glow);
	return group;
}

// A bright low-poly slide: a stepped ladder up to a platform, then a sloped chute
// down to the floor. `facing` rotates the whole rig about its base.
function createPlaygroundSlide(x, z, facing) {
	const group = new THREE.Group();
	group.position.set(x, 0, z);
	group.rotation.y = facing;
	const frameMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.55, metalness: 0.12 });
	const chuteMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.4, metalness: 0.2 });
	const stepMat = new THREE.MeshStandardMaterial({ color: 0x4fb0ff, roughness: 0.5, metalness: 0.12 });

	const platformY = 1.9;
	// Platform deck.
	const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 1.1), frameMat);
	deck.position.set(0, platformY, 0);
	group.add(deck);
	// Four legs under the platform.
	for (const lx of [-0.45, 0.45]) {
		for (const lz of [-0.45, 0.45]) {
			const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, platformY, 10), frameMat);
			leg.position.set(lx, platformY / 2, lz);
			group.add(leg);
		}
	}
	// Safety rails framing the platform top.
	for (const lz of [-0.5, 0.5]) {
		const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.8, 8), frameMat);
		rail.position.set(0, platformY + 0.45, lz);
		group.add(rail);
	}
	// Ladder on the -z side: two splayed rails running from the floor up to the
	// platform's back edge, with evenly spaced rungs interpolated along the same
	// line so the rails and rungs stay aligned and actually reach the deck.
	const ladderTopZ = -0.5; // platform back edge
	const ladderFootZ = -1.25; // splayed out at the base
	const ladderHalfW = 0.42;
	for (const lx of [-ladderHalfW, ladderHalfW]) {
		group.add(createCylinderBetween(
			new THREE.Vector3(lx, 0, ladderFootZ),
			new THREE.Vector3(lx, platformY, ladderTopZ),
			0.05,
			stepMat,
			10
		));
	}
	const rungCount = 5;
	for (let i = 1; i <= rungCount; i++) {
		const t = i / (rungCount + 1);
		const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, ladderHalfW * 2, 8), stepMat);
		rung.rotation.z = Math.PI / 2;
		rung.position.set(0, t * platformY, ladderFootZ + t * (ladderTopZ - ladderFootZ));
		group.add(rung);
	}
	// Sloped chute toward +z, with low side rails.
	const chuteLen = 2.7;
	const chute = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.08, chuteLen), chuteMat);
	chute.position.set(0, platformY / 2 + 0.1, 0.55 + chuteLen / 2 * Math.cos(0.62));
	chute.rotation.x = 0.62;
	group.add(chute);
	for (const lx of [-0.45, 0.45]) {
		const side = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, chuteLen), chuteMat);
		side.position.set(lx, platformY / 2 + 0.2, 0.55 + chuteLen / 2 * Math.cos(0.62));
		side.rotation.x = 0.62;
		group.add(side);
	}
	return group;
}

// A two-seat swing set: an A-frame on each end carrying a top beam, with two
// swings on chains. The seats sway gently.
function createPlaygroundSwingSet(x, z) {
	const group = new THREE.Group();
	group.position.set(x, 0, z);
	const frameMat = new THREE.MeshStandardMaterial({ color: 0x4fb0ff, roughness: 0.5, metalness: 0.2 });
	const seatMat = new THREE.MeshStandardMaterial({ color: 0xff9b3c, roughness: 0.5, metalness: 0.1 });
	const chainMat = new THREE.MeshStandardMaterial({ color: 0xb8c2cf, roughness: 0.4, metalness: 0.7 });
	const beamY = 2.5;
	const halfSpan = 1.7;
	const splay = 0.92; // how far each A-frame's feet splay fore/aft (±z)
	// A proper A-frame at each beam end: two splayed legs rising from the floor to
	// meet at the apex where the beam rests, plus a low cross-tie between the feet.
	for (const ex of [-halfSpan, halfSpan]) {
		const apex = new THREE.Vector3(ex, beamY, 0);
		for (const dz of [-splay, splay]) {
			group.add(createCylinderBetween(new THREE.Vector3(ex, 0, dz), apex, 0.07, frameMat, 12));
		}
		group.add(createCylinderBetween(
			new THREE.Vector3(ex, 0.55, -splay),
			new THREE.Vector3(ex, 0.55, splay),
			0.04,
			frameMat,
			8
		));
	}
	// Top beam resting across the two apexes.
	const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, halfSpan * 2 + 0.16, 12), frameMat);
	beam.rotation.z = Math.PI / 2;
	beam.position.set(0, beamY, 0);
	group.add(beam);
	// Two swings.
	for (const sx of [-0.7, 0.7]) {
		const swing = new THREE.Group();
		swing.position.set(sx, beamY, 0);
		const seatY = -1.55;
		for (const cz of [-0.22, 0.22]) {
			const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.55, 6), chainMat);
			chain.position.set(0, seatY / 2, cz);
			swing.add(chain);
		}
		const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.26), seatMat);
		seat.position.set(0, seatY, 0);
		swing.add(seat);
		registerAnimation(swing, (object, elapsed) => {
			object.rotation.x = Math.sin(elapsed * 1.6 + sx) * 0.22;
		});
		group.add(swing);
	}
	return group;
}

// A square sandbox: low timber sides around a sand fill, with a toy bucket and
// spade. Doubles as the "sandbox" gag tied to a code sandbox in the exhibit text.
function createPlaygroundSandbox(x, z) {
	const group = new THREE.Group();
	group.position.set(x, 0, z);
	const size = 2.4;
	const sideMat = new THREE.MeshStandardMaterial({ color: 0xb5763c, roughness: 0.85, metalness: 0.04 });
	const sandMat = new THREE.MeshStandardMaterial({ color: 0xf2dca0, roughness: 0.95, metalness: 0.0 });
	// Sand fill.
	const sand = new THREE.Mesh(new THREE.BoxGeometry(size - 0.2, 0.14, size - 0.2), sandMat);
	sand.position.set(0, 0.1, 0);
	group.add(sand);
	// Four timber sides.
	for (const [dx, dz, rot] of [[0, -size / 2, 0], [0, size / 2, 0], [-size / 2, 0, Math.PI / 2], [size / 2, 0, Math.PI / 2]]) {
		const rail = new THREE.Mesh(new THREE.BoxGeometry(size + 0.2, 0.26, 0.18), sideMat);
		rail.rotation.y = rot;
		rail.position.set(dx, 0.13, dz);
		group.add(rail);
	}
	// Corner posts.
	for (const cx of [-1, 1]) {
		for (const cz of [-1, 1]) {
			const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), sideMat);
			post.position.set((cx * size) / 2, 0.16, (cz * size) / 2);
			group.add(post);
		}
	}
	// Toy bucket and spade.
	const bucket = new THREE.Mesh(
		new THREE.CylinderGeometry(0.2, 0.15, 0.28, 14),
		new THREE.MeshStandardMaterial({ color: 0xff4f64, roughness: 0.5 })
	);
	bucket.position.set(0.5, 0.31, 0.4);
	group.add(bucket);
	const spade = new THREE.Mesh(
		new THREE.BoxGeometry(0.05, 0.5, 0.05),
		new THREE.MeshStandardMaterial({ color: 0x2bb7ff, roughness: 0.5 })
	);
	spade.position.set(-0.4, 0.34, -0.3);
	spade.rotation.z = 0.5;
	group.add(spade);
	return group;
}

// A classic see-saw: a fulcrum block with a plank that gently rocks, a seat and
// grip handle at each end.
function createPlaygroundSeesaw(x, z) {
	const group = new THREE.Group();
	group.position.set(x, 0, z);
	const baseMat = new THREE.MeshStandardMaterial({ color: 0x9670d8, roughness: 0.55, metalness: 0.15 });
	const plankMat = new THREE.MeshStandardMaterial({ color: 0x44d17f, roughness: 0.55, metalness: 0.1 });
	const seatMat = new THREE.MeshStandardMaterial({ color: 0xff4f64, roughness: 0.5 });
	// Fulcrum.
	const fulcrum = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.7, 12), baseMat);
	fulcrum.position.set(0, 0.35, 0);
	group.add(fulcrum);
	// Rocking plank.
	const beam = new THREE.Group();
	beam.position.set(0, 0.72, 0);
	const plank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.34), plankMat);
	beam.add(plank);
	for (const ex of [-1.45, 1.45]) {
		const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.34), seatMat);
		seat.position.set(ex, 0.1, 0);
		beam.add(seat);
		const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 14), baseMat);
		handle.position.set(ex - Math.sign(ex) * 0.1, 0.32, 0);
		handle.rotation.y = Math.PI / 2;
		beam.add(handle);
	}
	registerAnimation(beam, (object, elapsed) => {
		object.rotation.z = Math.sin(elapsed * 1.1) * 0.13;
	});
	group.add(beam);
	return group;
}

// A springy ride-on toy: a coil spring on a base with a simple animal seat that
// bobs and tilts.
function createPlaygroundSpringRider(x, z) {
	const group = new THREE.Group();
	group.position.set(x, 0, z);
	const springMat = new THREE.MeshStandardMaterial({ color: 0xb8c2cf, roughness: 0.4, metalness: 0.6 });
	const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5, metalness: 0.1 });
	const accentMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.5 });
	// Ground anchor.
	const anchor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 14), springMat);
	anchor.position.set(0, 0.06, 0);
	group.add(anchor);
	const rider = new THREE.Group();
	rider.position.set(0, 0.12, 0);
	// Coil spring (a stout cylinder reads as a spring at this scale).
	const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.55, 12), springMat);
	spring.position.set(0, 0.27, 0);
	rider.add(spring);
	// Body.
	const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 1.0), bodyMat);
	body.position.set(0, 0.72, 0);
	rider.add(body);
	const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 12), bodyMat);
	head.position.set(0, 0.95, 0.5);
	rider.add(head);
	for (const ex of [-0.16, 0.16]) {
		const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 10), accentMat);
		ear.position.set(ex, 1.16, 0.5);
		rider.add(ear);
	}
	const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), accentMat);
	grip.rotation.z = Math.PI / 2;
	grip.position.set(0, 0.92, 0.0);
	rider.add(grip);
	registerAnimation(rider, (object, elapsed) => {
		object.rotation.x = Math.sin(elapsed * 2.2) * 0.16;
	});
	group.add(rider);
	return group;
}

// The WordPress Playground exhibit: a lit panel on the annex's east wall facing
// the doorway, explaining the product and winking at the literal playground.
function createPlaygroundExhibitSign() {
	const group = new THREE.Group();
	const wallFace = playgroundMaxX - playgroundWallThickness / 2;
	const brass = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.1,
		roughness: 0.34,
		metalness: 0.5,
	});
	// Brass frame flush against the wall, board floating just in front of it.
	const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 3.6), brass);
	frame.position.set(wallFace - 0.04, 2.7, playgroundDoorZCenter);
	group.add(frame);
	const board = new THREE.Mesh(
		new THREE.PlaneGeometry(3.4, 2.3),
		new THREE.MeshBasicMaterial({ map: createPlaygroundSignTexture() })
	);
	board.position.set(wallFace - 0.12, 2.7, playgroundDoorZCenter);
	board.rotation.y = -Math.PI / 2; // face -x, toward the doorway
	group.add(board);
	const accent = new THREE.PointLight(0x78e0dc, 0.9, 9);
	accent.position.set(wallFace - 1.6, 2.7, playgroundDoorZCenter);
	group.add(accent);
	return group;
}

// A small "SANDBOX" sign on the east wall above the sandbox, just right of the
// main exhibit panel — the literal end of its "the sandbox is over there →" gag.
function createPlaygroundSandboxSign() {
	const group = new THREE.Group();
	const wallFace = playgroundMaxX - playgroundWallThickness / 2;
	const z = playgroundDoorZCenter + 3.2;
	const brass = new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 });
	const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 1.78), brass);
	frame.position.set(wallFace - 0.04, 2.35, z);
	group.add(frame);
	const sign = createReadableLabel(createSmallSignTexture('SANDBOX', '#78e0dc'), 1.6, 0.46);
	sign.position.set(wallFace - 0.11, 2.35, z);
	sign.rotation.y = -Math.PI / 2; // face -x, toward the room
	group.add(sign);
	return group;
}

// A real architectural floor plan of the annex itself, drawn as a cyanotype
// blueprint and framed on the free east wall right of the sandbox — a wink at
// WordPress Playground's own "Blueprints", but an actual building one this time.
function createPlaygroundBlueprint() {
	const group = new THREE.Group();
	const wallFace = playgroundMaxX - playgroundWallThickness / 2;
	const z = playgroundDoorZCenter + 5.6; // right of the SANDBOX sign, clear of the swings
	const w = 1.5;
	const h = 1.7;
	const brass = new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 });
	const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, h + 0.14, w + 0.14), brass);
	frame.position.set(wallFace - 0.04, 2.6, z);
	group.add(frame);
	const plan = new THREE.Mesh(
		new THREE.PlaneGeometry(w, h),
		new THREE.MeshBasicMaterial({ map: createPlaygroundBlueprintTexture() })
	);
	plan.position.set(wallFace - 0.12, 2.6, z);
	plan.rotation.y = -Math.PI / 2; // face -x, toward the room
	group.add(plan);
	const accent = new THREE.PointLight(0xbfe0ff, 0.45, 6);
	accent.position.set(wallFace - 1.4, 3.5, z);
	group.add(accent);
	return group;
}

function createPlaygroundBlueprintTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 1161; // matches the 1.5 x 1.7 plane
	const ctx = canvas.getContext('2d');
	const W = canvas.width;
	const H = canvas.height;
	const ink = '#d6e6ff';

	// Cyanotype field with a faint construction grid.
	ctx.fillStyle = '#15406e';
	ctx.fillRect(0, 0, W, H);
	ctx.strokeStyle = 'rgba(214, 230, 255, 0.1)';
	ctx.lineWidth = 1;
	for (let x = 0; x <= W; x += 48) {
		ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
	}
	for (let y = 0; y <= H; y += 48) {
		ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
	}
	ctx.strokeStyle = ink;
	ctx.lineWidth = 4;
	ctx.strokeRect(22, 22, W - 44, H - 44);
	ctx.lineWidth = 1.5;
	ctx.strokeRect(33, 33, W - 66, H - 66);

	// Plan area maps the annex interior x[27.5,40.5] x z[11.8,24.6] to the canvas
	// (world +x -> right, world +z -> down).
	const wx0 = 27.5, wx1 = 40.5, wz0 = 11.8, wz1 = 24.6;
	const areaL = 96, areaR = W - 96, areaT = 92, areaB = H - 250;
	const s = Math.min((areaR - areaL) / (wx1 - wx0), (areaB - areaT) / (wz1 - wz0));
	const planW = (wx1 - wx0) * s, planH = (wz1 - wz0) * s;
	const ox = areaL + (areaR - areaL - planW) / 2;
	const oy = areaT + (areaB - areaT - planH) / 2;
	const X = (wx) => ox + (wx - wx0) * s;
	const Y = (wz) => oy + (wz - wz0) * s;

	const label = (text, cx, cy, size = 19) => {
		ctx.fillStyle = ink;
		ctx.font = `700 ${size}px "Courier New", monospace`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, cx, cy);
	};
	const box = (x0, z0, x1, z1) => {
		ctx.strokeStyle = ink;
		ctx.lineWidth = 2;
		ctx.strokeRect(X(x0), Y(z0), X(x1) - X(x0), Y(z1) - Y(z0));
	};

	// Perimeter walls (double line) with the entrance gap on the west wall.
	const L = X(wx0), R = X(wx1), T = Y(wz0), B = Y(wz1);
	ctx.strokeStyle = ink;
	ctx.lineWidth = 6;
	ctx.beginPath();
	ctx.moveTo(L, T); ctx.lineTo(R, T); ctx.lineTo(R, B); ctx.lineTo(L, B); // N, E, S
	ctx.lineTo(L, Y(15.9)); ctx.moveTo(L, Y(13.7)); ctx.lineTo(L, T);       // W wall, broken at the door
	ctx.stroke();
	// Door swing arc + label.
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.arc(L, Y(13.7), Y(15.9) - Y(13.7), 0, Math.PI / 2);
	ctx.stroke();
	label('ENTRANCE', X(29.4), Y(14.8), 16);

	// Fixtures, positioned and sized from the actual annex layout.
	// Sandbox (square, dotted "sand" fill).
	box(37.2, 15.5, 39.8, 18.1);
	ctx.fillStyle = 'rgba(214,230,255,0.5)';
	for (let i = 0; i < 60; i++) {
		const px = X(37.4) + pseudoRandom(i * 1.3 + 0.2) * (X(39.6) - X(37.4));
		const py = Y(15.7) + pseudoRandom(i * 1.7 + 0.9) * (Y(17.9) - Y(15.7));
		ctx.fillRect(px, py, 2, 2);
	}
	label('SANDBOX', X(38.5), Y(16.8), 17);

	// Slide (tower + tapering chute).
	box(30, 19.8, 33, 22.6);
	ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
	ctx.beginPath(); ctx.moveTo(X(30.4), Y(22.2)); ctx.lineTo(X(32.6), Y(20.2)); ctx.stroke();
	label('SLIDE', X(31.5), Y(21.2), 16);

	// Swings (frame + two seats).
	box(34.6, 22.2, 38.4, 23.6);
	ctx.fillStyle = ink;
	for (const sx of [35.6, 37.4]) {
		ctx.beginPath(); ctx.arc(X(sx), Y(22.9), 5, 0, Math.PI * 2); ctx.fill();
	}
	label('SWINGS', X(36.5), Y(24.0), 16);

	// Spring rider (small disc) + info desk (rect by the north wall).
	ctx.strokeStyle = ink; ctx.lineWidth = 2;
	ctx.beginPath(); ctx.arc(X(30.8), Y(16.8), s * 0.6, 0, Math.PI * 2); ctx.stroke();
	label('RIDER', X(30.8), Y(18.0), 14);
	box(34.5, 13.2, 36.5, 14.2);
	label('INFO', X(35.5), Y(13.7), 13);

	// Overall dimension along the top edge.
	ctx.strokeStyle = ink; ctx.lineWidth = 1;
	ctx.beginPath(); ctx.moveTo(L, T - 26); ctx.lineTo(R, T - 26); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(L, T - 32); ctx.lineTo(L, T - 20); ctx.moveTo(R, T - 32); ctx.lineTo(R, T - 20); ctx.stroke();
	label('12.5 m', (L + R) / 2, T - 40, 16);

	// North arrow (top-right of the plan).
	const nx = R - 26, ny = T + 40;
	ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2;
	ctx.beginPath(); ctx.moveTo(nx, ny - 22); ctx.lineTo(nx - 7, ny); ctx.lineTo(nx + 7, ny); ctx.closePath(); ctx.fill();
	ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx, ny + 16); ctx.stroke();
	label('N', nx, ny + 28, 15);

	// Title block.
	const ty = areaB + 40;
	ctx.strokeStyle = ink; ctx.lineWidth = 2;
	ctx.beginPath(); ctx.moveTo(56, ty - 14); ctx.lineTo(W - 56, ty - 14); ctx.stroke();
	ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = ink;
	ctx.font = '800 40px "Arial Black", Impact, sans-serif';
	ctx.fillText('THE WORDPRESS PLAYGROUND', 64, ty + 32);
	ctx.font = '700 22px "Courier New", monospace';
	ctx.fillText('ANNEX · FLOOR PLAN · PLAN VIEW', 64, ty + 66);
	ctx.textAlign = 'right';
	ctx.fillText('SHEET A-01', W - 64, ty + 32);
	ctx.fillText('EST. 2022', W - 64, ty + 66);
	// Scale bar.
	const sb = 5 * s; // 5 metres
	const sbx = 64, sby = ty + 104;
	ctx.strokeStyle = ink; ctx.lineWidth = 2;
	ctx.beginPath(); ctx.moveTo(sbx, sby); ctx.lineTo(sbx + sb, sby); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(sbx, sby - 6); ctx.lineTo(sbx, sby + 6); ctx.moveTo(sbx + sb, sby - 6); ctx.lineTo(sbx + sb, sby + 6); ctx.stroke();
	ctx.textAlign = 'left'; ctx.font = '700 18px "Courier New", monospace';
	ctx.fillText('0', sbx - 4, sby + 24); ctx.fillText('5 m', sbx + sb - 14, sby + 24);
	ctx.textAlign = 'right'; ctx.font = 'italic 700 20px "Courier New", monospace';
	ctx.fillText('A REAL BLUEPRINT — NO JSON REQUIRED', W - 64, sby + 22);

	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createPlaygroundSignTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 693; // ~1.48 aspect, matches the 3.4×2.3 board
	const ctx = canvas.getContext('2d');
	const w = canvas.width;
	const h = canvas.height;
	const bronze = '#7c5a22';
	const serif = 'Georgia, "Times New Roman", serif';

	drawMuralMarbleField(ctx, w, h);
	drawMuralBorder(ctx, w, h, bronze);

	ctx.textAlign = 'center';
	drawEngravedText(ctx, 'WORDPRESS', w / 2, h * 0.15, w * 0.82, h * 0.12, '700', serif, bronze);
	drawEngravedText(ctx, 'PLAYGROUND', w / 2, h * 0.27, w * 0.82, h * 0.12, '700', serif, bronze);

	ctx.fillStyle = bronze;
	ctx.fillRect(w / 2 - w * 0.17, h * 0.355, w * 0.34, 3);

	const body = [
		'Run WordPress instantly in your browser —',
		'no server, no install, powered by WebAssembly.',
		'A safe place to experiment. Since 2022.',
	];
	body.forEach((line, i) =>
		drawEngravedText(ctx, line, w / 2, h * 0.46 + i * h * 0.082, w * 0.84, h * 0.05, '400', serif, '#5d5132')
	);

	drawEngravedText(ctx, 'YES — AN ACTUAL PLAYGROUND.', w / 2, h * 0.75, w * 0.8, h * 0.062, '700', serif, bronze);
	drawEngravedText(
		ctx,
		'(the sandbox is over there → a real code sandbox, too)',
		w / 2,
		h * 0.86,
		w * 0.84,
		h * 0.042,
		'italic 400',
		serif,
		'#6a5d3c'
	);

	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

// ── Generic era side-room annexes ─────────────────────────────────────────
// Resolve each configured annex to its world placement. The annex local frame
// is: +z (forward) out through the gallery's right chamfer, +x (sideways) along
// the chamfer, +y up. The doorway centre sits at the chamfer midpoint.
function computeEraAnnexes() {
	if (!isCurrentVariant) {
		return [];
	}
	return ERA_ANNEX_CONFIGS.flatMap((config) => {
		const room = roomLayout.get(config.era);
		if (!room) {
			return [];
		}
		const forward = room.tangent.clone().add(room.normal).normalize();
		const sideways = getTangentForNormal(forward);
		const center = roomLocalToWorld(room, annexChamferLocalMid.clone());
		center.y = 0;
		// Corner A (the chamfer's +s end) is the octagon vertex shared with the
		// next gallery, whose own chamfer emanates from there. Hold the +s wall
		// right at that vertex so the neighbour's bevel never pokes inside, and
		// grow the room toward the open -s side to reach the configured width.
		const depth = config.depth ?? 10;
		const sMax = annexChamferHalfLen;
		const sMin = sMax - (config.width ?? 10);
		return [{
			config,
			room,
			forward,
			sideways,
			center,
			rotationY: getRotationForNormal(forward),
			depth,
			sMin,
			sMax,
		}];
	});
}

function getEraAnnexForRoom(era) {
	return eraAnnexes.find((annex) => annex.config.era === era) || null;
}

// True when a gallery's right chamfer has been replaced by an annex doorway (so
// its chamfer wall is skipped and any exhibit slot there must move to the back).
function roomChamferIsDoored(era) {
	return isCurrentVariant && !!era && (era === eras[6] || eraAnnexEras.has(era));
}

function createEraAnnexes() {
	const group = new THREE.Group();
	for (const annex of eraAnnexes) {
		group.add(createEraAnnex(annex));
	}
	return group;
}

function createEraAnnex(annex) {
	const group = new THREE.Group();
	group.position.copy(annex.center);
	group.rotation.y = annex.rotationY;
	const { config } = annex;
	const wt = annexWallThickness;
	const sMin = annex.sMin;
	const sMax = annex.sMax;
	const sMid = (sMin + sMax) / 2;
	const width = sMax - sMin;
	const depth = annex.depth;

	// Floor — marble-consistent but tinted to the room's palette.
	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(width, depth),
		createMuseumMaterial('roomFloor', {
			repeatX: width / floorTileSpan,
			repeatY: depth / floorTileSpan,
			color: config.floorColor ?? 0xffffff,
			roughness: 0.32,
			metalness: 0.2,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(sMid, 0.012, depth / 2);
	group.add(floor);

	const wallMaterial = createMuseumMaterial('roomWall', {
		repeatX: width / 4.6,
		repeatY: annexHeight / 2.4,
		color: config.wallColor ?? wallWarmTint,
		roughness: 0.9,
		metalness: 0.04,
	});

	// Doored chamfer wall (gallery side, f = 0) with jambs, lintel and signs.
	group.add(createEraAnnexDoorWall(annex, wallMaterial));

	// Far wall (f = depth) and the two side walls (s = sMin / sMax). The width
	// walls overrun the sides by wt so the four corners close with no slivers.
	const farWall = new THREE.Mesh(
		new THREE.BoxGeometry(width + wt * 2, annexHeight, wt),
		wallMaterial
	);
	farWall.position.set(sMid, annexHeight / 2, depth + wt / 2);
	group.add(farWall);
	for (const s of [sMin, sMax]) {
		const wall = new THREE.Mesh(
			new THREE.BoxGeometry(wt, annexHeight, depth),
			wallMaterial
		);
		wall.position.set(s === sMax ? s - wt / 2 : s, annexHeight / 2, depth / 2);
		group.add(wall);
	}

	// Skirting around the three solid walls.
	const trimMat = new THREE.MeshStandardMaterial({ color: 0xd9c8a6, roughness: 0.6, metalness: 0.1 });
	const farTrim = new THREE.Mesh(new THREE.BoxGeometry(width, 0.22, 0.06), trimMat);
	farTrim.position.set(sMid, 0.11, depth - 0.04);
	group.add(farTrim);
	for (const s of [sMin, sMax]) {
		const trim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, depth), trimMat);
		trim.position.set(s + (s < sMid ? 0.04 : -0.04), 0.11, depth / 2);
		group.add(trim);
	}

	// Solid ceiling with a cream cove, plus warm interior light.
	const ceiling = new THREE.Mesh(
		new THREE.PlaneGeometry(width + wt * 2, depth + wt * 2),
		new THREE.MeshStandardMaterial({ color: config.ceilingColor ?? 0x2c2418, roughness: 0.92, metalness: 0.02 })
	);
	ceiling.rotation.x = Math.PI / 2;
	ceiling.position.set(sMid, annexHeight - 0.02, depth / 2);
	group.add(ceiling);
	// Brass-and-cream cornice rim hugging the four wall tops (not a full slab).
	const brassBand = new THREE.MeshStandardMaterial({ color: 0xf2cf86, emissive: 0x3a2710, emissiveIntensity: 0.12, roughness: 0.3, metalness: 0.5 });
	const creamBand = new THREE.MeshStandardMaterial({ color: 0xf2e7c9, roughness: 0.6, metalness: 0.08 });
	const railY = annexHeight - 0.16;
	const coveY = annexHeight - 0.4;
	const addBand = (geo, mat, y, s, f) => {
		const band = new THREE.Mesh(geo, mat);
		band.position.set(s, y, f);
		group.add(band);
	};
	for (const f of [0.05, depth - 0.05]) {
		addBand(new THREE.BoxGeometry(width, 0.16, 0.16), brassBand, railY, sMid, f);
		addBand(new THREE.BoxGeometry(width, 0.3, 0.26), creamBand, coveY, sMid, f);
	}
	for (const s of [sMin + 0.05, sMax - 0.05]) {
		addBand(new THREE.BoxGeometry(0.16, 0.16, depth), brassBand, railY, s, depth / 2);
		addBand(new THREE.BoxGeometry(0.26, 0.3, depth), creamBand, coveY, s, depth / 2);
	}
	const light = new THREE.PointLight(config.light ?? 0xfff1d4, 1.35, 26);
	light.position.set(sMid, annexHeight - 0.7, depth * 0.52);
	group.add(light);
	const fill = new THREE.PointLight(0xeaf0ff, 0.45, 18);
	fill.position.set(sMid, annexHeight - 1.4, depth * 0.18);
	group.add(fill);

	// Themed contents, authored in the annex local frame.
	if (config.build) {
		config.build({
			group,
			annex,
			config,
			depth,
			width,
			sMin,
			sMax,
			sMid,
			height: annexHeight,
			accent: config.accent,
			place(object, s, f, y = 0, rotY = 0) {
				object.position.set(s, y, f);
				object.rotation.y = rotY;
				group.add(object);
				return object;
			},
		});
	}
	return group;
}

// The doored chamfer wall: solid panels either side of the opening, a header
// above it, a brass post-and-lintel frame and threshold on the annex face, a
// destination sign on the gallery face and a return sign on the annex face.
function createEraAnnexDoorWall(annex, wallMaterial) {
	const group = new THREE.Group();
	const { config } = annex;
	const wt = annexWallThickness;
	const dHalf = annexDoorHalfWidth;
	const sLo = annex.sMin - wt;
	// sMax is the octagon vertex shared with the neighbouring gallery, so the +s
	// jamb stops AT it — overrunning by wt pokes a dark wall slab into that gallery
	// (a tall black bar once the annex rises to full height).
	const sHi = annex.sMax;
	const addSeg = (s0, s1, height, yCenter) => {
		const len = s1 - s0;
		if (len < 0.02) {
			return;
		}
		const seg = new THREE.Mesh(new THREE.BoxGeometry(len, height, wt), wallMaterial);
		seg.position.set((s0 + s1) / 2, yCenter, 0);
		group.add(seg);
	};
	addSeg(sLo, -dHalf, annexHeight, annexHeight / 2); // -s of door
	addSeg(dHalf, sHi, annexHeight, annexHeight / 2); // +s of door
	const headerH = annexHeight - annexDoorHeight;
	addSeg(-dHalf, dHalf, headerH, annexDoorHeight + headerH / 2); // header

	// Brass post-and-lintel frame on the annex (interior, +f) face.
	const brass = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.1,
		roughness: 0.32,
		metalness: 0.5,
	});
	const faceF = wt / 2 + 0.03;
	const lintel = new THREE.Mesh(new THREE.BoxGeometry(dHalf * 2 + 0.36, 0.2, 0.2), brass);
	lintel.position.set(0, annexDoorHeight + 0.06, faceF);
	group.add(lintel);
	for (const s of [-dHalf, dHalf]) {
		const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, annexDoorHeight + 0.16, 0.18), brass);
		post.position.set(s + (s < 0 ? -0.09 : 0.09), (annexDoorHeight + 0.16) / 2, faceF);
		group.add(post);
	}
	const threshold = new THREE.Mesh(new THREE.BoxGeometry(dHalf * 2, 0.05, wt + 0.24), brass);
	threshold.position.set(0, 0.025, 0);
	group.add(threshold);

	// Destination sign on the gallery (-f) face; return sign on the annex (+f) face.
	const destSign = createReadableLabel(createSmallSignTexture(config.title, config.accent), 1.95, 0.44);
	destSign.position.set(0, annexDoorHeight + headerH * 0.42, -wt / 2 - 0.05);
	destSign.rotation.y = Math.PI; // face the gallery
	group.add(destSign);
	const returnSign = createReadableLabel(createSmallSignTexture('← GALLERY', config.accent), 1.7, 0.4);
	returnSign.position.set(0, annexDoorHeight + headerH * 0.42, faceF + 0.05);
	group.add(returnSign);

	const glow = new THREE.PointLight(config.glow ?? 0xffd8a0, 2.6, 6, 2);
	glow.position.set(0, annexDoorHeight - 0.6, 0.2);
	group.add(glow);
	return group;
}

// Walkability for a generic annex: a doorway band straddling the chamfer plane
// into the gallery, plus the annex interior rectangle. Mirrors isPointInsidePlayground.
function isPointInsideEraAnnex(position, annex) {
	const dx = position.x - annex.center.x;
	const dz = position.z - annex.center.z;
	const f = dx * annex.forward.x + dz * annex.forward.z;
	const s = dx * annex.sideways.x + dz * annex.sideways.z;
	const padding = 0.5;
	if (Math.abs(s) <= annexDoorHalfWidth - 0.2 && f >= -1.2 && f <= padding + 0.3) {
		return true;
	}
	return (
		f >= padding &&
		f <= annex.depth - padding &&
		s >= annex.sMin + padding &&
		s <= annex.sMax - padding
	);
}

// VI · Block Editor → a velvet-roped Victorian period room preserving the classic
// TinyMCE editor as a nostalgic foil to the block era next door.
function buildClassicEditorAnnex(ctx) {
	const { depth, sMid, sMin, sMax, height } = ctx;

	// Persian-style rug anchoring the parlour in front of the bureau.
	ctx.place(createParlorRug(3.8, 4.8), sMid, depth * 0.6, 0.02);

	// The bureau: the classic TinyMCE editor on a beige CRT, against the far wall,
	// turned to face the doorway so visitors meet the relic head-on.
	ctx.place(createClassicEditorBureau(), sMid, depth - 1.0, 0, Math.PI);

	// Velvet rope keeping visitors back from the precious relic.
	ctx.group.add(createMuseumRopeLine(
		[
			{ x: sMid - 1.95, z: depth - 2.9 },
			{ x: sMid - 0.95, z: depth - 3.15 },
			{ x: sMid + 0.95, z: depth - 3.15 },
			{ x: sMid + 1.95, z: depth - 2.9 },
		],
		0x8a1f2a,
		{ postHeight: 0.8, ropeY: 0.82, capRadius: 0.07 }
	));

	// Ornate gold-framed museum placard high on the far wall.
	const placard = createOrnateFramedPanel(createClassicEditorPlacardTexture(), 2.6, 1.5);
	placard.position.set(sMid, 3.62, depth - 0.16);
	placard.rotation.y = Math.PI;
	ctx.group.add(placard);

	// Side-wall gags: a one-star "bring back the old editor" review, and a framed
	// TinyMCE toolbar "specimen", both ornately framed like prized portraits.
	const review = createOrnateFramedPanel(createAngryReviewTexture(), 2.0, 1.4);
	review.position.set(sMax - 0.16, 2.55, depth * 0.46);
	review.rotation.y = -Math.PI / 2;
	ctx.group.add(review);
	const toolbar = createOrnateFramedPanel(createTinyMceSpecimenTexture(), 2.3, 1.05);
	toolbar.position.set(sMin + 0.16, 2.7, depth * 0.46);
	toolbar.rotation.y = Math.PI / 2;
	ctx.group.add(toolbar);

	// Warm parlour pendant overhead.
	ctx.group.add(createParlorPendant(sMid, depth * 0.52, height));
}

function createParlorRug(w, d) {
	const group = new THREE.Group();
	const base = new THREE.Mesh(
		new THREE.PlaneGeometry(w, d),
		new THREE.MeshStandardMaterial({ color: 0x6e1f2a, roughness: 0.95, metalness: 0.02 })
	);
	base.rotation.x = -Math.PI / 2;
	group.add(base);
	const inner = new THREE.Mesh(
		new THREE.PlaneGeometry(w - 0.5, d - 0.5),
		new THREE.MeshStandardMaterial({ color: 0x9a3340, roughness: 0.95, metalness: 0.02 })
	);
	inner.rotation.x = -Math.PI / 2;
	inner.position.y = 0.004;
	group.add(inner);
	const medallion = new THREE.Mesh(
		new THREE.CircleGeometry(Math.min(w, d) * 0.26, 28),
		new THREE.MeshStandardMaterial({ color: 0xd9b25a, roughness: 0.9, metalness: 0.05 })
	);
	medallion.rotation.x = -Math.PI / 2;
	medallion.position.y = 0.006;
	group.add(medallion);
	return group;
}

// A beige period PC running the classic TinyMCE editor, on a carved writing
// bureau with a green banker's lamp. Modelled facing +z (the caller turns it).
function createClassicEditorBureau() {
	const group = new THREE.Group();
	const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.55, metalness: 0.08 });
	const woodDark = new THREE.MeshStandardMaterial({ color: 0x3f2814, roughness: 0.6, metalness: 0.06 });

	// Bureau base + top.
	const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.74, 0.74), wood);
	base.position.set(0, 0.37, 0);
	group.add(base);
	const top = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.07, 0.86), woodDark);
	top.position.set(0, 0.77, 0);
	group.add(top);
	for (const x of [-0.78, 0.78]) {
		const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.02), woodDark);
		drawer.position.set(x, 0.4, 0.38);
		group.add(drawer);
		const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.3, metalness: 0.6 }));
		knob.position.set(x, 0.4, 0.4);
		group.add(knob);
	}

	// Beige CRT monitor with the classic editor on screen.
	const beige = new THREE.MeshStandardMaterial({ color: 0xe6dcc2, roughness: 0.7, metalness: 0.05 });
	const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.56), beige);
	monitor.position.set(0, 1.08, -0.02);
	group.add(monitor);
	const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.04), new THREE.MeshStandardMaterial({ color: 0x222018, roughness: 0.5 }));
	bezel.position.set(0, 1.1, 0.27);
	group.add(bezel);
	const screen = new THREE.Mesh(
		new THREE.PlaneGeometry(0.44, 0.34),
		new THREE.MeshBasicMaterial({ map: createClassicEditorScreenTexture() })
	);
	screen.position.set(0, 1.1, 0.295);
	group.add(screen);
	// Faint screen glow.
	const glow = new THREE.PointLight(0xbfe0ff, 0.5, 2.2);
	glow.position.set(0, 1.1, 0.6);
	group.add(glow);

	// Keyboard.
	const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.05, 0.24), beige);
	keyboard.position.set(0, 0.82, 0.5);
	keyboard.rotation.x = -0.08;
	group.add(keyboard);

	// Green banker's lamp.
	const brass = new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.3, metalness: 0.6 });
	const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.04, 16), brass);
	lampBase.position.set(0.72, 0.82, 0.2);
	group.add(lampBase);
	const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 10), brass);
	lampStem.position.set(0.72, 0.99, 0.2);
	group.add(lampStem);
	const shade = new THREE.Mesh(
		new THREE.CylinderGeometry(0.13, 0.13, 0.1, 18, 1, true),
		new THREE.MeshStandardMaterial({ color: 0x1f6b3a, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide, emissive: 0x0d3b1f, emissiveIntensity: 0.3 })
	);
	shade.rotation.z = Math.PI / 2;
	shade.position.set(0.72, 1.14, 0.2);
	group.add(shade);
	const lampGlow = new THREE.PointLight(0xfff0c0, 0.6, 2.4);
	lampGlow.position.set(0.72, 1.1, 0.25);
	group.add(lampGlow);
	return group;
}

function createClassicEditorScreenTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 400;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#f1f1f1';
	ctx.fillRect(0, 0, 512, 400);
	// Admin bar.
	ctx.fillStyle = '#23282d';
	ctx.fillRect(0, 0, 512, 26);
	ctx.fillStyle = '#cdd';
	ctx.font = '13px sans-serif';
	ctx.textAlign = 'left';
	ctx.fillText('My WordPress  ·  + New', 10, 18);
	// Page heading.
	ctx.fillStyle = '#23282d';
	ctx.font = '700 22px Georgia, serif';
	ctx.fillText('Add New Post', 18, 56);
	// Title field.
	ctx.fillStyle = '#fff';
	ctx.fillRect(18, 70, 476, 36);
	ctx.strokeStyle = '#ddd';
	ctx.strokeRect(18, 70, 476, 36);
	ctx.fillStyle = '#a0a5aa';
	ctx.font = 'italic 17px sans-serif';
	ctx.fillText('Enter title here', 28, 94);
	// Editor box: Add Media + tabs.
	ctx.fillStyle = '#fff';
	ctx.fillRect(18, 118, 476, 260);
	ctx.strokeStyle = '#ddd';
	ctx.strokeRect(18, 118, 476, 260);
	ctx.fillStyle = '#f3f3f3';
	ctx.fillRect(18, 118, 476, 34);
	// Add Media button.
	ctx.fillStyle = '#f7f7f7';
	ctx.strokeStyle = '#ccc';
	ctx.fillRect(28, 124, 96, 22);
	ctx.strokeRect(28, 124, 96, 22);
	ctx.fillStyle = '#444';
	ctx.font = '12px sans-serif';
	ctx.fillText('▣ Add Media', 34, 139);
	// Visual / Text tabs.
	ctx.fillStyle = '#fff';
	ctx.fillRect(404, 122, 44, 24);
	ctx.fillStyle = '#f1f1f1';
	ctx.fillRect(448, 122, 38, 24);
	ctx.fillStyle = '#444';
	ctx.fillText('Visual', 408, 138);
	ctx.fillText('Text', 454, 138);
	// Formatting toolbar row.
	ctx.fillStyle = '#fafafa';
	ctx.fillRect(18, 152, 476, 30);
	ctx.fillStyle = '#333';
	ctx.font = '700 15px Georgia, serif';
	const tools = ['B', 'I', 'U', '“', '☰', '⟝', '🔗', 'A'];
	tools.forEach((t, i) => ctx.fillText(t, 30 + i * 30, 173));
	// Body text lines + blinking caret.
	ctx.fillStyle = '#2b2b2b';
	ctx.font = '15px Georgia, serif';
	ctx.fillText('Hello world. Just write — no blocks,', 30, 214);
	ctx.fillText('no slash commands, no sidebars.', 30, 238);
	ctx.fillText('A text box and a blinking cursor.', 30, 262);
	ctx.fillStyle = '#222';
	ctx.fillRect(322, 250, 2, 16); // caret
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

// A gilt picture frame around a flat panel; the art faces +z (single-sided).
function createOrnateFramedPanel(texture, w, h) {
	const group = new THREE.Group();
	const gold = new THREE.MeshStandardMaterial({ color: 0xcB9a3a, roughness: 0.34, metalness: 0.6, emissive: 0x2a1d06, emissiveIntensity: 0.12 });
	const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.22, h + 0.22, 0.1), gold);
	group.add(frame);
	const matte = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.04, h + 0.04), new THREE.MeshStandardMaterial({ color: 0x14100a, roughness: 0.8 }));
	matte.position.z = 0.052;
	group.add(matte);
	const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
	art.position.z = 0.056;
	group.add(art);
	// Corner finials.
	for (const sx of [-1, 1]) {
		for (const sy of [-1, 1]) {
			const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), gold);
			knob.position.set(sx * (w + 0.22) / 2, sy * (h + 0.22) / 2, 0.06);
			group.add(knob);
		}
	}
	return group;
}

function createClassicEditorPlacardTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 900;
	canvas.height = 520;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#f4ead0';
	ctx.fillRect(0, 0, 900, 520);
	ctx.fillStyle = '#1a1208';
	ctx.fillRect(0, 0, 900, 12);
	ctx.fillRect(0, 508, 900, 12);
	ctx.textAlign = 'center';
	ctx.fillStyle = '#241a0c';
	ctx.font = '900 56px "Arial Black", Impact, sans-serif';
	ctx.fillText('THE CLASSIC EDITOR', 450, 92);
	ctx.fillStyle = '#7a5a1c';
	ctx.font = 'italic 600 30px Georgia, serif';
	ctx.fillText('TinyMCE · "What You See Is What You Get"', 450, 138);
	ctx.fillStyle = '#33271a';
	ctx.font = '26px Georgia, serif';
	ctx.textAlign = 'left';
	const lines = [
		'The writing screen WordPress knew from the rich',
		'editor of 2.0 (2005) to the eve of Gutenberg.',
		'Retired as the default in 5.0 (December 2018) when',
		'blocks took the stage next door.',
		'',
		'Preserved by the Classic Editor plugin — five million',
		'installs strong, with core support pledged through 2024.',
	];
	lines.forEach((l, i) => ctx.fillText(l, 70, 196 + i * 40));
	ctx.textAlign = 'center';
	ctx.fillStyle = '#7a1c22';
	ctx.font = 'italic 700 26px Georgia, serif';
	ctx.fillText('Please do not touch the keyboard.', 450, 492);
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createAngryReviewTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 700;
	canvas.height = 500;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, 700, 500);
	ctx.fillStyle = '#f6f7f7';
	ctx.fillRect(0, 0, 700, 70);
	ctx.fillStyle = '#1d2327';
	ctx.font = '700 30px sans-serif';
	ctx.textAlign = 'left';
	ctx.fillText('Plugin Reviews', 30, 46);
	// Stars: 1 filled, 4 empty.
	ctx.font = '40px sans-serif';
	ctx.fillStyle = '#ffb900';
	ctx.fillText('★', 30, 130);
	ctx.fillStyle = '#dcdcde';
	ctx.fillText('★★★★', 72, 130);
	ctx.fillStyle = '#1d2327';
	ctx.font = '700 30px Georgia, serif';
	ctx.fillText('Bring back the old editor!!!', 30, 184);
	ctx.fillStyle = '#3c434a';
	ctx.font = '24px Georgia, serif';
	const body = [
		'I just want to write. Why is everything a',
		'block now? Where did my text box go?',
		'Installing Classic Editor immediately.',
	];
	body.forEach((l, i) => ctx.fillText(l, 30, 232 + i * 34));
	ctx.fillStyle = '#787c82';
	ctx.font = 'italic 22px Georgia, serif';
	ctx.fillText('— a beloved user, December 2018', 30, 360);
	ctx.strokeStyle = '#dcdcde';
	ctx.beginPath();
	ctx.moveTo(30, 392);
	ctx.lineTo(670, 392);
	ctx.stroke();
	ctx.fillStyle = '#2271b1';
	ctx.font = '700 24px sans-serif';
	ctx.fillText('Classic Editor', 30, 430);
	ctx.fillStyle = '#50575e';
	ctx.font = '22px sans-serif';
	ctx.fillText('5+ million active installations', 30, 462);
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createTinyMceSpecimenTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 760;
	canvas.height = 340;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fbf7ec';
	ctx.fillRect(0, 0, 760, 340);
	ctx.fillStyle = '#241a0c';
	ctx.textAlign = 'center';
	ctx.font = '900 34px "Arial Black", Impact, sans-serif';
	ctx.fillText('TINYMCE TOOLBAR — SPECIMEN', 380, 56);
	// Toolbar mock.
	ctx.fillStyle = '#f3f3f3';
	ctx.fillRect(60, 92, 640, 64);
	ctx.strokeStyle = '#ccc';
	ctx.strokeRect(60, 92, 640, 64);
	ctx.fillStyle = '#333';
	ctx.font = '700 28px Georgia, serif';
	const tools = ['B', 'I', 'U', '"', '☰', '≣', '⟝', '🔗', 'A'];
	tools.forEach((t, i) => {
		ctx.strokeRect(74 + i * 68, 104, 56, 40);
		ctx.fillText(t, 102 + i * 68, 132);
	});
	ctx.fillStyle = '#7a5a1c';
	ctx.font = 'italic 600 24px Georgia, serif';
	ctx.fillText('Bold, italics, a link, a list. That was the whole inserter.', 380, 220);
	ctx.fillStyle = '#33271a';
	ctx.font = '22px Georgia, serif';
	ctx.fillText('No slash commands. No block library. No sidebars.', 380, 264);
	ctx.fillText('Just the keys, and the cursor, and you.', 380, 300);
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createParlorPendant(s, f, height) {
	const group = new THREE.Group();
	const brass = new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.3, metalness: 0.6 });
	const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), brass);
	cord.position.set(s, height - 0.5, f);
	group.add(cord);
	const shade = new THREE.Mesh(
		new THREE.ConeGeometry(0.42, 0.34, 20, 1, true),
		new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide, emissive: 0x2a1c08, emissiveIntensity: 0.3 })
	);
	shade.position.set(s, height - 1.05, f);
	group.add(shade);
	const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
	bulb.position.set(s, height - 1.14, f);
	group.add(bulb);
	const light = new THREE.PointLight(0xffe6b0, 0.8, 7);
	light.position.set(s, height - 1.2, f);
	group.add(light);
	return group;
}

// V · API & Customizer → a humming server room behind the glowing /wp-json door:
// racks of blinking gear, patch cables and JSON readouts — the CMS as a backend.
function buildServerRoomAnnex(ctx) {
	const { depth, sMid, sMin, sMax } = ctx;

	// Raised-floor cable tray glowing down the central aisle.
	const tray = new THREE.Mesh(
		new THREE.PlaneGeometry(0.9, depth - 1.6),
		new THREE.MeshBasicMaterial({ color: 0x0d2b33 })
	);
	tray.rotation.x = -Math.PI / 2;
	tray.position.set(sMid, 0.02, depth / 2);
	ctx.group.add(tray);
	const trayGlow = new THREE.Mesh(
		new THREE.PlaneGeometry(0.16, depth - 2.0),
		new THREE.MeshBasicMaterial({ color: 0x46e0d2 })
	);
	trayGlow.rotation.x = -Math.PI / 2;
	trayGlow.position.set(sMid, 0.03, depth / 2);
	ctx.group.add(trayGlow);

	// Server racks lining both side walls, fronts facing the aisle.
	[2.2, 4.2, 6.3].forEach((f, i) => {
		ctx.place(createServerRack(i), sMin + 0.5, f, 0, Math.PI / 2); // left wall, faces +s
		ctx.place(createServerRack(i + 3), sMax - 0.5, f, 0, -Math.PI / 2); // right wall, faces -s
	});

	// Far-wall glowing /wp-json console with a JSON readout.
	ctx.place(createWpJsonConsole(), sMid, depth - 0.55, 0, Math.PI);

	// Catenary patch cables strung above the aisle for flavour.
	const cable = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 });
	ctx.group.add(createRopeSegment({ x: sMin + 0.8, z: 2.2 }, { x: sMin + 0.8, z: 6.3 }, 2.05, 0.03, cable(0xff7043)));
	ctx.group.add(createRopeSegment({ x: sMax - 0.8, z: 2.2 }, { x: sMax - 0.8, z: 6.3 }, 2.05, 0.03, cable(0x46e0d2)));
	ctx.group.add(createRopeSegment({ x: sMin + 0.8, z: 6.3 }, { x: sMax - 0.8, z: 6.3 }, 2.0, 0.03, cable(0xffd23f)));

	// Wall placard (door side) + a JSON terminal opposite, both visible on entry.
	const placard = createWallScreen(createServerRoomPlacardTexture(), 2.5, 1.45);
	placard.position.set(sMax - 0.12, 3.3, 2.2);
	placard.rotation.y = -Math.PI / 2;
	ctx.group.add(placard);
	const term = createWallScreen(createJsonScreenTexture(), 2.4, 1.7);
	term.position.set(sMin + 0.12, 3.2, 2.2);
	term.rotation.y = Math.PI / 2;
	ctx.group.add(term);
}

// A 2.2m server cabinet, front (+z) lined with rack units and blinking LEDs.
function createServerRack(seed) {
	const group = new THREE.Group();
	const cabinet = new THREE.Mesh(
		new THREE.BoxGeometry(1.3, 2.2, 0.9),
		new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.6, metalness: 0.4 })
	);
	cabinet.position.y = 1.1;
	group.add(cabinet);
	const unitMat = new THREE.MeshStandardMaterial({ color: 0x24292f, roughness: 0.5, metalness: 0.5 });
	const ledColors = [0x49f06a, 0xffb000, 0x46e0d2, 0x4f9bff];
	const units = 8;
	for (let u = 0; u < units; u++) {
		const y = 0.28 + u * 0.24;
		const unit = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.18, 0.02), unitMat);
		unit.position.set(0, y, 0.46);
		group.add(unit);
		// A vent slot.
		const vent = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.012), new THREE.MeshStandardMaterial({ color: 0x0c0e11 }));
		vent.position.set(-0.12, y, 0.475);
		group.add(vent);
		// Blinking LEDs on the right of each unit.
		for (let l = 0; l < 3; l++) {
			const color = ledColors[(seed * 5 + u * 3 + l) % ledColors.length];
			const led = new THREE.Mesh(
				new THREE.BoxGeometry(0.035, 0.035, 0.02),
				new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
			);
			led.position.set(0.42 + l * 0.07, y, 0.475);
			const phase = (seed * 11 + u * 7 + l * 13) * 0.37;
			const speed = 1.4 + ((seed + u + l) % 3) * 0.7;
			registerAnimation(led, (object, elapsed) => {
				object.material.opacity = 0.25 + 0.7 * (0.5 + 0.5 * Math.sin(elapsed * speed + phase));
			});
			group.add(led);
		}
	}
	return group;
}

// The far-wall mainframe: a dark console crowned by a glowing "/wp-json" panel
// over a live JSON readout, flanked by LED strips.
function createWpJsonConsole() {
	const group = new THREE.Group();
	const cabinet = new THREE.Mesh(
		new THREE.BoxGeometry(3.2, 3.0, 0.5),
		new THREE.MeshStandardMaterial({ color: 0x12161b, roughness: 0.55, metalness: 0.45 })
	);
	cabinet.position.set(0, 1.5, 0);
	group.add(cabinet);
	const sign = createWallScreen(createWpJsonSignTexture(), 2.6, 0.7);
	sign.position.set(0, 2.4, 0.27);
	group.add(sign);
	const readout = createWallScreen(createJsonScreenTexture(), 2.3, 1.35);
	readout.position.set(0, 1.2, 0.27);
	group.add(readout);
	const consoleGlow = new THREE.PointLight(0x46e0d2, 0.9, 6);
	consoleGlow.position.set(0, 1.6, 1.0);
	group.add(consoleGlow);
	// LED strips up the sides.
	for (const x of [-1.5, 1.5]) {
		for (let i = 0; i < 8; i++) {
			const led = new THREE.Mesh(
				new THREE.BoxGeometry(0.05, 0.05, 0.02),
				new THREE.MeshBasicMaterial({ color: 0x46e0d2, transparent: true, opacity: 0.8 })
			);
			led.position.set(x, 0.5 + i * 0.3, 0.26);
			const phase = (x + i) * 0.6;
			registerAnimation(led, (object, elapsed) => {
				object.material.opacity = 0.2 + 0.7 * (0.5 + 0.5 * Math.sin(elapsed * 2.2 + phase));
			});
			group.add(led);
		}
	}
	return group;
}

// A dark-bezel wall screen whose art reads as self-lit (MeshBasic). Art faces +z.
function createWallScreen(texture, w, h) {
	const group = new THREE.Group();
	const bezel = new THREE.Mesh(
		new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.08),
		new THREE.MeshStandardMaterial({ color: 0x0f1318, roughness: 0.5, metalness: 0.5 })
	);
	group.add(bezel);
	const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
	screen.position.z = 0.05;
	group.add(screen);
	return group;
}

function createWpJsonSignTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 768;
	canvas.height = 200;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#06141a';
	ctx.fillRect(0, 0, 768, 200);
	ctx.strokeStyle = '#0e3b44';
	ctx.lineWidth = 6;
	ctx.strokeRect(8, 8, 752, 184);
	ctx.fillStyle = '#46e0d2';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '900 96px "Courier New", monospace';
	ctx.shadowColor = '#46e0d2';
	ctx.shadowBlur = 18;
	ctx.fillText('/wp-json', 384, 104);
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createJsonScreenTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 560;
	canvas.height = 400;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#071318';
	ctx.fillRect(0, 0, 560, 400);
	ctx.font = '20px "Courier New", monospace';
	ctx.textAlign = 'left';
	const line = (text, x, y, color) => { ctx.fillStyle = color; ctx.fillText(text, x, y); };
	line('GET /wp-json/wp/v2/posts', 20, 36, '#7fdcff');
	line('200 OK  ·  application/json', 20, 62, '#5b6b70');
	const rows = [
		['[', '#cdd6da'],
		['  {', '#cdd6da'],
		['    "id": 1,', '#9cdcfe'],
		['    "slug": "hello-world",', '#9cdcfe'],
		['    "title": {', '#9cdcfe'],
		['      "rendered": "Hello world!"', '#ce9178'],
		['    },', '#cdd6da'],
		['    "status": "publish"', '#9cdcfe'],
		['  }', '#cdd6da'],
		[']', '#cdd6da'],
	];
	rows.forEach((r, i) => line(r[0], 20, 96 + i * 28, r[1]));
	// Blinking-ish cursor block (static frame).
	ctx.fillStyle = '#46e0d2';
	ctx.fillRect(28, 372, 12, 18);
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createServerRoomPlacardTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 900;
	canvas.height = 520;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#0a1c22';
	ctx.fillRect(0, 0, 900, 520);
	ctx.fillStyle = '#46e0d2';
	ctx.fillRect(0, 0, 900, 10);
	ctx.fillRect(0, 510, 900, 10);
	ctx.textAlign = 'center';
	ctx.fillStyle = '#9ff3ea';
	ctx.font = '900 56px "Arial Black", Impact, sans-serif';
	ctx.fillText('THE REST API', 450, 92);
	ctx.fillStyle = '#5fb6c0';
	ctx.font = '600 30px "Courier New", monospace';
	ctx.fillText('a side door to your data', 450, 140);
	ctx.textAlign = 'left';
	ctx.fillStyle = '#cfe9ec';
	ctx.font = '26px Georgia, serif';
	const lines = [
		'Content endpoints landed in WordPress 4.7',
		'(December 2016). Behind /wp-json, posts, pages,',
		'users and media all speak JSON — so apps, other',
		'sites and scripts can read and write WordPress',
		'from anywhere.',
		'',
		'The day WordPress became a backend as well as a',
		'website. Mind the cables.',
	];
	lines.forEach((l, i) => ctx.fillText(l, 70, 196 + i * 38));
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

// IV · Modern Admin → a bright responsive lab: one flat MP6 dashboard shown at
// every size, from phone to wall display, with a full-size screen behind.
function buildDeviceLabAnnex(ctx) {
	const { depth, sMid, sMin, sMax } = ctx;
	const span = sMax - sMin;

	// MP6-blue runner under the test bench.
	const runner = new THREE.Mesh(
		new THREE.PlaneGeometry(Math.min(9, span - 0.6), 3.2),
		new THREE.MeshStandardMaterial({ color: 0x0a4f6b, roughness: 0.85 })
	);
	runner.rotation.x = -Math.PI / 2;
	runner.position.set(sMid, 0.02, depth * 0.56);
	ctx.group.add(runner);

	// The test bench.
	const bench = new THREE.Mesh(
		new THREE.BoxGeometry(span - 1.2, 0.72, 1.0),
		new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.5, metalness: 0.1 })
	);
	bench.position.set(sMid, 0.36, depth * 0.56);
	ctx.group.add(bench);

	// One dashboard, five screens, smallest → largest, all facing the door.
	const desktopTex = createMp6AdminTexture('desktop');
	const mobileTex = createMp6AdminTexture('mobile');
	const lineup = [
		['phone', mobileTex],
		['tablet', mobileTex],
		['laptop', desktopTex],
		['monitor', desktopTex],
		['tv', desktopTex],
	];
	const lo = sMin + 1.4;
	const hi = sMax - 1.1;
	lineup.forEach(([kind, tex], i) => {
		const s = lo + (hi - lo) * i / (lineup.length - 1);
		ctx.place(createMp6Device(kind, tex), s, depth * 0.56, 0.74, Math.PI);
	});

	// Far wall: a full-size dashboard, with the placard on a side wall.
	const display = createWallScreen(desktopTex, 3.0, 1.9);
	display.position.set(sMid, 3.15, depth - 0.14);
	display.rotation.y = Math.PI;
	ctx.group.add(display);
	const placard = createWallScreen(createDeviceLabPlacardTexture(), 2.4, 1.5);
	placard.position.set(sMax - 0.14, 2.7, depth * 0.4);
	placard.rotation.y = -Math.PI / 2;
	ctx.group.add(placard);
}

// A device showing the flat MP6 admin, modelled facing +z (the caller turns it).
function createMp6Device(kind, tex) {
	const g = new THREE.Group();
	const body = new THREE.MeshStandardMaterial({ color: 0x26292d, roughness: 0.4, metalness: 0.5 });
	const silver = new THREE.MeshStandardMaterial({ color: 0xc7ccd2, roughness: 0.4, metalness: 0.6 });
	const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.5 });
	const screen = (w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
	if (kind === 'phone') {
		const b = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.46, 0.03), body); b.position.y = 0.27; g.add(b);
		const sc = screen(0.2, 0.4); sc.position.set(0, 0.27, 0.018); g.add(sc);
		const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.14), silver); foot.position.set(0, 0.01, 0.02); g.add(foot);
		const prop = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.24, 0.02), silver); prop.position.set(0, 0.16, -0.06); prop.rotation.x = 0.3; g.add(prop);
	} else if (kind === 'tablet') {
		const b = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.58, 0.035), body); b.position.y = 0.33; g.add(b);
		const sc = screen(0.37, 0.5); sc.position.set(0, 0.33, 0.02); g.add(sc);
		const prop = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02), silver); prop.position.set(0, 0.18, -0.08); prop.rotation.x = 0.35; g.add(prop);
	} else if (kind === 'laptop') {
		const base = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.04, 0.46), silver); base.position.y = 0.02; g.add(base);
		const kb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.006, 0.28), dark); kb.position.set(0, 0.045, 0.05); g.add(kb);
		const lid = new THREE.Group();
		const panel = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.42, 0.02), body); panel.position.y = 0.21; lid.add(panel);
		const sc = screen(0.57, 0.35); sc.position.set(0, 0.21, 0.012); lid.add(sc);
		lid.position.set(0, 0.04, -0.22); lid.rotation.x = -0.42; g.add(lid);
	} else if (kind === 'monitor') {
		const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.03, 18), silver); foot.position.y = 0.015; g.add(foot);
		const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), silver); neck.position.y = 0.21; g.add(neck);
		const panel = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.48, 0.04), body); panel.position.y = 0.64; g.add(panel);
		const sc = screen(0.67, 0.41); sc.position.set(0, 0.64, 0.022); g.add(sc);
	} else { // tv
		const panel = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.74, 0.05), body); panel.position.y = 0.52; g.add(panel);
		const sc = screen(1.1, 0.66); sc.position.set(0, 0.52, 0.028); g.add(sc);
		for (const x of [-0.42, 0.42]) {
			const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.12), silver); leg.position.set(x, 0.08, 0); g.add(leg);
		}
	}
	return g;
}

function createMp6AdminTexture(mode) {
	const canvas = document.createElement('canvas');
	const C = canvas.getContext('2d');
	const blue = '#0073aa';
	const blue2 = '#00a0d2';
	if (mode === 'mobile') {
		canvas.width = 300; canvas.height = 600;
		C.fillStyle = '#f1f1f1'; C.fillRect(0, 0, 300, 600);
		C.fillStyle = '#23282d'; C.fillRect(0, 0, 300, 46);
		C.fillStyle = '#fff'; C.font = '700 22px sans-serif'; C.textAlign = 'left';
		C.fillText('☰', 14, 32);
		C.fillText('WordPress', 48, 32);
		C.fillStyle = '#1d2327'; C.font = '700 26px sans-serif';
		C.fillText('Dashboard', 16, 86);
		const card = (y, h, title) => {
			C.fillStyle = '#fff'; C.fillRect(14, y, 272, h);
			C.strokeStyle = '#dcdcde'; C.strokeRect(14, y, 272, h);
			C.fillStyle = blue; C.fillRect(14, y, 272, 30);
			C.fillStyle = '#fff'; C.font = '700 16px sans-serif'; C.fillText(title, 24, y + 21);
			C.fillStyle = '#a7aaad';
			for (let i = 0; i < 3; i++) C.fillRect(24, y + 46 + i * 18, 220 - i * 40, 8);
		};
		card(110, 110, 'At a Glance');
		card(236, 110, 'Activity');
		card(362, 150, 'Quick Draft');
		C.fillStyle = blue2; C.fillRect(24, 470, 120, 34);
		C.fillStyle = '#fff'; C.font = '700 15px sans-serif'; C.fillText('Publish', 54, 492);
	} else {
		canvas.width = 660; canvas.height = 420;
		C.fillStyle = '#f1f1f1'; C.fillRect(0, 0, 660, 420);
		C.fillStyle = '#23282d'; C.fillRect(0, 0, 660, 26); // admin bar
		C.fillStyle = '#23282d'; C.fillRect(0, 26, 150, 394); // sidebar
		const menu = ['Dashboard', 'Posts', 'Media', 'Pages', 'Comments', 'Appearance', 'Plugins', 'Users', 'Tools', 'Settings'];
		C.font = '14px sans-serif'; C.textAlign = 'left';
		menu.forEach((m, i) => {
			const y = 44 + i * 30;
			if (i === 0) { C.fillStyle = blue; C.fillRect(0, y - 20, 150, 28); }
			C.fillStyle = i === 0 ? '#fff' : '#b4b9be';
			C.fillText(m, 16, y);
		});
		C.fillStyle = '#cdd'; C.font = '13px sans-serif'; C.fillText('My Site', 12, 18);
		C.fillStyle = '#1d2327'; C.font = '700 24px sans-serif'; C.fillText('Dashboard', 172, 60);
		const card = (x, y, w, h, title) => {
			C.fillStyle = '#fff'; C.fillRect(x, y, w, h);
			C.strokeStyle = '#dcdcde'; C.strokeRect(x, y, w, h);
			C.fillStyle = '#1d2327'; C.font = '700 15px sans-serif'; C.fillText(title, x + 12, y + 22);
			C.fillStyle = '#c3c4c7';
			for (let i = 0; i < 3; i++) C.fillRect(x + 12, y + 38 + i * 16, w - 24 - i * 30, 7);
		};
		card(172, 80, 230, 120, 'At a Glance');
		card(418, 80, 220, 120, 'Activity');
		card(172, 214, 230, 150, 'Quick Draft');
		card(418, 214, 220, 150, 'WordPress News');
		C.fillStyle = blue2; C.fillRect(184, 320, 110, 30);
		C.fillStyle = '#fff'; C.font = '700 14px sans-serif'; C.fillText('Save Draft', 206, 340);
	}
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createDeviceLabPlacardTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 900;
	canvas.height = 540;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#f6f8fa';
	ctx.fillRect(0, 0, 900, 540);
	ctx.fillStyle = '#00a0d2';
	ctx.fillRect(0, 0, 900, 12);
	ctx.fillRect(0, 528, 900, 12);
	ctx.textAlign = 'center';
	ctx.fillStyle = '#0a2b39';
	ctx.font = '900 56px "Arial Black", Impact, sans-serif';
	ctx.fillText('RESPONSIVE', 450, 92);
	ctx.fillStyle = '#0073aa';
	ctx.font = '600 30px sans-serif';
	ctx.fillText('one dashboard, every screen', 450, 138);
	ctx.textAlign = 'left';
	ctx.fillStyle = '#1d2327';
	ctx.font = '26px Georgia, serif';
	const lines = [
		'MP6 reskinned wp-admin flat in WordPress 3.8',
		'(December 2013): Open Sans, eight admin colour',
		'schemes, sharp vector icons — and a dashboard',
		'that finally folded down to fit a phone.',
		'',
		'The same screens you see on this bench, from the',
		'handset to the wall. The admin learned to bend.',
	];
	lines.forEach((l, i) => ctx.fillText(l, 70, 198 + i * 38));
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

// III · CMS Toolkit → a portrait gallery of WordPress's default themes, the
// yearly-theme tradition that 3.0 began (2010), with Kubrick as the ancestor.
function buildThemeGalleryAnnex(ctx) {
	const { depth, sMid, sMin, sMax } = ctx;

	// Red gallery runner.
	const runner = new THREE.Mesh(
		new THREE.PlaneGeometry(2.4, depth - 1.6),
		new THREE.MeshStandardMaterial({ color: 0x7a2630, roughness: 0.92 })
	);
	runner.rotation.x = -Math.PI / 2;
	runner.position.set(sMid, 0.02, depth / 2);
	ctx.group.add(runner);

	// Far wall: Kubrick, the ancestor, large.
	const hero = createOrnateFramedPanel(createThemeTexture('kubrick'), 2.0, 1.6);
	hero.position.set(sMid, 2.95, depth - 0.14);
	hero.rotation.y = Math.PI;
	ctx.group.add(hero);

	// Left wall: the first three yearly defaults.
	['twentyten', 'twentyeleven', 'twentytwelve'].forEach((k, i) => {
		const fr = createOrnateFramedPanel(createThemeTexture(k), 1.5, 1.2);
		fr.position.set(sMin + 0.13, 2.5, 2.4 + i * 2.6);
		fr.rotation.y = Math.PI / 2;
		ctx.group.add(fr);
	});

	// Right wall: placard, then the tradition rolling on.
	const placard = createOrnateFramedPanel(createThemeGalleryPlacardTexture(), 2.2, 1.35);
	placard.position.set(sMax - 0.13, 2.75, 2.3);
	placard.rotation.y = -Math.PI / 2;
	ctx.group.add(placard);
	['twentythirteen', 'twentyfourteen'].forEach((k, i) => {
		const fr = createOrnateFramedPanel(createThemeTexture(k), 1.5, 1.2);
		fr.position.set(sMax - 0.13, 2.5, 5.4 + i * 2.4);
		fr.rotation.y = -Math.PI / 2;
		ctx.group.add(fr);
	});

	// Central viewing bench.
	ctx.place(createGalleryBench(2.4), sMid, depth * 0.5, 0, 0);
}

function createGalleryBench(len) {
	const g = new THREE.Group();
	const wood = new THREE.MeshStandardMaterial({ color: 0x4a3318, roughness: 0.5, metalness: 0.1 });
	const leather = new THREE.MeshStandardMaterial({ color: 0x7a2f38, roughness: 0.6 });
	const frame = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.62), wood);
	frame.position.y = 0.42;
	g.add(frame);
	const cushion = new THREE.Mesh(new THREE.BoxGeometry(len - 0.12, 0.12, 0.52), leather);
	cushion.position.y = 0.53;
	g.add(cushion);
	for (const x of [-(len / 2 - 0.2), len / 2 - 0.2]) {
		for (const z of [-0.22, 0.22]) {
			const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), wood);
			leg.position.set(x, 0.2, z);
			g.add(leg);
		}
	}
	return g;
}

// A stylised homepage of a WordPress default theme, with a baked nameplate.
function createThemeTexture(key) {
	const cv = document.createElement('canvas');
	cv.width = 400;
	cv.height = 320;
	const x = cv.getContext('2d');
	const W = 400;
	const top = 250;
	const lines = (cx, cy, w, n, col, gap = 16) => {
		x.fillStyle = col;
		for (let i = 0; i < n; i++) x.fillRect(cx, cy + i * gap, w - (i % 2) * 30, 5);
	};
	if (key === 'kubrick') {
		x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, top);
		const g = x.createLinearGradient(0, 12, 0, 86);
		g.addColorStop(0, '#86b4da'); g.addColorStop(1, '#3a6ea5');
		x.fillStyle = g; x.fillRect(16, 12, W - 32, 74);
		x.fillStyle = '#fff'; x.textAlign = 'left'; x.font = '700 24px Georgia, serif';
		x.fillText('WordPress', 32, 48);
		x.font = '13px Georgia, serif'; x.fillText('Just another WordPress weblog', 32, 72);
		lines(28, 108, 250, 7, '#c8c8c8');
		x.fillStyle = '#eeeeee'; x.fillRect(296, 100, 80, 132);
		lines(304, 110, 64, 6, '#cfcfcf');
	} else if (key === 'twentyten') {
		x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, top);
		x.fillStyle = '#000000'; x.fillRect(0, 0, W, 18);
		x.fillStyle = '#9fb0bd'; x.fillRect(16, 26, W - 32, 70);
		x.fillStyle = '#fff'; x.font = '700 20px Georgia, serif'; x.textAlign = 'left';
		x.fillText('Twenty Ten', 28, 64);
		lines(28, 114, 240, 6, '#cfcfcf');
		x.fillStyle = '#efefef'; x.fillRect(300, 108, 76, 122); lines(308, 116, 60, 6, '#d6d6d6', 15);
	} else if (key === 'twentyeleven') {
		x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, W, top);
		x.fillStyle = '#2b6c8f'; x.fillRect(16, 14, W - 32, 72);
		x.fillStyle = '#fff'; x.font = '700 20px Helvetica, sans-serif'; x.textAlign = 'left';
		x.fillText('Twenty Eleven', 28, 56);
		x.fillStyle = '#1982d1'; x.fillRect(16, 92, W - 32, 6);
		lines(28, 116, 250, 6, '#cdcdc8');
		x.fillStyle = '#e9e9e4'; x.fillRect(300, 110, 76, 120); lines(308, 118, 60, 6, '#d4d4cf', 15);
	} else if (key === 'twentytwelve') {
		x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, top);
		x.fillStyle = '#444444'; x.textAlign = 'center'; x.font = '700 26px "Open Sans", Helvetica, sans-serif';
		x.fillText('Twenty Twelve', W / 2, 54);
		x.fillStyle = '#9b9b9b'; x.font = '14px Helvetica, sans-serif';
		x.fillText('a clean, minimal canvas', W / 2, 80);
		x.fillStyle = '#dddddd'; x.fillRect(W / 2 - 60, 100, 120, 2);
		x.textAlign = 'left'; lines(80, 132, 240, 5, '#e2e2e2', 18);
	} else if (key === 'twentythirteen') {
		x.fillStyle = '#f1f1e7'; x.fillRect(0, 0, W, top);
		x.fillStyle = '#e05d22'; x.fillRect(0, 0, W, 88);
		x.fillStyle = '#fff'; x.textAlign = 'left'; x.font = '700 22px Georgia, serif';
		x.fillText('Twenty Thirteen', 28, 50);
		x.font = '13px Georgia, serif'; x.fillText('bold colour, one column', 28, 74);
		lines(40, 118, W - 80, 7, '#d8d3bf');
	} else { // twentyfourteen
		x.fillStyle = '#1a1a1a'; x.fillRect(0, 0, W, top);
		x.fillStyle = '#000000'; x.fillRect(0, 0, W, 20);
		x.fillStyle = '#fff'; x.textAlign = 'left'; x.font = '700 18px Helvetica, sans-serif';
		x.fillText('Twenty Fourteen', 16, 50);
		for (const gx of [16, 206]) {
			for (const gy of [70, 162]) {
				x.fillStyle = '#333333'; x.fillRect(gx, gy, 178, 80);
				x.fillStyle = '#24890d'; x.fillRect(gx, gy, 178, 5);
			}
		}
	}
	const caps = {
		kubrick: ['Kubrick', 'the default · 2005–2010'],
		twentyten: ['Twenty Ten', '2010 · WP 3.0'],
		twentyeleven: ['Twenty Eleven', '2011 · WP 3.2'],
		twentytwelve: ['Twenty Twelve', '2012 · WP 3.5'],
		twentythirteen: ['Twenty Thirteen', '2013'],
		twentyfourteen: ['Twenty Fourteen', '2014'],
	};
	const [name, year] = caps[key];
	x.fillStyle = '#1a1208'; x.fillRect(0, top, W, 320 - top);
	x.textAlign = 'center';
	x.fillStyle = '#e0bd62'; x.font = '700 26px Georgia, serif'; x.fillText(name, W / 2, top + 34);
	x.fillStyle = '#b9a47a'; x.font = '17px Georgia, serif'; x.fillText(year, W / 2, top + 60);
	const t = createCanvasTexture(cv);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	return t;
}

function createThemeGalleryPlacardTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 900;
	canvas.height = 560;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#f4ead0';
	ctx.fillRect(0, 0, 900, 560);
	ctx.fillStyle = '#1a1208';
	ctx.fillRect(0, 0, 900, 12);
	ctx.fillRect(0, 548, 900, 12);
	ctx.textAlign = 'center';
	ctx.fillStyle = '#241a0c';
	ctx.font = '900 54px "Arial Black", Impact, sans-serif';
	ctx.fillText('DEFAULT THEMES', 450, 90);
	ctx.fillStyle = '#7a5a1c';
	ctx.font = 'italic 600 28px Georgia, serif';
	ctx.fillText('a new dress, every year', 450, 134);
	ctx.textAlign = 'left';
	ctx.fillStyle = '#33271a';
	ctx.font = '26px Georgia, serif';
	const lines = [
		'Kubrick clothed WordPress from 2005 — the blue',
		'header a whole generation recognised on sight.',
		'',
		'With 3.0 (June 2010) the project began shipping a',
		'fresh default theme each year: Twenty Ten, Eleven,',
		'Twelve… each a snapshot of the web’s taste that',
		'season, and proof WordPress was now a full CMS.',
	];
	lines.forEach((l, i) => ctx.fillText(l, 70, 198 + i * 40));
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

// II · Dashboard Foundations → a small community hall for the first WordCamp
// (San Francisco, 2006): a stage and lectern, a projected slide, rows of
// folding chairs, bunting and a registration table. "Just write" → "just meet".
function buildWordCampAnnex(ctx) {
	const { depth, sMid, sMin, sMax } = ctx;
	const span = sMax - sMin;

	// Stage across the far wall, with a lectern and a projected slide.
	ctx.place(createStage(span - 0.8), sMid, depth - 0.9, 0, 0);
	ctx.place(createLectern(), sMid + 1.7, depth - 1.35, 0.28, Math.PI);
	const slide = createWallScreen(createWordCampSlideTexture(), 3.1, 1.9);
	slide.position.set(sMid - 0.7, 3.4, depth - 0.14);
	slide.rotation.y = Math.PI;
	ctx.group.add(slide);

	// Rows of folding chairs facing the stage, with a centre aisle.
	const rowF = [3.1, 4.25, 5.4];
	const seatS = [sMid - 3.3, sMid - 2.3, sMid - 1.3, sMid + 1.3, sMid + 2.3, sMid + 3.3];
	rowF.forEach((f) => seatS.forEach((s) => ctx.place(createFoldingChair(), s, f, 0, 0)));

	// Bunting strung across the hall, and a registration table by the door.
	ctx.group.add(createBunting(sMin + 0.4, 2.4, sMax - 0.4, 2.4, 4.0));
	ctx.group.add(createBunting(sMin + 0.4, 6.4, sMax - 0.4, 6.4, 4.0));
	ctx.place(createRegistrationTable(), sMin + 1.2, 1.7, 0, 0.5);

	// Placard on the open side wall.
	const placard = createWallScreen(createWordCampPlacardTexture(), 2.3, 1.45);
	placard.position.set(sMax - 0.12, 2.7, 3.0);
	placard.rotation.y = -Math.PI / 2;
	ctx.group.add(placard);
}

function createStage(w) {
	const g = new THREE.Group();
	const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, 1.6), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.6 }));
	top.position.y = 0.14;
	g.add(top);
	const skirt = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, 0.04), new THREE.MeshStandardMaterial({ color: 0x21759b, roughness: 0.7, metalness: 0.1 }));
	skirt.position.set(0, 0.14, -0.8);
	g.add(skirt);
	return g;
}

function createLectern() {
	const g = new THREE.Group();
	const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.5 });
	const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.05, 0.4), wood);
	body.position.y = 0.52;
	g.add(body);
	const plate = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.44), wood);
	plate.position.y = 1.08; plate.rotation.x = -0.2;
	g.add(plate);
	const sign = createReadableLabel(createSmallSignTexture('WordPress', '#21759b'), 0.44, 0.14);
	sign.position.set(0, 0.66, 0.21);
	g.add(sign);
	const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
	stem.position.set(-0.12, 1.28, 0.06); stem.rotation.x = 0.3;
	g.add(stem);
	const mic = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: 0x111111 }));
	mic.position.set(-0.12, 1.45, 0.12);
	g.add(mic);
	return g;
}

function createFoldingChair() {
	const g = new THREE.Group();
	const seatMat = new THREE.MeshStandardMaterial({ color: 0x2b4a6f, roughness: 0.6 });
	const frame = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.4, metalness: 0.6 });
	const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), seatMat);
	seat.position.y = 0.45; g.add(seat);
	const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.04), seatMat);
	back.position.set(0, 0.67, -0.18); g.add(back);
	for (const sx of [-0.17, 0.17]) {
		for (const sz of [0.15, -0.15]) {
			const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.45, 0.03), frame);
			leg.position.set(sx, 0.225, sz); g.add(leg);
		}
	}
	return g;
}

function createBunting(sA, fA, sB, fB, y) {
	const g = new THREE.Group();
	const colors = [0x21759b, 0xd54e21, 0xffb900, 0x46b450, 0x826eb4];
	const n = 12;
	const cord = new THREE.Mesh(
		new THREE.CylinderGeometry(0.01, 0.01, Math.hypot(sB - sA, fB - fA), 6),
		new THREE.MeshStandardMaterial({ color: 0x3a3a3a })
	);
	cord.position.set((sA + sB) / 2, y, (fA + fB) / 2);
	cord.rotation.z = Math.PI / 2;
	cord.rotation.y = Math.atan2(fB - fA, sB - sA);
	g.add(cord);
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		const flag = new THREE.Mesh(
			new THREE.ConeGeometry(0.12, 0.24, 3),
			new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7 })
		);
		flag.position.set(sA + (sB - sA) * t, y - 0.14, fA + (fB - fA) * t);
		flag.rotation.x = Math.PI; // point down
		g.add(flag);
	}
	return g;
}

function createRegistrationTable() {
	const g = new THREE.Group();
	const cloth = new THREE.MeshStandardMaterial({ color: 0x21759b, roughness: 0.7 });
	const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.6), new THREE.MeshStandardMaterial({ color: 0xede6d2, roughness: 0.6 }));
	top.position.y = 0.72; g.add(top);
	const drape = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.66, 0.04), cloth);
	drape.position.set(0, 0.36, 0.3); g.add(drape);
	const sign = createReadableLabel(createSmallSignTexture('REGISTRATION', '#21759b'), 1.0, 0.26);
	sign.position.set(0, 1.05, 0.0);
	g.add(sign);
	// Lanyard badges laid out on the table.
	const badgeColors = [0xffb900, 0xd54e21, 0x46b450, 0x826eb4, 0x3a9bc8];
	for (let i = 0; i < 5; i++) {
		const badge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.01, 0.12), new THREE.MeshStandardMaterial({ color: badgeColors[i], roughness: 0.5 }));
		badge.position.set(-0.5 + i * 0.25, 0.76, -0.05);
		badge.rotation.y = (i - 2) * 0.2;
		g.add(badge);
	}
	return g;
}

function createWordCampSlideTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 640;
	canvas.height = 400;
	const ctx = canvas.getContext('2d');
	const g = ctx.createLinearGradient(0, 0, 0, 400);
	g.addColorStop(0, '#1f6a92'); g.addColorStop(1, '#0d4763');
	ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 400);
	// White WordPress "W" badge.
	ctx.fillStyle = '#ffffff';
	ctx.beginPath(); ctx.arc(120, 130, 56, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = '#1f6a92'; ctx.font = '900 64px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
	ctx.fillText('W', 120, 134);
	ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = '#ffffff'; ctx.font = '900 64px "Arial Black", Impact, sans-serif';
	ctx.fillText('WordCamp', 200, 120);
	ctx.fillStyle = '#bfe3f2'; ctx.font = '600 34px Georgia, serif';
	ctx.fillText('San Francisco · 2006', 200, 168);
	ctx.fillStyle = '#ffffff'; ctx.font = 'italic 30px Georgia, serif';
	ctx.fillText('The first WordCamp', 60, 270);
	ctx.fillStyle = '#cfe7f3'; ctx.font = '24px Georgia, serif';
	ctx.fillText('A casual gathering of WordPress users —', 60, 312);
	ctx.fillText('now hundreds of events, all over the world.', 60, 346);
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createWordCampPlacardTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 900;
	canvas.height = 560;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#f4efe2';
	ctx.fillRect(0, 0, 900, 560);
	ctx.fillStyle = '#21759b';
	ctx.fillRect(0, 0, 900, 12);
	ctx.fillRect(0, 548, 900, 12);
	ctx.textAlign = 'center';
	ctx.fillStyle = '#143b4e';
	ctx.font = '900 56px "Arial Black", Impact, sans-serif';
	ctx.fillText('WORDCAMP', 450, 92);
	ctx.fillStyle = '#3a7c9b';
	ctx.font = 'italic 600 28px Georgia, serif';
	ctx.fillText('where the community meets', 450, 136);
	ctx.textAlign = 'left';
	ctx.fillStyle = '#26323a';
	ctx.font = '26px Georgia, serif';
	const lines = [
		'The first WordCamp was thrown together in San',
		'Francisco in August 2006 — a cheap, friendly',
		'gathering of people who loved WordPress.',
		'',
		'It became a global tradition: hundreds of locally',
		'run, low-cost events where users, designers and',
		'developers meet, speak and contribute together.',
	];
	lines.forEach((l, i) => ctx.fillText(l, 70, 196 + i * 40));
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

// I · Blogging Roots → the origins room: where WordPress was forged from
// b2/cafelog in 2003. A fork-in-the-road signpost, a workbench with the old b2
// blog on a CRT beside an anvil and a glowing forge, the first "Hello world!"
// post under glass, and a founding cornerstone.
function buildForgeAnnex(ctx) {
	const { depth, sMid, sMin, sMax } = ctx;

	// Workbench against the far wall with the b2/cafelog blog on a CRT, the anvil
	// and the glowing forge brazier beside it (the "fork" → forge pun).
	ctx.place(createOriginsWorkbench(), sMid + 0.6, depth - 0.95, 0, Math.PI);
	ctx.place(createForgeBrazier(), sMid + 3.0, depth - 1.4, 0, 0);

	// The fork in the road, centred: b2/cafelog one way, WordPress the other.
	ctx.place(createForkSignpost(), sMid, depth * 0.52, 0, Math.PI);

	// The first post, under glass, on a pedestal off to one side.
	ctx.place(createFirstPostCase(), sMin + 1.9, depth * 0.42, 0, Math.PI);

	// Founding cornerstone near the door, the other side.
	ctx.place(createCornerstone(), sMax - 1.3, 2.2, 0, -0.4);

	// Placard on the open side wall.
	const placard = createWallScreen(createForgePlacardTexture(), 2.3, 1.5);
	placard.position.set(sMax - 0.12, 2.7, 3.2);
	placard.rotation.y = -Math.PI / 2;
	ctx.group.add(placard);
}

// A workbench carrying a beige CRT that shows the old b2/cafelog blog, with an
// anvil and a few tools — modelled facing +z (the caller turns it).
function createOriginsWorkbench() {
	const g = new THREE.Group();
	const wood = new THREE.MeshStandardMaterial({ color: 0x4a3318, roughness: 0.6 });
	const woodDark = new THREE.MeshStandardMaterial({ color: 0x33240f, roughness: 0.65 });
	const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.8), wood);
	top.position.y = 0.86; g.add(top);
	for (const x of [-1.05, 1.05]) {
		for (const z of [-0.3, 0.3]) {
			const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.82, 0.1), woodDark);
			leg.position.set(x, 0.41, z); g.add(leg);
		}
	}
	// Beige CRT showing the b2/cafelog blog.
	const beige = new THREE.MeshStandardMaterial({ color: 0xe6dcc2, roughness: 0.7 });
	const crt = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.56), beige);
	crt.position.set(-0.7, 1.18, -0.02); g.add(crt);
	const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.34), new THREE.MeshBasicMaterial({ map: createB2Texture() }));
	screen.position.set(-0.7, 1.2, 0.27); g.add(screen);
	const glow = new THREE.PointLight(0xbfe0ff, 0.4, 2);
	glow.position.set(-0.7, 1.2, 0.5); g.add(glow);
	const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.18), beige);
	keyboard.position.set(-0.7, 0.93, 0.42); g.add(keyboard);

	// Anvil (the forge pun): a stump + iron body with a horn.
	const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 14), woodDark);
	stump.position.set(0.85, 0.25, 0.05); g.add(stump);
	const iron = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.7 });
	const anvilBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.24), iron);
	anvilBody.position.set(0.85, 0.6, 0.05); g.add(anvilBody);
	const anvilWaist = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.16), iron);
	anvilWaist.position.set(0.85, 0.5, 0.05); g.add(anvilWaist);
	const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 12), iron);
	horn.rotation.z = -Math.PI / 2; horn.position.set(1.18, 0.62, 0.05); g.add(horn);
	// A hammer resting on the bench.
	const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 8), wood);
	handle.rotation.z = Math.PI / 2; handle.position.set(0.2, 0.93, -0.1); g.add(handle);
	const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.07), iron);
	head.position.set(0.38, 0.93, -0.1); g.add(head);
	return g;
}

// A glowing forge brazier: an iron bowl of embers on legs, with a warm flicker.
function createForgeBrazier() {
	const g = new THREE.Group();
	const iron = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.6 });
	const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.26, 18), iron);
	bowl.position.y = 0.62; g.add(bowl);
	for (let i = 0; i < 3; i++) {
		const a = i / 3 * Math.PI * 2;
		const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 8), iron);
		leg.position.set(Math.sin(a) * 0.22, 0.31, Math.cos(a) * 0.22);
		leg.rotation.x = Math.cos(a) * 0.18; leg.rotation.z = -Math.sin(a) * 0.18;
		g.add(leg);
	}
	const embers = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 18), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
	embers.position.y = 0.74; g.add(embers);
	const fire = new THREE.PointLight(0xff8a2a, 1.4, 6);
	fire.position.set(0, 0.95, 0);
	registerAnimation(fire, (object, elapsed) => {
		object.intensity = 1.2 + Math.sin(elapsed * 7) * 0.18 + Math.sin(elapsed * 13) * 0.08;
	});
	g.add(fire);
	return g;
}

// The fork in the road: a post that splits into two arms — b2/cafelog behind,
// WordPress ahead. Modelled facing +z.
function createForkSignpost() {
	const g = new THREE.Group();
	const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a28, roughness: 0.6 });
	const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), wood);
	post.position.y = 0.75; g.add(post);
	const arm = (dir) => {
		const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), wood);
		a.position.set(dir * 0.28, 1.62, 0); a.rotation.z = dir * 0.7; g.add(a);
	};
	arm(-1); arm(1);
	// The boards sit proud of their arms (arms span z ±0.05) so the wood never
	// pokes through the board faces; each board mounts on its reading side.
	// Old, weathered b2/cafelog arrow pointing back (-z, toward the gallery).
	const oldSign = createReadableLabel(createSmallSignTexture('b2/cafelog ', '#8a8f86'), 1.0, 0.3);
	oldSign.position.set(-0.62, 1.95, -0.07); oldSign.rotation.y = Math.PI; oldSign.rotation.z = 0.18;
	g.add(oldSign);
	// Bright WordPress arrow pointing ahead (+z, into the museum).
	const newSign = createReadableLabel(createSmallSignTexture('WordPress ', '#2b6c8f'), 1.05, 0.3);
	newSign.position.set(0.62, 1.95, 0.07); newSign.rotation.z = -0.18;
	g.add(newSign);
	const tag = createReadableLabel(createSmallSignTexture('the fork · 2003', '#e0913f'), 0.9, 0.22);
	tag.position.set(0, 1.05, 0.09);
	g.add(tag);
	return g;
}

// The first "Hello world!" post under a glass dome on a plinth.
function createFirstPostCase() {
	const g = new THREE.Group();
	const stone = new THREE.MeshStandardMaterial({ color: 0x6f6258, roughness: 0.8 });
	const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.5), stone);
	plinth.position.y = 0.475; g.add(plinth);
	const post = createReadableLabel(createFirstPostTexture(), 0.42, 0.34);
	post.position.set(0, 1.16, 0); g.add(post);
	const glass = new THREE.Mesh(
		new THREE.BoxGeometry(0.5, 0.5, 0.4),
		new THREE.MeshStandardMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0.2 })
	);
	glass.position.set(0, 1.18, 0); g.add(glass);
	const plate = createReadableLabel(createSmallSignTexture('The First Post', '#e0913f'), 0.56, 0.14);
	plate.position.set(0, 0.78, 0.26); g.add(plate);
	const spot = new THREE.PointLight(0xfff0d0, 0.5, 3);
	spot.position.set(0, 1.7, 0.3); g.add(spot);
	return g;
}

// An engraved founding cornerstone.
function createCornerstone() {
	const g = new THREE.Group();
	const stone = new THREE.Mesh(
		new THREE.BoxGeometry(1.3, 0.9, 0.7),
		new THREE.MeshStandardMaterial({ color: 0x7a6e60, roughness: 0.85 })
	);
	stone.position.y = 0.45; g.add(stone);
	const face = createReadableLabel(createCornerstoneTexture(), 1.16, 0.78);
	face.position.set(0, 0.5, 0.36); g.add(face);
	return g;
}

function createB2Texture() {
	const canvas = document.createElement('canvas');
	canvas.width = 460; canvas.height = 340;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#dfe6e2'; ctx.fillRect(0, 0, 460, 340);
	ctx.fillStyle = '#5b7b6a'; ctx.fillRect(0, 0, 460, 60);
	ctx.fillStyle = '#eef3ef'; ctx.textAlign = 'left'; ctx.font = '700 30px Georgia, serif';
	ctx.fillText('b2 › cafelog', 18, 40);
	ctx.fillStyle = '#33403a'; ctx.font = '700 18px Georgia, serif';
	ctx.fillText('the weblog tool from before', 20, 88);
	ctx.fillStyle = '#566'; ctx.font = '13px Georgia, serif';
	const body = ['Posted by Michel · 2002', 'A little PHP/MySQL weblog tool,', 'humming along quietly…', '', 'Development has gone quiet.'];
	body.forEach((l, i) => ctx.fillText(l, 20, 118 + i * 22));
	ctx.fillStyle = '#cdd8d2'; ctx.fillRect(330, 80, 110, 220);
	ctx.fillStyle = '#778'; ctx.font = '12px Georgia, serif';
	ctx.fillText('Links', 344, 104); ctx.fillText('Archives', 344, 126);
	const t = createCanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function createFirstPostTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 460; canvas.height = 360;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 460, 360);
	ctx.fillStyle = '#cab27a'; ctx.fillRect(0, 0, 460, 12);
	ctx.fillStyle = '#222'; ctx.textAlign = 'left'; ctx.font = '700 34px Georgia, serif';
	ctx.fillText('Hello world!', 28, 70);
	ctx.fillStyle = '#888'; ctx.font = 'italic 16px Georgia, serif';
	ctx.fillText('Posted on May 27, 2003', 28, 100);
	ctx.fillStyle = '#333'; ctx.font = '20px Georgia, serif';
	const body = ['Welcome to WordPress. This is', 'your first post. Edit or delete it,', 'then start blogging!'];
	body.forEach((l, i) => ctx.fillText(l, 28, 150 + i * 32));
	const t = createCanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function createCornerstoneTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 580; canvas.height = 390;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#7a6e60'; ctx.fillRect(0, 0, 580, 390);
	ctx.strokeStyle = '#4f463b'; ctx.lineWidth = 8; ctx.strokeRect(20, 20, 540, 350);
	ctx.fillStyle = '#2e2820'; ctx.textAlign = 'center';
	ctx.font = '900 52px Georgia, serif'; ctx.fillText('WORDPRESS', 290, 96);
	ctx.font = 'italic 26px Georgia, serif';
	ctx.fillText('forked from b2/cafelog', 290, 150);
	ctx.font = '700 34px Georgia, serif'; ctx.fillText('27 MAY 2003', 290, 214);
	ctx.font = '22px Georgia, serif';
	ctx.fillText('Matt Mullenweg & Mike Little', 290, 264);
	ctx.fillText('named by Christine Tremoulet', 290, 300);
	ctx.font = '700 24px Georgia, serif'; ctx.fillText('· released under the GPL ·', 290, 344);
	const t = createCanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function createForgePlacardTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 900; canvas.height = 560;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#f1e4cf'; ctx.fillRect(0, 0, 900, 560);
	ctx.fillStyle = '#5a3a1a'; ctx.fillRect(0, 0, 900, 12); ctx.fillRect(0, 548, 900, 12);
	ctx.textAlign = 'center';
	ctx.fillStyle = '#3a2410'; ctx.font = '900 56px "Arial Black", Impact, sans-serif';
	ctx.fillText('THE FORGE', 450, 92);
	ctx.fillStyle = '#9a6a2a'; ctx.font = 'italic 600 28px Georgia, serif';
	ctx.fillText('where it all began', 450, 136);
	ctx.textAlign = 'left'; ctx.fillStyle = '#33271a'; ctx.font = '26px Georgia, serif';
	const lines = [
		'In 2003 the little blog tool b2/cafelog had gone',
		'quiet. Matt Mullenweg and Mike Little forked it into',
		'something new; Christine Tremoulet suggested a name:',
		'WordPress.',
		'',
		'The first release shipped on 27 May 2003 under the',
		'GPL. Everything in this museum grew from that fork.',
	];
	lines.forEach((l, i) => ctx.fillText(l, 70, 196 + i * 40));
	const t = createCanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// Big "MERCANTILE" wall sign mounted high on the back wall. The brass frame
// sits flush against the wall and the lit sign board floats just in front of
// it (toward the viewer, i.e. smaller z) so the text is never occluded.
function createMercantileWallSign(cx, backZ) {
	const group = new THREE.Group();
	const wallFace = backZ - shopWallThickness / 2;
	// Brass frame flush against the wall, slightly larger than the board.
	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(5.5, 1.8, 0.08),
		new THREE.MeshStandardMaterial({ color: 0xe8b765, roughness: 0.4, metalness: 0.5, emissive: 0x3a2710, emissiveIntensity: 0.18 })
	);
	frame.position.set(cx, shopHeight - 1.5, wallFace - 0.04);
	group.add(frame);
	// Sign board in front of the frame.
	const board = createReadableLabel(
		createMercantileSignTexture('THE MERCANTILE', 'WORDPRESS · GIFT SHOP'),
		5.2,
		1.5
	);
	board.position.set(cx, shopHeight - 1.5, wallFace - 0.12);
	board.rotation.y = Math.PI;
	group.add(board);
	return group;
}

// Wall shelving with apparel and small goods along the back and left walls.
function createMercantileShelves() {
	const group = new THREE.Group();
	const woodMat = new THREE.MeshStandardMaterial({ color: 0xc9a16a, roughness: 0.62, metalness: 0.08 });

	// Back-wall shelf unit with folded tees/hoodies and books.
	const backShelfZ = shopZEnd - 0.42;
	const backShelfW = 5.6;
	const backShelfX = shopCenterX - 1.4;
	for (const y of [1.0, 1.7, 2.4]) {
		const board = new THREE.Mesh(new THREE.BoxGeometry(backShelfW, 0.07, 0.5), woodMat);
		board.position.set(backShelfX, y, backShelfZ);
		group.add(board);
	}
	// Side supports.
	for (const xSign of [-1, 1]) {
		const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.5), woodMat);
		post.position.set(backShelfX + xSign * backShelfW / 2, 1.7, backShelfZ);
		group.add(post);
	}
	// Folded apparel stacks on the lower two shelves.
	const apparelColors = [0x2bb7ff, 0x1f6feb, 0x21a366, 0xffd166, 0xc24a2c, 0x8062ff];
	let ci = 0;
	for (const y of [1.07, 1.77]) {
		for (let i = 0; i < 5; i++) {
			const stackX = backShelfX - backShelfW / 2 + 0.7 + i * (backShelfW - 1.4) / 4;
			const tee = createFoldedApparel(apparelColors[ci % apparelColors.length]);
			tee.position.set(stackX, y, backShelfZ);
			group.add(tee);
			ci++;
		}
	}
	// Books standing on the top shelf.
	const bookColors = [0x2c3e63, 0x8a2f2f, 0x2f6b3f, 0xb58a2a, 0x4a3b6b];
	for (let i = 0; i < 8; i++) {
		const book = new THREE.Mesh(
			new THREE.BoxGeometry(0.06 + Math.random() * 0.03, 0.34, 0.24),
			new THREE.MeshStandardMaterial({ color: bookColors[i % bookColors.length], roughness: 0.7 })
		);
		book.position.set(backShelfX - backShelfW / 2 + 0.5 + i * 0.16, 2.6, backShelfZ);
		group.add(book);
	}
	const booksTag = createPriceTag('BOOKS  $24');
	booksTag.position.set(backShelfX, 2.32, backShelfZ - 0.02);
	booksTag.rotation.y = Math.PI;
	group.add(booksTag);
	const teesTag = createPriceTag('TEES  $25');
	teesTag.position.set(backShelfX, 0.92, backShelfZ - 0.02);
	teesTag.rotation.y = Math.PI;
	group.add(teesTag);

	// Left-wall pegboard with mugs and a poster, set toward the back half of the
	// wall so it clears the side-passage doorway to Blogging Roots (front-left).
	const leftX = shopMinX + 0.12;
	const pegZ = shopCenterZ + 0.6;
	const mugZs = [pegZ - 1.0, pegZ - 0.2, pegZ + 0.6];
	const mugShelf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 3.2), woodMat);
	mugShelf.position.set(leftX + 0.2, 1.5, pegZ);
	group.add(mugShelf);
	for (const z of mugZs) {
		const mug = createMug();
		mug.position.set(leftX + 0.25, 1.62, z);
		group.add(mug);
	}
	const mugTag = createPriceTag('"CODE IS POETRY"  $15');
	mugTag.position.set(leftX + 0.21, 1.16, pegZ);
	mugTag.rotation.y = Math.PI / 2;
	group.add(mugTag);
	// Poster on the left wall, hung high and centred over the mug pegboard so it
	// clears the Blogging Roots doorway opening (front-left, z≈21.5–23.5).
	const poster = new THREE.Mesh(
		new THREE.PlaneGeometry(1.7, 2.3),
		new THREE.MeshBasicMaterial({ map: createMercantilePosterTexture(), transparent: true })
	);
	poster.position.set(leftX + 0.05, 3.6, pegZ);
	poster.rotation.y = Math.PI / 2;
	group.add(poster);

	return group;
}

// Free-standing display tables in the middle of the shop: plushies, stickers,
// pin badges.
function createMercantileTables() {
	const group = new THREE.Group();
	const tableMat = new THREE.MeshStandardMaterial({ color: 0xe7d6b2, roughness: 0.6, metalness: 0.08 });

	const makeTable = (x, z, w, d, h) => {
		const t = new THREE.Group();
		const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), tableMat);
		top.position.set(0, h, 0);
		t.add(top);
		for (const sx of [-1, 1]) {
			for (const sz of [-1, 1]) {
				const leg = new THREE.Mesh(
					new THREE.CylinderGeometry(0.05, 0.05, h, 10),
					new THREE.MeshStandardMaterial({ color: 0x8a6a3c, roughness: 0.5, metalness: 0.3 })
				);
				leg.position.set(sx * (w / 2 - 0.12), h / 2, sz * (d / 2 - 0.12));
				t.add(leg);
			}
		}
		t.position.set(x, 0, z);
		return t;
	};

	// Plush table: Wapuu + ElePHPant.
	const plushTable = makeTable(shopCenterX + 1.3, shopCenterZ - 0.3, 2.2, 1.3, 0.92);
	group.add(plushTable);
	const wapuu = createWapuu3D({ height: 0.7, accent: 0xffd166 });
	wapuu.position.set(shopCenterX + 0.7, 0.97 + 0.02, shopCenterZ - 0.3);
	wapuu.rotation.y = Math.PI + 0.3;
	group.add(wapuu);
	const elephant = createElephpantPlush();
	elephant.position.set(shopCenterX + 1.9, 0.97 + 0.02, shopCenterZ - 0.3);
	group.add(elephant);
	const plushTag = createPriceTag('PLUSHIES  $30');
	plushTag.position.set(shopCenterX + 1.3, 1.0, shopCenterZ - 0.95);
	plushTag.rotation.y = Math.PI;
	group.add(plushTag);

	// Sticker + pin badge table near the front-left.
	const smallTable = makeTable(shopCenterX - 2.6, shopCenterZ + 1.4, 1.8, 1.1, 0.86);
	group.add(smallTable);
	// Sticker sheets (flat colorful cards).
	const stickerColors = [0x2bb7ff, 0xffd166, 0x21a366, 0xc24a2c, 0x8062ff];
	for (let i = 0; i < 4; i++) {
		const sheet = new THREE.Mesh(
			new THREE.BoxGeometry(0.34, 0.012, 0.46),
			new THREE.MeshStandardMaterial({ color: stickerColors[i], roughness: 0.5, emissive: stickerColors[i], emissiveIntensity: 0.06 })
		);
		sheet.position.set(shopCenterX - 3.1 + (i % 2) * 0.45, 0.93, shopCenterZ + 1.15 + Math.floor(i / 2) * 0.5);
		sheet.rotation.y = (Math.random() - 0.5) * 0.3;
		group.add(sheet);
	}
	// A printed "There's a plugin for that" sticker laid face-up among the blank
	// sheets — the community catchphrase, integrated as a real shop sticker.
	const pluginSticker = new THREE.Mesh(
		new THREE.BoxGeometry(0.5, 0.014, 0.34),
		new THREE.MeshStandardMaterial({ map: createPluginStickerTexture(), roughness: 0.45 })
	);
	pluginSticker.position.set(shopCenterX - 2.45, 0.938, shopCenterZ + 1.74);
	pluginSticker.rotation.y = 0.22;
	group.add(pluginSticker);
	// Pin badges (tiny cylinders) in a small tray.
	const tray = new THREE.Mesh(
		new THREE.BoxGeometry(0.7, 0.06, 0.5),
		new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 0.6 })
	);
	tray.position.set(shopCenterX - 2.1, 0.92, shopCenterZ + 1.4);
	group.add(tray);
	const pinColors = [0xffd166, 0x2bb7ff, 0xc24a2c, 0x21a366, 0x8062ff, 0xffffff];
	for (let i = 0; i < 6; i++) {
		const pin = new THREE.Mesh(
			new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16),
			new THREE.MeshStandardMaterial({ color: pinColors[i], roughness: 0.35, metalness: 0.3, emissive: pinColors[i], emissiveIntensity: 0.08 })
		);
		pin.position.set(shopCenterX - 2.35 + (i % 3) * 0.24, 0.96, shopCenterZ + 1.28 + Math.floor(i / 3) * 0.24);
		group.add(pin);
	}
	const pinTag = createPriceTag('STICKERS & PINS  $5');
	pinTag.position.set(shopCenterX - 2.6, 0.94, shopCenterZ + 0.85);
	pinTag.rotation.y = Math.PI;
	group.add(pinTag);

	return group;
}

function createPluginStickerTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 384;
	canvas.height = 256;
	const ctx = canvas.getContext('2d');
	// Rounded die-cut white sticker on a transparent corner; bold WP-blue type.
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.strokeStyle = '#21759b';
	ctx.lineWidth = 12;
	ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#21759b';
	ctx.font = '900 40px Arial Black, Impact, sans-serif';
	ctx.fillText("THERE'S A", canvas.width / 2, 86);
	ctx.fillText('PLUGIN', canvas.width / 2, 134);
	ctx.fillStyle = '#c24a2c';
	ctx.font = '900 40px Arial Black, Impact, sans-serif';
	ctx.fillText('FOR THAT', canvas.width / 2, 182);
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	// The box top face maps V toward −z; rotate 180° so the text reads upright for
	// a visitor approaching the table from the shop entrance (−z) side.
	tex.center.set(0.5, 0.5);
	tex.rotation = Math.PI;
	return tex;
}

// Checkout counter with a cash register and the "shop online" link, near the
// front-right corner of the shop so visitors pass it on the way in/out.
function createMercantileCounter() {
	const group = new THREE.Group();
	const counterX = shopMaxX - 1.5;
	// Sits against the right wall past the side-passage doorway to Blocks
	// Everywhere (which opens the front-right), so it never blocks that threshold.
	const counterZ = shopZEnd - 2.6;
	const counterW = 2.6;
	const counterD = 1.0;
	const counterH = 1.05;

	const body = new THREE.Mesh(
		new THREE.BoxGeometry(counterW, counterH, counterD),
		new THREE.MeshStandardMaterial({ color: 0x6f4a2c, roughness: 0.55, metalness: 0.1 })
	);
	body.position.set(counterX, counterH / 2, counterZ);
	group.add(body);
	// Marble countertop.
	const top = new THREE.Mesh(
		new THREE.BoxGeometry(counterW + 0.16, 0.1, counterD + 0.16),
		new THREE.MeshStandardMaterial({ color: 0xf3ecdc, roughness: 0.3, metalness: 0.2 })
	);
	top.position.set(counterX, counterH + 0.05, counterZ);
	group.add(top);
	// Brass kick rail.
	const rail = new THREE.Mesh(
		new THREE.BoxGeometry(counterW, 0.06, 0.06),
		new THREE.MeshStandardMaterial({ color: 0xe8b765, roughness: 0.4, metalness: 0.5 })
	);
	rail.position.set(counterX, 0.18, counterZ - counterD / 2 - 0.04);
	group.add(rail);

	// Cash register.
	const reg = new THREE.Group();
	const regBase = new THREE.Mesh(
		new THREE.BoxGeometry(0.5, 0.3, 0.42),
		new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.5, metalness: 0.2 })
	);
	regBase.position.y = 0.15;
	reg.add(regBase);
	const regScreen = new THREE.Mesh(
		new THREE.BoxGeometry(0.34, 0.22, 0.04),
		new THREE.MeshStandardMaterial({ color: 0x2bb7ff, emissive: 0x123a52, emissiveIntensity: 0.5, roughness: 0.3 })
	);
	regScreen.position.set(0, 0.36, -0.12);
	regScreen.rotation.x = -0.3;
	reg.add(regScreen);
	const regDrawer = new THREE.Mesh(
		new THREE.BoxGeometry(0.46, 0.1, 0.4),
		new THREE.MeshStandardMaterial({ color: 0x4a5570, roughness: 0.5 })
	);
	regDrawer.position.set(0, 0.05, 0.02);
	reg.add(regDrawer);
	reg.position.set(counterX - 0.6, counterH + 0.1, counterZ);
	group.add(reg);

	// A small Wapuu mascot at the till.
	const tillWapuu = createWapuu3D({ height: 0.4, accent: 0x2bb7ff });
	tillWapuu.position.set(counterX + 0.7, counterH + 0.1, counterZ);
	tillWapuu.rotation.y = -0.5;
	group.add(tillWapuu);

	// "Shop online" sign on the counter front — keeps the external Mercantile
	// link accessible (clickable) inside the physical shop.
	const onlineSign = new THREE.Mesh(
		new THREE.PlaneGeometry(1.9, 0.6),
		new THREE.MeshBasicMaterial({ map: createShopOnlineTexture(), transparent: true })
	);
	onlineSign.position.set(counterX, 0.62, counterZ - counterD / 2 - 0.02);
	onlineSign.userData.portalUrl = mercantileUrl;
	group.add(onlineSign);
	pickables.push(onlineSign);

	// Hanging "CHECKOUT" sign above the counter, on two drop rods from the
	// ceiling so it doesn't read as floating.
	const signY = shopHeight - 1.0;
	const checkoutSign = createReadableLabel(createSmallSignTexture('CHECKOUT', '#c24a2c'), 1.4, 0.4);
	checkoutSign.position.set(counterX, signY, counterZ);
	group.add(checkoutSign);
	const rodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.5, metalness: 0.4 });
	const rodTop = shopHeight;
	const rodBottom = signY + 0.2; // sign top edge
	const rodLen = rodTop - rodBottom;
	for (const dx of [-0.55, 0.55]) {
		const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, rodLen, 6), rodMat);
		rod.position.set(counterX + dx, rodBottom + rodLen / 2, counterZ);
		group.add(rod);
	}

	return group;
}

function createFoldedApparel(color) {
	const group = new THREE.Group();
	const c = new THREE.Color(color);
	for (let i = 0; i < 3; i++) {
		const fold = new THREE.Mesh(
			new THREE.BoxGeometry(0.42, 0.08, 0.36),
			new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(1 - i * 0.08), roughness: 0.78 })
		);
		fold.position.y = 0.05 + i * 0.085;
		group.add(fold);
	}
	return group;
}

function createMug() {
	const group = new THREE.Group();
	const body = new THREE.Mesh(
		new THREE.CylinderGeometry(0.1, 0.09, 0.22, 18),
		new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.4, metalness: 0.05 })
	);
	body.position.y = 0.11;
	group.add(body);
	const band = new THREE.Mesh(
		new THREE.CylinderGeometry(0.101, 0.101, 0.07, 18),
		new THREE.MeshStandardMaterial({ color: 0x2bb7ff, roughness: 0.4 })
	);
	band.position.y = 0.1;
	group.add(band);
	const handle = new THREE.Mesh(
		new THREE.TorusGeometry(0.06, 0.018, 8, 16, Math.PI),
		new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.4 })
	);
	handle.position.set(0.1, 0.11, 0);
	handle.rotation.z = -Math.PI / 2;
	group.add(handle);
	return group;
}

// Simple PHP elephant ("ElePHPant") plush in its classic purple-blue.
function createElephpantPlush() {
	const group = new THREE.Group();
	const mat = new THREE.MeshStandardMaterial({ color: 0x8893bf, roughness: 0.82, metalness: 0.02 });
	const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.5), mat);
	body.position.y = 0.3;
	group.add(body);
	const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.26), mat);
	head.position.set(0, 0.46, 0.28);
	group.add(head);
	// Trunk.
	const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.34, 10), mat);
	trunk.position.set(0, 0.34, 0.42);
	trunk.rotation.x = 0.5;
	group.add(trunk);
	// Ears.
	for (const sx of [-1, 1]) {
		const ear = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.2), mat);
		ear.position.set(sx * 0.17, 0.5, 0.26);
		group.add(ear);
	}
	// Legs.
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), mat);
			leg.position.set(sx * 0.12, 0.08, sz * 0.16);
			group.add(leg);
		}
	}
	// Eyes.
	for (const sx of [-1, 1]) {
		const eye = new THREE.Mesh(
			new THREE.SphereGeometry(0.025, 10, 8),
			new THREE.MeshBasicMaterial({ color: 0x101820 })
		);
		eye.position.set(sx * 0.08, 0.52, 0.4);
		group.add(eye);
	}
	group.rotation.y = -0.4;
	return group;
}

function createPriceTag(text) {
	return createReadableLabel(createSmallSignTexture(text, '#21a366'), Math.max(0.6, text.length * 0.072), 0.2);
}

function createMercantileSignTexture(title, sub) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 295; // ~3.47 aspect, matches the 5.2×1.5 board
	const ctx = canvas.getContext('2d');
	const w = canvas.width;
	const h = canvas.height;
	const bronze = '#7c5a22';
	const serif = 'Georgia, "Times New Roman", serif';

	drawMuralMarbleField(ctx, w, h);
	drawMuralBorder(ctx, w, h, bronze);

	ctx.textAlign = 'center';
	drawEngravedText(ctx, title, w / 2, h * 0.4, w * 0.84, h * 0.34, '700', serif, bronze);

	const subY = h * 0.74;
	ctx.font = `600 ${Math.round(h * 0.13)}px ${serif}`;
	const half = Math.min(ctx.measureText(sub).width, w * 0.66) / 2;
	ctx.fillStyle = bronze;
	const ruleW = h * 0.24;
	const ruleGap = h * 0.1;
	ctx.fillRect(w / 2 - half - ruleGap - ruleW, subY - 2, ruleW, 3);
	ctx.fillRect(w / 2 + half + ruleGap, subY - 2, ruleW, 3);
	drawEngravedText(ctx, sub, w / 2, subY, w * 0.66, h * 0.13, '600', serif, bronze);

	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createShopOnlineTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 768;
	canvas.height = 240;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff5df';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.strokeStyle = '#c24a2c';
	ctx.lineWidth = 12;
	ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
	ctx.fillStyle = '#c24a2c';
	ctx.font = '900 64px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('SHOP ONLINE', canvas.width / 2, 90);
	ctx.fillStyle = '#1b2740';
	ctx.font = '700 40px system-ui, sans-serif';
	ctx.fillText('mercantile.wordpress.org', canvas.width / 2, 162);
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createMercantilePosterTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 700;
	const ctx = canvas.getContext('2d');
	const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
	grad.addColorStop(0, '#21759b');
	grad.addColorStop(1, '#0f3a52');
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#ffd166';
	ctx.font = '900 90px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('CODE', canvas.width / 2, 180);
	ctx.fillText('IS', canvas.width / 2, 300);
	ctx.fillText('POETRY', canvas.width / 2, 420);
	ctx.fillStyle = '#fff5df';
	ctx.font = '700 36px system-ui, sans-serif';
	ctx.fillText('— WordPress —', canvas.width / 2, 560);
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createPortalPosterTexture(portal) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 320;
	const ctx = canvas.getContext('2d');
	const accent = '#' + new THREE.Color(portal.accent).getHexString();
	const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
	grad.addColorStop(0, '#0e1c2e');
	grad.addColorStop(1, '#0a1422');
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	for (let index = 0; index < 9; index++) {
		ctx.fillStyle = accent;
		ctx.globalAlpha = 0.12;
		ctx.beginPath();
		ctx.arc(100 + index * 110, 160, 40 + (index % 3) * 16, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
	ctx.textAlign = 'center';
	if (portal.kind === 'exit') {
		ctx.fillStyle = accent;
		ctx.font = '900 104px Arial Black, Impact, sans-serif';
		ctx.fillText('GIFT SHOP', 512, 130);
		ctx.fillStyle = '#fff5df';
		ctx.font = '700 40px system-ui, sans-serif';
		ctx.fillText('tees · stickers · tote bags · wapuu plushies', 512, 210);
		ctx.fillStyle = accent;
		ctx.font = '600 26px ui-monospace, Menlo, monospace';
		ctx.fillText('mercantile.wordpress.org', 512, 268);
	} else {
		ctx.fillStyle = accent;
		ctx.font = '900 96px Arial Black, Impact, sans-serif';
		ctx.fillText('WELCOME', 512, 124);
		ctx.fillStyle = '#fff5df';
		ctx.font = '700 38px system-ui, sans-serif';
		ctx.fillText('Free & open-source · the five-minute install', 512, 204);
		ctx.fillStyle = accent;
		ctx.font = '600 26px ui-monospace, Menlo, monospace';
		ctx.fillText('“Code is poetry.”', 512, 264);
	}
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function createSimpleTextTexture(text, color, bg) {
	const canvas = document.createElement('canvas');
	canvas.width = 768;
	canvas.height = 160;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = bg || '#0e1c2e';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = color || '#fff5df';
	ctx.font = '900 76px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, canvas.width / 2, canvas.height / 2);
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function createMuseumMaterial(textureName, options = {}) {
	const texture = createMuseumTexture(
		textureName,
		options.repeatX ?? 1,
		options.repeatY ?? 1
	);
	return new THREE.MeshStandardMaterial({
		map: texture,
		color: options.color ?? 0xffffff,
		roughness: options.roughness ?? 0.82,
		metalness: options.metalness ?? 0.04,
	});
}

function createMuseumTexture(name, repeatX, repeatY) {
	const cacheKey = `${name}:${repeatX}:${repeatY}`;
	if (museumTextures.has(cacheKey)) {
		return museumTextures.get(cacheKey);
	}

	const source = museumTextureSources[name];
	const texture = source
		? loadCappedTexture(source)
		: createCanvasTexture(getTextureCanvas(name));
	configureMuseumTexture(texture, repeatX, repeatY);
	museumTextures.set(cacheKey, texture);
	return texture;
}

function configureMuseumTexture(texture, repeatX, repeatY) {
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(repeatX, repeatY);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
}

function getWapuuTextures() {
	if (!wapuuTextures) {
		wapuuTextures = wapuuTextureSources.map(createWapuuTexture);
	}
	return wapuuTextures;
}

function createWapuuTexture(source) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = canvas.width;
	const texture = createCanvasTexture(canvas);
	const image = new Image();
	image.decoding = 'async';
	image.addEventListener(
		'load',
		() => {
			const ctx = canvas.getContext('2d');
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
			const width = image.naturalWidth * scale;
			const height = image.naturalHeight * scale;
			ctx.drawImage(
				image,
				(canvas.width - width) / 2,
				(canvas.height - height) / 2,
				width,
				height
			);
			refreshCanvasTexture(texture);
		},
		{ once: true }
	);
	image.src = source.src;
	texture.name = source.name;
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
	return texture;
}

function getTextureCanvas(name) {
	if (textureCanvases.has(name)) {
		return textureCanvases.get(name);
	}

	const canvas = document.createElement('canvas');
	const isFloor = name === 'atriumFloor' || name === 'roomFloor';
	canvas.width = isFloor ? 1024 : 512;
	canvas.height = isFloor ? 1024 : 512;
	const ctx = canvas.getContext('2d');
	const draw = {
		atriumFloor: drawAtriumFloorTexture,
		ceiling: drawCeilingTexture,
		roomFloor: drawRoomFloorTexture,
		roomWall: drawRoomWallTexture,
		shellWall: drawShellWallTexture,
	}[name];
	draw(ctx, canvas.width, canvas.height);
	textureCanvases.set(name, canvas);
	return canvas;
}

function drawRoomFloorTexture(ctx, width, height) {
	if (!isCurrentVariant) {
		drawVariantTexture(ctx, width, height, activeVariant.floor, 'floor');
		return;
	}
	drawMonumentalFloor(ctx, width, height);
}

function drawAtriumFloorTexture(ctx, width, height) {
	if (!isCurrentVariant) {
		drawVariantTexture(ctx, width, height, activeVariant.floor, 'atrium');
		drawAtriumRings(ctx, width, height, activeVariant.eraColors[0]);
		return;
	}
	drawMonumentalFloor(ctx, width, height);
}

// Large polished LIGHT marble slabs in two warm cream/grey tones, laid as a
// 2x2 checkerboard that tiles seamlessly. A fine warm grout separates the
// slabs; gold/brass and soft grey veining with a gentle polish sheen evoke a
// bright, grand cream-marble lobby that makes the museum feel monumental and
// welcoming rather than cave-like.
function drawMonumentalFloor(ctx, width, height) {
	const grout = '#cdbf9e';
	const tones = ['#efe8d6', '#e4dbc4'];
	ctx.fillStyle = grout;
	ctx.fillRect(0, 0, width, height);

	const cell = width / 2;
	const gap = Math.max(4, width * 0.008);
	for (let row = 0; row < 2; row++) {
		for (let col = 0; col < 2; col++) {
			const tone = tones[(row + col) % 2];
			const x = col * cell + gap / 2;
			const y = row * cell + gap / 2;
			const size = cell - gap;
			drawMarbleSlab(ctx, x, y, size, tone);
		}
	}
}

function drawMarbleSlab(ctx, x, y, size, tone) {
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, size, size);
	ctx.clip();

	const base = new THREE.Color(tone);
	ctx.fillStyle = `#${base.getHexString()}`;
	ctx.fillRect(x, y, size, size);

	// Soft polish sheen — a bright streak across a lightly shaded slab. Kept
	// gentle so the stone stays light and luminous rather than glassy.
	const sheen = ctx.createLinearGradient(x, y, x + size, y + size);
	sheen.addColorStop(0, 'rgba(255, 252, 242, 0.34)');
	sheen.addColorStop(0.42, 'rgba(255, 250, 236, 0.1)');
	sheen.addColorStop(0.6, 'rgba(120, 108, 84, 0.06)');
	sheen.addColorStop(1, 'rgba(96, 84, 60, 0.12)');
	ctx.fillStyle = sheen;
	ctx.fillRect(x, y, size, size);

	// Gold/brass and soft grey veining for richness against the cream base.
	const veinCount = 6;
	for (let index = 0; index < veinCount; index++) {
		const seed = x * 0.013 + y * 0.017 + index * 1.7;
		const startX = x + (pseudoRandom(seed) * 0.9 + 0.05) * size;
		const startY = y + (index / veinCount) * size;
		ctx.beginPath();
		ctx.moveTo(startX, startY);
		let cx = startX;
		let cy = startY;
		for (let step = 0; step < 5; step++) {
			cx += (pseudoRandom(seed + step) - 0.5) * size * 0.55;
			cy += size * 0.18;
			ctx.lineTo(cx, cy);
		}
		ctx.strokeStyle = index % 3 === 0
			? 'rgba(176, 142, 70, 0.4)'
			: 'rgba(150, 142, 122, 0.22)';
		ctx.lineWidth = index % 3 === 0 ? 1.6 : 1.0;
		ctx.stroke();
	}

	// Subtle inner bevel highlight + shadow for a cut-stone edge.
	ctx.strokeStyle = 'rgba(255, 252, 244, 0.4)';
	ctx.lineWidth = 2;
	ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
	ctx.strokeStyle = 'rgba(150, 132, 96, 0.22)';
	ctx.strokeRect(x + 5, y + 5, size - 10, size - 10);
	ctx.restore();
}

function drawAtriumFloorTextureLegacy(ctx, width, height) {
	const center = width / 2;
	ctx.fillStyle = '#31415f';
	ctx.fillRect(0, 0, width, height);
	for (let radius = 46; radius < 350; radius += 42) {
		ctx.beginPath();
		ctx.arc(center, center, radius, 0, Math.PI * 2);
		ctx.strokeStyle = radius % 84 === 0 ? '#ffd166' : '#536681';
		ctx.lineWidth = radius % 84 === 0 ? 5 : 3;
		ctx.stroke();
	}
	for (let index = 0; index < 24; index++) {
		const angle = (Math.PI * 2 * index) / 24;
		ctx.beginPath();
		ctx.moveTo(center, center);
		ctx.lineTo(
			center + Math.cos(angle) * width,
			center + Math.sin(angle) * height
		);
		ctx.strokeStyle = index % 2 === 0 ? '#435671' : '#26344f';
		ctx.lineWidth = 2;
		ctx.stroke();
	}
	drawSpeckles(ctx, width, height, 180, [
		'#ffd166',
		'#79e0dc',
		'#f7e7bf',
		'#4e6685',
	]);
}

function drawShellWallTexture(ctx, width, height) {
	if (!isCurrentVariant) {
		drawVariantTexture(ctx, width, height, activeVariant.wall, 'wall');
		return;
	}
	drawPlasterTexture(ctx, width, height, '#b9c7da', '#8fa3bd', '#dce6f2');
	drawWallPanels(ctx, width, height, 128, 96, '#7d91ad');
}

function drawRoomWallTexture(ctx, width, height) {
	if (!isCurrentVariant) {
		drawVariantTexture(ctx, width, height, activeVariant.wall, 'wall');
		return;
	}
	drawPlasterTexture(ctx, width, height, '#cbd7e7', '#9fb1c9', '#f3f0dd');
	drawWallPanels(ctx, width, height, 96, 128, '#879bb7');
}

function drawCeilingTexture(ctx, width, height) {
	if (!isCurrentVariant) {
		drawVariantTexture(ctx, width, height, activeVariant.ceiling, 'ceiling');
		return;
	}
	ctx.fillStyle = '#d5dde8';
	ctx.fillRect(0, 0, width, height);
	drawTileGrid(ctx, width, height, 128, '#97a8bf', '#e7edf4');
	drawSpeckles(ctx, width, height, 160, ['#ffffff', '#b6c2d3', '#8393aa']);
}

function drawVariantTexture(ctx, width, height, palette, surface) {
	const [base, lowlight, highlight] = palette;
	ctx.fillStyle = base;
	ctx.fillRect(0, 0, width, height);

	const style = activeVariant.textureStyle;
	if (style === 'pixel') {
		drawPixelTexture(ctx, width, height, base, lowlight, highlight);
	} else if (style === 'memphis') {
		drawMemphisTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'terminal') {
		drawTerminalTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'botanical') {
		drawBotanicalTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'paper') {
		drawPaperTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'space') {
		drawSpaceTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'brutalist') {
		drawBrutalistTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'lab') {
		drawLabTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'velvet') {
		drawVelvetTexture(ctx, width, height, lowlight, highlight);
	} else {
		drawNoirTexture(ctx, width, height, lowlight, highlight);
	}

	if (surface !== 'wall') {
		drawTileGrid(
			ctx,
			width,
			height,
			surface === 'ceiling' ? 128 : 64,
			lowlight,
			highlight
		);
	}
	drawSpeckles(ctx, width, height, surface === 'wall' ? 240 : 160, [
		lowlight,
		highlight,
		'#fff5df',
	]);
}

function drawAtriumRings(ctx, width, height, color) {
	const center = width / 2;
	ctx.strokeStyle = color;
	ctx.globalAlpha = 0.42;
	ctx.lineWidth = 5;
	for (let radius = 48; radius < 360; radius += 56) {
		ctx.beginPath();
		ctx.arc(center, center, radius, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

function drawPixelTexture(ctx, width, height, base, lowlight, highlight) {
	for (let y = 0; y < height; y += 32) {
		for (let x = 0; x < width; x += 32) {
			ctx.fillStyle = (x / 32 + y / 32) % 3 === 0 ? lowlight : base;
			ctx.globalAlpha = 0.18;
			ctx.fillRect(x, y, 32, 32);
		}
	}
	ctx.globalAlpha = 1;
	ctx.strokeStyle = highlight;
	ctx.lineWidth = 2;
	drawLooseGrid(ctx, width, height, 64);
}

function drawMemphisTexture(ctx, width, height, lowlight, highlight) {
	for (let index = 0; index < 44; index++) {
		const x = pseudoRandom(index * 11) * width;
		const y = pseudoRandom(index * 13) * height;
		ctx.fillStyle = index % 2 ? lowlight : highlight;
		ctx.globalAlpha = 0.18;
		if (index % 3 === 0) {
			ctx.fillRect(x, y, 42, 11);
		} else {
			ctx.beginPath();
			ctx.arc(x, y, 10 + pseudoRandom(index) * 20, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	ctx.globalAlpha = 1;
}

function drawTerminalTexture(ctx, width, height, lowlight, highlight) {
	ctx.strokeStyle = highlight;
	ctx.lineWidth = 1;
	ctx.globalAlpha = 0.2;
	for (let y = 0; y < height; y += 14) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}
	ctx.globalAlpha = 0.22;
	drawLooseGrid(ctx, width, height, 96);
	ctx.globalAlpha = 1;
	ctx.fillStyle = lowlight;
	for (let index = 0; index < 26; index++) {
		ctx.fillRect(
			pseudoRandom(index * 5) * width,
			pseudoRandom(index * 7) * height,
			40 + pseudoRandom(index) * 70,
			4
		);
	}
}

function drawBotanicalTexture(ctx, width, height, lowlight, highlight) {
	ctx.strokeStyle = lowlight;
	ctx.lineWidth = 5;
	ctx.globalAlpha = 0.22;
	for (let index = 0; index < 18; index++) {
		const x = pseudoRandom(index * 17) * width;
		const y = pseudoRandom(index * 19) * height;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.bezierCurveTo(x + 80, y - 30, x + 120, y + 80, x + 190, y + 20);
		ctx.stroke();
		ctx.fillStyle = highlight;
		ctx.beginPath();
		ctx.ellipse(x + 60, y - 12, 18, 8, 0.4, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

function drawPaperTexture(ctx, width, height, lowlight, highlight) {
	ctx.globalAlpha = 0.2;
	ctx.strokeStyle = lowlight;
	for (let y = 24; y < height; y += 38) {
		ctx.beginPath();
		ctx.moveTo(0, y + pseudoRandom(y) * 4);
		ctx.lineTo(width, y + pseudoRandom(y + 1) * 4);
		ctx.stroke();
	}
	ctx.globalAlpha = 0.14;
	ctx.fillStyle = highlight;
	for (let index = 0; index < 18; index++) {
		ctx.fillRect(
			pseudoRandom(index * 29) * width,
			pseudoRandom(index * 31) * height,
			100,
			22
		);
	}
	ctx.globalAlpha = 1;
}

function drawSpaceTexture(ctx, width, height, lowlight, highlight) {
	ctx.fillStyle = lowlight;
	ctx.globalAlpha = 0.2;
	ctx.fillRect(0, 0, width, height);
	ctx.fillStyle = highlight;
	for (let index = 0; index < 90; index++) {
		ctx.globalAlpha = 0.2 + pseudoRandom(index) * 0.5;
		ctx.fillRect(
			pseudoRandom(index * 3) * width,
			pseudoRandom(index * 5) * height,
			2,
			2
		);
	}
	ctx.globalAlpha = 1;
}

function drawBrutalistTexture(ctx, width, height, lowlight, highlight) {
	ctx.globalAlpha = 0.22;
	ctx.strokeStyle = lowlight;
	ctx.lineWidth = 12;
	for (let index = 0; index < 12; index++) {
		ctx.beginPath();
		ctx.moveTo(0, pseudoRandom(index * 8) * height);
		ctx.lineTo(width, pseudoRandom(index * 9) * height);
		ctx.stroke();
	}
	ctx.globalAlpha = 0.12;
	ctx.fillStyle = highlight;
	ctx.fillRect(width * 0.14, 0, width * 0.08, height);
	ctx.fillRect(width * 0.58, 0, width * 0.05, height);
	ctx.globalAlpha = 1;
}

function drawLabTexture(ctx, width, height, lowlight, highlight) {
	ctx.strokeStyle = lowlight;
	ctx.globalAlpha = 0.38;
	ctx.lineWidth = 2;
	drawLooseGrid(ctx, width, height, 72);
	ctx.globalAlpha = 0.18;
	ctx.fillStyle = highlight;
	for (let index = 0; index < 16; index++) {
		ctx.beginPath();
		ctx.arc(
			pseudoRandom(index * 37) * width,
			pseudoRandom(index * 41) * height,
			18 + pseudoRandom(index) * 24,
			0,
			Math.PI * 2
		);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

function drawVelvetTexture(ctx, width, height, lowlight, highlight) {
	const gradient = ctx.createLinearGradient(0, 0, width, height);
	gradient.addColorStop(0, lowlight);
	gradient.addColorStop(0.48, 'rgba(255,255,255,0.08)');
	gradient.addColorStop(1, highlight);
	ctx.globalAlpha = 0.18;
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, width, height);
	ctx.globalAlpha = 1;
}

function drawNoirTexture(ctx, width, height, lowlight, highlight) {
	ctx.globalAlpha = 0.2;
	ctx.fillStyle = lowlight;
	ctx.fillRect(0, 0, width, height);
	ctx.strokeStyle = highlight;
	for (let index = 0; index < 16; index++) {
		ctx.beginPath();
		ctx.arc(width / 2, height / 2, 44 + index * 28, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

function drawLooseGrid(ctx, width, height, size) {
	for (let x = 0; x <= width; x += size) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
		ctx.stroke();
	}
	for (let y = 0; y <= height; y += size) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}
}

function drawPlasterTexture(ctx, width, height, base, lowlight, highlight) {
	ctx.fillStyle = base;
	ctx.fillRect(0, 0, width, height);
	for (let y = 0; y < height; y += 8) {
		const alpha = 0.04 + pseudoRandom(y) * 0.05;
		ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
		ctx.fillRect(0, y, width, 4);
	}
	drawSpeckles(ctx, width, height, 340, [lowlight, highlight, '#f5d587']);
}

function drawWallPanels(ctx, width, height, panelWidth, panelHeight, color) {
	ctx.strokeStyle = color;
	ctx.lineWidth = 3;
	ctx.globalAlpha = 0.62;
	for (let x = 0; x <= width; x += panelWidth) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
		ctx.stroke();
	}
	for (let y = 0; y <= height; y += panelHeight) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

function drawTileGrid(ctx, width, height, size, grout, highlight) {
	for (let y = 0; y < height; y += size) {
		for (let x = 0; x < width; x += size) {
			ctx.fillStyle =
				(x / size + y / size) % 2 === 0
					? 'rgba(255, 255, 255, 0.035)'
					: 'rgba(0, 0, 0, 0.035)';
			ctx.fillRect(x, y, size, size);
			ctx.strokeStyle = grout;
			ctx.lineWidth = 3;
			ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
			ctx.strokeStyle = highlight;
			ctx.lineWidth = 1;
			ctx.strokeRect(x + 5.5, y + 5.5, size - 11, size - 11);
		}
	}
}

function drawSpeckles(ctx, width, height, count, palette) {
	for (let index = 0; index < count; index++) {
		const x = pseudoRandom(index * 3 + 1) * width;
		const y = pseudoRandom(index * 3 + 2) * height;
		const size = 1 + Math.floor(pseudoRandom(index * 3 + 3) * 5);
		ctx.fillStyle = palette[index % palette.length];
		ctx.globalAlpha = 0.13 + pseudoRandom(index * 7) * 0.32;
		ctx.fillRect(x, y, size, size);
	}
	ctx.globalAlpha = 1;
}

function pseudoRandom(seed) {
	const value = Math.sin(seed * 12.9898) * 43758.5453;
	return value - Math.floor(value);
}

function createShellWall(xOrCenter, zOrCenter, length, isHorizontal) {
	const wall = new THREE.Mesh(
		new THREE.BoxGeometry(
			isHorizontal ? length : wallThickness * 1.6,
			shellHeight,
			isHorizontal ? wallThickness * 1.6 : length
		),
		createShellWallMaterial(length)
	);
	wall.position.set(xOrCenter, shellHeight / 2, zOrCenter);
	return wall;
}

function createShellWallMaterial(length) {
	return createMuseumMaterial('shellWall', {
		repeatX: length / 6,
		repeatY: shellHeight / 2,
		color: wallWarmTint,
		roughness: 0.9,
		metalness: 0.03,
	});
}

function createCeiling(bounds) {
	const group = new THREE.Group();
	const width = bounds.maxX - bounds.minX;
	const depth = bounds.maxZ - bounds.minZ;
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;

	if (!isCurrentVariant) {
		const panel = new THREE.Mesh(
			new THREE.PlaneGeometry(width, depth),
			new THREE.MeshStandardMaterial({
				map: createMuseumTexture('ceiling', width / 8, depth / 8),
				roughness: 0.9,
				metalness: 0.02,
				side: THREE.DoubleSide,
			})
		);
		panel.rotation.x = Math.PI / 2;
		panel.position.set(centerX, shellHeight, centerZ);
		group.add(panel);
		return group;
	}

	// Flat glazed roof over the room wings, with an octagonal opening over
	// the rotunda so visitors look up into a glass cathedral dome.
	const shape = new THREE.Shape();
	shape.moveTo(bounds.minX, bounds.minZ);
	shape.lineTo(bounds.maxX, bounds.minZ);
	shape.lineTo(bounds.maxX, bounds.maxZ);
	shape.lineTo(bounds.minX, bounds.maxZ);
	shape.closePath();
	// The opening is centred on the rotunda hub (origin), not the asymmetric
	// footprint, so it sits squarely over the octagon below.
	const hole = new THREE.Path();
	const holeRadius = hubCircumradius + 0.35;
	for (let index = 0; index <= 8; index++) {
		const angle = Math.PI / 8 + (index * Math.PI) / 4;
		const px = Math.cos(angle) * holeRadius;
		const pz = Math.sin(angle) * holeRadius;
		if (index === 0) {
			hole.moveTo(px, pz);
		} else {
			hole.lineTo(px, pz);
		}
	}
	shape.holes.push(hole);
	const roof = new THREE.Mesh(
		new THREE.ShapeGeometry(shape),
		new THREE.MeshBasicMaterial({
			color: 0xdfeeff,
			transparent: true,
			opacity: 0.6,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	roof.rotation.x = Math.PI / 2;
	roof.position.set(0, shellHeight, 0);
	group.add(roof);

	group.add(createAtriumGlassDome(0, 0));
	return group;
}

// A faceted octagonal glass cupola that rises above the rotunda opening,
// echoing the brass rib structure below and crowned by a glowing lantern.
function createAtriumGlassDome(centerX, centerZ) {
	const group = new THREE.Group();
	const brass = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.12,
		roughness: 0.3,
		metalness: 0.55,
	});
	const baseY = shellHeight - 0.25;
	const rings = [
		{ y: baseY, r: hubCircumradius + 0.1 },
		{ y: baseY + 1.8, r: (hubCircumradius + 0.1) * 0.72 },
		{ y: baseY + 3.2, r: (hubCircumradius + 0.1) * 0.42 },
		{ y: baseY + 4.2, r: 1.5 },
	];

	// Glass facets between successive rings (8-sided open frusta).
	for (let i = 0; i < rings.length - 1; i++) {
		const lower = rings[i];
		const upper = rings[i + 1];
		const height = upper.y - lower.y;
		const facets = new THREE.Mesh(
			new THREE.CylinderGeometry(upper.r, lower.r, height, 8, 1, true, Math.PI / 8),
			new THREE.MeshBasicMaterial({
				color: 0xd6ecff,
				transparent: true,
				opacity: 0.34,
				side: THREE.DoubleSide,
				depthWrite: false,
			})
		);
		facets.position.set(centerX, (lower.y + upper.y) / 2, centerZ);
		group.add(facets);
	}

	// Brass glazing bars: vertical ribs at the 8 corners + horizontal rings.
	for (let k = 0; k < 8; k++) {
		const angle = Math.PI / 8 + (k * Math.PI) / 4;
		for (let i = 0; i < rings.length - 1; i++) {
			const lower = rings[i];
			const upper = rings[i + 1];
			const p0 = new THREE.Vector3(centerX + Math.cos(angle) * lower.r, lower.y, centerZ + Math.sin(angle) * lower.r);
			const p1 = new THREE.Vector3(centerX + Math.cos(angle) * upper.r, upper.y, centerZ + Math.sin(angle) * upper.r);
			group.add(createCylinderBetween(p0, p1, 0.05, brass, 6));
		}
	}
	for (const ring of rings) {
		for (let k = 0; k < 8; k++) {
			const a0 = Math.PI / 8 + (k * Math.PI) / 4;
			const a1 = Math.PI / 8 + ((k + 1) * Math.PI) / 4;
			const p0 = new THREE.Vector3(centerX + Math.cos(a0) * ring.r, ring.y, centerZ + Math.sin(a0) * ring.r);
			const p1 = new THREE.Vector3(centerX + Math.cos(a1) * ring.r, ring.y, centerZ + Math.sin(a1) * ring.r);
			group.add(createCylinderBetween(p0, p1, 0.04, brass, 6));
		}
	}

	// Glowing lantern at the crown.
	const crown = rings[rings.length - 1];
	const skyCap = new THREE.Mesh(
		new THREE.CircleGeometry(crown.r * 1.25, 24),
		new THREE.MeshBasicMaterial({ color: 0xfff3da, side: THREE.DoubleSide })
	);
	skyCap.rotation.x = Math.PI / 2;
	skyCap.position.set(centerX, crown.y + 0.25, centerZ);
	group.add(skyCap);
	const finial = new THREE.Mesh(
		new THREE.SphereGeometry(0.22, 18, 12),
		new THREE.MeshStandardMaterial({ color: 0xf2cf86, emissive: 0xffd166, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.5 })
	);
	finial.position.set(centerX, crown.y + 0.5, centerZ);
	group.add(finial);
	const lantern = new THREE.PointLight(0xfff0d0, 0.85, 34);
	lantern.position.set(centerX, crown.y - 0.8, centerZ);
	registerAnimation(lantern, (object, elapsed) => {
		object.intensity = 0.74 + Math.sin(elapsed * 0.7) * 0.1;
	});
	group.add(lantern);
	return group;
}

function createCeilingDetails(bounds) {
	const group = new THREE.Group();
	const width = bounds.maxX - bounds.minX;
	const depth = bounds.maxZ - bounds.minZ;
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const beamMaterial = new THREE.MeshStandardMaterial({
		color: isCurrentVariant ? 0xd8d2c4 : 0x273247,
		roughness: 0.38,
		metalness: isCurrentVariant ? 0.34 : 0.18,
	});
	const skylightMaterial = new THREE.MeshBasicMaterial({
		color: isCurrentVariant ? 0xbfeaff : activeVariant.eraColors[2],
		transparent: true,
		opacity: isCurrentVariant ? 0.24 : 0.13,
		side: THREE.DoubleSide,
		depthWrite: false,
	});
	const railY = shellHeight - 0.12;

	if (isCurrentVariant) {
		// The cathedral dome and its fittings hang over the rotunda, so they are
		// centred on the hub (origin) rather than on the asymmetric footprint that
		// the flat roof, beams and skylights below span.
		const hubBounds = {
			minX: -hubCircumradius,
			maxX: hubCircumradius,
			minZ: -hubCircumradius,
			maxZ: hubCircumradius,
		};
		group.add(createGrandCeilingOculus(hubBounds));
		group.add(createCathedralVaultSystem(hubBounds));
		group.add(createCathedralRoseWindow(hubBounds));
		group.add(createCathedralLightShafts(hubBounds));
		group.add(createOpenSourceConstellation());
	}

	[-width * 0.28, 0, width * 0.28].forEach((xOffset) => {
		const skylight = new THREE.Mesh(
			new THREE.PlaneGeometry(Math.min(width * 0.18, 9), depth * 0.72),
			skylightMaterial
		);
		skylight.rotation.x = Math.PI / 2;
		skylight.position.set(centerX + xOffset, shellHeight - 0.035, centerZ);
		group.add(skylight);
	});

	for (let index = -3; index <= 3; index++) {
		const z = centerZ + (index * depth) / 7;
		const crossBeam = new THREE.Mesh(
			new THREE.BoxGeometry(width * 0.92, 0.16, 0.2),
			beamMaterial
		);
		crossBeam.position.set(centerX, railY, z);
		group.add(crossBeam);
		if (isCurrentVariant) {
			const brassLine = new THREE.Mesh(
				new THREE.BoxGeometry(width * 0.88, 0.028, 0.045),
				new THREE.MeshBasicMaterial({ color: 0xf6d48b, transparent: true, opacity: 0.72 })
			);
			brassLine.position.set(centerX, railY - 0.11, z);
			group.add(brassLine);
		}
	}
	for (let index = -2; index <= 2; index++) {
		const x = centerX + (index * width) / 6;
		const longBeam = new THREE.Mesh(
			new THREE.BoxGeometry(0.2, 0.14, depth * 0.88),
			beamMaterial
		);
		longBeam.position.set(x, railY + 0.02, centerZ);
		group.add(longBeam);
		if (isCurrentVariant) {
			const brassLine = new THREE.Mesh(
				new THREE.BoxGeometry(0.045, 0.028, depth * 0.84),
				new THREE.MeshBasicMaterial({ color: 0xf6d48b, transparent: true, opacity: 0.68 })
			);
			brassLine.position.set(x, railY - 0.09, centerZ);
			group.add(brassLine);
		}
	}

	if (isCurrentVariant) {
		const warmLight = new THREE.PointLight(0xfff1cc, 1.35, 36);
		warmLight.position.set(centerX, shellHeight - 1.1, centerZ);
		group.add(warmLight);
		registerAnimation(warmLight, (light, elapsed) => {
			light.intensity = 1.18 + Math.sin(elapsed * 0.8) * 0.12;
		});
	}
	return group;
}

function createGrandCeilingOculus(bounds) {
	const group = new THREE.Group();
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const y = shellHeight - 0.34;
	const glassMaterial = new THREE.MeshBasicMaterial({
		color: 0xbfeaff,
		transparent: true,
		opacity: 0.24,
		side: THREE.DoubleSide,
		depthWrite: false,
	});
	const brassMaterial = new THREE.MeshStandardMaterial({
		color: 0xf2cf86,
		emissive: 0x35220a,
		emissiveIntensity: 0.1,
		roughness: 0.28,
		metalness: 0.55,
	});
	const blueMaterial = new THREE.MeshBasicMaterial({
		color: activeVariant.eraColors[2],
		transparent: true,
		opacity: 0.45,
		side: THREE.DoubleSide,
		depthWrite: false,
	});

	const glass = new THREE.Mesh(new THREE.CircleGeometry(5.8, 96), glassMaterial);
	glass.rotation.x = Math.PI / 2;
	glass.position.set(centerX, y + 0.015, centerZ);
	group.add(glass);

	const domeRings = [
		{ radius: 1.55, yOffset: -1.04 },
		{ radius: 2.7, yOffset: -0.78 },
		{ radius: 3.85, yOffset: -0.5 },
		{ radius: 5.0, yOffset: -0.23 },
	];
	domeRings.forEach((spec, index) => {
		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(spec.radius, 0.028, 8, 90),
			brassMaterial
		);
		ring.rotation.x = Math.PI / 2;
		ring.position.set(centerX, y + spec.yOffset, centerZ);
		group.add(ring);

		if (index > 0) {
			const previous = domeRings[index - 1];
			for (let spokeIndex = 0; spokeIndex < 12; spokeIndex++) {
				const angle = (Math.PI * 2 * spokeIndex) / 12 + index * 0.08;
				const start = new THREE.Vector3(
					centerX + Math.cos(angle) * previous.radius,
					y + previous.yOffset,
					centerZ + Math.sin(angle) * previous.radius
				);
				const end = new THREE.Vector3(
					centerX + Math.cos(angle) * spec.radius,
					y + spec.yOffset,
					centerZ + Math.sin(angle) * spec.radius
				);
				group.add(createCylinderBetween(start, end, 0.012, brassMaterial, 8));
			}
		}
	});

	[3.15, 4.35, 5.75].forEach((radius, index) => {
		const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035 + index * 0.008, 10, 96), brassMaterial);
		ring.rotation.x = Math.PI / 2;
		ring.position.set(centerX, y - index * 0.045, centerZ);
		registerAnimation(ring, (object, elapsed) => {
			object.rotation.z = elapsed * (0.035 + index * 0.012) * (index % 2 ? -1 : 1);
		});
		group.add(ring);
	});

	for (let index = 0; index < 16; index++) {
		const angle = (Math.PI * 2 * index) / 16;
		const rib = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 5.55), brassMaterial);
		rib.position.set(centerX + Math.cos(angle) * 1.42, y - 0.08, centerZ + Math.sin(angle) * 1.42);
		rib.rotation.y = -angle;
		group.add(rib);
	}

	for (let index = 0; index < 10; index++) {
		const angle = (Math.PI * 2 * index) / 10 + Math.PI / 10;
		const pane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 1.2), blueMaterial.clone());
		pane.position.set(centerX + Math.cos(angle) * 4.72, y - 0.03, centerZ + Math.sin(angle) * 4.72);
		pane.rotation.y = -angle;
		registerAnimation(pane, (object, elapsed) => {
			object.material.opacity = 0.3 + Math.sin(elapsed * 1.1 + index) * 0.1;
		});
		group.add(pane);
	}

	[
		[activeVariant.eraColors[0], -3.4, -2.6],
		[activeVariant.eraColors[2], 3.5, -2.4],
		[activeVariant.eraColors[4], -3.3, 2.8],
		[activeVariant.eraColors[6], 3.4, 2.7],
	].forEach(([color, x, z], index) => {
		const beam = createCeilingBeamCone(color, 1.55, 5.65, 0.045, centerX + x, centerZ + z);
		registerAnimation(beam, (object, elapsed) => {
			object.material.opacity = 0.035 + Math.sin(elapsed * 1.25 + index) * 0.012;
			object.rotation.y = elapsed * 0.045 + index;
		});
		group.add(beam);
	});

	const coreLight = new THREE.PointLight(0xfff0c8, 0.95, 20);
	coreLight.position.set(centerX, shellHeight - 1.7, centerZ);
	registerAnimation(coreLight, (object, elapsed) => {
		object.intensity = 0.8 + Math.sin(elapsed * 0.85) * 0.1;
	});
	group.add(coreLight);
	return group;
}

function createCathedralVaultSystem(bounds) {
	const group = new THREE.Group();
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const springY = wallHeight + 0.42;
	const crownY = shellHeight - 0.78;
	const vaultRadius = hubApothem - 1.05;
	const brassMaterial = new THREE.MeshStandardMaterial({
		color: 0xf2cf86,
		emissive: 0x2a1806,
		emissiveIntensity: 0.08,
		roughness: 0.28,
		metalness: 0.56,
	});
	const limestoneMaterial = new THREE.MeshStandardMaterial({
		color: 0xf3ead8,
		roughness: 0.78,
		metalness: 0.03,
	});
	const shadowMaterial = new THREE.MeshBasicMaterial({
		color: 0x182237,
		transparent: true,
		opacity: 0.13,
		side: THREE.DoubleSide,
		depthWrite: false,
	});
	const glassMaterial = new THREE.MeshBasicMaterial({
		color: 0xbfeaff,
		transparent: true,
		opacity: 0.115,
		side: THREE.DoubleSide,
		depthWrite: false,
	});
	const coloredGlassMaterial = new THREE.MeshBasicMaterial({
		color: activeVariant.eraColors[2],
		transparent: true,
		opacity: 0.24,
		side: THREE.DoubleSide,
		depthWrite: false,
	});

	const vaultSkin = new THREE.Mesh(
		new THREE.ConeGeometry(vaultRadius, crownY - springY, 8, 1, true, Math.PI / 8),
		shadowMaterial
	);
	vaultSkin.position.set(centerX, (crownY + springY) / 2, centerZ);
	vaultSkin.rotation.y = Math.PI / 8;
	group.add(vaultSkin);

	group.add(createAtriumCorniceRing(limestoneMaterial, brassMaterial));
	hubSides.forEach((side, index) => {
		group.add(createAtriumPointedArch(side, index, coloredGlassMaterial, brassMaterial, limestoneMaterial));
	});

	const crown = new THREE.Vector3(centerX, crownY, centerZ);
	for (let index = 0; index < 16; index++) {
		const angle = Math.PI / 8 + (Math.PI * 2 * index) / 16;
		const start = new THREE.Vector3(
			centerX + Math.cos(angle) * vaultRadius,
			springY,
			centerZ + Math.sin(angle) * vaultRadius
		);
		const control = new THREE.Vector3(
			centerX + Math.cos(angle) * vaultRadius * 0.48,
			crownY + 0.16,
			centerZ + Math.sin(angle) * vaultRadius * 0.48
		);
		const rib = createVaultRib(start, control, crown, index % 2 ? 0.042 : 0.055, brassMaterial, 52);
		group.add(rib);
	}

	for (let index = 0; index < 8; index++) {
		const angle = Math.PI / 8 + (Math.PI * 2 * index) / 8;
		const start = new THREE.Vector3(
			centerX + Math.cos(angle) * vaultRadius,
			springY + 0.04,
			centerZ + Math.sin(angle) * vaultRadius
		);
		const end = new THREE.Vector3(
			centerX - Math.cos(angle) * vaultRadius,
			springY + 0.04,
			centerZ - Math.sin(angle) * vaultRadius
		);
		const control = new THREE.Vector3(centerX, crownY - 0.08 + (index % 2) * 0.22, centerZ);
		group.add(createVaultRib(start, control, end, 0.035, brassMaterial, 64));
	}

	for (let index = 0; index < 8; index++) {
		const angle = Math.PI / 8 + (Math.PI * 2 * index) / 8;
		const pane = createVaultGlowPane(angle, vaultRadius, springY, crownY, activeVariant.eraColors[index % activeVariant.eraColors.length]);
		registerAnimation(pane, (object, elapsed) => {
			object.material.opacity = 0.045 + Math.sin(elapsed * 0.9 + index) * 0.016;
		});
		group.add(pane);
	}

	group.add(createCathedralKeystoneChandelier(centerX, centerZ, springY, crownY, brassMaterial, glassMaterial));
	return group;
}

function createAtriumCorniceRing(limestoneMaterial, brassMaterial) {
	const group = new THREE.Group();
	for (const side of hubSides) {
		for (const spec of [
			{ y: wallHeight + 0.12, height: 0.28, depth: 0.34, material: limestoneMaterial },
			{ y: wallHeight + 0.42, height: 0.055, depth: 0.42, material: brassMaterial },
			{ y: shellHeight - 2.74, height: 0.18, depth: 0.28, material: limestoneMaterial },
			{ y: shellHeight - 2.52, height: 0.05, depth: 0.36, material: brassMaterial },
		]) {
			const cornice = new THREE.Mesh(
				new THREE.BoxGeometry(hubSideLength * 0.94, spec.height, spec.depth),
				spec.material
			);
			cornice.position
				.copy(side.midpoint)
				.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.16));
			cornice.position.y = spec.y;
			cornice.rotation.y = getRotationForNormal(side.normal);
			group.add(cornice);
		}
	}
	return group;
}

function createAtriumPointedArch(side, index, glassMaterial, brassMaterial, limestoneMaterial) {
	const group = new THREE.Group();
	const isMural = side.kind === 'mural';
	const width = isMural ? hubSideLength * 0.74 : roomDoorHalfWidth * 1.82;
	const baseY = wallHeight + 0.36;
	const archHeight = shellHeight - baseY - 2.0;
	const inset = side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.22);
	const midpoint = side.midpoint.clone().add(inset);
	const archMaterial = glassMaterial.clone();
	archMaterial.color.set(activeVariant.eraColors[index % activeVariant.eraColors.length]);
	archMaterial.opacity = isMural ? 0.19 : 0.15;

	const panel = new THREE.Mesh(createPointedArchGeometry(width, archHeight, 0.88), archMaterial);
	panel.position.copy(midpoint);
	panel.position.y = baseY;
	panel.rotation.y = getRotationForNormal(side.normal.clone().multiplyScalar(-1));
	group.add(panel);

	const start = midpoint.clone().add(side.tangent.clone().multiplyScalar(-width / 2));
	start.y = baseY;
	const end = midpoint.clone().add(side.tangent.clone().multiplyScalar(width / 2));
	end.y = baseY;
	const control = midpoint.clone().add(side.normal.clone().multiplyScalar(-0.16));
	control.y = baseY + archHeight + 0.15;
	group.add(createVaultRib(start, control, end, 0.046, brassMaterial, 48));

	for (const offset of [-width * 0.24, 0, width * 0.24]) {
		const mullionStart = midpoint.clone().add(side.tangent.clone().multiplyScalar(offset));
		mullionStart.y = baseY - 0.78;
		const mullionEnd = midpoint.clone().add(side.tangent.clone().multiplyScalar(offset * 0.52));
		mullionEnd.y = baseY + archHeight * (offset === 0 ? 0.95 : 0.66);
		group.add(createCylinderBetween(mullionStart, mullionEnd, offset === 0 ? 0.026 : 0.018, brassMaterial, 8));
	}

	if (!isMural) {
		const threshold = new THREE.Mesh(
			new THREE.BoxGeometry(width + 0.5, 0.14, 0.34),
			limestoneMaterial
		);
		threshold.position.copy(midpoint);
		threshold.position.y = wallHeight + 0.02;
		threshold.rotation.y = getRotationForNormal(side.normal);
		group.add(threshold);
	}
	return group;
}

function createPointedArchGeometry(width, height, baseDrop) {
	const halfWidth = width / 2;
	const shape = new THREE.Shape();
	shape.moveTo(-halfWidth, -baseDrop);
	shape.lineTo(-halfWidth, 0);
	shape.quadraticCurveTo(-halfWidth * 0.9, height * 0.7, 0, height);
	shape.quadraticCurveTo(halfWidth * 0.9, height * 0.7, halfWidth, 0);
	shape.lineTo(halfWidth, -baseDrop);
	shape.lineTo(-halfWidth, -baseDrop);
	return new THREE.ShapeGeometry(shape, 18);
}

function createVaultGlowPane(angle, radius, springY, crownY, color) {
	const pane = new THREE.Mesh(
		new THREE.PlaneGeometry(2.1, crownY - springY - 0.9),
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.045,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	pane.position.set(
		Math.cos(angle) * radius * 0.56,
		(springY + crownY) / 2 - 0.18,
		Math.sin(angle) * radius * 0.56
	);
	pane.rotation.y = -angle + Math.PI / 2;
	pane.rotation.z = Math.sin(angle) * 0.34;
	return pane;
}

function createCathedralKeystoneChandelier(centerX, centerZ, springY, crownY, brassMaterial, glassMaterial) {
	const group = new THREE.Group();
	const chainMaterial = new THREE.MeshBasicMaterial({
		color: 0xfff5df,
		transparent: true,
		opacity: 0.58,
	});
	const crystalMaterial = new THREE.MeshBasicMaterial({
		color: 0xbfeaff,
		transparent: true,
		opacity: 0.64,
		depthWrite: false,
	});
	const top = new THREE.Vector3(centerX, crownY + 0.02, centerZ);
	const hanger = new THREE.Vector3(centerX, springY + 1.25, centerZ);
	group.add(createCylinderBetween(top, hanger, 0.016, chainMaterial, 8));

	[0.68, 1.12, 1.72].forEach((radius, ringIndex) => {
		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(radius, 0.026 + ringIndex * 0.004, 8, 80),
			brassMaterial
		);
		ring.rotation.x = Math.PI / 2;
		ring.position.set(centerX, hanger.y - ringIndex * 0.32, centerZ);
		registerAnimation(ring, (object, elapsed) => {
			object.rotation.z = elapsed * (0.11 + ringIndex * 0.045) * (ringIndex % 2 ? -1 : 1);
		});
		group.add(ring);

		for (let index = 0; index < 10 + ringIndex * 4; index++) {
			const angle = (Math.PI * 2 * index) / (10 + ringIndex * 4) + ringIndex * 0.14;
			const anchor = new THREE.Vector3(
				centerX + Math.cos(angle) * radius,
				ring.position.y,
				centerZ + Math.sin(angle) * radius
			);
			const crystal = new THREE.Mesh(
				new THREE.OctahedronGeometry(0.055 + ringIndex * 0.018, 0),
				crystalMaterial.clone()
			);
			crystal.material.color.set(activeVariant.eraColors[(index + ringIndex) % activeVariant.eraColors.length]);
			crystal.position.copy(anchor);
			crystal.position.y -= 0.28 + (index % 3) * 0.08;
			group.add(createCylinderBetween(anchor, crystal.position, 0.006, chainMaterial, 6));
			registerAnimation(crystal, (object, elapsed) => {
				object.rotation.y = elapsed * (0.7 + ringIndex * 0.18) + index;
				object.position.y = anchor.y - 0.28 - (index % 3) * 0.08 + Math.sin(elapsed * 1.4 + index) * 0.035;
				object.material.opacity = 0.52 + Math.sin(elapsed * 1.8 + index) * 0.12;
			});
			group.add(crystal);
		}
	});

	const core = new THREE.Mesh(
		new THREE.IcosahedronGeometry(0.28, 1),
		new THREE.MeshStandardMaterial({
			color: 0xfff5df,
			emissive: 0xffd166,
			emissiveIntensity: 0.35,
			roughness: 0.22,
			metalness: 0.18,
		})
	);
	core.position.copy(hanger);
	core.position.y += 0.08;
	registerAnimation(core, (object, elapsed) => {
		object.rotation.x = elapsed * 0.4;
		object.rotation.y = elapsed * 0.62;
		object.scale.setScalar(1 + Math.sin(elapsed * 1.3) * 0.04);
	});
	group.add(core);

	const halo = new THREE.Mesh(new THREE.TorusGeometry(2.18, 0.018, 8, 96), glassMaterial.clone());
	halo.rotation.x = Math.PI / 2;
	halo.position.set(centerX, hanger.y + 0.24, centerZ);
	registerAnimation(halo, (object, elapsed) => {
		object.rotation.z = elapsed * -0.08;
		object.material.opacity = 0.13 + Math.sin(elapsed * 0.8) * 0.035;
	});
	group.add(halo);

	const light = new THREE.PointLight(0xffe5a8, 1.6, 20);
	light.position.copy(hanger);
	registerAnimation(light, (object, elapsed) => {
		object.intensity = 1.38 + Math.sin(elapsed * 1.2) * 0.16;
	});
	group.add(light);
	return group;
}

function createVaultRib(start, control, end, radius, material, segments = 56) {
	const curve = new THREE.QuadraticBezierCurve3(start, control, end);
	return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 10, false), material);
}

function createCeilingBeamCone(color, radius, height, opacity, x, z) {
	const cone = new THREE.Mesh(
		new THREE.ConeGeometry(radius, height, 36, 1, true),
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	cone.position.set(x, shellHeight - height / 2 - 0.58, z);
	return cone;
}

function createCathedralRoseWindow(bounds) {
	const group = new THREE.Group();
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const y = shellHeight - 0.42;

	const rose = new THREE.Mesh(
		new THREE.CircleGeometry(5.4, 96),
		new THREE.MeshBasicMaterial({
			map: createRoseWindowTexture(),
			transparent: true,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	rose.rotation.x = Math.PI / 2;
	rose.position.set(centerX, y, centerZ);
	registerAnimation(rose, (object, elapsed) => {
		object.rotation.z = elapsed * 0.04;
	});
	group.add(rose);

	const counterRose = new THREE.Mesh(
		new THREE.CircleGeometry(4.6, 80),
		new THREE.MeshBasicMaterial({
			map: createRoseWindowTexture(true),
			transparent: true,
			side: THREE.DoubleSide,
			opacity: 0.78,
			depthWrite: false,
		})
	);
	counterRose.rotation.x = Math.PI / 2;
	counterRose.position.set(centerX, y - 0.04, centerZ);
	registerAnimation(counterRose, (object, elapsed) => {
		object.rotation.z = -elapsed * 0.07;
	});
	group.add(counterRose);

	const brass = new THREE.MeshStandardMaterial({
		color: 0xf5d088,
		emissive: 0x402208,
		emissiveIntensity: 0.18,
		roughness: 0.28,
		metalness: 0.6,
	});
	const outer = new THREE.Mesh(
		new THREE.TorusGeometry(5.4, 0.092, 14, 96),
		brass
	);
	outer.rotation.x = Math.PI / 2;
	outer.position.set(centerX, y, centerZ);
	group.add(outer);
	const inner = new THREE.Mesh(
		new THREE.TorusGeometry(2.1, 0.046, 12, 72),
		brass
	);
	inner.rotation.x = Math.PI / 2;
	inner.position.set(centerX, y - 0.03, centerZ);
	group.add(inner);

	for (let index = 0; index < 12; index++) {
		const angle = (Math.PI * 2 * index) / 12;
		const spoke = new THREE.Mesh(
			new THREE.BoxGeometry(0.054, 0.04, 3.2),
			brass
		);
		spoke.position.set(centerX, y - 0.045, centerZ);
		spoke.rotation.y = -angle;
		spoke.position.x = centerX + Math.cos(angle) * 3.65;
		spoke.position.z = centerZ + Math.sin(angle) * 3.65;
		group.add(spoke);
	}

	return group;
}

function createRoseWindowTexture(inverted = false) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 1024;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	const cx = canvas.width / 2;
	const cy = canvas.height / 2;

	const baseGrad = ctx.createRadialGradient(cx, cy, 40, cx, cy, 512);
	baseGrad.addColorStop(0, 'rgba(255, 245, 200, 0.95)');
	baseGrad.addColorStop(0.4, 'rgba(255, 209, 102, 0.45)');
	baseGrad.addColorStop(1, 'rgba(43, 183, 255, 0.18)');
	ctx.fillStyle = baseGrad;
	ctx.beginPath();
	ctx.arc(cx, cy, 510, 0, Math.PI * 2);
	ctx.fill();

	const colors = ['#ff4f64', '#ffd166', '#50d890', '#2bb7ff', '#b37cff', '#ff9b54', '#78e0dc'];

	const petals = inverted ? 8 : 12;
	for (let index = 0; index < petals; index++) {
		const angle = (Math.PI * 2 * index) / petals + (inverted ? Math.PI / petals : 0);
		const radius = inverted ? 280 : 380;
		const petalSize = inverted ? 130 : 165;
		const color = colors[index % colors.length];
		ctx.save();
		ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
		ctx.rotate(angle + Math.PI / 2);
		ctx.fillStyle = color;
		ctx.globalAlpha = 0.74;
		ctx.beginPath();
		ctx.ellipse(0, 0, petalSize * 0.55, petalSize, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalAlpha = 0.36;
		ctx.fillStyle = '#fff5df';
		ctx.beginPath();
		ctx.ellipse(0, -petalSize * 0.4, petalSize * 0.32, petalSize * 0.5, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	const inner = inverted ? 4 : 6;
	for (let index = 0; index < inner; index++) {
		const angle = (Math.PI * 2 * index) / inner;
		ctx.save();
		ctx.translate(cx + Math.cos(angle) * 130, cy + Math.sin(angle) * 130);
		ctx.fillStyle = colors[index % colors.length];
		ctx.globalAlpha = 0.82;
		ctx.beginPath();
		ctx.arc(0, 0, 70, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	ctx.globalAlpha = 0.95;
	ctx.fillStyle = '#fff5df';
	ctx.beginPath();
	ctx.arc(cx, cy, 64, 0, Math.PI * 2);
	ctx.fill();

	ctx.fillStyle = '#0a4660';
	ctx.font = '900 88px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('W', cx, cy + 6);

	ctx.strokeStyle = 'rgba(15, 30, 50, 0.55)';
	ctx.lineWidth = 6;
	for (let index = 0; index < petals; index++) {
		const angle = (Math.PI * 2 * index) / petals;
		ctx.beginPath();
		ctx.moveTo(cx + Math.cos(angle) * 70, cy + Math.sin(angle) * 70);
		ctx.lineTo(cx + Math.cos(angle) * 500, cy + Math.sin(angle) * 500);
		ctx.stroke();
	}

	ctx.lineWidth = 4;
	[180, 260, 360, 460].forEach((r) => {
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.stroke();
	});

	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createCathedralLightShafts(bounds) {
	const group = new THREE.Group();
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const sourceY = shellHeight - 0.6;
	const baseY = 0.05;
	const colors = activeVariant.eraColors;

	for (let index = 0; index < 8; index++) {
		const angle = (Math.PI * 2 * index) / 8 + Math.PI / 8;
		const radius = 2.4 + (index % 2) * 0.7;
		const targetX = centerX + Math.cos(angle) * (hubApothem - 2.6 + (index % 3) * 0.4);
		const targetZ = centerZ + Math.sin(angle) * (hubApothem - 2.6 + (index % 3) * 0.4);
		const color = colors[index % colors.length];

		const height = sourceY - baseY;
		const geometry = new THREE.ConeGeometry(radius, height, 18, 1, true);
		const material = new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.06,
			side: THREE.DoubleSide,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		});
		const cone = new THREE.Mesh(geometry, material);
		cone.position.set(
			(centerX + targetX) / 2,
			(sourceY + baseY) / 2,
			(centerZ + targetZ) / 2
		);
		const dirX = targetX - centerX;
		const dirZ = targetZ - centerZ;
		cone.rotation.set(0, Math.atan2(dirX, dirZ), 0);
		cone.rotation.x = Math.PI;
		registerAnimation(cone, (object, elapsed) => {
			object.material.opacity = 0.04 + (Math.sin(elapsed * 0.6 + index * 0.7) * 0.5 + 0.5) * 0.06;
		});
		group.add(cone);
	}
	return group;
}

function createOpenSourceConstellation() {
	const group = new THREE.Group();
	const center = new THREE.Vector3(0, shellHeight - 2.05, 0);
	const nodeMaterial = new THREE.MeshStandardMaterial({
		color: 0xfff5df,
		emissive: 0x253bff,
		emissiveIntensity: 0.08,
		roughness: 0.32,
		metalness: 0.22,
	});
	const linkMaterial = new THREE.MeshBasicMaterial({
		color: 0xfff5df,
		transparent: true,
		opacity: 0.22,
	});
	const cableMaterial = new THREE.MeshBasicMaterial({
		color: 0xfff5df,
		transparent: true,
		opacity: 0.36,
	});
	const nodes = [];

	openSourceProjectItems.forEach((item, index) => {
		const angle = -Math.PI / 2 + (Math.PI * 2 * index) / openSourceProjectItems.length;
		const radius = 3.2 + (index % 3) * 0.52;
		const y = shellHeight - 2.08 + Math.sin(index * 1.7) * 0.34;
		const position = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
		nodes.push(position);

		const node = new THREE.Mesh(
			new THREE.SphereGeometry(0.09 + (index % 2) * 0.025, 16, 10),
			nodeMaterial.clone()
		);
		node.material.color.set(item.color);
		node.material.emissive = new THREE.Color(item.color);
		node.position.copy(position);
		registerAnimation(node, (object, elapsed) => {
			const pulse = 1 + Math.sin(elapsed * 1.6 + index) * 0.12;
			object.scale.setScalar(pulse);
			object.material.emissiveIntensity = 0.08 + Math.sin(elapsed * 1.2 + index) * 0.035;
		});
		group.add(node);

		const cableTop = new THREE.Vector3(position.x, shellHeight - 0.56, position.z);
		group.add(createCylinderBetween(cableTop, position, 0.008, cableMaterial, 8));
		// (Per-node project labels removed — unreadable from the floor.)
	});

	nodes.forEach((position, index) => {
		group.add(createCylinderBetween(position, nodes[(index + 1) % nodes.length], 0.01, linkMaterial, 8));
		if (index % 3 === 0) {
			group.add(createCylinderBetween(position, center, 0.008, linkMaterial, 8));
		}
	});

	const core = new THREE.Mesh(
		new THREE.OctahedronGeometry(0.22, 1),
		new THREE.MeshStandardMaterial({
			color: activeVariant.eraColors[0],
			emissive: new THREE.Color(activeVariant.eraColors[0]),
			emissiveIntensity: 0.2,
			roughness: 0.28,
			metalness: 0.28,
		})
	);
	core.position.copy(center);
	registerAnimation(core, (object, elapsed) => {
		object.rotation.x = elapsed * 0.22;
		object.rotation.y = elapsed * 0.34;
	});
	group.add(core);
	return group;
}

function createAtrium() {
	const group = new THREE.Group();
	group.add(createHubFloor());
	group.add(createHubWalls());
	group.add(createAtriumDecor());
	return group;
}

function createHubFloor() {
	const floor = new THREE.Mesh(
		new THREE.CircleGeometry(hubCircumradius, 8, Math.PI / 8),
		createMuseumMaterial('atriumFloor', {
			repeatX: (hubCircumradius * 2) / floorTileSpan,
			repeatY: (hubCircumradius * 2) / floorTileSpan,
			roughness: 0.22,
			metalness: 0.34,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	return floor;
}

function createHubWalls() {
	const group = new THREE.Group();
	for (const side of hubSides) {
		if (side.kind === 'mural') {
			group.add(createMuralWall(side));
		} else {
			const segmentLength = (roomWidth - roomDoorHalfWidth * 2) / 2;
			const segmentOffset = roomDoorHalfWidth + segmentLength / 2;
			group.add(createHubWallSegment(side, segmentLength, -segmentOffset));
			group.add(createHubWallSegment(side, segmentLength, segmentOffset));
		}
	}
	return group;
}

function createHubWallSegment(side, length, tangentOffset) {
	const wall = new THREE.Mesh(
		new THREE.BoxGeometry(
			length,
			wallHeight,
			wallThickness
		),
		createRoomWallMaterial(length)
	);
	wall.position
		.copy(side.midpoint)
		.add(side.tangent.clone().multiplyScalar(tangentOffset));
	wall.position.y = wallHeight / 2;
	wall.rotation.y = getRotationForNormal(side.normal);
	return wall;
}

function createMuralWall(side) {
	const group = new THREE.Group();
	const half = hubSideLength / 2;
	const dHW = portalDoorHalfWidth;
	const dC = portalCenterOffset;
	// Three full-height wall segments: left wall, central pier, right wall.
	const segments = [
		[-half, -(dC + dHW)],
		[-(dC - dHW), dC - dHW],
		[dC + dHW, half],
	];
	for (const [a, b] of segments) {
		group.add(createHubWallSegment(side, b - a, (a + b) / 2));
	}

	// Wall + lintel above each doorway, and the mural spanning above both.
	for (const portal of muralPortals) {
		group.add(createPortalTransom(side, portal.offset));
	}
	group.add(createWordPressMural(side));

	if (isCurrentVariant) {
		group.add(createPierWapuuPicture(side));
		for (const portal of muralPortals) {
			group.add(createPortalSign(side, portal));
		}
	}
	return group;
}

function createMissionTabletTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 768;
	canvas.height = 380;
	const ctx = canvas.getContext('2d');
	// Dark engraved-stone field with a thin inner keyline, matching the gallery plaques.
	ctx.fillStyle = '#10182a';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.strokeStyle = 'rgba(242, 207, 134, 0.5)';
	ctx.lineWidth = 4;
	ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#f2cf86';
	fillFittedCanvasText(ctx, 'CODE IS POETRY', canvas.width / 2, 138, 620, 92, '900', 'Georgia, serif');
	// Thin divider rule.
	ctx.fillRect(canvas.width / 2 - 150, 214, 300, 3);
	ctx.fillStyle = '#dce6f5';
	ctx.font = 'italic 600 34px Georgia, serif';
	ctx.fillText('to democratize publishing', canvas.width / 2, 268);
	ctx.fillStyle = 'rgba(220, 230, 245, 0.66)';
	ctx.font = '600 22px ui-monospace, Menlo, monospace';
	ctx.fillText('the WordPress mission · est. 2003', canvas.width / 2, 314);
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function createWordPressMural(side) {
	const group = new THREE.Group();
	// Seat the tablet in the clear band between the EXIT/WELCOME door signs
	// (their tops sit at ≈portalDoorHeight+0.38) and the vault's springing
	// entablature (its lower beam undersides at ≈wallHeight-0.02), so the
	// framed banner crowds neither above nor below.
	const bandBottom = portalDoorHeight + 0.72;
	const bandTop = wallHeight - 0.38;
	const muralHeight = bandTop - bandBottom;
	// As wide as looks generous while the panel and its frame still clear the
	// flanking column shafts (inner edge ≈5.9m off centre) with a comfortable gap.
	const muralWidth = hubSideLength * 0.72;
	const mural = new THREE.Mesh(
		new THREE.PlaneGeometry(muralWidth, muralHeight),
		new THREE.MeshBasicMaterial({
			map: createWordPressMuralTexture(muralWidth / muralHeight),
			transparent: true,
			side: THREE.DoubleSide,
		})
	);
	mural.position.z = 0.02;
	group.add(mural);
	group.add(createMuralFrame(muralWidth, muralHeight));

	group.position
		.copy(side.midpoint)
		.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.08));
	group.position.y = (bandBottom + bandTop) / 2;
	group.rotation.y = getRotationForNormal(
		side.normal.clone().multiplyScalar(-1)
	);
	return group;
}

// A refined carved-stone molding around the marble tablet, built in the mural's
// local XY plane: a pale marble outer band echoing the wall, with a slim polished
// bronze bead seated against the field. Kept elegant and light rather than heavy.
function createMuralFrame(width, height) {
	const group = new THREE.Group();
	const stone = new THREE.MeshStandardMaterial({
		color: 0xe7decb,
		roughness: 0.66,
		metalness: 0.05,
	});
	const bronze = new THREE.MeshStandardMaterial({
		color: 0xb98a3e,
		roughness: 0.38,
		metalness: 0.55,
	});

	// Outer marble molding band.
	const railWidth = 0.18;
	const outerW = width + railWidth * 2;
	const horizontal = new THREE.BoxGeometry(outerW, railWidth, 0.12);
	const vertical = new THREE.BoxGeometry(railWidth, height, 0.12);
	const rails = [
		[horizontal, 0, height / 2 + railWidth / 2],
		[horizontal, 0, -(height / 2 + railWidth / 2)],
		[vertical, -(width / 2 + railWidth / 2), 0],
		[vertical, width / 2 + railWidth / 2, 0],
	];
	for (const [geometry, x, y] of rails) {
		const rail = new THREE.Mesh(geometry, stone);
		rail.position.set(x, y, 0);
		group.add(rail);
	}

	// Slim bronze bead seated against the field for a crisp inner edge.
	const beadW = 0.05;
	const beadH = new THREE.BoxGeometry(width + beadW * 2, beadW, 0.05);
	const beadV = new THREE.BoxGeometry(beadW, height, 0.05);
	const beads = [
		[beadH, 0, height / 2 + beadW / 2],
		[beadH, 0, -(height / 2 + beadW / 2)],
		[beadV, -(width / 2 + beadW / 2), 0],
		[beadV, width / 2 + beadW / 2, 0],
	];
	for (const [geometry, x, y] of beads) {
		const bead = new THREE.Mesh(geometry, bronze);
		bead.position.set(x, y, 0.05);
		group.add(bead);
	}
	return group;
}

function createPortalTransom(side, offset) {
	const group = new THREE.Group();
	const beamHeight = wallHeight - portalDoorHeight;
	const transom = new THREE.Mesh(
		new THREE.BoxGeometry(portalDoorHalfWidth * 2, beamHeight, wallThickness),
		createRoomWallMaterial(portalDoorHalfWidth * 2)
	);
	transom.position
		.copy(side.midpoint)
		.add(side.tangent.clone().multiplyScalar(offset));
	transom.position.y = portalDoorHeight + beamHeight / 2;
	transom.rotation.y = getRotationForNormal(side.normal);
	group.add(transom);

	const lintelMaterial = new THREE.MeshStandardMaterial({
		color: 0xf5d088,
		emissive: 0x2a1808,
		emissiveIntensity: 0.18,
		roughness: 0.28,
		metalness: 0.55,
	});
	const lintel = new THREE.Mesh(
		new THREE.BoxGeometry(portalDoorHalfWidth * 2 + 0.2, 0.16, 0.36),
		lintelMaterial
	);
	lintel.position
		.copy(side.midpoint)
		.add(side.tangent.clone().multiplyScalar(offset))
		.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.18));
	lintel.position.y = portalDoorHeight + 0.05;
	lintel.rotation.y = getRotationForNormal(side.normal);
	group.add(lintel);
	return group;
}

// A held-logo Wapuu: an emblem-free figure cradling a big WordPress medallion
// in front of its belly. Shared by the static pier greeter and the
// follow-the-viewer rotunda docent. The medallion is parented to the returned
// group, so rotating the group turns the logo to face whoever is looking.
// Sizes are proportional to height to match the height-2.3 pier greeter.
function createGreeterWapuu(height, accent) {
	const group = new THREE.Group();

	const wapuu = createWapuu3D({ height, accent, emblem: false, hold: true });
	group.add(wapuu);

	const medallion = createWpLogoMedallion(0.135 * height);
	const medallionY = 0.2 * height;
	medallion.position.set(0, medallionY, 0.287 * height);
	medallion.rotation.x = -0.12;
	registerAnimation(medallion, (object, elapsed) => {
		object.position.y = medallionY + Math.sin(elapsed * 1.5) * 0.018;
		object.rotation.z = Math.sin(elapsed * 0.8) * 0.02;
	});
	group.add(medallion);
	return group;
}

// A large, ornately framed Wapuu portrait centered on the wide central pier
// between the two doorways. The layered gilt frame and corner ornaments make it
// the pier's centerpiece. It preserves Alex's easter egg: clicking the picture
// cycles through the Wapuu image variations.
function createPierWapuuPicture(side) {
	const group = new THREE.Group();
	const art = 2.0;
	const brass = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		roughness: 0.34,
		metalness: 0.5,
	});

	// Outer beveled gilt molding (backing slab) and a slightly recessed inner liner.
	const outer = new THREE.Mesh(
		new THREE.BoxGeometry(art + 0.36, art + 0.36, 0.1),
		brass
	);
	group.add(outer);
	const liner = new THREE.Mesh(
		new THREE.BoxGeometry(art + 0.12, art + 0.12, 0.06),
		new THREE.MeshStandardMaterial({ color: 0xe6c87a, roughness: 0.3, metalness: 0.55 })
	);
	liner.position.z = 0.05;
	group.add(liner);

	// Raised diamond corner ornaments on the outer molding.
	const ornament = new THREE.BoxGeometry(0.2, 0.2, 0.14);
	const corner = (art + 0.36) / 2 - 0.05;
	for (const sx of [-1, 1]) {
		for (const sy of [-1, 1]) {
			const boss = new THREE.Mesh(ornament, brass);
			boss.position.set(sx * corner, sy * corner, 0.04);
			boss.rotation.z = Math.PI / 4;
			group.add(boss);
		}
	}

	const textures = getWapuuTextures();
	const picture = new THREE.Mesh(
		new THREE.PlaneGeometry(art, art),
		new THREE.MeshBasicMaterial({
			map: textures[0],
			transparent: true,
			alphaTest: 0.04,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	picture.position.z = 0.09;
	registerWapuuVariationClick(picture, textures);
	group.add(picture);

	group.position
		.copy(side.midpoint)
		.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.06));
	group.position.y = 2.62; // centered on the pier, below the mural and doorway lintels
	group.rotation.y = getRotationForNormal(side.normal.clone().multiplyScalar(-1));
	return group;
}

// A thick WordPress logo medallion built in the round: a beveled blue disc
// with the official asymmetric "W" mark on its face (crisp texture) plus a
// raised white relief of the same strokes for real dimensionality.
function createWpLogoMedallion(radius) {
	const group = new THREE.Group();
	const depth = radius * 0.22;
	const wpBlue = 0x21759b;

	const rim = new THREE.Mesh(
		new THREE.CylinderGeometry(radius, radius, depth, 64),
		new THREE.MeshStandardMaterial({ color: wpBlue, roughness: 0.42, metalness: 0.18 })
	);
	rim.rotation.x = Math.PI / 2;
	group.add(rim);

	// Subtle outer ring to frame the disc edge.
	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(radius - 0.006, 0.018, 10, 72),
		new THREE.MeshStandardMaterial({ color: 0x1a5d7e, roughness: 0.4, metalness: 0.22 })
	);
	ring.position.z = depth / 2 - 0.004;
	group.add(ring);

	// The real official WordPress mark (white logotype on the blue disc) on the
	// front face.
	const face = new THREE.Mesh(
		new THREE.CircleGeometry(radius - 0.012, 64),
		new THREE.MeshBasicMaterial({ map: createWpMedallionTexture(wpBlue) })
	);
	face.position.z = depth / 2 + 0.002;
	group.add(face);
	return group;
}

function createWpMedallionTexture(color) {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 512;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
	ctx.beginPath();
	ctx.arc(256, 256, 252, 0, Math.PI * 2);
	ctx.fill();
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 8;
	const img = new Image();
	img.onload = () => {
		const dest = 392;
		const off = (512 - dest) / 2;
		ctx.drawImage(img, off, off, dest, dest);
		refreshCanvasTexture(texture);
	};
	img.src = wpLogoSvgDataUrl('#fdfdf4');
	return texture;
}

function createPortalSign(side, portal) {
	const group = new THREE.Group();
	const sign = createReadableLabel(
		createPortalSignTexture(portal),
		2.5,
		0.66
	);
	sign.position
		.copy(side.midpoint)
		.add(side.tangent.clone().multiplyScalar(portal.offset))
		.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.42));
	sign.position.y = portalDoorHeight + 0.05;
	sign.rotation.y = getRotationForNormal(side.normal.clone().multiplyScalar(-1));
	group.add(sign);

	return group;
}

function createPortalSignTexture(portal) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 280;
	const ctx = canvas.getContext('2d');
	// A brass museum plaque — calmer than the old black marquee.
	const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
	grad.addColorStop(0, '#bd9743');
	grad.addColorStop(0.5, '#aa863a');
	grad.addColorStop(1, '#8c6d2d');
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.strokeStyle = 'rgba(58, 42, 16, 0.55)';
	ctx.lineWidth = 8;
	ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
	ctx.fillStyle = '#2c2008';
	ctx.font = '900 120px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(portal.title, 512, 116);
	ctx.fillStyle = '#3a2c12';
	ctx.font = '700 38px system-ui, sans-serif';
	ctx.fillText(portal.sub.toUpperCase(), 512, 214);

	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createWapuuCutout(height, options = {}) {
	const group = new THREE.Group();
	const width = height;
	if (options.shadow) {
		const shadow = new THREE.Mesh(
			new THREE.PlaneGeometry(width * 1.08, height * 1.08),
			new THREE.MeshBasicMaterial({
				color: 0x08101d,
				transparent: true,
				opacity: 0.32,
				side: THREE.DoubleSide,
				depthWrite: false,
			})
		);
		shadow.position.set(0.08, height / 2 - 0.06, -0.024);
		group.add(shadow);
	}

	const textures = getWapuuTextures();
	const wapuu = new THREE.Mesh(
		new THREE.PlaneGeometry(width, height),
		new THREE.MeshBasicMaterial({
			map: textures[0],
			transparent: true,
			alphaTest: 0.04,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	wapuu.position.y = height / 2;
	wapuu.position.z = 0.012;
	registerWapuuVariationClick(wapuu, textures);
	group.add(wapuu);

	if (options.crossBillboard) {
		const sideWapuu = new THREE.Mesh(
			new THREE.PlaneGeometry(width, height),
			wapuu.material.clone()
		);
		sideWapuu.position.y = height / 2;
		sideWapuu.rotation.y = Math.PI / 2;
		sideWapuu.material.opacity = 0.82;
		group.add(sideWapuu);
		const spine = new THREE.Mesh(
			new THREE.CylinderGeometry(0.018, 0.018, height * 0.82, 8),
			new THREE.MeshBasicMaterial({
				color: options.glow || 0xfff5df,
				transparent: true,
				opacity: 0.5,
			})
		);
		spine.position.y = height * 0.51;
		group.add(spine);
	}

	if (options.glow) {
		const halo = new THREE.Mesh(
			new THREE.RingGeometry(width * 0.52, width * 0.58, 48),
			new THREE.MeshBasicMaterial({
				color: options.glow,
				transparent: true,
				opacity: 0.38,
				side: THREE.DoubleSide,
				depthWrite: false,
			})
		);
		halo.position.set(0, height * 0.48, -0.035);
		registerAnimation(halo, (object, elapsed) => {
			object.rotation.z = elapsed * 0.22;
			object.material.opacity = 0.25 + Math.sin(elapsed * 1.8) * 0.08;
		});
		group.add(halo);
	}
	return group;
}

function registerWapuuVariationClick(wapuu, textures) {
	if (textures.length < 2) {
		return;
	}

	wapuu.userData.wapuuVariationIndex = 0;
	wapuu.userData.onPick = () => {
		if (wapuu.userData.wapuuFlipStart) {
			return;
		}
		const toIndex = (wapuu.userData.wapuuVariationIndex + 1) % textures.length;
		if (toIndex === 0) {
			// The click that completes the variation tour leads out to the gallery
			// they came from. wapuu.studio forbids iframing (X-Frame-Options:
			// SAMEORIGIN), so a new tab rather than the Playground modal.
			window.open('https://wapuu.studio/', '_blank', 'noopener,noreferrer');
		}
		wapuu.userData.wapuuFlipStart = clock.elapsedTime;
		wapuu.userData.wapuuFlipFromIndex = wapuu.userData.wapuuVariationIndex;
		wapuu.userData.wapuuFlipToIndex = toIndex;
	};
	pickables.push(wapuu);

	registerAnimation(wapuu, (object, elapsed) => {
		if (!object.userData.wapuuFlipStart) {
			return;
		}

		const flipDuration = 0.58;
		const progress = THREE.MathUtils.clamp(
			(elapsed - object.userData.wapuuFlipStart) / flipDuration,
			0,
			1
		);
		const scaleX = Math.max(0.045, Math.abs(Math.cos(progress * Math.PI)));
		const textureIndex = progress >= 0.5
			? object.userData.wapuuFlipToIndex
			: object.userData.wapuuFlipFromIndex;

		if (object.userData.wapuuVariationIndex !== textureIndex) {
			object.material.map = textures[textureIndex];
			object.material.needsUpdate = true;
			object.userData.wapuuVariationIndex = textureIndex;
		}
		object.scale.x = scaleX;

		if (progress >= 1) {
			object.scale.x = 1;
			object.userData.wapuuVariationIndex = object.userData.wapuuFlipToIndex;
			object.userData.wapuuFlipStart = 0;
		}
	});
}

function createWordPressMuralTexture(aspect) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 640;
	const ctx = canvas.getContext('2d');
	if (activeVariant.muralStyle === 'ultimate') {
		// Match the canvas aspect to the mural plane so a drawn circle (the W
		// medallion) stays circular on the wall rather than stretching to an ellipse.
		canvas.width = 1280;
		canvas.height = Math.round(canvas.width / aspect);
		drawUltimateMural(ctx, canvas);
		const texture = createCanvasTexture(canvas, 2048);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = 4;
		// Overlay the real WordPress logo on the medallion (async SVG, then refresh).
		// Matches drawUltimateMural's geometry: medallionX = h*0.62, radius = h*0.3.
		const medH = canvas.height;
		const logoImg = new Image();
		logoImg.onload = () => {
			const d = medH * 0.3 * 1.6;
			ctx.drawImage(logoImg, medH * 0.62 - d / 2, medH / 2 - d / 2, d, d);
			refreshCanvasTexture(texture);
		};
		logoImg.src = wpLogoSvgDataUrl('#7c5a22');
		return texture;
	}
	if (!isCurrentVariant) {
		drawVariantMural(ctx, canvas);
		const texture = createCanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = 4;
		return texture;
	}
	ctx.fillStyle = '#111827';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#ffd166';
	ctx.fillRect(0, 0, canvas.width, 28);
	ctx.fillRect(0, canvas.height - 28, canvas.width, 28);

	ctx.strokeStyle = 'rgba(255, 245, 223, 0.18)';
	ctx.lineWidth = 6;
	for (let index = 0; index < 9; index++) {
		ctx.beginPath();
		ctx.arc(512, 320, 76 + index * 48, 0, Math.PI * 2);
		ctx.stroke();
	}

	ctx.fillStyle = '#fff5df';
	ctx.font = '900 122px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText('WORDPRESS', 512, 245);
	ctx.font = '900 116px Arial Black, Impact, sans-serif';
	ctx.fillText('MUSEUM', 512, 370);

	ctx.fillStyle = '#50d890';
	ctx.font = '800 34px system-ui, sans-serif';
	ctx.fillText('2003 -> BLOCKS -> PLAYGROUND', 512, 455);

	ctx.fillStyle = 'rgba(255, 245, 223, 0.72)';
	ctx.font = '700 24px system-ui, sans-serif';
	ctx.fillText(
		'Every publishing era, lovingly over-indexed',
		512,
		510
	);

	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function drawUltimateMural(ctx, canvas) {
	// An elegant engraved-marble museum tablet, the kind carved over a grand
	// entrance: a light cream-marble field with soft veining and an inset bevel,
	// a circular WordPress "W" medallion, and chiselled serif "WORDPRESS MUSEUM"
	// over a Roman-numeral founding date. The canvas aspect matches the wall
	// plane so the medallion reads as a true circle rather than an ellipse.
	const bronze = '#7c5a22';
	const w = canvas.width;
	const h = canvas.height;

	drawMuralMarbleField(ctx, w, h);
	drawMuralBorder(ctx, w, h, bronze);

	// Circular "W" medallion seated on the left, balancing the engraved title.
	const medallionR = h * 0.3;
	const medallionX = h * 0.62;
	drawMuralWMark(ctx, medallionX, h / 2, medallionR, bronze);

	// Title + subtitle centred in the field to the right of the medallion.
	const textCx = (medallionX + medallionR + w) / 2;
	ctx.textAlign = 'center';
	drawEngravedText(
		ctx,
		'WORDPRESS MUSEUM',
		textCx,
		h * 0.45,
		w - medallionX - medallionR - h * 0.5,
		h * 0.32,
		'700',
		'Georgia, "Times New Roman", serif',
		bronze
	);

	// Thin bronze rules flanking the founding-date subtitle, clear of the text.
	const subtitle = 'EST. MMIII · THE FIRST TWENTY YEARS';
	const subY = h * 0.74;
	ctx.font = `600 ${Math.round(h * 0.115)}px Georgia, "Times New Roman", serif`;
	const dateHalf = ctx.measureText(subtitle).width / 2;
	ctx.fillStyle = bronze;
	const ruleW = h * 0.26;
	const ruleGap = h * 0.1;
	ctx.fillRect(textCx - dateHalf - ruleGap - ruleW, subY - 2, ruleW, 3);
	ctx.fillRect(textCx + dateHalf + ruleGap, subY - 2, ruleW, 3);
	drawEngravedText(
		ctx,
		subtitle,
		textCx,
		subY,
		w,
		h * 0.115,
		'600',
		'Georgia, "Times New Roman", serif',
		bronze
	);
}

// A light cream/ivory marble field with soft warm/grey veining and a gentle
// polish sheen, matching the museum's light marble walls.
function drawMuralMarbleField(ctx, w, h) {
	ctx.fillStyle = '#efe8d6';
	ctx.fillRect(0, 0, w, h);

	const sheen = ctx.createLinearGradient(0, 0, w, h);
	sheen.addColorStop(0, 'rgba(255, 252, 242, 0.5)');
	sheen.addColorStop(0.5, 'rgba(255, 250, 236, 0.12)');
	sheen.addColorStop(1, 'rgba(120, 108, 84, 0.1)');
	ctx.fillStyle = sheen;
	ctx.fillRect(0, 0, w, h);

	// Soft meandering veins, mostly horizontal across the wide tablet.
	const veinCount = 9;
	for (let index = 0; index < veinCount; index++) {
		const seed = index * 2.3 + 0.7;
		let cx = -20;
		let cy = (pseudoRandom(seed) * 0.85 + 0.08) * h;
		ctx.beginPath();
		ctx.moveTo(cx, cy);
		for (let step = 0; step < 7; step++) {
			cx += w * 0.16;
			cy += (pseudoRandom(seed + step) - 0.5) * h * 0.22;
			ctx.lineTo(cx, cy);
		}
		ctx.strokeStyle = index % 3 === 0
			? 'rgba(176, 142, 70, 0.28)'
			: 'rgba(150, 142, 122, 0.18)';
		ctx.lineWidth = index % 3 === 0 ? 1.6 : 1.0;
		ctx.stroke();
	}
}

// A refined inset bevel framing the engraved field: a soft inner shadow line
// and a bright highlight so the lettering reads as cut into a recessed panel.
function drawMuralBorder(ctx, w, h, bronze) {
	const inset = Math.round(h * 0.075);
	ctx.strokeStyle = 'rgba(120, 104, 72, 0.32)';
	ctx.lineWidth = 3;
	ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
	ctx.strokeStyle = 'rgba(255, 252, 244, 0.55)';
	ctx.lineWidth = 2;
	ctx.strokeRect(inset + 4, inset + 4, w - inset * 2 - 8, h - inset * 2 - 8);

	// Slim bronze keyline just inside the bevel.
	ctx.strokeStyle = bronze;
	ctx.lineWidth = 2;
	ctx.strokeRect(inset + 9, inset + 9, w - inset * 2 - 18, h - inset * 2 - 18);
}

// The WordPress "W" engraved into a circular bronze-ringed marble medallion.
function drawMuralWMark(ctx, x, y, radius, bronze) {
	ctx.save();
	ctx.translate(x, y);

	// Recessed marble disc with a soft inner shadow for depth.
	const disc = ctx.createRadialGradient(0, -radius * 0.2, radius * 0.2, 0, 0, radius);
	disc.addColorStop(0, '#f3ecda');
	disc.addColorStop(1, '#d8cdb2');
	ctx.fillStyle = disc;
	ctx.beginPath();
	ctx.arc(0, 0, radius, 0, Math.PI * 2);
	ctx.fill();

	// Bronze rim. The mark itself (ring + W) is the real WordPress logo, drawn on
	// top of this disc from createWordPressMuralTexture.
	ctx.strokeStyle = bronze;
	ctx.lineWidth = Math.max(3, radius * 0.06);
	ctx.beginPath();
	ctx.arc(0, 0, radius - ctx.lineWidth, 0, Math.PI * 2);
	ctx.stroke();
	ctx.restore();
}

// Chiselled lettering: a pale emboss highlight offset down-right under the dark
// carved fill, so the text reads as engraved into the stone.
function drawEngravedText(ctx, text, x, y, maxWidth, maxFontSize, weight, family, fill) {
	const prevBaseline = ctx.textBaseline;
	ctx.textBaseline = 'middle';
	ctx.fillStyle = 'rgba(255, 252, 244, 0.55)';
	fillFittedCanvasText(ctx, text, x + 2, y + 2, maxWidth, maxFontSize, weight, family);
	ctx.fillStyle = fill;
	fillFittedCanvasText(ctx, text, x, y, maxWidth, maxFontSize, weight, family);
	ctx.textBaseline = prevBaseline;
}

function drawMascotOnMural(ctx, x, y, scale, color, secondary) {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(scale, scale);
	ctx.fillStyle = secondary;
	ctx.beginPath();
	ctx.ellipse(0, 24, 88, 120, -0.08, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(-58, -42, 34, 0, Math.PI * 2);
	ctx.arc(58, -42, 34, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#fff5df';
	ctx.beginPath();
	ctx.ellipse(0, 12, 50, 58, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#101827';
	ctx.beginPath();
	ctx.arc(-20, -6, 6, 0, Math.PI * 2);
	ctx.arc(20, -6, 6, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = '#101827';
	ctx.lineWidth = 5;
	ctx.beginPath();
	ctx.arc(0, 4, 24, 0.2, Math.PI - 0.2);
	ctx.stroke();
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 24px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText('WAPUU', 0, 172);
	ctx.restore();
}

function drawVariantMural(ctx, canvas) {
	const color = activeVariant.eraColors[0];
	const second = activeVariant.eraColors[2];
	ctx.fillStyle = activeVariant.scene.background;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvas.width, 30);
	ctx.fillRect(0, canvas.height - 30, canvas.width, 30);

	drawMuralMotif(ctx, canvas, color, second);

	ctx.fillStyle = '#fff5df';
	if (activeVariant.uiStyle === 'paper') {
		ctx.fillStyle = '#111827';
	}
	ctx.textAlign = 'center';
	ctx.font = '900 88px Arial Black, Impact, sans-serif';
	fillFittedCanvasText(
		ctx,
		activeVariant.muralTitle || 'WORDPRESS MUSEUM',
		canvas.width / 2,
		250,
		900,
		88,
		'900',
		'Arial Black, Impact, sans-serif'
	);
	ctx.font = '900 78px Arial Black, Impact, sans-serif';
	fillFittedCanvasText(
		ctx,
		activeVariant.name.split(':')[0].toUpperCase(),
		canvas.width / 2,
		352,
		900,
		78,
		'900',
		'Arial Black, Impact, sans-serif'
	);

	ctx.fillStyle = color;
	ctx.font = '800 31px system-ui, sans-serif';
	wrapCenteredText(ctx, activeVariant.muralSubtitle, canvas.width / 2, 438, 760, 38, 2);

	ctx.fillStyle = 'rgba(255, 245, 223, 0.72)';
	if (activeVariant.uiStyle === 'paper') {
		ctx.fillStyle = 'rgba(17, 24, 39, 0.72)';
	}
	ctx.font = '700 23px system-ui, sans-serif';
	ctx.fillText('Variant ' + String(activeVariant.number).padStart(3, '0'), canvas.width / 2, 540);
}

function drawMuralMotif(ctx, canvas, color, second) {
	ctx.strokeStyle = 'rgba(255, 245, 223, 0.18)';
	ctx.lineWidth = 6;
	for (let index = 0; index < 9; index++) {
		ctx.beginPath();
		ctx.arc(512, 320, 76 + index * 48, 0, Math.PI * 2);
		ctx.stroke();
	}
	const motif = activeVariant.muralStyle;
	ctx.globalAlpha = 0.78;
	ctx.fillStyle = second;
	if (motif === 'records') {
		for (let index = 0; index < 10; index++) {
			const x = 110 + (index % 5) * 200;
			const y = index < 5 ? 126 : 486;
			ctx.beginPath();
			ctx.arc(x, y, 54, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = activeVariant.scene.background;
			ctx.beginPath();
			ctx.arc(x, y, 18, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = second;
		}
	} else if (motif === 'pinball') {
		ctx.strokeStyle = second;
		ctx.lineWidth = 18;
		ctx.beginPath();
		ctx.moveTo(180, 520);
		ctx.quadraticCurveTo(512, 80, 844, 520);
		ctx.stroke();
		for (let index = 0; index < 7; index++) {
			ctx.beginPath();
			ctx.arc(220 + index * 96, 180 + (index % 2) * 260, 24, 0, Math.PI * 2);
			ctx.fill();
		}
	} else if (motif === 'bazaar') {
		for (let index = 0; index < 9; index++) {
			const x = 110 + (index % 3) * 290;
			const y = 110 + Math.floor(index / 3) * 155;
			ctx.fillRect(x, y, 160, 80);
			ctx.clearRect(x + 18, y + 18, 124, 44);
		}
	} else if (motif === 'botanical') {
		ctx.strokeStyle = second;
		ctx.lineWidth = 9;
		for (let index = 0; index < 12; index++) {
			const x = 80 + index * 78;
			ctx.beginPath();
			ctx.moveTo(x, 560);
			ctx.bezierCurveTo(x - 30, 420, x + 70, 300, x + 4, 110);
			ctx.stroke();
			ctx.beginPath();
			ctx.ellipse(x + 26, 300, 42, 16, 0.55, 0, Math.PI * 2);
			ctx.fill();
		}
	} else if (motif === 'terminal') {
		ctx.font = '800 28px ui-monospace, SFMono-Regular, Menlo, monospace';
		ctx.textAlign = 'left';
		for (let index = 0; index < 10; index++) {
			ctx.fillText(`wp museum scan --era=${index + 1}`, 120, 110 + index * 48);
		}
		ctx.textAlign = 'center';
	} else if (motif === 'fauxgo') {
		ctx.strokeStyle = second;
		ctx.lineWidth = 14;
		ctx.beginPath();
		ctx.arc(512, 320, 142, 0, Math.PI * 2);
		ctx.stroke();
		ctx.font = '900 158px Georgia, serif';
		ctx.textAlign = 'center';
		ctx.fillText('W', 512, 378);
		ctx.fillRect(202, 476, 620, 18);
	} else if (motif === 'blocks') {
		for (let index = 0; index < 14; index++) {
			ctx.fillRect(120 + (index % 7) * 112, 110 + Math.floor(index / 7) * 360, 62, 62);
		}
	} else if (motif === 'api' || motif === 'portal') {
		ctx.strokeStyle = second;
		ctx.lineWidth = 14;
		for (let index = 0; index < 5; index++) {
			ctx.strokeRect(120 + index * 160, 100 + index * 16, 110, 110);
		}
	} else if (motif === 'comments') {
		for (let index = 0; index < 8; index++) {
			ctx.beginPath();
			ctx.roundRect(90 + index * 110, 105 + (index % 2) * 370, 86, 46, 14);
			ctx.fill();
		}
	} else if (motif === 'train') {
		ctx.fillRect(72, 470, 880, 18);
		for (let index = 0; index < 6; index++) {
			ctx.fillRect(130 + index * 130, 430, 96, 54);
		}
	} else if (motif === 'capsule') {
		ctx.beginPath();
		ctx.roundRect(326, 88, 372, 118, 58);
		ctx.fill();
		ctx.beginPath();
		ctx.roundRect(326, 434, 372, 118, 58);
		ctx.fill();
	} else {
		for (let index = 0; index < 24; index++) {
			ctx.beginPath();
			ctx.arc(
				80 + pseudoRandom(index * 3) * 860,
				80 + pseudoRandom(index * 5) * 480,
				8 + pseudoRandom(index) * 28,
				0,
				Math.PI * 2
			);
			ctx.fill();
		}
	}
	ctx.fillStyle = 'rgba(255, 245, 223, 0.18)';
	ctx.font = '900 30px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText(activeVariant.accentWord || 'history with corners', 512, 606);
	ctx.globalAlpha = 1;
}

function wrapCenteredText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
	const words = text.split(' ');
	let line = '';
	let lines = 0;
	for (const word of words) {
		const testLine = line ? `${line} ${word}` : word;
		if (ctx.measureText(testLine).width > maxWidth && line) {
			ctx.fillText(line, x, y);
			y += lineHeight;
			line = word;
			lines += 1;
			if (lines >= maxLines) {
				return;
			}
		} else {
			line = testLine;
		}
	}
	if (line && lines < maxLines) {
		ctx.fillText(line, x, y);
	}
}

function createRoom(room) {
	const group = new THREE.Group();
	group.position.copy(room.center);
	group.rotation.y = getRotationForNormal(room.normal);

	const floor = new THREE.Mesh(
		createRoomFloorGeometry(),
		createMuseumMaterial('roomFloor', {
			// ShapeGeometry UVs are in metres, so repeat = 1/span tiles every span.
			repeatX: 1 / floorTileSpan,
			repeatY: 1 / floorTileSpan,
			roughness: 0.24,
			metalness: 0.32,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.y = 0.01;
	group.add(floor);
	group.add(createRoomCeiling(room.color));

	// The inner (hub-facing) edge is the octagon hub wall; the two side walls are
	// shared radial spokes built once by createRadialSpokes. Rooms build only the
	// wide flat back/outer wall and the two beveled back-corner chamfers here.
	group.add(createRoomWall('back'));
	group.add(createRoomBackChamfers(room));
	if (isCurrentVariant) {
		group.add(createRoomMuseumArchitecture(room));
		group.add(createRoomStoryWall(room));
		group.add(createRoomCarpetRunner());
	}
	if (shouldDecorateScene) {
		group.add(createRoomMural(room));
	}
	group.add(createFloorTrim('front', room.color));
	group.add(createFloorTrim('back', room.color));
	group.add(createDoorFrame(room));
	group.add(createRoomLight(room.color));
	group.add(createRoomDecor(room));
	return group;
}

// Hexagon floor/ceiling: narrow inner (hub) edge at local z=-roomDepth/2, side
// walls out to the beveled corners at z=spokeEndZ, then a 45deg chamfer to the
// narrower flat back at +roomDepth/2. Shape coords map (sx,sy)->local(sx,-sy),
// wound CCW so the front face is +z (becomes +y after the floor's -90deg tilt).
function createRoomFloorGeometry() {
	const d = roomDepth / 2;
	const shape = new THREE.Shape();
	shape.moveTo(-backFlatHalf, -d);
	shape.lineTo(backFlatHalf, -d);
	shape.lineTo(sideEndHalfWidth, -spokeEndZ);
	shape.lineTo(innerHalfWidth, d);
	shape.lineTo(-innerHalfWidth, d);
	shape.lineTo(-sideEndHalfWidth, -spokeEndZ);
	shape.closePath();
	return new THREE.ShapeGeometry(shape);
}

// The gallery's title plaque: a light engraved-marble tablet (the same style as
// the entrance banner) carrying the era name and its tagline, mounted high on
// the back wall clear of the picture rails.
function createRoomMural(room) {
	const group = new THREE.Group();
	const width = backWallWidth - 4.0; // clears the flanking pilasters (±6.32)
	const height = 1.25;
	const tablet = new THREE.Mesh(
		new THREE.PlaneGeometry(width, height),
		new THREE.MeshBasicMaterial({
			map: createRoomMuralTexture(room, width / height),
			side: THREE.DoubleSide,
		})
	);
	tablet.position.z = 0.02;
	group.add(tablet);
	group.add(createMuralFrame(width, height));
	group.position.set(0, 5.8, roomDepth / 2 - wallThickness / 2 - 0.08);
	group.rotation.y = Math.PI;
	return group;
}

function createRoomMuralTexture(room, aspect) {
	const canvas = document.createElement('canvas');
	canvas.width = 1280;
	canvas.height = Math.round(canvas.width / aspect);
	const ctx = canvas.getContext('2d');
	const w = canvas.width;
	const h = canvas.height;
	const copy = getEraMuralCopy(room.era);
	const bronze = '#7c5a22';

	drawMuralMarbleField(ctx, w, h);
	drawMuralBorder(ctx, w, h, bronze);

	ctx.textAlign = 'center';
	drawEngravedText(
		ctx,
		room.era.toUpperCase(),
		w / 2,
		h * 0.4,
		w * 0.86,
		h * 0.34,
		'700',
		'Georgia, "Times New Roman", serif',
		bronze
	);

	// Tagline beneath, flanked by thin bronze rules clear of the lettering.
	const subY = h * 0.75;
	ctx.font = `600 ${Math.round(h * 0.16)}px Georgia, "Times New Roman", serif`;
	const half = Math.min(ctx.measureText(copy.title).width, w * 0.66) / 2;
	ctx.fillStyle = bronze;
	const ruleW = h * 0.28;
	const ruleGap = h * 0.12;
	ctx.fillRect(w / 2 - half - ruleGap - ruleW, subY - 2, ruleW, 3);
	ctx.fillRect(w / 2 + half + ruleGap, subY - 2, ruleW, 3);
	drawEngravedText(
		ctx,
		copy.title,
		w / 2,
		subY,
		w * 0.66,
		h * 0.16,
		'600',
		'Georgia, "Times New Roman", serif',
		bronze
	);

	const texture = createCanvasTexture(canvas, 2048);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function getEraMuralCopy(era) {
	return {
		'Blogging Roots': {
			title: 'The Loop starts here',
			note: 'Permalinks, comments, categories, and one very proud setup wizard.',
		},
		'Dashboard Foundations': {
			title: 'The dashboard grows up',
			note: 'Themes, widgets, media, trash, thumbnails, and fewer dramatic deletes.',
		},
		'CMS Toolkit': {
			title: 'WordPress becomes a CMS toolkit',
			note: 'Custom post types, taxonomies, multisite, menus, and the Customizer.',
		},
		'Modern Admin': {
			title: 'The admin learns to breathe',
			note: 'Responsive MP6, autosave, updates, media grids, and calmer writing.',
		},
		'API and Customizer': {
			title: 'JSON finds the side door',
			note: 'REST endpoints, responsive images, media widgets, and Customizer drafts.',
		},
		'Block Editor': {
			title: 'Everything becomes movable',
			note: 'Gutenberg lands; blocks, groups, Site Health, and bigger images follow.',
		},
		'Blocks Everywhere': {
			title: 'The whole site turns into blocks',
			note: 'Block themes, site editing, style variations, and the Style Book cabinet.',
		},
	}[era];
}

// The interpretive text beneath the title tablet: the era's note and its
// WordPress release span/count, set directly into the marble back wall as
// engraved museum wall lettering — no panel, slab or frame.
function createRoomStoryWall(room) {
	const group = new THREE.Group();
	const width = backWallWidth - 3.0;
	const height = 1.6;
	const text = new THREE.Mesh(
		new THREE.PlaneGeometry(width, height),
		new THREE.MeshBasicMaterial({
			map: createRoomStoryTexture(room, width / height),
			transparent: true,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	text.position.set(0, 3.95, roomDepth / 2 - wallThickness / 2 - 0.03);
	text.rotation.y = Math.PI;
	group.add(text);
	return group;
}

function createRoomStoryTexture(room, aspect) {
	const canvas = document.createElement('canvas');
	canvas.width = 1280;
	canvas.height = Math.round(canvas.width / aspect);
	const ctx = canvas.getContext('2d');
	const w = canvas.width;
	const h = canvas.height;
	const copy = getEraMuralCopy(room.era);
	const items = getEraReleaseItems(room.era);
	const first = items[0]?.release;
	const last = items[items.length - 1]?.release;
	const serif = 'Georgia, "Times New Roman", serif';
	const ink = '#211a0b';

	ctx.textAlign = 'center';
	drawEngravedText(ctx, room.yearRange.replace('-', '–'), w / 2, h * 0.18, w * 0.7, h * 0.23,
		'700', serif, ink);

	drawEngravedWrap(ctx, copy.note, w / 2, h * 0.5, w * 0.86, h * 0.165, 2, '600', serif, ink);

	const span = first && last
		? (first.version === last.version
			? `WordPress ${first.version}`
			: `WordPress ${first.version}–${last.version}`)
		: '';
	const count = `${items.length} release${items.length === 1 ? '' : 's'}`;
	drawEngravedText(ctx, `${span}   ·   ${count}`, w / 2, h * 0.78, w * 0.78, h * 0.125,
		'600', serif, ink);

	const texture = createCanvasTexture(canvas, 2048);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

// Engraved wall lettering, wrapped to fit and centred on y: a pale highlight
// offset under the dark carved fill so the text reads as incised into the stone.
function drawEngravedWrap(ctx, text, x, y, maxWidth, fontSize, maxLines, weight, family, fill) {
	ctx.textBaseline = 'middle';
	ctx.font = `${weight} ${Math.round(fontSize)}px ${family}`;
	const lineHeight = fontSize * 1.4;
	// Count the lines this text wraps to so the block is centred on y.
	const words = text.split(' ');
	let line = '';
	let lines = 1;
	for (const word of words) {
		const test = line ? `${line} ${word}` : word;
		if (ctx.measureText(test).width > maxWidth && line) {
			if (lines >= maxLines) break;
			lines += 1;
			line = word;
		} else {
			line = test;
		}
	}
	const startY = y - ((lines - 1) * lineHeight) / 2;
	ctx.fillStyle = 'rgba(255, 252, 244, 0.5)';
	wrapText(ctx, text, x + 1.5, startY + 1.5, maxWidth, lineHeight, maxLines);
	ctx.fillStyle = fill;
	wrapText(ctx, text, x, startY, maxWidth, lineHeight, maxLines);
}

function createRoomCeiling(color) {
	const group = new THREE.Group();
	const ceiling = new THREE.Mesh(
		createRoomFloorGeometry(),
		new THREE.MeshBasicMaterial({
			map: createMuseumTexture('ceiling', 1 / 7, 1 / 7),
			side: THREE.DoubleSide,
		})
	);
	ceiling.rotation.x = -Math.PI / 2;
	ceiling.position.y = wallHeight - 0.04;
	group.add(ceiling);

	if (isCurrentVariant) {
		const brassMaterial = new THREE.MeshStandardMaterial({
			color: 0xf2cf86,
			roughness: 0.34,
			metalness: 0.44,
		});
		// Room half-width at a given z, following the hexagon: the angled side
		// spokes out to the beveled corner, then the chamfer in to the back wall.
		const ceilHalfAt = (z) =>
			z <= spokeEndZ ? sideHalfWidthAtZ(z) : sideEndHalfWidth - (z - spokeEndZ);
		// Transverse coffer ribs span the hexagon's full width at their z so the
		// grid fills the room instead of floating in a central island.
		for (const z of [-4.2, -1.4, 1.4, 4.2]) {
			const rib = new THREE.Mesh(
				new THREE.BoxGeometry(ceilHalfAt(z) * 2 - 1.5, 0.08, 0.08),
				brassMaterial
			);
			rib.position.set(0, wallHeight - 0.18, z);
			group.add(rib);
		}
		for (const x of [-5.4, 0, 5.4]) {
			const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, roomDepth - 1.1), brassMaterial);
			rib.position.set(x, wallHeight - 0.16, 0);
			group.add(rib);
		}
		for (const z of [-4.85, -2.35, 0.15, 2.65, 5.05]) {
			const halfSpan = ceilHalfAt(z) - 0.95;
			const start = new THREE.Vector3(-halfSpan, wallHeight - 1.04, z);
			const control = new THREE.Vector3(0, wallHeight - 0.12, z);
			const end = new THREE.Vector3(halfSpan, wallHeight - 1.04, z);
			group.add(createVaultRib(start, control, end, 0.024, brassMaterial, 30));
		}
		const oculusMaterial = new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.32,
			side: THREE.DoubleSide,
			depthWrite: false,
		});
		const oculus = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.28, 54), oculusMaterial);
		oculus.rotation.x = Math.PI / 2;
		oculus.position.set(0, wallHeight - 0.21, -0.18);
		registerAnimation(oculus, (object, elapsed) => {
			object.rotation.z = elapsed * 0.18;
			object.material.opacity = 0.24 + Math.sin(elapsed * 1.4) * 0.055;
		});
		group.add(oculus);

		const pendant = new THREE.Mesh(
			new THREE.OctahedronGeometry(0.18, 1),
			new THREE.MeshStandardMaterial({
				color,
				emissive: new THREE.Color(color),
				emissiveIntensity: 0.16,
				roughness: 0.3,
				metalness: 0.26,
			})
		);
		pendant.position.set(0, wallHeight - 1.08, -0.18);
		registerAnimation(pendant, (object, elapsed) => {
			object.rotation.y = elapsed * 0.5;
			object.position.y = wallHeight - 1.08 + Math.sin(elapsed * 1.1) * 0.045;
		});
		group.add(createCylinderBetween(
			new THREE.Vector3(0, wallHeight - 0.28, -0.18),
			new THREE.Vector3(0, wallHeight - 1.08, -0.18),
			0.012,
			new THREE.MeshBasicMaterial({ color: 0xfff5df, transparent: true, opacity: 0.5 }),
			8
		));
		group.add(pendant);
	}

	return group;
}

function createRoomWall(side) {
	// Rooms now build only their wide flat back/outer wall; the inner edge is the
	// hub wall and the side walls are shared radial spokes (createRadialSpokes).
	return createRoomWallSegment(side, side === 'back' ? backWallWidth : roomWidth, 0);
}

// The two 45deg chamfer walls that bevel the outer corners into a hexagon,
// joining each side wall's end to the narrower flat back wall.
function createRoomBackChamfers(room) {
	const group = new THREE.Group();
	const mat = createRoomWallMaterial(cornerBevel * 1.6);
	// Galleries with a side-room annex open through their right chamfer; that
	// chamfer is rebuilt with a doorway by the annex (the Playground for Blocks
	// Everywhere, createEraAnnex for the rest), so skip the solid wall here.
	const skipRight = roomChamferIsDoored(room && room.era);
	for (const s of [-1, 1]) {
		if (s === 1 && skipRight) {
			continue;
		}
		const ax = s * sideEndHalfWidth;
		const bx = s * backFlatHalf;
		const az = spokeEndZ;
		const bz = roomDepth / 2;
		const len = Math.hypot(bx - ax, bz - az);
		const wall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, len + 0.1), mat);
		wall.position.set((ax + bx) / 2, wallHeight / 2, (az + bz) / 2);
		wall.rotation.y = Math.atan2(bx - ax, bz - az);
		group.add(wall);
	}
	return group;
}

// Identifies the gallery reached through a room's left/right doorway and
// whether it sits earlier or later in the timeline.
function getDoorwaySignInfo(room, side) {
	const targetAngle = room.angle + (side === 'left' ? Math.PI / 4 : -Math.PI / 4);
	const neighbor = roomSides.find((candidate) => {
		const delta = Math.atan2(
			Math.sin(candidate.angle - targetAngle),
			Math.cos(candidate.angle - targetAngle)
		);
		return Math.abs(delta) < 0.02;
	});
	if (!neighbor) {
		return null;
	}
	return {
		era: neighbor.era,
		yearRange: getEraYearRange(neighbor.era),
		color: eraColors.get(neighbor.era),
		later: eras.indexOf(neighbor.era) > eras.indexOf(room.era),
	};
}

// Shared radial spokes between the wedges. Each octagon vertex carries one
// spoke, built once: it is the LEFT side wall of the hub side at that vertex
// (== the right wall of its counter-clockwise neighbour). Six spokes sit
// between two galleries and get a connecting doorway; the two flanking the
// mural wedge stay solid.
function createRadialSpokes() {
	const group = new THREE.Group();
	galleryDoorways.length = 0;
	for (const side of hubSides) {
		const neighbor = findHubSideAtAngle(side.angle + Math.PI / 4);
		if (!neighbor) {
			continue;
		}
		const doored = Boolean(side.era && neighbor.era);
		const nearInfo = side.era ? getDoorwaySignInfo(side, 'left') : null;
		const farInfo = neighbor.era ? getDoorwaySignInfo(neighbor, 'right') : null;
		// The two mural-flanking spokes (the galleries' shop-facing walls) carry a
		// short passage doorway to the gift shop in the current variant; pass the
		// destination gallery so the spoke can label the opening.
		const shopPassageEra =
			isCurrentVariant && (side.kind === 'mural' || neighbor.kind === 'mural')
				? (side.era || neighbor.era)
				: null;
		group.add(createSpokeWall(side, doored, nearInfo, farInfo, shopPassageEra));
	}
	return group;
}

function findHubSideAtAngle(angle) {
	return hubSides.find((side) => {
		const delta = Math.atan2(
			Math.sin(side.angle - angle),
			Math.cos(side.angle - angle)
		);
		return Math.abs(delta) < 0.02;
	});
}

// Builds one spoke as the LEFT wall of `side`, following the radial line
// x = -sideHalfWidthAtZ(z) from the inner (hub) edge to the wide outer corner,
// tilted 22.5deg. With a doorway it is split into front/back/header segments at
// connectorDoorZ, framed in brass, with a directional sign on each face.
function createSpokeWall(side, doored, nearInfo, farInfo, shopPassageEra = null) {
	const group = new THREE.Group();
	group.position.copy(side.center);
	group.rotation.y = getRotationForNormal(side.normal);

	const innerZ = -roomDepth / 2 - 0.15;
	const outerZ = spokeEndZ + 0.05; // stop at the beveled corner; chamfer takes over
	const xAt = (z) => -sideHalfWidthAtZ(z);
	const spokeLength = Math.hypot(xAt(outerZ) - xAt(innerZ), outerZ - innerZ);
	const mat = createRoomWallMaterial(spokeLength);

	// A wall segment spanning z0..z1 along the tilted line, of the given height.
	const segment = (z0, z1, height, yCenter, material, thick = wallThickness) => {
		const ax = xAt(z0);
		const bx = xAt(z1);
		const dx = bx - ax;
		const dz = z1 - z0;
		const len = Math.hypot(dx, dz);
		if (len < 0.01) {
			return;
		}
		const box = new THREE.Mesh(new THREE.BoxGeometry(thick, height, len), material);
		box.position.set((ax + bx) / 2, yCenter, (z0 + z1) / 2);
		box.rotation.y = Math.atan2(dx, dz);
		group.add(box);
	};

	if (!doored) {
		if (shopPassageEra) {
			buildShopPassageDoorway(group, segment, xAt, mat, shopPassageEra);
		} else {
			segment(innerZ, outerZ, wallHeight, wallHeight / 2, mat);
		}
		return group;
	}

	const doorStart = connectorDoorZ - connectorDoorHalfWidth;
	const doorEnd = connectorDoorZ + connectorDoorHalfWidth;
	segment(innerZ, doorStart, wallHeight, wallHeight / 2, mat);
	segment(doorEnd, outerZ, wallHeight, wallHeight / 2, mat);
	const headerH = wallHeight - connectorDoorHeight;
	segment(doorStart, doorEnd, headerH, connectorDoorHeight + headerH / 2, mat);

	const brass = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.1,
		roughness: 0.32,
		metalness: 0.5,
	});
	// Pale marble accent for the cornice and pediment infill.
	const marble = new THREE.MeshStandardMaterial({
		color: 0xe9e0cf,
		roughness: 0.6,
		metalness: 0.06,
	});
	// Tangent rotation of the spoke across the opening; every framing block that
	// straddles the door (lintel, cornice, pediment, keystone) shares it.
	const frameRot = Math.atan2(xAt(doorEnd) - xAt(doorStart), doorEnd - doorStart);

	segment(doorStart, doorEnd, 0.14, connectorDoorHeight, brass, 0.16); // lintel
	segment(doorStart, doorEnd, 0.05, 0.025, brass, wallThickness + 0.12); // threshold

	// Molded pilaster-style jambs: a footed plinth, a stepped shaft and a capital
	// at each side of the opening. Each tier centers on the opening edge and
	// keeps the original 0.14 footprint along z so the clear passage is untouched;
	// the plinth/capital widen only in x (depth) and y, never into the opening.
	const jambShaftTop = connectorDoorHeight - 0.22;
	for (const z of [doorStart, doorEnd]) {
		const jx = xAt(z);
		const shaft = new THREE.Mesh(
			new THREE.BoxGeometry(0.18, jambShaftTop, 0.14),
			brass
		);
		shaft.position.set(jx, jambShaftTop / 2, z);
		shaft.rotation.y = frameRot;
		group.add(shaft);
		// Recessed flute line on the shaft for a molded look.
		const flute = new THREE.Mesh(
			new THREE.BoxGeometry(0.04, jambShaftTop - 0.4, 0.06),
			marble
		);
		flute.position.set(jx, jambShaftTop / 2, z);
		flute.rotation.y = frameRot;
		group.add(flute);
		// Stepped plinth at the foot and capital at the head.
		for (const tier of [
			{ y: 0.09, h: 0.18, w: 0.3, t: 0.22 },
			{ y: jambShaftTop + 0.06, h: 0.12, w: 0.28, t: 0.2 },
			{ y: jambShaftTop + 0.17, h: 0.1, w: 0.34, t: 0.24 },
		]) {
			const block = new THREE.Mesh(
				new THREE.BoxGeometry(tier.t, tier.h, tier.w),
				brass
			);
			block.position.set(jx, tier.y, z);
			block.rotation.y = frameRot;
			group.add(block);
		}
	}

	// Keystone wedge at the top center of the lintel.
	const keyTop = new THREE.Mesh(
		new THREE.BoxGeometry(0.22, 0.32, 0.46),
		brass
	);
	keyTop.position.set(xAt(connectorDoorZ), connectorDoorHeight + 0.2, connectorDoorZ);
	keyTop.rotation.y = frameRot;
	group.add(keyTop);
	const keyBot = new THREE.Mesh(
		new THREE.BoxGeometry(0.2, 0.18, 0.3),
		brass
	);
	keyBot.position.set(xAt(connectorDoorZ), connectorDoorHeight - 0.05, connectorDoorZ);
	keyBot.rotation.y = frameRot;
	group.add(keyBot);

	// Subtle warm glow so the portal reads as an inviting passage. A low cost
	// emissive marble panel sits flush above the lintel (behind the keystone, so
	// no z-fight with the header), backed by a faint point light in the opening.
	const glowLight = new THREE.PointLight(0xffd8a0, 6, 6, 2);
	glowLight.position.set(xAt(connectorDoorZ), connectorDoorHeight - 0.5, connectorDoorZ);
	group.add(glowLight);

	// Inward normal of this (left) wall points toward the room interior (+x),
	// tilted 22.5deg; the far face points the opposite way into the neighbour.
	const inwardRot = getRotationForNormal(
		new THREE.Vector3(1, 0, wedgeTan).normalize()
	);
	// A compact wayfinder mounted just above the door opening.
	const signY = connectorDoorHeight + 0.74;
	const cx = xAt(connectorDoorZ);
	if (nearInfo) {
		group.add(createSpokeDoorSign(nearInfo, cx, connectorDoorZ, signY, inwardRot));
	}
	if (farInfo) {
		group.add(createSpokeDoorSign(farInfo, cx, connectorDoorZ, signY, inwardRot + Math.PI));
	}

	// Record the doorway's world midpoint for collision/verification.
	const world = new THREE.Vector3(cx, 0, connectorDoorZ)
		.applyEuler(new THREE.Euler(0, getRotationForNormal(side.normal), 0))
		.add(side.center);
	galleryDoorways.push({ x: world.x, z: world.z });
	return group;
}

// Cuts the short shop-passage doorway into an otherwise solid mural-flanking
// spoke (a gallery's shop-facing wall). Built in the spoke's local frame via the
// same `segment`/`xAt` helpers as the connector doorway, but with a plainer
// brass frame to suit the tight passage. A wayfinding sign faces the gallery.
function buildShopPassageDoorway(group, segment, xAt, mat, era) {
	const innerZ = -roomDepth / 2 - 0.15;
	const outerZ = spokeEndZ + 0.05;
	const doorStart = shopPassageDoorZ - shopPassageDoorHalfWidth;
	const doorEnd = shopPassageDoorZ + shopPassageDoorHalfWidth;
	segment(innerZ, doorStart, wallHeight, wallHeight / 2, mat);
	segment(doorEnd, outerZ, wallHeight, wallHeight / 2, mat);
	const headerH = wallHeight - shopPassageDoorHeight;
	segment(doorStart, doorEnd, headerH, shopPassageDoorHeight + headerH / 2, mat);

	const brass = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.1,
		roughness: 0.32,
		metalness: 0.5,
	});
	const frameRot = Math.atan2(xAt(doorEnd) - xAt(doorStart), doorEnd - doorStart);
	segment(doorStart, doorEnd, 0.14, shopPassageDoorHeight, brass, 0.16); // lintel
	segment(doorStart, doorEnd, 0.05, 0.025, brass, wallThickness + 0.12); // threshold
	for (const z of [doorStart, doorEnd]) {
		const jamb = new THREE.Mesh(
			new THREE.BoxGeometry(0.18, shopPassageDoorHeight, 0.14),
			brass
		);
		jamb.position.set(xAt(z), shopPassageDoorHeight / 2, z);
		jamb.rotation.y = frameRot;
		group.add(jamb);
	}

	// "TO THE MERCANTILE" wayfinding sign on the header, facing the gallery.
	const inwardRot = getRotationForNormal(new THREE.Vector3(1, 0, wedgeTan).normalize());
	const color = `#${new THREE.Color(eraColors.get(era) ?? 0xc24a2c).getHexString()}`;
	const sign = createReadableLabel(
		createSmallSignTexture('TO THE MERCANTILE · GIFT SHOP', color),
		1.9,
		0.4
	);
	const n = new THREE.Vector3(Math.sin(inwardRot), 0, Math.cos(inwardRot));
	const sx = xAt(shopPassageDoorZ) + n.x * 0.14;
	const sz = shopPassageDoorZ + n.z * 0.14;
	sign.position.set(sx, shopPassageDoorHeight + headerH * 0.42, sz);
	sign.rotation.y = inwardRot;
	group.add(sign);
}

// Directional plaque on a doorway face, naming the gallery beyond and whether
// it lies earlier/later in time. It mounts on the header above the opening and
// must stand PROUD of the solid header wall (half-thickness ~0.13), so every
// layer is offset along the inward face normal beyond that.
function createSpokeDoorSign(info, x, z, y, facingRotation) {
	const group = new THREE.Group();
	const nrm = new THREE.Vector3(Math.sin(facingRotation), 0, Math.cos(facingRotation));
	const at = (off) => [x + nrm.x * off, z + nrm.z * off];
	const brass = new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 });
	// Slim brass frame proud of the wall, carrying a single sign board.
	const frame = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.84, 0.05), brass);
	const [fx, fz] = at(0.17);
	frame.position.set(fx, y, fz);
	frame.rotation.y = facingRotation;
	group.add(frame);
	const board = new THREE.Mesh(
		new THREE.PlaneGeometry(1.52, 0.72),
		new THREE.MeshBasicMaterial({ map: createDoorwaySignTexture(info), transparent: true })
	);
	const [px, pz] = at(0.205);
	board.position.set(px, y, pz);
	board.rotation.y = facingRotation;
	group.add(board);
	return group;
}

// Wayfinding plaque texture: a header bar reading "THIS WAY TO", a bold
// destination gallery name in the era's colour, its year range, and a large
// directional chevron pointing the way (left = earlier, right = later).
function createDoorwaySignTexture(info) {
	const canvas = document.createElement('canvas');
	canvas.width = 560;
	canvas.height = 264;
	const ctx = canvas.getContext('2d');
	const W = canvas.width;
	const H = canvas.height;

	// Dark board with a thin double border in the era colour.
	ctx.fillStyle = '#10161f';
	roundRectPath(ctx, 0, 0, W, H, 24);
	ctx.fill();
	ctx.lineWidth = 6;
	ctx.strokeStyle = info.color;
	roundRectPath(ctx, 10, 10, W - 20, H - 20, 16);
	ctx.stroke();
	ctx.lineWidth = 2;
	ctx.strokeStyle = 'rgba(245,232,199,0.35)';
	roundRectPath(ctx, 18, 18, W - 36, H - 36, 11);
	ctx.stroke();

	// Destination room name, its years, and a down arrow pointing at the door.
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#f5e8c7';
	fillFittedCanvasText(ctx, info.era.toUpperCase(), W / 2, 70, W - 70, 56, '900', 'Arial Black, Impact, sans-serif');
	ctx.fillStyle = info.color;
	ctx.font = '800 34px system-ui, sans-serif';
	ctx.fillText(info.yearRange, W / 2, 130);
	// Down chevron.
	const acx = W / 2, acy = 192, aw = 52, ah = 28, th = ah * 0.62;
	ctx.fillStyle = info.color;
	ctx.beginPath();
	ctx.moveTo(acx, acy + ah);
	ctx.lineTo(acx - aw, acy - ah);
	ctx.lineTo(acx - aw + th, acy - ah);
	ctx.lineTo(acx, acy + ah - th * 1.7);
	ctx.lineTo(acx + aw - th, acy - ah);
	ctx.lineTo(acx + aw, acy - ah);
	ctx.closePath();
	ctx.fill();

	const texture = createCanvasTexture(canvas, 1024);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

// Draws a bold filled chevron arrow. `pointRight` flips it; otherwise points left.
function drawChevron(ctx, cx, cy, halfW, halfH, pointRight, color) {
	const dir = pointRight ? 1 : -1;
	const tail = -dir * halfW;
	const tip = dir * halfW;
	const thick = halfW * 0.62;
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(cx + tip, cy);
	ctx.lineTo(cx + tail, cy - halfH);
	ctx.lineTo(cx + tail + dir * thick, cy - halfH);
	ctx.lineTo(cx + tip - dir * (halfW - thick), cy);
	ctx.lineTo(cx + tail + dir * thick, cy + halfH);
	ctx.lineTo(cx + tail, cy + halfH);
	ctx.closePath();
	ctx.fill();
}

function createRoomWallSegment(side, length, tangentOffset) {
	const isWidthWall = side === 'front' || side === 'back';
	const wall = new THREE.Mesh(
		new THREE.BoxGeometry(
			isWidthWall ? length : wallThickness,
			wallHeight,
			isWidthWall ? wallThickness : length
		),
		createRoomWallMaterial(length)
	);
	wall.position.copy(getLocalWallPosition(side, tangentOffset));
	wall.position.y = wallHeight / 2;
	return wall;
}

function createRoomWallMaterial(length) {
	return createMuseumMaterial('roomWall', {
		repeatX: length / 4.8,
		repeatY: wallHeight / 2.2,
		color: wallWarmTint,
		roughness: 0.9,
		metalness: 0.03,
	});
}

function createFloorTrim(side, color) {
	const isWidthTrim = side === 'front' || side === 'back';
	const trim = new THREE.Mesh(
		new THREE.BoxGeometry(
			isWidthTrim ? (side === 'back' ? backWallWidth : roomWidth) : 0.08,
			0.04,
			isWidthTrim ? 0.08 : roomDepth
		),
		new THREE.MeshBasicMaterial({ color })
	);
	trim.position.copy(getLocalWallPosition(side, 0));
	trim.position.y = 0.05;
	return trim;
}

function createDoorFrame(room) {
	const group = new THREE.Group();
	const z = -roomDepth / 2;
	const gap = roomDoorHalfWidth;
	const jambMaterial = new THREE.MeshStandardMaterial({
		color: 0xf2eadc,
		roughness: 0.7,
		metalness: 0.04,
	});
	const accentMaterial = new THREE.MeshStandardMaterial({
		color: room.color,
		emissive: new THREE.Color(room.color),
		emissiveIntensity: 0.16,
		roughness: 0.4,
		metalness: 0.1,
	});
	const brassMaterial = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.1,
		roughness: 0.32,
		metalness: 0.5,
	});

	// Marble jambs with a thin coloured reveal facing the atrium.
	for (const sx of [-1, 1]) {
		const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.34, wallHeight, 0.42), jambMaterial);
		jamb.position.set(sx * gap, wallHeight / 2, z);
		group.add(jamb);
		const reveal = new THREE.Mesh(new THREE.BoxGeometry(0.1, wallHeight - 0.3, 0.46), accentMaterial);
		reveal.position.set(sx * (gap - 0.13), wallHeight / 2, z - 0.02);
		group.add(reveal);
	}

	const lintel = new THREE.Mesh(new THREE.BoxGeometry(gap * 2 + 0.34, 0.42, 0.42), jambMaterial);
	lintel.position.set(0, 4.45, z);
	group.add(lintel);
	const lintelBand = new THREE.Mesh(new THREE.BoxGeometry(gap * 2 + 0.1, 0.08, 0.48), brassMaterial);
	lintelBand.position.set(0, 4.2, z - 0.02);
	group.add(lintelBand);
	const accentBand = new THREE.Mesh(new THREE.BoxGeometry(gap * 2, 0.06, 0.5), accentMaterial);
	accentBand.position.set(0, 4.66, z - 0.02);
	group.add(accentBand);

	// Solid tympanum filling the portal above the doorway opening, so the room
	// sign has a wall to sit on instead of floating over the open upper portal.
	const tympanumBottom = 4.66;
	const tympanum = new THREE.Mesh(
		new THREE.BoxGeometry(gap * 2, wallHeight - tympanumBottom, wallThickness),
		jambMaterial
	);
	tympanum.position.set(0, (tympanumBottom + wallHeight) / 2, z);
	group.add(tympanum);

	const roomNumber = eras.indexOf(room.era) + 1;
	const signMaterial = new THREE.MeshBasicMaterial({
		map: createEraTexture(room.era, room.color, room.yearRange, roomNumber),
		transparent: true,
	});
	group.add(createDoorSign(signMaterial, z - wallThickness / 2 - 0.02, Math.PI));
	group.add(createDoorSign(signMaterial, z + wallThickness / 2 + 0.02, 0));
	return group;
}

function createDoorSign(material, z, rotationY) {
	const group = new THREE.Group();
	const w = 4.4;
	const h = 1.9;
	const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
	sign.position.z = 0.01;
	group.add(sign);

	// Brass molding frame around the sign.
	const brass = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.12,
		roughness: 0.34,
		metalness: 0.52,
	});
	const railW = 0.17;
	const depth = 0.1;
	const bars = [
		[w + railW * 2, railW, 0, h / 2 + railW / 2],
		[w + railW * 2, railW, 0, -(h / 2 + railW / 2)],
		[railW, h, -(w / 2 + railW / 2), 0],
		[railW, h, w / 2 + railW / 2, 0],
	];
	for (const [bw, bh, bx, by] of bars) {
		const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, depth), brass);
		bar.position.set(bx, by, 0);
		group.add(bar);
	}

	// Centered on the solid tympanum above the doorway (which spans ~4.66–7.35).
	group.position.set(0, 5.9, z);
	group.rotation.y = rotationY;
	return group;
}

function createRoomLight(color) {
	const group = new THREE.Group();
	// Warm-white fill keeps the marble reading as warm stone; the era
	// colour stays an accent rather than flooding the whole room.
	const fill = new THREE.PointLight(0xfff1d6, 1.18, 26);
	fill.position.set(0, wallHeight - 1.05, 0);
	registerAnimation(fill, (object, elapsed) => {
		object.intensity = 1.08 + Math.sin(elapsed * 1.2) * 0.08;
	});
	group.add(fill);

	const fixture = new THREE.Mesh(
		new THREE.BoxGeometry(4.4, 0.09, 0.36),
		new THREE.MeshStandardMaterial({
			color,
			emissive: new THREE.Color(color),
			emissiveIntensity: 0.45,
			roughness: 0.24,
			metalness: 0.22,
		})
	);
	fixture.position.set(0, wallHeight - 0.42, 0);
	group.add(fixture);
	for (const x of [-3.2, 3.2]) {
		group.add(createLightCone(color, 1.95, 4.6, 0.06, x, -0.55));
	}
	return group;
}

// Per-gallery red carpet runner: a deep-red plane on a thin gold/tan border,
// laid down the room centreline from just inside the hub doorway to near the
// back wall.
function createRoomCarpetRunner() {
	// Width matches the atrium star arm (2.2) and the front edge tucks just under
	// the doorway threshold, overlapping the arm (which ends at radius 16.6), so
	// the runner reads continuously from the rotunda into the room — no gap or
	// width step at the entry.
	const front = -roomDepth / 2 - 0.4;
	const back = roomDepth / 2 - 1.6;
	const runner = createCarpetRunner(2.2, back - front);
	// Sit level with the rotunda's radial arm (group y 0.03, top ≈0.034) — a hair
	// above so the runner stays on top at the overlap — so the carpet reads as one
	// continuous strip from the hub through the doorway, not a 6cm step.
	runner.position.set(0, 0.034, (front + back) / 2);
	return runner;
}

// Builds a red carpet runner laid flat in the XZ plane, centred at the local
// origin and running along local +z: a slightly larger gold/tan border plane
// just beneath a deep-red top plane. Both use MeshStandardMaterial (matte, low
// metalness). Two meshes per runner. Callers position/rotate the returned group.
function createCarpetRunner(width, length) {
	const group = new THREE.Group();
	// Gold trim only along the long sides (flush at the ends) so runners that
	// abut/overlap end-to-end read as one continuous red strip — no seam line.
	const border = new THREE.Mesh(
		new THREE.PlaneGeometry(width + 0.28, length),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.62, metalness: 0.12 })
	);
	border.rotation.x = -Math.PI / 2;
	group.add(border);

	const carpet = new THREE.Mesh(
		new THREE.PlaneGeometry(width, length),
		new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.85, metalness: 0.04 })
	);
	carpet.rotation.x = -Math.PI / 2;
	carpet.position.y = 0.004;
	group.add(carpet);
	return group;
}

function createLightCone(color, radius, height, opacity, x, z) {
	const cone = new THREE.Mesh(
		new THREE.ConeGeometry(radius, height, 32, 1, true),
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	cone.position.set(x, wallHeight - height / 2 - 0.55, z);
	cone.rotation.x = 0.1;
	registerAnimation(cone, (object, elapsed) => {
		object.material.opacity = opacity + Math.sin(elapsed * 1.6 + x) * 0.018;
	});
	return cone;
}

function createRoomMuseumArchitecture(room) {
	const group = new THREE.Group();
	group.add(createRoomAccentWashes(room));
	group.add(createRoomRopeBarriers(room.color, room));
	group.add(createRoomTrackLighting(room.color));
	return group;
}

// Positions an object flush on a room's angled (22.5deg) side wall in room-local
// coords: x follows the wall at z, rotated to face the room interior.
function placeOnSideWall(object, side, z, y, inset = 0) {
	const halfW = sideHalfWidthAtZ(z);
	const cos = Math.cos(wedgeHalfAngle);
	const sin = Math.sin(wedgeHalfAngle);
	const nx = side === 'left' ? cos : -cos; // inward normal (toward interior)
	object.position.set((side === 'left' ? -halfW : halfW) + nx * inset, y, z + sin * inset);
	object.rotation.y = Math.atan2(nx, sin);
	return object;
}

// Computes a floor placement that hugs an angled side wall. The object centre
// sits `inset` in along the wall's inward normal (≈ half the footprint depth + a
// small gap) and is rotated so its visual front looks squarely off the wall
// toward the room interior. `front` is the object's local front axis ('+z' or
// '-z'); the returned rotation aligns that axis with the inward normal. Returns
// { x, z, rotation } for addLocal so the central path/runner stays clear.
function sideWallFloorSpot(side, z, inset, front = '-z') {
	const halfW = sideHalfWidthAtZ(z);
	const cos = Math.cos(wedgeHalfAngle);
	const sin = Math.sin(wedgeHalfAngle);
	const nx = side === 'left' ? cos : -cos; // inward normal (toward interior)
	const sign = front === '+z' ? 1 : -1;
	return {
		x: (side === 'left' ? -halfW : halfW) + nx * inset,
		z: z + sin * inset,
		rotation: Math.atan2(sign * nx, sign * sin),
	};
}

function createRoomAccentWashes(room) {
	const group = new THREE.Group();
	const washSpecs = [
		{
			width: backWallWidth - 2.4,
			height: 2.65,
			position: [0, 2.48, roomDepth / 2 - wallThickness / 2 - 0.035],
			rotationY: Math.PI,
			opacity: 0.1,
		},
	];

	washSpecs.forEach((spec, index) => {
		const material = new THREE.MeshBasicMaterial({
			color: room.color,
			transparent: true,
			opacity: spec.opacity,
			side: THREE.DoubleSide,
			depthWrite: false,
		});
		const wash = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.height), material);
		wash.position.set(...spec.position);
		wash.rotation.y = spec.rotationY;
		registerAnimation(wash, (object, elapsed) => {
			object.material.opacity = spec.opacity + Math.sin(elapsed * 0.7 + index) * 0.018;
		});
		group.add(wash);
	});

	return group;
}

function createRoomRopeBarriers(color, room) {
	const group = new THREE.Group();
	// Galleries with a side-room annex open through their right chamfer, so that
	// chamfer must not be roped off (matches createRoomBackChamfers).
	const skipRightChamfer = roomChamferIsDoored(room && room.era);
	// One continuous rope traces the picture walls (back wall + both 45° chamfers +
	// both angled side walls), broken only at the connector-door openings — so each
	// corner is a single shared post and the rope spans it (no gaps, no doubled
	// posts where segments used to meet).
	const ropeOptions = { postHeight: 0.78, ropeY: 0.8, capRadius: 0.07 };
	const backRopeZ = roomDepth / 2 - 1.2;
	const backHalf = backFlatHalf - 1.0;
	const chamferOffset = 0.9;
	const sideOffset = 0.95;
	const cn = Math.SQRT1_2;
	const cos = Math.cos(wedgeHalfAngle);
	const sin = Math.sin(wedgeHalfAngle);
	const doorClear = connectorDoorHalfWidth + 0.7;
	const doorMinZ = connectorDoorZ - doorClear;
	const doorMaxZ = connectorDoorZ + doorClear;
	const chamferPoint = (sign, u) => ({
		x: sign * sideEndHalfWidth + (sign * backFlatHalf - sign * sideEndHalfWidth) * u - sign * cn * chamferOffset,
		z: spokeEndZ + (roomDepth / 2 - spokeEndZ) * u - cn * chamferOffset,
	});
	const sidePoint = (sign, z) => ({
		x: sign * sideHalfWidthAtZ(z) - sign * cos * sideOffset,
		z: z + sin * sideOffset,
	});

	// Front side rails: hub-facing inner edge to the door clearance (one per side).
	for (const sign of [-1, 1]) {
		group.add(createMuseumRopeLine(
			[sidePoint(sign, -roomDepth / 2 + 0.9), sidePoint(sign, doorMinZ - 0.4)],
			color,
			ropeOptions
		));
	}

	// Back run: left side (past the door) → left chamfer → back wall → right
	// chamfer → right side, as ONE polyline. For an annex room the right chamfer is
	// the side-room doorway, so the run stops at the back wall and the right side
	// rail is added on its own.
	const leftRun = [
		sidePoint(-1, doorMaxZ + 0.4),
		sidePoint(-1, 1),
		sidePoint(-1, spokeEndZ - 0.3),
		chamferPoint(-1, 0.55),
		{ x: -backHalf, z: backRopeZ },
		{ x: -backHalf / 2, z: backRopeZ },
		{ x: 0, z: backRopeZ },
		{ x: backHalf / 2, z: backRopeZ },
		{ x: backHalf, z: backRopeZ },
	];
	if (skipRightChamfer) {
		group.add(createMuseumRopeLine(leftRun, color, ropeOptions));
		group.add(createMuseumRopeLine(
			[sidePoint(1, doorMaxZ + 0.4), sidePoint(1, 1), sidePoint(1, spokeEndZ - 0.3)],
			color,
			ropeOptions
		));
	} else {
		group.add(createMuseumRopeLine([
			...leftRun,
			chamferPoint(1, 0.55),
			sidePoint(1, spokeEndZ - 0.3),
			sidePoint(1, 1),
			sidePoint(1, doorMaxZ + 0.4),
		], color, ropeOptions));
	}
	return group;
}

function createMuseumRopeLine(points, color, options = {}) {
	const group = new THREE.Group();
	const postHeight = options.postHeight ?? 0.82;
	const postRadius = options.postRadius ?? 0.045;
	const capRadius = options.capRadius ?? 0.075;
	const ropeY = options.ropeY ?? 0.84;
	const ropeRadius = options.ropeRadius ?? 0.026;
	const ropeSag = options.sag ?? 0.08;
	const postMaterial = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		roughness: 0.32,
		metalness: 0.52,
	});
	const capMaterial = new THREE.MeshStandardMaterial({
		color: 0xfff5df,
		roughness: 0.42,
		metalness: 0.22,
	});
	const ropeMaterial = new THREE.MeshStandardMaterial({
		color,
		emissive: new THREE.Color(color),
		emissiveIntensity: 0.04,
		roughness: 0.34,
		metalness: 0.18,
	});
	const ropeSegments = [];

	points.forEach((point, index) => {
		const post = new THREE.Mesh(
			new THREE.CylinderGeometry(postRadius, postRadius * 1.24, postHeight, 14),
			postMaterial
		);
		post.position.set(point.x, postHeight / 2, point.z);
		group.add(post);

		const cap = new THREE.Mesh(new THREE.SphereGeometry(capRadius, 14, 10), capMaterial);
		cap.position.set(point.x, postHeight + capRadius * 0.35, point.z);
		group.add(cap);

		if (index > 0) {
			const rope = createRopeSegment(points[index - 1], point, ropeY, ropeRadius, ropeMaterial, ropeSag);
			ropeSegments.push(rope);
			group.add(rope);
		}
	});

	registerAnimation(group, (object, elapsed) => {
		for (const [index, rope] of ropeSegments.entries()) {
			rope.position.y = ropeY + Math.sin(elapsed * 1.05 + index) * 0.018;
			rope.material.emissiveIntensity = 0.035 + Math.sin(elapsed * 1.3 + index) * 0.012;
		}
	});
	return group;
}

function createRopeSegment(start, end, y, radius, material, sag = 0) {
	const a = new THREE.Vector3(start.x, y, start.z);
	const b = new THREE.Vector3(end.x, y, end.z);
	if (sag <= 0) {
		return createCylinderBetween(a, b, radius, material, 12);
	}
	// A drooping rope: a tube along a curve that dips in the middle. Built in a
	// frame centred on the span midpoint so the bob animation (position.y) still works.
	const mid = a.clone().add(b).multiplyScalar(0.5);
	const curve = new THREE.CatmullRomCurve3([
		a.clone().sub(mid),
		new THREE.Vector3(0, -sag, 0),
		b.clone().sub(mid),
	]);
	const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, radius, 8, false), material);
	mesh.position.copy(mid);
	return mesh;
}

function createCylinderBetween(start, end, radius, material, radialSegments = 12) {
	const direction = end.clone().sub(start);
	const length = direction.length();
	const cylinder = new THREE.Mesh(
		new THREE.CylinderGeometry(radius, radius, Math.max(length, 0.001), radialSegments),
		material
	);
	cylinder.position.copy(start).add(end).multiplyScalar(0.5);
	if (length > 0.001) {
		cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
	}
	return cylinder;
}

function createRoomTrackLighting(color) {
	const group = new THREE.Group();
	const trackMaterial = new THREE.MeshStandardMaterial({
		color: 0x1f2937,
		roughness: 0.38,
		metalness: 0.38,
	});
	const fixtureMaterial = new THREE.MeshStandardMaterial({
		color: 0xf8efd9,
		emissive: new THREE.Color(color),
		emissiveIntensity: 0.18,
		roughness: 0.34,
		metalness: 0.28,
	});
	[-2.25, 1.85].forEach((z, trackIndex) => {
		const track = new THREE.Mesh(
			new THREE.BoxGeometry(roomWidth * 0.66, 0.055, 0.08),
			trackMaterial
		);
		track.position.set(0, wallHeight - 0.72, z);
		group.add(track);
		[-3.6, 0, 3.6].forEach((x, fixtureIndex) => {
			const fixture = new THREE.Mesh(
				new THREE.CylinderGeometry(0.105, 0.14, 0.2, 16),
				fixtureMaterial
			);
			fixture.position.set(x, wallHeight - 0.88, z);
			group.add(fixture);

			const beam = new THREE.Mesh(
				new THREE.ConeGeometry(0.72, 2.75, 28, 1, true),
				new THREE.MeshBasicMaterial({
					color,
					transparent: true,
					opacity: 0.035,
					side: THREE.DoubleSide,
					depthWrite: false,
				})
			);
			beam.position.set(x, wallHeight - 2.18, z + (trackIndex ? 0.45 : -0.25));
			beam.rotation.x = trackIndex ? -0.08 : 0.08;
			registerAnimation(beam, (object, elapsed) => {
				object.material.opacity = 0.028 + Math.sin(elapsed * 1.4 + fixtureIndex) * 0.01;
			});
			group.add(beam);
		});
	});
	return group;
}

function createAtriumDecor() {
	const group = new THREE.Group();
	if (!shouldDecorateScene) {
		return group;
	}

	const color = activeVariant.eraColors[0];
	const secondary = activeVariant.eraColors[3];
	if (isCurrentVariant) {
		group.add(createAtriumMuseumArchitecture(color, secondary));
		group.add(createAtriumLightRig(color, secondary));
	}
	group.add(createAtriumFloorMedallion(color, secondary));
	if (isCurrentVariant) {
		group.add(createAtriumCarpetRunners());
		group.add(createLogoEvolutionDisplay());
		group.add(createMissionTablet());
		group.add(createAtriumWayfindingSigns());
		group.add(createPhpElephantExhibit());
	}
	addAtriumFeature(group, activeVariant.atriumFeature, color, secondary);
	addAtriumBenches(group);
	return group;
}

// "The WordPress logo through the years": a brass-framed portrait panel hung on
// the clean grey-marble wall segment to the right of the Modern Admin doorway —
// the wall a visitor faces on entering from the welcome portal. A true top-down
// timeline: the 2003 Dante wordmark, Jason Santa Maria's 2005 lockup (unchanged
// since), and the standalone W mark.
function createLogoEvolutionDisplay() {
	const group = new THREE.Group();
	const side = hubSides.find((s) => s.era === eras[3]); // Modern Admin (north)
	const segmentLength = (roomWidth - roomDoorHalfWidth * 2) / 2;
	// The right-hand segment relative to the inward-facing visitor, nudged
	// toward the doorway so the corner flora doesn't block the view.
	const segmentOffset = roomDoorHalfWidth + segmentLength / 2 - 0.5;
	const center = side.midpoint
		.clone()
		.add(side.tangent.clone().multiplyScalar(-segmentOffset))
		.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.04));

	const panel = createLogoEvolutionPanel();
	panel.position.set(center.x, 2.55, center.z);
	panel.rotation.y = getRotationForNormal(side.normal.clone().multiplyScalar(-1));
	group.add(panel);
	return group;
}

// An engraved "Code is Poetry" tablet — the project tagline rendered with the
// accurate mission ("democratize publishing"). Mounted on the hub-wall segment
// to the right of the Blogging Roots doorway (the chronological start of the
// galleries), facing the rotunda interior at eye-to-upper height.
function createMissionTablet() {
	const group = new THREE.Group();
	const side = hubSides.find((s) => s.era === eras[0]); // Blogging Roots
	const segmentLength = (roomWidth - roomDoorHalfWidth * 2) / 2;
	const segmentOffset = roomDoorHalfWidth + segmentLength / 2;
	// The right-hand segment relative to the inward-facing visitor.
	const center = side.midpoint
		.clone()
		.add(side.tangent.clone().multiplyScalar(-segmentOffset))
		.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.06));

	const width = 1.66;
	const height = 0.82;
	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(width + 0.12, height + 0.12, 0.06),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	const art = new THREE.Mesh(
		new THREE.PlaneGeometry(width, height),
		new THREE.MeshBasicMaterial({ map: createMissionTabletTexture() })
	);
	art.position.z = 0.035;
	group.add(frame, art);
	group.position.set(center.x, 2.9, center.z);
	group.rotation.y = getRotationForNormal(side.normal.clone().multiplyScalar(-1));
	return group;
}

// Two directional plaques on the hub walls flanking the entrance bay:
// "START HERE" toward the first gallery (Blogging Roots) and "EXIT" toward the
// Mercantile (which sits beyond the +x portal). Each sits on the wall segment
// nearest the entrance, above the bay's showcase panel, facing the rotunda.
function createAtriumWayfindingSigns() {
	const group = new THREE.Group();
	const specs = [
		{ era: eras[0], label: 'START HERE  →' },
		{ era: eras[eras.length - 1], label: 'EXIT  →' },
	];
	// Centre the sign in the visible marble pier — midway between the gallery's
	// doorway column (≈roomDoorHalfWidth+0.34 off the face centre) and the corner
	// column shared with the mural (≈innerHalfWidth) — not on the wall opening.
	const segmentOffset = (roomDoorHalfWidth + 0.34 + innerHalfWidth) / 2;
	for (const spec of specs) {
		const side = hubSides.find((s) => s.era === spec.era);
		if (!side) continue;
		const candA = side.midpoint.clone().add(side.tangent.clone().multiplyScalar(segmentOffset));
		const candB = side.midpoint.clone().add(side.tangent.clone().multiplyScalar(-segmentOffset));
		const near = candA.z > candB.z ? candA : candB; // segment nearer the entrance (+z)
		const center = near.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.06));
		const sign = createWayfindingPlaque(spec.label);
		sign.position.set(center.x, 2.9, center.z);
		sign.rotation.y = getRotationForNormal(side.normal.clone().multiplyScalar(-1));
		group.add(sign);

		// A matching flower bed centred directly under each wayfinding sign (Start
		// Here and Exit), against the wall.
		const bed = createFlowerBed(activeVariant.eraColors[1], activeVariant.eraColors[3]);
		const spot = center.clone().add(side.normal.clone().multiplyScalar(-0.62));
		bed.position.set(spot.x, 0, spot.z);
		group.add(bed);
	}
	return group;
}

function createWayfindingPlaque(label) {
	const group = new THREE.Group();
	const width = 2.3;
	const height = 0.64;
	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(width + 0.12, height + 0.12, 0.06),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	const plaque = new THREE.Mesh(
		new THREE.PlaneGeometry(width, height),
		new THREE.MeshBasicMaterial({ map: createWayfindingTexture(label, width / height) })
	);
	plaque.position.z = 0.035;
	group.add(frame, plaque);
	return group;
}

// A simple directional information sign — a dark panel with a gold keyline and
// clean sans-serif lettering — deliberately plainer than the marble exhibit
// banners so it reads as wayfinding.
function createWayfindingTexture(label, aspect) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = Math.round(canvas.width / aspect);
	const ctx = canvas.getContext('2d');
	const w = canvas.width;
	const h = canvas.height;

	const grad = ctx.createLinearGradient(0, 0, 0, h);
	grad.addColorStop(0, '#2a1d0b');
	grad.addColorStop(1, '#17100a');
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, w, h);

	const m = Math.round(h * 0.13);
	ctx.strokeStyle = '#d8b25a';
	ctx.lineWidth = Math.max(3, h * 0.045);
	ctx.strokeRect(m, m, w - m * 2, h - m * 2);

	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#fff5df';
	fillFittedCanvasText(ctx, label, w / 2, h * 0.52, w * 0.78, h * 0.42,
		'700', 'Arial, "Helvetica Neue", sans-serif');

	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createLogoEvolutionPanel() {
	const group = new THREE.Group();
	const width = 1.58;
	const height = 2.32;
	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(width + 0.16, height + 0.16, 0.08),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	group.add(frame);
	const panel = new THREE.Mesh(
		new THREE.PlaneGeometry(width, height),
		new THREE.MeshBasicMaterial({ map: createLogoEvolutionTexture() })
	);
	panel.position.z = 0.05;
	group.add(panel);
	return group;
}

function createLogoEvolutionTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 1100;
	canvas.height = 1615;
	const ctx = canvas.getContext('2d');
	const cx = canvas.width / 2;
	ctx.fillStyle = '#fbf7ee';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#21759b';
	ctx.fillRect(0, 0, canvas.width, 12);
	ctx.fillRect(0, canvas.height - 12, canvas.width, 12);

	ctx.fillStyle = '#23282d';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fillFittedCanvasText(ctx, 'THE WORDPRESS LOGO', cx, 86, 960, 64, '900', 'Arial Black, Impact, sans-serif');
	ctx.fillStyle = '#6b7280';
	ctx.font = '700 30px system-ui, sans-serif';
	ctx.fillText('through the years', cx, 148);

	const caption = (lines, y) => {
		ctx.fillStyle = '#23282d';
		fillFittedCanvasText(ctx, lines[0], cx, y, 960, 36, '800', 'system-ui, sans-serif');
		ctx.fillStyle = '#6b7280';
		fillFittedCanvasText(ctx, lines[1], cx, y + 44, 960, 27, '600', 'system-ui, sans-serif');
	};
	const divider = (y) => {
		ctx.strokeStyle = 'rgba(35, 40, 45, 0.14)';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(90, y);
		ctx.lineTo(canvas.width - 90, y);
		ctx.stroke();
	};

	// 2003 — the original wordmark, drawn here: "WordPress" in a Dante-style
	// serif, "Word" in blue, "Press" near-black, over a thin rule (per the
	// WordPress history book; Dante itself isn't a web font, Georgia stands in).
	ctx.font = '400 104px Georgia, "Times New Roman", serif';
	const wWord = ctx.measureText('Word').width;
	const wPress = ctx.measureText('Press').width;
	const startX = cx - (wWord + wPress) / 2;
	ctx.textAlign = 'left';
	ctx.fillStyle = '#1d5775';
	ctx.fillText('Word', startX, 360);
	ctx.fillStyle = '#1c1e21';
	ctx.fillText('Press', startX + wWord, 360);
	ctx.fillRect(startX, 422, wWord + wPress, 3);
	ctx.textAlign = 'center';
	caption(['2003 · the original wordmark', 'set in Dante, by Matt Mullenweg'], 510);
	divider(610);

	// 2005 onward: the official brand assets, loaded async below; their
	// captions and dividers are static and drawn up front. The lockup row is
	// composed horizontally from the mark + the wide logotype so the Mrs
	// Eaves text stays readable at panel scale (the stacked 1000x1000 lockup
	// asset shrinks its own text into illegibility).
	const rows = [
		{
			// The "standard" logotype asset is the full lockup: W mark + the
			// Mrs Eaves wordmark.
			images: [
				{ src: './assets/logos/wp-logotype-standard.png', cx, cy: 830, maxW: 820, maxH: 240 },
			],
			lines: ["2005 · Jason Santa Maria's lockup", 'Mrs Eaves small caps · in use ever since'],
			captionY: 1010,
			dividerY: 1110,
		},
		{
			images: [{ src: './assets/logos/wp-mark-notext.png', cx, cy: 1310, maxW: 280, maxH: 280 }],
			lines: ['the W mark', 'the standalone symbol, recognisable on its own'],
			captionY: 1500,
		},
	];
	for (const row of rows) {
		caption(row.lines, row.captionY);
		if (row.dividerY) {
			divider(row.dividerY);
		}
	}

	const texture = createCanvasTexture(canvas, 1024);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	for (const row of rows) {
		for (const spec of row.images) {
			const img = new Image();
			img.onload = () => {
				const scale = Math.min(spec.maxW / img.width, spec.maxH / img.height);
				const w = img.width * scale;
				const h = img.height * scale;
				ctx.drawImage(img, spec.cx - w / 2, spec.cy - h / 2, w, h);
				refreshCanvasTexture(texture);
			};
			img.src = spec.src;
		}
	}

	return texture;
}

// A friendly low-poly PHP "elePHPant" greeting visitors in the rotunda — a nod to
// the language WordPress has run on since day one. On a low plinth with a label,
// in the open marble wedge between the Dashboard and CMS carpet arms.
function createPhpElephantExhibit() {
	const group = new THREE.Group();
	// East-side marble wedge — the visitor's left as they enter facing the mural,
	// mirroring the Wapuu docent that greets on the right, clear of the carpet star,
	// lounge nook and info desk.
	const spot = new THREE.Vector3(5.5, 0, 3.0);
	const facing = -2.05; // turn toward the rotunda centre to greet arrivals

	const plinth = new THREE.Mesh(
		new THREE.CylinderGeometry(1.5, 1.6, 0.22, 40),
		new THREE.MeshStandardMaterial({ color: 0x6f6a63, roughness: 0.8, metalness: 0.06 })
	);
	plinth.position.set(spot.x, 0.11, spot.z);
	group.add(plinth);

	const elephant = createPhpElephant();
	elephant.position.set(spot.x, 0.22, spot.z);
	elephant.rotation.y = facing;
	group.add(elephant);

	// A low, angled museum label block at the plinth's front edge — kept short so
	// the elephant (and its trunk) stays fully in view above it.
	const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
	// Out beyond the plinth edge and the trunk, so the label reads cleanly.
	// An upright label sign on a brass post, well in front of the plinth and below
	// the (now up-curled) trunk, so it reads cleanly head-on.
	const labelSpot = spot.clone().add(dir.clone().multiplyScalar(2.1));
	// Post tops out at the plate's bottom edge (1.04 − 1.55·0.26/2) so it
	// doesn't poke through between the plate's two faces.
	const post = new THREE.Mesh(
		new THREE.CylinderGeometry(0.055, 0.055, 0.84, 12),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	post.position.set(labelSpot.x, 0.42, labelSpot.z);
	group.add(post);
	const plate = createExhibitPlate('The elePHPant', '', 1.55);
	plate.position.set(labelSpot.x, 1.04, labelSpot.z);
	plate.rotation.y = facing;
	group.add(plate);

	return group;
}

// The elephant itself, modelled facing +z with its feet at y = 0.
function createPhpElephant() {
	const g = new THREE.Group();
	const blue = new THREE.MeshStandardMaterial({ color: 0x777bb3, roughness: 0.62, metalness: 0.04 });
	const blueDark = new THREE.MeshStandardMaterial({ color: 0x5b6299, roughness: 0.62 });
	const white = new THREE.MeshStandardMaterial({ color: 0xf3f1ea, roughness: 0.5 });
	const black = new THREE.MeshStandardMaterial({ color: 0x16181f, roughness: 0.4 });

	const body = new THREE.Mesh(new THREE.SphereGeometry(0.66, 24, 18), blue);
	body.scale.set(1.0, 0.92, 1.4);
	body.position.set(0, 1.2, -0.05);
	g.add(body);

	// Each leg is a tapered column topped by a rounded haunch that merges into the
	// body ellipsoid, with a rounded foot at the bottom — so the joins read smooth
	// rather than a cylinder jammed into a sphere.
	const legGeo = new THREE.CylinderGeometry(0.19, 0.235, 0.86, 18);
	const haunchGeo = new THREE.SphereGeometry(0.3, 18, 14);
	const footGeo = new THREE.SphereGeometry(0.235, 16, 12);
	for (const [lx, lz] of [[-0.36, 0.42], [0.36, 0.42], [-0.36, -0.6], [0.36, -0.6]]) {
		const leg = new THREE.Mesh(legGeo, blue);
		leg.position.set(lx, 0.45, lz);
		g.add(leg);
		const haunch = new THREE.Mesh(haunchGeo, blue);
		haunch.scale.set(1, 0.82, 1);
		haunch.position.set(lx, 0.84, lz);
		g.add(haunch);
		const foot = new THREE.Mesh(footGeo, blueDark);
		foot.scale.set(1, 0.6, 1.12);
		foot.position.set(lx, 0.07, lz + 0.04);
		g.add(foot);
		for (let i = -1; i <= 1; i++) {
			const nail = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), white);
			nail.position.set(lx + i * 0.08, 0.05, lz + 0.22);
			g.add(nail);
		}
	}

	const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 22, 16), blue);
	head.scale.set(0.95, 0.95, 0.85);
	head.position.set(0, 1.34, 0.95);
	g.add(head);

	for (const s of [-1, 1]) {
		const ear = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), blueDark);
		ear.scale.set(0.12, 0.98, 0.85);
		ear.position.set(s * 0.5, 1.42, 0.8);
		ear.rotation.z = s * 0.22;
		ear.rotation.y = s * 0.35;
		g.add(ear);
	}

	// Curling trunk.
	// A relaxed trunk that curls down then lifts back up at the tip, so it stays
	// near the body rather than drooping forward onto the label.
	const trunkCurve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(0, 1.2, 1.2),
		new THREE.Vector3(0, 0.92, 1.55),
		new THREE.Vector3(0, 0.62, 1.72),
		new THREE.Vector3(0, 0.5, 1.6),
		new THREE.Vector3(0, 0.56, 1.42),
	]);
	const trunk = new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 30, 0.16, 12, false), blue);
	g.add(trunk);
	const trunkTip = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), blue);
	trunkTip.position.set(0, 0.56, 1.42);
	g.add(trunkTip);

	for (const s of [-1, 1]) {
		const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 10), white);
		tusk.position.set(s * 0.2, 1.0, 1.34);
		tusk.rotation.x = Math.PI * 0.62;
		g.add(tusk);
		const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), black);
		eye.position.set(s * 0.3, 1.5, 1.3);
		g.add(eye);
		const hl = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), white);
		hl.position.set(s * 0.3 + 0.02, 1.53, 1.36);
		g.add(hl);
	}

	// Tail: rooted well inside the body rear, hanging almost straight down to a tuft.
	const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.7, 8), blue);
	tail.position.set(0, 0.92, -0.82);
	tail.rotation.x = -0.12;
	g.add(tail);
	const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), blueDark);
	tuft.position.set(0, 0.57, -0.78);
	g.add(tuft);

	return g;
}

// The embroidered/pixelated WordPress logo for the rotunda carpet centre: the
// official mark rendered tiny and scaled up nearest-neighbour so it reads like a
// woven/cross-stitched emblem. The background is left transparent so the lit
// carpet disc shows through (an opaque red fill rendered flat/darker than the
// surrounding lit carpet).
function createCarpetLogoTexture() {
	const size = 512;
	const cv = document.createElement('canvas');
	cv.width = size;
	cv.height = size;
	const ctx = cv.getContext('2d');
	const texture = createCanvasTexture(cv);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	// Spin the emblem 180° so the W reads upright to a visitor entering from the
	// south and looking across the rotunda, rather than upside-down.
	texture.center.set(0.5, 0.5);
	texture.rotation = Math.PI;
	const small = 48;
	const sc = document.createElement('canvas');
	sc.width = small;
	sc.height = small;
	const img = new Image();
	img.onload = () => {
		sc.getContext('2d').drawImage(img, 0, 0, small, small);
		ctx.imageSmoothingEnabled = false;
		const dest = size * 0.82;
		const off = (size - dest) / 2;
		ctx.drawImage(sc, off, off, dest, dest);
		refreshCanvasTexture(texture);
	};
	img.src = wpLogoSvgDataUrl('#f0d9a8');
	return texture;
}

function createAtriumFloorMedallion(color, secondary) {
	const group = new THREE.Group();
	const ring = new THREE.Mesh(
		new THREE.RingGeometry(2.35, 2.65, 64),
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.55,
			side: THREE.DoubleSide,
		})
	);
	ring.rotation.x = -Math.PI / 2;
	ring.position.y = 0.055;
	group.add(ring);

	// A WordPress logo woven into the carpet centre — rendered small and upscaled
	// hard so it reads embroidered/pixelated, in place of the old compass star.
	const logo = new THREE.Mesh(
		new THREE.CircleGeometry(2.2, 64),
		new THREE.MeshBasicMaterial({ map: createCarpetLogoTexture(), transparent: true })
	);
	logo.rotation.x = -Math.PI / 2;
	logo.position.y = 0.05;
	group.add(logo);
	return group;
}

// The rotunda red-carpet STAR: eight runners (one per hub side, the seven
// galleries plus the south mural/exit path) converge at the centre, joined by a
// round central medallion disc. Each arm runs from just under the disc edge out
// to its doorway at the hub wall (~16.6), aligning with that gallery's interior
// runner for continuity through the opening. The whole star is laid LOW (y≈0.03,
// disc 0.034) — above the hub floor (y=0) but BELOW every central decal (medallion
// ring/orbit/timeline/pylons/arcs at y≥0.045), so the centrepiece reads as sitting
// ON the carpet with no z-fighting.
function createAtriumCarpetRunners() {
	const group = new THREE.Group();
	const armY = 0.03;
	const discRadius = 2.3; // framed by the medallion ring at r2.35–2.65
	const innerRadius = discRadius - 0.5; // arm inner ends tuck under the disc
	const outerRadius = 16.6; // the doorway at the hub wall
	const length = outerRadius - innerRadius;
	const midRadius = (innerRadius + outerRadius) / 2;
	for (const side of hubSides) {
		const runner = createCarpetRunner(2.2, length);
		runner.position.copy(side.normal).multiplyScalar(midRadius);
		runner.position.y = armY;
		runner.rotation.y = getRotationForNormal(side.normal);
		group.add(runner);
	}

	// Central disc where the arms meet, slightly above them to hide the overlap.
	const disc = new THREE.Mesh(
		new THREE.CircleGeometry(discRadius, 64),
		new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.85, metalness: 0.04 })
	);
	disc.rotation.x = -Math.PI / 2;
	disc.position.y = armY + 0.004;
	group.add(disc);
	const discBorder = new THREE.Mesh(
		new THREE.RingGeometry(discRadius, discRadius + 0.16, 64),
		new THREE.MeshStandardMaterial({
			color: 0xc79b43,
			roughness: 0.62,
			metalness: 0.12,
			side: THREE.DoubleSide,
		})
	);
	discBorder.rotation.x = -Math.PI / 2;
	discBorder.position.y = armY + 0.003;
	group.add(discBorder);
	return group;
}

// Carpet through every walk-through doorway. The six shared-wall side doorways
// are each just the turn in the octagonal ring: the two adjacent galleries' ring
// chords already meet exactly at the doorway midpoint, so a small round corner
// patch there bridges the 45° turn (covering the notch/overlap two straight
// strips leave) without an overlapping runner. The two gift-shop passages and the
// Playground annex doorway get a short straight cross-runner so the carpet
// visibly threads from one space into the next. All laid at the gallery runner
// height (y≈0.092). World-space, current variant only.
function createDoorwayCarpetRunners() {
	const group = new THREE.Group();
	if (!isCurrentVariant) {
		return group;
	}
	const runnerY = 0.092;
	// A flat runner spanning `length` along a world-space crossing direction
	// `normal`, centred on a doorway midpoint (cx, cz). `y` lets a runner sit just
	// under the others where they overlap, keeping the depth order deterministic.
	const cross = (cx, cz, normal, width, length, y = runnerY) => {
		const runner = createCarpetRunner(width, length);
		runner.position.set(cx, y, cz);
		runner.rotation.y = getRotationForNormal(normal);
		group.add(runner);
	};

	// Side doorways: a round red+gold corner patch at each shared-wall doorway
	// midpoint, just above the ring chords (which converge there) so it cleanly
	// rounds the octagon corner where the two straight chords turn.
	const doorHalfW = sideHalfWidthAtZ(connectorDoorZ);
	for (const { a, b } of galleryConnections) {
		const onRight =
			(b.center.x - a.center.x) * a.tangent.x +
				(b.center.z - a.center.z) * a.tangent.z >
			0;
		const localX = onRight ? doorHalfW : -doorHalfW;
		const mid = a.center
			.clone()
			.add(a.tangent.clone().multiplyScalar(localX))
			.add(a.normal.clone().multiplyScalar(connectorDoorZ));
		group.add(createCarpetCornerPatch(mid.x, mid.z, runnerY));
	}

	// Gift-shop passages: both run along world x at z=shopPassageZCenter, from the
	// shop wall to the gallery wall. A single runner spans the passage with margin.
	const passageNormal = new THREE.Vector3(1, 0, 0);
	for (const era of [eras[0], eras[eras.length - 1]]) {
		const ends = shopPassageDoorways.filter((d) => d.era === era);
		if (ends.length < 2) {
			continue;
		}
		const xs = ends.map((d) => d.x);
		const x0 = Math.min(...xs);
		const x1 = Math.max(...xs);
		// Overrun each end ~0.5m so the carpet tucks under both doorways.
		cross((x0 + x1) / 2, shopPassageZCenter, passageNormal, 1.4, x1 - x0 + 1.0);
	}

	// Close the ring through the shop: a single runner across the shop interior at
	// z=shopPassageZCenter joins the two shop-wall passage entries (Blogging Roots
	// on the left, Blocks Everywhere on the right), so the loop runs continuously
	// BR gallery → passage → shop → passage → BE gallery. It crosses the clear
	// front strip of the shop, in front of the central rug and clear of all
	// merchandise/checkout, and overruns each entry to tuck under the passage runners.
	const shopEntries = shopPassageDoorways.filter((d) => d.end === 'shop').map((d) => d.x);
	if (shopEntries.length === 2) {
		const x0 = Math.min(...shopEntries);
		const x1 = Math.max(...shopEntries);
		// Laid 1.5mm below the passage runners so the ~1m overlap at each entry has a
		// deterministic depth order (the passage runner stays on top) — no z-fighting.
		cross((x0 + x1) / 2, shopPassageZCenter, passageNormal, 1.4, x1 - x0 + 1.0, runnerY - 0.0015);
	}

	// Playground annex doorway: the carpet crosses the chamfer wall (faces ±x) at
	// playgroundDoorZCenter, reaching from inside the gallery into the annex.
	if (playgroundRoom) {
		cross(playgroundDoorWallX, playgroundDoorZCenter, passageNormal, 1.6, 3.0);
	}
	return group;
}

// A small round red-carpet patch (deep-red disc + thin gold rim) used at a ring
// corner doorway to round the 45° turn where two chords meet. Radius is the ring
// chord's half-width (0.8) so it exactly fills the strip. The deep-red disc is
// laid just above the chords' carpet plane (which is `y`+0.004) so it covers
// their notch/overlap, with its gold rim a hair below it — no z-fighting.
function createCarpetCornerPatch(cx, cz, y) {
	const group = new THREE.Group();
	const radius = 0.8;
	const rim = new THREE.Mesh(
		new THREE.CircleGeometry(radius + 0.14, 48),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.62, metalness: 0.12 })
	);
	rim.rotation.x = -Math.PI / 2;
	rim.position.set(cx, y + 0.004, cz);
	group.add(rim);
	const disc = new THREE.Mesh(
		new THREE.CircleGeometry(radius, 48),
		new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.85, metalness: 0.04 })
	);
	disc.rotation.x = -Math.PI / 2;
	disc.position.set(cx, y + 0.006, cz);
	group.add(disc);
	return group;
}

// In-room ring runners: every gallery carries a doorway on each of its two side
// walls (a room↔room connector, or — in the two end galleries — a shop-passage
// door), both sitting near the connector-door z just behind the front exhibit
// stations. A runner laid as a chord between those two openings turns the
// per-room carpets, the through-door cross-runners and the shop passages into
// one continuous octagonal ring around the central rotunda. World-space, current
// variant only, matching the gallery/atrium/doorway runners.
function createRingCarpetRunners() {
	const group = new THREE.Group();
	if (!isCurrentVariant) {
		return group;
	}
	// 2mm below the cross-runners (y=0.092) so the chords cleanly lose the depth
	// test wherever they overlap a doorway cross-runner or the central runner —
	// continuous coverage, deterministic ordering, no z-fighting. Still above the
	// floor stripes/vignette rings (y≈0.088), so the ring covers them.
	const runnerY = 0.09;
	const doorHalfW = sideHalfWidthAtZ(connectorDoorZ);
	for (const room of roomSides) {
		const doors = getGalleryDoorwayPoints(room, doorHalfW);
		if (doors.length < 2) {
			continue;
		}
		const [p, q] = doors;
		const length = Math.hypot(q.x - p.x, q.z - p.z);
		const runner = createCarpetRunner(1.6, length);
		runner.position.set((p.x + q.x) / 2, runnerY, (p.z + q.z) / 2);
		// Runner length runs along local +z; aim that axis along the chord.
		runner.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
		group.add(runner);
	}
	return group;
}

// World midpoints of a gallery's two side-wall doorways: the room↔room connector
// door(s) at local x = ±doorHalfW, local z = connectorDoorZ, plus the shop-passage
// gallery-end door for the two end galleries. Returns exactly two points.
function getGalleryDoorwayPoints(room, doorHalfW) {
	const points = [];
	const toWorld = (localX, localZ) =>
		room.tangent
			.clone()
			.multiplyScalar(localX)
			.add(room.normal.clone().multiplyScalar(localZ))
			.add(room.center);
	if (room.connectLeft) {
		points.push(toWorld(-doorHalfW, connectorDoorZ));
	}
	if (room.connectRight) {
		points.push(toWorld(doorHalfW, connectorDoorZ));
	}
	for (const door of shopPassageDoorways) {
		if (door.era === room.era && door.end === 'gallery') {
			points.push(new THREE.Vector3(door.x, 0, door.z));
		}
	}
	return points;
}

// An elegant standing torchère matching the rotunda: a stepped marble base, a
// slender fluted brass stem, and a warm glowing alabaster uplighter bowl.
// Varied ornamental flora for the rotunda's eight octagon corners: alternating
// small flowering trees and flower beds, tinted from the active palette so each
// corner reads a little differently.
function createRotundaCornerFlora(index, color, secondary) {
	const palette = activeVariant.eraColors;
	const blossom = palette[(index * 3 + 1) % palette.length];
	if (index % 2 === 0) {
		return createFloweringTree(blossom, 2.5 + (index % 3) * 0.4);
	}
	return createFlowerBed(blossom, index % 4 === 1 ? secondary : color);
}

function createFloweringTree(blossomColor, height) {
	const group = new THREE.Group();
	const planter = new THREE.Mesh(
		new THREE.CylinderGeometry(0.46, 0.54, 0.46, 18),
		new THREE.MeshStandardMaterial({ color: 0xe9e0cb, roughness: 0.72 })
	);
	planter.position.y = 0.23;
	group.add(planter);
	const rim = new THREE.Mesh(
		new THREE.CylinderGeometry(0.5, 0.5, 0.08, 18),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	rim.position.y = 0.45;
	group.add(rim);
	const trunkH = height * 0.46;
	const trunk = new THREE.Mesh(
		new THREE.CylinderGeometry(0.11, 0.16, trunkH, 12),
		new THREE.MeshStandardMaterial({ color: 0x7c4a24, roughness: 0.85 })
	);
	trunk.position.y = 0.46 + trunkH / 2;
	group.add(trunk);
	const foliageMat = new THREE.MeshStandardMaterial({ color: 0x4f9a3e, roughness: 0.78 });
	const crownY = 0.46 + trunkH + 0.2;
	for (const [bx, by, bz, br] of [
		[0, 0.18, 0, 0.62],
		[-0.32, 0.0, 0.1, 0.42],
		[0.3, 0.05, -0.12, 0.44],
	]) {
		const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(br, 1), foliageMat);
		blob.position.set(bx, crownY + by, bz);
		group.add(blob);
	}
	return group;
}

function createFlowerBed(c1, c2) {
	const group = new THREE.Group();
	const planter = new THREE.Mesh(
		new THREE.CylinderGeometry(0.52, 0.58, 0.4, 18),
		new THREE.MeshStandardMaterial({ color: 0xeae1cc, roughness: 0.74 })
	);
	planter.position.y = 0.2;
	group.add(planter);
	const rim = new THREE.Mesh(
		new THREE.CylinderGeometry(0.56, 0.56, 0.07, 18),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	rim.position.y = 0.4;
	group.add(rim);
	const mound = new THREE.Mesh(
		new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
		new THREE.MeshStandardMaterial({ color: 0x3c6e2e, roughness: 0.85 })
	);
	mound.scale.set(1, 0.5, 1);
	mound.position.y = 0.42;
	group.add(mound);
	const stemMat = new THREE.MeshStandardMaterial({ color: 0x3f7d34, roughness: 0.7 });
	const colors = [c1, c2, 0xffd166, 0xff5da2];
	for (let i = 0; i < 8; i++) {
		const a = (Math.PI * 2 * i) / 8;
		const r = 0.12 + (i % 3) * 0.13;
		const x = Math.cos(a) * r;
		const z = Math.sin(a) * r;
		const stemH = 0.4 + (i % 3) * 0.18;
		const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, stemH, 6), stemMat);
		stem.position.set(x, 0.46 + stemH / 2, z);
		group.add(stem);
		const petalColor = colors[i % colors.length];
		const blossom = new THREE.Mesh(
			new THREE.SphereGeometry(0.08, 10, 8),
			new THREE.MeshStandardMaterial({ color: petalColor, roughness: 0.55, emissive: petalColor, emissiveIntensity: 0.12 })
		);
		blossom.scale.set(1, 0.7, 1);
		blossom.position.set(x, 0.46 + stemH, z);
		group.add(blossom);
	}
	return group;
}

function createAtriumMuseumArchitecture(color, secondary) {
	const group = new THREE.Group();
	const structuralColumnHeight = shellHeight - 0.58;
	for (const [sideIndex, side] of hubSides.entries()) {
		const isMural = side.kind === 'mural';
		const columnOffset = isMural
			? hubSideLength / 2 - 0.58
			: roomDoorHalfWidth + 0.34;
		for (const [columnIndex, offset] of [-columnOffset, columnOffset].entries()) {
			const position = side.midpoint
				.clone()
				.add(side.tangent.clone().multiplyScalar(offset))
				.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.28));
			const column = createCathedralColumn(
				structuralColumnHeight,
				columnIndex ? secondary : color,
				activeVariant.eraColors[(sideIndex + columnIndex + 2) % activeVariant.eraColors.length]
			);
			column.position.set(position.x, 0, position.z);
			group.add(column);
		}
	}

	group.add(createHubCornerPilasters());

	// Ornamental flora in the eight octagon corners — alternating small flowering
	// trees and flower beds, tinted from the palette — in place of the old
	// floor-lamp ring (the lamps were the bulk of the rotunda's point lights).
	for (let index = 0; index < 8; index++) {
		// Indices 3 and 4 are left empty — their flower beds sit under the Exit and
		// Start Here signs instead (see createAtriumWayfindingSigns).
		if (index === 3 || index === 4) {
			continue;
		}
		const angle = (Math.PI * 2 * index) / 8 + Math.PI / 8;
		const radius = hubApothem - 1.0;
		const flora = createRotundaCornerFlora(index, color, secondary);
		flora.position.set(Math.sin(angle) * radius, 0, -Math.cos(angle) * radius);
		group.add(flora);
	}
	return group;
}

function createHubCornerPilasters() {
	const group = new THREE.Group();
	const marble = new THREE.MeshStandardMaterial({ color: 0xf2eadc, roughness: 0.74, metalness: 0.03 });
	const shade = new THREE.MeshStandardMaterial({ color: 0xd9cdb4, roughness: 0.78 });
	const brass = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.1,
		roughness: 0.32,
		metalness: 0.52,
	});
	const innerVertexRadius = (hubApothem - wallThickness / 2) / Math.cos(Math.PI / 8) - 0.16;
	for (let k = 0; k < 8; k++) {
		const angle = Math.PI / 8 + (k * Math.PI) / 4;
		const outward = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle));
		const pos = outward.clone().multiplyScalar(innerVertexRadius);
		const rotY = getRotationForNormal(outward.clone().multiplyScalar(-1));

		const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.66, wallHeight, 0.46), marble);
		pilaster.position.set(pos.x, wallHeight / 2, pos.z);
		pilaster.rotation.y = rotY;
		group.add(pilaster);

		const reveal = new THREE.Mesh(new THREE.BoxGeometry(0.18, wallHeight - 0.4, 0.5), shade);
		reveal.position.set(pos.x, wallHeight / 2, pos.z);
		reveal.rotation.y = rotY;
		group.add(reveal);

		// Cornice corner blocks bridge the gap between adjacent wall cornices.
		for (const spec of [
			{ y: wallHeight + 0.12, h: 0.3, d: 0.56, material: marble },
			{ y: wallHeight + 0.42, h: 0.06, d: 0.62, material: brass },
			{ y: shellHeight - 2.74, h: 0.2, d: 0.5, material: marble },
			{ y: shellHeight - 2.52, h: 0.05, d: 0.56, material: brass },
		]) {
			const cap = new THREE.Mesh(new THREE.BoxGeometry(0.78, spec.h, spec.d), spec.material);
			cap.position.set(pos.x, spec.y, pos.z);
			cap.rotation.y = rotY;
			group.add(cap);
		}

		const capital = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.16, 0.6), brass);
		capital.position.set(pos.x, wallHeight - 0.18, pos.z);
		capital.rotation.y = rotY;
		group.add(capital);
	}
	return group;
}

function createCathedralColumn(height, accentColor, secondaryColor) {
	const group = new THREE.Group();
	const marbleMaterial = new THREE.MeshStandardMaterial({
		color: 0xf2eadc,
		roughness: 0.72,
		metalness: 0.03,
	});
	const shadowMaterial = new THREE.MeshStandardMaterial({
		color: 0xcfc1a6,
		roughness: 0.78,
		metalness: 0.02,
	});
	const brassMaterial = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: new THREE.Color(accentColor),
		emissiveIntensity: 0.05,
		roughness: 0.32,
		metalness: 0.5,
	});
	const glowMaterial = new THREE.MeshBasicMaterial({
		color: secondaryColor,
		transparent: true,
		opacity: 0.62,
	});

	// Attic base: square plinth, torus, then the shaft rises directly off it
	// so there is no gap between base and column.
	const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 0.92), marbleMaterial);
	plinth.position.y = 0.1;
	group.add(plinth);
	const torus = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 0.22, 28), marbleMaterial);
	torus.position.y = 0.31;
	group.add(torus);
	const baseBand = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.07, 28), brassMaterial);
	baseBand.position.y = 0.45;
	group.add(baseBand);

	const shaftBottom = 0.48;
	const shaftTop = height - 0.62;
	const shaftHeight = shaftTop - shaftBottom;
	const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.33, shaftHeight, 32), marbleMaterial);
	shaft.position.y = shaftBottom + shaftHeight / 2;
	group.add(shaft);

	for (let index = 0; index < 16; index++) {
		const angle = (Math.PI * 2 * index) / 16;
		const flute = new THREE.Mesh(new THREE.BoxGeometry(0.026, shaftHeight * 0.9, 0.035), shadowMaterial);
		const radius = 0.3;
		flute.position.set(
			Math.cos(angle) * radius,
			shaftBottom + shaftHeight / 2,
			Math.sin(angle) * radius
		);
		flute.rotation.y = -angle;
		group.add(flute);
	}

	for (const y of [wallHeight + 0.12, height - 1.08]) {
		const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.16, 28), brassMaterial);
		collar.position.y = y;
		group.add(collar);
		const halo = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.014, 8, 42), glowMaterial.clone());
		halo.rotation.x = Math.PI / 2;
		halo.position.y = y + 0.105;
		registerAnimation(halo, (object, elapsed) => {
			object.material.opacity = 0.38 + Math.sin(elapsed * 1.1 + y) * 0.1;
		});
		group.add(halo);
	}

	const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.42, 0.42, 28), marbleMaterial);
	capital.position.y = height - 0.52;
	group.add(capital);
	const capPlate = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.18, 1.05), marbleMaterial);
	capPlate.position.y = height - 0.2;
	group.add(capPlate);
	return group;
}

function createAtriumLightRig(color, secondary) {
	const group = new THREE.Group();
	group.add(createKineticChangelogMobile(color, secondary));
	for (let index = 0; index < 8; index++) {
		const angle = (Math.PI * 2 * index) / 8;
		const beamColor = index % 2 ? secondary : color;
		const beam = new THREE.Mesh(
			new THREE.ConeGeometry(1.45, 4.6, 36, 1, true),
			new THREE.MeshBasicMaterial({
				color: beamColor,
				transparent: true,
				opacity: 0.045,
				side: THREE.DoubleSide,
				depthWrite: false,
			})
		);
		beam.position.set(Math.sin(angle) * 5.2, 4.0, -Math.cos(angle) * 5.2);
		beam.rotation.z = Math.sin(angle) * 0.18;
		beam.rotation.x = Math.cos(angle) * 0.18;
		registerAnimation(beam, (object, elapsed) => {
			object.rotation.y = elapsed * 0.16 + angle;
			object.material.opacity = 0.04 + Math.sin(elapsed * 1.4 + index) * 0.012;
		});
		group.add(beam);
	}
	return group;
}

function createKineticChangelogMobile(color, secondary) {
	const group = new THREE.Group();
	const ringMaterial = new THREE.MeshStandardMaterial({
		color: 0xf6d48b,
		emissive: new THREE.Color(color),
		emissiveIntensity: 0.08,
		roughness: 0.24,
		metalness: 0.55,
	});
	[2.1, 2.9, 3.7].forEach((radius, index) => {
		const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.026, 8, 96), ringMaterial);
		ring.position.y = 5.42 + index * 0.28;
		ring.rotation.x = Math.PI / 2;
		registerAnimation(ring, (object, elapsed) => {
			object.rotation.z = elapsed * (0.2 + index * 0.08) * (index % 2 ? -1 : 1);
		});
		group.add(ring);
	});

	for (let index = 0; index < 14; index++) {
		const chip = new THREE.Mesh(
			new THREE.BoxGeometry(0.38, 0.16, 0.38),
			new THREE.MeshStandardMaterial({
				color: activeVariant.eraColors[index % activeVariant.eraColors.length],
				emissive: new THREE.Color(activeVariant.eraColors[index % activeVariant.eraColors.length]),
				emissiveIntensity: 0.08,
				roughness: 0.42,
				metalness: 0.1,
			})
		);
		const radius = 2.15 + (index % 3) * 0.62;
		const baseAngle = (Math.PI * 2 * index) / 14;
		chip.userData.mobile = { radius, baseAngle, y: 5.58 + (index % 4) * 0.18 };
		registerAnimation(chip, (object, elapsed) => {
			const mobile = object.userData.mobile;
			const angle = mobile.baseAngle + elapsed * (0.34 + (index % 4) * 0.04);
			object.position.set(Math.cos(angle) * mobile.radius, mobile.y + Math.sin(elapsed * 1.5 + index) * 0.08, Math.sin(angle) * mobile.radius);
			object.rotation.x += 0.008;
			object.rotation.y += 0.012;
		});
		group.add(chip);
	}

	const core = new THREE.PointLight(0xfff4cf, 1.25, 18);
	core.position.y = 5.55;
	registerAnimation(core, (object, elapsed) => {
		object.intensity = 1.08 + Math.sin(elapsed * 0.9) * 0.12;
	});
	group.add(core);
	return group;
}

function addAtriumFeature(group, feature, color, secondary) {
	if (feature === 'ultimate-museum') {
		addUltimateAtriumFeature(group, color, secondary);
		return;
	}
	if (feature === 'listening-booth') {
		addPlaced(group, createRecordBooth(color, secondary), 0, 4.1, Math.PI);
		addPlaced(group, createLoadedModel('radio', { targetHeight: 0.62, fallback: 'radio' }), -1.05, 3.12, -0.35);
		addPlaced(group, createLoadedModel('speakerSmall', { targetHeight: 0.72, fallback: 'speaker' }), 1.15, 3.18, 0.4);
		addPlaced(group, createLoadedModel('loungeDesignSofa', { targetHeight: 0.64, fallback: 'bench' }), 0, -3.9, 0);
		return;
	}
	if (feature === 'pinball-machine') {
		addPlaced(group, createArcadeCabinet(color, secondary), 0, 4.05, Math.PI);
		addPlaced(group, createLoadedModel('televisionVintage', { targetHeight: 0.95, fallback: 'screen' }), -2.15, 2.85, 0.45);
		addPlaced(group, createBlockFountain(color), 0, -3.55, 0);
		return;
	}
	if (feature === 'plugin-bazaar') {
		addPlaced(group, createPluginMarket(color, secondary), 0, 3.65, Math.PI);
		addPlaced(group, createLoadedModel('detailAwningWide', { targetHeight: 0.72, fallback: 'awning' }), 0, 2.55, Math.PI);
		addPlaced(group, createLoadedModel('truckGreen', { targetHeight: 0.74, fallback: 'crate' }), 3.2, -3.2, -0.8);
		return;
	}
	if (feature === 'greenhouse') {
		addPlaced(group, createPlant(color, 1.55), 0, 3.85, 0);
		addPlaced(group, createPlant(color, 1.35), -2.2, 3.1, 0.45);
		addPlaced(group, createLoadedModel('pottedPlant', { targetHeight: 1.05, fallback: 'plant' }), 2.25, 3.15, -0.45);
		addPlaced(group, createLoadedModel('detailBench', { targetHeight: 0.55, fallback: 'bench' }), 0, -4.0, 0);
		return;
	}
	if (feature === 'server-oracle') {
		addPlaced(group, createServerOracle(color, secondary), 0, 3.75, Math.PI);
		addPlaced(group, createLoadedModel('laptop', { targetHeight: 0.54, fallback: 'screen' }), -1.45, -3.5, 0.25);
		addPlaced(group, createOrbitalSculpture(activeVariant.eraColors[4]), 1.55, -3.4, -0.25);
		return;
	}
	if (feature === 'api-portal') {
		addPlaced(group, createApiPortal(color, secondary), 0, 3.85, Math.PI);
		addPlaced(group, createLoadedModel('doorRotateRoundA', { targetHeight: 1.85, fallback: 'portal' }), 0, 2.85, Math.PI);
		const orbital = createOrbitalSculpture(activeVariant.eraColors[4]);
		orbital.scale.setScalar(0.72);
		addPlaced(group, orbital, 0, -2.65, 0);
		return;
	}
	if (feature === 'block-fountain') {
		addPlaced(group, createBlockFountain(color), 0, 3.75, Math.PI);
		addPlaced(group, createLoadedModel('platingDetailed', { targetHeight: 0.28, fallback: 'block' }), -2.6, -3.2, 0.4);
		addPlaced(group, createLoadedModel('loungeDesignSofa', { targetHeight: 0.64, fallback: 'bench' }), 2.7, -3.1, -0.4);
		return;
	}
	if (feature === 'time-capsule') {
		addPlaced(group, createTimeCapsule(color), 0, 3.9, Math.PI / 2);
		addPlaced(group, createLoadedModel('bookcaseOpenLow', { targetHeight: 1.18, fallback: 'bookcase' }), -2.5, 2.85, 0.45);
		addPlaced(group, createLoadedModel('stairsOpenShort', { targetHeight: 0.75, fallback: 'stairs' }), 2.4, 2.85, -0.55);
		return;
	}
	if (feature === 'comment-aquarium') {
		addPlaced(group, createCommentAquarium(color, secondary), 0, 3.85, Math.PI);
		addPlaced(group, createLoadedModel('detailLightTraffic', { targetHeight: 1.45, fallback: 'light' }), -2.6, -3.15, 0.55);
		addPlaced(group, createLoadedModel('detailBench', { targetHeight: 0.55, fallback: 'bench' }), 2.55, -3.2, -0.55);
		return;
	}
	addPlaced(group, createMascotMonument(color, secondary), 0, 3.85, Math.PI);
	addPlaced(group, createLoadedModel('columnThin', { targetHeight: 1.85, fallback: 'column' }), -2.2, 2.95, 0);
	addPlaced(group, createLoadedModel('columnThin', { targetHeight: 1.85, fallback: 'column' }), 2.2, 2.95, 0);
}

function addUltimateAtriumFeature(group, color, secondary) {
	// Wapuu greets on the west side — the visitor's right as they enter — mirroring
	// the elePHPant greeter on the east, both partly in the opening view.
	addPlaced(group, createWapuuDocent(color, secondary), -5.5, 3.0, 2.05);
	addPlaced(group, createMuseumInfoDesk(color, secondary), 0.2, -5.72, 0.03);
	const engineRoom = createOpenSourceEngineRoom(color, secondary);
	engineRoom.scale.setScalar(0.68);
	addPlaced(group, engineRoom, 11.35, 5.52, -1.1);

	// (Tall potted trees used to stand on the carpet here; the rotunda's greenery
	// now lives in the eight octagon corners — see createRotundaCornerFlora.)

	// A tidy visitor lounge nook on the right-front: two chairs angled
	// around a coffee table with a small plant.
	const loungeX = 8.2;
	const loungeZ = -3.4;
	addPlaced(group, createLoadedModel('tableCoffee', { targetHeight: 0.4, fallback: 'block' }), loungeX, loungeZ, 0);
	addPlaced(group, createLoadedModel('loungeDesignChair', { targetHeight: 0.82, fallback: 'bench' }), loungeX - 1.05, loungeZ + 0.2, Math.PI / 2 + 0.3);
	addPlaced(group, createLoadedModel('loungeDesignChair', { targetHeight: 0.82, fallback: 'bench' }), loungeX + 1.05, loungeZ + 0.2, -Math.PI / 2 - 0.3);
	addPlaced(group, createPlant(secondary, 0.9), loungeX, loungeZ - 1.5, 0);
}

function createOpenSourceEngineRoom(color, secondary) {
	const group = new THREE.Group();
	const base = new THREE.Mesh(
		new THREE.BoxGeometry(2.85, 0.26, 1.08),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.66, metalness: 0.04 })
	);
	base.position.y = 0.13;
	group.add(base);

	const sign = createReadableLabel(createOpenSourceSignTexture('OPEN SOURCE', 'engine room', color), 1.82, 0.48);
	sign.position.set(0, 1.75, -0.56);
	group.add(sign);

	const serverA = createServerStack(color);
	serverA.scale.setScalar(0.62);
	serverA.position.set(-0.78, 0.26, 0.05);
	group.add(serverA);
	const serverB = createServerStack(secondary);
	serverB.scale.setScalar(0.56);
	serverB.position.set(0.18, 0.26, 0.05);
	group.add(serverB);
	const laptop = createLoadedModel('laptop', { targetHeight: 0.42, fallback: 'screen' });
	laptop.position.set(0.98, 0.28, -0.08);
	laptop.rotation.y = -0.28;
	group.add(laptop);

	const projectStrip = openSourceProjectItems.slice(0, 6);
	projectStrip.forEach((item, index) => {
		const chip = createReadableLabel(createOpenSourceSignTexture(item.title, item.note, item.color), 0.68, 0.28);
		chip.position.set(-1.05 + index * 0.42, 0.58 + (index % 2) * 0.24, -0.6);
		chip.rotation.y = -0.02 + index * 0.012;
		group.add(chip);
	});

	const portal = createApiPortal(color, secondary, 0.42);
	portal.position.set(0.96, 0.3, 0.38);
	portal.rotation.y = Math.PI;
	group.add(portal);
	return group;
}

function createWapuuDocent(color, secondary) {
	const group = new THREE.Group();
	const pedestal = createPedestal(1.36, 0.32, color);
	group.add(pedestal);

	// The same held-logo Wapuu as the entrance greeter, but rotated to follow
	// the viewer: the cradled medallion turns with the figure to face whoever
	// is looking, on top of the gentle bob.
	const figure = createGreeterWapuu(2.1, secondary);
	figure.position.y = 0.3;
	registerAnimation(figure, (object, elapsed) => {
		object.position.y = 0.3 + Math.sin(elapsed * 1.15) * 0.05;
		const parent = object.parent;
		if (parent) {
			const cameraLocal = camera.position.clone();
			parent.worldToLocal(cameraLocal);
			const direction = new THREE.Vector3(
				cameraLocal.x - object.position.x,
				0,
				cameraLocal.z - object.position.z
			);
			if (direction.lengthSq() > 0.001) {
				const targetAngle = getRotationForNormal(direction.normalize());
				object.rotation.y = lerpAngle(object.rotation.y, targetAngle, 0.08);
			}
		}
		object.rotation.z = Math.sin(elapsed * 0.75) * 0.018;
	});
	group.add(figure);

	const label = createReadableLabel(createSmallSignTexture('WAPUU', color), 1.12, 0.26);
	label.position.set(0, 0.48, -0.58);
	group.add(label);

	const docentSign = createReadableLabel(createSmallSignTexture('OPEN SOURCE', secondary), 1.38, 0.28);
	docentSign.position.set(0.68, 2.42, -0.42);
	docentSign.rotation.z = -0.05;
	group.add(docentSign);
	group.add(createWapuuSparkles(color, secondary));

	const glow = new THREE.PointLight(new THREE.Color(secondary), 0.82, 6.8);
	glow.position.set(0, 1.32, -0.34);
	registerAnimation(glow, (object, elapsed) => {
		object.intensity = 0.72 + Math.sin(elapsed * 1.8) * 0.11;
	});
	group.add(glow);
	return group;
}

function createWapuu3D(options = {}) {
	// Canonical Wapuu: a round, squat yellow body (wider at the bottom) with
	// the WordPress logo on its belly, two broad orange ears, big black
	// eyes, an orange tail and little yellow paws.
	const height = options.height ?? 2;
	const unit = height / 2.4;
	const group = new THREE.Group();

	const yellow = new THREE.MeshStandardMaterial({ color: 0xffcf3d, roughness: 0.5, metalness: 0.03 });
	const yellowShade = new THREE.MeshStandardMaterial({ color: 0xf0b518, roughness: 0.54 });
	const orange = new THREE.MeshStandardMaterial({ color: 0xff8a2b, roughness: 0.47 });
	const orangeShade = new THREE.MeshStandardMaterial({ color: 0xe8701a, roughness: 0.5 });
	const black = new THREE.MeshStandardMaterial({ color: 0x14101a, roughness: 0.3, metalness: 0.05 });
	const white = new THREE.MeshStandardMaterial({ color: 0xfdfdf4, roughness: 0.28 });
	const cheekMat = new THREE.MeshBasicMaterial({ color: 0xff9bb0, transparent: true, opacity: 0.5, depthWrite: false });

	// Feet sit on the ground and do not bob with the body.
	const footGeom = new THREE.SphereGeometry(0.16, 22, 16);
	for (const sx of [-1, 1]) {
		const foot = new THREE.Mesh(footGeom, yellowShade);
		foot.scale.set(0.8 * unit, 0.5 * unit, 1.15 * unit);
		foot.position.set(sx * 0.22 * unit, 0.085 * unit, 0.16 * unit);
		group.add(foot);
	}

	// Everything above the feet gently bobs together.
	const bob = new THREE.Group();
	group.add(bob);

	// Egg-shaped body: round head-blob over a wider belly.
	const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 30), yellow);
	body.scale.set(1.06 * unit, 1.04 * unit, 1.0 * unit);
	body.position.y = 0.66 * unit;
	bob.add(body);
	const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 36, 26), yellow);
	belly.scale.set(1.16 * unit, 0.82 * unit, 1.08 * unit);
	belly.position.set(0, 0.4 * unit, 0.0 * unit);
	bob.add(belly);

	// WordPress logo emblem, prominent on the lower belly. Omitted when the
	// Wapuu instead holds a separate, larger logo in front of it.
	if (options.emblem !== false) {
		const emblem = new THREE.Mesh(
			new THREE.CircleGeometry(0.25 * unit, 48),
			new THREE.MeshBasicMaterial({ map: createWapuuWordmarkTexture(), transparent: true })
		);
		emblem.position.set(0, 0.46 * unit, 0.52 * unit);
		bob.add(emblem);
	}

	// Two broad orange ears at the top corners, pointing up and out.
	const earGeom = new THREE.ConeGeometry(0.26, 0.5, 22);
	const earInnerGeom = new THREE.ConeGeometry(0.14, 0.3, 18);
	const ears = [];
	for (const sx of [-1, 1]) {
		const ear = new THREE.Mesh(earGeom, orange);
		ear.scale.set(unit, unit, 0.38 * unit);
		ear.position.set(sx * 0.34 * unit, 1.08 * unit, -0.02 * unit);
		ear.rotation.z = sx * -0.5;
		ear.rotation.x = -0.12;
		bob.add(ear);
		ears.push(ear);
		const inner = new THREE.Mesh(earInnerGeom, orangeShade);
		inner.scale.set(unit, unit, 0.38 * unit);
		inner.position.set(sx * 0.34 * unit, 1.04 * unit, 0.05 * unit);
		inner.rotation.z = sx * -0.5;
		inner.rotation.x = -0.12;
		bob.add(inner);
	}

	// Big round black eyes with highlights, subtle cheeks, tiny nose.
	const eyeGeom = new THREE.SphereGeometry(0.1, 22, 18);
	for (const sx of [-1, 1]) {
		const eye = new THREE.Mesh(eyeGeom, black);
		eye.scale.set(0.92 * unit, 1.12 * unit, 0.66 * unit);
		eye.position.set(sx * 0.19 * unit, 0.82 * unit, 0.44 * unit);
		bob.add(eye);
		const hl = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 10), white);
		hl.position.set(sx * 0.19 * unit + 0.04 * unit, 0.88 * unit, 0.5 * unit);
		hl.scale.setScalar(unit);
		bob.add(hl);
		const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.075 * unit, 20), cheekMat);
		cheek.position.set(sx * 0.36 * unit, 0.68 * unit, 0.4 * unit);
		cheek.rotation.y = sx * -0.55;
		bob.add(cheek);
	}
	const nose = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 12), black);
	nose.scale.set(1.3 * unit, 0.9 * unit, unit);
	nose.position.set(0, 0.69 * unit, 0.52 * unit);
	bob.add(nose);

	// Orange tail with a curled tip.
	const tail = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 14), orange);
	tail.scale.set(0.72 * unit, 0.95 * unit, 0.72 * unit);
	tail.position.set(0.04 * unit, 0.36 * unit, -0.54 * unit);
	bob.add(tail);
	const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), orangeShade);
	tailTip.scale.setScalar(unit);
	tailTip.position.set(0.17 * unit, 0.54 * unit, -0.6 * unit);
	bob.add(tailTip);

	// Little yellow paws. When holding a logo, they swing forward to cradle it.
	const handGeom = new THREE.SphereGeometry(0.12, 16, 12);
	for (const sx of [-1, 1]) {
		const hand = new THREE.Mesh(handGeom, yellowShade);
		hand.scale.set(unit, 1.05 * unit, unit);
		if (options.hold) {
			hand.position.set(sx * 0.36 * unit, 0.5 * unit, 0.6 * unit);
		} else {
			hand.position.set(sx * 0.5 * unit, 0.4 * unit, 0.12 * unit);
		}
		bob.add(hand);
	}

	if (options.idle !== false) {
		registerAnimation(bob, (object, elapsed) => {
			object.position.y = Math.sin(elapsed * 1.5) * 0.02 * unit;
			object.rotation.z = Math.sin(elapsed * 0.8) * 0.02;
			ears[0].rotation.z = -0.5 + Math.sin(elapsed * 1.9) * 0.08;
			ears[1].rotation.z = 0.5 - Math.sin(elapsed * 1.9) * 0.08;
		});
	}
	return group;
}

function createWapuuWordmarkTexture() {
	if (wapuuWordmarkTexture) {
		return wapuuWordmarkTexture;
	}
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 256;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	// WordPress logo: white "W" inside a blue disc.
	ctx.fillStyle = '#1e6a93';
	ctx.beginPath();
	ctx.arc(128, 128, 96, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#0d4f72';
	ctx.beginPath();
	ctx.arc(128, 128, 96, 0, Math.PI * 2);
	ctx.lineWidth = 10;
	ctx.strokeStyle = '#0d4f72';
	ctx.stroke();
	ctx.fillStyle = '#fdfdf4';
	ctx.font = '900 150px Georgia, "Times New Roman", serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('W', 128, 150);
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	wapuuWordmarkTexture = texture;
	return texture;
}

function createWapuuSparkles(color, secondary) {
	const group = new THREE.Group();
	const colors = [color, secondary, 0xfff5df];
	for (let index = 0; index < 7; index++) {
		const sparkle = new THREE.Mesh(
			new THREE.OctahedronGeometry(0.055 + (index % 3) * 0.014, 0),
			new THREE.MeshBasicMaterial({
				color: colors[index % colors.length],
				transparent: true,
				opacity: 0.88,
				depthWrite: false,
			})
		);
		const angle = -0.8 + index * 0.32;
		const radius = 0.82 + (index % 2) * 0.18;
		sparkle.userData.base = {
			x: Math.cos(angle) * radius,
			y: 1.34 + (index % 4) * 0.34,
			z: -0.36 - (index % 2) * 0.1,
		};
		sparkle.position.set(sparkle.userData.base.x, sparkle.userData.base.y, sparkle.userData.base.z);
		registerAnimation(sparkle, (object, elapsed) => {
			const base = object.userData.base;
			const pulse = 0.76 + Math.sin(elapsed * 2.1 + index) * 0.18;
			object.position.y = base.y + Math.sin(elapsed * 1.2 + index) * 0.035;
			object.rotation.y += 0.018 + index * 0.001;
			object.scale.setScalar(pulse);
			object.material.opacity = 0.66 + Math.sin(elapsed * 2.3 + index) * 0.16;
		});
		group.add(sparkle);
	}
	return group;
}

function createMuseumInfoDesk(color, secondary) {
	const group = new THREE.Group();
	const desk = new THREE.Mesh(
		new THREE.BoxGeometry(1.92, 0.46, 0.66),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.62, metalness: 0.04 })
	);
	desk.position.y = 0.23;
	group.add(desk);
	const stripe = new THREE.Mesh(
		new THREE.BoxGeometry(1.98, 0.07, 0.7),
		new THREE.MeshBasicMaterial({ color })
	);
	stripe.position.y = 0.5;
	group.add(stripe);
	const screen = createAdminScreenPanel(color, secondary, 0.72, 0.42);
	screen.position.set(-0.47, 0.8, -0.35);
	screen.rotation.x = -0.06;
	group.add(screen);
	const laptop = createLoadedModel('laptop', {
		targetHeight: 0.34,
		fallback: 'screen',
	});
	laptop.position.set(0.47, 0.52, -0.14);
	laptop.rotation.y = -0.24;
	group.add(laptop);
	// "INFORMATION" raised on a slim pole above the desk, clear of the screen
	// and laptop; the label is double-faced, so it reads from both sides.
	// The pole ends at the sign's bottom edge — thicker than the gap between
	// the label's two faces, it would poke through the artwork otherwise.
	const signPole = new THREE.Mesh(
		new THREE.CylinderGeometry(0.028, 0.038, 1.59, 12),
		new THREE.MeshStandardMaterial({ color: 0x6b6b78, roughness: 0.4, metalness: 0.5 })
	);
	signPole.position.set(0, 0.46 + 0.795, -0.28);
	group.add(signPole);
	const sign = createReadableLabel(createSmallSignTexture('INFORMATION', secondary), 1.4, 0.3);
	sign.position.set(0, 2.2, -0.28);
	group.add(sign);

	const miniWapuu = createWapuu3D({ height: 0.5, accent: 0xffd166 });
	miniWapuu.position.set(0.73, 0.46, 0.16);
	miniWapuu.rotation.y = -0.45;
	group.add(miniWapuu);

	const counter = createVisitorCounter();
	counter.position.set(-1.42, 0, 0.18);
	counter.rotation.y = 0.18;
	group.add(counter);
	return group;
}

function createVisitorCounter() {
	// A Web 1.0 "hit counter" odometer on a stand — a wink at 2004-era
	// homepages. Stands on the floor beside the info desk, facing visitors.
	const group = new THREE.Group();
	const base = new THREE.Mesh(
		new THREE.CylinderGeometry(0.16, 0.2, 0.08, 18),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.68 })
	);
	base.position.y = 0.04;
	group.add(base);
	const post = new THREE.Mesh(
		new THREE.CylinderGeometry(0.035, 0.045, 0.86, 12),
		new THREE.MeshStandardMaterial({ color: 0x6b6b78, roughness: 0.4, metalness: 0.5 })
	);
	post.position.y = 0.5;
	group.add(post);
	const body = new THREE.Mesh(
		new THREE.BoxGeometry(0.6, 0.28, 0.12),
		new THREE.MeshStandardMaterial({ color: 0x14121a, roughness: 0.42, metalness: 0.12 })
	);
	body.position.y = 1.04;
	group.add(body);
	const screen = new THREE.Mesh(
		new THREE.PlaneGeometry(0.54, 0.2),
		new THREE.MeshBasicMaterial({ map: createVisitorCounterTexture(), transparent: true })
	);
	screen.position.set(0, 1.04, 0.062);
	group.add(screen);
	return group;
}

function createVisitorCounterTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 180;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#05060a';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#39ff6a';
	ctx.font = '700 26px ui-monospace, Menlo, monospace';
	ctx.textAlign = 'center';
	ctx.fillText('YOU ARE VISITOR', 256, 40);
	// odometer digits on little dark cells
	const digits = '00424242';
	const cellW = 50;
	const startX = 256 - (digits.length * cellW) / 2;
	for (let i = 0; i < digits.length; i++) {
		const x = startX + i * cellW;
		ctx.fillStyle = '#0c1530';
		ctx.fillRect(x + 4, 70, cellW - 8, 86);
		ctx.fillStyle = '#ffd23f';
		ctx.font = '900 64px ui-monospace, Menlo, monospace';
		ctx.fillText(digits[i], x + cellW / 2, 138);
	}
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function addAtriumBenches(group) {
	// A symmetric pair of plush viewing benches in the open floor wedges flanking
	// the entrance arm (the -z carpet spoke), set on each wedge bisector (±22.5°)
	// at a radius that clears the central medallion and rope ring. Both face
	// inward toward the rotunda centrepiece, sized to read in the grand hub.
	const radius = 6.8;
	for (const wedgeAngle of [-Math.PI / 8, Math.PI / 8]) {
		const outward = getDirectionFromAngle(wedgeAngle);
		const spot = outward.clone().multiplyScalar(radius);
		const bench = createLoadedModel('loungeDesignSofa', { targetLength: 2.0, fallback: 'bench' });
		// Face the centre: the seat opens toward local -z, so aiming local +z
		// outward turns the open side inward, toward the rotunda centrepiece.
		addPlaced(group, bench, spot.x, spot.z, getRotationForNormal(outward));
	}
}

function createRoomDecor(room) {
	const group = new THREE.Group();
	if (!shouldDecorateScene) {
		return group;
	}

	const roomIndex = eras.indexOf(room.era);
	if (activeVariant.roomFeature === 'era-vignettes') {
		addRoomFeature(group, room, roomIndex);
		return group;
	}

	const primaryProp = activeVariant.props[roomIndex % activeVariant.props.length];
	const secondaryProp = activeVariant.props[(roomIndex + 3) % activeVariant.props.length];
	const left = createMuseumProp(primaryProp, room.color);
	left.position.set(-roomWidth / 2 + 1.2, 0, -roomDepth / 2 + 1.4);
	left.rotation.y = Math.PI / 4;
	group.add(left);

	const right = createMuseumProp(secondaryProp, activeVariant.eraColors[(roomIndex + 2) % 7]);
	right.position.set(roomWidth / 2 - 1.2, 0, -roomDepth / 2 + 1.4);
	right.rotation.y = -Math.PI / 4;
	group.add(right);

	addRoomFeature(group, room, roomIndex);
	return group;
}

function addRoomFeature(group, room, roomIndex) {
	const feature = activeVariant.roomFeature;
	const color = room.color;
	const z = -roomDepth / 2 + 1.08;
	if (feature === 'era-vignettes') {
		addEraVignette(group, room, roomIndex);
		return;
	}
	if (feature === 'record-crates') {
		addLocal(group, createRecordStack(color), 0, z, 0);
		addLocal(group, createLoadedModel('speakerSmall', { targetHeight: 0.58, fallback: 'speaker' }), -2.6, z + 0.3, 0.25);
		addLocal(group, createLoadedModel('radio', { targetHeight: 0.46, fallback: 'radio' }), 2.5, z + 0.3, -0.25);
		return;
	}
	if (feature === 'arcade-corners') {
		addLocal(group, createArcadeCabinet(color, activeVariant.eraColors[(roomIndex + 2) % 7]), 0, z + 0.2, 0);
		return;
	}
	if (feature === 'crate-market') {
		addLocal(group, createLoadedModel('pallet', { targetHeight: 0.28, fallback: 'crate' }), 0, z + 0.1, 0);
		addLocal(group, createPluginCrates(color), 0.4, z + 0.1, -0.18);
		return;
	}
	if (feature === 'plant-lab') {
		addLocal(group, createPlant(color, 1.15), 0, z + 0.15, 0);
		addLocal(group, createPlant(color, 0.9), -2.1, z + 0.1, 0);
		addLocal(group, createLoadedModel('plantSmall2', { targetHeight: 0.72, fallback: 'plant' }), 2.1, z + 0.1, 0);
		return;
	}
	if (feature === 'terminal-desks') {
		addLocal(group, createTerminalDesk(color), 0, z + 0.2, 0);
		return;
	}
	if (feature === 'portal-kiosks') {
		addLocal(group, createApiPortal(color, activeVariant.eraColors[(roomIndex + 1) % 7], 0.58), 0, z + 0.2, 0);
		return;
	}
	if (feature === 'block-stacks') {
		addLocal(group, createBlockFountain(color, 0.64), 0, z + 0.2, 0);
		return;
	}
	if (feature === 'archive-cases') {
		addLocal(group, createDisplayCase(color, 'archive'), 0, z + 0.2, 0);
		addLocal(group, createLoadedModel('bookcaseOpenLow', { targetHeight: 0.88, fallback: 'bookcase' }), 2.5, z + 0.15, -0.22);
		return;
	}
	if (feature === 'moderation-tanks') {
		addLocal(group, createCommentAquarium(color, activeVariant.eraColors[(roomIndex + 4) % 7], 0.58), 0, z + 0.2, 0);
		return;
	}
	addLocal(group, createDisplayCase(color, 'monument'), 0, z + 0.2, 0);
}

function addEraVignette(group, room, roomIndex) {
	const color = room.color;
	const secondary = activeVariant.eraColors[(roomIndex + 2) % activeVariant.eraColors.length];
	const stations = getEraVignetteStations(roomIndex);
	getEraVignetteItems(room, color, secondary).forEach((item, index) => {
		// A vignette may pin itself to a specific station so removing earlier
		// items doesn't slide it into a vacated (front-of-entrance) spot.
		const stationIndex = item.station ?? index;
		const station = item.at || stations[stationIndex];
		addLocal(
			group,
			createVignetteStation(color, item.label, item.object, {
				...item,
				objectScale: item.objectScale ?? (stationIndex === 2 ? 0.72 : 1),
			}),
			station.x,
			station.z,
			station.rotation
		);
	});
	if (isCurrentVariant) {
		addEraModelProps(group, room, roomIndex, color, secondary);
		group.add(createEraCatchphraseSign(room, color, secondary));
		group.add(createWebEraPoster(room));
		const frontWallZ = -roomDepth / 2 + wallThickness / 2 + 0.05;
		if (room.era === eras[0]) {
			// Under Construction sits on the freed-up wall left of the portal,
			// centred on that segment.
			addLocal(group, createUnderConstructionPlaque(), -4.87, frontWallZ);
			// The Link Buttons board and Web-Safe Palette hang on the left side
			// wall above the radio (placed by propSets at z≈-5.5), centred on it.
			group.add(placeOnSideWall(createLinkButtonBoard(), 'left', -6.6, eraPanelY, 0.2));
			group.add(placeOnSideWall(createWebSafePalettePanel(), 'left', -4.4, eraPanelY, 0.2));
			addWebOf2004Display(group);
			addGuestbookLectern(group);
			addRetroHomepageStation(group);
			addBloggingRootsScreenshots(group);
			addWebStand(group);
			addWpHooksRail(group);
		} else if (room.era === 'CMS Toolkit') {
			// Skeuomorphism centred on the right segment; faux materials + IE6
			// card share the left segment, spaced so they don't overlap.
			addLocal(group, createSkeuomorphicPanel(), 4.87, frontWallZ);
			addLocal(group, createFauxMaterialsPanel(), -3.92, frontWallZ);
			group.add(createIE6RetirementCard());
			addProminentPair(group, createToolboxStand(), createMultisiteVillage());
		} else if (room.era === 'Dashboard Foundations') {
			addLocal(group, createWeb2Panel(), 3.95, frontWallZ);
			addDashboardScreenshots(group);
			addLocal(group, createHowdyAdminBar(), -4.7, frontWallZ);
			addProminentPair(group, createDashboardCockpit(), createUndoLever());
		} else if (room.era === 'Modern Admin') {
			addLocal(group, createFlatDesignPanel(), 4.87, frontWallZ);
			addProminentPair(group, createEmojiStatue(), createResponsiveTotem());
		} else if (room.era === 'API and Customizer') {
			addLocal(group, createMaterialDesignPanel(), 4.87, frontWallZ);
			addProminentPair(group, createCustomizerProminent(color, secondary), createRestBench());
		} else if (room.era === 'Block Editor') {
			addLocal(group, createBigTypePanel(), 4.87, frontWallZ);
			addBlockEditorPrintingPress(group, color);
		} else if (room.era === 'Blocks Everywhere') {
			addLocal(group, createDarkModePanel(), 4.87, frontWallZ);
			addProminentPair(group, createBlockHouse(), createSlashMonolith());
			addScatteredFloorBlocks(group, roomIndex);
		}
	}
}

// Stands the Gutenberg-pun printing press out in the open floor bay between the
// central axial runner and the octagon ring carpet (the +x side), rather than
// flat against a wall. Turned to face the room's entry doorway so arriving
// visitors meet the press head-on. Clear of both carpets and the wall railings.
function addBlockEditorPrintingPress(group, color) {
	addLocal(group, createPrintingPress(color), 3.75, 1.3, -2.76);
}

// "Blocks everywhere" taken literally: loose colourful blocks strewn across the
// whole gallery floor at random spots, sizes and angles. Decorative only — they
// rest on the floor and never affect the wall-based collision. Kept off the
// plinths and the entry-doorway mouth so the room still reads as walkable.
function addScatteredFloorBlocks(group, roomIndex) {
	const palette = activeVariant.eraColors;
	const stations = getEraVignetteStations(roomIndex);
	const clearOfStations = (x, z) => stations.every((s) => Math.hypot(x - s.x, z - s.z) > 1.05);
	// keep clear of the two prominent props standing at (±3.5, 1.1)
	const clearOfProps = (x, z) => Math.hypot(x - 3.5, z - 1.1) > 1.5 && Math.hypot(x + 3.5, z - 1.1) > 1.5;
	let placed = 0;
	for (let attempt = 0; placed < 52 && attempt < 600; attempt++) {
		const z = -7 + Math.random() * 14;
		const half = sideHalfWidthAtZ(z) - 0.7; // stay off the angled side walls
		const x = (Math.random() * 2 - 1) * half;
		if (z < -6 && Math.abs(x) < 2.2) continue; // keep the entry doorway mouth clear
		if (!clearOfStations(x, z)) continue;
		if (!clearOfProps(x, z)) continue;
		const size = 0.18 + Math.random() * 0.26;
		const block = new THREE.Mesh(
			new THREE.BoxGeometry(size, size, size),
			new THREE.MeshStandardMaterial({
				color: palette[Math.floor(Math.random() * palette.length)],
				roughness: 0.5,
			})
		);
		block.position.set(x, size * 0.5, z);
		block.rotation.set((Math.random() - 0.5) * 0.12, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.12);
		group.add(block);
		placed++;
	}
}

// === Prominent era prop pairs ===========================================
// Room I set the pattern (the WP HOOKS rack + "The Web" tree): every gallery
// gets two big free-standing pun props mirrored across the central runner at
// (±3.5, 1.1), both turned to face the entry doorway, each with a name plate.
function addProminentPair(group, leftProp, rightProp) {
	leftProp.position.set(-3.5, 0, 1.1);
	leftProp.rotation.y = 2.78;
	group.add(leftProp);
	rightProp.position.set(3.5, 0, 1.1);
	rightProp.rotation.y = -2.78;
	group.add(rightProp);
}

function propStdMat(color, roughness = 0.62, metalness = 0) {
	return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

// A weighted stone disc base shared by the standing props, for grounding.
function createPropBase(radius = 0.38) {
	const base = new THREE.Mesh(
		new THREE.CylinderGeometry(radius * 0.86, radius, 0.1, 24),
		propStdMat(0x9aa3ad, 0.9, 0.06)
	);
	base.position.y = 0.05;
	return base;
}

// A museum name plate (title + witty subtitle), styled like the hooks/web plates.
function createExhibitPlate(title, subtitle, width = 1.3) {
	return createReadableLabel(createExhibitPlateTexture(title, subtitle), width, width * 0.26);
}

function createExhibitPlateTexture(title, subtitle) {
	const canvas = document.createElement('canvas');
	canvas.width = 900;
	canvas.height = 234;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#1a1208';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#f4ead0';
	ctx.fillRect(14, 14, canvas.width - 28, canvas.height - 28);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#241a0c';
	if (subtitle) {
		fillFittedCanvasText(ctx, title, canvas.width / 2, 84, 770, 86, '900', 'Arial Black, Impact, sans-serif');
		ctx.fillStyle = '#7a5a1c';
		ctx.font = 'italic 600 40px Georgia, serif';
		ctx.fillText(subtitle, canvas.width / 2, 168);
	} else {
		fillFittedCanvasText(ctx, title, canvas.width / 2, canvas.height / 2, 770, 122, '900', 'Arial Black, Impact, sans-serif');
	}
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// II · Dashboard Foundations — a steel-and-brass instrument cluster on a stand,
// three real dial gauges over a small steering wheel (2.7's modern dashboard).
function createDashboardCockpit() {
	const g = new THREE.Group();
	const steel = propStdMat(0x3c4654, 0.5, 0.55);
	const steelDark = propStdMat(0x2a313c, 0.55, 0.5);
	const brass = propStdMat(0xc79b43, 0.36, 0.62);
	g.add(createPropBase(0.5));
	const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.92, 18), steel);
	col.position.y = 0.5;
	g.add(col);
	// Instrument housing: a slab with a rounded brass surround, tilted to the viewer.
	const housing = new THREE.Group();
	housing.position.set(0, 1.18, 0.06);
	housing.rotation.x = -0.36;
	g.add(housing);
	const panel = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.6, 0.16), steelDark);
	housing.add(panel);
	const trim = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.68, 0.06), brass);
	trim.position.z = -0.04;
	housing.add(trim);
	// A larger central speedo flanked by two smaller dials, automotive-style.
	const dials = [
		{ x: -0.5, r: 0.13, frac: 0.34 },
		{ x: 0, r: 0.2, frac: 0.72 },
		{ x: 0.5, r: 0.13, frac: 0.55 },
	];
	for (const dial of dials) {
		const bezel = new THREE.Mesh(new THREE.TorusGeometry(dial.r + 0.012, 0.026, 14, 30), brass);
		bezel.position.set(dial.x, 0, 0.1);
		housing.add(bezel);
		const face = new THREE.Mesh(
			new THREE.CircleGeometry(dial.r, 30),
			new THREE.MeshBasicMaterial({ map: createGaugeFaceTexture(dial.frac) })
		);
		face.position.set(dial.x, 0, 0.092);
		housing.add(face);
	}
	// Steering wheel on a short column in front of the panel, raked back like a
	// car's so its face angles up toward the viewer.
	const dark = propStdMat(0x14181f, 0.55);
	const wheelGroup = new THREE.Group();
	wheelGroup.position.set(0, 0.98, 0.38);
	// Negative tilt rakes the top back toward the panel so the face angles UP
	// toward the viewer, like a real car wheel (positive would tip it face-down).
	wheelGroup.rotation.x = -0.5;
	g.add(wheelGroup);
	const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.045, 16, 32), dark);
	wheelGroup.add(wheel);
	const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 18), brass);
	hub.rotation.x = Math.PI / 2;
	wheelGroup.add(hub);
	for (const a of [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6]) {
		const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.03, 0.03), dark);
		spoke.rotation.z = a;
		spoke.position.set(Math.cos(a) * 0.125, Math.sin(a) * 0.125, 0);
		wheelGroup.add(spoke);
	}
	const wheelColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.42, 12), steel);
	wheelColumn.position.set(0, 0.78, 0.28);
	wheelColumn.rotation.x = 0.45;
	g.add(wheelColumn);
	const plate = createExhibitPlate('THE DASHBOARD', 'mind the gauges');
	plate.position.set(0, 0.5, 0.66);
	g.add(plate);
	return g;
}

// A speedometer-style dial: dark face, green-amber-red arc band, tick marks
// and a thick red needle sweeping from the lower left — reads automotive, not
// like a wall clock.
function createGaugeFaceTexture(frac) {
	const cv = document.createElement('canvas');
	cv.width = 220;
	cv.height = 220;
	const x = cv.getContext('2d');
	const cx = 110, cy = 110, r = 96;
	x.fillStyle = '#20242c';
	x.beginPath();
	x.arc(cx, cy, r, 0, Math.PI * 2);
	x.fill();
	const a0 = Math.PI * 0.75;
	const a1 = Math.PI * 2.25;
	// Coloured zone band along the sweep.
	const zones = [
		{ to: 0.55, color: '#46b450' },
		{ to: 0.8, color: '#f0a830' },
		{ to: 1, color: '#c0392b' },
	];
	let from = 0;
	x.lineWidth = 16;
	for (const zone of zones) {
		x.strokeStyle = zone.color;
		x.beginPath();
		x.arc(cx, cy, r - 20, a0 + (a1 - a0) * from, a0 + (a1 - a0) * zone.to);
		x.stroke();
		from = zone.to;
	}
	x.strokeStyle = '#e8e2d2';
	for (let i = 0; i <= 8; i++) {
		const a = a0 + (a1 - a0) * i / 8;
		const c = Math.cos(a), s = Math.sin(a);
		x.lineWidth = i % 2 ? 3 : 6;
		x.beginPath();
		x.moveTo(cx + c * (r - 6), cy + s * (r - 6));
		x.lineTo(cx + c * (r - 16), cy + s * (r - 16));
		x.stroke();
	}
	const na = a0 + (a1 - a0) * frac;
	x.strokeStyle = '#e2574c';
	x.lineWidth = 9;
	x.lineCap = 'round';
	x.beginPath();
	x.moveTo(cx - Math.cos(na) * 14, cy - Math.sin(na) * 14);
	x.lineTo(cx + Math.cos(na) * (r - 34), cy + Math.sin(na) * (r - 34));
	x.stroke();
	x.fillStyle = '#c79b43';
	x.beginPath();
	x.arc(cx, cy, 11, 0, Math.PI * 2);
	x.fill();
	const t = createCanvasTexture(cv);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	return t;
}

// II · Dashboard Foundations (right) — a giant just-pressed Ctrl+Z, the
// universal undo (revisions, trash and the undo stack all landed in this era).
function createUndoLever() {
	const g = new THREE.Group();
	g.add(createPropBase(0.72));
	// A tilted display board angles both key tops toward the visitor, so the
	// legends read from standing height.
	const support = new THREE.Mesh(
		new THREE.BoxGeometry(0.56, 0.62, 0.5),
		propStdMat(0x2e3440, 0.6, 0.2)
	);
	support.position.set(0, 0.36, -0.3);
	g.add(support);
	const board = new THREE.Group();
	board.position.set(0, 0.8, -0.05);
	board.rotation.x = 0.62;
	g.add(board);
	const slab = new THREE.Mesh(
		new THREE.BoxGeometry(1.72, 0.1, 1.34),
		propStdMat(0x2e3440, 0.6, 0.2)
	);
	board.add(slab);
	const ctrl = createGiantKeycap('ctrl', 1.02, 0.8);
	ctrl.position.set(-0.26, 0.05, -0.24);
	board.add(ctrl);
	// The Z key sits visibly pressed, caught mid-undo.
	const z = createGiantKeycap('Z', 0.74, 0.74);
	z.position.set(0.42, 0.05, 0.28);
	z.rotation.y = -0.1;
	z.scale.y = 0.72;
	board.add(z);
	const plate = createExhibitPlate('UNDO', 'ctrl+Z · revisions · trash');
	plate.position.set(0, 0.5, 0.85);
	g.add(plate);
	return g;
}

// One oversized keyboard keycap: a cream body with a slightly smaller cap top
// carrying the legend, like a giant desk-toy key.
function createGiantKeycap(legend, width, depth) {
	const g = new THREE.Group();
	const body = new THREE.Mesh(
		new THREE.BoxGeometry(width, 0.52, depth),
		propStdMat(0xd9d0bc, 0.6)
	);
	body.position.y = 0.26;
	g.add(body);
	const cap = new THREE.Mesh(
		new THREE.BoxGeometry(width * 0.9, 0.14, depth * 0.9),
		propStdMat(0xf2ecdc, 0.5)
	);
	cap.position.y = 0.59;
	g.add(cap);
	const face = new THREE.Mesh(
		new THREE.PlaneGeometry(width * 0.84, depth * 0.84),
		new THREE.MeshBasicMaterial({ map: createKeycapTexture(legend), transparent: true })
	);
	face.rotation.x = -Math.PI / 2;
	face.position.y = 0.662;
	g.add(face);
	return g;
}

function createKeycapTexture(legend) {
	const cv = document.createElement('canvas');
	cv.width = 256;
	cv.height = 256;
	const x = cv.getContext('2d');
	x.fillStyle = '#f6efe0';
	x.fillRect(0, 0, 256, 256);
	x.strokeStyle = '#cfc4ab';
	x.lineWidth = 10;
	x.strokeRect(10, 10, 236, 236);
	x.fillStyle = '#262019';
	x.textAlign = 'center';
	x.textBaseline = 'middle';
	x.font = `900 ${legend.length > 1 ? 84 : 150}px system-ui, sans-serif`;
	x.fillText(legend, 128, 134);
	const t = createCanvasTexture(cv);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	return t;
}

// III · CMS Toolkit (left) — an open red toolbox on a slim workstand, tools
// standing proud of the tray: the "toolkit" that turned WordPress into a CMS.
function createToolboxStand() {
	const g = new THREE.Group();
	const red = propStdMat(0xb23b32, 0.5, 0.18);
	const redDark = propStdMat(0x8e2e27, 0.55, 0.18);
	const steel = propStdMat(0x9aa3ad, 0.4, 0.65);
	const steelDark = propStdMat(0x5b6472, 0.5, 0.5);
	const wood = propStdMat(0xc9a16a, 0.8);
	g.add(createPropBase(0.5));
	// Slim pedestal workstand.
	const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.74, 14), steelDark);
	leg.position.y = 0.47;
	g.add(leg);
	const top = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.06, 0.62), wood);
	top.position.y = 0.87;
	g.add(top);
	// Toolbox body with a darker rim and the lid hinged wide open at the back.
	const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.46), red);
	box.position.y = 1.05;
	g.add(box);
	const rim = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.045, 0.48), redDark);
	rim.position.y = 1.2;
	g.add(rim);
	const lid = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.42), red);
	lid.position.set(0, 1.36, -0.38);
	lid.rotation.x = -2.1;
	g.add(lid);
	const lidHandle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 10, 20, Math.PI), steel);
	lidHandle.position.set(0, 1.46, -0.46);
	lidHandle.rotation.x = -2.1;
	g.add(lidHandle);
	// Tools standing in the tray at easy-going angles: hammer, screwdriver, wrench.
	const hammerHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.6, 10), wood);
	hammerHandle.position.set(-0.32, 1.42, 0);
	hammerHandle.rotation.z = 0.24;
	g.add(hammerHandle);
	const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.1), steel);
	hammerHead.position.set(-0.39, 1.7, 0);
	hammerHead.rotation.z = 0.24;
	g.add(hammerHead);
	const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 10), steel);
	shaft.position.set(0.02, 1.45, 0.06);
	shaft.rotation.z = -0.12;
	g.add(shaft);
	const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 12), redDark);
	grip.position.set(0.06, 1.32, 0.06);
	grip.rotation.z = -0.12;
	g.add(grip);
	const wrench = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.03), steel);
	wrench.position.set(0.34, 1.42, -0.04);
	wrench.rotation.z = -0.3;
	g.add(wrench);
	// Open wrench jaw.
	const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.028, 10, 18, Math.PI * 1.3), steel);
	jaw.position.set(0.42, 1.66, -0.04);
	jaw.rotation.z = 1.9;
	g.add(jaw);
	const plate = createExhibitPlate('THE TOOLKIT', 'build anything');
	plate.position.set(0, 0.5, 0.5);
	g.add(plate);
	return g;
}

// III · CMS Toolkit (right) — one mother house feeding three satellite homes
// over golden lines: multisite (3.0), one install serving many sites.
function createMultisiteVillage() {
	const g = new THREE.Group();
	g.add(createPropBase(0.58));
	const platform = new THREE.Mesh(
		new THREE.CylinderGeometry(0.72, 0.72, 0.12, 28),
		propStdMat(0x7c8794, 0.7, 0.15)
	);
	platform.position.y = 0.16;
	g.add(platform);
	const ground = 0.22;
	const house = (x, z, w, h, wall, roofColor, rotation = 0) => {
		const home = new THREE.Group();
		home.position.set(x, ground, z);
		home.rotation.y = rotation;
		const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), propStdMat(wall, 0.7));
		body.position.y = h / 2;
		home.add(body);
		const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.88, w * 0.62, 4), propStdMat(roofColor, 0.7));
		roof.position.y = h + w * 0.31;
		roof.rotation.y = Math.PI / 4;
		home.add(roof);
		const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.24, h * 0.42, 0.02), propStdMat(0x4a3320, 0.8));
		door.position.set(0, h * 0.21, w / 2 + 0.005);
		home.add(door);
		for (const wx of [-w * 0.26, w * 0.26]) {
			const window = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, w * 0.2, 0.02), propStdMat(0xbfe0f5, 0.3, 0.4));
			window.position.set(wx, h * 0.68, w / 2 + 0.005);
			home.add(window);
		}
		g.add(home);
		return new THREE.Vector3(x, ground + h * 0.75, z);
	};
	// The big mother house (the install) and its three satellite sites. Built
	// tall so they rise clear above the MULTISITE plate in front.
	const mother = house(-0.08, -0.2, 0.48, 1.04, 0xf4ead0, 0xb23b32, 0.25);
	const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.26, 0.09), propStdMat(0x8e6a4a, 0.8));
	chimney.position.set(-0.26, ground + 1.18, -0.3);
	g.add(chimney);
	const sats = [
		house(0.42, 0.18, 0.26, 0.64, 0xd9b08c, 0x3a6ea5, -0.3),
		house(-0.5, 0.3, 0.24, 0.58, 0xbcd4c4, 0x7a5a1c, 0.5),
		house(0.34, -0.46, 0.24, 0.74, 0xe8d8b8, 0x5a7a52, 0.9),
	];
	const link = propStdMat(0xffd166, 0.4, 0.3);
	for (const sat of sats) {
		g.add(createCylinderBetween(mother, sat, 0.018, link, 6));
	}
	const plate = createExhibitPlate('MULTISITE', 'one install, many sites');
	plate.position.set(0, 0.5, 0.78);
	g.add(plate);
	return g;
}

// IV · Modern Admin (left) — a big smiley emoji (WordPress 4.2 added emoji).
function createEmojiStatue() {
	const g = new THREE.Group();
	g.add(createPropBase(0.44));
	const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.95, 20), propStdMat(0xf8efd9, 0.7));
	pedestal.position.y = 0.55;
	g.add(pedestal);
	const face = new THREE.Mesh(new THREE.SphereGeometry(0.55, 28, 22), propStdMat(0xffd23f, 0.5));
	face.position.y = 1.6;
	g.add(face);
	const eyeMat = propStdMat(0x2a1808, 0.6);
	for (const x of [-0.2, 0.2]) {
		const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 12), eyeMat);
		eye.position.set(x, 1.72, 0.46);
		g.add(eye);
	}
	const smile = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.045, 12, 24, Math.PI), eyeMat);
	smile.position.set(0, 1.5, 0.46);
	smile.rotation.z = Math.PI;
	g.add(smile);
	const plate = createExhibitPlate('EMOJI', 'shipped in WordPress 4.2');
	plate.position.set(0, 0.5, 0.5);
	g.add(plate);
	return g;
}

// IV · Modern Admin (right) — the same flat MP6 admin on nested screens (3.8's
// responsive redesign: one site, every screen).
function createResponsiveTotem() {
	const g = new THREE.Group();
	const frame = propStdMat(0x23282d, 0.5, 0.3);
	const screen = propStdMat(0x2271b1, 0.4);
	g.add(createPropBase(0.42));
	const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.0, 12), propStdMat(0x6b7280, 0.5, 0.5));
	post.position.y = 1.0;
	g.add(post);
	const devices = [[0.92, 0.62, 0.62], [0.6, 0.42, 1.26], [0.32, 0.5, 1.86]];
	devices.forEach(([w, h, y]) => {
		const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), frame);
		body.position.set(0, y, 0.12);
		g.add(body);
		const scr = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.84, h * 0.78), screen);
		scr.position.set(0, y, 0.16);
		g.add(scr);
	});
	const plate = createExhibitPlate('RESPONSIVE', 'one site, every screen');
	plate.position.set(0, 0.4, 0.5);
	g.add(plate);
	return g;
}

// V · API & Customizer (left) — an operator's patch panel routing JSON between
// REST endpoints (4.7's REST API content endpoints).
// V · API & Customizer (left prominent spot) — the Customizer palette promoted
// from its wall vignette: a weighted base and a museum plate, full scale.
function createCustomizerProminent(color, secondary) {
	const g = new THREE.Group();
	g.add(createPropBase(0.46));
	const palette = createCustomizerPalette(color, secondary);
	palette.position.y = 0.1;
	// The palette board tips its face toward local -z; the prominent-prop
	// convention fronts +z, so turn it round to face the entry.
	palette.rotation.y = Math.PI;
	g.add(palette);
	const plate = createExhibitPlate('CUSTOMIZER', 'live preview · paint your site');
	plate.position.set(0, 0.45, 0.5);
	g.add(plate);
	return g;
}

// V · API & Customizer (right) — a literal park bench (REST: a place to rest, and
// REpresentational State Transfer).
function createRestBench() {
	const g = new THREE.Group();
	const wood = propStdMat(0x6b4423, 0.85);
	const iron = propStdMat(0x2b2b30, 0.5, 0.5);
	const seatY = 0.46;
	for (let i = 0; i < 3; i++) {
		const slat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.13), wood);
		slat.position.set(0, seatY, -0.18 + i * 0.16);
		g.add(slat);
	}
	for (let i = 0; i < 3; i++) {
		const slat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.05), wood);
		slat.position.set(0, 0.7 + i * 0.17, -0.32);
		g.add(slat);
	}
	for (const x of [-0.66, 0.66]) {
		const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, seatY, 0.5), iron);
		leg.position.set(x, seatY / 2, -0.05);
		g.add(leg);
		const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.06), iron);
		back.position.set(x, 0.75, -0.32);
		g.add(back);
		const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), wood);
		arm.position.set(x, seatY + 0.28, -0.05);
		g.add(arm);
	}
	const plate = createExhibitPlate('REST', 'representational state transfer');
	plate.position.set(0, 1.02, 0.36);
	g.add(plate);
	return g;
}

// VII · Blocks Everywhere (left) — a little house built from blocks (Full Site
// Editing, 5.9: assemble the whole site out of blocks).
function createBlockHouse() {
	const g = new THREE.Group();
	const pal = activeVariant.eraColors;
	const cube = (i) => propStdMat(pal[i % pal.length], 0.5);
	g.add(createPropBase(0.5));
	const u = 0.32;
	let idx = 0;
	for (let level = 0; level < 2; level++) {
		for (const dx of [-u / 2, u / 2]) {
			for (const dz of [-u / 2, u / 2]) {
				const block = new THREE.Mesh(new THREE.BoxGeometry(u * 0.98, u * 0.98, u * 0.98), cube(idx++));
				block.position.set(dx, 0.2 + u / 2 + level * u, dz);
				g.add(block);
			}
		}
	}
	const door = new THREE.Mesh(new THREE.BoxGeometry(u * 0.5, u * 0.8, 0.03), propStdMat(0x2a1808, 0.6));
	door.position.set(0, 0.2 + u * 0.4, u + 0.01);
	g.add(door);
	const roof = new THREE.Mesh(new THREE.ConeGeometry(u * 1.05, u * 0.9, 4), cube(idx++));
	roof.position.set(0, 0.2 + 2 * u + u * 0.45, 0);
	roof.rotation.y = Math.PI / 4;
	g.add(roof);
	const plate = createExhibitPlate('FULL SITE EDITING', 'the whole site is blocks');
	plate.position.set(0, 0.5, 0.66);
	g.add(plate);
	return g;
}

// VII · Blocks Everywhere (right) — a glowing "/" monolith (type "/" to insert a
// block; echoes the room's "/ to add a block" sign).
function createSlashMonolith() {
	const g = new THREE.Group();
	g.add(createPropBase(0.44));
	const slab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.1, 0.18), propStdMat(0x1c1306, 0.5));
	slab.position.set(0, 1.2, 0);
	slab.rotation.z = 0.42;
	g.add(slab);
	const glow = new THREE.Mesh(
		new THREE.BoxGeometry(0.24, 1.9, 0.05),
		new THREE.MeshStandardMaterial({ color: 0x6ddcff, emissive: 0x2bb7ff, emissiveIntensity: 0.7, roughness: 0.4 })
	);
	glow.position.set(0, 1.2, 0.1);
	glow.rotation.z = 0.42;
	g.add(glow);
	const plate = createExhibitPlate('/ INSERT', 'type / to add a block');
	plate.position.set(0, 0.5, 0.5);
	g.add(plate);
	return g;
}

// A procedural 15th–18th c. screw printing press: oak frame, central iron screw
// with a turning bar, a flat bed/platen, a printed sheet, and a plaque tying the
// Gutenberg block-editor pun together. Modelled facing local +z.
function createPrintingPress(color) {
	const group = new THREE.Group();
	const oak = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.82 });
	const oakDark = new THREE.MeshStandardMaterial({ color: 0x4a2f18, roughness: 0.85 });
	const iron = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.5, metalness: 0.6 });
	const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3a, roughness: 0.42, metalness: 0.55 });

	// Footprint: ~1.4 wide x ~0.9 deep.
	const beam = (w, h, d, material, x, y, z) => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
		mesh.position.set(x, y, z);
		group.add(mesh);
		return mesh;
	};

	// Base sill and two uprights forming the heavy frame.
	beam(1.34, 0.16, 0.72, oakDark, 0, 0.08, 0);
	for (const x of [-0.52, 0.52]) {
		beam(0.18, 1.84, 0.2, oak, x, 0.92, -0.2);
		beam(0.18, 1.84, 0.2, oak, x, 0.92, 0.22);
	}
	// Top head beam and a mid cross beam carrying the screw.
	beam(1.34, 0.2, 0.7, oak, 0, 1.78, 0);
	const headY = 1.34;
	beam(1.34, 0.18, 0.62, oak, 0, headY, 0);

	// Central iron screw descending from the head beam to the platen.
	const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.6, 12), iron);
	screw.position.set(0, headY - 0.34, 0);
	group.add(screw);
	for (let index = 0; index < 7; index++) {
		const thread = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 6, 14), brass);
		thread.rotation.x = Math.PI / 2;
		thread.position.set(0, headY - 0.1 - index * 0.075, 0);
		group.add(thread);
	}
	// Horizontal turning bar through the screw head, with rounded grips.
	const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 10), iron);
	bar.rotation.z = Math.PI / 2;
	bar.position.set(0, headY + 0.12, 0.12);
	group.add(bar);
	for (const x of [-0.72, 0.72]) {
		const grip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), oakDark);
		grip.position.set(x, headY + 0.12, 0.12);
		group.add(grip);
	}

	// The platen (pressing plate) hung under the screw, raised to peek below the head.
	const platen = beam(0.78, 0.1, 0.46, oakDark, 0, headY - 0.5, 0);
	platen.castShadow = false;

	// Flat bed/coffin on its rails, dressed with a printed sheet, set toward +z.
	beam(0.9, 0.12, 0.5, oak, 0, 0.84, 0.12);
	const sheet = new THREE.Mesh(
		new THREE.PlaneGeometry(0.58, 0.4),
		new THREE.MeshStandardMaterial({ color: 0xf4ead0, roughness: 0.9, side: THREE.DoubleSide })
	);
	sheet.rotation.x = -Math.PI / 2;
	sheet.position.set(0, 0.905, 0.12);
	group.add(sheet);
	const inkRail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), iron);
	inkRail.position.set(0, 0.93, -0.16);
	group.add(inkRail);

	// Angled museum placard at the front of the bed, tilted up toward a standing
	// viewer so the Gutenberg pun reads clearly; kept within the press footprint.
	const plaque = createReadableLabel(createPrintingPressPlaqueTexture(color), 1.1, 0.48);
	plaque.position.set(0, 0.54, 0.40);
	plaque.rotation.x = -0.52;
	group.add(plaque);
	for (const x of [-0.5, 0.5]) {
		const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 8), iron);
		leg.position.set(x, 0.33, 0.36);
		group.add(leg);
	}

	return group;
}

function createPrintingPressPlaqueTexture(color) {
	const canvas = document.createElement('canvas');
	canvas.width = 768;
	canvas.height = 330;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff5df';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	const accent = `#${new THREE.Color(color).getHexString()}`;
	ctx.fillStyle = accent;
	ctx.fillRect(0, 0, canvas.width, 24);
	ctx.fillRect(0, canvas.height - 24, canvas.width, 24);

	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	// Title — large, heavy and letter-spaced, in near-black for high contrast so it
	// stays legible from across the room and at the placard's backward tilt.
	ctx.fillStyle = '#140d06';
	ctx.font = '900 84px Georgia, "Times New Roman", serif';
	if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
	ctx.fillText('GUTENBERG', canvas.width / 2, 84);
	if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

	ctx.fillStyle = '#3a2c14';
	ctx.font = '400 33px Georgia, serif';
	wrapText(ctx, 'Johannes Gutenberg, movable type, c. 1440 → the block editor, 2018.', canvas.width / 2, 158, canvas.width - 72, 42, 2);

	ctx.fillStyle = accent;
	ctx.font = '700 36px Georgia, serif';
	ctx.fillText('Movable type, meet movable blocks.', canvas.width / 2, 274);

	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 8;
	return texture;
}

// A framed "what the web looked like then" poster — a period-styled browser
// mock-up — on the solid side wall of a mural-adjacent gallery (the only rooms
// with a side wall free of a shared doorway), in the front segment clear of the
// back-segment exhibits.
function createWebEraPoster(room) {
	const group = new THREE.Group();
	let side;
	if (!room.connectLeft) {
		side = 'left';
	} else if (!room.connectRight) {
		side = 'right';
	} else {
		return group;
	}
	// In the current variant the free side wall of the two mural-flanking galleries
	// now carries the shop-passage doorway, so this period poster is rehomed inside
	// that passage by createShopGalleryPassages instead of mounting here.
	if (isCurrentVariant && hasShopPassage(room)) {
		return group;
	}
	const inner = createWebEraPosterPanel(room.era);
	// Inset 0.15 stands the frame proud of the angled wall (the 0.08-deep frame
	// tucks into the 0.26-thick wall while the picture clears its inner face by
	// ~0.05); a shallower inset buries the flat art inside the wall. Centred at
	// eraPanelY so it aligns with the other framed pictures (it stays portrait).
	placeOnSideWall(inner, side, -2.5, eraPanelY, 0.15);
	group.add(inner);
	return group;
}

// The framed "what the web looked like then" poster as a self-contained panel
// whose art faces +z; callers place/orient it. Shared by the gallery side-wall
// mount and the shop passage that replaced it.
function createWebEraPosterPanel(era) {
	const posterW = 1.24;
	const posterH = 1.62;
	const frameMat = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.08,
		roughness: 0.34,
		metalness: 0.46,
	});
	const inner = new THREE.Group();
	const frame = new THREE.Mesh(new THREE.BoxGeometry(posterW + 0.16, posterH + 0.16, 0.08), frameMat);
	frame.position.z = -0.02;
	inner.add(frame);
	const art = new THREE.Mesh(
		new THREE.PlaneGeometry(posterW, posterH),
		new THREE.MeshBasicMaterial({ map: createWebEraPosterTexture(era), side: THREE.DoubleSide })
	);
	art.position.z = 0.05;
	inner.add(art);
	return inner;
}

// True for the two mural-flanking galleries (eras[0] and eras[6]) whose free
// shop-facing side wall is bridged to the gift shop by a walkable passage.
function hasShopPassage(room) {
	return room.era === eras[0] || room.era === eras[eras.length - 1];
}

// The local side ('left'/'right') of a passage gallery's shop-facing wall: the
// one without a shared connector doorway (it borders the mural wedge / shop).
function shopPassageWallSide(room) {
	return room.connectLeft ? 'right' : 'left';
}

function createWebEraPosterTexture(era) {
	const canvas = document.createElement('canvas');
	canvas.width = 540;
	canvas.height = 680;
	const ctx = canvas.getContext('2d');
	const spec = {
		'Blogging Roots': { year: '2004', heading: 'THE WEB IN 2004', chrome: 'ie', bg: '#5b7fb4', note: 'tables, visitor counters & “Web 1.5”' },
		'Dashboard Foundations': { year: '2007', heading: 'THE WEB IN 2007', chrome: 'firefox', bg: 'web2', note: 'Web 2.0 — gloss, reflections & beta badges' },
		'CMS Toolkit': { year: '2011', heading: 'THE WEB IN 2011', chrome: 'safari', bg: 'skeuo', note: 'skeuomorphism & the responsive turn' },
		'Modern Admin': { year: '2014', heading: 'THE WEB IN 2014', chrome: 'chrome', bg: 'flat', note: 'flat design & bold colour' },
		'API and Customizer': { year: '2016', heading: 'THE WEB IN 2016', chrome: 'chrome', bg: 'material', note: 'cards, Material & the mobile-first web' },
		'Block Editor': { year: '2018', heading: 'THE WEB IN 2018', chrome: 'chrome', bg: 'minimal', note: 'big type, whitespace & block layouts' },
		'Blocks Everywhere': { year: '2022', heading: 'THE WEB IN 2022', chrome: 'modern', bg: 'darkmode', note: 'system fonts, dark mode & full-site editing' },
	}[era] || { year: '20XX', heading: 'THE WEB', chrome: 'chrome', bg: '#444', note: '' };

	// Paper backing.
	ctx.fillStyle = '#10131c';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#f4ead0';
	ctx.fillRect(24, 24, canvas.width - 48, canvas.height - 48);

	ctx.fillStyle = '#241a0c';
	ctx.font = '900 38px Georgia, serif';
	ctx.textAlign = 'center';
	ctx.fillText(spec.heading, canvas.width / 2, 76);

	// Browser window.
	const bx = 48;
	const by = 110;
	const bw = canvas.width - 96;
	const bh = 420;
	drawBrowserChrome(ctx, bx, by, bw, bh, spec.chrome);
	const cy = by + 46;
	const ch = bh - 46;
	drawEraPage(ctx, bx, cy, bw, ch, spec.bg);

	ctx.fillStyle = '#3a2c14';
	ctx.font = 'italic 24px Georgia, serif';
	ctx.fillText(spec.note, canvas.width / 2, by + bh + 56);
	ctx.fillStyle = '#9a7a3a';
	ctx.font = '700 20px ui-monospace, Menlo, monospace';
	ctx.fillText('webdesignmuseum.org', canvas.width / 2, canvas.height - 48);

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// A "Web of 2004" nostalgia display for the Blogging Roots gallery. The side
// walls are packed with release exhibits, so the two framed boards take the free
// front-wall corner bays flanking the entrance (clear of the existing era panels
// at x=±3.95) and the PHP ElePHPant tucks into the back-left wall corner.
function addWebOf2004Display(group) {
	const frontWallZ = -roomDepth / 2 + wallThickness / 2 + 0.05;
	// Outer boards sit at ±5.78 and the inner panels at ±3.88 so each pair keeps a
	// ~0.12m gap (their gold frames previously touched / z-fought at the seam)
	// while the outer frames still clear the side-wall corner.
	// The Link Buttons board moved to the left side wall (see the Blogging Roots
	// block); the Browser Wars panel is now centred on the wall right of the portal.
	addLocal(group, createBrowserWarsPanel(), 4.87, frontWallZ);
}

// (A) A framed board of period 88x31 web "badge" buttons in a tidy grid, drawn
// crisp on a high-resolution canvas with the classic chiseled-bevel look. Built
// as a front-wall plaque (art faces +z, into the room) sized for the corner bay.
function createLinkButtonBoard() {
	const group = new THREE.Group();
	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(eraPanelArtW + 0.16, eraPanelArtH + 0.16, 0.08),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	group.add(frame);
	const art = new THREE.Mesh(
		new THREE.PlaneGeometry(eraPanelArtW, eraPanelArtH),
		new THREE.MeshBasicMaterial({ map: createLinkButtonBoardTexture() })
	);
	art.position.z = 0.05;
	group.add(art);
	return group;
}

function createLinkButtonBoardTexture() {
	// Integer-scaled cells keep the 88x31 buttons pixel-crisp: a 4px-wide
	// "device pixel" gives each button a true 352x124 cell on the canvas.
	const px = 4;
	const cols = 3;
	const rows = 5;
	const cellW = 88 * px; // 352
	const cellH = 31 * px; // 124
	const gapX = 24;
	const gapY = 22;
	const padX = 40;
	const headerH = 132;
	const padBottom = 40;
	const canvas = document.createElement('canvas');
	canvas.width = padX * 2 + cols * cellW + (cols - 1) * gapX;
	canvas.height = headerH + rows * cellH + (rows - 1) * gapY + padBottom;
	const ctx = canvas.getContext('2d');

	// Cream matte backing with a thin inner keyline.
	ctx.fillStyle = '#1a1208';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#f4ead0';
	ctx.fillRect(16, 16, canvas.width - 32, canvas.height - 32);

	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#241a0c';
	ctx.font = '900 64px Arial Black, Impact, sans-serif';
	ctx.fillText('LINK BUTTONS', canvas.width / 2, 60);
	ctx.fillStyle = '#9a7a3a';
	ctx.font = '700 26px ui-monospace, Menlo, monospace';
	ctx.fillText('88 × 31 · the currency of the early web', canvas.width / 2, 102);

	const buttons = [
		{ kind: 'gradient', a: '#0a0a3c', b: '#3a3aff', text: 'Netscape Now!', fg: '#ffffff' },
		{ kind: 'split', a: '#cc0000', b: '#000000', text: 'Get Firefox', fg: '#ffffff' },
		{ kind: 'plain', a: '#c0c0c0', text: 'Made with Notepad', fg: '#000080' },
		{ kind: 'badge', a: '#3366cc', text: 'Valid HTML 4.01', fg: '#ffffff' },
		{ kind: 'badge', a: '#5599cc', text: 'Valid CSS', fg: '#ffffff' },
		{ kind: 'php', a: '#777bb3', text: 'Powered by PHP', fg: '#ffffff' },
		{ kind: 'plain', a: '#e48d00', text: 'Powered by MySQL', fg: '#0a2a4a' },
		{ kind: 'plain', a: '#c0c0c0', text: 'Powered by Apache', fg: '#900000' },
		{ kind: 'split', a: '#ff6600', b: '#ffffff', text: 'XML', fg: '#ffffff', sub: 'RSS feed' },
		{ kind: 'plain', a: '#000080', text: 'Best viewed in 800×600', fg: '#ffffff' },
		{ kind: 'plain', a: '#000000', text: 'Lynx friendly', fg: '#00ff00' },
		{ kind: 'wp', a: '#21759b', text: 'WordPress', fg: '#ffffff' },
		{ kind: 'badge', a: '#0a3a6b', text: 'W3C', fg: '#ffffff', sub: 'standards' },
		{ kind: 'split', a: '#1f50a8', b: '#ffd200', text: 'Internet Explorer', fg: '#ffffff' },
		{ kind: 'plain', a: '#660099', text: 'Any Browser', fg: '#ffff66' },
	];

	buttons.forEach((btn, i) => {
		const col = i % cols;
		const row = Math.floor(i / cols);
		const x = padX + col * (cellW + gapX);
		const y = headerH + row * (cellH + gapY);
		draw88x31Button(ctx, x, y, cellW, cellH, btn);
	});

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// Draws a single 88x31-proportioned button with the chiseled two-tone bevel
// that defined the genre: a light top/left edge and a dark bottom/right edge.
function draw88x31Button(ctx, x, y, w, h, btn) {
	// Fill / background variants.
	if (btn.kind === 'gradient') {
		const g = ctx.createLinearGradient(x, y, x + w, y);
		g.addColorStop(0, btn.a);
		g.addColorStop(1, btn.b);
		ctx.fillStyle = g;
		ctx.fillRect(x, y, w, h);
	} else if (btn.kind === 'split' || btn.kind === 'php' || btn.kind === 'wp' || btn.kind === 'badge') {
		ctx.fillStyle = btn.kind === 'split' ? btn.b : btn.a;
		ctx.fillRect(x, y, w, h);
		ctx.fillStyle = btn.a;
		ctx.fillRect(x, y, Math.round(w * 0.36), h);
	} else {
		ctx.fillStyle = btn.a;
		ctx.fillRect(x, y, w, h);
	}

	// Chiseled bevel: bright NW edge, dark SE edge.
	const t = 4;
	ctx.fillStyle = 'rgba(255,255,255,0.55)';
	ctx.fillRect(x, y, w, t);
	ctx.fillRect(x, y, t, h);
	ctx.fillStyle = 'rgba(0,0,0,0.45)';
	ctx.fillRect(x, y + h - t, w, t);
	ctx.fillRect(x + w - t, y, t, h);

	// Left "icon" zone glyph for the badge-style buttons.
	const iconCx = x + Math.round(w * 0.18);
	const iconCy = y + h / 2;
	if (btn.kind === 'php') {
		ctx.fillStyle = '#ffffff';
		ctx.font = 'italic 900 44px Georgia, serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('php', iconCx, iconCy + 2);
	} else if (btn.kind === 'wp') {
		ctx.fillStyle = '#ffffff';
		ctx.font = '900 56px Georgia, serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('W', iconCx, iconCy + 2);
	} else if (btn.kind === 'badge') {
		ctx.fillStyle = '#ffffff';
		ctx.font = '900 40px Arial Black, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('✓', iconCx, iconCy + 2);
	}

	// Label text on the right (or centered for plain buttons), pixel-sharp.
	const hasIcon = btn.kind === 'php' || btn.kind === 'wp' || btn.kind === 'badge';
	const textX = hasIcon ? x + Math.round(w * 0.38) : x + t + 8;
	const textRight = x + w - t - 8;
	const maxTextW = textRight - textX;
	ctx.fillStyle = btn.fg;
	ctx.textAlign = 'left';
	if (btn.sub) {
		ctx.textBaseline = 'alphabetic';
		fillFittedCanvasText(ctx, btn.text, textX, y + Math.round(h * 0.48), maxTextW, 36, '900', 'Arial, sans-serif');
		ctx.font = '700 22px Arial, sans-serif';
		ctx.fillText(btn.sub, textX, y + Math.round(h * 0.78));
	} else {
		ctx.textBaseline = 'middle';
		fillFittedCanvasText(ctx, btn.text, textX, iconCy + 2, maxTextW, 36, '700', 'Arial, sans-serif');
	}
	ctx.textAlign = 'center';
}

// (B) A framed panel charting the 2003–2005 browser landscape with clean,
// canvas-drawn logos for IE6, Netscape, Firefox and Opera. Front-wall plaque
// (art faces +z, into the room) sized for the opposite corner bay.
function createBrowserWarsPanel() {
	const group = new THREE.Group();
	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(eraPanelArtW + 0.16, eraPanelArtH + 0.16, 0.08),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	frame.position.set(0, eraPanelY, 0);
	group.add(frame);
	const art = new THREE.Mesh(
		new THREE.PlaneGeometry(eraPanelArtW, eraPanelArtH),
		new THREE.MeshBasicMaterial({ map: createBrowserWarsTexture() })
	);
	art.position.set(0, eraPanelY, 0.05);
	group.add(art);
	return group;
}

function createBrowserWarsTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 760;
	canvas.height = 516;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#10131c';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#f4ead0';
	ctx.fillRect(16, 16, canvas.width - 32, canvas.height - 32);

	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#241a0c';
	fillFittedCanvasText(ctx, 'THE BROWSER WARS · 2004', canvas.width / 2, 60, canvas.width - 80, 48, '900', 'Arial Black, Impact, sans-serif');

	const cells = [
		{ logo: drawIELogo, name: 'Internet Explorer 6', note: '~90% share' },
		{ logo: drawNetscapeLogo, name: 'Netscape Navigator', note: 'the fading pioneer' },
		{ logo: drawFirefoxLogo, name: 'Mozilla Firefox', note: 'new in 2004' },
		{ logo: drawOperaLogo, name: 'Opera', note: 'the standards keeper' },
	];
	const cols = 2;
	const cellW = (canvas.width - 64) / cols;
	const cellH = 184;
	const top = 108;
	const logoR = 52;
	cells.forEach((cell, i) => {
		const col = i % cols;
		const row = Math.floor(i / cols);
		const cx = 32 + col * cellW + cellW / 2;
		const cy = top + row * cellH;
		cell.logo(ctx, cx, cy, logoR);
		ctx.fillStyle = '#241a0c';
		ctx.font = '800 26px Arial, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(cell.name, cx, cy + logoR + 26);
		ctx.fillStyle = '#7a6534';
		ctx.font = 'italic 20px Georgia, serif';
		ctx.fillText(cell.note, cx, cy + logoR + 52);
	});

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// Internet Explorer: a deep-blue lowercase "e" with a tilted gold orbit band.
function drawIELogo(ctx, cx, cy, r) {
	ctx.save();
	ctx.fillStyle = '#0c63b8';
	ctx.font = '900 ' + Math.round(r * 2.15) + 'px Georgia, "Times New Roman", serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('e', cx, cy + r * 0.06);
	ctx.restore();
	// Gold orbit band, tilted and squashed, crossing in front of the "e".
	ctx.save();
	ctx.translate(cx, cy - r * 0.06);
	ctx.rotate(-0.42);
	ctx.scale(1, 0.34);
	ctx.lineWidth = r * 0.2;
	ctx.strokeStyle = '#f3c111';
	ctx.beginPath();
	ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2);
	ctx.stroke();
	ctx.restore();
}

// Netscape: the big green→blue "N" planted on a starry horizon, dark-sky disc.
function drawNetscapeLogo(ctx, cx, cy, r) {
	const sky = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
	sky.addColorStop(0, '#0c2142');
	sky.addColorStop(1, '#02060e');
	ctx.fillStyle = sky;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
	// Scattered stars.
	ctx.fillStyle = 'rgba(255,255,255,0.85)';
	for (const [sx, sy, ss] of [[-0.52, -0.5, 1.7], [0.42, -0.58, 1.3], [0.6, -0.18, 1.0], [-0.64, -0.05, 1.0], [0.12, -0.66, 1.1]]) {
		ctx.beginPath();
		ctx.arc(cx + sx * r, cy + sy * r, ss, 0, Math.PI * 2);
		ctx.fill();
	}
	// The "N" in the classic green-to-blue gradient.
	const ng = ctx.createLinearGradient(cx - r * 0.5, cy - r * 0.6, cx + r * 0.5, cy + r * 0.6);
	ng.addColorStop(0, '#86df57');
	ng.addColorStop(0.5, '#27a5e6');
	ng.addColorStop(1, '#0a52a6');
	ctx.fillStyle = ng;
	ctx.font = '900 ' + Math.round(r * 1.72) + 'px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('N', cx, cy + r * 0.12);
	// Curved horizon the "N" stands on.
	ctx.strokeStyle = 'rgba(120,200,255,0.7)';
	ctx.lineWidth = r * 0.1;
	ctx.beginPath();
	ctx.arc(cx, cy + r * 1.4, r * 1.55, Math.PI * 1.22, Math.PI * 1.78);
	ctx.stroke();
}

// Firefox: an orange-to-red fox flame sweeping clockwise around a blue globe.
function drawFirefoxLogo(ctx, cx, cy, r) {
	const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.2, cx, cy, r);
	g.addColorStop(0, '#aae2ff');
	g.addColorStop(1, '#1b4f9c');
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
	ctx.fill();
	// A couple of faint globe lines.
	ctx.strokeStyle = 'rgba(255,255,255,0.28)';
	ctx.lineWidth = r * 0.04;
	ctx.beginPath();
	ctx.ellipse(cx, cy, r * 0.42, r * 0.9, 0, 0, Math.PI * 2);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(cx - r * 0.88, cy);
	ctx.lineTo(cx + r * 0.88, cy);
	ctx.stroke();
	// Fox: a flame tail curling around the top and right of the globe.
	const fg = ctx.createLinearGradient(cx - r * 0.4, cy - r * 1.1, cx + r * 1.1, cy + r * 0.8);
	fg.addColorStop(0, '#ffd23f');
	fg.addColorStop(0.5, '#ff7a18');
	fg.addColorStop(1, '#e23119');
	ctx.fillStyle = fg;
	ctx.beginPath();
	ctx.moveTo(cx - r * 0.28, cy - r * 1.02);                                  // pointed snout, upper-left
	ctx.quadraticCurveTo(cx + r * 1.18, cy - r * 1.05, cx + r * 1.22, cy + r * 0.12); // sweep over the top to the right
	ctx.quadraticCurveTo(cx + r * 1.24, cy + r * 1.05, cx + r * 0.16, cy + r * 1.2);  // tail curling down
	ctx.quadraticCurveTo(cx + r * 0.98, cy + r * 0.55, cx + r * 0.74, cy - r * 0.18); // inner edge back up
	ctx.quadraticCurveTo(cx + r * 0.55, cy - r * 0.78, cx + r * 0.05, cy - r * 0.74); // inner toward the snout
	ctx.quadraticCurveTo(cx - r * 0.05, cy - r * 1.0, cx - r * 0.28, cy - r * 1.02);  // close at the snout
	ctx.closePath();
	ctx.fill();
}

// Opera: a clean bold red "O".
function drawOperaLogo(ctx, cx, cy, r) {
	const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
	g.addColorStop(0, '#f23a2f');
	g.addColorStop(1, '#b3120f');
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.ellipse(cx, cy, r * 0.78, r * 0.98, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#f4ead0';
	ctx.beginPath();
	ctx.ellipse(cx, cy, r * 0.33, r * 0.54, 0, 0, Math.PI * 2);
	ctx.fill();
}

// (C) A PHP ElePHPant on a freestanding labeled plinth in the open back-left of
// the gallery, with a front-facing "Powered by PHP" badge on a low backboard so
// it reads clearly from the runner regardless of viewing angle. The plinth front
// (local −z, where the label and badge face) is turned toward the room interior.
// (D) A "Please sign our guestbook!" lectern just inside the entrance, offset to
// the left of the central runner so an arriving visitor passes it naturally. It
// sits clear of the door opening, the front-wall props and the side-wall radio.
function addGuestbookLectern(group) {
	const lectern = createGuestbookLectern();
	// Angled to face a visitor coming in through the centre doorway.
	addLocal(group, lectern, -3.2, -6.3, 0.5);
}

// A slim oak lectern: a square post on a stepped base carrying a slanted desk
// top with an open guestbook, a quill in an inkpot, and a small upright placard.
function createGuestbookLectern() {
	const group = new THREE.Group();
	const oak = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.62, metalness: 0.05 });
	const oakDark = new THREE.MeshStandardMaterial({ color: 0x6f4420, roughness: 0.64 });

	const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.5), oakDark);
	base.position.y = 0.035;
	group.add(base);
	const step = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.36), oak);
	step.position.y = 0.095;
	group.add(step);

	const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.16), oak);
	post.position.y = 0.51;
	group.add(post);

	// Slanted desk top, tilted toward the approaching visitor (local −z front).
	const top = new THREE.Group();
	top.position.set(0, 0.96, 0);
	top.rotation.x = 0.42;
	group.add(top);
	const slab = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.44), oak);
	top.add(slab);
	const lip = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.04), oakDark);
	lip.position.set(0, 0.03, 0.2);
	top.add(lip);

	// Open guestbook: two canvas pages on a thin board, lying on the slab.
	const book = new THREE.Mesh(
		new THREE.PlaneGeometry(0.56, 0.38),
		new THREE.MeshBasicMaterial({ map: createGuestbookPagesTexture(), side: THREE.DoubleSide })
	);
	book.rotation.x = -Math.PI / 2;
	book.position.set(0, 0.028, -0.01);
	top.add(book);
	const spine = new THREE.Mesh(
		new THREE.BoxGeometry(0.025, 0.04, 0.4),
		new THREE.MeshStandardMaterial({ color: 0x7a1f2b, roughness: 0.5 })
	);
	spine.position.set(0, 0.03, -0.01);
	top.add(spine);

	// Quill resting across the right-hand page, with a small inkpot.
	const quill = new THREE.Mesh(
		new THREE.CylinderGeometry(0.004, 0.012, 0.3, 8),
		new THREE.MeshStandardMaterial({ color: 0xf3ead2, roughness: 0.6 })
	);
	quill.position.set(0.16, 0.05, 0.02);
	quill.rotation.set(Math.PI / 2, 0, -0.5);
	top.add(quill);
	const inkpot = new THREE.Mesh(
		new THREE.CylinderGeometry(0.035, 0.045, 0.06, 14),
		new THREE.MeshStandardMaterial({ color: 0x14213a, roughness: 0.3, metalness: 0.2 })
	);
	inkpot.position.set(0.22, 0.05, 0.16);
	top.add(inkpot);

	// Upright brass-framed placard on the post, facing the visitor.
	const placard = new THREE.Group();
	const placardFrame = new THREE.Mesh(
		new THREE.BoxGeometry(0.56, 0.2, 0.04),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	placard.add(placardFrame);
	const placardArt = new THREE.Mesh(
		new THREE.PlaneGeometry(0.5, 0.15),
		new THREE.MeshBasicMaterial({ map: createGuestbookPlacardTexture() })
	);
	placardArt.position.z = 0.024;
	placard.add(placardArt);
	placard.position.set(0, 0.66, -0.11);
	placard.rotation.x = 0.18;
	group.add(placard);

	return group;
}

function createGuestbookPagesTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 768;
	canvas.height = 520;
	const ctx = canvas.getContext('2d');

	// Two cream pages with a centre gutter shadow and faint ruled lines.
	ctx.fillStyle = '#efe4c6';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#fbf3df';
	ctx.fillRect(10, 10, canvas.width - 20, canvas.height - 20);
	const gutter = ctx.createLinearGradient(canvas.width / 2 - 26, 0, canvas.width / 2 + 26, 0);
	gutter.addColorStop(0, 'rgba(120,90,40,0)');
	gutter.addColorStop(0.5, 'rgba(120,90,40,0.28)');
	gutter.addColorStop(1, 'rgba(120,90,40,0)');
	ctx.fillStyle = gutter;
	ctx.fillRect(canvas.width / 2 - 26, 10, 52, canvas.height - 20);

	ctx.strokeStyle = 'rgba(90,120,160,0.28)';
	ctx.lineWidth = 1;
	for (let y = 150; y < canvas.height - 30; y += 46) {
		ctx.beginPath();
		ctx.moveTo(34, y);
		ctx.lineTo(canvas.width / 2 - 34, y);
		ctx.moveTo(canvas.width / 2 + 34, y);
		ctx.lineTo(canvas.width - 34, y);
		ctx.stroke();
	}

	ctx.textBaseline = 'alphabetic';
	ctx.textAlign = 'center';
	ctx.fillStyle = '#5a3a1a';
	ctx.font = '900 46px Georgia, serif';
	ctx.fillText('Guestbook', canvas.width / 4, 70);
	ctx.font = 'italic 24px Georgia, serif';
	ctx.fillStyle = '#8a6a3a';
	ctx.fillText('Sign in — say hi!', canvas.width / 4, 104);

	// Handwritten-style entries in cursive across both pages.
	const ink = '#274472';
	const cursive = '"Comic Sans MS", "Segoe Script", "Bradley Hand", cursive';
	ctx.textAlign = 'left';
	const entries = [
		{ name: 'webmaster_jen', msg: 'cool site!! :-)', date: '03/14/2004' },
		{ name: '~mike_z~', msg: 'kept it real, A+ blog', date: '04/02/2004' },
		{ name: 'SK8erBoi98', msg: 'sign mine 2! ^_^', date: '05/19/2004' },
		{ name: 'Aunt Carol', msg: 'love the new homepage dear', date: '06/07/2004' },
	];
	entries.forEach((e, i) => {
		const col = i < 2 ? 0 : 1;
		const row = i % 2;
		const x = col === 0 ? 40 : canvas.width / 2 + 40;
		const y = 168 + row * 168;
		ctx.fillStyle = ink;
		ctx.font = `28px ${cursive}`;
		ctx.fillText(e.name, x, y);
		ctx.font = `italic 30px ${cursive}`;
		ctx.fillText(e.msg, x + 6, y + 42);
		ctx.fillStyle = '#9a7a4a';
		ctx.font = `20px ${cursive}`;
		ctx.fillText(e.date, x + 6, y + 78);
	});

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function createGuestbookPlacardTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 154;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#1a1208';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#fbf3df';
	ctx.fillRect(10, 10, canvas.width - 20, canvas.height - 20);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#7a1f2b';
	fillFittedCanvasText(ctx, 'Please sign our', 256, 58, 440, 50, '900', '"Comic Sans MS", "Segoe Script", cursive');
	ctx.fillStyle = '#274472';
	fillFittedCanvasText(ctx, 'guestbook!', 256, 110, 440, 56, '900', '"Comic Sans MS", "Segoe Script", cursive');

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// (E) A beige CRT on a small desk against the left wall mid-room (clear between
// the front vignette and the back-corner ElePHPant), screening a stereotypical
// ~2004 personal homepage that bundles the period web tropes into one canvas.
function addRetroHomepageStation(group) {
	// Side-wall floor spot, screen (local −z front) turned to the room interior.
	// Inset keeps the desk's front edge just behind the wall's rope barrier.
	const spot = sideWallFloorSpot('left', -0.2, 0.5, '-z');
	addLocal(group, createRetroHomepageStation(), spot.x, spot.z, spot.rotation);
}

function createRetroHomepageStation() {
	const group = new THREE.Group();
	const oak = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.62 });
	const beige = new THREE.MeshStandardMaterial({ color: 0xe9e1c8, roughness: 0.72, metalness: 0.03 });
	const beigeShade = new THREE.MeshStandardMaterial({ color: 0xd5c9a6, roughness: 0.74 });

	// Small computer desk.
	const deskH = 0.7;
	const deskW = 1.0;
	const deskD = 0.56;
	const deskTop = new THREE.Mesh(new THREE.BoxGeometry(deskW, 0.05, deskD), oak);
	deskTop.position.set(0, deskH, 0);
	group.add(deskTop);
	const legGeo = new THREE.BoxGeometry(0.07, deskH, 0.07);
	[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
		const leg = new THREE.Mesh(legGeo, oak);
		leg.position.set(sx * (deskW / 2 - 0.08), deskH / 2, sz * (deskD / 2 - 0.08));
		group.add(leg);
	});

	// CRT monitor sitting on the desk, screen toward the room (local −z).
	const monitor = new THREE.Group();
	monitor.position.set(0, deskH + 0.025, -0.02);
	group.add(monitor);
	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.5, 4), beige);
	body.rotation.y = Math.PI / 4;
	body.scale.set(1.0, 1.0, 0.92);
	body.position.set(0, 0.27, 0.04);
	monitor.add(body);
	const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.44, 0.06), beige);
	bezel.position.set(0, 0.27, -0.22);
	monitor.add(bezel);
	const screen = new THREE.Mesh(
		new THREE.PlaneGeometry(0.4, 0.3),
		new THREE.MeshBasicMaterial({ map: createRetroHomepageScreenTexture(), side: THREE.DoubleSide })
	);
	screen.position.set(0, 0.27, -0.255);
	screen.rotation.y = Math.PI; // readable face toward the room (local −z)
	monitor.add(screen);
	const led = new THREE.Mesh(
		new THREE.SphereGeometry(0.014, 10, 8),
		new THREE.MeshBasicMaterial({ color: 0x6cff9c })
	);
	led.position.set(0.17, 0.075, -0.25);
	monitor.add(led);

	// Beige tower beside the monitor and a chunky keyboard in front.
	const tower = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.42), beigeShade);
	tower.position.set(-0.4, deskH + 0.225, 0.0);
	group.add(tower);
	const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.18), beige);
	keyboard.position.set(0.05, deskH + 0.05, -0.34);
	keyboard.rotation.x = 0.04;
	group.add(keyboard);

	return group;
}

// One high-resolution canvas bundling the classic ~2004 homepage tropes: tiled
// star background, Comic-Sans welcome, an Under Construction banner, a hit
// counter, a WebRing nav, "NEW!" / mail / MIDI badges and a Netscape footer.
function createRetroHomepageScreenTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 768;
	canvas.height = 576;
	const ctx = canvas.getContext('2d');
	const W = canvas.width;

	// Tiled navy starfield background.
	ctx.fillStyle = '#000033';
	ctx.fillRect(0, 0, W, canvas.height);
	ctx.fillStyle = 'rgba(255,255,255,0.85)';
	for (let y = 16; y < canvas.height; y += 48) {
		for (let x = 16; x < W; x += 48) {
			const r = (x + y) % 96 === 0 ? 2.4 : 1.4;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	// Centre "page" panel with a teal table border.
	const px = 70;
	const pw = W - 140;
	ctx.fillStyle = '#0a8a8a';
	ctx.fillRect(px - 6, 24, pw + 12, canvas.height - 56);
	ctx.fillStyle = '#fffdf0';
	ctx.fillRect(px, 30, pw, canvas.height - 68);

	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	const comic = '"Comic Sans MS", "Segoe Script", cursive';

	// Rainbow "Welcome to my homepage!!!" heading.
	const heading = 'Welcome to my homepage!!!';
	ctx.font = `900 40px ${comic}`;
	const hues = ['#e02020', '#e08020', '#d0c020', '#20a020', '#2060e0', '#8020c0'];
	let hx = W / 2 - ctx.measureText(heading).width / 2;
	ctx.textAlign = 'left';
	for (let i = 0; i < heading.length; i++) {
		ctx.fillStyle = hues[i % hues.length];
		ctx.fillText(heading[i], hx, 78);
		hx += ctx.measureText(heading[i]).width;
	}
	ctx.textAlign = 'center';

	// Under Construction banner with hazard stripes.
	const by = 110;
	const bw = 360;
	const bx = W / 2 - bw / 2;
	for (let i = 0; i < bw; i += 24) {
		ctx.fillStyle = i % 48 === 0 ? '#ffcc00' : '#101010';
		ctx.fillRect(bx + i, by, 24, 8);
		ctx.fillRect(bx + i, by + 46, 24, 8);
	}
	ctx.fillStyle = '#ffcc00';
	ctx.fillRect(bx, by + 8, bw, 38);
	ctx.fillStyle = '#101010';
	ctx.font = '900 24px Impact, Arial Black, sans-serif';
	ctx.fillText('🚧 UNDER CONSTRUCTION 🚧', W / 2, by + 28);

	// Intro line in friendly cursive.
	ctx.fillStyle = '#202080';
	ctx.font = `italic 22px ${comic}`;
	ctx.fillText('~ thanx 4 visiting my lil corner of the web ~', W / 2, by + 84);

	// Hit counter — odometer digits in an LCD box.
	const cy = 248;
	ctx.fillStyle = '#202080';
	ctx.font = '700 20px ui-monospace, Menlo, monospace';
	ctx.fillText('You are visitor No.', W / 2, cy);
	const digits = '00013 37';
	ctx.font = '900 40px ui-monospace, Menlo, monospace';
	const dw = ctx.measureText(digits).width + 28;
	ctx.fillStyle = '#0a0a0a';
	roundRectPath(ctx, W / 2 - dw / 2, cy + 16, dw, 50, 6);
	ctx.fill();
	ctx.fillStyle = '#39ff5a';
	ctx.fillText(digits, W / 2, cy + 43);

	// Badges row: NEW!, You've got mail, MIDI playing.
	const badgeY = 350;
	drawHomepageBadge(ctx, W / 2 - 250, badgeY, 120, 40, '#cc0000', '#ffffff', 'NEW!');
	drawHomepageBadge(ctx, W / 2 - 110, badgeY, 220, 40, '#1a3a8a', '#ffe070', '✉ You\'ve got mail');
	drawHomepageBadge(ctx, W / 2 + 130, badgeY, 130, 40, '#3a1a6a', '#9cff9c', '♪ MIDI on');

	// WebRing navigation.
	const ringY = 430;
	ctx.fillStyle = '#101010';
	roundRectPath(ctx, W / 2 - 200, ringY, 400, 44, 8);
	ctx.fill();
	ctx.fillStyle = '#e8e8ff';
	ctx.font = '700 22px ui-monospace, Menlo, monospace';
	ctx.fillText('« prev   ·   ', W / 2 - 96, ringY + 24);
	ctx.fillStyle = '#ffcc33';
	ctx.font = '900 22px ui-monospace, Menlo, monospace';
	ctx.fillText('WebRing', W / 2 + 4, ringY + 24);
	ctx.fillStyle = '#e8e8ff';
	ctx.font = '700 22px ui-monospace, Menlo, monospace';
	ctx.fillText('   ·   next »', W / 2 + 104, ringY + 24);

	// "Best viewed" footer.
	ctx.fillStyle = '#404040';
	ctx.font = '700 18px Verdana, Geneva, sans-serif';
	ctx.fillText('Best viewed in Netscape at 800 × 600', W / 2, 506);
	ctx.fillStyle = '#a0a0a0';
	ctx.font = '14px Verdana, Geneva, sans-serif';
	ctx.fillText('© 2004 · made with Notepad · sign my guestbook!', W / 2, 528);

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// One pill-shaped homepage badge with a chiseled bevel and centred label.
function drawHomepageBadge(ctx, x, y, w, h, bg, fg, text) {
	ctx.fillStyle = bg;
	roundRectPath(ctx, x, y, w, h, 6);
	ctx.fill();
	ctx.fillStyle = 'rgba(255,255,255,0.4)';
	ctx.fillRect(x + 3, y + 3, w - 6, 3);
	ctx.fillStyle = fg;
	ctx.font = '900 20px Verdana, Geneva, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fillFittedCanvasText(ctx, text, x + w / 2, y + h / 2 + 1, w - 16, 20, '900', 'Verdana, Geneva, sans-serif');
}

// A tasteful 2011 "good riddance, IE6" wall card for the CMS Toolkit room,
// echoing WP 3.2's dropping of IE6 support. Mounted low in the front-wall corner
// bay beside the era panel (both CMS Toolkit side walls carry doorways).
function createIE6RetirementCard() {
	const group = new THREE.Group();
	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(eraPanelArtW + 0.16, eraPanelArtH + 0.16, 0.08),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	frame.position.set(0, eraPanelY, 0);
	group.add(frame);
	const art = new THREE.Mesh(
		new THREE.PlaneGeometry(eraPanelArtW, eraPanelArtH),
		new THREE.MeshBasicMaterial({ map: createIE6RetirementTexture() })
	);
	art.position.set(0, eraPanelY, 0.05);
	group.add(art);
	const frontWallZ = -roomDepth / 2 + wallThickness / 2 + 0.05;
	group.position.set(-5.82, 0, frontWallZ);
	return group;
}

function createIE6RetirementTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 560;
	canvas.height = 408;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#101010';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#f4ead0';
	ctx.fillRect(14, 14, canvas.width - 28, canvas.height - 28);

	// Crossed-out IE6 logo.
	const cx = canvas.width / 2;
	const cy = 150;
	drawIELogo(ctx, cx, cy, 64);
	ctx.strokeStyle = 'rgba(200,30,30,0.9)';
	ctx.lineWidth = 16;
	ctx.lineCap = 'round';
	ctx.beginPath();
	ctx.moveTo(cx - 92, cy - 80);
	ctx.lineTo(cx + 92, cy + 80);
	ctx.stroke();

	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#241a0c';
	ctx.font = '900 46px Arial Black, Impact, sans-serif';
	ctx.fillText('GOOD RIDDANCE, IE6', cx, 280);
	ctx.fillStyle = '#7a3a1a';
	ctx.font = '700 24px system-ui, sans-serif';
	ctx.fillText('WordPress 3.2 dropped IE6 support · 2011', cx, 326);
	ctx.fillStyle = '#9a7a3a';
	ctx.font = 'italic 22px Georgia, serif';
	ctx.fillText('2001 – 2011 · you will not be missed', cx, 364);

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// A wink to the GeoCities era: a framed "Under Construction" plaque with a
// hazard-striped border, a blinking amber beacon, and a scrolling marquee.
// Mounted on a free front-wall bay of the earliest gallery.
function createUnderConstructionPlaque() {
	const group = new THREE.Group();

	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(eraPanelArtW + 0.16, eraPanelArtH + 0.16, 0.08),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	frame.position.set(0, eraPanelY, 0);
	group.add(frame);

	const plaque = new THREE.Mesh(
		new THREE.PlaneGeometry(eraPanelArtW, eraPanelArtH),
		new THREE.MeshBasicMaterial({ map: createUnderConstructionTexture() })
	);
	plaque.position.set(0, eraPanelY, 0.05);
	group.add(plaque);

	// Scrolling marquee strip beneath the plaque.
	const marqueeTexture = createMarqueeTexture();
	const marquee = new THREE.Mesh(
		new THREE.PlaneGeometry(eraPanelArtW, 0.18),
		new THREE.MeshBasicMaterial({ map: marqueeTexture })
	);
	marquee.position.set(0, eraPanelY - eraPanelArtH / 2 - 0.12, 0.05);
	group.add(marquee);
	registerAnimation(marquee, (object, elapsed) => {
		marqueeTexture.offset.x = (elapsed * 0.16) % 1;
	});

	// Amber warning beacon perched on top, blinking.
	const beaconY = eraPanelY + eraPanelArtH / 2 + 0.18;
	const beacon = new THREE.Mesh(
		new THREE.SphereGeometry(0.07, 14, 10),
		new THREE.MeshBasicMaterial({ color: 0xffb020 })
	);
	beacon.position.set(0, beaconY, 0.05);
	group.add(beacon);
	const beaconGlow = new THREE.PointLight(0xffb020, 0.0, 2.4);
	beaconGlow.position.set(0, beaconY, 0.2);
	group.add(beaconGlow);
	registerAnimation(beacon, (object, elapsed) => {
		const blink = (Math.sin(elapsed * 3.4) + 1) / 2;
		object.material.color.setRGB(1, 0.5 + blink * 0.35, 0.06 + blink * 0.1);
		object.scale.setScalar(0.85 + blink * 0.4);
		beaconGlow.intensity = blink * 0.5;
	});

	return group;
}

function createUnderConstructionTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 372;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#c0c0c0';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	drawHazardBand(ctx, 0, 0, canvas.width, 40);
	drawHazardBand(ctx, 0, canvas.height - 40, canvas.width, 40);

	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#101010';
	ctx.font = '900 56px Impact, Arial Black, sans-serif';
	ctx.fillText('UNDER', 256, 96);
	ctx.fillText('CONSTRUCTION', 256, 152);

	// A little roadwork barricade with a hard hat.
	drawBarricade(ctx, 176, 196, 160, 44);

	ctx.fillStyle = '#1a1a6e';
	ctx.font = 'italic 700 22px Georgia, serif';
	ctx.fillText('this corner of the web is being built', 256, 270);

	// Faux hit counter — black box with LCD-green digits.
	ctx.fillStyle = '#9a7a3a';
	ctx.font = '700 17px ui-monospace, Menlo, monospace';
	ctx.fillText('visitors', 198, 312);
	ctx.fillStyle = '#0a0a0a';
	roundRectPath(ctx, 244, 296, 120, 34, 5);
	ctx.fill();
	ctx.fillStyle = '#39ff5a';
	ctx.font = '900 26px ui-monospace, Menlo, monospace';
	ctx.fillText('000042', 304, 314);

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function drawHazardBand(ctx, x, y, w, h) {
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, w, h);
	ctx.clip();
	ctx.fillStyle = '#161616';
	ctx.fillRect(x, y, w, h);
	ctx.fillStyle = '#f5c518';
	const step = 30;
	for (let i = -h; i < w + h; i += step) {
		ctx.beginPath();
		ctx.moveTo(x + i, y);
		ctx.lineTo(x + i + h, y + h);
		ctx.lineTo(x + i + h + step / 2, y + h);
		ctx.lineTo(x + i + step / 2, y);
		ctx.closePath();
		ctx.fill();
	}
	ctx.restore();
}

function drawBarricade(ctx, x, y, w, h) {
	// Striped board.
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, w, h);
	ctx.clip();
	ctx.fillStyle = '#f5f5f5';
	ctx.fillRect(x, y, w, h);
	ctx.fillStyle = '#e8531f';
	const step = 26;
	for (let i = -h; i < w + h; i += step) {
		ctx.beginPath();
		ctx.moveTo(x + i, y);
		ctx.lineTo(x + i + h, y + h);
		ctx.lineTo(x + i + h + step / 2, y + h);
		ctx.lineTo(x + i + step / 2, y);
		ctx.closePath();
		ctx.fill();
	}
	ctx.restore();
	ctx.strokeStyle = '#101010';
	ctx.lineWidth = 3;
	ctx.strokeRect(x, y, w, h);
	// Legs.
	ctx.fillStyle = '#101010';
	ctx.fillRect(x + 14, y + h, 6, 22);
	ctx.fillRect(x + w - 20, y + h, 6, 22);
}

function createMarqueeTexture() {
	const canvas = document.createElement('canvas');
	canvas.height = 72;
	const font = '900 34px ui-monospace, Menlo, monospace';
	const phrase = '★ CHECK BACK SOON ★ BEST VIEWED IN 800×600 ';
	// Size the tile to exactly one phrase so RepeatWrapping scrolls seamlessly.
	const measure = canvas.getContext('2d');
	measure.font = font;
	canvas.width = Math.ceil(measure.measureText(phrase).width);

	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#101633';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#ffd23f';
	ctx.font = font;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText(phrase, 0, canvas.height / 2 + 2);

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.wrapS = THREE.RepeatWrapping;
	tex.anisotropy = 4;
	return tex;
}

// The 216-colour "web-safe palette" — the other early-web relic, framed beside
// the Under Construction sign in the earliest gallery.
function createWebSafePalettePanel() {
	const group = new THREE.Group();

	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(eraPanelArtW + 0.16, eraPanelArtH + 0.16, 0.08),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	group.add(frame);

	const panel = new THREE.Mesh(
		new THREE.PlaneGeometry(eraPanelArtW, eraPanelArtH),
		new THREE.MeshBasicMaterial({ map: createWebSafePaletteTexture() })
	);
	panel.position.z = 0.05;
	group.add(panel);

	return group;
}

function createWebSafePaletteTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 372;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#1c1c1c';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = '#f4ead0';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '900 38px Arial Black, Impact, sans-serif';
	ctx.fillText('THE WEB-SAFE PALETTE', 256, 38);
	ctx.fillStyle = '#9a7a3a';
	ctx.font = '700 17px ui-monospace, Menlo, monospace';
	ctx.fillText('216 colours · safe on any 256-colour screen', 256, 70);

	const levels = [0, 0x33, 0x66, 0x99, 0xcc, 0xff];
	const cols = 18;
	const rows = 12;
	const gridX = 28;
	const gridY = 92;
	const gridW = canvas.width - gridX * 2;
	const cellW = gridW / cols;
	const cellH = (canvas.height - gridY - 28) / rows;
	let index = 0;
	for (const r of levels) {
		for (const g of levels) {
			for (const b of levels) {
				const col = index % cols;
				const row = Math.floor(index / cols);
				ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
				ctx.fillRect(gridX + col * cellW, gridY + row * cellH, cellW - 1, cellH - 1);
				index += 1;
			}
		}
	}

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// Standard brass-framed wall plaque (matches the museum's other framed art).
function createFramedPlaque(texture) {
	const group = new THREE.Group();
	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(eraPanelArtW + 0.16, eraPanelArtH + 0.16, 0.08),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	frame.position.set(0, eraPanelY, 0);
	group.add(frame);
	const panel = new THREE.Mesh(
		new THREE.PlaneGeometry(eraPanelArtW, eraPanelArtH),
		new THREE.MeshBasicMaterial({ map: texture })
	);
	panel.position.set(0, eraPanelY, 0.05);
	group.add(panel);
	return group;
}

// Skeuomorphism (the CMS Toolkit era, ~2011): a glossy button, a slide-to-unlock
// track and a toggle — pixels pretending to be physical things.
function createSkeuomorphicPanel() {
	return createFramedPlaque(createSkeuomorphicTexture());
}

function createSkeuomorphicTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 372;
	const ctx = canvas.getContext('2d');

	// Brushed-aluminium backing.
	const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
	bg.addColorStop(0, '#d7dbe0');
	bg.addColorStop(0.5, '#bcc2c9');
	bg.addColorStop(1, '#d2d6dc');
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.strokeStyle = 'rgba(255,255,255,0.25)';
	ctx.lineWidth = 1;
	for (let y = 6; y < canvas.height; y += 3) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(canvas.width, y);
		ctx.stroke();
	}

	// Glossy dark title bar.
	const tb = ctx.createLinearGradient(0, 0, 0, 64);
	tb.addColorStop(0, '#3a4250');
	tb.addColorStop(0.5, '#222934');
	tb.addColorStop(0.5, '#1a212b');
	tb.addColorStop(1, '#2a313d');
	ctx.fillStyle = tb;
	ctx.fillRect(0, 0, canvas.width, 64);
	ctx.fillStyle = '#f3f0e6';
	ctx.font = '900 30px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('SKEUOMORPHISM · 2011', 256, 33);

	drawGlossyPill(ctx, 70, 96, 372, 58, 'Download', '#7cc1f6', '#1f6fe0');
	drawSlideToUnlock(ctx, 70, 176, 372, 58);
	ctx.fillStyle = '#3a4250';
	ctx.font = '800 24px system-ui, sans-serif';
	ctx.textAlign = 'left';
	ctx.fillText('Push notifications', 70, 295);
	drawToggle(ctx, 372, 277, true);

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function drawGlossyPill(ctx, x, y, w, h, label, top, bottom) {
	const r = h / 2;
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.35)';
	ctx.shadowBlur = 9;
	ctx.shadowOffsetY = 4;
	const g = ctx.createLinearGradient(0, y, 0, y + h);
	g.addColorStop(0, top);
	g.addColorStop(1, bottom);
	ctx.fillStyle = g;
	roundRectPath(ctx, x, y, w, h, r);
	ctx.fill();
	ctx.restore();
	const gloss = ctx.createLinearGradient(0, y, 0, y + h * 0.52);
	gloss.addColorStop(0, 'rgba(255,255,255,0.6)');
	gloss.addColorStop(1, 'rgba(255,255,255,0.04)');
	ctx.fillStyle = gloss;
	roundRectPath(ctx, x + 3, y + 2, w - 6, h * 0.5, r * 0.8);
	ctx.fill();
	ctx.strokeStyle = 'rgba(0,0,0,0.28)';
	ctx.lineWidth = 1.5;
	roundRectPath(ctx, x, y, w, h, r);
	ctx.stroke();
	ctx.fillStyle = '#ffffff';
	ctx.font = '700 27px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.45)';
	ctx.shadowOffsetY = 1;
	ctx.fillText(label, x + w / 2, y + h / 2 + 1);
	ctx.restore();
}

function drawSlideToUnlock(ctx, x, y, w, h) {
	const r = h / 2;
	// Recessed track.
	const tg = ctx.createLinearGradient(0, y, 0, y + h);
	tg.addColorStop(0, '#9aa0a8');
	tg.addColorStop(0.5, '#cfd4da');
	tg.addColorStop(1, '#eef1f4');
	ctx.fillStyle = tg;
	roundRectPath(ctx, x, y, w, h, r);
	ctx.fill();
	ctx.strokeStyle = 'rgba(0,0,0,0.22)';
	ctx.lineWidth = 1.5;
	roundRectPath(ctx, x, y, w, h, r);
	ctx.stroke();
	// Shimmer label.
	ctx.fillStyle = 'rgba(80,86,94,0.75)';
	ctx.font = 'italic 600 24px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('slide to unlock  ▸▸▸', x + w / 2 + 28, y + h / 2);
	// Glossy knob on the left.
	drawGlossyPill(ctx, x + 4, y + 4, 78, h - 8, '▸', '#fbfbfb', '#c7ccd2');
}

function drawToggle(ctx, x, y, on) {
	const w = 72;
	const h = 38;
	const r = h / 2;
	const g = ctx.createLinearGradient(0, y, 0, y + h);
	if (on) {
		g.addColorStop(0, '#7fd07f');
		g.addColorStop(1, '#3a9a3a');
	} else {
		g.addColorStop(0, '#cfd4da');
		g.addColorStop(1, '#aab0b8');
	}
	ctx.fillStyle = g;
	roundRectPath(ctx, x, y, w, h, r);
	ctx.fill();
	ctx.strokeStyle = 'rgba(0,0,0,0.25)';
	ctx.lineWidth = 1.5;
	roundRectPath(ctx, x, y, w, h, r);
	ctx.stroke();
	// Knob.
	const kx = on ? x + w - h + 3 : x + 3;
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.4)';
	ctx.shadowBlur = 4;
	ctx.shadowOffsetY = 2;
	const kg = ctx.createRadialGradient(kx + (h - 6) / 2, y + h / 2 - 4, 2, kx + (h - 6) / 2, y + h / 2, (h - 6) / 2);
	kg.addColorStop(0, '#ffffff');
	kg.addColorStop(1, '#e2e6ea');
	ctx.fillStyle = kg;
	ctx.beginPath();
	ctx.arc(kx + (h - 6) / 2, y + h / 2, (h - 6) / 2, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

// The materials skeuomorphic apps faked in 2011: a sampler swatch wall.
function createFauxMaterialsPanel() {
	return createFramedPlaque(createFauxMaterialsTexture());
}

function createFauxMaterialsTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 372;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#241a12';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = '#f3ead0';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '900 34px Arial Black, Impact, sans-serif';
	ctx.fillText('FAUX MATERIALS', 256, 34);
	ctx.fillStyle = '#b79a5e';
	ctx.font = '700 17px system-ui, sans-serif';
	ctx.fillText('the year the screen pretended to be real', 256, 64);

	const swatches = [
		{ label: 'LINEN', draw: drawLinenSwatch },
		{ label: 'BRUSHED METAL', draw: drawMetalSwatch },
		{ label: 'LEATHER', draw: drawLeatherSwatch },
		{ label: 'GREEN FELT', draw: drawFeltSwatch },
		{ label: 'WOOD', draw: drawWoodSwatch },
		{ label: 'GLASS', draw: drawGlassSwatch },
	];
	const cols = 3;
	const cellW = 150;
	const cellH = 118;
	const startX = (canvas.width - cols * cellW) / 2 + 8;
	const startY = 88;
	swatches.forEach((s, i) => {
		const cx = startX + (i % cols) * cellW;
		const cy = startY + Math.floor(i / cols) * cellH;
		const w = cellW - 16;
		const h = cellH - 34;
		ctx.save();
		roundRectPath(ctx, cx, cy, w, h, 10);
		ctx.clip();
		s.draw(ctx, cx, cy, w, h);
		ctx.restore();
		ctx.strokeStyle = 'rgba(0,0,0,0.45)';
		ctx.lineWidth = 2;
		roundRectPath(ctx, cx, cy, w, h, 10);
		ctx.stroke();
		ctx.fillStyle = '#e7dcc0';
		ctx.font = '800 14px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(s.label, cx + w / 2, cy + h + 14);
	});

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function drawLinenSwatch(ctx, x, y, w, h) {
	ctx.fillStyle = '#cfc9ba';
	ctx.fillRect(x, y, w, h);
	ctx.strokeStyle = 'rgba(255,255,255,0.35)';
	ctx.lineWidth = 1;
	for (let i = 0; i < w + h; i += 4) {
		ctx.beginPath();
		ctx.moveTo(x + i, y);
		ctx.lineTo(x, y + i);
		ctx.stroke();
	}
	ctx.strokeStyle = 'rgba(120,112,96,0.3)';
	for (let i = 0; i < w; i += 4) {
		ctx.beginPath();
		ctx.moveTo(x + i, y);
		ctx.lineTo(x + i, y + h);
		ctx.stroke();
	}
}

function drawMetalSwatch(ctx, x, y, w, h) {
	const g = ctx.createLinearGradient(x, y, x, y + h);
	g.addColorStop(0, '#e8ebee');
	g.addColorStop(0.5, '#a9b0b8');
	g.addColorStop(1, '#d2d6db');
	ctx.fillStyle = g;
	ctx.fillRect(x, y, w, h);
	ctx.strokeStyle = 'rgba(255,255,255,0.5)';
	ctx.lineWidth = 1;
	for (let i = 1; i < h; i += 2) {
		ctx.beginPath();
		ctx.moveTo(x, y + i);
		ctx.lineTo(x + w, y + i);
		ctx.stroke();
	}
}

function drawLeatherSwatch(ctx, x, y, w, h) {
	const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, w * 0.7);
	g.addColorStop(0, '#7a4a2a');
	g.addColorStop(1, '#5a3318');
	ctx.fillStyle = g;
	ctx.fillRect(x, y, w, h);
	ctx.strokeStyle = 'rgba(245,225,180,0.85)';
	ctx.lineWidth = 2;
	ctx.setLineDash([7, 5]);
	ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
	ctx.setLineDash([]);
}

function drawFeltSwatch(ctx, x, y, w, h) {
	ctx.fillStyle = '#1f7a3d';
	ctx.fillRect(x, y, w, h);
	ctx.fillStyle = 'rgba(0,0,0,0.12)';
	for (let i = 0; i < 120; i++) {
		const px = x + pseudoRandom(i * 1.7) * w;
		const py = y + pseudoRandom(i * 2.3 + 1) * h;
		ctx.fillRect(px, py, 1.5, 1.5);
	}
}

function drawWoodSwatch(ctx, x, y, w, h) {
	const g = ctx.createLinearGradient(x, y, x + w, y);
	g.addColorStop(0, '#9a5e2c');
	g.addColorStop(0.5, '#b9783c');
	g.addColorStop(1, '#8a4f24');
	ctx.fillStyle = g;
	ctx.fillRect(x, y, w, h);
	ctx.strokeStyle = 'rgba(80,45,20,0.5)';
	ctx.lineWidth = 1.5;
	for (let i = 0; i < h; i += 9) {
		ctx.beginPath();
		ctx.moveTo(x, y + i + Math.sin(i) * 2);
		ctx.bezierCurveTo(x + w * 0.4, y + i - 3, x + w * 0.6, y + i + 3, x + w, y + i + Math.cos(i) * 2);
		ctx.stroke();
	}
}

function drawGlassSwatch(ctx, x, y, w, h) {
	const g = ctx.createLinearGradient(x, y, x, y + h);
	g.addColorStop(0, '#bfe3f5');
	g.addColorStop(1, '#5aa0c8');
	ctx.fillStyle = g;
	ctx.fillRect(x, y, w, h);
	ctx.fillStyle = 'rgba(255,255,255,0.45)';
	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.lineTo(x + w * 0.6, y);
	ctx.lineTo(x + w * 0.3, y + h);
	ctx.lineTo(x, y + h);
	ctx.closePath();
	ctx.fill();
}

function drawBrowserChrome(ctx, x, y, w, h, kind) {
	const barH = 46;
	// Window body.
	ctx.fillStyle = '#dfe3ea';
	ctx.fillRect(x, y, w, h);
	// Title/tool bar.
	ctx.fillStyle = kind === 'modern' || kind === 'chrome' ? '#2b2f36' : '#c7d0dc';
	ctx.fillRect(x, y, w, barH);
	if (kind === 'ie') {
		ctx.fillStyle = '#1f50a8';
		ctx.fillRect(x, y, w, barH);
		ctx.fillStyle = '#fff';
		ctx.font = '700 18px Tahoma, sans-serif';
		ctx.textAlign = 'left';
		ctx.fillText('Internet Explorer', x + 12, y + 28);
	} else {
		// Traffic dots / nav.
		const dot = (cx, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, y + barH / 2, 7, 0, Math.PI * 2); ctx.fill(); };
		if (kind === 'safari' || kind === 'firefox') { dot(x + 18, '#ff5f57'); dot(x + 40, '#febc2e'); dot(x + 62, '#28c840'); }
		// URL pill.
		ctx.fillStyle = kind === 'modern' || kind === 'chrome' ? '#3c4250' : '#eef2f7';
		const ux = x + 92;
		ctx.fillRect(ux, y + 11, w - 110, 24);
		ctx.fillStyle = kind === 'modern' || kind === 'chrome' ? '#aab3c2' : '#5a6472';
		ctx.font = '15px ui-monospace, Menlo, monospace';
		ctx.textAlign = 'left';
		ctx.fillText('https://example.com', ux + 12, y + 28);
	}
	ctx.textAlign = 'center';
}

function drawEraPage(ctx, x, y, w, h, bg) {
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, w, h);
	ctx.clip();
	if (bg === 'web2') {
		const g = ctx.createLinearGradient(x, y, x, y + h);
		g.addColorStop(0, '#eaf4ff'); g.addColorStop(1, '#bcdcff');
		ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
		// glossy header
		ctx.fillStyle = '#2a8fd8'; roundRectPath(ctx, x + 20, y + 20, w - 40, 70, 12); ctx.fill();
		ctx.fillStyle = 'rgba(255,255,255,0.35)'; roundRectPath(ctx, x + 24, y + 24, w - 48, 28, 10); ctx.fill();
		// beta starburst
		drawStarburst(ctx, x + w - 60, y + 60, 38, '#ff5b4a', 'BETA');
		ctx.fillStyle = '#3a6ea5'; ctx.font = '900 30px Helvetica, Arial, sans-serif'; ctx.textAlign = 'left';
		ctx.fillText('Web 2.0', x + 40, y + 66);
		for (let i = 0; i < 3; i++) { ctx.fillStyle = '#ffffff'; roundRectPath(ctx, x + 24 + i * (w / 3 - 8), y + 110, w / 3 - 24, h - 150, 12); ctx.fill(); ctx.strokeStyle = '#9cc4ec'; ctx.stroke(); }
	} else if (bg === 'flat') {
		const cols = ['#1abc9c', '#3498db', '#e74c3c', '#f1c40f'];
		ctx.fillStyle = '#ecf0f1'; ctx.fillRect(x, y, w, h);
		ctx.fillStyle = '#2c3e50'; ctx.fillRect(x, y, w, 64);
		for (let i = 0; i < 4; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(x + 20 + i * (w / 4), y + 88, w / 4 - 26, h - 120); }
	} else if (bg === 'skeuo') {
		const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#cfd6dd'); g.addColorStop(1, '#9aa6b2');
		ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
		for (let i = 0; i < 6; i++) { const gx = x + 30 + (i % 3) * (w / 3); const gy = y + 30 + Math.floor(i / 3) * (h / 2 - 10); const gg = ctx.createLinearGradient(gx, gy, gx, gy + 90); gg.addColorStop(0, '#fefefe'); gg.addColorStop(1, '#c4ccd4'); ctx.fillStyle = gg; roundRectPath(ctx, gx, gy, w / 3 - 50, 90, 16); ctx.fill(); ctx.strokeStyle = '#7d8893'; ctx.stroke(); }
	} else if (bg === 'material') {
		ctx.fillStyle = '#fafafa'; ctx.fillRect(x, y, w, h);
		ctx.fillStyle = '#6200ee'; ctx.fillRect(x, y, w, 70);
		for (let i = 0; i < 4; i++) { ctx.fillStyle = '#fff'; const cyy = y + 90 + i * 78; roundRectPath(ctx, x + 24, cyy, w - 48, 64, 8); ctx.fill(); ctx.fillStyle = '#03dac6'; ctx.beginPath(); ctx.arc(x + 56, cyy + 32, 18, 0, Math.PI * 2); ctx.fill(); }
		ctx.fillStyle = '#ff4081'; ctx.beginPath(); ctx.arc(x + w - 50, y + h - 50, 28, 0, Math.PI * 2); ctx.fill();
	} else if (bg === 'minimal') {
		ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h);
		ctx.fillStyle = '#111'; ctx.font = '900 46px Helvetica, Arial, sans-serif'; ctx.textAlign = 'left';
		ctx.fillText('Big type.', x + 30, y + 90); ctx.fillText('More space.', x + 30, y + 140);
		ctx.fillStyle = '#eee'; ctx.fillRect(x + 30, y + 180, w - 60, 2);
		for (let i = 0; i < 2; i++) { ctx.fillStyle = '#f3f3f3'; roundRectPath(ctx, x + 30 + i * (w / 2 - 10), y + 210, w / 2 - 50, h - 250, 10); ctx.fill(); }
	} else if (bg === 'darkmode') {
		ctx.fillStyle = '#0f1420'; ctx.fillRect(x, y, w, h);
		ctx.fillStyle = '#1b2333'; roundRectPath(ctx, x + 24, y + 24, w - 48, 60, 10); ctx.fill();
		ctx.fillStyle = '#2bb7ff'; ctx.font = '900 28px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('● dark mode', x + 40, y + 62);
		for (let i = 0; i < 3; i++) { ctx.fillStyle = '#1b2333'; roundRectPath(ctx, x + 24, y + 104 + i * ((h - 130) / 3), w - 48, (h - 130) / 3 - 14, 10); ctx.fill(); }
	} else {
		// IE-era 2004 page: gray bg, blue header, table layout, hit counter.
		ctx.fillStyle = '#dfe6ef'; ctx.fillRect(x, y, w, h);
		ctx.fillStyle = bg.startsWith('#') ? bg : '#5b7fb4'; ctx.fillRect(x + 16, y + 16, w - 32, 56);
		ctx.fillStyle = '#fff'; ctx.font = '900 26px "Times New Roman", serif'; ctx.textAlign = 'left'; ctx.fillText('My Home Page', x + 30, y + 52);
		ctx.fillStyle = '#cdd7e2'; ctx.fillRect(x + 16, y + 84, 120, h - 110);
		ctx.fillStyle = '#fff'; ctx.fillRect(x + 148, y + 84, w - 168, h - 110);
		ctx.fillStyle = '#000'; ctx.font = '14px "Times New Roman", serif';
		ctx.fillText('Welcome to my website!', x + 160, y + 112);
		ctx.fillStyle = '#111'; ctx.fillRect(x + 160, y + h - 80, 130, 28);
		ctx.fillStyle = '#39ff6a'; ctx.font = '700 18px ui-monospace, monospace'; ctx.fillText('00042', x + 172, y + h - 60);
		ctx.fillStyle = '#000'; ctx.font = '11px Arial'; ctx.fillText('visitors', x + 300, y + h - 60);
	}
	ctx.restore();
}

function drawStarburst(ctx, cx, cy, r, color, text) {
	ctx.save();
	ctx.translate(cx, cy);
	ctx.fillStyle = color;
	ctx.beginPath();
	const points = 12;
	for (let i = 0; i < points * 2; i++) {
		const rad = i % 2 === 0 ? r : r * 0.72;
		const a = (Math.PI * i) / points;
		ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
	}
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = '#fff';
	ctx.font = '900 16px Arial, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, 0, 0);
	ctx.restore();
	ctx.textBaseline = 'alphabetic';
}

// ── "Design of the web" showcase panels ───────────────────────────────────
// One per gallery, threaded through the eras: each captures the dominant
// visual style of the web in that period, rendered on a brass-framed plaque
// in a gallery's free front-wall bay.

// Web 2.0 (the Dashboard Foundations era, ~2007): gel buttons, glossy logos,
// gradients, big rounded corners and the inescapable "Beta!" starburst.
function createWeb2Panel() {
	return createFramedPlaque(createWeb2Texture());
}

function createWeb2Texture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 372;
	const ctx = canvas.getContext('2d');

	// Sky-to-white gradient, the de-facto Web 2.0 backdrop.
	const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
	bg.addColorStop(0, '#dff1ff');
	bg.addColorStop(1, '#ffffff');
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Glossy header bar.
	const hb = ctx.createLinearGradient(0, 0, 0, 64);
	hb.addColorStop(0, '#5bb4ec');
	hb.addColorStop(0.5, '#2a8fd8');
	hb.addColorStop(0.5, '#1f7fc8');
	hb.addColorStop(1, '#3ba0e0');
	ctx.fillStyle = hb;
	ctx.fillRect(0, 0, canvas.width, 64);
	ctx.fillStyle = 'rgba(255,255,255,0.35)';
	ctx.fillRect(0, 0, canvas.width, 22);
	ctx.fillStyle = '#ffffff';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '900 30px Arial Black, Impact, sans-serif';
	ctx.fillText('WEB 2.0 · 2007', 256, 32);

	// Reflective "logo" lozenge with a glassy highlight and mirror reflection.
	const lx = 70;
	const ly = 96;
	const lw = 200;
	const lh = 84;
	const lg = ctx.createLinearGradient(0, ly, 0, ly + lh);
	lg.addColorStop(0, '#ff8a5b');
	lg.addColorStop(1, '#e8521f');
	ctx.fillStyle = lg;
	roundRectPath(ctx, lx, ly, lw, lh, 22);
	ctx.fill();
	const lgloss = ctx.createLinearGradient(0, ly, 0, ly + lh * 0.5);
	lgloss.addColorStop(0, 'rgba(255,255,255,0.7)');
	lgloss.addColorStop(1, 'rgba(255,255,255,0.05)');
	ctx.fillStyle = lgloss;
	roundRectPath(ctx, lx + 4, ly + 3, lw - 8, lh * 0.46, 18);
	ctx.fill();
	ctx.fillStyle = '#ffffff';
	ctx.font = '900 34px Helvetica, Arial, sans-serif';
	ctx.fillText('blogr', lx + lw / 2, ly + lh / 2 + 2);
	// Mirror reflection beneath.
	ctx.save();
	ctx.globalAlpha = 0.28;
	ctx.translate(0, (ly + lh) * 2 + 6);
	ctx.scale(1, -1);
	const rg = ctx.createLinearGradient(0, ly, 0, ly + lh);
	rg.addColorStop(0, '#ff8a5b');
	rg.addColorStop(1, '#e8521f');
	ctx.fillStyle = rg;
	roundRectPath(ctx, lx, ly, lw, lh, 22);
	ctx.fill();
	ctx.restore();

	// Big rounded gradient call-to-action buttons.
	drawWeb2Button(ctx, 70, 232, 184, 56, 'Sign up', '#9be36a', '#4ba61f');
	drawWeb2Button(ctx, 280, 232, 162, 56, 'Login', '#bcd9ff', '#3a8fe0');

	// Rounded tag pills, the other Web 2.0 staple.
	const tags = ['ajax', 'rss', 'tags', 'mashup'];
	let tx = 70;
	const ty = 312;
	ctx.font = '700 18px system-ui, sans-serif';
	tags.forEach((t) => {
		const tw = ctx.measureText(t).width + 28;
		const tg = ctx.createLinearGradient(0, ty, 0, ty + 34);
		tg.addColorStop(0, '#fbe7a8');
		tg.addColorStop(1, '#f3c95a');
		ctx.fillStyle = tg;
		roundRectPath(ctx, tx, ty, tw, 34, 17);
		ctx.fill();
		ctx.strokeStyle = 'rgba(160,110,20,0.5)';
		ctx.lineWidth = 1.5;
		roundRectPath(ctx, tx, ty, tw, 34, 17);
		ctx.stroke();
		ctx.fillStyle = '#6a4a08';
		ctx.fillText(t, tx + tw / 2, ty + 18);
		tx += tw + 12;
	});

	// The mandatory "Beta!" starburst.
	drawStarburst(ctx, 446, 132, 46, '#ff3b30', 'Beta!');

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function drawWeb2Button(ctx, x, y, w, h, label, top, bottom) {
	const r = 16;
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.22)';
	ctx.shadowBlur = 6;
	ctx.shadowOffsetY = 3;
	const g = ctx.createLinearGradient(0, y, 0, y + h);
	g.addColorStop(0, top);
	g.addColorStop(1, bottom);
	ctx.fillStyle = g;
	roundRectPath(ctx, x, y, w, h, r);
	ctx.fill();
	ctx.restore();
	const gloss = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
	gloss.addColorStop(0, 'rgba(255,255,255,0.65)');
	gloss.addColorStop(1, 'rgba(255,255,255,0.05)');
	ctx.fillStyle = gloss;
	roundRectPath(ctx, x + 3, y + 2, w - 6, h * 0.46, r * 0.8);
	ctx.fill();
	ctx.fillStyle = '#ffffff';
	ctx.font = '800 24px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.4)';
	ctx.shadowOffsetY = 1;
	ctx.fillText(label, x + w / 2, y + h / 2 + 1);
	ctx.restore();
}

// ── Iconic early-web screenshots (Dashboard Foundations, 2007–2009) ─────────
// Brass-framed "browser window" recreations of the sites that defined the
// 2005–2007 web, hung like museum pictures. Each is an evocative (not
// pixel-perfect) canvas drawing of the site's layout/logo/colours at the time,
// wrapped in period browser chrome with an address bar showing its URL.
//
// Space is tight: the back wall and side walls carry release exhibits, story
// panels and props, so these take the front (entrance) wall — the only clean
// stretch. The left of the doorway is empty marble (two frames) and the right
// has a free corner bay beyond the Web 2.0 panel at x=+3.95 (one frame). Mounted
// as front-wall plaques (art faces +z, into the room) at the picture-rail height.
function addDashboardScreenshots(group) {
	const frontWallZ = -roomDepth / 2 + wallThickness / 2 + 0.05;
	// Spaced wider so the now-larger uniform frames don't overlap (left segment
	// holds two, right segment one beside the Web 2.0 design panel at x=3.95).
	const shots = [
		{ x: -5.85, draw: drawSiteYouTube2005, url: 'http://www.youtube.com', caption: 'YouTube · 2005' },
		{ x: -3.92, draw: drawSiteTwitter2006, url: 'http://twitter.com', caption: 'Twitter · 2006' },
		{ x: 5.85, draw: drawSiteFacebook2007, url: 'http://www.facebook.com', caption: 'Facebook · 2007' },
	];
	shots.forEach((shot) => {
		addLocal(group, createBrowserScreenshotPlaque(shot), shot.x, frontWallZ);
	});
}

// A slim replica of the WordPress admin toolbar mounted high on the front wall,
// greeting visitors with "Howdy, admin!" — the dashboard era's signature toolbar
// salutation. Hung above the period screenshots, facing the room interior (+z).
function createHowdyAdminBar() {
	const group = new THREE.Group();
	const width = 2.7;
	const height = 0.44;
	const y = 4.1;
	// A thin dark rail the bar mounts onto, so it reads as a toolbar, not a decal.
	const backing = new THREE.Mesh(
		new THREE.BoxGeometry(width + 0.04, height + 0.04, 0.04),
		new THREE.MeshStandardMaterial({ color: 0x23282d, roughness: 0.6, metalness: 0.2 })
	);
	backing.position.set(0, y, 0);
	group.add(backing);
	// The textured bar sits proud of the rail's front face (z=0.02) so the
	// "Howdy, admin!" art is never hidden behind the opaque backing.
	const bar = new THREE.Mesh(
		new THREE.PlaneGeometry(width, height),
		new THREE.MeshBasicMaterial({ map: createHowdyAdminBarTexture(width, height) })
	);
	bar.position.set(0, y, 0.04);
	group.add(bar);
	return group;
}

function createHowdyAdminBarTexture(width, height) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = Math.round((1024 * height) / width);
	const ctx = canvas.getContext('2d');
	const h = canvas.height;
	// The dark grey admin-bar field of the era.
	ctx.fillStyle = '#23282d';
	ctx.fillRect(0, 0, canvas.width, h);
	ctx.textBaseline = 'middle';
	// Left: the WordPress "W" logo glyph in a tinted square, like the toolbar icon.
	ctx.fillStyle = '#0073aa';
	ctx.fillRect(0, 0, h, h);
	ctx.fillStyle = '#ffffff';
	ctx.font = `900 ${Math.round(h * 0.66)}px Georgia, serif`;
	ctx.textAlign = 'center';
	ctx.fillText('W', h / 2, h / 2 + 2);
	// The greeting, large and bright so the joke is unmistakable.
	ctx.textAlign = 'center';
	ctx.fillStyle = '#f4f6f8';
	ctx.font = `700 ${Math.round(h * 0.5)}px system-ui, sans-serif`;
	ctx.fillText('Howdy, admin!', canvas.width / 2 + h * 0.1, h / 2 + 2);
	// Right: a round avatar bubble.
	ctx.fillStyle = '#0073aa';
	ctx.beginPath();
	ctx.arc(canvas.width - h * 0.6, h / 2, h * 0.32, 0, Math.PI * 2);
	ctx.fill();
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// Period browser-window screenshots for the Blogging Roots gallery (2003–2005),
// when Google and Yahoo! ruled the web. Mounted on the solid right side wall —
// the doorway is on the left, the lone release exhibit sits at z≈+1.0 and the
// WebEraPoster at z≈−2.5, leaving the front segment free for two framed shots.
function addBloggingRootsScreenshots(group) {
	const shots = [
		// Spaced 2.2m apart so the now-larger uniform frames don't overlap.
		{ z: -6.5, draw: drawSiteGoogle1998, url: 'http://www.google.com', caption: 'Google · 1998' },
		{ z: -4.3, draw: drawSiteYahoo, url: 'http://www.yahoo.com', caption: 'Yahoo! · 2003' },
	];
	shots.forEach((shot) => {
		group.add(createSideWallScreenshot(shot, 'right', shot.z));
	});
}

// A procedural cobweb tucked high into the back-left corner where the back wall
// meets the left chamfer — a quiet pun on "the Web". It strings across the
// corner just below the cove cornice, well above the walkway and clear of the
// release plaques and ceiling mobiles, with a tiny spider resting on it.
function addWebStand(group) {
	const stand = createWebStand();
	// Sited as the mirror of the WP HOOKS rack across the central runner (x=0) and
	// turned to face the main entrance — "The Web" pun standing opposite the
	// do_action()/apply_filters() hooks, a matched pair flanking the runner.
	stand.position.set(3.3, 0, 1.0);
	stand.rotation.y = -2.79; // front (+z: web + plate) turns to face the entry doorway
	group.add(stand);
}

// A free-standing "The Web" exhibit: a stone-footed forked branch with a
// hand-spun cobweb (and its spider) strung across the crook, and a small plate.
// Built facing local +z, sized to echo the WP HOOKS rack it mirrors.
function createWebStand() {
	const group = new THREE.Group();
	const stone = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.92, metalness: 0.05 });
	const bark = new THREE.MeshStandardMaterial({ color: 0x5b4327, roughness: 0.93 });
	const V = THREE.Vector3;
	const seg = (a, b, r) => group.add(createCylinderBetween(a, b, r, bark, 6));
	// Weighted stone base — same footprint as the WP HOOKS rack so the pair reads even.
	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.09, 20), stone);
	base.position.y = 0.045;
	group.add(base);
	// A small gnarled tree: a slightly kinked trunk forking into a web-bearing
	// crook, with secondary boughs and twigs leaning out of plane (±z) so it reads
	// as a tree rather than a flat fork.
	const knee = new V(0.05, 0.6, 0.03);
	const fork = new V(-0.02, 1.3, 0);
	seg(new V(0, 0.06, 0), knee, 0.08);
	seg(knee, fork, 0.056);
	// Main V limbs (kept in the x/y plane) that frame the web.
	const limbR = fork.clone().add(new V(Math.cos(0.19 * Math.PI), Math.sin(0.19 * Math.PI), 0).multiplyScalar(1.4));
	const limbL = fork.clone().add(new V(Math.cos(0.81 * Math.PI), Math.sin(0.81 * Math.PI), 0).multiplyScalar(1.4));
	seg(fork, limbR, 0.042);
	seg(fork, limbL, 0.042);
	// Twigs off the limb tips.
	seg(limbR, limbR.clone().add(new V(0.46, 0.4, 0.2)), 0.022);
	seg(limbR, limbR.clone().add(new V(0.16, 0.5, -0.24)), 0.02);
	seg(limbL, limbL.clone().add(new V(-0.46, 0.42, -0.16)), 0.022);
	seg(limbL, limbL.clone().add(new V(-0.14, 0.48, 0.22)), 0.02);
	// Lower side boughs spreading fore-and-aft, each with a sub-twig.
	const bough1 = knee.clone().add(new V(0.5, 0.5, 0.36));
	seg(knee, bough1, 0.03);
	seg(bough1, bough1.clone().add(new V(0.26, 0.34, 0.18)), 0.017);
	const mid = new V(0, 0.96, 0.01);
	const bough2 = mid.clone().add(new V(-0.46, 0.46, -0.38));
	seg(mid, bough2, 0.03);
	seg(bough2, bough2.clone().add(new V(-0.22, 0.32, -0.2)), 0.017);
	// The hand-spun web (and spider) strung across the crook, fan opening up;
	// faces local +z (the stand front).
	const web = createCobweb(0x6f685c);
	web.position.copy(fork);
	web.rotation.z = -0.6;
	web.scale.setScalar(0.9);
	group.add(web);
	// "THE WEB" plate at eye level on the trunk front (+z), like the hooks plate.
	const label = createReadableLabel(createWebStandLabelTexture(), 1.4, 0.36);
	label.position.set(0, 1.0, 0.18);
	group.add(label);
	return group;
}

function createWebStandLabelTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 900;
	canvas.height = 220;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#1a1208';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#f4ead0';
	ctx.fillRect(14, 14, canvas.width - 28, canvas.height - 28);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#241a0c';
	fillFittedCanvasText(ctx, 'THE WEB', canvas.width / 2, 110, 760, 116, '900', 'Georgia, "Times New Roman", serif');
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// A flat cobweb in the local x/y plane (anchored corner at the +x edge): radial
// spokes fanning out across a ~90° quarter and a few spiral chord rings strung
// between them, drawn as thin pale translucent threads. A small spider sits near
// the hub. The mesh faces local +z, so the caller tilts/rotates it into a corner.
function createCobweb(threadColor) {
	const group = new THREE.Group();
	const threadMaterial = new THREE.MeshBasicMaterial({
		color: threadColor,
		transparent: true,
		opacity: 0.85,
		depthWrite: false,
	});
	const radius = 1.55;
	const spokeCount = 8;
	const spread = Math.PI * 0.62; // a corner fan, not a full disc
	const start = Math.PI - spread; // spokes sweep from the +y wall round to −x
	const spokeDirs = [];
	for (let i = 0; i < spokeCount; i++) {
		const angle = start + (spread / (spokeCount - 1)) * i;
		const dir = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
		spokeDirs.push(dir);
		group.add(createCylinderBetween(
			new THREE.Vector3(0, 0, 0),
			new THREE.Vector3(dir.x * radius, dir.y * radius, 0),
			0.009,
			threadMaterial,
			5
		));
	}
	// Spiral chord rings: connect successive spokes at growing radii so the strands
	// sag slightly inward, reading as a hand-spun spiral rather than a wheel.
	for (let ring = 1; ring <= 5; ring++) {
		const base = (radius / 6) * ring;
		for (let i = 0; i < spokeCount - 1; i++) {
			const rA = base + ring * 0.03;
			const rB = base + (ring + 1) * 0.03;
			const a = new THREE.Vector3(spokeDirs[i].x * rA, spokeDirs[i].y * rA, 0);
			const b = new THREE.Vector3(spokeDirs[i + 1].x * rB, spokeDirs[i + 1].y * rB, 0);
			group.add(createCylinderBetween(a, b, 0.008, threadMaterial, 5));
		}
	}
	group.add(createTinySpider());
	return group;
}

// A minimal spider: a dark two-segment body and eight bent legs, sized to sit
// flat in the cobweb. Modelled small (~9cm) so it reads as a detail.
function createTinySpider() {
	const spider = new THREE.Group();
	const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x0c0a07, roughness: 0.7 });
	const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 9), bodyMaterial);
	abdomen.scale.set(1, 0.85, 1.25);
	spider.add(abdomen);
	const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 9, 7), bodyMaterial);
	head.position.set(0, 0, -0.1);
	spider.add(head);
	for (const side of [-1, 1]) {
		for (let i = 0; i < 4; i++) {
			const reach = 0.13;
			const ang = 0.5 - i * 0.32;
			const knee = new THREE.Vector3(side * 0.05, 0, -0.06 + i * 0.05);
			const foot = new THREE.Vector3(
				side * (0.05 + reach * Math.cos(ang)),
				-0.065,
				knee.z + reach * Math.sin(ang) * 0.3
			);
			spider.add(createCylinderBetween(knee, foot, 0.006, bodyMaterial, 4));
			spider.add(createCylinderBetween(new THREE.Vector3(0, 0, knee.z), knee, 0.006, bodyMaterial, 4));
		}
	}
	// Perched mid-web, lying flat against the threads (the web is a vertical plane),
	// within the spokes' fan rather than off in the empty corner.
	spider.position.set(-0.2, 0.55, 0.06);
	spider.rotation.x = Math.PI / 2;
	return spider;
}

// A short ceiling rail of literal metal HOOKS hanging from the left longitudinal
// coffer rib — a pun on WordPress "hooks" (do_action / apply_filters). Hung high
// in the front-left quadrant, clear of the central release mobiles, the side
// vignette plinth below, and the back-wall plaques. A small label names the joke.
function addWpHooksRail(group) {
	const rack = createWpHooksRail(0x9aa3ad);
	// A free-standing hook rack centred in the open floor between the two carpets —
	// the central axial runner (x≈0) and the octagon ring carpet (z≈−2) — so it
	// stands clearly in the empty bay rather than crowding a runner or the corner.
	// Turned so its face (label + hook mouths) points back toward the rotunda's
	// main entrance, where the do_action()/apply_filters() joke greets arrivals.
	rack.position.set(-3.3, 0, 1.0);
	rack.rotation.y = 0.82;
	group.add(rack);
}

// A free-standing "WP HOOKS" rack: a weighted base + upright post carrying a
// horizontal rail near eye level, a pair of J-hooks hanging off it (bends opening
// toward the front +x), and a label. Built standing on the floor (y=0).
function createWpHooksRail(metalColor) {
	const group = new THREE.Group();
	const metal = new THREE.MeshStandardMaterial({ color: metalColor, roughness: 0.4, metalness: 0.7 });
	const postTop = 2.3;
	const railY = postTop - 0.12;
	const railLength = 1.7;
	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.09, 20), metal);
	base.position.y = 0.045;
	group.add(base);
	const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, postTop, 14), metal);
	post.position.y = postTop / 2;
	group.add(post);
	const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), metal);
	cap.position.y = postTop + 0.02;
	group.add(cap);
	// Horizontal hook rail near the top, running along local z.
	const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, railLength, 12), metal);
	rail.rotation.x = Math.PI / 2;
	rail.position.set(0, railY, 0);
	group.add(rail);
	// A pair of J-hooks hanging from the rail, flanking the post so neither fouls it.
	const drops = [-0.6, 0.6];
	drops.forEach((z) => {
		const hook = createMetalHook(metal, 0.4);
		hook.position.set(0, railY - 0.03, z);
		// Turn each hook ~45° outward (left out left, right out right) so its curl shows.
		hook.rotation.y = -Math.sign(z) * (Math.PI / 4);
		group.add(hook);
	});
	// "WP HOOKS · do_action()/apply_filters()" plate at eye level, facing +x.
	const label = createReadableLabel(createWpHooksLabelTexture(), 1.5, 0.37);
	label.position.set(0.08, 1.4, 0);
	label.rotation.y = Math.PI / 2; // front (+z) turns to face +x, the interior
	group.add(label);
	return group;
}

// One hanging J-hook: a long vertical shank dropping from the rail, ending in a
// short open curl that turns back up into a stubby lip. The long shank + short
// curled tip with a clear gap reads unmistakably as a hook (not a near-closed
// ring). Built hanging from local y≈0 downward, curl in the x/y plane.
function createMetalHook(material, shankLength) {
	const hook = new THREE.Group();
	const tube = 0.02;
	const radius = 0.12;
	const shank = new THREE.Mesh(
		new THREE.CylinderGeometry(tube, tube, shankLength, 10),
		material
	);
	shank.position.y = -shankLength / 2;
	hook.add(shank);
	// A just-past-half torus arc: it meets the shank bottom heading straight down,
	// sweeps under, and comes back up into a short tip — leaving a wide-open mouth.
	const bend = new THREE.Mesh(
		new THREE.TorusGeometry(radius, tube, 10, 28, Math.PI * 1.08),
		material
	);
	bend.rotation.z = Math.PI;
	bend.position.set(radius, -shankLength, 0);
	hook.add(bend);
	return hook;
}

function createWpHooksLabelTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 900;
	canvas.height = 220;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#1a1208';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#f4ead0';
	ctx.fillRect(14, 14, canvas.width - 28, canvas.height - 28);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#241a0c';
	fillFittedCanvasText(ctx, 'WP HOOKS', canvas.width / 2, 78, 800, 76, '900', 'Arial Black, Impact, sans-serif');
	ctx.fillStyle = '#7a5a1c';
	ctx.font = '700 42px ui-monospace, Menlo, monospace';
	ctx.fillText('do_action()  ·  apply_filters()', canvas.width / 2, 156);
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// The same brass-framed browser-window picture as the Dashboard set, but built
// at local y=0 so it can be flush-mounted on an angled side wall via
// placeOnSideWall (height set there) instead of the front wall.
function createSideWallScreenshot(spec, side, z) {
	const inner = new THREE.Group();
	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(eraPanelArtW + 0.16, eraPanelArtH + 0.16, 0.08),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	frame.position.z = -0.02;
	inner.add(frame);
	const art = new THREE.Mesh(
		new THREE.PlaneGeometry(eraPanelArtW, eraPanelArtH),
		new THREE.MeshBasicMaterial({ map: createBrowserScreenshotTexture(spec) })
	);
	art.position.z = 0.05;
	inner.add(art);
	// Stand the frame proud of the angled wall: the 0.08-deep frame's back face
	// tucks into the 0.26-thick wall while the picture clears its inner surface by
	// ~0.05, so it reads as hung art without z-fighting.
	placeOnSideWall(inner, side, z, eraPanelY, 0.15);
	return inner;
}

// A brass-framed picture carrying a single browser-window screenshot canvas.
// Sized to slot between the entrance jambs and the corner without crowding.
function createBrowserScreenshotPlaque(spec) {
	const group = new THREE.Group();
	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(eraPanelArtW + 0.16, eraPanelArtH + 0.16, 0.08),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	frame.position.set(0, eraPanelY, 0);
	group.add(frame);
	const art = new THREE.Mesh(
		new THREE.PlaneGeometry(eraPanelArtW, eraPanelArtH),
		new THREE.MeshBasicMaterial({ map: createBrowserScreenshotTexture(spec) })
	);
	art.position.set(0, eraPanelY, 0.05);
	group.add(art);
	return group;
}

function createBrowserScreenshotTexture(spec) {
	const canvas = document.createElement('canvas');
	canvas.width = 768;
	canvas.height = 636;
	const ctx = canvas.getContext('2d');

	// Cream matte mount with a thin keyline, like the other gallery plaques.
	ctx.fillStyle = '#1a1208';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#f4ead0';
	ctx.fillRect(14, 14, canvas.width - 28, canvas.height - 28);

	// Browser window inset into the mount, with a period chrome bar on top.
	const bx = 46;
	const by = 44;
	const bw = canvas.width - 92;
	const bh = 470;
	const content = drawPeriodBrowserChrome(ctx, bx, by, bw, bh, spec.url);
	ctx.save();
	ctx.beginPath();
	ctx.rect(content.x, content.y, content.w, content.h);
	ctx.clip();
	spec.draw(ctx, content.x, content.y, content.w, content.h);
	ctx.restore();

	// Engraved caption on the mount below the window.
	ctx.fillStyle = '#241a0c';
	ctx.font = '900 36px Georgia, serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	ctx.fillText(spec.caption, canvas.width / 2, by + bh + 56);
	ctx.fillStyle = '#9a7a3a';
	ctx.font = '700 22px ui-monospace, Menlo, monospace';
	ctx.fillText(spec.url, canvas.width / 2, by + bh + 92);

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// A mid-2000s browser frame: silver title bar with square min/max/close boxes,
// a toolbar with Back/Forward, and a recessed address bar showing the URL.
// Returns the inner content rectangle for the page drawing.
function drawPeriodBrowserChrome(ctx, x, y, w, h, url) {
	const titleH = 34;
	const toolH = 44;
	// Window body shell.
	ctx.fillStyle = '#aeb6c2';
	ctx.fillRect(x - 3, y - 3, w + 6, h + 6);

	// Title bar — brushed silver with a faint gradient.
	const tb = ctx.createLinearGradient(0, y, 0, y + titleH);
	tb.addColorStop(0, '#f2f4f8');
	tb.addColorStop(1, '#c3cbd7');
	ctx.fillStyle = tb;
	ctx.fillRect(x, y, w, titleH);
	ctx.fillStyle = '#41485a';
	ctx.font = '700 18px Tahoma, "Segoe UI", sans-serif';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText('Web Browser', x + 12, y + titleH / 2 + 1);
	// Square window controls (minimise / maximise / close).
	const btn = (cx, label, fill) => {
		ctx.fillStyle = fill;
		ctx.fillRect(cx, y + 7, 20, 18);
		ctx.strokeStyle = '#6b7486';
		ctx.lineWidth = 1;
		ctx.strokeRect(cx + 0.5, y + 7.5, 19, 17);
		ctx.fillStyle = label === '✕' ? '#ffffff' : '#2a3142';
		ctx.font = '700 13px Tahoma, sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(label, cx + 10, y + 16);
		ctx.textAlign = 'left';
	};
	btn(x + w - 74, '_', '#dfe4ec');
	btn(x + w - 50, '□', '#dfe4ec');
	btn(x + w - 26, '✕', '#c2453a');

	// Toolbar with the address bar.
	const ty = y + titleH;
	const tg = ctx.createLinearGradient(0, ty, 0, ty + toolH);
	tg.addColorStop(0, '#eef1f6');
	tg.addColorStop(1, '#d4dae3');
	ctx.fillStyle = tg;
	ctx.fillRect(x, ty, w, toolH);
	// Back / forward chevrons.
	const chevron = (cx, dir) => {
		ctx.fillStyle = '#7d8698';
		ctx.beginPath();
		ctx.moveTo(cx, ty + toolH / 2);
		ctx.lineTo(cx + dir * 11, ty + toolH / 2 - 8);
		ctx.lineTo(cx + dir * 11, ty + toolH / 2 + 8);
		ctx.closePath();
		ctx.fill();
	};
	chevron(x + 18, -1);
	chevron(x + 36, -1);
	chevron(x + 52, 1);
	// "Address" label + recessed white URL field.
	ctx.fillStyle = '#5a6272';
	ctx.font = '700 15px Tahoma, sans-serif';
	ctx.textAlign = 'left';
	ctx.fillText('Address', x + 74, ty + toolH / 2 + 1);
	const ax = x + 148;
	const aw = w - 148 - 14;
	const ah = 24;
	const ayy = ty + (toolH - ah) / 2;
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(ax, ayy, aw, ah);
	ctx.strokeStyle = '#9aa3b2';
	ctx.lineWidth = 1;
	ctx.strokeRect(ax + 0.5, ayy + 0.5, aw - 1, ah - 1);
	// Tiny page favicon dot + the URL text.
	ctx.fillStyle = '#3a8fd8';
	ctx.fillRect(ax + 6, ayy + 7, 10, 10);
	ctx.fillStyle = '#1a1a1a';
	ctx.font = '15px ui-monospace, Menlo, monospace';
	ctx.fillText(url, ax + 24, ayy + ah / 2 + 1);
	// "Go" button at the field's right edge.
	ctx.fillStyle = '#dfe4ec';
	ctx.fillRect(ax + aw - 34, ayy, 34, ah);
	ctx.strokeRect(ax + aw - 33.5, ayy + 0.5, 33, ah - 1);
	ctx.fillStyle = '#2a3142';
	ctx.textAlign = 'center';
	ctx.fillText('Go', ax + aw - 17, ayy + ah / 2 + 1);

	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	return { x, y: ty + toolH, w, h: h - titleH - toolH };
}

// YouTube, 2005 — the original red-on-white "Broadcast Yourself" layout: a red
// wordmark in a rounded box, a search row, and a featured video with a big
// play triangle over a grey thumbnail.
function drawSiteYouTube2005(ctx, x, y, w, h) {
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(x, y, w, h);
	// Header band.
	ctx.fillStyle = '#f4f4f4';
	ctx.fillRect(x, y, w, 64);
	ctx.strokeStyle = '#dcdcdc';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(x, y + 64);
	ctx.lineTo(x + w, y + 64);
	ctx.stroke();
	// "You" + red "Tube" lozenge logo.
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#222222';
	ctx.font = '900 38px Arial, Helvetica, sans-serif';
	ctx.fillText('You', x + 20, y + 33);
	const youW = ctx.measureText('You').width;
	const tubeX = x + 20 + youW + 4;
	ctx.fillStyle = '#cc181e';
	roundRectPath(ctx, tubeX, y + 12, 92, 40, 7);
	ctx.fill();
	ctx.fillStyle = '#ffffff';
	ctx.fillText('Tube', tubeX + 9, y + 33);
	ctx.fillStyle = '#888888';
	ctx.font = 'italic 13px Arial, sans-serif';
	ctx.fillText('Broadcast Yourself ™', tubeX + 100, y + 36);
	// Search row.
	const sy = y + 84;
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(x + 20, sy, w - 150, 30);
	ctx.strokeStyle = '#aaaaaa';
	ctx.strokeRect(x + 20.5, sy + 0.5, w - 150, 29);
	ctx.fillStyle = '#999999';
	ctx.font = '15px Arial, sans-serif';
	ctx.fillText('Search', x + 30, sy + 16);
	ctx.fillStyle = '#e6e6e6';
	ctx.fillRect(x + w - 122, sy, 60, 30);
	ctx.strokeRect(x + w - 121.5, sy + 0.5, 59, 29);
	ctx.fillStyle = '#333333';
	ctx.font = '700 14px Arial, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText('Search', x + w - 92, sy + 16);
	// Featured video thumbnail with a play triangle.
	const vx = x + 20;
	const vy = y + 132;
	const vw = w - 40;
	const vh = h - 168;
	ctx.fillStyle = '#cfcfcf';
	ctx.fillRect(vx, vy, vw, vh);
	ctx.fillStyle = '#bdbdbd';
	for (let i = 0; i < 6; i++) {
		ctx.fillRect(vx + 20 + i * (vw / 6), vy + 16, vw / 6 - 16, vh - 56);
	}
	const pcx = vx + vw / 2;
	const pcy = vy + vh / 2 - 8;
	ctx.fillStyle = 'rgba(0,0,0,0.55)';
	ctx.beginPath();
	ctx.arc(pcx, pcy, 34, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#ffffff';
	ctx.beginPath();
	ctx.moveTo(pcx - 11, pcy - 16);
	ctx.lineTo(pcx - 11, pcy + 16);
	ctx.lineTo(pcx + 18, pcy);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = '#333333';
	ctx.font = '700 16px Arial, sans-serif';
	ctx.textAlign = 'left';
	ctx.fillText('Featured Video', vx, vy + vh + 22);
}

// Twitter, 2006 — the early light-blue "Twttr" build: a rounded logo, the
// "What are you doing?" status box with an update button, and a couple of
// timeline rows of short messages.
function drawSiteTwitter2006(ctx, x, y, w, h) {
	ctx.fillStyle = '#eaf4fb';
	ctx.fillRect(x, y, w, h);
	// Header band.
	ctx.fillStyle = '#9ae4f8';
	ctx.fillRect(x, y, w, 56);
	ctx.fillStyle = '#ffffff';
	ctx.font = '900 34px "Comic Sans MS", "Trebuchet MS", sans-serif';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText('twttr', x + 22, y + 29);
	ctx.fillStyle = '#3a7d9a';
	ctx.font = 'italic 14px "Trebuchet MS", sans-serif';
	ctx.fillText('a global community of friends', x + 132, y + 31);
	// "What are you doing?" prompt + status box.
	ctx.fillStyle = '#33627a';
	ctx.font = '700 22px "Trebuchet MS", Arial, sans-serif';
	ctx.fillText('What are you doing?', x + 22, y + 92);
	const sx = x + 22;
	const sy = y + 112;
	const sw = w - 150;
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(sx, sy, sw, 56);
	ctx.strokeStyle = '#9cc4d6';
	ctx.lineWidth = 1.5;
	ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, 55);
	// Update button.
	ctx.fillStyle = '#a8e24b';
	roundRectPath(ctx, x + w - 116, sy + 8, 94, 40, 6);
	ctx.fill();
	ctx.fillStyle = '#3a5c10';
	ctx.font = '700 18px "Trebuchet MS", Arial, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText('update', x + w - 69, sy + 28);
	// Timeline rows.
	const rows = [
		{ name: 'jack', msg: 'inviting coworkers' },
		{ name: 'biz', msg: 'reading on the couch' },
		{ name: 'noah', msg: 'eating a sandwich' },
	];
	ctx.textAlign = 'left';
	rows.forEach((r, i) => {
		const ry = y + 196 + i * 56;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(x + 22, ry, w - 44, 46);
		ctx.fillStyle = '#cfe7f1';
		ctx.fillRect(x + 30, ry + 8, 30, 30);
		ctx.fillStyle = '#2a5c75';
		ctx.font = '700 16px "Trebuchet MS", Arial, sans-serif';
		ctx.fillText(r.name, x + 70, ry + 19);
		ctx.fillStyle = '#444444';
		ctx.font = '15px "Trebuchet MS", Arial, sans-serif';
		ctx.fillText(r.msg, x + 70, ry + 37);
	});
}

// Facebook, 2007 — "The Facebook" had just become facebook.com: the deep-blue
// top bar with the lowercase wordmark, a left profile column, and a centre feed
// of status/photo stories on the familiar pale-blue canvas.
function drawSiteFacebook2007(ctx, x, y, w, h) {
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(x, y, w, h);
	// Dark-blue brand bar.
	ctx.fillStyle = '#3b5998';
	ctx.fillRect(x, y, w, 46);
	ctx.fillStyle = '#ffffff';
	ctx.font = '900 26px "Lucida Grande", Helvetica, Arial, sans-serif';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText('facebook', x + 16, y + 24);
	// Search pill on the right of the bar.
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(x + w - 150, y + 12, 134, 22);
	ctx.fillStyle = '#999999';
	ctx.font = '13px Arial, sans-serif';
	ctx.fillText('Search', x + w - 142, y + 23);
	// Pale-blue page canvas.
	ctx.fillStyle = '#eceff5';
	ctx.fillRect(x, y + 46, w, h - 46);
	// Left profile column.
	const colX = x + 16;
	const colY = y + 62;
	const colW = 132;
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(colX, colY, colW, h - 78);
	ctx.strokeStyle = '#cdd3e0';
	ctx.lineWidth = 1;
	ctx.strokeRect(colX + 0.5, colY + 0.5, colW - 1, h - 79);
	ctx.fillStyle = '#9aa6c6';
	ctx.fillRect(colX + 16, colY + 14, colW - 32, colW - 32); // profile photo
	ctx.fillStyle = '#3b5998';
	ctx.font = '700 16px Arial, sans-serif';
	ctx.fillText('Your Name', colX + 16, colY + colW + 2);
	ctx.fillStyle = '#888888';
	ctx.font = '12px Arial, sans-serif';
	['View Photos', 'Edit Profile', 'Wall', 'Friends'].forEach((t, i) => {
		ctx.fillText('• ' + t, colX + 16, colY + colW + 26 + i * 18);
	});
	// Centre news feed.
	const feedX = colX + colW + 16;
	const feedW = x + w - 16 - feedX;
	ctx.fillStyle = '#3b5998';
	ctx.font = '700 16px Arial, sans-serif';
	ctx.fillText('News Feed', feedX, colY + 10);
	for (let i = 0; i < 3; i++) {
		const ry = colY + 28 + i * 86;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(feedX, ry, feedW, 74);
		ctx.strokeStyle = '#cdd3e0';
		ctx.strokeRect(feedX + 0.5, ry + 0.5, feedW - 1, 73);
		ctx.fillStyle = '#bcc6dd';
		ctx.fillRect(feedX + 10, ry + 12, 40, 40);
		ctx.fillStyle = '#3b5998';
		ctx.font = '700 14px Arial, sans-serif';
		ctx.fillText('A friend', feedX + 60, ry + 22);
		ctx.fillStyle = '#555555';
		ctx.font = '13px Arial, sans-serif';
		ctx.fillText('updated their status', feedX + 60, ry + 42);
		ctx.fillStyle = '#888888';
		ctx.font = '11px Arial, sans-serif';
		ctx.fillText('2 minutes ago · Comment · Like', feedX + 60, ry + 60);
	}
}

// Google, 1998 — the famously spare home page: a near-empty white field, the
// multicolour wordmark centred high, a single search box, and the twin
// "Google Search" / "I'm Feeling Lucky" buttons beneath it.
function drawSiteGoogle1998(ctx, x, y, w, h) {
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(x, y, w, h);
	const cx = x + w / 2;
	// Wordmark in the classic blue/red/yellow/blue/green/red letter colours.
	const letters = [
		['G', '#4285f4'],
		['o', '#ea4335'],
		['o', '#fbbc05'],
		['g', '#4285f4'],
		['l', '#34a853'],
		['e', '#ea4335'],
	];
	ctx.font = '900 56px "Times New Roman", Georgia, serif';
	ctx.textBaseline = 'alphabetic';
	ctx.textAlign = 'left';
	const total = letters.reduce((sum, [ch]) => sum + ctx.measureText(ch).width, 0);
	let lx = cx - total / 2;
	const ly = y + 86;
	letters.forEach(([ch, color]) => {
		ctx.fillStyle = color;
		ctx.fillText(ch, lx, ly);
		lx += ctx.measureText(ch).width;
	});
	// Search box with a faint inner shadow line, centred under the logo.
	const boxW = Math.min(w - 80, 380);
	const boxX = cx - boxW / 2;
	const boxY = y + 118;
	const boxH = 30;
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(boxX, boxY, boxW, boxH);
	ctx.strokeStyle = '#9aa3b2';
	ctx.lineWidth = 1.5;
	ctx.strokeRect(boxX + 0.75, boxY + 0.75, boxW - 1.5, boxH - 1.5);
	ctx.fillStyle = 'rgba(0,0,0,0.08)';
	ctx.fillRect(boxX + 1.5, boxY + 1.5, boxW - 3, 6);
	// The two grey beveled buttons.
	const buttons = ['Google Search', "I'm Feeling Lucky"];
	ctx.font = '13px Arial, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	let bx = cx - 150;
	buttons.forEach((label) => {
		const bw = ctx.measureText(label).width + 24;
		const by = boxY + boxH + 16;
		const bh = 26;
		ctx.fillStyle = '#f0f0f0';
		ctx.fillRect(bx, by, bw, bh);
		ctx.strokeStyle = '#b8b8b8';
		ctx.lineWidth = 1;
		ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
		ctx.fillStyle = '#3a3a3a';
		ctx.fillText(label, bx + bw / 2, by + bh / 2 + 1);
		bx += bw + 14;
	});
	// The tiny footer tagline of the day.
	ctx.fillStyle = '#777777';
	ctx.font = '12px Arial, sans-serif';
	ctx.fillText('Searching 1,346,966,000 web pages', cx, y + h - 24);
}

// Yahoo!, early-2000s portal — the busy directory front page: the red exclaimed
// wordmark, a wide search box with a "Search" button, and a two-column grid of
// blue category links in the classic Yahoo! directory style.
function drawSiteYahoo(ctx, x, y, w, h) {
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(x, y, w, h);
	const cx = x + w / 2;
	// "Yahoo!" wordmark — red letters with a purple exclamation flourish.
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	ctx.font = '900 46px Verdana, Geneva, sans-serif';
	const mark = 'Yahoo';
	const markW = ctx.measureText(mark).width;
	ctx.fillStyle = '#e0001a';
	ctx.fillText(mark, cx - 8, y + 56);
	ctx.fillStyle = '#7b0099';
	ctx.font = '900 46px Verdana, Geneva, sans-serif';
	ctx.fillText('!', cx - 8 + markW / 2 + 12, y + 56);
	// Centred search box + button.
	const boxW = Math.min(w - 120, 360);
	const boxX = cx - boxW / 2 - 32;
	const boxY = y + 76;
	const boxH = 28;
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(boxX, boxY, boxW, boxH);
	ctx.strokeStyle = '#8a93a2';
	ctx.lineWidth = 1.5;
	ctx.strokeRect(boxX + 0.75, boxY + 0.75, boxW - 1.5, boxH - 1.5);
	ctx.fillStyle = '#3a3f7a';
	ctx.fillRect(boxX + boxW + 6, boxY, 58, boxH);
	ctx.fillStyle = '#ffffff';
	ctx.font = '700 13px Arial, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('Search', boxX + boxW + 35, boxY + boxH / 2 + 1);
	// Directory heading + a two-column list of blue category links.
	ctx.fillStyle = '#444444';
	ctx.font = '700 14px Arial, sans-serif';
	ctx.textAlign = 'left';
	ctx.fillText('Yahoo! Directory', x + 20, y + 128);
	const categories = [
		'Arts & Humanities',
		'Business & Economy',
		'Computers & Internet',
		'Education',
		'Entertainment',
		'Government',
		'Health',
		'News & Media',
		'Recreation & Sports',
		'Reference',
		'Regional',
		'Science',
	];
	ctx.font = '13px Arial, sans-serif';
	const colW = (w - 40) / 2;
	const rows = Math.ceil(categories.length / 2);
	categories.forEach((cat, i) => {
		const col = Math.floor(i / rows);
		const row = i % rows;
		const tx = x + 20 + col * colW;
		const ty = y + 150 + row * 22;
		ctx.fillStyle = '#1a4fd0';
		ctx.fillText(cat, tx, ty);
		ctx.strokeStyle = '#1a4fd0';
		ctx.lineWidth = 0.75;
		ctx.beginPath();
		ctx.moveTo(tx, ty + 3.5);
		ctx.lineTo(tx + ctx.measureText(cat).width, ty + 3.5);
		ctx.stroke();
	});
}

// Flat design (the Modern Admin era, ~2014): bold flat colour blocks, no
// gradients or shadows, simple line/long-shadow icons — the anti-skeuomorphism.
function createFlatDesignPanel() {
	return createFramedPlaque(createFlatDesignTexture());
}

function createFlatDesignTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 372;
	const ctx = canvas.getContext('2d');

	// Solid flat field.
	ctx.fillStyle = '#ecf0f1';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Flat colour title band — no gradient.
	ctx.fillStyle = '#1abc9c';
	ctx.fillRect(0, 0, canvas.width, 64);
	ctx.fillStyle = '#ffffff';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '900 30px Arial Black, Impact, sans-serif';
	ctx.fillText('FLAT DESIGN · 2014', 256, 32);

	// A row of flat colour tiles, each with a simple long-shadow glyph.
	const tiles = [
		{ c: '#e74c3c', glyph: '✦' },
		{ c: '#3498db', glyph: '✉' },
		{ c: '#f1c40f', glyph: '★' },
		{ c: '#9b59b6', glyph: '⚙' },
	];
	const tw = 104;
	const th = 104;
	const gap = 16;
	const startX = (canvas.width - (tiles.length * tw + (tiles.length - 1) * gap)) / 2;
	const ty = 92;
	tiles.forEach((t, i) => {
		const tx = startX + i * (tw + gap);
		ctx.fillStyle = t.c;
		ctx.fillRect(tx, ty, tw, th);
		// Long shadow: a diagonal flat-darker wedge from the glyph.
		ctx.save();
		ctx.beginPath();
		ctx.rect(tx, ty, tw, th);
		ctx.clip();
		ctx.fillStyle = 'rgba(0,0,0,0.16)';
		ctx.beginPath();
		ctx.moveTo(tx + 30, ty + 38);
		ctx.lineTo(tx + 74, ty + 38);
		ctx.lineTo(tx + tw + 60, ty + th + 60);
		ctx.lineTo(tx + 30 + 60, ty + th + 60);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
		ctx.fillStyle = '#ffffff';
		ctx.font = '52px system-ui, "Segoe UI Symbol", sans-serif';
		ctx.fillText(t.glyph, tx + tw / 2, ty + th / 2 + 4);
	});

	// Two flat full-width buttons, hard edges, no bevels.
	ctx.fillStyle = '#2ecc71';
	ctx.fillRect(64, 224, 184, 50);
	ctx.fillStyle = '#34495e';
	ctx.fillRect(264, 224, 184, 50);
	ctx.fillStyle = '#ffffff';
	ctx.font = '800 22px system-ui, sans-serif';
	ctx.fillText('Get started', 156, 250);
	ctx.fillText('Learn more', 356, 250);

	// Thin flat caption rules.
	ctx.fillStyle = '#bdc3c7';
	ctx.fillRect(64, 300, 384, 8);
	ctx.fillRect(64, 322, 260, 8);
	ctx.fillStyle = '#7f8c8d';
	ctx.font = '700 16px system-ui, sans-serif';
	ctx.fillText('no gradients · no bevels · no drop shadows', 256, 352);

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// Material Design (the API and Customizer era, ~2016): paper-metaphor cards
// with elevation shadows, a bold primary app bar, a ripple hint and the FAB.
function createMaterialDesignPanel() {
	return createFramedPlaque(createMaterialDesignTexture());
}

function createMaterialDesignTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 372;
	const ctx = canvas.getContext('2d');

	// Light grey "surface" backdrop.
	ctx.fillStyle = '#eceff1';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Bold primary-colour app bar (Indigo 500).
	ctx.fillStyle = '#3f51b5';
	ctx.fillRect(0, 0, canvas.width, 64);
	ctx.fillStyle = '#ffffff';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '900 28px Arial Black, Impact, sans-serif';
	ctx.fillText('MATERIAL DESIGN · 2016', 256, 32);
	// Hamburger + overflow icons on the bar.
	ctx.strokeStyle = 'rgba(255,255,255,0.9)';
	ctx.lineWidth = 2.5;
	for (let i = 0; i < 3; i++) {
		ctx.beginPath();
		ctx.moveTo(20, 22 + i * 8);
		ctx.lineTo(40, 22 + i * 8);
		ctx.stroke();
	}
	ctx.fillStyle = 'rgba(255,255,255,0.9)';
	for (let i = 0; i < 3; i++) {
		ctx.beginPath();
		ctx.arc(484, 22 + i * 9, 2.4, 0, Math.PI * 2);
		ctx.fill();
	}

	// Elevated paper cards with soft drop shadows.
	const drawCard = (x, y, w, h, accent) => {
		ctx.save();
		ctx.shadowColor = 'rgba(0,0,0,0.28)';
		ctx.shadowBlur = 12;
		ctx.shadowOffsetY = 6;
		ctx.fillStyle = '#ffffff';
		roundRectPath(ctx, x, y, w, h, 4);
		ctx.fill();
		ctx.restore();
		// Coloured media strip.
		ctx.save();
		roundRectPath(ctx, x, y, w, h, 4);
		ctx.clip();
		ctx.fillStyle = accent;
		ctx.fillRect(x, y, w, 46);
		ctx.restore();
		// Title + body lines.
		ctx.fillStyle = '#212121';
		ctx.fillRect(x + 14, y + 60, w - 40, 10);
		ctx.fillStyle = '#9e9e9e';
		ctx.fillRect(x + 14, y + 80, w - 28, 6);
		ctx.fillRect(x + 14, y + 94, w - 50, 6);
	};
	drawCard(40, 92, 198, 150, '#26a69a');
	drawCard(274, 92, 198, 150, '#ef5350');

	// Ripple hint on the right card — concentric translucent rings.
	ctx.save();
	ctx.beginPath();
	ctx.rect(274, 92, 198, 150);
	ctx.clip();
	for (let i = 3; i >= 1; i--) {
		ctx.fillStyle = `rgba(255,255,255,${0.12 * i})`;
		ctx.beginPath();
		ctx.arc(360, 170, i * 26, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();

	// Caption.
	ctx.fillStyle = '#616161';
	ctx.font = '700 16px Roboto, system-ui, sans-serif';
	ctx.fillText('elevation · ink & paper · the floating action button', 246, 300);

	// Floating Action Button (FAB) with a "+" and its own shadow.
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.4)';
	ctx.shadowBlur = 10;
	ctx.shadowOffsetY = 5;
	ctx.fillStyle = '#ff4081';
	ctx.beginPath();
	ctx.arc(446, 322, 34, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.moveTo(446 - 14, 322);
	ctx.lineTo(446 + 14, 322);
	ctx.moveTo(446, 322 - 14);
	ctx.lineTo(446, 322 + 14);
	ctx.stroke();

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// Big type & whitespace (the Block Editor era, ~2018): an oversized editorial
// headline, generous margins, hairline rules — minimalist content-first design.
function createBigTypePanel() {
	return createFramedPlaque(createBigTypeTexture());
}

function createBigTypeTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 372;
	const ctx = canvas.getContext('2d');

	// Clean off-white page.
	ctx.fillStyle = '#fbfbf9';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Small eyebrow label.
	ctx.fillStyle = '#111111';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.font = '800 14px system-ui, sans-serif';
	ctx.fillText('B I G   T Y P E   ·   2 0 1 8', 56, 64);

	// Hairline rule under the eyebrow.
	ctx.strokeStyle = '#111111';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(56, 76);
	ctx.lineTo(456, 76);
	ctx.stroke();

	// Oversized editorial headline, set tight across two lines.
	ctx.fillStyle = '#111111';
	ctx.font = '900 76px Georgia, "Times New Roman", serif';
	ctx.fillText('Less', 52, 168);
	ctx.fillText('chrome,', 52, 240);
	ctx.font = '900 76px Georgia, "Times New Roman", serif';
	ctx.fillStyle = '#b8b2a6';
	ctx.fillText('more', 232, 168);

	// A single thin accent hairline in the whitespace.
	ctx.strokeStyle = '#111111';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(52, 276);
	ctx.lineTo(140, 276);
	ctx.stroke();

	// Quiet caption set small, far from the headline (whitespace).
	ctx.fillStyle = '#6b6b6b';
	ctx.font = '400 17px Georgia, serif';
	ctx.fillText('Generous margins. Thin rules. The content is the interface.', 52, 312);

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// Dark mode & system fonts (the Blocks Everywhere era, ~2022): a dark UI card,
// a native system-font stack sample, a light/dark toggle and an FSE block hint.
function createDarkModePanel() {
	return createFramedPlaque(createDarkModeTexture());
}

function createDarkModeTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 372;
	const ctx = canvas.getContext('2d');

	// Deep slate dark-mode surface.
	ctx.fillStyle = '#0f172a';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = '#e2e8f0';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '900 28px Arial Black, Impact, sans-serif';
	ctx.fillText('DARK MODE · 2022', 256, 34);
	ctx.fillStyle = '#64748b';
	ctx.font = '700 15px system-ui, sans-serif';
	ctx.fillText('system fonts · prefers-color-scheme · full-site editing', 256, 62);

	// Elevated dark card.
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.5)';
	ctx.shadowBlur = 14;
	ctx.shadowOffsetY = 6;
	ctx.fillStyle = '#1e293b';
	roundRectPath(ctx, 40, 88, 432, 170, 14);
	ctx.fill();
	ctx.restore();
	ctx.strokeStyle = 'rgba(148,163,184,0.18)';
	ctx.lineWidth = 1;
	roundRectPath(ctx, 40, 88, 432, 170, 14);
	ctx.stroke();

	// System-font stack sample, set in the actual native UI font.
	ctx.textAlign = 'left';
	ctx.fillStyle = '#f1f5f9';
	ctx.font = '600 26px -apple-system, "Segoe UI", system-ui, sans-serif';
	ctx.fillText('The quick brown fox', 64, 134);
	ctx.fillStyle = '#94a3b8';
	ctx.font = '13px ui-monospace, Menlo, monospace';
	ctx.fillText('font-family: -apple-system, "Segoe UI", system-ui;', 64, 162);

	// Accent block "hint" bar (WordPress block-blue) with handles.
	ctx.fillStyle = '#3858e9';
	roundRectPath(ctx, 64, 184, 280, 44, 8);
	ctx.fill();
	ctx.fillStyle = 'rgba(255,255,255,0.9)';
	ctx.font = '700 16px system-ui, sans-serif';
	ctx.fillText('Group block', 80, 207);
	// Block selection handles.
	ctx.fillStyle = '#3858e9';
	[[64, 184], [344, 184], [64, 228], [344, 228]].forEach(([hx, hy]) => {
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(hx - 3, hy - 3, 6, 6);
		ctx.strokeStyle = '#3858e9';
		ctx.lineWidth = 1.5;
		ctx.strokeRect(hx - 3, hy - 3, 6, 6);
	});

	// Light/dark toggle (currently "dark" = on, knob to the right, moon glyph).
	drawDayNightToggle(ctx, 372, 192, 84, 36);

	// Caption.
	ctx.fillStyle = '#64748b';
	ctx.textAlign = 'center';
	ctx.font = '700 15px system-ui, sans-serif';
	ctx.fillText('one theme, two appearances', 256, 296);

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function drawDayNightToggle(ctx, x, y, w, h) {
	const r = h / 2;
	// Dark track (toggle is in dark mode).
	ctx.fillStyle = '#0b1120';
	roundRectPath(ctx, x, y, w, h, r);
	ctx.fill();
	ctx.strokeStyle = 'rgba(148,163,184,0.3)';
	ctx.lineWidth = 1.5;
	roundRectPath(ctx, x, y, w, h, r);
	ctx.stroke();
	// Tiny sun on the left.
	ctx.fillStyle = 'rgba(148,163,184,0.5)';
	ctx.font = '16px system-ui, "Segoe UI Symbol", sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('☀', x + r, y + h / 2);
	// Knob on the right with a crescent moon.
	const kx = x + w - h + 3;
	ctx.fillStyle = '#e2e8f0';
	ctx.beginPath();
	ctx.arc(kx + (h - 6) / 2, y + h / 2, (h - 6) / 2, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#1e293b';
	ctx.font = '15px system-ui, "Segoe UI Symbol", sans-serif';
	ctx.fillText('☾', kx + (h - 6) / 2, y + h / 2 + 1);
	ctx.textBaseline = 'alphabetic';
}

function createEraCatchphraseSign(room, color, secondary) {
	const group = new THREE.Group();
	const phrase = getEraCatchphrase(room.era);
	// Two front-facing planes sharing one material — a single DoubleSide plane
	// would render the text mirrored on its back face.
	const boardGeometry = new THREE.PlaneGeometry(4.8, 1.05);
	const boardMaterial = new THREE.MeshBasicMaterial({
		map: createNeonSignTexture(phrase, color, secondary),
		transparent: true,
		depthWrite: false,
	});
	const board = new THREE.Group();
	for (const facing of [0, Math.PI]) {
		const face = new THREE.Mesh(boardGeometry, boardMaterial);
		face.rotation.y = facing;
		face.position.z = facing === 0 ? 0.006 : -0.006;
		board.add(face);
	}
	const baseY = wallHeight - 1.85;
	const signZ = 0.6;
	board.position.set(0, baseY, signZ);
	board.rotation.y = Math.PI;
	registerAnimation(board, (object, elapsed) => {
		object.position.y = baseY + Math.sin(elapsed * 0.95) * 0.045;
	});
	group.add(board);

	const halo = new THREE.Mesh(
		new THREE.PlaneGeometry(5.4, 1.6),
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.12,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide,
		})
	);
	halo.position.set(0, baseY, signZ + 0.06);
	halo.rotation.y = Math.PI;
	registerAnimation(halo, (object, elapsed) => {
		object.material.opacity = 0.08 + (Math.sin(elapsed * 2.4) * 0.5 + 0.5) * 0.18;
	});
	group.add(halo);

	const lineMat = new THREE.MeshBasicMaterial({
		color: 0xfff5df,
		transparent: true,
		opacity: 0.5,
	});
	for (const xSign of [-1, 1]) {
		const cable = new THREE.Mesh(
			new THREE.CylinderGeometry(0.018, 0.018, 0.95, 6),
			lineMat
		);
		cable.position.set(xSign * 1.95, wallHeight - 0.9, signZ);
		group.add(cable);
	}
	return group;
}

function createNeonSignTexture(text, color, secondary) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 224;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = 'rgba(8, 12, 24, 0.94)';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = color;
	ctx.globalAlpha = 0.22;
	ctx.fillRect(12, 12, canvas.width - 24, canvas.height - 24);
	ctx.globalAlpha = 1;
	ctx.strokeStyle = color;
	ctx.lineWidth = 4;
	ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
	ctx.strokeStyle = secondary;
	ctx.lineWidth = 1.5;
	ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

	const phraseColor = color;
	ctx.fillStyle = phraseColor;
	ctx.font = '900 92px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.shadowColor = phraseColor;
	ctx.shadowBlur = 22;
	ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
	ctx.shadowBlur = 0;
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 92px Arial Black, Impact, sans-serif';
	ctx.fillText(text, canvas.width / 2, canvas.height / 2);

	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function getEraCatchphrase(era) {
	return {
		'Blogging Roots': 'Hello, world.',
		'Dashboard Foundations': 'Just write.',
		'CMS Toolkit': 'Not just a blog.',
		'Modern Admin': 'MP6 is here.',
		'API and Customizer': '/wp-json',
		'Block Editor': '/ to add a block',
		'Blocks Everywhere': 'Everything is a block.',
	}[era] || 'Code is poetry.';
}

function addEraModelProps(group, room, roomIndex, color, secondary) {
	// Grounded ambient props, era-appropriate (CRTs, laptops, TVs, furniture).
	// Each prop carries a role that drives its placement so the central runner
	// stays an open path:
	//   'exhibit' (default) — pushed flush against a side wall, facing inward.
	//   'bench'             — kept mid-room, turned to face a side wall.
	//   'plant'             — tucked into a back corner, out of the way.
	const model = (key, height, fallback) =>
		createLoadedModel(key, { targetHeight: height, fallback });
	const propSets = {
		'Blogging Roots': [
			{ obj: model('radio', 0.46, 'radio'), side: 'left', z: -5.7, inset: 0.4 },
			{ obj: createIMacG4Exhibit(color), side: 'right', z: -5.6, inset: 0.55 },
		],
		'Dashboard Foundations': [
			{ obj: createIPhoneExhibit(color), side: 'left', z: -5.7, inset: 0.45 },
			{ obj: createCdSpindleExhibit(secondary), side: 'right', z: -5.7, inset: 0.45 },
		],
		'CMS Toolkit': [
			// The theme shelf moved to the 3rd-prop slot (THEMES); keep the iPad easel.
			{ obj: createIPadEaselExhibit(color), side: 'left', z: -5.7, inset: 0.5 },
		],
		'Modern Admin': [
			{ obj: createFlatPhoneExhibit(color), side: 'left', z: -5.7, inset: 0.45 },
			{ obj: model('televisionVintage', 0.72, 'screen'), side: 'right', z: -5.5, inset: 0.55 },
		],
		'API and Customizer': [
			{ obj: createRetroCRT(color, secondary), side: 'left', z: -5.6, inset: 0.55 },
		],
		'Block Editor': [
			{ obj: model('laptop', 0.46, 'screen'), side: 'left', z: -5.7, inset: 0.45 },
		],
		'Blocks Everywhere': [
			{ obj: createFlatPhoneExhibit(secondary), side: 'right', z: -5.7, inset: 0.45 },
			{ obj: model('pottedPlant', 0.88, 'plant'), role: 'plant', side: 'left' },
		],
	};
	(propSets[room.era] || []).forEach((prop) => placeEraProp(group, prop));
}

// Places one era prop by role. Exhibits hug the side wall facing inward; benches
// sit back in the room facing the back/story wall; plants tuck into a back corner.
function placeEraProp(group, { obj, role = 'exhibit', side, z, inset = 0.5 }) {
	if (role === 'bench') {
		// A viewing bench set back in the room facing the back/story wall, offset
		// to one side so it clears the central red runner (|x|<1.14). Sits in the
		// back third (z≈+1.7), well past the side-to-side ring chord at z=-2.5, at a
		// natural distance from the back-wall art. The loaded sofa's seat opens
		// toward local +z, so an unrotated bench already faces the back wall.
		const x = side === 'left' ? -2.7 : 2.7;
		addLocal(group, obj, x, 1.7, 0);
		return;
	}
	if (role === 'plant') {
		// Deep back corner where the angled side wall nears the back wall.
		const spot = sideWallFloorSpot(side, roomDepth / 2 - 5.2, 0.55);
		addLocal(group, obj, spot.x, spot.z, 0);
		return;
	}
	// Era exhibits model their front (screens, keyboards) on local +z.
	const spot = sideWallFloorSpot(side, z, inset, '+z');
	addLocal(group, obj, spot.x, spot.z, spot.rotation);
}

function getEraVignetteStations(roomIndex = 0) {
	// All three exhibit plinths hug a side wall and face the interior, leaving
	// the central runner an open walking path. Two sit in the front third on
	// opposite walls; the third is tucked back along one wall (side alternates
	// per room so the layout reads varied across the ring).
	const stationInset = 0.72; // ≈ half plinth depth + a small gap from the wall.
	const frontZ = -roomDepth / 2 + 3.86;
	const backZ = 1.6;
	const backSide = roomIndex % 2 ? 'left' : 'right';
	return [
		sideWallFloorSpot('left', frontZ, stationInset),
		sideWallFloorSpot('right', frontZ, stationInset),
		sideWallFloorSpot(backSide, backZ, stationInset),
	];
}

function getEraVignetteItems(room, color, secondary) {
	// The standardized 3rd/4th prop spots flank the central carpet, forward
	// toward the entrance, each turned to face the carpet — same in every room.
	// 3rd = screen-left (+x), 4th = screen-right (-x).
	const at3 = { x: 3.4, z: -4.85, rotation: Math.PI / 2 };
	const at4 = { x: -3.4, z: -4.85, rotation: -Math.PI / 2 };
	return {
		'Blogging Roots': [
			{ label: 'COMMENTS', object: createCommentSculpture(secondary), width: 1.5, at: at3, objectScale: 1 },
			{ label: 'HELLO DOLLY', object: createHelloDollyExhibit(color), width: 1.6, at: at4, objectScale: 1 },
		],
		'Dashboard Foundations': [
			{ label: 'PLUGINS', object: createPluginCrates(color), width: 1.55, at: at3, objectScale: 1 },
			{ label: 'WIDGETS', object: createWidgetsProp(color, secondary), width: 1.5, at: at4, objectScale: 1 },
		],
		'CMS Toolkit': [
			// MENUS, POST TYPES and CUSTOMIZER wall vignettes all removed; only
			// the 3rd/4th props remain.
			{ label: 'THEMES', object: createThemeStackProp(color, secondary), width: 1.6, at: at3, objectScale: 1 },
			{ label: 'WAPUU', object: createWapuuProp(color, secondary), width: 1.5, at: at4, objectScale: 1 },
		],
		'Modern Admin': [
			// AUTOSAVE and RESPONSIVE (front-of-room, by the side doorway) removed.
			{ label: 'MP6 DESK', object: createTerminalDesk(color), width: 1.7, at: at3, objectScale: 1 },
			{ label: 'AUTO-UPDATE', object: createAutoUpdateProp(color, secondary), width: 1.5, at: at4, objectScale: 1 },
		],
		'API and Customizer': [
			// JSON (front-of-room, by the side doorway) removed. The Customizer
			// palette is the prominent prop; MEDIA is 3rd and LIVE PREVIEW 4th.
			{ label: 'MEDIA', object: createCommentAquarium(secondary, color, 0.54), width: 1.65, at: at3, objectScale: 0.72 },
			{ label: 'LIVE PREVIEW', object: createLivePreviewProp(color, secondary), width: 1.55, at: at4, objectScale: 1 },
		],
		'Block Editor': [
			// The Gutenberg press is the main prop; BLOCKS fountain stands out in
			// the open floor, BLOCK STACK is the 3rd prop and INSERTER the 4th.
			{ label: 'BLOCKS', object: createBlockFountain(color, 0.62), width: 1.55, at: { x: -3.75, z: 1.3, rotation: -0.38 } },
			{ label: 'BLOCK STACK', object: createContentBlockStack(color, secondary), width: 1.55, at: at3, objectScale: 1 },
			{ label: 'INSERTER', object: createInserterProp(color, secondary), width: 1.5, at: at4, objectScale: 1 },
		],
		'Blocks Everywhere': [
			// SITE EDITOR and STYLE BOOK (front-of-room, by the side doorway) removed.
			{ label: 'PATTERNS', object: createPatternsBoard(color, secondary), width: 1.6, at: at3, objectScale: 1 },
			{ label: 'DUOTONE', object: createDuotoneProp(color, secondary), width: 1.5, at: at4, objectScale: 1 },
		],
	}[room.era];
}

function createVignetteStation(color, labelText, object, options = {}) {
	const group = new THREE.Group();
	const width = (options.width || 1.5) * 0.96;
	const depth = (options.depth || 1.02) * 0.96;
	const baseHeight = 0.28;
	const base = new THREE.Mesh(
		new THREE.BoxGeometry(width, baseHeight, depth),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.66 })
	);
	base.position.y = baseHeight / 2;
	group.add(base);

	const plinth = new THREE.Mesh(
		new THREE.BoxGeometry(width * 0.82, 0.12, depth * 0.78),
		new THREE.MeshStandardMaterial({ color: 0xe5dbc6, roughness: 0.7 })
	);
	plinth.position.y = baseHeight + 0.05;
	group.add(plinth);

	const accent = new THREE.Mesh(
		new THREE.BoxGeometry(width + 0.04, 0.035, 0.09),
		new THREE.MeshBasicMaterial({ color })
	);
	accent.position.set(0, baseHeight + 0.082, -depth / 2 + 0.045);
	group.add(accent);

	const objectAnchor = new THREE.Group();
	object.position.y += baseHeight + 0.08;
	object.scale.multiplyScalar(options.objectScale || 1);
	objectAnchor.add(object);
	group.add(objectAnchor);

	const label = createReadableLabel(createSmallSignTexture(labelText, color), Math.min(width * 0.82, 1.14), 0.23);
	label.position.set(0, baseHeight + 0.16, -depth / 2 - 0.14);
	group.add(label);
	return group;
}

function createMuseumProp(type, color) {
	const modelKey = getModelKeyForProp(type);
	if (modelKey) {
		return createLoadedModel(modelKey, {
			targetHeight: getModelHeightForProp(type),
			fallback: type,
		});
	}
	if (type.includes('logoClinic')) {
		return createLogoClinic(color);
	}
	if (type.includes('pluginCrates')) {
		return createPluginCrates(color);
	}
	if (type.includes('recordStack')) {
		return createRecordStack(color);
	}
	if (type.includes('jazzLamp') || type.includes('spotlight')) {
		return createMuseumLamp(color);
	}
	if (type.includes('signpost')) {
		return createSignpost(color);
	}
	if (type.includes('paperPile')) {
		return createPaperPile(color);
	}
	if (type.includes('displayCase')) {
		return createDisplayCase(color, 'block');
	}
	if (type.includes('terminalBench') || type.includes('concreteBench')) {
		return createBench(color);
	}
	if (type.includes('plant')) {
		return createPlant(color, type.includes('big') ? 1.25 : 0.9);
	}
	if (type.includes('bench')) {
		return createBench(color);
	}
	if (type.includes('server') || type.includes('console') || type.includes('code')) {
		return createServerStack(color);
	}
	if (type.includes('comment')) {
		return createCommentSculpture(color);
	}
	if (type.includes('orbital') || type.includes('apiPortal')) {
		return createOrbitalSculpture(color);
	}
	if (type.includes('train')) {
		return createReleaseTrain(color);
	}
	if (type.includes('capsule')) {
		return createTimeCapsule(color);
	}
	if (type.includes('tea') || type.includes('knob')) {
		return createKnobConsole(color);
	}
	return createBlockStack(color);
}

function getModelKeyForProp(type) {
	return {
		modelAwning: 'detailAwningWide',
		modelBench: 'detailBench',
		modelBookcase: 'bookcaseOpenLow',
		modelColumn: 'columnThin',
		modelComputer: 'computerScreen',
		modelDoorRound: 'doorRotateRoundA',
		modelLaptop: 'laptop',
		modelLight: 'detailLightSingle',
		modelPallet: 'pallet',
		modelPlant: 'pottedPlant',
		modelPlating: 'platingDetailed',
		modelRadio: 'radio',
		modelScreen: 'computerScreen',
		modelSofa: 'loungeDesignSofa',
		modelSpeaker: 'speakerSmall',
		modelStairs: 'stairsOpenShort',
		modelTelevision: 'televisionVintage',
		modelTrafficLight: 'detailLightTraffic',
		modelTree: 'pottedPlant',
	}[type];
}

function getModelHeightForProp(type) {
	return {
		modelAwning: 0.62,
		modelBench: 0.55,
		modelBookcase: 0.92,
		modelColumn: 1.42,
		modelComputer: 0.62,
		modelDoorRound: 1.25,
		modelLaptop: 0.48,
		modelLight: 1.35,
		modelPallet: 0.24,
		modelPlant: 0.72,
		modelPlating: 0.24,
		modelRadio: 0.46,
		modelScreen: 0.6,
		modelSofa: 0.58,
		modelSpeaker: 0.56,
		modelStairs: 0.55,
		modelTelevision: 0.74,
		modelTrafficLight: 1.35,
		modelTree: 0.88,
	}[type] || 0.78;
}

function addPlaced(group, object, x, z, rotationY = 0) {
	object.position.set(x, 0, z);
	object.rotation.y = rotationY;
	group.add(object);
	return object;
}

function addLocal(group, object, x, z, rotationY = 0) {
	object.position.set(x, 0, z);
	object.rotation.y = rotationY;
	group.add(object);
	return object;
}

function createLoadedModel(modelKey, options = {}) {
	const anchor = new THREE.Group();
	anchor.add(createModelPlaceholder(options.fallback || modelKey, options.targetHeight || 0.7, options.targetLength));
	scheduleDeferredAssetTask(() => {
		loadModel(modelKey)
			.then((template) => {
				const instance = template.clone(true);
				instance.traverse((child) => {
					if (child.isMesh) {
						child.frustumCulled = true;
						if (child.material?.isMeshStandardMaterial) {
							child.material.roughness = Math.max(child.material.roughness, 0.52);
						}
						// Recolour the brighter (foliage) materials, leaving the darker
						// trunk/bark alone — used to green an autumn-toned tree model.
						if (options.foliageColor && child.material?.color) {
							const c = child.material.color;
							const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
							if (lum > 0.3) {
								child.material = child.material.clone();
								child.material.color.set(options.foliageColor);
							}
						}
					}
				});
				normalizeModel(instance, options.targetHeight || 0.7, options.targetLength);
				anchor.clear();
				anchor.add(instance);
			})
			.catch(() => {});
	});
	return anchor;
}

function scheduleDeferredAssetTask(task) {
	const delay = 5000 + Math.min(deferredAssetTaskIndex * 85, 9000);
	deferredAssetTaskIndex += 1;
	window.setTimeout(task, delay);
}

function loadModel(modelKey) {
	if (!modelDefinitions[modelKey]) {
		return Promise.reject(new Error(`Unknown model: ${modelKey}`));
	}
	if (!modelCache.has(modelKey)) {
		modelCache.set(
			modelKey,
			new Promise((resolve, reject) => {
				gltfLoader.load(
					modelDefinitions[modelKey],
					(gltf) => resolve(gltf.scene),
					undefined,
					reject
				);
			})
		);
	}
	return modelCache.get(modelKey);
}

function createModelPlaceholder(type, targetHeight, targetLength) {
	if (type.includes('plant') || type.includes('tree')) {
		return createPlant(activeVariant.eraColors[3], targetHeight > 1 ? 1 : 0.7);
	}
	if (type.includes('bench') || type.includes('Sofa')) {
		return createBench(activeVariant.eraColors[5], targetLength);
	}
	if (type.includes('radio') || type.includes('screen') || type.includes('Computer') || type.includes('Television')) {
		return createKnobConsole(activeVariant.eraColors[2]);
	}
	if (type.includes('light')) {
		return createMuseumLamp(activeVariant.eraColors[0]);
	}
	if (type.includes('column')) {
		const column = new THREE.Mesh(
			new THREE.CylinderGeometry(0.14, 0.18, targetHeight, 14),
			new THREE.MeshStandardMaterial({ color: 0xd7d0c4, roughness: 0.76 })
		);
		column.position.y = targetHeight / 2;
		return column;
	}
	return createBlockStack(activeVariant.eraColors[0]);
}

// Scales a model to a target size then drops it onto the floor (y=0) and centres
// it on x/z. By default the target is the model's height; pass `targetLength` to
// instead scale by the longest horizontal axis, which reads as "size" for wide,
// low furniture (sofas/benches) whose height is a poor proxy for footprint.
function normalizeModel(object, targetHeight, targetLength) {
	const box = new THREE.Box3().setFromObject(object);
	const size = box.getSize(new THREE.Vector3());
	const scale = targetLength
		? targetLength / Math.max(size.x, size.z, 0.001)
		: targetHeight / Math.max(size.y, 0.001);
	object.scale.multiplyScalar(scale);
	const scaledBox = new THREE.Box3().setFromObject(object);
	const center = scaledBox.getCenter(new THREE.Vector3());
	object.position.sub(new THREE.Vector3(center.x, scaledBox.min.y, center.z));
}

function createRecordBooth(color, secondary) {
	const group = new THREE.Group();
	group.add(createPedestal(1.4, 0.28, color));
	const discMaterial = new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.38 });
	for (let index = 0; index < 4; index++) {
		const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 32), discMaterial);
		disc.position.set(-0.45 + index * 0.3, 0.56 + index * 0.03, 0);
		disc.rotation.z = Math.PI / 2;
		group.add(disc);
		const label = new THREE.Mesh(
			new THREE.CylinderGeometry(0.1, 0.1, 0.046, 18),
			new THREE.MeshBasicMaterial({ color: index % 2 ? color : secondary })
		);
		label.position.copy(disc.position);
		label.rotation.z = disc.rotation.z;
		group.add(label);
	}
	group.add(createPropLabel('HELLO DOLLY', secondary, 1.18));
	return group;
}

function createArcadeCabinet(color, secondary) {
	const group = new THREE.Group();
	const body = new THREE.Mesh(
		new THREE.BoxGeometry(0.88, 1.42, 0.52),
		new THREE.MeshStandardMaterial({ color, roughness: 0.48 })
	);
	body.position.y = 0.82;
	group.add(body);
	const screen = new THREE.Mesh(
		new THREE.PlaneGeometry(0.58, 0.34),
		new THREE.MeshBasicMaterial({ color: 0x07101d })
	);
	screen.position.set(0, 1.04, -0.265);
	group.add(screen);
	const glow = new THREE.Mesh(
		new THREE.PlaneGeometry(0.48, 0.05),
		new THREE.MeshBasicMaterial({ color: secondary })
	);
	glow.position.set(0, 1.08, -0.271);
	group.add(glow);
	for (const x of [-0.18, 0.04, 0.26]) {
		const button = new THREE.Mesh(
			new THREE.SphereGeometry(0.045, 12, 8),
			new THREE.MeshBasicMaterial({ color: activeVariant.eraColors[Math.abs(Math.round(x * 100)) % 7] })
		);
		button.position.set(x, 0.61, -0.28);
		group.add(button);
	}
	return group;
}

function createPluginMarket(color, secondary) {
	const group = new THREE.Group();
	addLocal(group, createPluginCrates(color), -0.62, 0, -0.1);
	addLocal(group, createSignpost(secondary, 'ZIP'), 0.76, 0.05, 0.12);
	addLocal(group, createLoadedModel('pallet', { targetHeight: 0.24, fallback: 'crate' }), 0.04, 0.32, 0);
	return group;
}

function createServerOracle(color, secondary) {
	const group = new THREE.Group();
	for (let index = 0; index < 3; index++) {
		const server = createServerStack(index % 2 ? color : secondary);
		server.position.set(-0.74 + index * 0.74, 0, 0);
		group.add(server);
	}
	const halo = new THREE.Mesh(
		new THREE.TorusGeometry(1.08, 0.035, 8, 54),
		new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.26 })
	);
	halo.position.y = 1.72;
	halo.rotation.x = Math.PI / 2;
	group.add(halo);
	return group;
}

// V · API & Customizer — the "Customizer" half of the era: a painter's palette
// with a freshly dipped brush, a live-preview "recolour your site" pun. Stands in
// for a second REST portal so the room's two halves are both represented.
function createCustomizerPalette(color, secondary, scale = 1) {
	const group = new THREE.Group();
	const woodMat = new THREE.MeshStandardMaterial({ color: 0xd8b482, roughness: 0.72 });

	const stem = new THREE.Mesh(
		new THREE.CylinderGeometry(0.06, 0.085, 0.62, 16),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	stem.position.y = 0.31;
	group.add(stem);

	// Oval palette board, tipped up so its face shows to an arriving visitor.
	const palette = new THREE.Group();
	palette.position.y = 0.66;
	palette.rotation.x = -0.62;
	const board = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.055, 40), woodMat);
	board.scale.set(1.22, 1, 0.92);
	palette.add(board);
	const hole = new THREE.Mesh(
		new THREE.CylinderGeometry(0.1, 0.1, 0.08, 20),
		new THREE.MeshStandardMaterial({ color: 0x2a1d0c, roughness: 0.9 })
	);
	hole.position.set(0.42, 0, 0.24);
	palette.add(hole);
	const dabColors = [0x1e8cbe, 0xe1577d, 0x46b450, 0xf0a830, 0x826eb4, secondary];
	dabColors.forEach((c, i) => {
		const a = -0.5 + (i / (dabColors.length - 1)) * Math.PI * 1.2;
		const dab = new THREE.Mesh(
			new THREE.SphereGeometry(0.092, 16, 12),
			new THREE.MeshStandardMaterial({
				color: c,
				roughness: 0.28,
				emissive: new THREE.Color(c),
				emissiveIntensity: 0.1,
			})
		);
		dab.scale.y = 0.55;
		dab.position.set(Math.cos(a) * 0.33, 0.045, Math.sin(a) * 0.25 - 0.04);
		palette.add(dab);
	});
	group.add(palette);

	// A brush resting across the palette, tip dipped in the era colour, gently
	// rocking as if mid-stroke.
	const brush = new THREE.Group();
	const handle = new THREE.Mesh(
		new THREE.CylinderGeometry(0.03, 0.038, 0.64, 12),
		new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7 })
	);
	const ferrule = new THREE.Mesh(
		new THREE.CylinderGeometry(0.043, 0.043, 0.11, 12),
		new THREE.MeshStandardMaterial({ color: 0xcfd3d6, roughness: 0.3, metalness: 0.7 })
	);
	ferrule.position.y = -0.37;
	const tip = new THREE.Mesh(
		new THREE.ConeGeometry(0.052, 0.18, 12),
		new THREE.MeshStandardMaterial({
			color,
			roughness: 0.45,
			emissive: new THREE.Color(color),
			emissiveIntensity: 0.14,
		})
	);
	tip.position.y = -0.5;
	tip.rotation.x = Math.PI;
	brush.add(handle, ferrule, tip);
	brush.position.set(-0.16, 0.9, 0.22);
	brush.rotation.set(0.5, 0.2, -0.8);
	registerAnimation(brush, (object, elapsed) => {
		object.rotation.z = -0.8 + Math.sin(elapsed * 1.4) * 0.08;
	});
	group.add(brush);

	group.scale.setScalar(scale);
	return group;
}

function createApiPortal(color, secondary, scale = 1) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({
		color,
		emissive: new THREE.Color(color),
		emissiveIntensity: 0.14,
		roughness: 0.32,
		metalness: 0.2,
	});
	const left = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.55, 0.16), material);
	const right = left.clone();
	const top = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.16, 0.16), material);
	left.position.set(-0.55, 0.82, 0);
	right.position.set(0.55, 0.82, 0);
	top.position.set(0, 1.52, 0);
	group.add(left, right, top);
	const core = new THREE.Mesh(
		new THREE.RingGeometry(0.34, 0.46, 32),
		new THREE.MeshBasicMaterial({ color: secondary, transparent: true, opacity: 0.86, side: THREE.DoubleSide })
	);
	core.position.y = 0.8;
	registerAnimation(core, (object, elapsed) => {
		object.rotation.z = elapsed * 0.8;
		object.material.opacity = 0.68 + Math.sin(elapsed * 2.2) * 0.16;
	});
	group.add(core);
	group.scale.setScalar(scale);
	return group;
}

// III · CMS Toolkit 3rd prop — a small easel of framed default-theme cards,
// fronts on local -z so they face the carpet at the 3rd-prop rotation.
function createThemeStackProp(color, secondary) {
	const g = new THREE.Group();
	const frameMat = new THREE.MeshStandardMaterial({ color: 0xe8d9b0, roughness: 0.5, metalness: 0.1 });
	const riser = new THREE.Mesh(
		new THREE.BoxGeometry(1.16, 0.16, 0.46),
		new THREE.MeshStandardMaterial({ color: 0xcdb890, roughness: 0.7 })
	);
	riser.position.y = 0.08;
	g.add(riser);
	const palette = [0x21759b, secondary, color];
	[-0.38, 0, 0.38].forEach((cx, i) => {
		const card = new THREE.Group();
		const frame = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.03), frameMat);
		const screen = new THREE.Mesh(
			new THREE.PlaneGeometry(0.3, 0.42),
			new THREE.MeshBasicMaterial({ map: createMiniThemeTexture(palette[i % palette.length]), side: THREE.DoubleSide })
		);
		screen.position.z = -0.02;
		card.add(frame, screen);
		card.position.set(cx, 0.49, i === 1 ? 0 : 0.05);
		card.rotation.y = (i - 1) * 0.3;
		g.add(card);
	});
	return g;
}

function createMiniThemeTexture(accent) {
	const canvas = document.createElement('canvas');
	canvas.width = 128; canvas.height = 180;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#f4ead0'; ctx.fillRect(0, 0, 128, 180);
	const hex = '#' + new THREE.Color(accent).getHexString();
	ctx.fillStyle = hex; ctx.fillRect(0, 0, 128, 44); // header
	ctx.fillStyle = '#d8cdb4'; ctx.fillRect(12, 58, 104, 10); // text lines
	ctx.fillRect(12, 78, 80, 10);
	ctx.fillStyle = hex; ctx.fillRect(12, 104, 48, 30); // a content block
	ctx.fillStyle = '#d8cdb4'; ctx.fillRect(68, 104, 48, 30);
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

// VI · Block Editor 3rd prop — content turning into a stack of distinct blocks.
function createContentBlockStack(color, secondary) {
	const g = new THREE.Group();
	const colors = [0x1e2a36, color, secondary, 0x46b450];
	colors.forEach((c, i) => {
		const block = new THREE.Mesh(
			new THREE.BoxGeometry(0.64, 0.24, 0.5),
			new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })
		);
		block.position.set((i % 2 ? 1 : -1) * 0.07, 0.18 + i * 0.28, 0);
		block.rotation.y = (i % 2 ? 1 : -1) * 0.07;
		g.add(block);
		// A pale "content" bar on the front (-z) edge of each block.
		const bar = new THREE.Mesh(
			new THREE.PlaneGeometry(0.42, 0.06),
			new THREE.MeshBasicMaterial({ color: 0xeef2f6, side: THREE.DoubleSide })
		);
		bar.position.set(block.position.x, block.position.y, -0.251);
		bar.rotation.y = block.rotation.y;
		g.add(bar);
	});
	return g;
}

// VII · Blocks Everywhere 3rd prop — a board of reusable block patterns
// (a tidy 3x2 catalogue), replacing the abstract block fountain.
function createPatternsBoard(color, secondary) {
	const g = new THREE.Group();
	const board = new THREE.Mesh(
		new THREE.BoxGeometry(1.04, 0.82, 0.06),
		new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.5 })
	);
	board.position.y = 0.86;
	g.add(board);
	const palette = [0x21759b, secondary, color, 0x46b450, 0xf0a830, 0xe1577d];
	const cols = 3, rows = 2, tileW = 0.27, tileH = 0.33, gapX = 0.04, gapY = 0.06;
	const startX = -((cols - 1) / 2) * (tileW + gapX);
	const startY = board.position.y + ((rows - 1) / 2) * (tileH + gapY);
	let k = 0;
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const tx = startX + c * (tileW + gapX);
			const ty = startY - r * (tileH + gapY);
			const tile = new THREE.Mesh(
				new THREE.PlaneGeometry(tileW, tileH),
				new THREE.MeshBasicMaterial({ map: createMiniPatternTexture(palette[k % palette.length], k), side: THREE.DoubleSide })
			);
			tile.position.set(tx, ty, -0.035);
			g.add(tile);
			k++;
		}
	}
	return g;
}

function createMiniPatternTexture(accent, seed) {
	const canvas = document.createElement('canvas');
	canvas.width = 120; canvas.height = 148;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#f6efe0'; ctx.fillRect(0, 0, 120, 148);
	const hex = '#' + new THREE.Color(accent).getHexString();
	// A few varied mini-layouts so each pattern tile reads differently.
	const kind = seed % 3;
	if (kind === 0) {
		ctx.fillStyle = hex; ctx.fillRect(10, 10, 100, 40);
		ctx.fillStyle = '#cfd8e0'; ctx.fillRect(10, 60, 100, 12); ctx.fillRect(10, 80, 72, 12);
	} else if (kind === 1) {
		ctx.fillStyle = hex; ctx.fillRect(10, 10, 46, 128);
		ctx.fillStyle = '#cfd8e0'; ctx.fillRect(64, 16, 46, 12); ctx.fillRect(64, 36, 46, 12); ctx.fillRect(64, 56, 36, 12);
	} else {
		ctx.fillStyle = '#cfd8e0'; ctx.fillRect(10, 10, 46, 60); ctx.fillRect(64, 10, 46, 60);
		ctx.fillStyle = hex; ctx.fillRect(10, 80, 100, 56);
	}
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

// ── 4th props (right of the carpet, mirroring the 3rd prop) ──────────────────
// All built facing local -z so they read toward the carpet at the 4th-prop
// rotation (-PI/2), matching the vignette label.

// II · Dashboard Foundations 4th prop — widgets: a sidebar with widget cards
// docked in it and one floating above, mid-drag, about to drop in (WP 2.2/2.7
// drag-and-drop widgets). Card faces are on local -z to read toward the carpet.
function createWidgetsProp(color, secondary) {
	const g = new THREE.Group();
	const panel = new THREE.Mesh(
		new THREE.BoxGeometry(0.62, 1.04, 0.12),
		new THREE.MeshStandardMaterial({ color: 0xe9e3d4, roughness: 0.6 })
	);
	panel.position.y = 0.62;
	g.add(panel);
	const widget = (y, accent, z, s) => {
		const w = new THREE.Group();
		const card = new THREE.Mesh(
			new THREE.BoxGeometry(0.5 * s, 0.22 * s, 0.05),
			new THREE.MeshStandardMaterial({ color: 0xfdfdfb, roughness: 0.5 })
		);
		w.add(card);
		const bar = new THREE.Mesh(
			new THREE.PlaneGeometry(0.5 * s, 0.07 * s),
			new THREE.MeshBasicMaterial({ color: '#' + new THREE.Color(accent).getHexString(), side: THREE.DoubleSide })
		);
		bar.position.set(0, 0.065 * s, -0.027);
		w.add(bar);
		for (let i = 0; i < 2; i++) {
			const line = new THREE.Mesh(
				new THREE.PlaneGeometry(0.4 * s, 0.022),
				new THREE.MeshBasicMaterial({ color: 0xc9d3dd, side: THREE.DoubleSide })
			);
			line.position.set(0, -0.01 - i * 0.05, -0.027);
			w.add(line);
		}
		w.position.set(0, y, z);
		return w;
	};
	const accents = [0x21759b, secondary, color];
	g.add(widget(0.42, accents[0], -0.085, 1));
	g.add(widget(0.7, accents[1], -0.085, 1));
	// The widget being dragged in, hovering in front of the sidebar.
	const dragging = widget(1.18, accents[2], 0.12, 1.06);
	dragging.userData.baseY = 1.18;
	registerAnimation(dragging, (o, e) => {
		o.position.y = o.userData.baseY + Math.sin(e * 1.6) * 0.06;
		o.rotation.z = Math.sin(e * 1.6) * 0.05;
	});
	g.add(dragging);
	return g;
}

// IV · Modern Admin 4th prop — auto background updates: a WordPress shield with
// two update-arrow rings spinning around it (3.7's automatic updates).
function createAutoUpdateProp(color, secondary) {
	const g = new THREE.Group();
	const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.92, 12), new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5, metalness: 0.5 }));
	post.position.y = 0.5;
	g.add(post);
	const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 32), new THREE.MeshStandardMaterial({ color: 0x21759b, roughness: 0.4, metalness: 0.2 }));
	disc.rotation.x = Math.PI / 2;
	disc.position.set(0, 1.0, 0);
	g.add(disc);
	const glyph = new THREE.Mesh(
		new THREE.PlaneGeometry(0.4, 0.4),
		new THREE.MeshBasicMaterial({ map: createUpdateArrowsTexture(), transparent: true })
	);
	glyph.position.set(0, 1.0, -0.052);
	glyph.rotation.y = Math.PI; // face -z (carpet)
	g.add(glyph);
	[1, -1].forEach((dir, i) => {
		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(0.44 + i * 0.06, 0.028, 8, 40, Math.PI * 1.55),
			new THREE.MeshStandardMaterial({ color: i ? 0x46b450 : secondary, roughness: 0.4, metalness: 0.3 })
		);
		ring.position.set(0, 1.0, 0);
		ring.userData.dir = dir;
		registerAnimation(ring, (o, e) => { o.rotation.z = e * 0.9 * o.userData.dir; });
		g.add(ring);
	});
	return g;
}

function createUpdateArrowsTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 128; canvas.height = 128;
	const ctx = canvas.getContext('2d');
	ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff';
	ctx.lineWidth = 12;
	for (const dir of [0, Math.PI]) {
		ctx.beginPath();
		ctx.arc(64, 64, 34, dir + 0.4, dir + Math.PI - 0.2);
		ctx.stroke();
		// arrowhead at the arc end
		const a = dir + Math.PI - 0.2;
		const ex = 64 + Math.cos(a) * 34, ey = 64 + Math.sin(a) * 34;
		ctx.beginPath();
		ctx.moveTo(ex, ey);
		ctx.lineTo(ex - Math.cos(a - 0.5) * 16, ey - Math.sin(a - 0.5) * 16);
		ctx.lineTo(ex - Math.cos(a + 0.5) * 16, ey - Math.sin(a + 0.5) * 16);
		ctx.closePath(); ctx.fill();
	}
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

// V · API & Customizer 4th prop — the Customizer's live preview: a mini site on
// an easel being repainted, with a paint roller resting against it.
function createLivePreviewProp(color, secondary) {
	const g = new THREE.Group();
	const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.7, 10), new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5, metalness: 0.4 }));
	post.position.y = 0.45;
	g.add(post);
	const frame = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.6, 0.05), new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.5 }));
	frame.position.set(0, 0.98, -0.04);
	g.add(frame);
	const screen = new THREE.Mesh(
		new THREE.PlaneGeometry(0.72, 0.5),
		new THREE.MeshBasicMaterial({ map: createMiniSiteTexture(color, secondary), side: THREE.DoubleSide })
	);
	screen.position.set(0, 0.98, -0.072);
	g.add(screen);
	// Paint roller leaning against the easel, tipped in the era colour.
	const roller = new THREE.Group();
	const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 14), new THREE.MeshStandardMaterial({ color: '#' + new THREE.Color(color).getHexString(), roughness: 0.7 }));
	drum.rotation.z = Math.PI / 2;
	drum.position.y = 0.78;
	roller.add(drum);
	const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.6 }));
	handle.position.set(0.0, 0.5, 0.0);
	handle.rotation.z = 0.28;
	roller.add(handle);
	roller.position.set(0.42, 0, -0.05);
	roller.rotation.z = -0.18;
	g.add(roller);
	return g;
}

function createMiniSiteTexture(color, secondary) {
	const canvas = document.createElement('canvas');
	canvas.width = 200; canvas.height = 140;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 200, 140);
	ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
	ctx.fillRect(0, 0, 200, 34); // header (the live-recolored bit)
	ctx.fillStyle = '#' + new THREE.Color(secondary).getHexString();
	ctx.fillRect(14, 48, 78, 52); // hero block
	ctx.fillStyle = '#d3dae1';
	ctx.fillRect(102, 48, 84, 10); ctx.fillRect(102, 66, 84, 10); ctx.fillRect(102, 84, 60, 10);
	ctx.fillRect(14, 110, 172, 8); ctx.fillRect(14, 124, 130, 8);
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

// VI · Block Editor 4th prop — the block inserter: a big round "+" add-block
// button, the most iconic Gutenberg gesture.
function createInserterProp(color, secondary) {
	const g = new THREE.Group();
	const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.92, 12), new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5, metalness: 0.5 }));
	post.position.y = 0.5;
	g.add(post);
	const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.16, 40), new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: 0.4 }));
	btn.rotation.x = Math.PI / 2;
	btn.position.set(0, 1.02, 0);
	g.add(btn);
	const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 14, 44), new THREE.MeshStandardMaterial({ color: 0x21759b, roughness: 0.4, metalness: 0.25 }));
	rim.position.set(0, 1.02, -0.04);
	g.add(rim);
	const plusMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
	const barV = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.44), plusMat);
	barV.position.set(0, 1.02, -0.085); barV.rotation.y = Math.PI;
	g.add(barV);
	const barH = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.1), plusMat);
	barH.position.set(0, 1.02, -0.085); barH.rotation.y = Math.PI;
	g.add(barH);
	return g;
}

// VII · Blocks Everywhere 4th prop — a duotone-filtered portrait in a frame
// (the 5.8 duotone image treatment), rendered in two bold colours.
function createDuotoneProp(color, secondary) {
	const g = new THREE.Group();
	const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.78, 12), new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5, metalness: 0.4 }));
	post.position.y = 0.5;
	g.add(post);
	const frame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.88, 0.05), new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.4 }));
	frame.position.set(0, 1.05, -0.04);
	g.add(frame);
	const pic = new THREE.Mesh(
		new THREE.PlaneGeometry(0.62, 0.78),
		new THREE.MeshBasicMaterial({ map: createDuotoneTexture(color, secondary), side: THREE.DoubleSide })
	);
	pic.position.set(0, 1.05, -0.072);
	g.add(pic);
	return g;
}

function createDuotoneTexture(color, secondary) {
	const canvas = document.createElement('canvas');
	canvas.width = 200; canvas.height = 250;
	const ctx = canvas.getContext('2d');
	const dark = '#' + new THREE.Color(color).getHexString();
	const light = '#' + new THREE.Color(secondary).getHexString();
	ctx.fillStyle = light; ctx.fillRect(0, 0, 200, 250);
	// A simple duotone scene: sun + rolling hills, all in the dark tone.
	ctx.fillStyle = dark;
	ctx.beginPath(); ctx.arc(140, 70, 34, 0, Math.PI * 2); ctx.fill(); // sun
	ctx.beginPath();
	ctx.moveTo(0, 250); ctx.lineTo(0, 170);
	ctx.quadraticCurveTo(60, 120, 120, 165);
	ctx.quadraticCurveTo(170, 195, 200, 160); ctx.lineTo(200, 250); ctx.closePath(); ctx.fill();
	ctx.fillStyle = light;
	ctx.beginPath();
	ctx.moveTo(0, 250); ctx.lineTo(0, 210);
	ctx.quadraticCurveTo(80, 175, 140, 210);
	ctx.quadraticCurveTo(180, 230, 200, 212); ctx.lineTo(200, 250); ctx.closePath(); ctx.fill();
	// Halftone dots along the horizon for that duotone print feel.
	ctx.fillStyle = dark;
	for (let i = 0; i < 16; i++) {
		ctx.beginPath(); ctx.arc(8 + i * 12, 150, 1.5 + (i % 3), 0, Math.PI * 2); ctx.fill();
	}
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

// III · CMS Toolkit 4th prop — Wapuu, the mascot unveiled in this era (2011),
// flipped to face the carpet.
function createWapuuProp(color, secondary) {
	const g = new THREE.Group();
	const wapuu = createWapuu3D({ height: 1.0, accent: secondary });
	wapuu.rotation.y = Math.PI; // front (+z) -> -z, toward the carpet after the slot rotation
	g.add(wapuu);
	return g;
}

function createBlockFountain(color, scale = 1) {
	const group = new THREE.Group();
	group.add(createPedestal(1.1, 0.24, color));
	for (let index = 0; index < 8; index++) {
		const block = new THREE.Mesh(
			new THREE.BoxGeometry(0.34, 0.34, 0.34),
			new THREE.MeshStandardMaterial({
				color: activeVariant.eraColors[index % activeVariant.eraColors.length],
				roughness: 0.45,
			})
		);
		const angle = index * 0.78;
		block.position.set(Math.cos(angle) * 0.48, 0.44 + index * 0.12, Math.sin(angle) * 0.48);
		block.rotation.y = angle;
		block.userData.baseY = block.position.y;
		registerAnimation(block, (object, elapsed, delta) => {
			object.rotation.x += delta * 0.42;
			object.rotation.y += delta * 0.62;
			object.position.y = object.userData.baseY + Math.sin(elapsed * 1.45 + index) * 0.045;
		});
		group.add(block);
	}
	group.scale.setScalar(scale);
	return group;
}

function createCommentAquarium(color, secondary, scale = 1) {
	const group = new THREE.Group();
	const glass = new THREE.Mesh(
		new THREE.BoxGeometry(1.45, 0.86, 0.5),
		new THREE.MeshStandardMaterial({
			color: 0xbbe8ff,
			transparent: true,
			opacity: 0.24,
			roughness: 0.05,
			metalness: 0.05,
		})
	);
	glass.position.y = 0.8;
	group.add(glass);
	for (let index = 0; index < 6; index++) {
		const bubble = new THREE.Mesh(
			new THREE.SphereGeometry(0.045 + (index % 3) * 0.012, 10, 8),
			new THREE.MeshBasicMaterial({ color: index % 2 ? color : secondary })
		);
		bubble.position.set(-0.5 + index * 0.2, 0.45 + (index % 4) * 0.17, -0.1 + (index % 2) * 0.2);
		bubble.userData.baseX = bubble.position.x;
		bubble.userData.baseY = bubble.position.y;
		registerAnimation(bubble, (object, elapsed) => {
			object.position.y = object.userData.baseY + Math.sin(elapsed * 1.8 + index) * 0.055;
			object.position.x = object.userData.baseX + Math.sin(elapsed * 0.7 + index) * 0.035;
		});
		group.add(bubble);
	}
	group.add(createPedestal(1.6, 0.2, color));
	group.scale.setScalar(scale);
	return group;
}

function createMascotMonument(color, secondary) {
	const group = new THREE.Group();
	group.add(createMascotStatue(color, secondary));
	group.add(createPropLabel('OPEN SOURCE', secondary, 1.46));
	return group;
}

function createRetroCRT(accent, secondary) {
	const group = new THREE.Group();
	const beige = new THREE.MeshStandardMaterial({ color: 0xe9e1c8, roughness: 0.72, metalness: 0.03 });
	const beigeShade = new THREE.MeshStandardMaterial({ color: 0xd5c9a6, roughness: 0.74 });

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.07, 18), beigeShade);
	base.position.y = 0.035;
	group.add(base);
	const neck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), beigeShade);
	neck.position.y = 0.12;
	group.add(neck);

	// Boxy CRT monitor body, slightly tapered toward the back.
	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.56, 4), beige);
	body.rotation.y = Math.PI / 4;
	body.scale.set(1.0, 1.0, 0.92);
	body.position.y = 0.46;
	group.add(body);

	const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.46, 0.06), beige);
	bezel.position.set(0, 0.46, 0.27);
	group.add(bezel);
	const screen = createAdminScreenPanel(accent, secondary, 0.42, 0.32);
	screen.rotation.y = Math.PI;
	screen.position.set(0, 0.46, 0.3);
	group.add(screen);

	// Power LED.
	const led = new THREE.Mesh(
		new THREE.SphereGeometry(0.018, 10, 8),
		new THREE.MeshBasicMaterial({ color: 0x6cff9c })
	);
	led.position.set(0.18, 0.27, 0.3);
	group.add(led);

	// Chunky keyboard in front.
	const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.2), beige);
	keyboard.position.set(0, 0.025, 0.46);
	keyboard.rotation.x = -0.04;
	group.add(keyboard);

	return group;
}

// --- Iconic era hardware, presented as spotlit museum artifacts. ---

function createArtifactStand(color, label, height) {
	const group = new THREE.Group();
	group.add(createPedestal(0.86, height, color));
	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(0.47, 0.012, 8, 40),
		new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
	);
	ring.rotation.x = Math.PI / 2;
	ring.position.y = height + 0.02;
	registerAnimation(ring, (object, elapsed) => {
		object.material.opacity = 0.32 + Math.sin(elapsed * 1.6) * 0.12;
	});
	group.add(ring);
	const tag = createReadableLabel(createSmallSignTexture(label, color), 0.86, 0.2);
	tag.position.set(0, height * 0.5, -0.46);
	group.add(tag);
	return group;
}

function createIMacG4Exhibit(color) {
	const group = new THREE.Group();
	const standH = 0.34;
	group.add(createArtifactStand(color, 'IMAC G4', standH));

	const imac = new THREE.Group();
	imac.position.y = standH;
	group.add(imac);

	const white = new THREE.MeshStandardMaterial({ color: 0xf6f4ef, roughness: 0.32, metalness: 0.06 });
	const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd4da, roughness: 0.24, metalness: 0.7 });

	// Hemispherical dome base.
	const dome = new THREE.Mesh(
		new THREE.SphereGeometry(0.2, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2),
		white
	);
	dome.position.y = 0.02;
	dome.scale.set(1, 0.7, 1);
	imac.add(dome);

	// Chrome gooseneck arm.
	const armBottom = new THREE.Vector3(0, 0.12, 0.02);
	const armTop = new THREE.Vector3(0, 0.4, 0.12);
	imac.add(createCylinderBetween(armBottom, armTop, 0.022, chrome, 10));

	// Flat-panel screen on a swivel.
	const screen = new THREE.Group();
	screen.position.set(0, 0.5, 0.16);
	screen.rotation.x = -0.12;
	imac.add(screen);
	const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.03), white);
	screen.add(bezel);
	const face = new THREE.Mesh(
		new THREE.PlaneGeometry(0.34, 0.26),
		new THREE.MeshBasicMaterial({ map: createDeviceScreenTexture('aqua'), side: THREE.DoubleSide })
	);
	face.position.z = 0.017;
	screen.add(face);
	const chin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.04), white);
	chin.position.y = -0.2;
	screen.add(chin);

	return group;
}

function createIPhoneExhibit(color) {
	const group = new THREE.Group();
	const standH = 0.62;
	group.add(createArtifactStand(color, 'IPHONE 2007', standH));

	const phone = new THREE.Group();
	phone.position.set(0, standH + 0.22, 0.04);
	phone.rotation.x = -0.32;
	group.add(phone);

	const metal = new THREE.MeshStandardMaterial({ color: 0xd7dade, roughness: 0.3, metalness: 0.66 });
	const black = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.3, metalness: 0.2 });
	const bodyBack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.026), metal);
	phone.add(bodyBack);
	const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.39, 0.03), black);
	bezel.position.z = 0.004;
	phone.add(bezel);
	const face = new THREE.Mesh(
		new THREE.PlaneGeometry(0.16, 0.27),
		new THREE.MeshBasicMaterial({ map: createDeviceScreenTexture('home'), side: THREE.DoubleSide })
	);
	face.position.set(0, 0.04, 0.021);
	phone.add(face);
	const homeButton = new THREE.Mesh(
		new THREE.CylinderGeometry(0.022, 0.022, 0.006, 18),
		new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.4 })
	);
	homeButton.rotation.x = Math.PI / 2;
	homeButton.position.set(0, -0.16, 0.021);
	phone.add(homeButton);

	return group;
}

// The CMS Toolkit "becomes a CMS" prop: the low open bookcase dressed as a small
// theme/handbook library so it reads as an intentional exhibit rather than empty
// furniture. The loaded model normalises to 0.86 m tall, grounded and x/z-centred,
// with its one shelf slab topping out at y≈0.28 and its flat top at y≈0.86, so the
// lower compartment opens 0–0.22 and the upper 0.28–0.73. Books rest on each shelf
// and on the top. Modelled facing local +z (the open shelf side) like other exhibits.
function createIPadEaselExhibit(color) {
	const group = new THREE.Group();
	const standH = 0.5;
	group.add(createArtifactStand(color, 'IPAD 2010', standH));

	const wood = new THREE.MeshStandardMaterial({ color: 0xb07a3c, roughness: 0.56, metalness: 0.04 });
	const easel = new THREE.Group();
	easel.position.y = standH;
	group.add(easel);
	for (const sx of [-1, 1]) {
		const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.6, 10), wood);
		leg.position.set(sx * 0.14, 0.3, -0.02);
		leg.rotation.x = 0.16;
		easel.add(leg);
	}
	const restBar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.05), wood);
	restBar.position.set(0, 0.22, 0.08);
	easel.add(restBar);

	const tablet = new THREE.Group();
	tablet.position.set(0, 0.34, 0.06);
	tablet.rotation.x = -0.28;
	easel.add(tablet);
	const metal = new THREE.MeshStandardMaterial({ color: 0xd7dade, roughness: 0.3, metalness: 0.66 });
	const black = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.3, metalness: 0.2 });
	const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.022), metal);
	tablet.add(back);
	const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.026), black);
	bezel.position.z = 0.004;
	tablet.add(bezel);
	const face = new THREE.Mesh(
		new THREE.PlaneGeometry(0.34, 0.24),
		new THREE.MeshBasicMaterial({ map: createDeviceScreenTexture('home'), side: THREE.DoubleSide })
	);
	face.position.set(0, 0, 0.019);
	tablet.add(face);
	const homeButton = new THREE.Mesh(
		new THREE.CylinderGeometry(0.018, 0.018, 0.006, 16),
		new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.4 })
	);
	homeButton.rotation.x = Math.PI / 2;
	homeButton.position.set(0, -0.13, 0.019);
	tablet.add(homeButton);

	return group;
}

function createFlatPhoneExhibit(color) {
	// A bezel-less, flat-design smartphone (mid-2010s) tilted on a stand.
	const group = new THREE.Group();
	const standH = 0.66;
	group.add(createArtifactStand(color, 'SMARTPHONE 2014', standH));

	const phone = new THREE.Group();
	phone.position.set(0, standH + 0.24, 0.04);
	phone.rotation.x = -0.3;
	group.add(phone);
	const black = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.26, metalness: 0.3 });
	const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.024), black);
	phone.add(body);
	const face = new THREE.Mesh(
		new THREE.PlaneGeometry(0.18, 0.37),
		new THREE.MeshBasicMaterial({ map: createDeviceScreenTexture('flat'), side: THREE.DoubleSide })
	);
	face.position.set(0, 0, 0.014);
	phone.add(face);
	return group;
}

function createCdSpindleExhibit(color) {
	// A spindle of shiny CD-ROMs — how software arrived circa 2004.
	const group = new THREE.Group();
	const standH = 0.5;
	group.add(createArtifactStand(color, 'CD-ROM', standH));

	const base = new THREE.Mesh(
		new THREE.CylinderGeometry(0.2, 0.22, 0.04, 24),
		new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.4, metalness: 0.3 })
	);
	base.position.y = standH + 0.02;
	group.add(base);
	const spindle = new THREE.Mesh(
		new THREE.CylinderGeometry(0.028, 0.028, 0.42, 12),
		new THREE.MeshStandardMaterial({ color: 0x3a3d46, roughness: 0.4, metalness: 0.4 })
	);
	spindle.position.y = standH + 0.23;
	group.add(spindle);
	for (let i = 0; i < 9; i++) {
		const disc = new THREE.Mesh(
			new THREE.CylinderGeometry(0.18, 0.18, 0.006, 36),
			new THREE.MeshStandardMaterial({
				color: i % 2 ? 0xcfd6e6 : 0xe6dff0,
				roughness: 0.12,
				metalness: 0.85,
				emissive: i % 3 === 0 ? new THREE.Color(color) : 0x101018,
				emissiveIntensity: i % 3 === 0 ? 0.12 : 0.04,
			})
		);
		disc.position.y = standH + 0.05 + i * 0.04;
		disc.rotation.y = i * 0.4;
		group.add(disc);
	}
	return group;
}

function createDeviceScreenTexture(kind) {
	if (deviceScreenTextures.has(kind)) {
		return deviceScreenTextures.get(kind);
	}
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 256;
	const ctx = canvas.getContext('2d');
	if (kind === 'aqua') {
		const grad = ctx.createLinearGradient(0, 0, 0, 256);
		grad.addColorStop(0, '#9fd4ff');
		grad.addColorStop(1, '#2f7fd6');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, 256, 256);
		// pinstripe
		ctx.fillStyle = 'rgba(255,255,255,0.08)';
		for (let y = 0; y < 256; y += 6) ctx.fillRect(0, y, 256, 2);
		// menu bar
		ctx.fillStyle = 'rgba(255,255,255,0.78)';
		ctx.fillRect(0, 0, 256, 22);
		// dock
		ctx.fillStyle = 'rgba(255,255,255,0.45)';
		ctx.fillRect(34, 210, 188, 34);
		const dockColors = ['#5b8def', '#2bb7ff', '#50d890', '#ffd166', '#ff6b6b', '#b37cff'];
		dockColors.forEach((c, i) => {
			ctx.fillStyle = c;
			roundRectPath(ctx, 44 + i * 30, 214, 24, 24, 6);
			ctx.fill();
		});
	} else if (kind === 'flat') {
		// Flat-design (mid-2010s) home screen: bold flat tiles, no gloss.
		ctx.fillStyle = '#11151c';
		ctx.fillRect(0, 0, 256, 256);
		ctx.fillStyle = '#ffffff';
		ctx.font = '700 12px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText('9:41', 128, 18);
		const flatColors = ['#1abc9c', '#3498db', '#e74c3c', '#f1c40f', '#9b59b6', '#2ecc71', '#e67e22', '#1abc9c', '#34495e'];
		let n = 0;
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 3; col++) {
				ctx.fillStyle = flatColors[n % flatColors.length];
				roundRectPath(ctx, 30 + col * 68, 40 + row * 64, 52, 52, 12);
				ctx.fill();
				n++;
			}
		}
	} else {
		// iOS-style home grid.
		const grad = ctx.createLinearGradient(0, 0, 0, 256);
		grad.addColorStop(0, '#1b2740');
		grad.addColorStop(1, '#0c1320');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, 256, 256);
		ctx.fillStyle = 'rgba(255,255,255,0.85)';
		ctx.font = '700 12px ui-monospace, monospace';
		ctx.textAlign = 'center';
		ctx.fillText('●●●●●  WordPress  ▲', 128, 16);
		const colors = ['#5b8def', '#2bb7ff', '#50d890', '#ffd166', '#ff6b6b', '#b37cff', '#ff9b54', '#78e0dc', '#f29111'];
		let i = 0;
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 4; col++) {
				ctx.fillStyle = colors[i % colors.length];
				roundRectPath(ctx, 26 + col * 54, 40 + row * 58, 40, 40, 9);
				ctx.fill();
				i++;
			}
		}
	}
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	deviceScreenTextures.set(kind, texture);
	return texture;
}

function roundRectPath(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function createTerminalDesk(color) {
	const group = new THREE.Group();
	group.add(createKnobConsole(color));
	const screen = createAdminScreenPanel(color, 0xdceeff, 0.62, 0.36);
	screen.position.set(0.16, 0.72, -0.13);
	group.add(screen);

	const laptopBase = new THREE.Mesh(
		new THREE.BoxGeometry(0.42, 0.045, 0.28),
		new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.46 })
	);
	laptopBase.position.set(-0.45, 0.48, -0.02);
	group.add(laptopBase);
	const laptopLid = createAdminScreenPanel(color, 0xeaf6ff, 0.36, 0.24);
	laptopLid.position.set(-0.45, 0.66, -0.16);
	laptopLid.rotation.x = -0.18;
	group.add(laptopLid);
	return group;
}

function createAdminScreenPanel(color, secondary, width, height) {
	const group = new THREE.Group();
	const casing = new THREE.Mesh(
		new THREE.BoxGeometry(width, height, 0.055),
		new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.42, metalness: 0.08 })
	);
	group.add(casing);

	const face = new THREE.Mesh(
		new THREE.PlaneGeometry(width * 0.82, height * 0.72),
		new THREE.MeshBasicMaterial({
			map: createAdminScreenTexture(color, secondary),
			side: THREE.DoubleSide,
		})
	);
	face.position.z = -0.031;
	group.add(face);
	return group;
}

function createAdminScreenTexture(color, secondary) {
	const canvas = document.createElement('canvas');
	canvas.width = 320;
	canvas.height = 200;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#f5f7fb';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#172033';
	ctx.fillRect(0, 0, 58, canvas.height);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvas.width, 16);
	ctx.fillStyle = '#d8e0ea';
	for (let index = 0; index < 6; index++) {
		ctx.fillRect(72, 34 + index * 24, 92 + index * 12, 9);
	}
	ctx.fillStyle = `#${new THREE.Color(secondary).getHexString()}`;
	ctx.fillRect(194, 42, 74, 44);
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(204, 53, 54, 8);
	ctx.fillRect(204, 69, 38, 6);
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createLogoClinic(color) {
	const group = new THREE.Group();
	group.add(createDisplayCase(color, 'W'));
	group.add(createPropLabel('FAUXGO FIX', color, 1.34));
	return group;
}

function createPluginCrates(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color: 0x9a6536, roughness: 0.72 });
	for (let index = 0; index < 5; index++) {
		const crate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.42), material);
		crate.position.set(-0.44 + (index % 3) * 0.42, 0.18 + Math.floor(index / 3) * 0.3, 0);
		crate.rotation.y = index * 0.13;
		group.add(crate);
		const label = new THREE.Mesh(
			new THREE.PlaneGeometry(0.26, 0.1),
			new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
		);
		label.position.set(crate.position.x, crate.position.y + 0.02, -0.215);
		group.add(label);
	}
	return group;
}

// The "HELLO DOLLY" vignette: the record stack plus a small standing card that
// spells out the in-joke — Hello Dolly was WordPress's first bundled plugin, its
// admin lyrics lifted from the Louis Armstrong standard.
function createHelloDollyExhibit(color) {
	const group = new THREE.Group();

	// One "hero" record stood upright on a slim easel at the back of the plinth,
	// its labelled face turned to the viewer (local −z) so the exhibit reads as a
	// vinyl record at a glance rather than a dark edge-on lump.
	const hero = createVinylRecord(color);
	hero.rotation.x = Math.PI / 2; // lay the flat disc up onto its edge, face toward −z
	hero.rotation.z = -0.12; // a casual lean
	hero.position.set(-0.16, 0.34, -0.05);
	group.add(hero);
	const easel = new THREE.Mesh(
		new THREE.BoxGeometry(0.05, 0.34, 0.05),
		new THREE.MeshStandardMaterial({ color: 0x3a3d46, roughness: 0.5, metalness: 0.3 })
	);
	easel.position.set(-0.16, 0.17, 0.04);
	easel.rotation.x = 0.22;
	group.add(easel);

	// A tidy short stack of records lying flat beside the hero, labels up.
	for (let index = 0; index < 4; index++) {
		const disc = createVinylRecord(color);
		disc.scale.setScalar(0.92);
		disc.position.set(0.3, 0.045 + index * 0.022, 0.12);
		disc.rotation.y = index * 0.5;
		group.add(disc);
	}

	const card = createReadableLabel(createHelloDollyCardTexture(color), 0.62, 0.4);
	// Stand the first-plugin card to the side, angled to the viewer.
	card.position.set(0.34, 0.52, -0.18);
	card.rotation.y = -0.34;
	group.add(card);
	return group;
}

// A single 7" vinyl record: a glossy black disc with a coloured centre label and
// a pale spindle hole, modelled flat (faces along ±y) so callers can stack it or
// stand it on edge. Sized to sit on a vignette plinth.
function createVinylRecord(color) {
	const record = new THREE.Group();
	const vinyl = new THREE.Mesh(
		new THREE.CylinderGeometry(0.21, 0.21, 0.012, 36),
		new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.32, metalness: 0.08 })
	);
	record.add(vinyl);
	const label = new THREE.Mesh(
		new THREE.CylinderGeometry(0.075, 0.075, 0.014, 24),
		new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
	);
	record.add(label);
	const hole = new THREE.Mesh(
		new THREE.CylinderGeometry(0.012, 0.012, 0.016, 12),
		new THREE.MeshBasicMaterial({ color: 0xf4ead0 })
	);
	record.add(hole);
	return record;
}

function createHelloDollyCardTexture(color) {
	const canvas = document.createElement('canvas');
	canvas.width = 384;
	canvas.height = 248;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff5df';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvas.width, 12);
	ctx.fillRect(0, canvas.height - 12, canvas.width, 12);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#111827';
	ctx.font = 'italic 900 40px Georgia, serif';
	ctx.fillText('“Hello, Dolly!”', canvas.width / 2, 58);
	ctx.fillStyle = '#3a3a3a';
	ctx.font = '600 21px system-ui, sans-serif';
	ctx.fillText('the first plugin —', canvas.width / 2, 118);
	ctx.fillText('a Louis Armstrong lyric', canvas.width / 2, 148);
	ctx.fillText('in your admin', canvas.width / 2, 178);
	const tex = createCanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function createRecordStack(color, options = {}) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.42 });
	const labelMaterial = new THREE.MeshBasicMaterial({ color });
	for (let index = 0; index < 6; index++) {
		const record = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.035, 28), material);
		record.position.set(-0.45 + index * 0.18, 0.32 + index * 0.035, 0);
		record.rotation.x = Math.PI / 2;
		group.add(record);
		const label = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 18), labelMaterial);
		label.position.copy(record.position);
		label.position.z -= 0.004;
		label.rotation.x = record.rotation.x;
		group.add(label);
	}
	if (options.showLabel !== false) {
		group.add(createPropLabel('JAZZ', color, 0.72));
	}
	return group;
}

function createMuseumLamp(color) {
	const group = new THREE.Group();
	const pole = new THREE.Mesh(
		new THREE.CylinderGeometry(0.035, 0.05, 1.1, 12),
		new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.38, metalness: 0.25 })
	);
	pole.position.y = 0.55;
	group.add(pole);
	const shade = new THREE.Mesh(
		new THREE.ConeGeometry(0.22, 0.22, 16),
		new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
	);
	shade.position.y = 1.16;
	shade.rotation.x = Math.PI;
	registerAnimation(shade, (object, elapsed) => {
		object.material.opacity = 0.84 + Math.sin(elapsed * 1.4) * 0.08;
	});
	group.add(shade);
	// Cast a soft warm pool of light so the lamp actually lights its corner.
	const glow = new THREE.PointLight(0xffe0b0, 0.7, 7, 2);
	glow.position.y = 1.08;
	registerAnimation(glow, (object, elapsed) => {
		object.intensity = 0.62 + Math.sin(elapsed * 1.4) * 0.08;
	});
	group.add(glow);
	return group;
}

function createSignpost(color, text = '404') {
	const group = new THREE.Group();
	const post = new THREE.Mesh(
		new THREE.BoxGeometry(0.08, 0.9, 0.08),
		new THREE.MeshStandardMaterial({ color: 0x2d2418, roughness: 0.7 })
	);
	post.position.y = 0.45;
	group.add(post);
	const sign = createReadableLabel(createSmallSignTexture(text, color), 0.82, 0.3);
	sign.position.y = 0.82;
	group.add(sign);
	return group;
}

function createPaperPile(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshBasicMaterial({ color: 0xf8efd9 });
	for (let index = 0; index < 7; index++) {
		const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.018, 0.48), material);
		sheet.position.y = 0.18 + index * 0.022;
		sheet.rotation.y = -0.18 + index * 0.06;
		group.add(sheet);
	}
	group.add(createPropLabel('README', color, 0.54));
	return group;
}

function createDisplayCase(color, label, options = {}) {
	const group = new THREE.Group();
	group.add(createPedestal(1.15, 0.32, color));
	const glass = new THREE.Mesh(
		new THREE.BoxGeometry(0.9, 0.62, 0.52),
		new THREE.MeshStandardMaterial({
			color: 0xdff8ff,
			transparent: true,
			opacity: 0.24,
			roughness: 0.04,
		})
	);
	glass.position.y = 0.74;
	group.add(glass);
	const artifact = new THREE.Mesh(
		new THREE.TorusGeometry(0.18, 0.04, 8, 24),
		new THREE.MeshStandardMaterial({ color: 0x101827, roughness: 0.35, metalness: 0.22 })
	);
	artifact.position.y = 0.72;
	group.add(artifact);
	if (options.showLabel !== false) {
		group.add(createPropLabel(label.toUpperCase(), color, 1.18));
	}
	return group;
}

function createPedestal(width, height, color) {
	const pedestal = new THREE.Mesh(
		new THREE.CylinderGeometry(width / 2, width / 2 + 0.08, height, 18),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.74 })
	);
	pedestal.position.y = height / 2;
	const band = new THREE.Mesh(
		new THREE.CylinderGeometry(width / 2 + 0.09, width / 2 + 0.09, 0.035, 18),
		new THREE.MeshBasicMaterial({ color })
	);
	band.position.y = height + 0.02;
	const group = new THREE.Group();
	group.add(pedestal, band);
	return group;
}

function createPropLabel(text, color, y) {
	const label = createReadableLabel(createSmallSignTexture(text, color), 1.18, 0.28);
	label.position.y = y;
	label.position.z = -0.34;
	return label;
}

function createReadableLabel(texture, width, height) {
	const group = new THREE.Group();
	const geometry = new THREE.PlaneGeometry(width, height);
	const front = new THREE.Mesh(
		geometry,
		new THREE.MeshBasicMaterial({ map: texture, transparent: true })
	);
	front.position.z = 0.012;
	group.add(front);

	const back = new THREE.Mesh(
		geometry,
		// Reuse the same texture (not a clone) — the back face shows identical
		// content, so cloning only doubled the GPU upload of every sign/label.
		new THREE.MeshBasicMaterial({ map: texture, transparent: true })
	);
	back.position.z = -0.012;
	back.rotation.y = Math.PI;
	group.add(back);
	return group;
}

function createSmallSignTexture(text, color) {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 160;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff5df';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvas.width, 16);
	ctx.fillRect(0, canvas.height - 16, canvas.width, 16);
	ctx.fillStyle = '#111827';
	ctx.font = '900 52px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fillFittedCanvasText(ctx, text, 256, 84, 436, 52, '900', 'Arial Black, Impact, sans-serif');
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

function createOpenSourceSignTexture(title, note, color) {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 220;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff5df';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#111827';
	ctx.fillRect(18, 18, canvas.width - 36, canvas.height - 36);
	ctx.fillStyle = color;
	ctx.fillRect(18, 18, canvas.width - 36, 18);
	ctx.fillRect(18, canvas.height - 36, canvas.width - 36, 18);
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 52px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fillFittedCanvasText(ctx, title, canvas.width / 2, 92, 410, 52, '900', 'Arial Black, Impact, sans-serif');
	ctx.fillStyle = color;
	ctx.font = '900 25px system-ui, sans-serif';
	fillFittedCanvasText(ctx, note.toUpperCase(), canvas.width / 2, 146, 360, 25, '900', 'system-ui, sans-serif');
	ctx.fillStyle = 'rgba(255, 245, 223, 0.18)';
	for (let index = 0; index < 8; index++) {
		ctx.fillRect(72 + index * 48, 172, 24, 8);
	}
	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createMascotStatue(color, secondary) {
	const group = new THREE.Group();
	const pedestal = new THREE.Mesh(
		new THREE.CylinderGeometry(0.72, 0.84, 0.42, 18),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.7 })
	);
	pedestal.position.y = 0.21;
	group.add(pedestal);

	const body = new THREE.Mesh(
		new THREE.SphereGeometry(0.48, 24, 16),
		new THREE.MeshStandardMaterial({ color, roughness: 0.42 })
	);
	body.position.y = 0.9;
	group.add(body);

	const earMaterial = new THREE.MeshStandardMaterial({ color: secondary, roughness: 0.5 });
	for (const x of [-1, 1]) {
		const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 16), earMaterial);
		ear.position.set(x * 0.35, 1.25, 0);
		ear.rotation.z = -x * 0.55;
		group.add(ear);
	}

	const faceMaterial = new THREE.MeshBasicMaterial({ color: 0x111827 });
	for (const x of [-1, 1]) {
		const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), faceMaterial);
		eye.position.set(x * 0.14, 0.98, -0.45);
		group.add(eye);
	}
	group.scale.setScalar(1.12);
	return group;
}

function createPlant(color, scale = 1) {
	const group = new THREE.Group();
	const pot = new THREE.Mesh(
		new THREE.CylinderGeometry(0.22, 0.3, 0.42, 12),
		new THREE.MeshStandardMaterial({ color: 0x8f5a2d, roughness: 0.76 })
	);
	pot.position.y = 0.21;
	group.add(pot);
	const leafMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
	for (let index = 0; index < 7; index++) {
		const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 10), leafMaterial);
		const angle = (Math.PI * 2 * index) / 7;
		leaf.position.set(Math.cos(angle) * 0.14, 0.74, Math.sin(angle) * 0.14);
		leaf.rotation.z = Math.cos(angle) * 0.55;
		leaf.rotation.x = Math.sin(angle) * 0.55;
		group.add(leaf);
	}
	group.scale.setScalar(scale);
	return group;
}

// Real-world-scaled museum bench used as a seating placeholder until the GLB
// loads. Seat top sits at 0.45m, legs reach the floor; `length` lets it match
// the loaded model's footprint so the swap is seamless. Seat runs along x, with
// its open (sit-in) side on local -z to match the loaded benches/sofas.
function createBench(color, length = 1.9) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color, roughness: 0.58 });
	const dark = new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.5 });
	const depth = 0.5;
	const seatTop = 0.45;
	const legInset = 0.16;
	const seat = new THREE.Mesh(new THREE.BoxGeometry(length, 0.14, depth), material);
	seat.position.set(0, seatTop - 0.07, 0);
	group.add(seat);
	const back = new THREE.Mesh(new THREE.BoxGeometry(length, 0.46, 0.1), material);
	back.position.set(0, seatTop + 0.21, depth / 2 - 0.05);
	group.add(back);
	for (const x of [-length / 2 + legInset, length / 2 - legInset]) {
		for (const z of [-depth / 2 + legInset, depth / 2 - legInset]) {
			const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, seatTop - 0.07, 0.08), dark);
			leg.position.set(x, (seatTop - 0.07) / 2, z);
			group.add(leg);
		}
	}
	return group;
}

function createBlockStack(color) {
	const group = new THREE.Group();
	for (let index = 0; index < 5; index++) {
		const block = new THREE.Mesh(
			new THREE.BoxGeometry(0.52, 0.32, 0.52),
			new THREE.MeshStandardMaterial({
				color: activeVariant.eraColors[index % activeVariant.eraColors.length],
				roughness: 0.5,
			})
		);
		block.position.set((index % 2) * 0.34 - 0.17, 0.18 + index * 0.32, 0);
		block.rotation.y = index * 0.18;
		group.add(block);
	}
	return group;
}

function createServerStack(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color: 0x101827, roughness: 0.36, metalness: 0.28 });
	for (let index = 0; index < 4; index++) {
		const unit = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.28, 0.46), material);
		unit.position.y = 0.16 + index * 0.31;
		group.add(unit);
		const light = new THREE.Mesh(
			new THREE.BoxGeometry(0.08, 0.04, 0.03),
			new THREE.MeshBasicMaterial({ color })
		);
		light.position.set(0.3, unit.position.y, -0.25);
		group.add(light);
	}
	return group;
}

function createCommentSculpture(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
	for (let index = 0; index < 3; index++) {
		const bubble = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.38, 0.08), material);
		bubble.position.set(0, 0.42 + index * 0.42, index * 0.08);
		group.add(bubble);
	}
	return group;
}

function createOrbitalSculpture(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color, roughness: 0.24, metalness: 0.55 });
	const core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), material);
	core.position.y = 0.9;
	group.add(core);
	for (const rotation of [0, Math.PI / 3, -Math.PI / 3]) {
		const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.025, 8, 48), material);
		ring.position.y = 0.9;
		ring.rotation.x = Math.PI / 2;
		ring.rotation.z = rotation;
		ring.userData.spinBase = rotation;
		registerAnimation(ring, (object, elapsed) => {
			object.rotation.z = object.userData.spinBase + elapsed * 0.42;
			object.rotation.y = Math.sin(elapsed * 0.55 + object.userData.spinBase) * 0.18;
		});
		group.add(ring);
	}
	return group;
}

function createReleaseTrain(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color, roughness: 0.46 });
	for (let index = 0; index < 3; index++) {
		const car = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.34), material);
		car.position.set(-0.5 + index * 0.5, 0.38, 0);
		group.add(car);
	}
	return group;
}

function createTimeCapsule(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.35 });
	const capsule = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 18), material);
	capsule.position.y = 0.7;
	capsule.rotation.z = Math.PI / 2;
	group.add(capsule);
	return group;
}

function createKnobConsole(color) {
	const group = new THREE.Group();
	const base = new THREE.Mesh(
		new THREE.BoxGeometry(0.9, 0.24, 0.5),
		new THREE.MeshStandardMaterial({ color: 0x151a2a, roughness: 0.48 })
	);
	base.position.y = 0.34;
	group.add(base);
	const material = new THREE.MeshStandardMaterial({ color, roughness: 0.32 });
	for (let index = 0; index < 4; index++) {
		const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 16), material);
		knob.position.set(-0.3 + index * 0.2, 0.51, -0.12);
		knob.rotation.x = Math.PI / 2;
		group.add(knob);
	}
	return group;
}

function getLocalWallPosition(side, tangentOffset) {
	return {
		front: new THREE.Vector3(tangentOffset, 0, -roomDepth / 2),
		back: new THREE.Vector3(tangentOffset, 0, roomDepth / 2),
		left: new THREE.Vector3(-roomWidth / 2, 0, tangentOffset),
		right: new THREE.Vector3(roomWidth / 2, 0, tangentOffset),
	}[side];
}

function createActiveExhibitMarker() {
	const group = new THREE.Group();
	const wallGlow = new THREE.Mesh(
		new THREE.PlaneGeometry(3.7, 2.8),
		new THREE.MeshBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.18,
			depthWrite: false,
			side: THREE.DoubleSide,
		})
	);
	wallGlow.name = 'activeWallGlow';
	registerAnimation(wallGlow, (object, elapsed) => {
		object.material.opacity = 0.13 + Math.sin(elapsed * 2.4) * 0.035;
	});
	group.add(wallGlow);
	return group;
}

function createExhibit(release, index, slot, color) {
	const group = new THREE.Group();
	group.position
		.copy(slot.position)
		.add(slot.normal.clone().multiplyScalar(exhibitMountOffset));
	group.rotation.y = slot.rotationY;

	const frame = createExhibitFrame(color);
	group.add(frame);

	const plaque = new THREE.Mesh(
		new THREE.PlaneGeometry(exhibitPlaqueWidth, exhibitPlaqueHeight),
		new THREE.MeshBasicMaterial({
			map: createPlaqueTexture(release, color),
			side: THREE.DoubleSide,
		})
	);
	plaque.position.z = exhibitPlaqueRecess;
	plaque.renderOrder = 2;
	plaque.userData.releaseIndex = index;
	group.add(plaque);
	pickables.push(plaque);

	return group;
}

function createExhibitFrame(color) {
	const group = new THREE.Group();
	const rail = (exhibitOuterWidth - exhibitPlaqueWidth) / 2;
	const innerWidth = exhibitOuterWidth - rail * 2;
	const innerHeight = exhibitOuterHeight - rail * 2;
	const railMaterial = createFrameMaterial(color);
	const shadowMaterial = new THREE.MeshBasicMaterial({
		color: 0x080d16,
		transparent: true,
		opacity: 0.62,
	});

	const shadow = new THREE.Mesh(
		new THREE.BoxGeometry(
			exhibitOuterWidth + 0.08,
			exhibitOuterHeight + 0.08,
			0.05
		),
		shadowMaterial
	);
	shadow.position.z = 0.025;
	group.add(shadow);

	const shape = new THREE.Shape();
	shape.moveTo(-exhibitOuterWidth / 2, -exhibitOuterHeight / 2);
	shape.lineTo(exhibitOuterWidth / 2, -exhibitOuterHeight / 2);
	shape.lineTo(exhibitOuterWidth / 2, exhibitOuterHeight / 2);
	shape.lineTo(-exhibitOuterWidth / 2, exhibitOuterHeight / 2);
	shape.lineTo(-exhibitOuterWidth / 2, -exhibitOuterHeight / 2);

	const hole = new THREE.Path();
	hole.moveTo(-innerWidth / 2, -innerHeight / 2);
	hole.lineTo(-innerWidth / 2, innerHeight / 2);
	hole.lineTo(innerWidth / 2, innerHeight / 2);
	hole.lineTo(innerWidth / 2, -innerHeight / 2);
	hole.lineTo(-innerWidth / 2, -innerHeight / 2);
	shape.holes.push(hole);

	const frame = new THREE.Mesh(
		new THREE.ExtrudeGeometry(shape, {
			depth: exhibitFrameDepth,
			bevelEnabled: true,
			bevelSegments: 1,
			bevelSize: 0.018,
			bevelThickness: 0.018,
		}),
		railMaterial
	);
	group.add(frame);
	addFrameMolding(group, color, innerWidth, innerHeight);
	addFrameAccents(group, color);

	const inset = new THREE.Mesh(
		new THREE.PlaneGeometry(
			exhibitPlaqueWidth + 0.08,
			exhibitPlaqueHeight + 0.08
		),
		new THREE.MeshBasicMaterial({
			color: 0x0c1320,
			side: THREE.DoubleSide,
		})
	);
	inset.position.z = exhibitPlaqueRecess - 0.025;
	group.add(inset);
	return group;
}

// Layered ornate molding for the museum (classic) frames: a stepped outer
// lip, an era-tinted reveal line, a brass inner liner around the picture, and
// small brass corner rosettes plus a bottom nameplate strip. Kept inside the
// existing rail so the outer footprint is unchanged.
function addFrameMolding(group, color, innerWidth, innerHeight) {
	const style = activeVariant.frameStyle || 'classic';
	if (style !== 'classic' && style !== 'museum-brass') {
		return;
	}

	const woodMaterial = new THREE.MeshStandardMaterial({
		color: 0x3c2515,
		roughness: 0.58,
		metalness: 0.08,
	});
	const brassMaterial = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		roughness: 0.32,
		metalness: 0.62,
	});

	// Stepped dark lip just inside the outer edge, raised to read as a molding.
	const outerLip = makeFrameRingMesh(
		exhibitOuterWidth - 0.03,
		exhibitOuterHeight - 0.03,
		exhibitOuterWidth - 0.13,
		exhibitOuterHeight - 0.13,
		0.05,
		woodMaterial
	);
	outerLip.position.z = exhibitFrameDepth - 0.01;
	group.add(outerLip);

	// Era-tinted reveal: a thin flat line in the room color within the rail.
	const reveal = makeFrameRingMesh(
		innerWidth + 0.135,
		innerHeight + 0.135,
		innerWidth + 0.105,
		innerHeight + 0.105,
		0.012,
		new THREE.MeshStandardMaterial({
			color,
			roughness: 0.4,
			metalness: 0.2,
			emissive: new THREE.Color(color),
			emissiveIntensity: 0.12,
		})
	);
	reveal.position.z = exhibitFrameDepth + 0.005;
	group.add(reveal);

	// Brass inner liner framing the picture opening, raised with a small bevel.
	// Its inner edge stays just outside the picture so the plaque is unobstructed.
	const liner = makeFrameRingMesh(
		innerWidth + 0.08,
		innerHeight + 0.08,
		innerWidth + 0.02,
		innerHeight + 0.02,
		0.06,
		brassMaterial,
		0.01
	);
	liner.position.z = exhibitFrameDepth - 0.005;
	group.add(liner);

}

// Builds a single flat picture-frame "ring" mesh (a rectangle with a
// rectangular hole) extruded along z, used for layered molding bands.
function makeFrameRingMesh(outerW, outerH, innerW, innerH, depth, material, bevel = 0) {
	const shape = new THREE.Shape();
	shape.moveTo(-outerW / 2, -outerH / 2);
	shape.lineTo(outerW / 2, -outerH / 2);
	shape.lineTo(outerW / 2, outerH / 2);
	shape.lineTo(-outerW / 2, outerH / 2);
	shape.lineTo(-outerW / 2, -outerH / 2);

	const hole = new THREE.Path();
	hole.moveTo(-innerW / 2, -innerH / 2);
	hole.lineTo(-innerW / 2, innerH / 2);
	hole.lineTo(innerW / 2, innerH / 2);
	hole.lineTo(innerW / 2, -innerH / 2);
	hole.lineTo(-innerW / 2, -innerH / 2);
	shape.holes.push(hole);

	return new THREE.Mesh(
		new THREE.ExtrudeGeometry(shape, {
			depth,
			bevelEnabled: bevel > 0,
			bevelSegments: 1,
			bevelSize: bevel,
			bevelThickness: bevel,
		}),
		material
	);
}

function createFrameMaterial(color) {
	const style = activeVariant.frameStyle || 'classic';
	const material = new THREE.MeshStandardMaterial({
		color,
		roughness: 0.46,
		metalness: 0.16,
	});
	if (style === 'chrome' || style === 'portal') {
		material.color.set(0xd8ecff);
		material.metalness = 0.78;
		material.roughness = 0.22;
	}
	if (style === 'wood' || style === 'market' || style === 'crate' || style === 'record') {
		material.color.set(0x8f5a2d);
		material.metalness = 0.04;
		material.roughness = 0.7;
	}
	if (style === 'museum-brass') {
		material.color.set(0xc79b43);
		material.metalness = 0.36;
		material.roughness = 0.34;
	}
	if (style === 'neon' || style === 'bubble' || style === 'terminal-bezel' || style === 'arcade-cabinet') {
		material.emissive = new THREE.Color(color);
		material.emissiveIntensity = 0.18;
		material.roughness = 0.3;
	}
	if (style === 'concrete' || style === 'monument') {
		material.color.set(0x9b9b91);
		material.metalness = 0.02;
		material.roughness = 0.92;
	}
	if (style === 'vine') {
		material.color.set(0x5d7d4d);
		material.roughness = 0.78;
	}
	return material;
}

function addFrameAccents(group, color) {
	if (!shouldDecorateScene) {
		return;
	}
	const style = activeVariant.frameStyle || activeVariant.frameBase;
	if (['badge', 'knob', 'rail', 'capsule', 'bubble', 'record', 'monument'].includes(style)) {
		addFrameCornerDots(group, color, style);
	}
	if (['block', 'maze', 'portal', 'arcade-cabinet', 'terminal-bezel'].includes(style)) {
		addFrameEdgeBlocks(group, color);
	}
	if (style === 'tape' || style === 'porcelain') {
		addFrameTape(group);
	}
	if (style === 'crate') {
		addFrameWoodSlats(group);
	}
	if (style === 'vine') {
		addFrameVines(group, color);
	}
	if (style === 'record') {
		addFrameRecords(group);
	}
}

function addFrameCornerDots(group, color, style) {
	const radius = style === 'bubble' ? 0.055 : 0.04;
	const geometry = new THREE.SphereGeometry(radius, 12, 8);
	const material = new THREE.MeshStandardMaterial({
		color: style === 'capsule' ? 0xf8efd9 : color,
		metalness: style === 'rail' || style === 'museum-brass' ? 0.55 : 0.08,
		roughness: 0.38,
	});
	for (const x of [-1, 1]) {
		for (const y of [-1, 1]) {
			const dot = new THREE.Mesh(geometry, material);
			dot.position.set(
				x * (exhibitOuterWidth / 2 - 0.18),
				y * (exhibitOuterHeight / 2 - 0.18),
				exhibitFrameDepth + 0.04
			);
			group.add(dot);
		}
	}
}

function addFrameEdgeBlocks(group, color) {
	const material = new THREE.MeshBasicMaterial({ color });
	const geometry = new THREE.BoxGeometry(0.22, 0.1, 0.08);
	for (let index = 0; index < 5; index++) {
		const top = new THREE.Mesh(geometry, material);
		top.position.set(-1.1 + index * 0.55, exhibitOuterHeight / 2 + 0.08, 0.1);
		group.add(top);
	}
}

function addFrameTape(group) {
	const material = new THREE.MeshBasicMaterial({
		color: 0xf8e6b0,
		transparent: true,
		opacity: 0.72,
	});
	for (const x of [-1, 1]) {
		const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.18), material);
		tape.position.set(x * 1.25, exhibitOuterHeight / 2 + 0.04, exhibitFrameDepth + 0.055);
		tape.rotation.z = x * 0.18;
		group.add(tape);
	}
}

function addFrameWoodSlats(group) {
	const material = new THREE.MeshBasicMaterial({ color: 0x5d321a });
	for (const y of [-1, 1]) {
		const slat = new THREE.Mesh(new THREE.BoxGeometry(exhibitOuterWidth + 0.14, 0.045, 0.08), material);
		slat.position.set(0, y * (exhibitOuterHeight / 2 - 0.28), exhibitFrameDepth + 0.07);
		group.add(slat);
	}
}

function addFrameVines(group, color) {
	const material = new THREE.MeshBasicMaterial({ color });
	for (let index = 0; index < 6; index++) {
		const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), material);
		leaf.position.set(-exhibitOuterWidth / 2 - 0.03, -0.78 + index * 0.32, exhibitFrameDepth + 0.075);
		leaf.rotation.z = index % 2 ? 0.5 : -0.5;
		group.add(leaf);
	}
}

function addFrameRecords(group) {
	const material = new THREE.MeshBasicMaterial({ color: 0x101014 });
	for (const x of [-1, 1]) {
		const record = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.16, 28), material);
		record.position.set(x * (exhibitOuterWidth / 2 - 0.2), exhibitOuterHeight / 2 - 0.24, exhibitFrameDepth + 0.08);
		group.add(record);
	}
}

function createExhibitSlots(room, releaseCount) {
	// Room-local x points toward the visitor's left when entering from the hub.
	const walls = [
		{ side: 'right', reverse: false },
		{ side: 'rightChamfer', reverse: false },
		{ side: 'back', reverse: true },
		{ side: 'leftChamfer', reverse: true },
		{ side: 'left', reverse: true },
	];
	const wallCounts = distributeWallCounts(releaseCount);
	// An annex doorway is cut into this room's right chamfer, so that chamfer can
	// no longer carry an exhibit; move its slot onto the flat back wall.
	if (roomChamferIsDoored(room.era) && wallCounts[1] > 0) {
		wallCounts[2] += wallCounts[1];
		wallCounts[1] = 0;
	}
	return walls.flatMap(({ side, reverse }, wallIndex) => {
		const slotCount = wallCounts[wallIndex];
		return Array.from({ length: slotCount }, (_, slotIndex) => {
			const wallSlotIndex = reverse ? slotCount - slotIndex - 1 : slotIndex;
			return createWallSlot(room, side, wallSlotIndex, slotCount);
		});
	});
}

function createWallSlot(room, side, slotIndex, slotCount) {
	const localPosition = getLocalSlotPosition(side, slotIndex, slotCount);
	const position = roomLocalToWorld(room, localPosition);
	position.y = 2.05;
	const normal = getSlotNormal(room, side);
	return {
		position,
		normal,
		tangent: getSlotTangent(room, side),
		rotationY: getRotationForNormal(normal),
	};
}

function getLocalSlotPosition(side, slotIndex, slotCount) {
	if (side === 'back') {
		const value = getSlotAxisValue(
			slotIndex,
			slotCount,
			-backFlatHalf + exhibitOuterWidth / 2 + exhibitWallMargin,
			backFlatHalf - exhibitOuterWidth / 2 - exhibitWallMargin
		);
		return new THREE.Vector3(value, 0, roomDepth / 2);
	}
	if (side === 'rightChamfer' || side === 'leftChamfer') {
		// Distribute along the chamfer line from the side-wall end to the back.
		const s = side === 'leftChamfer' ? -1 : 1;
		const u = getSlotAxisValue(slotIndex, slotCount, 0.32, 0.68);
		const ax = s * sideEndHalfWidth;
		const bx = s * backFlatHalf;
		return new THREE.Vector3(ax + (bx - ax) * u, 0, spokeEndZ + (roomDepth / 2 - spokeEndZ) * u);
	}
	// Side walls are angled radial spokes carrying up to two exhibits that flank
	// the shared doorway: slot 0 in the small FRONT segment (inner edge -> door),
	// slot 1 in the BACK segment (door -> beveled corner). A lone exhibit takes
	// the roomier back segment. x follows the tilted wall at this z.
	let value;
	if (slotCount === 2 && slotIndex === 0) {
		value = getSlotAxisValue(0, 1, sideExhibitFrontMinZ, sideExhibitFrontMaxZ);
	} else {
		value = getSlotAxisValue(0, 1, sideExhibitMinZ, sideExhibitMaxZ);
	}
	const halfW = sideHalfWidthAtZ(value);
	return new THREE.Vector3(side === 'left' ? -halfW : halfW, 0, value);
}

function getSlotAxisValue(slotIndex, slotCount, min, max) {
	// Even distribution: each slot sits at the centre of its equal segment, so
	// two items spread across a wide wall instead of bunching in the middle.
	// For slotCount === 1 this yields the midpoint.
	return min + (max - min) * (slotIndex + 0.5) / slotCount;
}

function roomLocalToWorld(room, localPosition) {
	return room.center
		.clone()
		.add(room.tangent.clone().multiplyScalar(localPosition.x))
		.add(room.normal.clone().multiplyScalar(localPosition.z))
		.setY(localPosition.y);
}

function getSlotNormal(room, side) {
	if (side === 'back') {
		return room.normal.clone().multiplyScalar(-1);
	}
	if (side === 'rightChamfer' || side === 'leftChamfer') {
		// 45deg chamfer inward normal: toward -normal and toward room centre.
		const c = Math.SQRT1_2;
		const s = side === 'leftChamfer' ? -1 : 1;
		return room.tangent
			.clone()
			.multiplyScalar(-s * c)
			.add(room.normal.clone().multiplyScalar(-c))
			.normalize();
	}
	// Inward normal of the 22.5deg-tilted side wall: -+cos*tangent + sin*normal.
	const cos = Math.cos(wedgeHalfAngle);
	const sin = Math.sin(wedgeHalfAngle);
	const tx = side === 'left' ? cos : -cos;
	return room.tangent
		.clone()
		.multiplyScalar(tx)
		.add(room.normal.clone().multiplyScalar(sin))
		.normalize();
}

function getSlotTangent(room, side) {
	if (side === 'back') {
		return room.tangent.clone();
	}
	if (side === 'rightChamfer' || side === 'leftChamfer') {
		const c = Math.SQRT1_2;
		const s = side === 'leftChamfer' ? -1 : 1;
		return room.tangent
			.clone()
			.multiplyScalar(-s * c)
			.add(room.normal.clone().multiplyScalar(c))
			.normalize();
	}
	// Along-wall direction (inner -> back) of the tilted side wall.
	const cos = Math.cos(wedgeHalfAngle);
	const sin = Math.sin(wedgeHalfAngle);
	const tx = side === 'left' ? -sin : sin;
	return room.tangent
		.clone()
		.multiplyScalar(tx)
		.add(room.normal.clone().multiplyScalar(cos))
		.normalize();
}

function distributeWallCounts(count) {
	// [right, rightChamfer, back, leftChamfer, left]. The flat back carries the
	// bulk; each beveled corner holds at most one. Busy rooms put two on each
	// side wall so exhibits flank the shared doorway front and back.
	const table = {
		1: [0, 0, 1, 0, 0],
		2: [0, 0, 2, 0, 0],
		3: [0, 1, 1, 1, 0],
		4: [0, 1, 2, 1, 0],
		5: [1, 1, 1, 1, 1],
		6: [1, 1, 2, 1, 1],
		7: [2, 1, 1, 1, 2],
		8: [2, 1, 2, 1, 2],
	};
	return table[count] || [2, 1, count - 6, 1, 2];
}

function getEraReleaseGroups() {
	const groups = new Map(eras.map((era) => [era, []]));
	releases.forEach((release, index) => {
		groups.get(release.era)?.push({ release, index });
	});
	return eras.map((era) => ({
		era,
		items: groups.get(era) || [],
	}));
}

function computeGalleryConnections() {
	// Find adjacent room pairs (45deg apart) and mark which local side wall
	// (left/right) each connecting doorway lives on.
	for (const side of roomSides) {
		side.connectLeft = false;
		side.connectRight = false;
	}
	const pairs = [];
	const seen = new Set();
	for (const side of roomSides) {
		for (const other of roomSides) {
			if (side === other) {
				continue;
			}
			let delta = other.angle - side.angle;
			delta = Math.atan2(Math.sin(delta), Math.cos(delta));
			if (Math.abs(Math.abs(delta) - Math.PI / 4) > 0.02) {
				continue;
			}
			const onRight =
				(other.center.x - side.center.x) * side.tangent.x +
					(other.center.z - side.center.z) * side.tangent.z >
				0;
			if (onRight) {
				side.connectRight = true;
			} else {
				side.connectLeft = true;
			}
			const key = [side.era, other.era].sort().join('|');
			if (!seen.has(key)) {
				seen.add(key);
				pairs.push({ a: side, b: other });
			}
		}
	}
	return pairs;
}

function getMuseumBounds() {
	const bounds = {
		minX: Infinity,
		maxX: -Infinity,
		minZ: Infinity,
		maxZ: -Infinity,
	};
	for (const point of getMuseumFootprintPoints()) {
		bounds.minX = Math.min(bounds.minX, point.x);
		bounds.maxX = Math.max(bounds.maxX, point.x);
		bounds.minZ = Math.min(bounds.minZ, point.z);
		bounds.maxZ = Math.max(bounds.maxZ, point.z);
	}
	return bounds;
}

function getMuseumFootprintPoints() {
	const points = hubSides.map((side) =>
		side.normal.clone().multiplyScalar(hubCircumradius)
	);
	const halfDepth = roomDepth / 2;
	for (const room of roomSides) {
		// Six hexagon corners: narrow inner edge, beveled outer corners, flat back.
		const corners = [
			[-innerHalfWidth, -halfDepth],
			[innerHalfWidth, -halfDepth],
			[sideEndHalfWidth, spokeEndZ],
			[backFlatHalf, halfDepth],
			[-backFlatHalf, halfDepth],
			[-sideEndHalfWidth, spokeEndZ],
		];
		for (const [x, z] of corners) {
			points.push(roomLocalToWorld(room, new THREE.Vector3(x, 0, z)));
		}
	}
	// The Mercantile gift shop extends past the mural wall in the current
	// variant; include its outer corners so camera bounds reach it. The two side
	// passages to Blogging Roots / Blocks Everywhere lie between the shop and the
	// galleries (x in [-9.7, 7.7], z in [21.4, 23.6]), well within the gallery and
	// shop corners already in this set, so the shell already encloses them.
	if (isCurrentVariant) {
		const wt = shopWallThickness;
		points.push(
			new THREE.Vector3(shopMinX - wt, 0, shopZStart - wt),
			new THREE.Vector3(shopMaxX + wt, 0, shopZStart - wt),
			new THREE.Vector3(shopMaxX + wt, 0, shopZEnd + wt),
			new THREE.Vector3(shopMinX - wt, 0, shopZEnd + wt)
		);
		// The Playground annex extends east beyond Blocks Everywhere's back corner;
		// include its outer corners so the building shell encloses it.
		const pwt = playgroundWallThickness;
		points.push(
			new THREE.Vector3(playgroundMaxX + pwt, 0, playgroundMinZ - pwt),
			new THREE.Vector3(playgroundMaxX + pwt, 0, playgroundMaxZ + pwt),
			new THREE.Vector3(playgroundMinX, 0, playgroundMaxZ + pwt),
			new THREE.Vector3(playgroundMinX, 0, playgroundMinZ - pwt)
		);
		// Each era side-room annex bulges outward past its gallery's chamfer; add
		// its four outer corners so the building shell and camera bounds enclose it.
		for (const annex of eraAnnexes) {
			const awt = annexWallThickness;
			const corner = (f, s) =>
				annex.center
					.clone()
					.add(annex.forward.clone().multiplyScalar(f))
					.add(annex.sideways.clone().multiplyScalar(s));
			points.push(
				corner(annex.depth + awt, annex.sMin - awt),
				corner(annex.depth + awt, annex.sMax + awt),
				corner(0, annex.sMin - awt),
				corner(0, annex.sMax + awt)
			);
		}
	}
	return points;
}

function createHubSides() {
	// Facing the mural, chronology starts on the visitor's right.
	return [
		createHubSide(0, eras[3]),
		createHubSide(Math.PI / 4, eras[4]),
		createHubSide(Math.PI / 2, eras[5]),
		createHubSide((Math.PI * 3) / 4, eras[6]),
		createHubSide(Math.PI, undefined, 'mural'),
		createHubSide((-Math.PI * 3) / 4, eras[0]),
		createHubSide(-Math.PI / 2, eras[1]),
		createHubSide(-Math.PI / 4, eras[2]),
	];
}

function createHubSide(angle, era, kind = 'room') {
	const normal = getDirectionFromAngle(angle);
	const tangent = getTangentForNormal(normal);
	const midpoint = normal.clone().multiplyScalar(hubApothem);
	const center = normal.clone().multiplyScalar(hubApothem + roomDepth / 2);
	return {
		angle,
		center,
		doorway: midpoint.clone(),
		era,
		kind,
		midpoint,
		normal,
		tangent,
	};
}

function getDirectionFromAngle(angle) {
	return new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle));
}

function getTangentForNormal(normal) {
	return new THREE.Vector3(normal.z, 0, -normal.x);
}

function getRotationForNormal(normal) {
	return Math.atan2(normal.x, normal.z);
}

function getShellBounds() {
	return {
		minX: museumBounds.minX - shellPadding,
		maxX: museumBounds.maxX + shellPadding,
		minZ: museumBounds.minZ - shellPadding,
		maxZ: museumBounds.maxZ + shellPadding,
	};
}

function createPlaqueTexture(release, color) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 736;
	const ctx = canvas.getContext('2d');
	drawPlaqueTexture(ctx, canvas, release, color, {});
	// Full-resolution: these release pictures are the main thing visitors read
	// (and zoom into), so they bypass the 448px cap.
	const texture = createCanvasTexture(canvas, 1024);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;

	// Codenamed releases load a portrait + screenshot; the founding 0.7 has no
	// portrait but now carries a captured screenshot. Anything without either is
	// skipped so it doesn't 404.
	const wantsPortrait = releaseHasCapturedAssets(release);
	if (wantsPortrait || releaseHasScreenshot(release)) {
		scheduleDeferredAssetTask(() => {
			const musicianPath = wantsPortrait ? getMusicianImagePath(release) : null;
			Promise.all([
				musicianPath ? loadPlaqueImage(musicianPath) : Promise.resolve(null),
				loadPlaqueImage(getScreenshotImagePath(release)),
			]).then(([musicianImage, screenshotImage]) => {
				drawPlaqueTexture(ctx, canvas, release, color, {
					musicianImage,
					screenshotImage,
				});
				refreshCanvasTexture(texture);
			});
		});
	}

	return texture;
}

// Pre-1.0 releases predate the jazz-codename tradition and have no captured
// portrait or screenshot, so their image assets are intentionally absent.
function releaseHasCapturedAssets(release) {
	return Boolean(release.musician);
}

// The founding 0.7 has no jazz portrait but does have a captured screenshot.
function releaseHasScreenshot(release) {
	return releaseHasCapturedAssets(release) || release.version === '0.7';
}

function drawPlaqueTexture(ctx, canvas, release, color, images) {
	const plaquePaper = isCurrentVariant
		? '#f8efd9'
		: activeVariant.uiStyle === 'paper'
			? '#f1dfb8'
			: activeVariant.uiStyle === 'terminal'
				? '#9effd0'
				: '#f8efd9';
	const plaqueInk = isCurrentVariant
		? '#0f1726'
		: activeVariant.uiStyle === 'paper'
			? '#24170d'
			: activeVariant.uiStyle === 'terminal'
				? '#00150f'
				: '#0f1726';
	const mutedInk = isCurrentVariant
		? 'rgba(255, 245, 223, 0.84)'
		: activeVariant.uiStyle === 'paper'
			? 'rgba(36, 23, 13, 0.78)'
			: 'rgba(255, 245, 223, 0.84)';
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = plaquePaper;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = plaqueInk;
	ctx.fillRect(24, 24, canvas.width - 48, canvas.height - 48);
	ctx.fillStyle = color;
	ctx.fillRect(24, 24, canvas.width - 48, 18);
	ctx.globalAlpha = 0.16;
	ctx.fillRect(24, canvas.height - 46, canvas.width - 48, 22);
	ctx.globalAlpha = 1;

	if (releaseHasCapturedAssets(release)) {
		drawMediaPanel(ctx, images.musicianImage, 56, 76, 286, 356, {
			fit: 'cover',
			label: release.musician,
			placeholder: 'Jazz portrait',
		});
		drawMediaPanel(ctx, images.screenshotImage, 376, 76, 592, 356, {
			fit: 'contain',
			label: 'WordPress ' + release.version,
			placeholder: 'WordPress screenshot',
		});
	} else {
		// Founding release (0.7): a compact b2/cafelog → WordPress lineage placard
		// in the portrait slot, with the captured WordPress 0.7 screenshot beside it.
		drawFoundingReleasePanel(ctx, release, color, 56, 76, 286, 356);
		drawMediaPanel(ctx, images.screenshotImage, 376, 76, 592, 356, {
			fit: 'contain',
			label: 'WordPress ' + release.version,
			placeholder: 'WordPress screenshot',
		});
	}

	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = plaquePaper;
	ctx.font = '900 88px Arial Black, Impact, sans-serif';
	ctx.fillText(release.version, 60, 548);
	ctx.fillStyle = activeVariant.uiStyle === 'paper' ? '#f8efd9' : 'rgba(255, 245, 223, 0.92)';
	ctx.font = '800 32px system-ui, sans-serif';
	wrapText(ctx, release.name, 62, 598, 260, 34, 2);
	ctx.fillStyle = isCurrentVariant ? 'rgba(255, 245, 223, 0.62)' : mutedInk;
	ctx.font = '700 22px system-ui, sans-serif';
	ctx.fillText(release.released, 62, 682);

	ctx.fillStyle = color;
	ctx.font = '900 32px system-ui, sans-serif';
	wrapText(ctx, release.knownFor, 376, 528, 560, 40, 2);
	ctx.fillStyle = mutedInk;
	ctx.font = '500 25px system-ui, sans-serif';
	wrapText(ctx, release.detail, 376, 620, 560, 34, 2);
	ctx.fillStyle = 'rgba(255, 245, 223, 0.52)';
	ctx.font = '800 18px system-ui, sans-serif';
	ctx.fillText(release.artifact, 376, 694);
}

// Compact founding-release placard (0.7) for the portrait slot: a vertical
// b2/cafelog → WordPress lineage, standing in for the jazz portrait the era
// predates. The captured screenshot sits in the panel beside it.
function drawFoundingReleasePanel(ctx, release, color, x, y, width, height) {
	ctx.save();
	ctx.fillStyle = '#f8efd9';
	ctx.fillRect(x, y, width, height);
	ctx.fillStyle = '#111827';
	ctx.fillRect(x + 10, y + 10, width - 20, height - 20);
	const inX = x + 18, inY = y + 18, inW = width - 36, inH = height - 36;
	const grad = ctx.createLinearGradient(inX, inY, inX, inY + inH);
	grad.addColorStop(0, '#1b2740');
	grad.addColorStop(1, '#0e1626');
	ctx.fillStyle = grad;
	ctx.fillRect(inX, inY, inW, inH);
	const cx = inX + inW / 2;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = 'rgba(255, 245, 223, 0.88)';
	ctx.font = 'italic 700 34px Georgia, serif';
	ctx.fillText('b2/cafelog', cx, inY + inH * 0.2);
	ctx.fillStyle = color;
	ctx.font = '900 50px Georgia, serif';
	ctx.fillText('↓', cx, inY + inH * 0.4);
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 42px Georgia, serif';
	ctx.fillText('WordPress', cx, inY + inH * 0.59);
	ctx.fillStyle = 'rgba(255, 245, 223, 0.72)';
	ctx.font = '700 22px system-ui, sans-serif';
	ctx.fillText('the first fork · 2003', cx, inY + inH * 0.76);
	ctx.fillStyle = 'rgba(15, 23, 38, 0.78)';
	ctx.fillRect(inX, inY + inH - 42, inW, 34);
	ctx.fillStyle = '#fff5df';
	ctx.font = '800 17px system-ui, sans-serif';
	ctx.fillText('BEFORE THE CODENAMES', cx, inY + inH - 25);
	ctx.restore();
}

function drawMediaPanel(ctx, image, x, y, width, height, options) {
	ctx.fillStyle = '#f8efd9';
	ctx.fillRect(x, y, width, height);
	ctx.fillStyle = '#111827';
	ctx.fillRect(x + 10, y + 10, width - 20, height - 20);

	if (image) {
		const draw =
			options.fit === 'contain' ? drawImageContain : drawImageCover;
		draw(ctx, image, x + 14, y + 14, width - 28, height - 28);
	} else {
		drawMediaPlaceholder(
			ctx,
			x + 14,
			y + 14,
			width - 28,
			height - 28,
			options.placeholder
		);
	}

	ctx.fillStyle = 'rgba(15, 23, 38, 0.76)';
	ctx.fillRect(x + 14, y + height - 54, width - 28, 40);
	ctx.fillStyle = '#fff5df';
	ctx.font = '800 20px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fillFittedCanvasText(
		ctx,
		options.label.toUpperCase(),
		x + width / 2,
		y + height - 34,
		width - 52,
		20,
		'800',
		'system-ui, sans-serif'
	);

	ctx.strokeStyle = 'rgba(255, 245, 223, 0.46)';
	ctx.lineWidth = 4;
	ctx.strokeRect(x + 12, y + 12, width - 24, height - 24);
}

function drawMediaPlaceholder(ctx, x, y, width, height, label) {
	ctx.fillStyle = '#162033';
	ctx.fillRect(x, y, width, height);
	ctx.strokeStyle = 'rgba(255, 245, 223, 0.18)';
	ctx.lineWidth = 6;
	for (let offset = -height; offset < width; offset += 48) {
		ctx.beginPath();
		ctx.moveTo(x + offset, y + height);
		ctx.lineTo(x + offset + height, y);
		ctx.stroke();
	}
	ctx.fillStyle = 'rgba(255, 245, 223, 0.56)';
	ctx.font = '800 24px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(label, x + width / 2, y + height / 2);
}

function drawImageCover(ctx, image, x, y, width, height) {
	const sourceRatio = image.naturalWidth / image.naturalHeight;
	const targetRatio = width / height;
	const sourceWidth =
		sourceRatio > targetRatio
			? image.naturalHeight * targetRatio
			: image.naturalWidth;
	const sourceHeight =
		sourceRatio > targetRatio
			? image.naturalHeight
			: image.naturalWidth / targetRatio;
	const sourceX = (image.naturalWidth - sourceWidth) / 2;
	const sourceY = (image.naturalHeight - sourceHeight) / 2;
	ctx.drawImage(
		image,
		sourceX,
		sourceY,
		sourceWidth,
		sourceHeight,
		x,
		y,
		width,
		height
	);
}

function drawImageContain(ctx, image, x, y, width, height) {
	const scale = Math.min(
		width / image.naturalWidth,
		height / image.naturalHeight
	);
	const drawWidth = image.naturalWidth * scale;
	const drawHeight = image.naturalHeight * scale;
	const drawX = x + (width - drawWidth) / 2;
	const drawY = y + (height - drawHeight) / 2;
	ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function loadPlaqueImage(path) {
	if (!plaqueImageCache.has(path)) {
		plaqueImageCache.set(
			path,
			new Promise((resolve) => {
				const image = new Image();
				image.onload = () => resolve(image);
				image.onerror = () => resolve(null);
				image.src = path;
			})
		);
	}
	return plaqueImageCache.get(path);
}

// Releases whose honoree has no freely-licensed photograph (jazz guitarist Grant
// Green, WP 3.4 — Wikidata/Commons have none, and same-name files are other
// people). They fall back to the "Jazz portrait" placeholder rather than show a
// wrong face.
const RELEASES_WITHOUT_PORTRAIT = new Set(['3.4']);

function getMusicianImagePath(release) {
	if (RELEASES_WITHOUT_PORTRAIT.has(release.version)) {
		return null;
	}
	return `./assets/musicians/wp-${getVersionSlug(release)}.jpg`;
}

function getScreenshotImagePath(release) {
	return `./assets/wp-screenshots/wp-${getVersionSlug(release)}.png`;
}

function getVersionSlug(release) {
	return release.version.replaceAll('.', '-');
}

function toRoman(n) {
	const map = [
		[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
	];
	let out = '';
	for (const [value, symbol] of map) {
		while (n >= value) {
			out += symbol;
			n -= value;
		}
	}
	return out;
}

function createEraTexture(text, color, yearRange, roomNumber) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 442; // matches the taller 4.4 x 1.9 door sign
	const ctx = canvas.getContext('2d');
	const w = canvas.width;
	const h = canvas.height;
	const ink = '#0c1208';
	const bronze = 'rgba(124, 90, 34, 0.95)';
	const cx = w / 2;
	ctx.clearRect(0, 0, w, h);

	// Era-colour field with a soft top-lit retro sheen.
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, w, h);
	const sheen = ctx.createLinearGradient(0, 0, 0, h);
	sheen.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
	sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
	sheen.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
	ctx.fillStyle = sheen;
	ctx.fillRect(0, 0, w, h);

	// Framed-poster border: a cream keyline with a bronze inner rule.
	const m = Math.round(h * 0.06);
	ctx.strokeStyle = 'rgba(255, 250, 235, 0.92)';
	ctx.lineWidth = Math.round(h * 0.022);
	ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
	const m2 = m + Math.round(h * 0.03);
	ctx.strokeStyle = bronze;
	ctx.lineWidth = 3;
	ctx.strokeRect(m2, m2, w - 2 * m2, h - 2 * m2);
	// Diamond studs at the inner corners.
	ctx.fillStyle = 'rgba(255, 250, 235, 0.92)';
	for (const sx of [m2, w - m2]) {
		for (const sy of [m2, h - m2]) {
			ctx.save();
			ctx.translate(sx, sy);
			ctx.rotate(Math.PI / 4);
			ctx.fillRect(-7, -7, 14, 14);
			ctx.restore();
		}
	}

	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	// Room number as an engraved Roman numeral flanked by short bronze rules.
	const roman = toRoman(roomNumber);
	const numY = h * 0.265;
	ctx.font = `700 ${Math.round(h * 0.16)}px Georgia, "Times New Roman", serif`;
	ctx.fillStyle = 'rgba(255, 250, 235, 0.4)';
	ctx.fillText(roman, cx + 1.5, numY + 2);
	ctx.fillStyle = ink;
	ctx.fillText(roman, cx, numY);
	const half = ctx.measureText(roman).width / 2;
	const ruleW = h * 0.13;
	const ruleGap = h * 0.055;
	ctx.fillStyle = bronze;
	ctx.fillRect(cx - half - ruleGap - ruleW, numY - 2, ruleW, 4);
	ctx.fillRect(cx + half + ruleGap, numY - 2, ruleW, 4);

	// Year range — large and engraved.
	drawEngravedText(ctx, yearRange, cx, h * 0.54, w * 0.72, Math.round(h * 0.16),
		'800', 'Georgia, "Times New Roman", serif', ink);

	// Era name — engraved.
	drawEngravedText(ctx, text.toUpperCase(), cx, h * 0.81, w * 0.82, Math.round(h * 0.165),
		'900', '"Arial Black", Impact, sans-serif', ink);

	const texture = createCanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function fillFittedCanvasText(
	ctx,
	text,
	x,
	y,
	maxWidth,
	maxFontSize,
	fontWeight,
	fontFamily
) {
	let fontSize = maxFontSize;
	const minFontSize = Math.min(34, maxFontSize);
	while (true) {
		ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
		if (ctx.measureText(text).width <= maxWidth || fontSize <= minFontSize) {
			break;
		}
		fontSize -= 2;
	}
	// At the minimum font size long strings can still overflow (and clip at the
	// canvas edge); the maxWidth arg condenses the glyphs to fit instead.
	ctx.fillText(text, x, y, maxWidth);
}

function bindControls() {
	document.querySelector('#walk-button').addEventListener('click', () => {
		enterWalkMode();
	});
	document.querySelector('#tour-button').addEventListener('click', () => {
		guidedTour = !guidedTour;
		document.querySelector('#tour-button').textContent = guidedTour
			? 'Pause tour'
			: 'Guided tour';
	});
	document
		.querySelector('#center-button')
		.addEventListener('click', () => returnToMuseumCenter());
	document
		.querySelector('#previous-release')
		.addEventListener('click', () => focusRelease(activeIndex - 1));
	document
		.querySelector('#next-release')
		.addEventListener('click', () => focusRelease(activeIndex + 1));
	// The middle "WP x.y" pill is a go-to button: jump to that release's exhibit.
	document
		.querySelector('#release-counter')
		.addEventListener('click', () => focusRelease(activeIndex));

	const openPlayground = document.querySelector('#open-playground');
	if (openPlayground) {
		openPlayground.addEventListener('click', (event) => {
			if (inMercantileShop) {
				return; // the link is a plain <a target="_blank"> to the Mercantile
			}
			event.preventDefault();
			openPlaygroundModal(activeIndex);
		});
	}
	const pgModal = document.querySelector('#playground-modal');
	if (pgModal) {
		document.querySelector('#playground-modal-close').addEventListener('click', closePlaygroundModal);
		document.querySelector('#playground-modal-x').addEventListener('click', closePlaygroundModal);
	}

	const panelToggle = document.querySelector('#panel-toggle');
	const releasePanel = document.querySelector('.release-panel');
	if (panelToggle && releasePanel) {
		// On phones the expanded ticket would bury the scene and the movement
		// pad, so it starts collapsed to a tab the visitor can tap open.
		if (window.matchMedia('(max-width: 760px)').matches) {
			releasePanel.classList.add('is-collapsed');
		}
		panelToggle.addEventListener('click', () => {
			releasePanel.classList.toggle('is-collapsed');
		});
	}

	document.addEventListener('pointerlockchange', () => {
		document.body.classList.toggle(
			'is-walking',
			document.pointerLockElement === canvas
		);
	});
	document.addEventListener('mousemove', (event) => {
		if (document.pointerLockElement !== canvas) {
			return;
		}
		turnCamera(event.movementX, event.movementY);
	});
	document.addEventListener('keydown', (event) => {
		if (event.code === 'Escape') {
			closePlaygroundModal();
		}
		keys.add(event.code);
		if (isMovementKey(event.code)) {
			event.preventDefault();
			stopGuidedTour();
			guidedTarget = null;
		}
		if (
			event.code === 'Enter' &&
			!event.defaultPrevented &&
			!event.repeat &&
			!event.isComposing &&
			!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
			(event.target === canvas || event.target === document.body) &&
			!pgModal?.classList.contains('is-open')
		) {
			event.preventDefault();
			openPlayground?.click();
		}
	});
	document.addEventListener('keyup', (event) => {
		if (isMovementKey(event.code)) {
			event.preventDefault();
		}
		keys.delete(event.code);
	});

	canvas.addEventListener('click', (event) => {
		// A touch look-drag ends in a synthetic click; ignore it so dragging to
		// look around doesn't also inspect a plaque or attempt a pointer lock.
		if (dragMoved) {
			dragMoved = false;
			return;
		}
		// Clicking anywhere in the scene enters walk mode; once walking, a click
		// inspects whatever the centre reticle is pointed at. Clicking directly
		// on a plaque still inspects it instead of locking the pointer.
		if (document.pointerLockElement === canvas) {
			pickFromScreen(0, 0);
		} else if (!pickFromPointerEvent(event)) {
			enterWalkMode();
		} else {
			event.preventDefault();
		}
	});

	canvas.addEventListener('pointerdown', (event) => {
		if (event.pointerType === 'mouse') {
			return;
		}
		dragging = true;
		dragMoved = false;
		lastPointer = { x: event.clientX, y: event.clientY };
	});
	window.addEventListener('pointermove', (event) => {
		if (!dragging) {
			return;
		}
		const dx = event.clientX - lastPointer.x;
		const dy = event.clientY - lastPointer.y;
		if (Math.abs(dx) + Math.abs(dy) > 4) {
			dragMoved = true;
		}
		turnCamera(dx, dy);
		lastPointer = { x: event.clientX, y: event.clientY };
	});
	const endDrag = () => {
		dragging = false;
	};
	window.addEventListener('pointerup', endDrag);
	window.addEventListener('pointercancel', endDrag);
	document.addEventListener(
		'wheel',
		(event) => {
			if (shouldIgnoreMuseumWheel(event.target)) {
				return;
			}
			event.preventDefault();
			stopGuidedTour();
			scrollRailBy(getWheelRailDelta(event));
		},
		{ passive: false }
	);

	const bindHoldButton = (button, direction) => {
		const press = (event) => {
			event.preventDefault();
			stopGuidedTour();
			mobileMotion[direction] = true;
			guidedTarget = null;
		};
		const release = () => {
			mobileMotion[direction] = false;
		};
		button.addEventListener('pointerdown', press);
		button.addEventListener('pointerup', release);
		button.addEventListener('pointerleave', release);
		button.addEventListener('pointercancel', release);
	};
	document
		.querySelectorAll('[data-mobile-move]')
		.forEach((button) => bindHoldButton(button, button.dataset.mobileMove));
	document
		.querySelectorAll('[data-mobile-turn]')
		.forEach((button) => bindHoldButton(button, button.dataset.mobileTurn));

	// The stats overlay opens via ?debug in the URL (works everywhere, including
	// phones and any keyboard layout); there is no keyboard shortcut.
	if (new URLSearchParams(window.location.search).has('debug')) {
		showDebugPanel();
	}
}

function enterWalkMode() {
	if (document.pointerLockElement === canvas) {
		return;
	}
	// Browsers reject (and may warn about) a lock requested during the brief
	// cooldown right after an ESC release; swallow that to keep the console clean.
	const request = canvas.requestPointerLock();
	if (request && typeof request.catch === 'function') {
		request.catch(() => {});
	}
}

function initDebugApi() {
	if (!new URLSearchParams(window.location.search).has('debug')) {
		return;
	}

	window.wpMuseumDebug = {
		rooms: [
			...roomSides.map((side) => ({
				era: side.era,
				center: vectorToPlainObject(side.center),
				normal: vectorToPlainObject(side.normal),
				tangent: vectorToPlainObject(side.tangent),
				connectLeft: !!side.connectLeft,
				connectRight: !!side.connectRight,
			})),
			...(isCurrentVariant && playgroundRoom
				? [
					{
						era: 'The Playground',
						center: { x: playgroundCenterX, y: 0, z: playgroundDoorZCenter },
						normal: { x: 1, y: 0, z: 0 },
						tangent: { x: 0, y: 0, z: 1 },
						bounds: {
							minX: playgroundMinX,
							maxX: playgroundMaxX,
							minZ: playgroundMinZ,
							maxZ: playgroundMaxZ,
						},
					},
				]
				: []),
		],
		roomDepth,
		innerHalfWidth,
		sideEndHalfWidth,
		backFlatHalf,
		spokeEndZ,
		doorways: [
			...galleryDoorways.map((d) => ({ x: d.x, z: d.z })),
			...(isCurrentVariant && playgroundRoom
				? [{ x: playgroundDoorWallX, z: playgroundDoorZCenter, era: 'The Playground' }]
				: []),
		],
		shopPassageDoorways: shopPassageDoorways.map((d) => ({ x: d.x, z: d.z, era: d.era, end: d.end })),
		connections: galleryConnections.map((p) => [p.a.era, p.b.era]),
		isInside: (x, z) => isPointInsideClosedMuseum(new THREE.Vector3(x, 1.6, z)),
		renderer,
		setCameraView(position, target) {
			stopGuidedTour();
			guidedTarget = null;
			camera.position.set(position.x, position.y, position.z);
			camera.lookAt(new THREE.Vector3(target.x, target.y, target.z));
			yaw = camera.rotation.y;
			pitch = camera.rotation.x;
		},
		getRendererInfo() {
			return {
				render: { ...renderer.info.render },
				memory: { ...renderer.info.memory },
				pixelRatio: renderer.getPixelRatio(),
				renderedFrameCount,
			};
		},
		scene,
		camera,
		THREE,
		// Guided-flight route planner + flight endpoints, exposed so the
		// no-wall-crossing guarantee can be audited geometrically in tests.
		planRoute: (from, targetEra) =>
			guidedRouteVias(new THREE.Vector3(from.x, from.y ?? 1.65, from.z), targetEra).map(
				vectorToPlainObject
			),
		planSmoothedRoute: (from, targetEra, target) => {
			const f = new THREE.Vector3(from.x, from.y ?? 1.65, from.z);
			const t = new THREE.Vector3(target.x, target.y ?? 1.65, target.z);
			const raw = avoidHubExhibits(f, guidedRouteVias(f, targetEra), t);
			const speed = guidedFlightSpeedFor(f, raw, t);
			const route = smoothGuidedRoute(f, raw, t, speed);
			return { vias: route.vias.map(vectorToPlainObject), limits: route.limits, speed };
		},
		getFlightStands: () =>
			exhibitPositions.map((p) => ({ x: p.stand.x, z: p.stand.z, era: p.era })),
		getAnnexDoors: () =>
			eraAnnexes.map((a) => ({
				era: a.config.era,
				door: { x: a.center.x, z: a.center.z },
				forward: { x: a.forward.x, z: a.forward.z },
				depth: a.depth,
			})),
	};
}

function vectorToPlainObject(vector) {
	return {
		x: vector.x,
		y: vector.y,
		z: vector.z,
	};
}

function returnToMuseumCenter() {
	stopGuidedTour();
	keys.clear();
	for (const direction of Object.keys(mobileMotion)) {
		mobileMotion[direction] = false;
	}

	const view = getViewAngles(
		atriumCenterPosition,
		getRoomLookPoint(releases[activeIndex].era)
	);
	guidedTarget = createGuidedFlight(atriumCenterPosition.clone(), view, null);
	atCenter = true;
	updateRail();
}

function buildRail() {
	const rail = document.querySelector('#release-rail-track');
	bindRailScroll(rail);
	updateRail(false);
}

function bindRailScroll(rail) {
	rail.addEventListener(
		'wheel',
		(event) => {
			if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
				return;
			}
			event.preventDefault();
			scrollRailBy(event.deltaY);
		},
		{ passive: false }
	);
	rail.addEventListener('scroll', () => {
		if (programmaticRailScroll) {
			scheduleProgrammaticRailScrollEnd();
			return;
		}
		if (railScrollFrame) {
			return;
		}
		railScrollFrame = requestAnimationFrame(() => {
			railScrollFrame = 0;
			focusNearestRailItem();
		});
	});
}

function focusNearestRailItem() {
	const item = railItems[getNearestRailItemIndex()];
	if (!item || isRailItemActive(item)) {
		return;
	}
	stopGuidedTour();
	focusRailItem(item, { syncRail: false });
}

function focusRailItem(item, options = {}) {
	if (item.kind === 'room') {
		focusRoom(item.era, options);
		return;
	}
	focusRelease(item.index, false, options);
}

// Fly to a centred overview of the gallery: on the runner near the entry,
// facing the back wall, so the era header, the hanging catchphrase sign and
// both prominent props are in frame. The ticket shows the room's first
// release (the nearest one takes over on arrival).
function focusRoom(era, options = {}) {
	const room = roomLayout.get(era);
	const index = getEraReleaseItems(era)[0]?.index;
	if (!room || index === undefined) {
		return;
	}
	atCenter = false;
	activeIndex = index;
	const viewPoint = roomLocalToWorld(room, new THREE.Vector3(0, 1.65, -5.4));
	const lookPoint = roomLocalToWorld(room, new THREE.Vector3(0, 3.0, roomDepth / 2));
	guidedTarget = createGuidedFlight(viewPoint, getViewAngles(viewPoint, lookPoint), era);
	updatePanel(releases[activeIndex]);
	updateRail(options.syncRail !== false);
	updateActiveExhibitMarker();
}

function shouldIgnoreMuseumWheel(target) {
	if (!(target instanceof Element)) {
		return false;
	}
	return target.closest('.release-panel') || target.closest('.release-rail');
}

function getWheelRailDelta(event) {
	return Math.abs(event.deltaY) > Math.abs(event.deltaX)
		? event.deltaY
		: event.deltaX;
}

function scrollRailBy(delta) {
	document.querySelector('#release-rail-track').scrollLeft += delta;
}

function getNearestRailItemIndex() {
	const rail = document.querySelector('#release-rail-track');
	const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
	if (maxScrollLeft <= 0) {
		const activeItemIndex = getActiveRailItemIndex();
		return activeItemIndex >= 0 ? activeItemIndex : 0;
	}
	return Math.round(
		THREE.MathUtils.clamp(rail.scrollLeft / maxScrollLeft, 0, 1) *
		(railItems.length - 1)
	);
}

function getActiveRailItemIndex() {
	return railItems.findIndex(isRailItemActive);
}

// The scene carries dozens of decorative point lights (gallery lamps, the side
// rooms, prop glows). Three.js forward-renders every light for every pixel with
// no distance culling, so keeping them all live tanks the frame rate. Instead we
// keep only the nearest few active each frame: distant lights you can't see go
// dark (the ambient/hemisphere lights keep everything base-lit), and holding the
// active count constant avoids per-frame shader recompiles.
function updateLightCulling() {
	if (!cullablePointLights) {
		cullablePointLights = [];
		scene.traverse((object) => {
			if (object.isPointLight) {
				cullablePointLights.push(object);
			}
		});
	}
	const lights = cullablePointLights;
	if (lights.length <= MAX_ACTIVE_POINT_LIGHTS) {
		return;
	}
	for (const light of lights) {
		light.getWorldPosition(lightCullTmp);
		light.userData.cullDistance = lightCullTmp.distanceToSquared(camera.position);
	}
	const ranked = lights.slice().sort((a, b) => a.userData.cullDistance - b.userData.cullDistance);
	for (let index = 0; index < ranked.length; index++) {
		ranked[index].visible = index < MAX_ACTIVE_POINT_LIGHTS;
	}
}

function showDebugPanel() {
	debugPanelVisible = true;
	if (!debugPanelEl) {
		debugPanelEl = document.getElementById('debug-panel');
	}
	if (debugPanelEl) {
		debugPanelEl.classList.add('is-visible');
	}
}

function updateDebugPanel(delta) {
	if (delta > 0) {
		const instant = 1 / delta;
		fpsSmoothed = fpsSmoothed ? fpsSmoothed + (instant - fpsSmoothed) * 0.1 : instant;
	}
	if (!debugPanelVisible || !debugPanelEl) {
		return;
	}
	debugPanelTimer += delta;
	if (debugPanelTimer < 0.25) {
		return;
	}
	debugPanelTimer = 0;
	// Recompute the (worst-case) texture footprint about once a second so the
	// per-frame stats stay cheap.
	vramRecalcTicks += 1;
	if (!vramComputed || vramRecalcTicks >= 4) {
		vramRecalcTicks = 0;
		vramComputed = true;
		const vram = estimateTextureVRAM();
		vramLiveMB = vram.live;
		vramMaxMB = vram.max;
	}
	const render = renderer.info.render;
	const memory = renderer.info.memory;
	let activeLights = 0;
	const totalLights = cullablePointLights ? cullablePointLights.length : 0;
	if (cullablePointLights) {
		for (const light of cullablePointLights) {
			if (light.visible) {
				activeLights += 1;
			}
		}
	}
	debugPanelEl.textContent =
		`FPS    ${Math.round(fpsSmoothed)}\n` +
		`draws  ${render.calls}\n` +
		`tris   ${(render.triangles / 1000).toFixed(0)}k\n` +
		`lights ${activeLights}/${totalLights}\n` +
		`geo ${memory.geometries}  tex ${memory.textures}\n` +
		`vram   ${Math.round(vramLiveMB)}/${Math.round(vramMaxMB)} MB`;
}

// Texture VRAM in MB: `live` counts only textures actually uploaded to the GPU
// (so it reflects lazy upload + the residency manager); `max` is the worst case
// if every scene texture were resident at once. RGBA + 33% for mipmaps.
function estimateTextureVRAM() {
	const slots = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'bumpMap', 'lightMap'];
	const properties = renderer.properties;
	const seen = new Set();
	let liveBytes = 0;
	let maxBytes = 0;
	scene.traverse((object) => {
		const materials = object.material
			? Array.isArray(object.material) ? object.material : [object.material]
			: [];
		for (const material of materials) {
			for (const slot of slots) {
				const texture = material && material[slot];
				if (!texture || !texture.image || seen.has(texture.uuid)) {
					continue;
				}
				seen.add(texture.uuid);
				const w = texture.image.width || 0;
				const h = texture.image.height || 0;
				if (!w || !h) {
					continue;
				}
				const bytes = w * h * 4 * (texture.generateMipmaps ? 1.333 : 1);
				maxBytes += bytes;
				if (properties.get(texture).__webglTexture) {
					liveBytes += bytes;
				}
			}
		}
	});
	return { live: liveBytes / 1048576, max: maxBytes / 1048576 };
}

function animate(timestamp = 0) {
	requestAnimationFrame(animate);
	// The scene always has ambient motion, so render every frame for a
	// fluid feel; rAF already caps to the display refresh rate.
	const delta = Math.min(clock.getDelta(), 0.05);
	if (webglContextLost) {
		// GPU context is freed while the Playground modal is open; nothing to draw.
		return;
	}
	updateCamera(delta);
	updateSceneAnimations(delta, clock.elapsedTime);
	updateLightCulling();
	updateRoomTextureResidency(delta, clock.elapsedTime);
	updateDebugPanel(delta);
	renderer.render(scene, camera);
	renderedFrameCount += 1;
	if (renderedFrameCount === 1) {
		// The first frame is on the canvas — fade the loading curtain away.
		document.body.classList.add('museum-ready');
	}
}

// Frees the big per-gallery textures (release pictures + murals) once a gallery
// has been out of view and out of range for a few seconds, capping live VRAM to
// roughly the rooms around the camera. Disposed textures re-upload automatically
// from their retained canvases when the gallery comes back into view, so there's
// no visual change — only a brief upload when you return. Hysteresis (UNLOAD_DELAY)
// avoids thrashing when you merely turn around.
function buildRoomTextureGroups() {
	const groups = roomSides.map((side) => ({
		center: side.center.clone(),
		textures: new Set(),
		lastSeen: 0,
		freed: false,
	}));
	const worldPos = new THREE.Vector3();
	const slots = ['map', 'emissiveMap'];
	scene.traverse((object) => {
		const materials = object.material
			? Array.isArray(object.material) ? object.material : [object.material]
			: [];
		let heavy = null;
		for (const material of materials) {
			for (const slot of slots) {
				const texture = material && material[slot];
				if (texture && texture.image) {
					const longEdge = Math.max(texture.image.width || 0, texture.image.height || 0);
					if (longEdge >= 1000) {
						heavy = texture;
					}
				}
			}
		}
		if (!heavy) {
			return;
		}
		object.getWorldPosition(worldPos);
		let best = null;
		let bestDist = Infinity;
		for (const group of groups) {
			const d = worldPos.distanceToSquared(group.center);
			if (d < bestDist) {
				bestDist = d;
				best = group;
			}
		}
		// Only manage textures that actually sit inside a gallery; the atrium's
		// main mural is far from every gallery centre and stays resident.
		if (best && bestDist < 12 * 12) {
			best.textures.add(heavy);
		}
	});
	return groups.filter((group) => group.textures.size > 0);
}

function updateRoomTextureResidency(delta, elapsed) {
	residencyTimer += delta;
	if (residencyTimer < 0.5) {
		return;
	}
	residencyTimer = 0;
	if (!roomTextureGroups) {
		roomTextureGroups = buildRoomTextureGroups();
	}
	camera.updateMatrixWorld();
	residencyMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
	residencyFrustum.setFromProjectionMatrix(residencyMatrix);
	const keepRadiusSq = 14 * 14;
	const unloadDelay = 6;
	for (const group of roomTextureGroups) {
		const near = camera.position.distanceToSquared(group.center) < keepRadiusSq;
		residencySphere.set(group.center, 9);
		const inView = residencyFrustum.intersectsSphere(residencySphere);
		if (near || inView) {
			group.lastSeen = elapsed;
			group.freed = false;
		} else if (!group.freed && elapsed - group.lastSeen > unloadDelay) {
			for (const texture of group.textures) {
				texture.dispose();
			}
			group.freed = true;
		}
	}
}

function registerAnimation(object, update) {
	object.userData.museumAnimation = update;
	animatedObjects.push(object);
	return object;
}

function updateSceneAnimations(delta, elapsed) {
	for (const object of animatedObjects) {
		if (object.parent || object.isLight) {
			object.userData.museumAnimation?.(object, elapsed, delta);
		}
	}
}

function updateCamera(delta) {
	if (guidedTour && !guidedTarget) {
		const now = performance.now();
		if (now > tourHoldUntil) {
			focusRelease(activeIndex + 1);
			tourHoldUntil = now + 3600;
		}
	}

	if (guidedTarget) {
		// Glide through the planned doorway waypoints, then settle on the
		// exhibit. Speed is capped so long hops read as a brisk walk-through
		// rather than a teleport, easing out only on the final approach.
		// Clamp the timestep so a hiccup frame can't jump the camera meters
		// along the path (and through a waypoint corner).
		const flightDelta = Math.min(delta, 0.07);
		const vias = guidedTarget.vias;
		const enRoute = !!(vias && vias.length);
		const aimPos = enRoute ? vias[0] : guidedTarget.position;
		const toAim = aimPos.clone().sub(camera.position);
		const distance = toAim.length();
		if (distance > 1e-6) {
			const full = guidedTarget.speed || guidedFlightSpeed;
			const limits = guidedTarget.viaLimits || [];
			// Cap this leg by its own limit, and brake early toward a slower
			// upcoming leg (corner) so turns are entered gently.
			const legLimit = enRoute ? limits[0] ?? full : full;
			const nextLimit = enRoute ? (limits.length > 1 ? limits[1] : full) : full;
			const cap = Math.min(legLimit, nextLimit + guidedFlightAccel * distance * 0.12);
			const current = guidedTarget.currentSpeed ?? full;
			const speed = current + THREE.MathUtils.clamp(
				cap - current,
				-guidedFlightAccel * 1.6 * flightDelta,
				guidedFlightAccel * flightDelta
			);
			guidedTarget.currentSpeed = speed;
			const eased = distance * (1 - Math.pow(0.055, flightDelta));
			const step = Math.min(enRoute ? distance : eased, speed * flightDelta);
			camera.position.addScaledVector(toAim, step / distance);
		}
		// Look at a point a few metres ahead ALONG the remaining path, so the
		// heading sweeps smoothly through rounded corners instead of snapping
		// per arc sample. Blend into the exhibit's framed view only on the
		// final approach.
		let yawAim = guidedTarget.yaw;
		let pitchAim = guidedTarget.pitch;
		const finalDistance = camera.position.distanceTo(guidedTarget.position);
		if (!guidedTarget.strafe && (enRoute || finalDistance > 3.4)) {
			let remaining = 3.0;
			let lookFrom = camera.position;
			let lookPoint = guidedTarget.position;
			for (const point of [...(vias || []), guidedTarget.position]) {
				const leg = lookFrom.distanceTo(point);
				if (leg >= remaining) {
					lookPoint = lookFrom.clone().lerp(point, remaining / leg);
					break;
				}
				remaining -= leg;
				lookFrom = point;
			}
			const dx = lookPoint.x - camera.position.x;
			const dz = lookPoint.z - camera.position.z;
			if (Math.hypot(dx, dz) > 0.3) {
				yawAim = Math.atan2(-dx, -dz);
				pitchAim = 0;
			} else {
				yawAim = yaw; // too close to judge a heading: hold, don't snap
				pitchAim = pitch;
			}
		}
		yaw = lerpAngle(yaw, yawAim, 1 - Math.pow(0.03, delta));
		pitch = THREE.MathUtils.lerp(pitch, pitchAim, 1 - Math.pow(0.03, delta));
		setCameraRotation();
		// Smaller switch radius: corners are pre-rounded into dense arc samples,
		// so the camera should track them closely rather than cut across.
		if (enRoute && camera.position.distanceTo(vias[0]) < 0.35) {
			vias.shift();
			guidedTarget.viaLimits?.shift();
		}
		if ((!vias || !vias.length) && camera.position.distanceTo(guidedTarget.position) < 0.06) {
			guidedTarget = null;
			tourHoldUntil = performance.now() + 3000;
			updateNearestRelease();
			updateRail();
		}
		return;
	}

	let forward = 0;
	let side = 0;
	if (keys.has('KeyW') || keys.has('ArrowUp') || mobileMotion.forward) {
		forward += 1;
	}
	if (keys.has('KeyS') || keys.has('ArrowDown') || mobileMotion.back) {
		forward -= 1;
	}
	if (keys.has('KeyA')) {
		side -= 1;
	}
	if (keys.has('KeyD')) {
		side += 1;
	}
	if (keys.has('ArrowLeft')) {
		turnCamera(-keyboardTurnSpeed * delta, 0);
	}
	if (keys.has('ArrowRight')) {
		turnCamera(keyboardTurnSpeed * delta, 0);
	}
	if (mobileMotion.left) {
		turnCamera(-mobileTurnSpeed * delta, 0);
	}
	if (mobileMotion.right) {
		turnCamera(mobileTurnSpeed * delta, 0);
	}
	if (forward || side) {
		stopGuidedTour();
		const speed =
			keys.has('ShiftLeft') || keys.has('ShiftRight')
				? sprintSpeed
				: getWalkSpeed();
		const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
		const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
		const movement = fwd
			.multiplyScalar(forward * speed * delta)
			.add(right.multiplyScalar(side * speed * delta));
		moveCamera(movement);
		updateNearestRelease();
	}
}

function getWalkSpeed() {
	if (keys.has('ArrowUp') || keys.has('ArrowDown')) {
		return arrowWalkSpeed;
	}
	return mobileMotion.forward || mobileMotion.back ? mobileWalkSpeed : walkSpeed;
}

function moveCamera(movement) {
	const steps = Math.max(1, Math.ceil(movement.length() / maxMovementStep));
	const step = movement.clone().divideScalar(steps);
	for (let index = 0; index < steps; index++) {
		moveCameraStep(step);
	}
}

function moveCameraStep(movement) {
	const start = camera.position.clone();
	const direct = getBoundedCameraPoint(start.clone().add(movement));
	if (canStandAt(direct)) {
		camera.position.copy(direct);
		return;
	}

	const xOnly = getBoundedCameraPoint(start.clone().setX(start.x + movement.x));
	if (canStandAt(xOnly)) {
		camera.position.copy(xOnly);
	}

	const zOnly = getBoundedCameraPoint(
		camera.position.clone().setZ(camera.position.z + movement.z)
	);
	if (canStandAt(zOnly)) {
		camera.position.copy(zOnly);
	}
}

function getBoundedCameraPoint(position) {
	position.x = THREE.MathUtils.clamp(
		position.x,
		cameraBounds.minX,
		cameraBounds.maxX
	);
	position.y = 1.65;
	position.z = THREE.MathUtils.clamp(
		position.z,
		cameraBounds.minZ,
		cameraBounds.maxZ
	);
	return position;
}

function canStandAt(position) {
	return isPointInsideClosedMuseum(position);
}

function stopGuidedTour() {
	guidedTour = false;
	document.querySelector('#tour-button').textContent = 'Guided tour';
}

function startAtMuseumCenter() {
	activeIndex = 0;
	atCenter = true;
	camera.position.copy(atriumStartPosition);

	const view = getViewAngles(
		atriumStartPosition,
		getMuralLookPoint()
	);
	yaw = view.yaw;
	pitch = 0;
	setCameraRotation();
	guidedTarget = null;

	updatePanel(releases[activeIndex]);
	updateRail();
	updateActiveExhibitMarker();
}

// Deep-link: ?release=<version> (e.g. ?release=2.0) jumps the camera straight
// to that release's exhibit on load. Museum dispatch posts in the Playground
// blueprints link back here so a reader lands in front of the right release.
function applyReleaseDeepLink() {
	const requested = new URLSearchParams(window.location.search).get('release');
	if (!requested) {
		return;
	}
	const wanted = requested.trim().toLowerCase();
	const index = releases.findIndex(
		(release) => release.version.toLowerCase() === wanted
	);
	if (index !== -1) {
		focusRelease(index, true);
	}
}

function getMuralLookPoint() {
	return new THREE.Vector3(
		muralSide.midpoint.x,
		atriumCenterPosition.y,
		muralSide.midpoint.z
	);
}

function getRoomLookPoint(era) {
	const { doorway } = roomLayout.get(era);
	return new THREE.Vector3(doorway.x, atriumCenterPosition.y, doorway.z);
}

function focusRelease(index, immediate = false, options = {}) {
	atCenter = false;
	activeIndex = wrapIndex(index);
	const release = releases[activeIndex];
	const target = exhibitPositions[activeIndex];
	const viewPoint = target.stand.clone();
	const lookPoint = target.card.clone();
	if (options.closer) {
		// Step in toward the picture for a closer look (horizontal only).
		const toward = lookPoint.clone().sub(viewPoint);
		toward.y = 0;
		viewPoint.add(toward.multiplyScalar(0.5));
	}
	const view = getViewAngles(viewPoint, lookPoint);
	if (immediate) {
		camera.position.copy(viewPoint);
		yaw = view.yaw;
		pitch = view.pitch;
		setCameraRotation();
		guidedTarget = null;
	} else {
		guidedTarget = createGuidedFlight(viewPoint, view, release.era);
	}
	updatePanel(release);
	updateRail(options.syncRail !== false);
	updateActiveExhibitMarker();
}

// Assembles a guided flight: plan the doorway route, swerve around the tall
// hub greeters, round corners and derive per-leg speed limits, scaling
// overall speed with journey length.
function createGuidedFlight(position, view, targetEra) {
	const rawVias = avoidHubExhibits(
		camera.position,
		guidedRouteVias(camera.position, targetEra),
		position
	);
	const speed = guidedFlightSpeedFor(camera.position, rawVias, position);
	const route = smoothGuidedRoute(camera.position, rawVias, position, speed);
	return {
		position,
		yaw: view.yaw,
		pitch: view.pitch ?? 0,
		vias: route.vias,
		viaLimits: route.limits,
		speed,
		currentSpeed: 3, // gentle ease-in from near standstill
		// A routeless flight stays within the current room (previous/next
		// exhibit): glide sideways holding the exhibit-facing view instead of
		// turning toward the travel direction and back.
		strafe: rawVias.length === 0,
	};
}

// Plans the doorway waypoints a guided flight follows to reach a gallery (or
// the rotunda centre when targetEra is null) without cutting through walls:
// leave the current wing through its own doorways into the rotunda, then
// enter the target room through its doorway. Every leg connects two points
// inside one convex space (a gallery, an annex, the shop, a corridor or the
// rotunda octagon), so the straight glide between consecutive waypoints can
// never cross a wall.
function guidedRouteVias(from, targetEra) {
	const vias = [];
	let wingEra = getCameraRoomEra(from);
	if (!wingEra && !isPointInsideHub(from)) {
		const annex = eraAnnexes.find((a) => isPointInsideEraAnnex(from, a));
		if (annex) {
			vias.push(guidedWaypoint(annex.center.x, annex.center.z));
			wingEra = annex.config.era;
		} else if (isPointInsidePlayground(from)) {
			vias.push(guidedWaypoint(playgroundDoorWallX, playgroundDoorZCenter));
			wingEra = eras[eras.length - 1];
		} else if (isPointInsideShopPassage(from)) {
			const sideX = shopCenterX + Math.sign(from.x - shopCenterX) * (shopWidth / 2 - 0.8);
			vias.push(
				guidedWaypoint(sideX, shopPassageZCenter),
				guidedWaypoint(shopCenterX, shopZStart - 0.4),
				guidedWaypoint(shopCenterX, hubApothem - 2.6)
			);
		} else if (isPointInsideShop(from)) {
			vias.push(
				guidedWaypoint(shopCenterX, shopZStart - 0.4),
				guidedWaypoint(shopCenterX, hubApothem - 2.6)
			);
		} else if (isPointInsideMuralPortals(from)) {
			vias.push(
				guidedWaypoint(Math.sign(from.x) * portalCenterOffset, hubApothem - 2.6)
			);
		}
	}
	if (wingEra === targetEra) {
		return vias; // already in the target room (or its annex): glide direct
	}
	// Adjacent galleries share a side door mid-spoke: slip through it instead
	// of detouring out into the rotunda and back.
	if (wingEra && targetEra) {
		const sideDoor = gallerySideDoorVias(wingEra, targetEra);
		if (sideDoor) {
			vias.push(...sideDoor);
			return vias;
		}
	}
	if (wingEra) {
		vias.push(roomDoorwayWaypoint(wingEra));
	}
	if (targetEra) {
		vias.push(roomDoorwayWaypoint(targetEra));
	}
	return vias;
}

// For adjacent galleries, two waypoints flanking their shared side door: one
// pulled 1.6m into each room along the door->room-centre direction. Each leg
// then lies in one convex room, and the short crossing between them passes
// through the door opening.
function gallerySideDoorVias(eraA, eraB) {
	const connected = galleryConnections.some(
		(p) =>
			(p.a.era === eraA && p.b.era === eraB) ||
			(p.a.era === eraB && p.b.era === eraA)
	);
	if (!connected) {
		return null;
	}
	const roomA = roomLayout.get(eraA);
	const roomB = roomLayout.get(eraB);
	const onRight =
		(roomB.center.x - roomA.center.x) * roomA.tangent.x +
			(roomB.center.z - roomA.center.z) * roomA.tangent.z >
		0;
	const localX = (onRight ? 1 : -1) * sideHalfWidthAtZ(connectorDoorZ);
	const door = roomLocalToWorld(roomA, new THREE.Vector3(localX, 0, connectorDoorZ));
	const dirA = roomA.center.clone().sub(door).setY(0).normalize();
	const dirB = roomB.center.clone().sub(door).setY(0).normalize();
	return [
		guidedWaypoint(door.x + dirA.x * 1.6, door.z + dirA.z * 1.6),
		guidedWaypoint(door.x + dirB.x * 1.6, door.z + dirB.z * 1.6),
	];
}

// The two tall greeter exhibits on the rotunda floor; flat (eye-level)
// flights must walk around them, not through.
const guidedHubObstacles = [
	{ x: 5.5, z: 3.0, radius: 2.1 }, // elePHPant plinth
	{ x: -5.5, z: 3.0, radius: 2.1 }, // Wapuu docent
];

// Inserts a swerve waypoint into any cross-hub leg that passes through a
// greeter's clearance circle. The swerve point stays deep inside the convex
// rotunda, so the detoured legs remain wall-safe; the corner it introduces is
// rounded and speed-limited by smoothGuidedRoute like any other.
function avoidHubExhibits(from, vias, target) {
	const points = [from, ...vias, target];
	const out = [];
	for (let i = 0; i + 1 < points.length; i++) {
		const a = points[i];
		const b = points[i + 1];
		if (i > 0) {
			out.push(a);
		}
		if (Math.hypot(a.x, a.z) > 15.5 || Math.hypot(b.x, b.z) > 15.5) {
			continue; // only rotunda legs can meet the greeters
		}
		for (const o of guidedHubObstacles) {
			const abx = b.x - a.x;
			const abz = b.z - a.z;
			const len2 = abx * abx + abz * abz;
			if (len2 < 1e-6) {
				continue;
			}
			const t = THREE.MathUtils.clamp(
				((o.x - a.x) * abx + (o.z - a.z) * abz) / len2,
				0,
				1
			);
			let dx = a.x + abx * t - o.x;
			let dz = a.z + abz * t - o.z;
			const d = Math.hypot(dx, dz);
			if (d >= o.radius || t <= 0.02 || t >= 0.98) {
				continue;
			}
			if (d < 1e-3) {
				// Dead-centre hit: pass on the side nearer the rotunda centre.
				const inv = 1 / Math.sqrt(len2);
				dx = -abz * inv;
				dz = abx * inv;
				if (dx * o.x + dz * o.z > 0) {
					dx = -dx;
					dz = -dz;
				}
				out.push(guidedWaypoint(o.x + dx * o.radius, o.z + dz * o.radius));
				continue;
			}
			const push = o.radius / d;
			out.push(guidedWaypoint(o.x + dx * push, o.z + dz * push));
		}
	}
	return out;
}

// Pulled 2.6m into the rotunda off the doorway: cross-hub chords between
// doors then run well clear of the octagon wall, its corner flora and the
// wall-side exhibits.
function roomDoorwayWaypoint(era) {
	const side = roomLayout.get(era);
	const pulled = side.doorway.clone().addScaledVector(side.normal, -2.6);
	return guidedWaypoint(pulled.x, pulled.z);
}

function guidedWaypoint(x, z, y = guidedFlightY) {
	return new THREE.Vector3(x, y, z);
}

// Longer journeys fly proportionally faster so cross-museum hops don't drag.
function guidedFlightSpeedFor(from, vias, target) {
	let length = 0;
	let prev = from;
	for (const point of [...vias, target]) {
		length += prev.distanceTo(point);
		prev = point;
	}
	return THREE.MathUtils.clamp(length * 0.42, guidedFlightSpeed, 18);
}

// Rounds each waypoint corner into a short sampled arc (quadratic bezier whose
// hull stays inside the audited 1.4m corner-cut envelope, so it cannot reach a
// wall) and assigns every leg a speed limit: full speed on straights, slower
// through bends in proportion to the turn angle. Returns {vias, limits} where
// limits[i] caps the leg flown TOWARD vias[i].
function smoothGuidedRoute(from, rawVias, target, fullSpeed) {
	const points = [from, ...rawVias, target];
	const vias = [];
	const limits = [];
	for (let i = 1; i + 1 < points.length; i++) {
		const v = points[i];
		const prev = points[i - 1];
		const next = points[i + 1];
		const inDir = v.clone().sub(prev);
		const outDir = next.clone().sub(v);
		const inLen = inDir.length();
		const outLen = outDir.length();
		if (inLen < 0.05 || outLen < 0.05) {
			continue;
		}
		inDir.divideScalar(inLen);
		outDir.divideScalar(outLen);
		const bend = inDir.angleTo(outDir);
		if (bend < 0.26) {
			// Practically straight: keep the plain vertex at full speed.
			vias.push(v);
			limits.push(fullSpeed);
			continue;
		}
		const radius = Math.min(guidedCornerRadius, inLen / 2, outLen / 2);
		const arcStart = v.clone().addScaledVector(inDir, -radius);
		const arcEnd = v.clone().addScaledVector(outDir, radius);
		// Wider arcs sweep gently, so they can be taken a bit faster too.
		const cornerSpeed = THREE.MathUtils.clamp(
			fullSpeed * (1.15 - bend / 2.4),
			5.5,
			fullSpeed
		);
		vias.push(arcStart);
		limits.push(fullSpeed); // the straight INTO the arc; braking handles entry
		for (const t of [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]) {
			const a = arcStart.clone().lerp(v, t);
			const b = v.clone().lerp(arcEnd, t);
			vias.push(a.lerp(b, t)); // quadratic bezier point
			limits.push(cornerSpeed);
		}
		vias.push(arcEnd);
		limits.push(cornerSpeed);
	}
	return { vias, limits };
}

function playgroundUrlForRelease(release) {
	const url = new URL('https://playground.wordpress.net/');
	// Just the WordPress version — Playground auto-selects a compatible PHP.
	url.searchParams.set('wp', release.version);
	// Seamless embed: hide Playground's own browser chrome so only the WordPress
	// site shows inside our modal.
	url.searchParams.set('mode', 'seamless');
	return url.href;
}

function openPlaygroundModal(index) {
	const release = releases[wrapIndex(index)];
	const modal = document.querySelector('#playground-modal');
	if (!modal) {
		return;
	}
	document.querySelector('#playground-modal-title').textContent =
		`WordPress ${release.version}${release.name ? ' ' + release.name : ''} · Playground`;
	modal.classList.add('is-open');
	modal.setAttribute('aria-hidden', 'false');
	if (document.pointerLockElement) {
		document.exitPointerLock();
	}
	const iframe = document.querySelector('#playground-modal-iframe');
	// Start loading the Blueprint immediately so the fetch overlaps the GPU
	// reclaim below; apply it only while the modal is still open.
	const playgroundUrlPromise = playgroundModalUrlForRelease(release);
	const bootIframe = () => {
		playgroundUrlPromise.then((src) => {
			if (modal.classList.contains('is-open')) {
				iframe.src = src;
			}
		});
	};
	if (loseContextExtension && !webglContextLost) {
		// Free the scene's GPU memory BEFORE the embedded WordPress starts loading,
		// so its PHP/WASM heap fills the reclaimed space instead of peaking on top of
		// the museum's textures (the overlap was crashing memory-tight iOS). Stop
		// rendering at once, then give the browser a beat to actually reclaim the GPU
		// before kicking off the iframe.
		webglContextLost = true;
		loseContextExtension.loseContext();
		setTimeout(bootIframe, 160);
	} else {
		bootIframe();
	}
}

// The modal enriches the bare version boot with the release's Museum Dispatch
// Blueprint, inlined into the URL fragment. The fragment form carries the whole
// Blueprint in the link, so it works from any origin — including the local dev
// server, which playground.wordpress.net cannot fetch a blueprint-url back from.
// Falls back to a bare version boot if the Blueprint can't be loaded.
async function playgroundModalUrlForRelease(release) {
	if (!release.blueprint) {
		return playgroundUrlForRelease(release);
	}
	try {
		const response = await fetch(new URL(release.blueprint, window.location.href).href);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		const blueprint = prepareBlueprint(await response.json(), window.location.href);
		const url = new URL('https://playground.wordpress.net/');
		url.searchParams.set('mode', 'seamless');
		// Encode the minified Blueprint JSON once and append it after '#'.
		return `${url.href}#${encodeURIComponent(JSON.stringify(blueprint))}`;
	} catch (error) {
		console.warn('Playground Blueprint load failed; booting bare version', error);
		return playgroundUrlForRelease(release);
	}
}

function closePlaygroundModal() {
	const modal = document.querySelector('#playground-modal');
	if (!modal || !modal.classList.contains('is-open')) {
		return;
	}
	modal.classList.remove('is-open');
	modal.setAttribute('aria-hidden', 'true');
	// Reset the iframe so the WordPress instance stops running in the background.
	document.querySelector('#playground-modal-iframe').src = 'about:blank';
	// Bring the WebGL context back; the render loop resumes on 'webglcontextrestored'.
	if (loseContextExtension && webglContextLost) {
		loseContextExtension.restoreContext();
	}
}

function updatePanel(release) {
	document.querySelector('#release-era').textContent = release.era;
	document.querySelector('#release-title').textContent =
		`WordPress ${release.version}${release.name ? ' ' + release.name : ''}`;
	document.querySelector('#release-date').textContent = release.released;
	document.querySelector('#release-known-for').textContent = release.knownFor;
	document.querySelector('#release-detail').textContent = release.detail;
	document.querySelector('#release-counter').textContent =
		`WP ${release.version}`;

	const link = document.querySelector('#open-playground');
	link.textContent = '▶ Boot in Playground';
	link.href = playgroundUrlForRelease(release);
	link.removeAttribute('target');
	link.removeAttribute('rel');
}

// Standing in the gift shop the ticket becomes a Mercantile flyer: same
// popover, but its action link leads out to the real store in a new tab
// (the click handler lets the plain <a target="_blank"> through).
function setMercantileTicket(inside) {
	if (inside === inMercantileShop) {
		return;
	}
	inMercantileShop = inside;
	if (inside) {
		updateMercantilePanel();
	} else {
		updatePanel(releases[activeIndex]);
	}
}

function updateMercantilePanel() {
	document.querySelector('#release-era').textContent = 'Gift Shop';
	document.querySelector('#release-title').textContent = 'The Mercantile';
	document.querySelector('#release-date').textContent = 'mercantile.wordpress.org';
	document.querySelector('#release-known-for').textContent =
		'Official WordPress swag';
	document.querySelector('#release-detail').textContent =
		'Tees, stickers and Wapuu plushies — every purchase supports the ' +
		'WordPress open source project.';
	const link = document.querySelector('#open-playground');
	link.textContent = '▶ Open the Mercantile';
	link.href = mercantileUrl;
	link.target = '_blank';
	link.rel = 'noopener noreferrer';
}

function updateRail(syncRail = true) {
	renderRailForCurrentContext();
	railButtons.forEach((button, index) => {
		button.classList.toggle('is-active', isRailItemActive(railItems[index]));
	});
	document.querySelector('#center-button')?.classList.toggle('is-active', atCenter);
	// Parked at the centre the visitor isn't "on" any release: hide the ticket
	// and render the WP-version pill unselected (clicking it still jumps there).
	// In the gift shop the ticket stays up as the Mercantile flyer.
	document
		.querySelector('.release-panel')
		?.classList.toggle('is-hidden', atCenter && !inMercantileShop);
	document.querySelector('#release-counter')?.classList.toggle('is-active', !atCenter);
	if (!syncRail) {
		return;
	}
	scrollActiveRailButton();
}

function renderRailForCurrentContext() {
	const context = getRailContext();
	if (context.mode === railMode && context.era === railEra) {
		return;
	}

	railMode = context.mode;
	railEra = context.era;
	railItems =
		context.mode === 'releases'
			? getReleaseRailItems(context.era)
			: getRoomRailItems();
	railButtons = railItems.map(createRailButton);
	document.querySelector('#release-rail-track').replaceChildren(...railButtons);
}

function getRailContext() {
	// The bottom rail is a simple room navigator: Center · I · II · … · VII,
	// each in its era colour. Release-level navigation is handled by the
	// Previous/Next controls and the clickable "WP x.y" pill.
	return { mode: 'rooms', era: '' };
}

function romanForEra(era) {
	return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][eras.indexOf(era)] || '';
}

function getCameraNavigationEra() {
	const cameraPoint = camera.position.clone();
	cameraPoint.y = 1.65;
	return getCameraRoomEra(cameraPoint);
}

function getReleaseRailItems(era) {
	return getEraReleaseItems(era).map(({ release, index }) => ({
		kind: 'release',
		era,
		index,
		label: release.version,
		release,
	}));
}

function getRoomRailItems() {
	return getEraReleaseGroups().map(({ era, items }) => ({
		kind: 'room',
		era,
		label: romanForEra(era),
		title: `${romanForEra(era)} · ${era} (${getReleaseYearRange(items)})`,
	}));
}

function getEraReleaseItems(era) {
	return releases
		.map((release, index) => ({ release, index }))
		.filter(({ release }) => release.era === era);
}

function createRailButton(item) {
	const button = document.createElement('button');
	button.type = 'button';
	button.textContent = item.label;
	button.classList.add(`is-${item.kind}`);
	button.title =
		item.kind === 'room'
			? item.title
			: `${item.release.version} ${item.release.name}: ${item.release.knownFor}`;
	button.style.setProperty('--release-color', eraColors.get(item.era));
	button.addEventListener('click', () => focusRailItem(item));
	return button;
}

function isRailItemActive(item) {
	if (!item) {
		return false;
	}
	return item.kind === 'room'
		? !atCenter && item.era === releases[activeIndex].era
		: item.index === activeIndex;
}

function scrollActiveRailButton() {
	programmaticRailScroll = true;
	scheduleProgrammaticRailScrollEnd();
	railButtons[getActiveRailItemIndex()]?.scrollIntoView({
		behavior: 'smooth',
		inline: 'center',
		block: 'nearest',
	});
}

function scheduleProgrammaticRailScrollEnd() {
	window.clearTimeout(programmaticRailScrollTimer);
	programmaticRailScrollTimer = window.setTimeout(() => {
		programmaticRailScroll = false;
	}, 900);
}

function updateActiveExhibitMarker() {
	const marker = activeExhibitMarker;
	const position = exhibitPositions[activeIndex];
	if (!marker || !position) {
		return;
	}
	const wallGlow = marker.getObjectByName('activeWallGlow');
	wallGlow.position
		.copy(position.card)
		.add(position.normal.clone().multiplyScalar(0.5));
	wallGlow.rotation.y = position.rotationY;
	wallGlow.material.color.set(position.color);
}

function updateNearestRelease() {
	let nearest = activeIndex;
	let nearestDistance = Infinity;
	const cameraPoint = camera.position.clone();
	cameraPoint.y = 1.65;
	const activeRoomEra = getCameraRoomEra(cameraPoint);
	setMercantileTicket(
		!activeRoomEra &&
			(isPointInsideShop(cameraPoint) || isPointInsideExitAlcove(cameraPoint))
	);
	if (!activeRoomEra) {
		atCenter = true;
		updateRail();
		return;
	}
	atCenter = false;
	exhibitPositions.forEach((position, index) => {
		if (position.era !== activeRoomEra) {
			return;
		}
		const distance = cameraPoint.distanceTo(position.stand);
		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearest = index;
		}
	});
	if (
		releases[activeIndex].era !== activeRoomEra ||
		(nearest !== activeIndex && nearestDistance < 5.2)
	) {
		activeIndex = nearest;
		updatePanel(releases[activeIndex]);
		updateActiveExhibitMarker();
	}
	updateRail();
}

function getCameraRoomEra(position) {
	return movementZones.find(
		(room) =>
			isPointInsideRoom(position, room) ||
			isPointInsideDoorway(position, room)
	)?.era;
}

function pickFromScreen(x, y) {
	pointer.set(x, y);
	raycaster.setFromCamera(pointer, camera);
	const hit = raycaster.intersectObjects(pickables, false)[0];
	if (!hit) {
		return false;
	}
	const obj = hit.object;
	if (typeof obj.userData.onPick === 'function') {
		obj.userData.onPick(obj);
		return true;
	}
	if (obj.userData.portalUrl) {
		window.open(obj.userData.portalUrl, '_blank', 'noopener,noreferrer');
		return true;
	}
	if (Number.isFinite(obj.userData.releaseIndex)) {
		const idx = obj.userData.releaseIndex;
		if (idx === activeIndex && !atCenter) {
			// Already focused on this picture — clicking it boots that version in
			// an embedded Playground modal.
			openPlaygroundModal(idx);
		} else {
			focusRelease(idx, false, { closer: true });
			if (document.pointerLockElement) {
				document.exitPointerLock();
			}
		}
		return true;
	}
	return false;
}

function pickFromPointerEvent(event) {
	const rect = canvas.getBoundingClientRect();
	const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
	return pickFromScreen(x, y);
}

function turnCamera(deltaX, deltaY) {
	yaw -= deltaX * 0.0022;
	pitch -= deltaY * 0.0018;
	pitch = THREE.MathUtils.clamp(pitch, -0.62, 0.58);
	setCameraRotation();
}

function setCameraRotation() {
	camera.rotation.y = yaw;
	camera.rotation.x = pitch;
}

function isPointInsideClosedMuseum(position) {
	return (
		isPointInsideHub(position) ||
		isPointInsideMuralPortals(position) ||
		isPointInsideShop(position) ||
		isPointInsideShopPassage(position) ||
		isPointInsidePlayground(position) ||
		eraAnnexes.some((annex) => isPointInsideEraAnnex(position, annex)) ||
		movementZones.some(
			(room) =>
				isPointInsideRoom(position, room) ||
				isPointInsideDoorway(position, room) ||
				isPointInsideSideDoorway(position, room)
		)
	);
}

// The two short passages bridging the shop's side walls to Blogging Roots
// (left) and Blocks Everywhere (right). Each is a narrow z-band whose x-extent
// runs from inside the shop wall to just past the (tilted) gallery wall, so the
// region overlaps both interiors and there is no leak to the void at either
// threshold. The z-band is kept within the 1.8m doorway opening so the player
// cannot push out through the passage's solid side walls.
function isPointInsideShopPassage(position) {
	if (!isCurrentVariant) {
		return false;
	}
	if (Math.abs(position.z - shopPassageZCenter) > shopPassageDoorHalfWidth - 0.25) {
		return false;
	}
	const slack = 0.8; // straddle each wall into the shop / gallery interior
	const passages = [
		{ room: roomLayout.get(eras[0]), shopX: shopMinX, sign: -1 },
		{ room: roomLayout.get(eras[eras.length - 1]), shopX: shopMaxX, sign: 1 },
	];
	for (const { room, shopX, sign } of passages) {
		if (!room) {
			continue;
		}
		const galleryX = shopFacingWallWorldX(room, position.z);
		const lo = Math.min(shopX, galleryX) - slack;
		const hi = Math.max(shopX, galleryX) + slack;
		if (position.x >= lo && position.x <= hi) {
			return true;
		}
	}
	return false;
}

// The Playground annex (east of Blocks Everywhere) plus the doorway through the
// shared chamfer wall at x = playgroundDoorWallX. The doorway band straddles that
// wall into the gallery interior so there is no leak to the void at the threshold;
// its z-span is kept inside the clear opening so the player cannot slip past the
// solid wall on either side of the door.
function isPointInsidePlayground(position) {
	if (!isCurrentVariant || !playgroundRoom) {
		return false;
	}
	const padding = 0.5;
	// Doorway band: straddle the chamfer wall into the gallery (-x) and annex (+x).
	if (
		Math.abs(position.z - playgroundDoorZCenter) <= playgroundDoorHalfWidth - 0.2 &&
		position.x >= playgroundDoorWallX - 1.2 &&
		position.x <= playgroundDoorWallX + padding + 0.3
	) {
		return true;
	}
	// Annex interior rectangle.
	return (
		position.x >= playgroundMinX + padding &&
		position.x <= playgroundMaxX - padding &&
		position.z >= playgroundMinZ + padding &&
		position.z <= playgroundMaxZ - padding
	);
}

// A point passing through a shared-wall doorway into the neighbour. The shared
// wall sits at local x = +-sideHalfWidthAtZ(z); the opening is the z-band at
// connectorDoorZ on whichever side connects.
function isPointInsideSideDoorway(position, room) {
	const local = getRoomLocalPoint(position, room);
	if (Math.abs(local.z - connectorDoorZ) > connectorDoorHalfWidth) {
		return false;
	}
	const halfW = sideHalfWidthAtZ(local.z);
	const slack = 0.8; // straddle the shared wall into the neighbour
	if (room.connectRight && Math.abs(local.x - halfW) <= slack) {
		return true;
	}
	if (room.connectLeft && Math.abs(local.x + halfW) <= slack) {
		return true;
	}
	return false;
}

// The exit-side mural alcove — the hall from the rotunda toward the gift
// shop — so the Mercantile flyer already greets visitors on the way in. The
// two alcoves sit at x = ±portalCenterOffset and never straddle x = 0.
function isPointInsideExitAlcove(position) {
	return isPointInsideMuralPortals(position) && position.x > 0;
}

function isPointInsideMuralPortals(position) {
	if (!isCurrentVariant) {
		return false;
	}
	const padding = 0.45;
	if (position.z < hubApothem - 1.2 || position.z > hubApothem + portalAlcoveDepth - 0.4) {
		return false;
	}
	return muralPortals.some(
		(portal) => Math.abs(position.x - portal.offset) <= portalAlcoveHalfWidth - padding
	);
}

// The walkable Mercantile gift shop plus the short connector through the exit
// alcove's open back doorway. The connector band bridges the gap between where
// isPointInsideMuralPortals stops (z = hubApothem + portalAlcoveDepth - 0.4)
// and the shop's interior, so there is no dead zone at the threshold.
function isPointInsideShop(position) {
	if (!isCurrentVariant) {
		return false;
	}
	const padding = 0.5;
	// Connector doorway: aligned to the exit alcove, spanning the alcove end
	// wall and the shop's front wall.
	if (
		position.z >= hubApothem + portalAlcoveDepth - 0.6 &&
		position.z <= shopZStart + padding + 0.3 &&
		Math.abs(position.x - shopCenterX) <= shopDoorHalfWidth - 0.15
	) {
		return true;
	}
	// Shop interior rectangle.
	return (
		position.z >= shopZStart + padding &&
		position.z <= shopZEnd - padding &&
		position.x >= shopMinX + padding &&
		position.x <= shopMaxX - padding
	);
}

function isPointInsideHub(position) {
	const wallPadding = 0.64;
	return hubSides.every(
		(side) => getPlanarDot(position, side.normal) <= hubApothem - wallPadding
	);
}

function isPointInsideRoom(position, room) {
	const local = getRoomLocalPoint(position, room);
	const wallPadding = 0.62;
	if (local.z < -roomDepth / 2 + wallPadding || local.z > roomDepth / 2 - wallPadding) {
		return false;
	}
	// Past the beveled corner the chamfer narrows the room toward the flat back.
	const maxX = local.z <= spokeEndZ
		? sideHalfWidthAtZ(local.z)
		: sideEndHalfWidth - (local.z - spokeEndZ);
	return Math.abs(local.x) <= maxX - wallPadding;
}

function isPointInsideDoorway(position, room) {
	const local = getRoomLocalPoint(position, room);
	const doorDepth = 1.4;
	return (
		Math.abs(local.x) <= roomDoorHalfWidth &&
		local.z >= -roomDepth / 2 - doorDepth &&
		local.z <= -roomDepth / 2 + doorDepth
	);
}

function getRoomLocalPoint(position, room) {
	const relative = position.clone().sub(room.center);
	return {
		x: getPlanarDot(relative, room.tangent),
		z: getPlanarDot(relative, room.normal),
	};
}

function getPlanarDot(left, right) {
	return left.x * right.x + left.z * right.z;
}

function resizeRenderer() {
	const width = window.innerWidth;
	const height = window.innerHeight;
	renderer.setSize(width, height, false);
	camera.aspect = width / height;
	camera.updateProjectionMatrix();
}

function getViewAngles(from, to) {
	const direction = to.clone().sub(from);
	const length = direction.length();
	return {
		yaw: Math.atan2(-direction.x, -direction.z),
		pitch: Math.asin(
			THREE.MathUtils.clamp(direction.y / length, -0.72, 0.72)
		),
	};
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
	const words = text.split(' ');
	let line = '';
	let lines = 0;
	for (const word of words) {
		const testLine = line ? `${line} ${word}` : word;
		if (ctx.measureText(testLine).width > maxWidth && line) {
			ctx.fillText(line, x, y);
			y += lineHeight;
			line = word;
			lines += 1;
			if (lines >= maxLines) {
				return;
			}
		} else {
			line = testLine;
		}
	}
	if (line && lines < maxLines) {
		ctx.fillText(line, x, y);
	}
}

function wrapIndex(index) {
	return (index + releases.length) % releases.length;
}

function isMovementKey(code) {
	return [
		'KeyW',
		'KeyA',
		'KeyS',
		'KeyD',
		'ArrowUp',
		'ArrowDown',
		'ArrowLeft',
		'ArrowRight',
	].includes(code);
}

function compareVersions(a, b) {
	const left = a.version.split('.').map(Number);
	const right = b.version.split('.').map(Number);
	for (let index = 0; index < Math.max(left.length, right.length); index++) {
		const difference = (left[index] || 0) - (right[index] || 0);
		if (difference !== 0) {
			return difference;
		}
	}
	return 0;
}

function lerpAngle(start, end, amount) {
	const difference = Math.atan2(Math.sin(end - start), Math.cos(end - start));
	return start + difference * amount;
}

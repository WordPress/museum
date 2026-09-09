(() => {
	const defaultEraColors = [
		'#ffd166',
		'#ff4f64',
		'#2bb7ff',
		'#50d890',
		'#b37cff',
		'#ff9b54',
		'#78e0dc',
	];

	const worlds = {
		pixel: {
			kicker: 'coin-op release history',
			uiStyle: 'arcade',
			textureStyle: 'pixel',
			scene: scene('#0f1324', '#151b31', '#fff2cc', '#23334f', 3.2, 2.6),
			eraColors: ['#ffd23f', '#ff5a5f', '#16a8ff', '#41e37b', '#b764ff', '#ff8d3c', '#56e4d6'],
			wall: ['#bac7d8', '#8796a8', '#e2e8f0'],
			floor: ['#263044', '#121827', '#ffcf5c'],
			ceiling: ['#dce5f2', '#98a8bf', '#ffffff'],
		},
		jazz: {
			kicker: 'release notes after midnight',
			uiStyle: 'ticket',
			textureStyle: 'velvet',
			scene: scene('#1d1015', '#2a141a', '#ffe7b1', '#12080b', 3.5, 3.3),
			eraColors: ['#f7c873', '#d84a5f', '#54b8d8', '#8ccf7e', '#b38adf', '#f08f54', '#7ed5c7'],
			wall: ['#4c2430', '#221017', '#f5c56b'],
			floor: ['#2b1714', '#160d0b', '#c89b4f'],
			ceiling: ['#38212a', '#22131a', '#72513d'],
		},
		memphis: {
			kicker: 'postmodern CMS showroom',
			uiStyle: 'zine',
			textureStyle: 'memphis',
			scene: scene('#16131f', '#241e30', '#fff0c7', '#22253f', 3.2, 2.7),
			eraColors: ['#ffe45e', '#ff4d8d', '#31c6ff', '#44d17f', '#a66bff', '#ff9d33', '#66e6d0'],
			wall: ['#efe8d6', '#c7bbc8', '#ff4d8d'],
			floor: ['#2f3148', '#181927', '#31c6ff'],
			ceiling: ['#f6f1df', '#a9a3b6', '#ffe45e'],
		},
		terminal: {
			kicker: 'wp-admin in phosphor',
			uiStyle: 'terminal',
			textureStyle: 'terminal',
			scene: scene('#00120f', '#001b16', '#9effd0', '#00100c', 2.8, 2.35),
			eraColors: ['#a6ff6a', '#00f0a8', '#5ad7ff', '#fff95a', '#c57cff', '#ff8b5c', '#54ffdc'],
			wall: ['#0c2a25', '#031510', '#6affbd'],
			floor: ['#071c18', '#00100c', '#35ffb0'],
			ceiling: ['#102b28', '#00251f', '#6affbd'],
		},
		botanical: {
			kicker: 'permalinks in the greenhouse',
			uiStyle: 'museum-label',
			textureStyle: 'botanical',
			scene: scene('#12201a', '#1d3227', '#fff6db', '#0f1b15', 3.9, 3.15),
			eraColors: ['#d8c65f', '#d95f5f', '#50a7c2', '#6fbd76', '#a889d4', '#d58d4f', '#5cc9b5'],
			wall: ['#d6d0b7', '#8b9479', '#668f5b'],
			floor: ['#43503a', '#283022', '#d5bc74'],
			ceiling: ['#dce9d6', '#9db48f', '#f7fff1'],
		},
		noir: {
			kicker: 'night guard found the changelog',
			uiStyle: 'neon',
			textureStyle: 'noir',
			scene: scene('#050a18', '#0c1426', '#d9eaff', '#050812', 2.45, 4.35),
			eraColors: ['#ffe38a', '#ff4d6d', '#38bdf8', '#6ee7b7', '#c084fc', '#fb923c', '#67e8f9'],
			wall: ['#253048', '#101827', '#a7b7d8'],
			floor: ['#111827', '#050816', '#9fb6ff'],
			ceiling: ['#172033', '#0d1320', '#62708d'],
		},
		paper: {
			kicker: 'photocopied release party',
			uiStyle: 'paper',
			textureStyle: 'paper',
			scene: scene('#f0e2c7', '#ead7b1', '#fff8e7', '#4b3a26', 3.4, 2.65),
			eraColors: ['#d7a529', '#d34f4f', '#2f9ec4', '#54a86f', '#8b6bc9', '#cc783d', '#42b9a7'],
			wall: ['#f0e6cb', '#c6b895', '#111827'],
			floor: ['#d2bd8e', '#b39b6d', '#fcf1cf'],
			ceiling: ['#f7edd2', '#d2c5a7', '#ffffff'],
		},
		space: {
			kicker: 'CMS orbital station',
			uiStyle: 'blueprint',
			textureStyle: 'space',
			scene: scene('#06091b', '#11172e', '#e6f0ff', '#040817', 2.95, 3.45),
			eraColors: ['#ffdf6e', '#ff6678', '#66d9ff', '#61f2b5', '#a994ff', '#ffae63', '#7ff5e5'],
			wall: ['#202842', '#11182e', '#6ddcff'],
			floor: ['#12182d', '#070b19', '#9ad7ff'],
			ceiling: ['#1a2440', '#0b1023', '#7080b0'],
		},
		civic: {
			kicker: 'concrete, plugins, no excuses',
			uiStyle: 'brutalist',
			textureStyle: 'brutalist',
			scene: scene('#171717', '#242424', '#f4f1e4', '#111111', 3, 2.85),
			eraColors: ['#e4c44a', '#e05252', '#2ea8d9', '#56b870', '#9670d8', '#df8642', '#58c7bd'],
			wall: ['#a9aa9f', '#6f736f', '#e7e1c8'],
			floor: ['#6f6f67', '#3c3d39', '#d6c583'],
			ceiling: ['#c8c8bd', '#868982', '#f2f2e4'],
		},
		lab: {
			kicker: 'browser-powered museum science',
			uiStyle: 'glass',
			textureStyle: 'lab',
			scene: scene('#d8f6ff', '#edfaff', '#ffffff', '#c8d6e3', 3.75, 2.95),
			eraColors: ['#ffd166', '#ff5f7e', '#2bb7ff', '#35d49a', '#a579ff', '#ff9850', '#5fe4d4'],
			wall: ['#d7eef7', '#8fb5c5', '#ffffff'],
			floor: ['#c3d9e5', '#8aa7b5', '#ffffff'],
			ceiling: ['#edf9ff', '#a7c6d6', '#ffffff'],
		},
	};

	const features = {
		jukebox: {
			frameStyle: 'record',
			muralStyle: 'records',
			atriumFeature: 'listening-booth',
			roomFeature: 'record-crates',
			props: ['modelRadio', 'modelSpeaker', 'recordStack', 'jazzLamp'],
			models: ['radio', 'speakerSmall', 'tableCoffee'],
		},
		arcade: {
			frameStyle: 'arcade-cabinet',
			muralStyle: 'pinball',
			atriumFeature: 'pinball-machine',
			roomFeature: 'arcade-corners',
			props: ['blockStack', 'modelTelevision', 'modelComputer', 'pixelPlant'],
			models: ['televisionVintage', 'computerScreen'],
		},
		bazaar: {
			frameStyle: 'crate',
			muralStyle: 'bazaar',
			atriumFeature: 'plugin-bazaar',
			roomFeature: 'crate-market',
			props: ['pluginCrates', 'modelPallet', 'signpost', 'modelAwning'],
			models: ['pallet', 'detailAwningWide', 'truckGreen'],
		},
		greenhouse: {
			frameStyle: 'vine',
			muralStyle: 'botanical',
			atriumFeature: 'greenhouse',
			roomFeature: 'plant-lab',
			props: ['modelPlant', 'modelTree', 'bigPlant', 'plant'],
			models: ['pottedPlant', 'plantSmall2', 'treeParkLarge', 'treeSmall'],
		},
		terminal: {
			frameStyle: 'terminal-bezel',
			muralStyle: 'terminal',
			atriumFeature: 'server-oracle',
			roomFeature: 'terminal-desks',
			props: ['serverStack', 'codeTotem', 'modelLaptop', 'terminalBench'],
			models: ['laptop', 'computerScreen', 'bookcaseOpenLow'],
		},
		rest: {
			frameStyle: 'portal',
			muralStyle: 'api',
			atriumFeature: 'api-portal',
			roomFeature: 'portal-kiosks',
			props: ['apiPortal', 'orbital', 'modelDoorRound', 'modelColumn'],
			models: ['doorRotateRoundA', 'columnThin'],
		},
		blocks: {
			frameStyle: 'block',
			muralStyle: 'blocks',
			atriumFeature: 'block-fountain',
			roomFeature: 'block-stacks',
			props: ['blockStack', 'modelPlating', 'displayCase', 'modelSofa'],
			models: ['platingDetailed', 'loungeDesignSofa'],
		},
		time: {
			frameStyle: 'capsule',
			muralStyle: 'capsule',
			atriumFeature: 'time-capsule',
			roomFeature: 'archive-cases',
			props: ['timeCapsule', 'modelBookcase', 'paperPile', 'modelStairs'],
			models: ['bookcaseOpenLow', 'stairsOpenShort'],
		},
		comments: {
			frameStyle: 'bubble',
			muralStyle: 'comments',
			atriumFeature: 'comment-aquarium',
			roomFeature: 'moderation-tanks',
			props: ['commentBubble', 'modelBench', 'modelTrafficLight', 'modelLight'],
			models: ['detailBench', 'detailLightTraffic', 'detailLightSingle'],
		},
		civic: {
			frameStyle: 'monument',
			muralStyle: 'fauxgo',
			atriumFeature: 'mascot-monument',
			roomFeature: 'monument-cases',
			props: ['logoClinic', 'statue', 'modelColumn', 'concreteBench'],
			models: ['columnThin', 'borderHigh', 'wallDoorwayRound'],
		},
	};

	const concepts = [
		['pixel', 'arcade', 'Permalink Pinball Palace', 'Slugs ricochet through bumpers, archives, and one extremely judgmental rewrite rule.'],
		['jazz', 'jukebox', 'Hello Dolly Listening Booth', 'Every room hums a different standard; the changelog arrives on vinyl.'],
		['memphis', 'bazaar', 'Plugin Bazaar Midway', 'Shortcodes, widgets, mystery zips, and a prize counter full of tiny settings screens.'],
		['botanical', 'greenhouse', 'Taxonomy Greenhouse', 'Categories grow like vines while tags quietly take over the planters.'],
		['terminal', 'terminal', 'Phosphor Admin Cathedral', 'A reverent green glow for dashboards, diffs, and the ancient art of clearing caches.'],
		['space', 'rest', 'REST API Airlock', 'JSON floats past the portal while wp/v2/posts asks for museum credentials.'],
		['paper', 'time', 'Photocopied Time Capsule', 'A zine table where every release is stapled, stamped, and already coffee-ringed.'],
		['noir', 'comments', 'Comment Queue Aquarium', 'Pingbacks drift behind glass while spam haiku circles the filter.'],
		['civic', 'civic', 'Fauxgo Rehabilitation Clinic', 'A municipal wing devoted to making the W behave itself in public.'],
		['lab', 'blocks', 'Playground Block Reactor', 'Browser science turns every exhibit into a rectangle with ambitions.'],
		['pixel', 'blocks', 'Gutenberg Block Party', 'The punch bowl is a block. The lamps are blocks. The curator may also be a block.'],
		['jazz', 'time', 'Release Train Supper Club', 'Next stop: maintenance branch, with a horn section and punctual database migrations.'],
		['memphis', 'comments', 'Trackback Disco', 'Reflections, replies, and suspicious pings dance under aggressively cheerful shapes.'],
		['botanical', 'jukebox', 'Jazz Fern Conservatory', 'Musicians, moss, and post formats share a humid room with excellent acoustics.'],
		['terminal', 'rest', 'JSON Tunnel Control', 'A glowing command center for endpoints, headers, and doors marked probably cacheable.'],
		['space', 'arcade', 'Asteroids of wp-admin', 'Classic dashboards drift through cabinet lights and very serious zero-gravity menus.'],
		['paper', 'bazaar', 'Widget Flea Market Zine', 'Everything is for sale, including a slightly haunted sidebar from 2008.'],
		['noir', 'terminal', 'Cron Job Night Watch', 'Scheduled tasks pace the gallery while a terminal blinks like it knows too much.'],
		['civic', 'blocks', 'Concrete Block Assembly', 'A city hall for patterns, reusable layouts, and rectangular civic pride.'],
		['lab', 'greenhouse', 'Customizer Terrarium', 'Sliders mist the plants; live preview goggles are required past this point.'],
		['pixel', 'bazaar', 'Cartridge Plugin Exchange', 'Tiny carts click into slots; one contains a weather widget from another timeline.'],
		['jazz', 'comments', 'Moderation Jazz Tank', 'Approve, trash, reply, solo: the aquarium has a strict four-button rhythm.'],
		['memphis', 'arcade', 'Theme Switcher Arcade', 'Pull a lever, get a layout, and hope the header image survives.'],
		['botanical', 'time', 'Legacy Orchid House', 'Old PHP versions bloom only when watered with backwards compatibility.'],
		['terminal', 'civic', 'WP-CLI Monument Hall', 'A command-line plaza with plaques, pipes, and no patience for modal dialogs.'],
		['space', 'blocks', 'Pattern Library Spacewalk', 'Reusable blocks orbit the atrium in a tidy but deeply smug formation.'],
		['paper', 'jukebox', 'Release Note Mixtape Room', 'Folded liner notes explain why every version deserved a better cassette label.'],
		['noir', 'rest', 'Webhook Detective Bureau', 'Every callback has an alibi; every endpoint has a shadow.'],
		['civic', 'time', 'Maintenance Branch Archives', 'Concrete cases preserve point releases, security patches, and stern signage.'],
		['lab', 'terminal', 'Sandbox Control Room', 'Test environments glow behind glass while the reset button looks tempting.'],
		['pixel', 'comments', 'Spam Boss Battle', 'Trackbacks spawn in waves; Akismet has three lives and a tiny cape.'],
		['jazz', 'greenhouse', 'Permalink Garden Lounge', 'Pretty URLs meander through planters while the bass line stays canonical.'],
		['memphis', 'blocks', 'Pattern Pop Showroom', 'Blocks wear sunglasses; templates pretend this was always the plan.'],
		['botanical', 'bazaar', 'Plugin Plant Sale', 'A charming stand for extensions, cuttings, and one widget with too many roots.'],
		['terminal', 'time', 'Legacy Emulator Vault', 'Old versions boot under glass, supervised by a phosphor-green docent.'],
		['space', 'civic', 'Compatibility Moon Base', 'A solemn lunar outpost proving very old things can still open in the browser.'],
		['paper', 'arcade', 'Dashboard Sticker Arcade', 'Photocopied cabinets, taped-on buttons, and a high score named admin.'],
		['noir', 'jukebox', 'Blue Note Security Desk', 'A smoky lobby for passwords, lazy images, and late-night minor releases.'],
		['civic', 'rest', 'API Customs Office', 'Passport control for JSON, nonce stamps, and oddly polite response codes.'],
		['lab', 'bazaar', 'Extension Test Kitchen', 'Plugins simmer in beakers while the browser refuses to leave the page.'],
		['pixel', 'terminal', 'FTP Dungeon Cabinet', 'A cabinet marked uploads only; the file permissions are the final boss.'],
		['jazz', 'blocks', 'Reusable Block Quartet', 'Four blocks walk into a standard; the layout leaves with sync enabled.'],
		['memphis', 'rest', 'Endpoint Pop Portal', 'Bright rectangles open into data, and the 404 page has excellent shoes.'],
		['botanical', 'comments', 'Pingback Lily Pond', 'Ripples of replies, trackbacks, and one fish named moderation.'],
		['terminal', 'bazaar', 'Package Manager Back Alley', 'A glowing market for dependencies, one zip at a time.'],
		['space', 'time', 'PHP Time Dilation Lab', 'The future loads fast, the past loads bravely, and both ask for memory.'],
		['paper', 'civic', 'Trademark Reading Room', 'A quiet archive for logos, fauxgos, and stern but loving typography notes.'],
		['noir', 'arcade', 'Admin Bar After Hours', 'The toolbar keeps watch from above while the cabinets hum below.'],
		['civic', 'greenhouse', 'Open Source Civic Garden', 'Benches, shrubs, and public code growing under municipal skylights.'],
		['lab', 'jukebox', 'Browser Jazz Observatory', 'A clean-room listening booth where screenshots, standards, and saxophones align.'],
	];

	const variants = [
		{
			slug: 'current',
			name: 'Current Museum',
			shortName: 'Ultimate',
			kicker: '— Now Open · Est. 2003 · Free Admission —',
			description: 'The main museum, curated from the strongest exploration ideas.',
			isCurrent: true,
			decor: true,
			uiStyle: 'glass',
			textureStyle: 'current',
			frameStyle: 'museum-brass',
			muralStyle: 'ultimate',
			atriumFeature: 'ultimate-museum',
			roomFeature: 'era-vignettes',
			props: [
				'modelRadio',
				'pluginCrates',
				'modelLaptop',
				'apiPortal',
				'blockStack',
				'commentBubble',
				'modelPlant',
			],
			models: [
				'radio',
				'laptop',
				'pottedPlant',
				'computerScreen',
				'detailBench',
				'bookcaseOpenLow',
			],
			scene: scene('#cbd9e6', '#d8e4f0', '#fff7df', '#8fa1b8', 2.75, 2.45),
			eraColors: defaultEraColors,
			wall: ['#cbd7e7', '#9fb1c9', '#f3f0dd'],
			floor: ['#2f3f5f', '#1f2b44', '#ffcf6a'],
			ceiling: ['#d5dde8', '#97a8bf', '#ffffff'],
		},
	];

	concepts.forEach(([worldKey, featureKey, name, description], index) => {
		const world = worlds[worldKey];
		const feature = features[featureKey];
		const number = index + 1;
		const shortName = name
			.replace(/^(WordPress|WP)\s+/i, '')
			.replace(/\s+(Palace|Room|Hall|Lab|Lounge|Archive|Archives|Showroom|Office|Bureau|Cathedral|Midway|Arcade|Garden|Vault|Clinic|Desk|Control|Conservatory|Observatory)$/i, '');

		variants.push({
			...world,
			...feature,
			slug: toSlug(name),
			number,
			name,
			shortName: `${number}. ${shortName}`,
			description,
			muralTitle: name,
			muralSubtitle: description,
			props: [...feature.props],
			models: [...feature.models],
			eraColors: rotate(world.eraColors, index % world.eraColors.length),
			accentWord: description.split(/[.,;]/)[0].toLowerCase(),
			decorDensity: 2 + (index % 3),
			roomTempo: index % 2 === 0 ? 'even' : 'staggered',
		});
	});

	window.WP_MUSEUM_VARIANTS = variants;
	window.WP_MUSEUM_VARIANT_NOTES = {
		sourcePolicy:
			'The 50 explorations use procedural Three.js geometry, procedural canvas murals/textures, and a small vendored subset of Kenney CC0 GLB models.',
		externalResearch: [
			{
				name: 'Kenney Furniture Kit',
				url: 'https://kenney.nl/assets/furniture-kit',
				note: 'CC0 GLB furniture, plant, computer, radio, speaker, and TV models used as small museum props.',
			},
			{
				name: 'Kenney Retro Urban Kit',
				url: 'https://kenney.nl/assets/retro-urban-kit',
				note: 'CC0 GLB benches, lights, awnings, pallets, trucks, and scaffolding used in richer variant scenes.',
			},
			{
				name: 'Kenney Building Kit',
				url: 'https://kenney.nl/assets/building-kit',
				note: 'CC0 GLB columns, portals, trim, and stair pieces used as museum set dressing.',
			},
			{
				name: 'ambientCG materials',
				url: 'https://docs.ambientcg.com/license/',
				note: 'Existing texture files in assets/textures are CC0 1.0 Universal.',
			},
			{
				name: 'Wapuu artwork',
				url: 'https://jawordpressorg.github.io/wapuu/',
				note: 'Original Wapuu artwork used in the default museum as GPLv2-or-later mascot art; wall variations are from Wapuu Studio.',
			},
			{
				name: 'WordPress graphics and trademark guidance',
				url: 'https://wordpress.org/about/logos/',
				note: 'The variants use text and procedural marks rather than downloading or modifying official logo assets.',
			},
		],
	};

	function scene(background, fog, hemiSky, hemiGround, hemiIntensity, keyIntensity) {
		return {
			background,
			fog,
			hemiSky,
			hemiGround,
			hemiIntensity,
			keyIntensity,
		};
	}

	function rotate(items, amount) {
		return items.map((_, index) => items[(index + amount) % items.length]);
	}

	function toSlug(value) {
		return value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	}
})();

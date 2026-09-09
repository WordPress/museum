const grid = document.querySelector('#variant-grid');
const variants = (window.WP_MUSEUM_VARIANTS || []).filter(
	(variant) => !variant.isCurrent
);

grid.replaceChildren(...variants.map(createVariantCard));

function createVariantCard(variant) {
	const card = document.createElement('article');
	card.className = 'variant-card';
	card.style.setProperty('--c1', variant.eraColors[0]);
	card.style.setProperty('--c2', variant.eraColors[1]);
	card.style.setProperty('--c3', variant.eraColors[2]);

	const swatches = document.createElement('div');
	swatches.className = 'swatches';
	for (const color of variant.eraColors.slice(0, 5)) {
		const swatch = document.createElement('span');
		swatch.style.background = color;
		swatches.append(swatch);
	}

	const eyebrow = document.createElement('p');
	eyebrow.textContent = `${String(variant.number).padStart(3, '0')} / ${variant.kicker}`;

	const title = document.createElement('h2');
	title.textContent = variant.name;

	const description = document.createElement('p');
	description.className = 'description';
	description.textContent = variant.description;

	const meta = document.createElement('dl');
	meta.innerHTML = `
		<div><dt>UI</dt><dd>${variant.uiStyle}</dd></div>
		<div><dt>Scene</dt><dd>${variant.atriumFeature}</dd></div>
		<div><dt>Frame</dt><dd>${variant.frameStyle}</dd></div>
	`;

	const link = document.createElement('a');
	link.href = `./?variant=${encodeURIComponent(variant.slug)}`;
	link.textContent = 'Open exploration';

	card.append(swatches, eyebrow, title, description, meta, link);
	return card;
}

// Keep dispatch links on the museum that launched Playground, including previews.
export function prepareBlueprint(source, museumUrl) {
	const blueprint = structuredClone(source);
	const base = new URL('./', museumUrl).href;
	const upstream = 'https://janjakes.github.io/wordpress-museum/';
	for (const step of blueprint.steps ?? []) {
		if (step.step !== 'runPHP' || typeof step.code !== 'string') continue;
		step.code = step.code.replace(/base64_decode\('([A-Za-z0-9+/=]+)'\)/g, (expression, encoded) => {
			const content = atob(encoded);
			return content.includes(upstream)
				? `base64_decode('${btoa(content.replaceAll(upstream, base))}')`
				: expression;
		});
	}
	// Retain upstream's automatic PHP selection for legacy WordPress versions.
	if (blueprint.preferredVersions) delete blueprint.preferredVersions.php;
	return blueprint;
}

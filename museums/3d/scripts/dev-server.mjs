import { createPreviewServer } from '../../../scripts/dev-server.mjs';

const port = Number(process.env.PORT ?? 4173);
const server = await createPreviewServer();
server.listen(port, '127.0.0.1', () => {
	console.log(`3D WordPress Museum: http://127.0.0.1:${server.address().port}/3d/`);
});

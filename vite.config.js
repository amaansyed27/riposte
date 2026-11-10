import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only frame capture: the debug harness POSTs canvas frames here so they can be reviewed frame by frame.
const shots = () => ({
  name: 'riposte-shots',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__shot', (req, res) => {
      const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '');
      const dir = path.resolve('.shots');
      fs.mkdirSync(dir, { recursive: true });
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => { fs.writeFileSync(path.join(dir, `${name}.jpg`), Buffer.concat(chunks)); res.end('ok'); });
    });
  },
});

export default defineConfig({ base: './', plugins: [shots()], build: { target: 'es2022', chunkSizeWarningLimit: 900 } });

import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only frame capture: the debug harness POSTs canvas frames here so they can be reviewed frame by frame.
const shots = () => ({
  name: 'riposte-shots',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__shot', (req, res) => {
      const q = new URL(req.url, 'http://x').searchParams;
      const name = (q.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '');
      const ext = ['jpg', 'json', 'wav'].includes(q.get('ext')) ? q.get('ext') : 'jpg';
      const dir = path.resolve('.shots', (q.get('dir') || '').replace(/[^a-z0-9_-]/gi, ''));
      if (req.method === 'GET') { const p = path.join(dir, name + '.' + ext); if (!fs.existsSync(p)) { res.statusCode = 404; return res.end(); } return fs.createReadStream(p).pipe(res); }
      fs.mkdirSync(dir, { recursive: true });
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => { fs.writeFileSync(path.join(dir, `${name}.${ext}`), Buffer.concat(chunks)); res.end('ok'); });
    });
  },
});

export default defineConfig({ base: './', plugins: [shots()], build: { target: 'es2022', chunkSizeWarningLimit: 900 } });

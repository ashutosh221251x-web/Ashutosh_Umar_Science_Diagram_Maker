import { copyFileSync } from 'node:fs';
copyFileSync('results.json', 'dist/results.json');
console.log('Bundled committed results.json into dist/results.json');

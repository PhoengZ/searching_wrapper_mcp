import { Store } from '../../dist/storage/store.js';
try { const store = new Store(process.argv[2]); console.log('LOCKED'); setInterval(() => {}, 1000); process.on('SIGTERM', () => { store.close(); process.exit(0); }); }
catch { console.log('PROFILE_IN_USE'); process.exitCode = 1; }

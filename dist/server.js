import { start } from './index.js';
start().catch((err) => {
    console.error('[sto-express] Failed to start:', err);
    process.exit(1);
});

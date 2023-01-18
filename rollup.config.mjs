// build with:
// ./node_modules/.bin/rollup --config rollup.config.mjs

import {defineConfig} from 'rollup';

export default defineConfig({
    input: 'src/main.mjs',
    output: {
        file: 'build/pystk.js',
        format: 'iife',
        entryFileNames: 'src/main.js',

        // We need to export `initializeScript`... to top-level, i.e. `this`.
        // It's not possible to update `this` directly, so we set `__this=this` and update `__this`
        banner: 'this.__this = this;',
        name: '__this',
        extend: true,
    }
});
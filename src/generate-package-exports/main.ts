#!/usr/bin/env node

import fg from 'fast-glob';
import path from 'path';
import yargs from 'yargs';
import { fmtu, fs_write, paths_assert } from '../utils/lib';

export type MainArgv = {
    // base scan dir (old: "dir")
    dir: string;

    // where index.ts will be written
    out: string;

    // export path tweaks
    is_module: boolean;      // append .js to TS exports

    // legacy-style switches preserved
    include_bin: boolean;    // include files under **/bin/**
    types_only: boolean;     // restrict to **/types.ts
    dir_skip: string[];      // convenience -> turned into ignores

    // new, glob-driven controls
    include_glob: string[];  // which files to include
    ignore_glob: string[];   // which files to ignore
};

const argv = yargs
    .version(false)
    .option('dir', {
        type: 'string',
        default: 'src',
        describe: 'Base directory to scan for exports',
    })
    .option('out', {
        type: 'string',
        default: 'src',
        demandOption: true,
        describe: 'Directory in which to write index.ts',
    })
    .option('include_glob', {
        type: 'array',
        // nested, ts+svelte by default
        default: ['**/*.{ts,svelte}'],
        describe: 'Glob patterns to include (relative to --dir)',
    })
    .option('ignore_glob', {
        type: 'array',
        // sensible defaults + underscore files
        default: [
            '**/_*',            // skip underscore-prefixed files in any folder
            '**/_*/**',         // and their subtrees
            '**/index.ts',      // don’t re-export an index
            '**/global.d.ts',   // ambient types file
            '**/*.d.ts',        // declaration files
            '**/node_modules/**',
            '**/.*/**',         // dot dirs like .git/.svelte-kit
            '**/dist/**',
            '**/build/**',
        ],
        describe: 'Glob patterns to ignore (relative to --dir)',
    })
    .option('include_bin', {
        type: 'boolean',
        default: false,
    })
    .option('types_only', {
        type: 'boolean',
        default: false,
    })
    .option('is_module', {
        type: 'boolean',
        default: true,
        describe: 'Append .js to TS export paths (ESM build output)',
    })
    .option('is_relative', {
        type: 'boolean',
        default: false,
        describe: 'Kept for compatibility; export paths are relative to --out already',
    })
    .option('dir_skip', {
        type: 'array',
        default: [],
        describe: 'Directories to skip (turned into ignore globs like **/<dir>/**)',
    })
    .help()
    .argv as unknown as MainArgv;

const to_posix = (p: string) => p.replace(/\\/g, '/');

export const main_gen_package_exports = async (): Promise<void> => {
    const base_path = paths_assert(process.cwd(), argv.dir);
    const out_path = paths_assert(process.cwd(), ...argv.out.split('/'));
    console.log(`out_path `, out_path)
    const export_path = paths_assert(out_path, 'index.ts');
    console.log(`export_path `, export_path)
    // build glob inputs
    const include_glob = (argv.types_only ? ['**/types.ts'] : (argv.include_glob as unknown as string[])).slice();

    const ignore_glob = (argv.ignore_glob as unknown as string[]).slice();

    if (!argv.include_bin) {
        ignore_glob.push('**/bin/**');
    }

    // dir_skip convenience -> ignore dirs
    if (argv.dir_skip?.length) {
        for (const d of argv.dir_skip) {
            // if user already passed a glob, keep it; otherwise treat it as a folder name
            if (d.includes('*') || d.includes('?') || d.includes('[')) {
                ignore_glob.push(d);
            } else {
                ignore_glob.push(`**/${d}/**`);
            }
        }
    }

    // gather files with fast-glob
    const files = await fg(include_glob, {
        cwd: base_path,
        ignore: ignore_glob,
        onlyFiles: true,
        dot: false,
        followSymbolicLinks: true,
        unique: true,
        absolute: false, // relative to base_path
    });

    const package_files: string[] = [];

    for (const rel_file of files) {
        const filename = path.basename(rel_file);
        // extra safety: ignore underscore-prefixed filenames even if glob missed it
        if (filename.startsWith('_')) continue;

        const ext = path.extname(filename);       // .ts / .svelte
        const filename_base = filename.slice(0, -ext.length);

        // absolute path to the file (no ext)
        const abs_no_ext = path.resolve(base_path, rel_file).replace(/\.(ts|svelte)$/i, '');

        // path from out dir to target file (no ext), posix normalized
        let rel_from_out = to_posix(path.relative(out_path, abs_no_ext));
        if (!rel_from_out.startsWith('.') && !rel_from_out.startsWith('/')) {
            rel_from_out = `./${rel_from_out}`;
        }

        // emit exports
        if (ext === '.ts') {
            package_files.push(`export * from "${rel_from_out}${argv.is_module ? '.js' : ''}"`);
        } else if (ext === '.svelte') {
            // create a safe named export from the default
            const named = fmtu(filename_base.replaceAll('-', '_'));
            package_files.push(`export { default as ${named} } from "${rel_from_out}"`);
        }
    }

    // sort for determinism (dirs first-ish via simple lexicographic)
    package_files.sort((a, b) => a.localeCompare(b));

    console.log(JSON.stringify(package_files, null, 4), `package_files`)
    // fs_file_init(export_path);
    fs_write(export_path, `// Created by @radroots/dev generate-package-exports\n\n${package_files.join('\n')}\n`);
};

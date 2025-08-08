#!/usr/bin/env node

import { existsSync, readdirSync, writeFileSync } from "fs";
import { isAbsolute, join } from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { z } from "zod";
import {
    fs_read,
    fs_write,
    paths,
    paths_assert,
} from "../utils";

const argv_schema = z.object({
    routes: z.string(),
    locales: z.string(),
});
type Argv = z.infer<typeof argv_schema>;

const translations_schema = z.record(
    z.string(),
    z.record(z.string(), z.string())
);

function is_skippable(segment: string): boolean {
    return segment.startsWith('(') || segment.startsWith('[');
}

function get_localisable_prefixes(base_dir: string): string[] {
    const prefixes: Set<string> = new Set();

    function walk(dir: string, path_parts: string[] = []) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full_path = join(dir, entry.name);

            if (entry.isDirectory()) {
                walk(full_path, [...path_parts, entry.name]);
            } else if (entry.isFile() && entry.name === "+page.svelte") {
                const clean_parts = path_parts.filter(p => !is_skippable(p));
                const first = clean_parts[0];
                if (first) prefixes.add(first);
            }
        }
    }

    walk(base_dir);
    return Array.from(prefixes);
}

const main = async () => {
    const argv = yargs(hideBin(process.argv))
        .option("routes", {
            type: "string",
            demandOption: true,
            describe: "Path to routes JSON file"
        })
        .option("locales", {
            type: "string",
            demandOption: true,
            describe: "Path to locales JSON file"
        })
        .help()
        .argv as Argv;

    const args = argv_schema.parse(argv);

    const routes_path = isAbsolute(args.routes)
        ? args.routes
        : join(process.cwd(), args.routes);
    const locales_path = isAbsolute(args.locales)
        ? args.locales
        : join(process.cwd(), args.locales);

    if (!existsSync(routes_path)) throw new Error(`Missing routes.json at ${routes_path}`);
    if (!existsSync(locales_path)) throw new Error(`Missing locales.json at ${locales_path}`);

    const translations = translations_schema.parse(JSON.parse(fs_read(routes_path)));
    const locales = JSON.parse(fs_read(locales_path)) as string[];

    const cwd = process.cwd();
    const src_dir = paths_assert(cwd, "src");
    const routes_dir = paths_assert(src_dir, "routes");
    const output_dir = paths_assert(src_dir, "lib", "utils", "routes");
    const output_path = paths(output_dir, "localised.gen.ts");

    const prefixes = get_localisable_prefixes(routes_dir);

    const locale_routes: Record<string, string> = {};
    const localisable_prefixes: Set<string> = new Set();

    for (const route_key of prefixes) {
        const canonical = route_key;
        localisable_prefixes.add(canonical);

        for (const locale of locales) {
            const loc = translations[locale]?.[route_key] ?? route_key;
            locale_routes[`/${loc}`] = `/${canonical}`;
            localisable_prefixes.add(loc);
        }
    }

    const output = `// this file was created with @radroots/dev generate-localised-routes

export const locale_routes: Record<string, string> = {
${Object.entries(locale_routes)
            .map(([from, to]) => `  "${from}": "${to}",`)
            .join("\n")}
};

export const localisable_prefixes = new Set([
${[...localisable_prefixes]
            .map(p => `  "${p}",`)
            .join("\n")}
]);
`;

    if (!existsSync(output_path)) {
        writeFileSync(output_path, "");
    }

    fs_write(output_path, output);
    console.log(`Routes written to: ${output_path}`);
};

main();

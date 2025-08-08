#!/usr/bin/env node

import { readdirSync } from "fs"
import { isAbsolute, join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { z } from "zod"
import { fs_read_json, fs_write, taba } from "../utils/lib"

type ColorTriple = [number, number, number]
interface Layer {
    surface: Record<string, ColorTriple>
    glyphs: Record<string, ColorTriple>
}
type Layers = Record<string, Layer>

const argv_schema = z.object({
    dir: z.string(),
    out: z.string(),
    format: z.enum(["hsl", "rgb"]).default("hsl"),
})
type Argv = z.infer<typeof argv_schema>

const theme_modes = ["dark", "light"] as const
type ThemeMode = (typeof theme_modes)[number]

function layers_to_css_vars(layers: Layers, format: "rgb" | "hsl"): string[] {
    const is_hsl = format === "hsl"
    const vars: string[] = []
    for (const key in layers) {
        const idx = key.split("_")[1]
        if (!idx) continue
        for (const category of ["surface", "glyphs"] as (keyof Layer)[]) {
            const is_glyphs = category === "glyphs"
            for (const [name, triple] of Object.entries(layers[key][category])) {
                const var_name = `color-ly${idx}${is_glyphs ? "-gl" : ""}-${name}`
                    .replace(/_+/g, "-")
                    .replace(/-+/g, "-")
                    .replace(/-$/, "")
                const value = is_hsl
                    ? `${triple[0]}, ${triple[1]}%, ${triple[2]}%`
                    : triple.join(", ")
                vars.push(`--${var_name}: ${format}(${value});`)
            }
        }
    }
    return vars
}

function find_theme_files(base_dir: string, format: "hsl" | "rgb") {
    const files = readdirSync(base_dir, { withFileTypes: true })
    const themes: Record<string, Partial<Record<ThemeMode, string>>> = {}
    const pattern = new RegExp(`^(?<key>.+)\\.${format}\\.(?<mode>dark|light)\\.json$`)

    for (const entry of files) {
        if (!entry.isFile()) continue
        const match = entry.name.match(pattern)
        if (!match?.groups) continue
        const theme_key = match.groups.key
        const mode = match.groups.mode as ThemeMode
        if (!themes[theme_key]) themes[theme_key] = {}
        themes[theme_key][mode] = join(base_dir, entry.name)
    }
    return themes
}

async function main() {
    const raw_argv = await yargs(hideBin(process.argv))
        .option("dir", { type: "string", demandOption: true, describe: "directory containing theme JSON files" })
        .option("out", { type: "string", demandOption: true, describe: "directory to write CSS files" })
        .option("format", { type: "string", choices: ["hsl", "rgb"], default: "hsl" })
        .help()
        .argv as Argv

    const args = argv_schema.parse(raw_argv)

    const dir = isAbsolute(args.dir) ? args.dir : join(process.cwd(), args.dir)
    const out_dir = isAbsolute(args.out) ? args.out : join(process.cwd(), args.out)

    const themes_map = find_theme_files(dir, args.format)
    const all_base_vars: Set<string> = new Set()

    for (const [theme_key, paths] of Object.entries(themes_map)) {
        const theme_tokens: Record<ThemeMode, string[]> = { light: [], dark: [] }
        const base_vars: Set<string> = new Set()

        for (const mode of theme_modes) {
            const path_json = paths[mode]
            if (!path_json) throw new Error(`Missing ${mode} file for theme "${theme_key}"`)
            const json = fs_read_json(path_json)
            const tokens = layers_to_css_vars(json, args.format)
            theme_tokens[mode].push(...tokens)

            for (const token of tokens) {
                const match = token.match(/^--color-(.+?):/)
                const token_key = match?.[1]
                if (token_key) {
                    const base_line = `--color-${token_key}: ${args.format}(var(--${token_key}) / <alpha-value>);`
                    base_vars.add(base_line)
                    all_base_vars.add(base_line)
                }
            }
        }

        let css_content = "@theme {"
        css_content += `\n${[...base_vars].map(v => `${taba()}${v}`).join("\n")}`
        css_content += `\n}`

        for (const mode of theme_modes) {
            css_content += `\n\n@plugin "daisyui/theme" {`
            css_content += `\n${taba()}name: "${theme_key}_${mode}";`
            css_content += `\n${taba()}default: false;`
            css_content += `\n${taba()}prefersdark: ${mode === "dark"};`
            css_content += `\n${taba()}color-scheme: ${mode};\n`
            css_content += theme_tokens[mode].map(t => `${taba()}${t}`).join("\n")
            css_content += `\n}`
        }

        fs_write(join(out_dir, `${theme_key}.css`), css_content)
        console.log(`Wrote ${join(out_dir, `${theme_key}.css`)}`)
    }

    let theme_css_content = "@theme {"
    theme_css_content += `\n${[...all_base_vars].map(v => `${taba()}${v}`).join("\n")}`
    theme_css_content += `\n}`
    fs_write(join(out_dir, "theme.css"), theme_css_content)
    console.log(`Wrote ${join(out_dir, "theme.css")}`)
}

main()

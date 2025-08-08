import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';


export function fs_read(path: string): string {
    return readFileSync(path, "utf8");
}

export function fs_write(path: string, contents: string): void {
    writeFileSync(path, contents, "utf8");
}

export function fmtu(input: string): string {
    return input.split(/[_-]/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

export function taba(level = 1): string {
    return '    '.repeat(level);
}

export function paths_assert(...parts: string[]): string {
    const path = join(...parts);
    if (!existsSync(path)) throw new Error(`Path not found: ${path}`);
    return path;
}

export function paths(...parts: string[]): string {
    const path = join(...parts);
    return path;
}
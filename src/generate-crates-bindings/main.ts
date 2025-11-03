#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { z } from "zod";

const argv_schema = z.object({
    packages: z.string().optional(),
});
type Argv = z.infer<typeof argv_schema>;

const main = async () => {
    const _argv = yargs(hideBin(process.argv))
        .option("packages", {
            type: "string",
            demandOption: false,
        })
        .help()
        .argv as Argv;

    const argv = argv_schema.parse(_argv);
    console.log(JSON.stringify(argv, null, 4), `argv`);



}

main();
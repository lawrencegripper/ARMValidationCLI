import { exit } from "process";
import { run } from "./armval";

run().catch(e => {
    console.error(e);
    exit(1);
});

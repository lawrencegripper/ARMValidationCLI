import { run } from "./armval";
import { exit } from "process";

run().catch(e => {
    console.error(e);
    exit(1);
});
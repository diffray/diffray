#!/usr/bin/env bun

import { main } from "../src/cli";

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});


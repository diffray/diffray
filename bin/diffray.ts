#!/usr/bin/env bun

import { main } from "../src/cli";

main()
  .then(() => {
    // Explicitly exit on success to ensure process terminates
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  });


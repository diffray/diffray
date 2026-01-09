import { Glob } from "bun";

async function generateEmbeddedDefaults() {
  // Create output directory if it doesn't exist
  await Bun.write("src/generated/.gitkeep", "");

  // Function to read markdown files from a directory
  async function readMarkdownFiles(dir: string): Promise<Record<string, string>> {
    const glob = new Glob(`${dir}*.md`);
    const files: Record<string, string> = {};
    
    for await (const filePath of glob.scan()) {
      const fileName = filePath.split("/").pop()!;
      const content = await Bun.file(filePath).text();
      // Escape backticks and ${} in content
      const escapedContent = content
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\${/g, "\\${");
      files[fileName] = escapedContent;
    }
    
    return files;
  }

  // Read files from all three directories
  const embeddedAgents = await readMarkdownFiles("src/defaults/agents/");
  const embeddedRules = await readMarkdownFiles("src/defaults/rules/");
  const embeddedPrompts = await readMarkdownFiles("src/defaults/prompts/");

  // Helper function to format object entries
  function formatObject(obj: Record<string, string>): string {
    return Object.entries(obj)
      .map(([key, value]) => {
        // Ensure the value is properly escaped for template literals
        const safeValue = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        return `  '${key}': \`${safeValue}\``;
      })
      .join(",\n");
  }

  // Generate the TypeScript content
  const tsContent = `// Auto-generated - do not edit manually
// Run: bun scripts/generate-embedded-defaults.ts

export const embeddedAgents: Record<string, string> = {
${formatObject(embeddedAgents)}
};

export const embeddedRules: Record<string, string> = {
${formatObject(embeddedRules)}
};

export const embeddedPrompts: Record<string, string> = {
${formatObject(embeddedPrompts)}
};
`;

  // Write the generated file
  await Bun.write("src/generated/embedded-defaults.ts", tsContent);
  console.log("Generated src/generated/embedded-defaults.ts");
}

// Run the script
generateEmbeddedDefaults().catch(console.error);
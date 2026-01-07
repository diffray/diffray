/**
 * Interactive output renderer with re-rendering support
 */

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
};

interface CollapsibleBlock {
  id: string;
  title: string;
  content: string;
  startLine: number;
  endLine: number;
  collapsed: boolean;
}

/**
 * Collapsible output renderer
 */
export class CollapsibleOutput {
  private blocks: CollapsibleBlock[] = [];
  private maxPreviewLines = 10;
  private totalLinesRendered = 0;

  /**
   * Add a collapsible block
   */
  addBlock(id: string, title: string, content: string): void {
    const lines = content.split('\n');
    const collapsed = lines.length > this.maxPreviewLines;

    const block: CollapsibleBlock = {
      id,
      title,
      content,
      startLine: this.totalLinesRendered,
      endLine: this.totalLinesRendered + (collapsed ? this.maxPreviewLines + 3 : lines.length + 2),
      collapsed,
    };

    this.blocks.push(block);
    this.renderBlock(block);
  }

  /**
   * Render a single block
   */
  private renderBlock(block: CollapsibleBlock): void {
    const lines = block.content.split('\n');

    // Header
    const icon = block.collapsed ? '▶' : '▼';
    process.stdout.write(
      `\n${colors.cyan}${icon}${colors.reset} ${colors.bold}${block.title}${colors.reset}\n`
    );
    this.totalLinesRendered += 2;

    if (block.collapsed) {
      // Show preview
      const preview = lines.slice(0, this.maxPreviewLines);
      for (const line of preview) {
        process.stdout.write(`${colors.dim}${line}${colors.reset}\n`);
        this.totalLinesRendered++;
      }

      const remaining = lines.length - this.maxPreviewLines;
      if (remaining > 0) {
        process.stdout.write(
          `${colors.gray}... ${remaining} more lines (${lines.length} total)${colors.reset}\n`
        );
        this.totalLinesRendered++;
      }
    } else {
      // Show full content
      for (const line of lines) {
        process.stdout.write(`${line}\n`);
        this.totalLinesRendered++;
      }
    }
  }

  /**
   * Clear output
   */
  clear(): void {
    this.blocks = [];
    this.totalLinesRendered = 0;
  }
}

/**
 * Progressive output renderer - shows content as it arrives
 */
export class ProgressiveOutput {
  private sections: Map<string, { title: string; lines: string[]; maxLines: number }> = new Map();
  private sectionOrder: string[] = [];

  /**
   * Start a new section
   */
  startSection(id: string, title: string, maxLines = 15): void {
    if (!this.sections.has(id)) {
      this.sectionOrder.push(id);
    }

    this.sections.set(id, {
      title,
      lines: [],
      maxLines,
    });

    // Render header
    process.stdout.write(
      `\n${colors.cyan}▼${colors.reset} ${colors.bold}${title}${colors.reset}\n`
    );
  }

  /**
   * Append line to section
   */
  appendLine(id: string, line: string): void {
    const section = this.sections.get(id);
    if (!section) return;

    section.lines.push(line);

    // Re-render section
    this.renderSection(id);
  }

  /**
   * Render a section with scrolling
   */
  private renderSection(id: string): void {
    const section = this.sections.get(id);
    if (!section) return;

    const totalLines = section.lines.length;
    const visibleLines = section.lines.slice(-section.maxLines);

    // Move cursor up to section start
    if (totalLines > 0) {
      const linesToClear = Math.min(totalLines, section.maxLines);
      process.stdout.write(`\x1b[${linesToClear}A`);
    }

    // Clear and render visible lines
    for (let i = 0; i < section.maxLines; i++) {
      process.stdout.write('\r\x1b[K');
      if (i < visibleLines.length) {
        const line = visibleLines[i];
        if (line !== undefined) {
          process.stdout.write(line);
        }
      }
      process.stdout.write('\n');
    }

    // Show scroll indicator
    if (totalLines > section.maxLines) {
      const hidden = totalLines - section.maxLines;
      process.stdout.write(`${colors.gray}... ${hidden} more lines above${colors.reset}\n`);
    }
  }

  /**
   * End section
   */
  endSection(id: string): void {
    const section = this.sections.get(id);
    if (!section) return;

    process.stdout.write('\n');
  }

  /**
   * Clear all sections
   */
  clear(): void {
    this.sections.clear();
    this.sectionOrder = [];
  }
}

/**
 * Truncate long text with ellipsis
 */
export function truncateText(
  text: string,
  maxLines: number
): { preview: string; truncated: boolean; total: number } {
  const lines = text.split('\n');
  const total = lines.length;

  if (total <= maxLines) {
    return { preview: text, truncated: false, total };
  }

  const preview = lines.slice(0, maxLines).join('\n');
  return { preview, truncated: true, total };
}

/**
 * Format large block with collapse indicator
 */
export function formatLargeBlock(title: string, content: string, maxLines = 10): string {
  const { preview, truncated, total } = truncateText(content, maxLines);
  const output: string[] = [];

  // Header with icon and title
  const icon = truncated ? '▶' : '▼';
  output.push(
    `${colors.cyan}${icon}${colors.reset} ${colors.bold}${title}${colors.reset} ${colors.dim}(${total} lines)${colors.reset}`
  );
  output.push('');

  // Content preview
  const lines = preview.split('\n');
  for (const line of lines) {
    output.push(`  ${colors.dim}${line}${colors.reset}`);
  }

  // Truncation indicator
  if (truncated) {
    const remaining = total - maxLines;
    output.push('');
    output.push(`  ${colors.yellow}▼ ${remaining} more lines hidden${colors.reset}`);
    output.push(`  ${colors.dim}Scroll down to see full content${colors.reset}`);
  }

  output.push('');
  output.push(colors.dim + '─'.repeat(80) + colors.reset);
  output.push('');

  return output.join('\n');
}

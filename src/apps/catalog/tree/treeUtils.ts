// ui/src/apps/catalog/tree/treeUtils.ts

import type { TomlNode } from "../types";

/** Stable string key for a node based on its TOML path. */
export function nodeKey(node: TomlNode): string {
  return node.path.join(".");
}

/** Find a node anywhere in a tree by TOML path. */
export function findNodeByPath(nodes: TomlNode[], path: string[]): TomlNode | null {
  const want = path.join(".");
  const stack: TomlNode[] = [...nodes];
  while (stack.length) {
    const n = stack.pop()!;
    if (nodeKey(n) === want) return n;
    if (n.children) stack.push(...n.children);
  }
  return null;
}

export function treeContainsPath(nodes: TomlNode[], path: string[]): boolean {
  return findNodeByPath(nodes, path) !== null;
}

/**
 * Filter helper used by the sidebar tree.
 *
 * - If filter is null/empty: show everything.
 * - If filter is '__unknown__': show frames with no transmitter.
 * - Otherwise: only frames (CAN/Modbus) are filtered by transmitter match.
 */
export function shouldShowNode(node: TomlNode, filterByNode: string | null): boolean {
  if (filterByNode === null || filterByNode === "") return true;

  // Only filter frame nodes (CAN and Modbus)
  if (node.type !== "can-frame" && node.type !== "modbus-frame") return true;

  if (filterByNode === "__unknown__") {
    return !node.metadata?.transmitter;
  }

  return node.metadata?.transmitter === filterByNode;
}

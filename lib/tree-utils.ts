import type { FolderTreeItem } from "@/lib/redux/services/next-api";

export interface TreeNode {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  children: TreeNode[];
}

export function buildTree(items: FolderTreeItem[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }

  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

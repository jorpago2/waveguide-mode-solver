export function nextTabIndex(key: string, currentIndex: number, tabCount: number): number | undefined {
  if (tabCount < 1 || currentIndex < 0 || currentIndex >= tabCount) return undefined;
  if (key === "Home") return 0;
  if (key === "End") return tabCount - 1;
  if (key === "ArrowRight") return (currentIndex + 1) % tabCount;
  if (key === "ArrowLeft") return (currentIndex - 1 + tabCount) % tabCount;
  return undefined;
}

/** Pure UI helpers. Never persist drafts or turn preview values into HTML. */
export function contrastRatio(
  background: string,
  foreground: string,
): number | null {
  function luminance(value: string) {
    if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) return null;
    let hex = value.slice(1);
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
    const rgb = [0, 2, 4].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }
  const a = luminance(background),
    b = luminance(foreground);
  return a === null || b === null
    ? null
    : (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function changedSettingGroups<T extends object>(
  draft: T,
  saved: T,
): string[] {
  return (Object.keys(draft) as (keyof T & string)[]).filter(
    (key) => JSON.stringify(draft[key]) !== JSON.stringify(saved[key]),
  );
}

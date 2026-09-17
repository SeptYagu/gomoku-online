import { isLocale, type Locale } from "@/i18n/config";

/**
 * 纯函数：根据当前路径、查询字符串与目标语言计算无损切换链接。
 * 替换开头的 /${currentLocale} 前缀为 /${targetLocale}，保持子路径与所有查询参数不变。
 */
export function computeLocaleSwitchHref(
  pathname: string,
  search: string,
  targetLocale: Locale | string
): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const segments = normalizedPath.split("/").filter(Boolean);

  let targetPath: string;
  if (segments.length > 0 && isLocale(segments[0])) {
    const subpath = segments.slice(1).join("/");
    targetPath = subpath ? `/${targetLocale}/${subpath}` : `/${targetLocale}`;
  } else {
    const subpath = segments.join("/");
    targetPath = subpath ? `/${targetLocale}/${subpath}` : `/${targetLocale}`;
  }

  const cleanSearch = search.startsWith("?") ? search.slice(1).trim() : search.trim();
  return cleanSearch ? `${targetPath}?${cleanSearch}` : targetPath;
}

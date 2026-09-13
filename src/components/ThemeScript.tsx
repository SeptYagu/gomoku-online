import { themeStorageKey } from "@/lib/theme";

const themeInitScript = `(function(){try{var stored=localStorage.getItem("${themeStorageKey}");var theme=stored==="light"||stored==="dark"?stored:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;}catch(e){document.documentElement.dataset.theme="light";}})();`;

export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: themeInitScript
      }}
    />
  );
}

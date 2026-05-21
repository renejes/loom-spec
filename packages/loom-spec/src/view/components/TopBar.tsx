import { Moon, Sun } from "lucide-react";
import { useTheme } from "../theme";

interface Props {
  title: string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: Props) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="topbar">
      <div className="title">{title}</div>
      {subtitle && <div className="subtitle">{subtitle}</div>}
      <button
        onClick={toggleTheme}
        title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
        aria-label="Toggle theme"
      >
        {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
      </button>
    </div>
  );
}

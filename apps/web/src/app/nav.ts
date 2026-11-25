import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  Home,
  Library,
  LineChart,
  RotateCcw,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  children?: { to: string; label: string; end?: boolean }[];
}

/** The authenticated app's navigation, grouped as in the product spec. Every entry is a real route. */
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Home", items: [{ to: "/app", label: "Home", icon: Home, end: true }] },
  {
    group: "My learning",
    items: [
      {
        to: "/app/booklet",
        label: "My Code Booklet",
        icon: BookOpen,
        children: [
          { to: "/app/booklet", label: "All snippets", end: true },
          { to: "/app/booklet/subjects", label: "Subjects" },
          { to: "/app/booklet/collections", label: "Collections" },
          { to: "/app/booklet/favourites", label: "Favourites" },
          { to: "/app/booklet/recent", label: "Recently edited" },
        ],
      },
      {
        to: "/app/practice",
        label: "AI Practice",
        icon: Sparkles,
        children: [
          { to: "/app/practice", label: "Generate questions", end: true },
          { to: "/app/practice/short", label: "Short mode" },
          { to: "/app/practice/long", label: "Long mode" },
          { to: "/app/practice/quizzes", label: "My quizzes" },
          { to: "/app/practice/history", label: "Practice history" },
        ],
      },
      { to: "/app/revision", label: "Smart Revision", icon: RotateCcw },
      {
        to: "/app/library",
        label: "Question Library",
        icon: Library,
        children: [
          { to: "/app/library", label: "All questions", end: true },
          { to: "/app/library/marked/green", label: "Green · Understood" },
          { to: "/app/library/marked/yellow", label: "Yellow · Revise" },
          { to: "/app/library/marked/red", label: "Red · Weak" },
          { to: "/app/library/incorrect", label: "Incorrect questions" },
          { to: "/app/library/favourites", label: "Favourites" },
          { to: "/app/library/imported", label: "Imported" },
        ],
      },
      {
        to: "/app/papers",
        label: "Practice Papers",
        icon: FileText,
        children: [
          { to: "/app/papers/new", label: "Generate new paper" },
          { to: "/app/papers", label: "My papers", end: true },
          { to: "/app/papers/attempts", label: "Previous attempts" },
          { to: "/app/papers/materials", label: "Materials" },
        ],
      },
    ],
  },
  {
    group: "Planning",
    items: [
      {
        to: "/app/planner",
        label: "Learning Planner",
        icon: ClipboardList,
        children: [
          { to: "/app/planner", label: "Overview", end: true },
          { to: "/app/planner/goals", label: "Learning goals" },
          { to: "/app/planner/day", label: "Daily plan" },
          { to: "/app/planner/week", label: "Weekly plan" },
          { to: "/app/planner/focus", label: "Focus timer" },
        ],
      },
      { to: "/app/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    group: "Performance",
    items: [
      {
        to: "/app/analytics",
        label: "Progress & Analytics",
        icon: LineChart,
        children: [
          { to: "/app/analytics", label: "Overall progress", end: true },
          { to: "/app/analytics/subjects", label: "Subjects & topics" },
          { to: "/app/analytics/coding", label: "Coding practice" },
          { to: "/app/analytics/revision", label: "Revision" },
          { to: "/app/analytics/study-time", label: "Study time" },
        ],
      },
    ],
  },
  {
    group: "Personalisation",
    items: [
      {
        to: "/app/settings",
        label: "Settings",
        icon: Settings,
        children: [
          { to: "/app/settings", label: "Profile", end: true },
          { to: "/app/settings/account", label: "Account" },
          { to: "/app/settings/ai", label: "AI providers" },
          { to: "/app/settings/learning", label: "Learning preferences" },
          { to: "/app/settings/notifications", label: "Notifications" },
          { to: "/app/settings/appearance", label: "Appearance" },
          { to: "/app/settings/data", label: "Data export" },
        ],
      },
    ],
  },
];

import { Outlet } from "react-router";
import { Plus } from "lucide-react";
import { ButtonLink, PageHeader, StatTile, TabLinks } from "@/components/ui";
import { useSnippetStats } from "./api";

export default function BookletLayout() {
  const stats = useSnippetStats();
  const s = stats.data;
  return (
    <div>
      <PageHeader
        title="My Code Booklet"
        description="Everything you've coded, organised by subject and topic, and readable like a book."
        actions={<ButtonLink to="/app/booklet/new" leftIcon={<Plus />}>Add new snippet</ButtonLink>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Snippets" value={s?.snippets ?? "–"} />
        <StatTile label="Subjects" value={s?.subjects ?? "–"} />
        <StatTile label="Collections" value={s?.collections ?? "–"} />
        <StatTile label="Favourites" value={s?.favorites ?? "–"} />
      </div>
      <TabLinks
        className="mb-5"
        tabs={[
          { to: "/app/booklet", label: "All snippets", end: true },
          { to: "/app/booklet/subjects", label: "Subjects" },
          { to: "/app/booklet/collections", label: "Collections" },
          { to: "/app/booklet/favourites", label: "Favourites" },
          { to: "/app/booklet/recent", label: "Recently edited" },
        ]}
      />
      <Outlet />
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/daw/Studio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KREATIVE AI Mixing & Mastering Studio" },
      { name: "description", content: "Browser-based DAW for AI-assisted mixing and mastering." },
      { property: "og:title", content: "KREATIVE AI Mixing & Mastering Studio" },
      { property: "og:description", content: "Browser-based DAW for AI-assisted mixing and mastering." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

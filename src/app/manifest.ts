import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "bdgt — Private Economy & Budget",
    short_name: "bdgt",
    description:
      "Follow up your monthly private economy, recurring bills, and shared household budget.",
    start_url: "/",
    display: "standalone",
    background_color: "#090d16",
    theme_color: "#10b981",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}

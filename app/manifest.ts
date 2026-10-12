import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oscar",
    short_name: "Oscar",
    description: "Your personal AI assistant.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#04070c",
    theme_color: "#04070c",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}

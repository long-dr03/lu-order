import type { MetadataRoute } from "next";

/** Lets phones install the site to the home screen and open it without browser bars. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LUUTA - Quản lý xưởng may",
    short_name: "LUUTA",
    description: "Quản lý đơn hàng, sản xuất và lương sản phẩm của xưởng may.",
    lang: "vi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f4f5",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

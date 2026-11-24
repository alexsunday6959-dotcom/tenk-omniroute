import { loader } from "fumadocs-core/source";

// Decouple docs markdown imports during production build to prevent Webpack .md loader errors
let docs = {
  toFumadocsSource: () => ({ files: [] }),
};

if (process.env.NODE_ENV !== "production" && typeof window === "undefined") {
  try {
    const mod = await import("../../.source/server");
    docs = mod.docs || docs;
  } catch {}
}

const generatedSource = docs.toFumadocsSource();

const docsSource = {
  ...generatedSource,
  files: (generatedSource.files || []).filter((file) => typeof file.path === "string"),
};

export const source = loader({
  baseUrl: "/docs",
  source: docsSource,
});

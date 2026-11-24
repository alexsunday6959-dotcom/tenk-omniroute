import { loader } from "fumadocs-core/source";

// In production build, provide empty doc sources to avoid bundling hundreds of raw .md files
export const source = loader({
  baseUrl: "/docs",
  source: {
    files: [],
  },
});

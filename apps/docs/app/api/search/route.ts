import { createFromSource } from "fumadocs-core/search/server";

import { source } from "@/lib/source";

// Built-in Orama search; the default multilingual mode indexes every language (Chinese included) in one database.
export const { GET } = createFromSource(source);

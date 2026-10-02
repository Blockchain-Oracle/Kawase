import defaultMdxComponents from "fumadocs-ui/mdx";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import type { MDXComponents } from "mdx/types";

import type { AreaId } from "@/lib/product";
import { AvailabilityMatrix, LimitsTable, ScopeList, Status } from "./availability";
import { Marks } from "./marks";

/** MDX components; the registry-driven ones are bound to the page's language. */
export function getMDXComponents(lang: string, components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Step,
    Steps,
    Tab,
    Tabs,
    Marks,
    AvailabilityMatrix: () => <AvailabilityMatrix lang={lang} />,
    LimitsTable: () => <LimitsTable lang={lang} />,
    ScopeList: ({ ids }: { ids?: string }) => (
      <ScopeList lang={lang} {...(ids ? { ids: ids.split(/\s+/) as AreaId[] } : {})} />
    ),
    Status: ({ ids }: { ids: string }) => <Status lang={lang} ids={ids.split(/\s+/) as AreaId[]} />,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = (components?: MDXComponents) => getMDXComponents("en", components);

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}

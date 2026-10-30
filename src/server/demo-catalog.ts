import "server-only";
import catalogFile from "../../data/demo-analysis.json";
import { ANALYSIS_FIELDS } from "@/lib/criteria";
import { demoCatalogSchema, matchDemoRows, type DemoLookupRow, type DemoMatch } from "@/lib/demo-match";

const catalog = demoCatalogSchema.parse(catalogFile);

if (catalog.matchingFields.join("\n") !== ANALYSIS_FIELDS.join("\n")) {
  throw new Error("demo catalog matching fields do not match the app");
}

export function lookupDemoRows(rows: DemoLookupRow[]): {
  displayLabel: string;
  criteriaVersion: string;
  matches: DemoMatch[];
} {
  return {
    displayLabel: catalog.provenance.displayLabel,
    criteriaVersion: catalog.criteriaVersion,
    matches: matchDemoRows(catalog, rows),
  };
}

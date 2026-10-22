import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import fixture from "../../data/task1-service-explorer.json";
import { normalizeCatalog } from "@/lib/catalog/normalize";
import { resolveCategoryState } from "@/lib/catalog/category-state";
import { parseExplorerState } from "@/lib/explorer-state";
import { ExplorerFilters } from "./explorer-filters";

const categories = [...normalizeCatalog(fixture).categoriesById.values()];
const locations = [{ id: 1, name: "Thailand", cities: [{ id: "bangkok", name: "Bangkok" }] }];
function render(query = "", ready = true) {
  return renderToStaticMarkup(<ExplorerFilters state={ready ? resolveCategoryState(parseExplorerState(new URLSearchParams(query)), categories)
    : parseExplorerState(new URLSearchParams(query))}
    update={vi.fn()} locations={ready ? locations : []} categories={ready ? categories : []} ready={ready} />);
}

describe("ExplorerFilters", () => {
  it("renders the URL's selected types, city and availability on the first render", () => {
    const html = render("type=package&type=lab_test&city=bangkok&home=true");
    expect(html.match(/checked=""/g)).toHaveLength(3);
    expect(html).toMatch(/<input(?=[^>]*value="package")(?=[^>]*checked="")[^>]*>/);
    expect(html).toMatch(/<input(?=[^>]*value="lab_test")(?=[^>]*checked="")[^>]*>/);
    expect(html).toContain('value="city:bangkok" selected=""');
    expect(html).toContain('for="location-filter"');
    expect(html).toContain("Country or city");
  });

  it("restores a country selection and leaves all checkboxes clear by default", () => {
    expect(render("country=1")).toContain('value="country:1" selected=""');
    const html = render();
    expect(html).not.toContain('checked=""');
    expect(html).toContain('value="" selected=""');
    expect(html).toContain("Leave unchecked to include all types.");
  });

  it("keeps an unknown URL location visible and removable rather than displaying All locations", () => {
    const html = render("city=removed-city");
    expect(html).toContain('value="city:removed-city" selected=""');
    expect(html).toContain("Unavailable location");
    expect(html).toContain('value="">All locations');
  });

  it("disables controls until the catalog is ready without losing URL selections", () => {
    const html = render("type=wellness&city=bangkok&home=true", false);
    expect(html.match(/disabled=""/g)).toHaveLength(5);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).toContain('value="city:bangkok" selected=""');
    expect(html).toContain("Selected location");
    expect(html).not.toContain("Unavailable location");
  });

  it("labels duplicate category titles with their types and uses separate IDs", () => {
    const html = render();
    const ultrasound = categories.filter((category) => category.slug === "ultrasound");
    expect(ultrasound).toHaveLength(2);
    for (const category of ultrasound) expect(html).toContain(`value="${category.id}"`);
    expect(html).toContain("Ultrasound · Health package");
    expect(html).toContain("Ultrasound · Lab test");
    expect(html).not.toContain("Seasonal Offers");
  });

  it("shows only categories compatible with the selected service types", () => {
    const html = render("type=lab_test");
    for (const category of categories) {
      if (category.type === "lab_test") expect(html).toContain(`value="${category.id}"`);
      else expect(html).not.toContain(`value="${category.id}"`);
    }
  });

  it("shows only the selected parent's children and restores the selected child", () => {
    const parent = categories.find((category) => category.slug === "ultrasound" && category.type === "package")!;
    const html = render(`category=${parent.id}&subcategory=${parent.children[0].id}`);
    expect(html).toContain(`value="${parent.id}" selected=""`);
    expect(html).toContain(`value="${parent.children[0].id}" selected=""`);
    for (const child of categories.filter((category) => category.id !== parent.id).flatMap((category) => category.children)) {
      expect(html).not.toContain(`value="${child.id}"`);
    }
    expect(html).toContain("All subcategories");
  });

  it("disables the child control until a parent with children is selected", () => {
    expect(render()).toContain("Select a category first");
    expect(render().match(/disabled=""/g)).toHaveLength(1);
    const leaf = categories.find((category) => category.children.length === 0)!;
    const html = render(`category=${leaf.id}`);
    expect(html).toContain("No subcategories");
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });

  it("preserves URL category selections during loading without claiming they are unavailable", () => {
    const parent = categories[0];
    const html = render(`category=${parent.id}&subcategory=${parent.children[0].id}`, false);
    expect(html).toContain(`value="${parent.id}" selected=""`);
    expect(html).toContain(`value="${parent.children[0].id}" selected=""`);
    expect(html).toContain("Selected category");
    expect(html).toContain("Selected subcategory");
  });

});

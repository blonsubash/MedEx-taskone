import { SERVICE_TYPES } from "./types";
import type {
  Catalog,
  Category,
  Provider,
  RawCatalog,
  Service,
  ServiceType,
  Subcategory,
} from "./types";

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function isServiceType(value: string): value is ServiceType {
  return SERVICE_TYPES.some((type) => type === value);
}

export function normalizeCatalog(raw: RawCatalog): Catalog {
  const providersById = new Map<number, Provider>();
  const categoriesById = new Map<string, Category>();
  const subcategoriesById = new Map<string, Subcategory>();

  for (const provider of raw.providers) {
    if (provider.status !== "active") continue;

    const info = provider.providerInformation;
    const rating = info.rating;
    providersById.set(provider.id, {
      id: provider.id,
      name:
        normalizeWhitespace(provider.name) ||
        normalizeWhitespace(info.companyName) ||
        "Unnamed provider",
      slug: info.slug,
      currency: info.currency,
      city: { ...info.city, name: normalizeWhitespace(info.city.name) },
      country: { ...info.country, name: normalizeWhitespace(info.country.name) },
      rating:
        rating !== null && Number.isFinite(rating) && rating >= 0 && rating <= 5
          ? rating
          : null,
      reviewCount:
        Number.isInteger(info.reviewCount) && info.reviewCount >= 0
          ? info.reviewCount
          : 0,
    });
  }

  for (const category of [...raw.categories].sort((a, b) => a.position - b.position)) {
    if (category.status !== true || category.parentId !== null || !isServiceType(category.type)) {
      continue;
    }

    const children: Subcategory[] = [];
    for (const child of category.children) {
      if (
        child.status !== true ||
        child.parentId !== category.id ||
        child.type !== category.type
      ) {
        continue;
      }

      const subcategory: Subcategory = {
        id: child.id,
        title: normalizeWhitespace(child.title),
        slug: child.slug,
        type: category.type,
        position: child.position,
        parentId: category.id,
      };
      children.push(subcategory);
      subcategoriesById.set(child.id, subcategory);
    }

    categoriesById.set(category.id, {
      id: category.id,
      title: normalizeWhitespace(category.title),
      slug: category.slug,
      type: category.type,
      position: category.position,
      children: children.sort((a, b) => a.position - b.position),
    });
  }

  const services: Service[] = [];
  for (const service of raw.services) {
    if (service.status !== true || !isServiceType(service.type)) continue;

    const provider = providersById.get(service.userId);
    if (!provider) continue;

    const category = service.categoryId === null
      ? null
      : categoriesById.get(service.categoryId);
    if (
      service.categoryId !== null &&
      (!category || category.type !== service.type)
    ) {
      continue;
    }

    const candidate = service.subCategoryId === null
      ? null
      : subcategoriesById.get(service.subCategoryId);
    const subcategory = candidate && category && candidate.parentId === category.id
      ? candidate
      : null;
    const title = normalizeWhitespace(service.title);

    services.push({
      id: service.id,
      title,
      slug: service.slug,
      type: service.type,
      provider,
      category: category ?? null,
      subcategory,
      searchText: [title, provider.name, category?.title, subcategory?.title]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      price: service.price,
      discount: service.discount,
      discountType: service.discountType,
      serviceCharge: service.serviceCharge,
      serviceChargeType: service.serviceChargeType,
      testAtHome: service.testAtHome,
      homeTestCharge: service.homeTestCharge,
      wellnessPricing: service.wellnessPricing.map((option) => ({ ...option })),
      createdAt: service.createdAt,
    });
  }

  return { services, providersById, categoriesById, subcategoriesById };
}

export const SERVICE_TYPES = [
  "package",
  "lab_test",
  "wellness",
  "service",
  "insurance",
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

export interface RawCategoryNode {
  id: string;
  title: string;
  slug: string;
  type: string;
  position: number;
  status: boolean;
  parentId: string | null;
}

export interface RawCategory extends RawCategoryNode {
  children: RawCategoryNode[];
}

export interface City {
  id: string;
  name: string;
  slug: string;
}

export interface Country {
  id: number;
  name: string;
  alphaCode: string;
}

export interface RawProvider {
  id: number;
  name: string;
  username: string;
  status: string;
  providerInformation: {
    companyName: string;
    slug: string;
    types: string[];
    currency: string;
    city: City;
    country: Country;
    rating: number | null;
    reviewCount: number;
  };
}

export interface RawPricing {
  price: string | null;
  discount: string | null;
  discountType: string | null;
  serviceCharge: string | null;
  serviceChargeType: string | null;
}

export interface RawWellnessPricing extends RawPricing {
  id: string;
  durationInMinutes: number;
}

export interface RawService extends RawPricing {
  id: string;
  title: string;
  slug: string;
  type: string;
  userId: number;
  categoryId: string | null;
  subCategoryId: string | null;
  status: boolean;
  testAtHome: boolean;
  homeTestCharge: string | null;
  wellnessPricing: RawWellnessPricing[];
  createdAt: string;
}

export interface RawCatalog {
  categories: RawCategory[];
  providers: RawProvider[];
  services: RawService[];
}

interface CategoryOption {
  id: string;
  title: string;
  slug: string;
  type: ServiceType;
  position: number;
}

export interface Subcategory extends CategoryOption {
  parentId: string;
}

export interface Category extends CategoryOption {
  children: Subcategory[];
}

export interface Provider {
  id: number;
  name: string;
  slug: string;
  currency: string;
  city: City;
  country: Country;
  rating: number | null;
  reviewCount: number;
}

export interface Service extends RawPricing {
  id: string;
  title: string;
  slug: string;
  type: ServiceType;
  provider: Provider;
  category: Category | null;
  subcategory: Subcategory | null;
  searchText: string;
  testAtHome: boolean;
  homeTestCharge: string | null;
  wellnessPricing: RawWellnessPricing[];
  createdAt: string;
}

export interface Catalog {
  services: Service[];
  providersById: Map<number, Provider>;
  categoriesById: Map<string, Category>;
  subcategoriesById: Map<string, Subcategory>;
}

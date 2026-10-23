"use client";

import { useEffect, useRef, useState } from "react";

import type { PricedService, ProviderGroup } from "@/lib/catalog/results";
import { SERVICE_TYPE_LABELS } from "@/lib/catalog/filter-options";
import { formatMoney } from "@/lib/pricing";
import type { PriceResult } from "@/lib/pricing";

function Price({ price, from = false }: { price: PriceResult; from?: boolean }) {
  if (price.status === "unavailable") {
    return <p className="price-unavailable">Price unavailable</p>;
  }
  return (
    <div className="service-price">
      {price.hasDiscount && (
        <del className="original-price"><span className="sr-only">Original price </span>
          {formatMoney(price.originalPrice, price.currency)}
        </del>
      )}
      <p className="final-price">
        {from && <span className="price-prefix">From </span>}
        {price.isFree && <span className="free-label">Free · </span>}
        {formatMoney(price.finalPrice, price.currency)}
      </p>
    </div>
  );
}

function ServiceRow({ entry, headingLevel }: { entry: PricedService; headingLevel: 4 | 5 }) {
  const Heading = headingLevel === 4 ? "h4" : "h5";
  const { service, pricing } = entry;
  const homeCharge = service.testAtHome && service.homeTestCharge !== null
    ? formatMoney(service.homeTestCharge, service.provider.currency) : null;
  return (
    <li className="service-row">
      <div className="service-details">
        <p className="service-type">{SERVICE_TYPE_LABELS[service.type]}</p>
        <Heading>{service.title}</Heading>
        {service.category && <p className="service-category">{service.category.title}</p>}
        {service.testAtHome && <span className="home-badge">Home test available</span>}
        {homeCharge && <p className="home-charge">Optional home collection: {homeCharge}</p>}
      </div>
      <div className="price-details">
        {pricing.kind === "fixed" ? <Price price={pricing.price} /> : pricing.startingOption ? (
          <>
            <Price price={pricing.startingOption.price} from />
            <p className="price-duration">{pricing.startingOption.durationInMinutes}-minute option</p>
          </>
        ) : <p className="price-unavailable">Price unavailable</p>}
      </div>
    </li>
  );
}

export function ProviderCard({ group, headingLevel = 3 }: { group: ProviderGroup; headingLevel?: 3 | 4 }) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const serviceHeading = headingLevel === 3 ? 4 : 5;
  const scroll = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (expanded) scroll.current?.focus({ preventScroll: true });
  }, [expanded]);
  const { provider, services } = group;
  const moreId = `provider-more-${provider.id}`;
  const titleId = `provider-title-${provider.id}`;
  const initials = provider.name.split(" ").slice(0, 2).map((word) => word[0]).join("");
  return (
    <article className="provider-card" aria-labelledby={titleId}>
      <header className="provider-header">
        <span className="provider-avatar" aria-hidden="true">{initials}</span>
        <div>
          <Heading id={titleId}>{provider.name}</Heading>
          <p className="provider-location">{provider.city.name}, {provider.country.name}</p>
          {provider.rating === null ? <p className="provider-rating unrated">No ratings yet</p> : (
            <p className="provider-rating">
              <span className="rating-star" aria-hidden="true">★</span>{" "}
              <span><span aria-hidden="true">{provider.rating.toFixed(1)}</span><span className="sr-only">{provider.rating.toFixed(1)} out of 5</span></span>
              <span className="review-count"> · {provider.reviewCount} {provider.reviewCount === 1 ? "review" : "reviews"}</span>
            </p>
          )}
        </div>
      </header>
      <div className="provider-services">
        {/* Keep the preview in flow so expansion preserves this card's height. */}
        <ul className="service-list service-preview" aria-hidden={expanded}>
          {services.slice(0, 3).map((entry) => <ServiceRow key={entry.service.id} entry={entry} headingLevel={serviceHeading} />)}
        </ul>
        {services.length > 3 && (
          <div ref={scroll} id={moreId} hidden={!expanded} className="service-scroll"
            role="region" aria-label={`${provider.name} services`} tabIndex={0}>
            {expanded && <ul className="service-list">
              {services.map((entry) => <ServiceRow key={entry.service.id} entry={entry} headingLevel={serviceHeading} />)}
            </ul>}
          </div>
        )}
      </div>
      {services.length > 3 && (
        <div className="provider-footer">
          <span>Showing {expanded ? services.length : 3} of {services.length}</span>
          <button type="button" className="expand-button" aria-expanded={expanded}
            aria-controls={moreId} aria-label={expanded ? `Show fewer services for ${provider.name}` : `View all ${services.length} services for ${provider.name}`} onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show fewer services" : `View all ${services.length} services`}
            <span aria-hidden="true">{expanded ? " −" : " +"}</span>
          </button>
        </div>
      )}
    </article>
  );
}

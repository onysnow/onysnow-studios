import { Link } from "@tanstack/react-router";
import { Glass } from "./Glass";
import { motion } from "framer-motion";
import type { Category } from "@/lib/content";

/**
 * A quiet second navigation that sits under the main header and filters the
 * gallery in place. Each filter is addressable by URL so a filtered view can be
 * linked and shared.
 */
export function PortfolioFilterBar({
  categories,
  active,
}: {
  categories: Category[];
  active: string | undefined;
}) {
  const items = [{ slug: undefined as string | undefined, name: "All" }, ...categories];

  return (
    <Glass variant="bar" className="sticky top-16 z-30">
      <nav
        aria-label="Filter portfolio by collection"
        className="mx-auto flex max-w-screen-2xl gap-7 overflow-x-auto px-5 py-3 sm:px-8 lg:px-12 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const isActive = item.slug === active;
          return (
            <Link
              key={item.slug ?? "all"}
              to="/portfolio"
              search={item.slug ? { category: item.slug } : {}}
              aria-current={isActive ? "page" : undefined}
              className={`relative shrink-0 whitespace-nowrap py-1 text-[0.7rem] uppercase tracking-[0.2em] transition-colors ${
                isActive ? "text-white" : "text-white/45 hover:text-white/80"
              }`}
            >
              {item.name}
              {isActive ? (
                <motion.span
                  layoutId="portfolio-filter-underline"
                  className="absolute -bottom-px left-0 right-0 h-px bg-white"
                  transition={{ type: "spring", stiffness: 420, damping: 38 }}
                />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </Glass>
  );
}

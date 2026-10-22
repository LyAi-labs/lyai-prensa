// Comparison 3 from Hirael <https://hirael.com/blocks/comparison/comparison-03>
// MIT · Mohammad Shehadeh · https://github.com/MohammadShehadeh/hirael

import * as React from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  Minus,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export interface ComparisonOutcome {
  value: string;
  label: string;
}

export interface Comparison03Props {
  badge?: string;
  title?: string;
  description?: string;
  beforeTitle?: string;
  beforeItems?: readonly (string | React.ReactNode)[] | (string | React.ReactNode)[];
  beforeIcon?: React.ReactNode;
  strikeBefore?: boolean;
  afterTitle?: string;
  afterItems?: readonly (string | React.ReactNode)[] | (string | React.ReactNode)[];
  afterIcon?: React.ReactNode;
  outcomes?: readonly ComparisonOutcome[] | ComparisonOutcome[];
  actionText?: string;
  actionHref?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
}

const BEFORE = [
  "A combobox lives in three components, each with its own keyboard handling",
  "Right-to-left is a ticket nobody wants to pick up",
  "The dark theme was derived from light, so half of it is grey on grey",
  "Every design tweak means reading someone else’s node_modules",
] as const;

const AFTER = [
  "One compound API, the same shape as the primitives you already use",
  "Logical properties throughout, so right-to-left needs no configuration",
  "Light and dark drawn as two designs, not one and its inverse",
  "The file is in your repo, so a tweak is an edit",
] as const;

const OUTCOMES = [
  { value: "One command", label: "from decision to working component" },
  { value: "2 bases", label: "Radix and Base UI, kept in step" },
  { value: "0 packages", label: "added to your dependency tree" },
] as const;

function ExpandableItem({
  item,
  isBefore,
  strikeBefore,
}: {
  item: string | React.ReactNode;
  isBefore: boolean;
  strikeBefore?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);

  if (typeof item !== "string") {
    return <span>{item}</span>;
  }

  const isLong = item.length > 130;
  const displayedText = !expanded && isLong ? item.slice(0, 130) + "…" : item;

  return (
    <span
      className={
        isBefore && strikeBefore
          ? "line-through decoration-muted-foreground/30"
          : ""
      }
    >
      {displayedText}
      {isLong && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="ml-1.5 inline-block font-mono text-[11px] font-semibold text-primary hover:underline"
        >
          {expanded ? "...menos" : "...más"}
        </button>
      )}
    </span>
  );
}

export const Comparison03: React.FC<Comparison03Props> = ({
  badge = "Before and after",
  title = "The same afternoon, spent two ways",
  description,
  beforeTitle = "Writing it yourself",
  beforeItems = BEFORE,
  beforeIcon,
  strikeBefore = true,
  afterTitle = "Installing it from Hirael",
  afterItems = AFTER,
  afterIcon,
  outcomes = OUTCOMES,
  actionText = "See what ships",
  actionHref,
  onAction,
  compact = false,
  className = "",
}) => {
  return (
    <section
      className={`bg-background text-foreground ${
        compact ? "py-4 sm:py-6" : "py-20 sm:py-28"
      } ${className}`}
      aria-labelledby="comparison-03-heading"
    >
      <div
        className={`container w-full ${
          compact ? "max-w-4xl px-2" : "max-w-5xl"
        }`}
      >
        {(badge || title || description) && (
          <div className="max-w-2xl">
            {badge && (
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {badge}
              </p>
            )}
            {title && (
              <h2
                id="comparison-03-heading"
                className={`mt-3 font-serif font-medium tracking-tight text-foreground ${
                  compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"
                }`}
              >
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        )}

        <div
          className={`${
            badge || title || description ? "mt-6 sm:mt-10" : "mt-0"
          } grid gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-2`}
        >
          {/* Left / Before Panel */}
          <div
            className={`bg-background p-7 sm:p-8 ${
              compact ? "!p-5 sm:!p-6" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              {beforeIcon ? (
                beforeIcon
              ) : (
                <CircleAlert
                  aria-hidden
                  className="size-4 text-muted-foreground"
                />
              )}
              <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {beforeTitle}
              </h3>
            </div>
            <ul className={`mt-6 flex flex-col ${compact ? "gap-3" : "gap-4"}`}>
              {beforeItems.map((item, idx) => (
                <li
                  key={idx}
                  className="flex gap-3 text-sm text-muted-foreground"
                >
                  <Minus
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground/50"
                  />
                  <ExpandableItem
                    item={item}
                    isBefore={true}
                    strikeBefore={strikeBefore}
                  />
                </li>
              ))}
            </ul>
          </div>

          {/* Right / After Panel */}
          <div
            className={`bg-card p-7 sm:p-8 ${compact ? "!p-5 sm:!p-6" : ""}`}
          >
            <div className="flex items-center gap-2">
              {afterIcon ? (
                afterIcon
              ) : (
                <CircleCheck aria-hidden className="size-4 text-emerald-500" />
              )}
              <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-foreground">
                {afterTitle}
              </h3>
            </div>
            <ul className={`mt-6 flex flex-col ${compact ? "gap-3" : "gap-4"}`}>
              {afterItems.map((item, idx) => (
                <li key={idx} className="flex gap-3 text-sm text-foreground">
                  <Check
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-emerald-500"
                  />
                  <ExpandableItem
                    item={item}
                    isBefore={false}
                    strikeBefore={false}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Outcomes & Action button */}
        {((outcomes && outcomes.length > 0) || actionText) && (
          <div className="mt-8 sm:mt-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            {outcomes && outcomes.length > 0 && (
              <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
                {outcomes.map((outcome, idx) => (
                  <div key={idx} className="flex items-baseline gap-2">
                    <dt className="text-xs text-muted-foreground">
                      {outcome.label}
                    </dt>
                    <dd className="order-first font-mono text-sm font-semibold tracking-tight text-foreground">
                      {outcome.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {actionText && (
              <Button
                variant="outline"
                className="group"
                onClick={onAction}
                asChild={!!actionHref}
              >
                {actionHref ? (
                  <a href={actionHref} target="_blank" rel="noreferrer">
                    {actionText}
                    <ArrowRight className="size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                  </a>
                ) : (
                  <>
                    {actionText}
                    <ArrowRight className="size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default Comparison03;

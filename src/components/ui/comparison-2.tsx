import {
  RiCheckLine,
  RiCloseLine,
  RiArrowRightLine,
  RiShieldCheckLine,
} from "@remixicon/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const acmePoints = [
  "Onboarding completed in under 10 minutes",
  "Real-time sync across all devices and team members",
  "Granular role-based access control included",
  "99.99 % uptime SLA with status page",
  "Dedicated Slack channel for Pro customers",
  "SOC 2 Type II certified infrastructure",
  "One-click data export in any format",
  "No per-seat fees, unlimited collaborators",
];

const othersPoints = [
  "Complex setup requires engineering resources",
  "Sync delays of up to 15 minutes on free tiers",
  "Permissions locked behind enterprise plan",
  "SLA only available on custom contracts",
  "Email-only support with 48 h response time",
  "Compliance docs behind sales call",
  "Data export limited to CSV on lower plans",
  "Per-seat pricing adds up fast at scale",
];

function CheckRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center bg-primary">
        <RiCheckLine className="size-3 text-primary-foreground" aria-hidden />
      </span>
      <span className="text-sm text-foreground">{text}</span>
    </li>
  );
}

function CrossRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center bg-muted">
        <RiCloseLine className="size-3 text-muted-foreground" aria-hidden />
      </span>
      <span className="text-sm text-muted-foreground">{text}</span>
    </li>
  );
}

export default function ComparisonBlock() {
  return (
    <section className="flex w-full items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-10 text-center">
          <Badge variant="outline" className="mb-4">
            <RiShieldCheckLine data-icon="inline-start" />
            Why Acme
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Built differently, on purpose
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            We obsessed over the details others skip. Here is what that means
            for your team every single day.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-primary/30 ring-primary/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">Acme</CardTitle>
                <Badge variant="default">Recommended</Badge>
              </div>
              <CardDescription>
                Everything your team needs, without the enterprise runaround.
              </CardDescription>
            </CardHeader>

            <Separator />

            <CardContent className="pt-4">
              <ul className="flex flex-col gap-3">
                {acmePoints.map((point) => (
                  <CheckRow key={point} text={point} />
                ))}
              </ul>
            </CardContent>

            <CardFooter className="border-t">
              <Button
                nativeButton={false}
                className="w-full"
                render={<a href="#" />}
              >
                Start for Free
                <RiArrowRightLine data-icon="inline-end" />
              </Button>
            </CardFooter>
          </Card>

          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-muted-foreground">
                The others
              </CardTitle>
              <CardDescription>
                Common friction points teams encounter with legacy platforms.
              </CardDescription>
            </CardHeader>

            <Separator />

            <CardContent className="pt-4">
              <ul className="flex flex-col gap-3">
                {othersPoints.map((point) => (
                  <CrossRow key={point} text={point} />
                ))}
              </ul>
            </CardContent>

            <CardFooter className="border-t">
              <Button
                variant="secondary"
                nativeButton={false}
                className="w-full"
                render={<a href="#" />}
              >
                See Why Teams Switch
                <RiArrowRightLine data-icon="inline-end" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </section>
  );
}

export { ComparisonBlock }

